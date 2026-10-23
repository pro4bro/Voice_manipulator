from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.adapters.activity_center import CENTER
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_script_speaker import _Job as SpeakerJobContext
from app.domain.models import VoiceOutput, VoiceScriptJob, VoiceScriptRequest, VoiceScriptRow
from app.domain.voice_edits import VoiceEditDocument
from app.domain.voice_script_document import ScriptSentence
from app.domain.voice_fix import (
    VoiceFixJob,
    VoiceFixJobUnit,
    VoiceFixPlan,
    VoiceFixRequest,
    VoiceFixUnitPlan,
)


_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")


@dataclass
class _Snapshot:
    project_id: str
    output_id: str
    script: Any
    edit: VoiceEditDocument
    output: VoiceOutput
    bindings: Any
    schedules: Any
    timing: Any
    timing_rows: list[ScriptSentence]
    stretched_rows: set[str]
    request: VoiceScriptRequest
    steps: list[Any]
    plan: VoiceFixPlan


@dataclass
class _Running:
    job: VoiceFixJob
    context: SpeakerJobContext
    stop_after_current: bool = False
    lock: threading.RLock = field(default_factory=threading.RLock)


class VoiceFixService:
    """Plan and cache only dirty Script clips; never replaces a Voice Output."""

    _lock = threading.RLock()

    def __init__(self, speaker, edits, bindings=None, schedules=None):
        self.speaker, self.edits = speaker, edits
        self.bindings, self.schedules = bindings, schedules
        self.outputs, self.scripts = speaker.outputs, speaker.scripts
        self._running: dict[str, _Running] = {}
        self._threads: dict[str, threading.Thread] = {}
        providers = getattr(self.outputs, "clip_reference_providers", None)
        if isinstance(providers, list) and not any(
            getattr(provider, "__self__", None) is self and
            getattr(provider, "__func__", None) is VoiceFixService.protected_clips
            for provider in providers
        ):
            providers.append(self.protected_clips)

    def job_path(self, project_id: str, job_id: str) -> Path:
        if not _ID.fullmatch(job_id):
            raise KeyError(job_id)
        return Path(self.speaker.projects.get(project_id).project_path) / "jobs" / "voice-fix" / f"{job_id}.json"

    @staticmethod
    def _write_job(path: Path, job: VoiceFixJob) -> None:
        with VoiceFixService._lock:
            FileProjectRepository._atomic_write(path, job.model_dump_json(by_alias=True, indent=2))

    @staticmethod
    def _activity_id(job: VoiceFixJob) -> str:
        return f"tts:{job.id}"

    @staticmethod
    def _activity_label(output_name: str) -> str:
        return f"{output_name} — Voice Fix"

    def _start_activity(self, job: VoiceFixJob, output_name: str) -> None:
        label = self._activity_label(output_name)
        CENTER.start_task("tts", label, task_id=self._activity_id(job), detail="Queued Voice Fix",
            fraction=0.0, project_id=job.project_id, group_label=label, status="queued")

    def _sync_activity(self, job: VoiceFixJob) -> None:
        task_id = self._activity_id(job)
        detail = f"Voice Fix {job.done}/{job.total} clips"
        if job.status in {"complete", "stopped", "cancelled", "failed", "stale"}:
            status = "complete" if job.status == "complete" else "cancelled" if job.status in {"stopped", "cancelled"} else "failed"
            CENTER.finish_task(task_id, status=status, detail=detail if status == "complete" else job.error or detail,
                error=None if status == "complete" else job.error or job.status)
            return
        tasks = {task.id: task for task in CENTER.tasks()}
        task = tasks.get(task_id)
        if task is not None and task.status == "queued":
            CENTER.claim_queued_task(task_id, job.project_id, "tts", detail="Voice Fix worker started")
        denominator = max(1, job.total)
        fraction = job.done / denominator if job.done < job.total else None
        if fraction is None:
            detail = "Validating Voice Fix clips"
        CENTER.update_task(task_id, detail=detail, fraction=fraction)

    @staticmethod
    def _load_job(path: Path) -> VoiceFixJob:
        # Serialize our own poll/write handles; external Windows scanners may
        # still briefly deny a read during atomic replacement. Never invent state.
        with VoiceFixService._lock:
            for attempt in range(6):
                try:
                    payload = path.read_text(encoding="utf-8")
                    return VoiceFixJob.model_validate_json(payload)
                except PermissionError:
                    if attempt == 5:
                        raise
                    time.sleep(.01 * 2 ** attempt)

    def _read_job(self, project_id: str, output_id: str, job_id: str) -> VoiceFixJob:
        if not _ID.fullmatch(output_id):
            raise KeyError(output_id)
        path = self.job_path(project_id, job_id)
        if not path.is_file():
            raise KeyError(job_id)
        job = self._load_job(path)
        if job.project_id != project_id or job.output_id != output_id:
            raise KeyError(job_id)
        return job

    @staticmethod
    def _with_update(job: VoiceFixJob, **changes) -> VoiceFixJob:
        return job.model_copy(update={**changes, "updated_at": datetime.now(timezone.utc)}, deep=True)

    def _capture(self, project_id: str, output_id: str):
        with self.edits._lock, self.scripts._lock:
            script = self.scripts.get(project_id)
            edit = self.edits.get(project_id, output_id)
            output = self.outputs.get(project_id, output_id)
        bindings = self.bindings.get(project_id) if self.bindings is not None else None
        schedules = self.schedules.get(project_id) if self.schedules is not None else None
        return script, edit, output, bindings, schedules

    @staticmethod
    def _targeted_binding(binding, project_id: str, output_id: str, row_ids: set[str]) -> bool:
        scope = binding.scope
        if scope.kind == "voice-output" and scope.id == output_id:
            return True
        return scope.kind == "script" and scope.id == project_id and bool(row_ids.intersection(binding.target.row_ids))

    def _reference_blockers(self, project_id, output_id, row_ids, bindings, schedules) -> list[str]:
        if bindings is None:
            return []
        relevant = [binding for binding in bindings.bindings
            if self._targeted_binding(binding, project_id, output_id, row_ids)]
        blockers = []
        scheduled = {schedule.binding_id for schedule in (schedules.schedules if schedules is not None else [])}
        for binding in relevant:
            if binding.status != "requested":
                blockers.append(f"Reference {binding.id} is {binding.status}; refresh or remove it before Fix.")
            positive = {property_name for source in binding.sources if source.strength > 0 for property_name in source.properties}
            unsupported = sorted(positive - {"timing"})
            if unsupported:
                blockers.append(f"Reference {binding.id} requests {', '.join(unsupported)} conditioning, which Fix cannot apply.")
            if "timing" in positive:
                # Only Script-scoped, whole-row timing is consumed by the current speaker planner.
                if binding.scope.kind != "script" or binding.target.text_ranges:
                    blockers.append(f"Reference {binding.id} timing does not describe whole Script rows; Fix cannot map it safely.")
                elif self.speaker.timing_plans is None:
                    blockers.append(f"Reference {binding.id} timing has no supported timing planner.")
            if binding.id in scheduled:
                blockers.append(f"Reference schedule for {binding.id} is preview-only and cannot drive Fix.")
        return sorted(set(blockers))

    @staticmethod
    def _map_segments(output: VoiceOutput, edit: VoiceEditDocument):
        spans = {segment.row_id: [round(segment.start * edit.sample_rate), round(segment.end * edit.sample_rate)]
            for segment in output.segments}
        blockers = []
        stretched: set[str] = set()
        for operation in edit.active:
            overlaps = [row_id for row_id, (start, end) in spans.items()
                if start < operation.end_frame and end > operation.start_frame]
            exact = (len(overlaps) == 1 and
                spans[overlaps[0]][0] == operation.start_frame and spans[overlaps[0]][1] == operation.end_frame)
            if overlaps and not exact:
                blockers.append("Only whole-row stretch edits are supported by Fix; partial-word or cross-row speech stretches need review.")
            if exact:
                stretched.add(overlaps[0])
            for row_id, (start, end) in spans.items():
                spans[row_id] = [operation.map_frame(start), operation.map_frame(end)]
        return spans, stretched, blockers

    def _script_rows(self, project_id: str, output: VoiceOutput, script, parameters) -> list[VoiceScriptRow]:
        expected_ids = [row.id for row in script.rows if row.text.strip()]
        output_ids = [segment.row_id for segment in output.segments]
        if output_ids != expected_ids or len(set(output_ids)) != len(output_ids):
            raise ScriptRevisionConflict("Initial Fix requires the saved Script and output to have the same row IDs and order; add/remove/reorder needs review.")
        rows = []
        for segment in output.segments:
            row = next((item for item in script.rows if item.id == segment.row_id), None)
            if row is None:
                raise ScriptRevisionConflict(f"Output row {segment.row_id} no longer exists in the saved Script.")
            voice_id = row.voice_id or segment.voice_id
            if not voice_id:
                raise ScriptRevisionConflict(f"Output row {row.id} has no resolved voice.")
            voice = self.speaker.generator.voices.get(project_id, voice_id)
            if row.speaker_profile_id and voice.speaker_profile_id != row.speaker_profile_id:
                raise ScriptRevisionConflict(f"Voice for row {row.id} does not match its Speaker Profile.")
            rows.append(VoiceScriptRow(id=row.id, segment_id=row.segment_id, voice_id=voice_id, text=row.text,
                settings=row.settings.model_dump(by_alias=True, exclude_none=True), origin_ids=row.origin_ids, tags=row.tags))
        return rows

    @staticmethod
    def _base_parameters(output: VoiceOutput) -> dict[str, dict[str, Any]]:
        generators = output.parameters.get("generators", {})
        return generators if isinstance(generators, dict) else {}

    @staticmethod
    def duration_targets(output: VoiceOutput) -> dict[str, int]:
        fix = output.parameters.get("fix")
        if not isinstance(fix, dict) or fix.get("durationTargets") is None:
            return {}
        targets = fix.get("durationTargets")
        if fix.get("sampleRate") != 24000 or not isinstance(targets, dict):
            raise ValueError("Applied Fix duration targets have an invalid frame clock.")
        result = {}
        for row_id, frames in targets.items():
            if (not isinstance(row_id, str) or not row_id or isinstance(frames, bool)
                    or not isinstance(frames, int) or not 1 <= frames <= 24000 * 600):
                raise ValueError("Applied Fix duration target is invalid.")
            result[row_id] = frames
        return result

    def _build(self, project_id: str, output_id: str, parameters=None) -> _Snapshot:
        script, edit, output, bindings, schedules = self._capture(project_id, output_id)
        row_ids = {segment.row_id for segment in output.segments}
        blockers = self._reference_blockers(project_id, output_id, row_ids, bindings, schedules)
        timing_snapshot = None
        request = None
        steps = []
        timing_rows = []
        stretched_rows: set[str] = set()
        try:
            rows = self._script_rows(project_id, output, script, parameters)
            rows_by_id = {row.id: row for row in script.rows}
            timing_rows = [rows_by_id[segment.row_id] for segment in output.segments if segment.row_id in rows_by_id]
            timing_revision = None
            if self.speaker.timing_plans is not None:
                timing_snapshot = self.speaker.timing_plans.effective(project_id, timing_rows,
                    bindings.revision if bindings is not None else None)
                timing_revision = timing_snapshot.get("revision")
            request = VoiceScriptRequest(script_revision=script.revision, timing_revision=timing_revision,
                reference_revision=bindings.revision if bindings is not None else None,
                rows=rows, parameters=parameters if parameters is not None else self._base_parameters(output),
                gap_seconds=float(output.parameters.get("gapSeconds", .35)))
            if blockers:
                raise ValueError(" ".join(blockers))
            steps = self.speaker._plan(project_id, request)
            spans, stretched, stretch_blockers = self._map_segments(output, edit)
            stretched_rows = stretched
            blockers.extend(stretch_blockers)
            duration_targets = self.duration_targets(output)
            for step in steps:
                if step.row.id not in spans:
                    blockers.append(f"No source segment exists for Script row {step.row.id}.")
                    continue
                start, end = spans[step.row.id]
                duration = (end - start) / edit.sample_rate
                if step.row.id in stretched:
                    if step.plan.engine != "omnivoice":
                        blockers.append(f"Engine {step.plan.engine} does not support native duration; Fix cannot render stretched row {step.row.id}.")
                        continue
                    if step.duration is not None and abs(step.duration - duration) > 1 / edit.sample_rate:
                        blockers.append(f"Whole-row stretch for {step.row.id} conflicts with its explicit duration/timing budget.")
                    else:
                        step.duration = duration
                        if step.allocation is not None:
                            step.allocation.setdefault("rows", {}).setdefault(step.row.id, {})["duration"] = duration
                            step.allocation["rows"][step.row.id]["origin"] = "edit"
                elif step.duration is None and step.row.id in duration_targets:
                    if step.plan.engine != "omnivoice":
                        blockers.append(f"Engine {step.plan.engine} cannot preserve the applied duration target for {step.row.id}.")
                        continue
                    step.duration = duration_targets[step.row.id] / edit.sample_rate
                    if step.allocation is not None:
                        step.allocation.setdefault("rows", {}).setdefault(step.row.id, {})["duration"] = step.duration
                        step.allocation["rows"][step.row.id]["origin"] = "applied-fix"
        except (ValueError, KeyError, OSError) as exc:
            blockers.append(str(exc))

        unique_blockers = sorted(set(blockers))
        units = []
        by_id = {step.row.id: step for step in steps}
        for segment in output.segments:
            row = next((item for item in script.rows if item.id == segment.row_id), None)
            if row is None:
                units.append(VoiceFixUnitPlan(row_id=segment.row_id, text=segment.text, status="blocked",
                    reason="Output row is missing from the saved Script."))
                continue
            step = by_id.get(row.id)
            if step is None:
                units.append(VoiceFixUnitPlan(row_id=row.id, text=row.text, status="blocked",
                    reason=unique_blockers[0] if unique_blockers else "Unit could not be planned."))
                continue
            key = self.speaker.clip_key(step)
            cached = self._find_cached(project_id, step)
            units.append(VoiceFixUnitPlan(row_id=row.id, text=row.text, desired_key=key,
                desired_duration=step.duration, status="blocked" if unique_blockers else "ready" if cached else "dirty",
                clip=cached, reason=unique_blockers[0] if unique_blockers else None))
        # Every unsupported request blocks the entire batch. Do not leave a clean-looking partial plan.
        if unique_blockers:
            units = [unit.model_copy(update={"status": "blocked", "reason": unit.reason or unique_blockers[0]}) for unit in units]
        material = {"version": 1, "outputId": output_id,
            "units": [{"rowId": unit.row_id, "desiredKey": unit.desired_key, "reason": unit.reason} for unit in units],
            "blockers": unique_blockers}
        key = hashlib.sha256(json.dumps(material, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        plan = VoiceFixPlan(output_id=output_id, key=key, script_revision=script.revision,
            edit_revision=edit.revision, units=units, dirty_count=sum(unit.status == "dirty" for unit in units),
            blockers=unique_blockers)
        current = self._capture(project_id, output_id)
        if current[0] != script or current[1] != edit or current[2] != output or current[3] != bindings or current[4] != schedules:
            raise ScriptRevisionConflict("Script/Timeline/reference changed while planning Fix; refresh the plan.")
        return _Snapshot(project_id, output_id, script, edit, output, bindings, schedules, timing_snapshot,
            timing_rows, stretched_rows, request, steps, plan)

    def _find_cached(self, project_id: str, step) -> str | None:
        key = self.speaker.clip_key(step)
        root = self.outputs.clips_root(project_id)
        base = root / key
        if self.speaker._cached_record(base, step) is not None:
            return key
        for folder in sorted(root.glob(f"{key}-*"), reverse=True):
            if self.speaker._cached_record(folder, step) is not None:
                return folder.name
        return None

    def plan(self, project_id: str, output_id: str, parameters=None) -> VoiceFixPlan:
        if not _ID.fullmatch(output_id):
            raise KeyError(output_id)
        plan = self._build(project_id, output_id, parameters).plan
        return plan.model_copy(update={"latest_job": self.latest_job(project_id, output_id)})

    def validated_snapshot(self, project_id: str, output_id: str, expected_script_revision: int,
        expected_edit_revision: int, expected_key: str, parameters=None) -> _Snapshot:
        """Return a current snapshot only when every desired row clip is cache-validated and ready."""
        snapshot = self._build(project_id, output_id, parameters)
        plan = snapshot.plan
        if plan.script_revision != expected_script_revision:
            raise ScriptRevisionConflict("Script changed; refresh the Fix plan before applying.")
        if plan.edit_revision != expected_edit_revision:
            raise ScriptRevisionConflict("Timeline changed; refresh the Fix plan before applying.")
        if plan.key != expected_key:
            raise ScriptRevisionConflict("Fix plan changed; refresh before applying.")
        if plan.blockers:
            raise ScriptRevisionConflict("Fix is blocked: " + " ".join(plan.blockers))
        if not plan.units or any(unit.status != "ready" or not unit.clip for unit in plan.units):
            raise ScriptRevisionConflict("Fix clips are still dirty; generate and validate every current row before applying.")
        return snapshot

    def _fresh(self, snapshot: _Snapshot) -> bool:
        current = self._capture(snapshot.project_id, snapshot.output_id)
        if not (current[0] == snapshot.script and current[1] == snapshot.edit and current[2] == snapshot.output
                and current[3] == snapshot.bindings and current[4] == snapshot.schedules):
            return False
        if self.speaker.timing_plans is not None:
            timing = self.speaker.timing_plans.effective(snapshot.project_id, snapshot.timing_rows,
                snapshot.request.reference_revision)
            if timing != snapshot.timing:
                return False
        return True

    def start(self, project_id: str, output_id: str, expected_script_revision: int, expected_edit_revision: int,
        expected_key: str, parameters=None) -> VoiceFixJob:
        if not _ID.fullmatch(output_id):
            raise KeyError(output_id)
        snapshot = self._build(project_id, output_id, parameters)
        plan = snapshot.plan
        if (plan.script_revision != expected_script_revision or plan.edit_revision != expected_edit_revision
                or plan.key != expected_key):
            if plan.script_revision != expected_script_revision:
                raise ScriptRevisionConflict("Script changed; refresh the Fix plan before starting.")
            if plan.edit_revision != expected_edit_revision:
                raise ScriptRevisionConflict("Timeline changed; refresh the Fix plan before starting.")
            raise ScriptRevisionConflict("Fix plan changed; refresh before starting.")
        if plan.blockers:
            raise ScriptRevisionConflict("Fix is blocked: " + " ".join(plan.blockers))
        dirty = [unit for unit in plan.units if unit.status == "dirty"]
        with self._lock:
            for path in (Path(self.speaker.projects.get(project_id).project_path) / "jobs" / "voice-fix").glob("*.json"):
                try:
                    existing = self._load_job(path)
                except (OSError, ValueError):
                    continue
                if existing.output_id == output_id and existing.status in {"queued", "running"}:
                    raise ScriptRevisionConflict("A Fix job for this output is already running.")
            job = VoiceFixJob(project_id=project_id, output_id=output_id,
                status="running" if dirty else "complete", plan_key=plan.key,
                script_revision=plan.script_revision, edit_revision=plan.edit_revision,
                total=len(dirty), done=0,
                units=[VoiceFixJobUnit(row_id=unit.row_id, desired_key=unit.desired_key or "", status="pending")
                    for unit in dirty])
            if not dirty:
                path = self.job_path(project_id, job.id)
                self._write_job(path, job)
                self._start_activity(job, snapshot.output.name)
                CENTER.finish_task(self._activity_id(job), status="complete",
                    detail="All Voice Fix clips already validated and reusable")
                return job
            context = SpeakerJobContext(VoiceScriptJob(id=job.id, project_id=project_id, total=len(dirty)))
            state = _Running(job=job, context=context)
            path = self.job_path(project_id, job.id)
            self._write_job(path, job)
            self._start_activity(job, snapshot.output.name)
            self._running[job.id] = state
            thread = threading.Thread(target=self._run, args=(snapshot, dirty, state), daemon=True,
                name=f"voice-fix-{job.id}")
            self._threads[job.id] = thread
            try:
                thread.start()
            except Exception as exc:
                self._persist(state, status="failed", error=f"Could not start Voice Fix worker: {exc}")
                raise
            return job

    def _persist(self, state: _Running, **changes) -> VoiceFixJob:
        with state.lock:
            state.job = self._with_update(state.job, **changes)
            self._write_job(self.job_path(state.job.project_id, state.job.id), state.job)
            self._sync_activity(state.job)
            return state.job.model_copy(deep=True)

    def _is_cancelled(self, state: _Running) -> bool:
        with state.context.lock:
            return state.context.cancel_requested or state.context.cancel_event.is_set()

    def _fresh_clip_key(self, snapshot: _Snapshot, step) -> str:
        voice = self.speaker.generator.voices.get(snapshot.project_id, step.plan.voice.id)
        params = snapshot.request.parameters.get(step.plan.generator_id, {})
        current_plan = self.speaker.generator.prepare(snapshot.project_id, voice.id, step.plan.generator_id, params)
        return self.speaker.clip_key(replace(step, plan=current_plan))

    def _commit(self, snapshot: _Snapshot, state: _Running, step, action) -> bool:
        context = state.context
        with context.lock:
            if context.cancel_requested or context.cancel_event.is_set() or context.record.status != "running":
                return False
        # Serialize cache publication with Script and edit writes. A changed row cannot be marked clean.
        with self.edits._lock, self.scripts._lock:
            if not self._fresh(snapshot) or self._fresh_clip_key(snapshot, step) != self.speaker.clip_key(step):
                return False
            with context.lock:
                if context.cancel_requested or context.cancel_event.is_set() or context.record.status != "running":
                    return False
                action()
                return True

    def _run(self, snapshot: _Snapshot, dirty, state: _Running) -> None:
        job = state.job
        context = state.context
        self._sync_activity(job)
        lease = None
        try:
            if not self._fresh(snapshot):
                raise ScriptRevisionConflict("Script/Timeline/reference changed before Fix started.")
            if self._is_cancelled(state):
                raise RuntimeError("Fix cancelled.")
            lease = self.speaker.gpu_lease.acquire(f"voice-fix:{job.project_id}:{job.id}")
            if self.speaker.before_start is not None:
                self.speaker.before_start()
            self._persist(state, status="running")
            step_by_id = {step.row.id: step for step in snapshot.steps}
            done = 0
            for unit in dirty:
                if self._is_cancelled(state):
                    raise RuntimeError("Fix cancelled.")
                if state.stop_after_current and context.record.current_row_id is None:
                    self._persist(state, status="stopped")
                    return
                step = step_by_id[unit.row_id]
                if not self._fresh(snapshot) or self._fresh_clip_key(snapshot, step) != unit.desired_key:
                    raise ScriptRevisionConflict("Script/Timeline/voice artifact changed; Fix result is stale.")
                cancellation_id = f"{job.id}-{uuid4().hex}"
                with context.lock:
                    context.record = context.record.model_copy(update={"status": "running", "current_row_id": step.row.id})
                    context.active_request_id = cancellation_id
                    context.active_worker = step.plan.engine_speech.worker
                    register = getattr(context.active_worker, "register_request", None)
                    if callable(register):
                        register(cancellation_id)
                self._persist(state, units=[item.model_copy(update={"status": "running", "error": None})
                    if item.row_id == unit.row_id else item for item in state.job.units])
                try:
                    clip = self.speaker._clip(snapshot.project_id, step, cancellation_id, job=context,
                        is_cancelled=lambda: self._is_cancelled(state),
                        commit=lambda action: self._commit(snapshot, state, step, action), force_regenerate=False)
                finally:
                    abandon = getattr(step.plan.engine_speech.worker, "abandon_request", None)
                    if callable(abandon):
                        abandon(cancellation_id)
                    with context.lock:
                        if context.active_request_id == cancellation_id:
                            context.active_request_id = None
                            context.active_worker = None
                        context.record = context.record.model_copy(update={"current_row_id": None})
                if self._is_cancelled(state):
                    raise RuntimeError("Fix cancelled.")
                if not self._fresh(snapshot) or self._fresh_clip_key(snapshot, step) != unit.desired_key:
                    raise ScriptRevisionConflict("Script/Timeline/voice artifact changed; Fix result is stale.")
                done += 1
                self._persist(state, done=done, units=[item.model_copy(update={"status": "complete", "clip": clip.key})
                    if item.row_id == unit.row_id else item for item in state.job.units])
                if state.stop_after_current and done < len(dirty):
                    self._persist(state, status="stopped")
                    return
            self._persist(state, status="complete", done=done)
        except ScriptRevisionConflict as exc:
            self._persist(state, status="stale", error=str(exc), units=[item.model_copy(update={"status": "stale", "error": str(exc)})
                if item.status in {"pending", "running"} else item for item in state.job.units])
        except Exception as exc:
            if self._is_cancelled(state):
                terminal = "cancelled"
            else:
                terminal = "failed"
            self._persist(state, status=terminal, error=str(exc) or type(exc).__name__,
                units=[item.model_copy(update={"status": "cancelled" if terminal == "cancelled" else "failed",
                    "error": str(exc) or type(exc).__name__}) if item.status == "running" else item for item in state.job.units])
        finally:
            if lease is not None:
                self.speaker.gpu_lease.release(lease.token)
            with self._lock:
                self._running.pop(job.id, None)
                self._threads.pop(job.id, None)

    def get_job(self, project_id: str, output_id: str, job_id: str) -> VoiceFixJob:
        job = self._read_job(project_id, output_id, job_id)
        thread = self._threads.get(job_id)
        if thread is not None and thread.is_alive() and job.status in {"complete", "stopped", "cancelled", "failed", "stale"}:
            return job.model_copy(update={"status": "running", "error": None}, deep=True)
        if job.status in {"queued", "running"} and job_id not in self._threads:
            # No worker survives a process restart; preserve checkpoints for a fresh plan/retry.
            job = self._with_update(job, status="stopped", error="Fix worker stopped; completed clips remain reusable.",
                units=[unit.model_copy(update={"status": "pending"}) if unit.status == "running" else unit for unit in job.units])
            self._write_job(self.job_path(project_id, job_id), job)
            self._sync_activity(job)
        return job

    def stop(self, project_id: str, output_id: str, job_id: str, *, include_active: bool = False) -> VoiceFixJob:
        job = self._read_job(project_id, output_id, job_id)
        state = self._running.get(job_id)
        if state is None or job.status not in {"queued", "running"}:
            return job
        if include_active:
            context = state.context
            cancel = None
            with context.lock:
                if context.record.status in {"complete", "failed"}:
                    return state.job.model_copy(deep=True)
                context.cancel_event.set()
                context.cancel_requested = True
                context.record = context.record.model_copy(update={"status": "cancelled", "current_row_id": None})
                if context.active_request_id and context.active_worker:
                    cancel = (context.active_worker, context.active_request_id)
            if cancel:
                cancel[0].cancel_request(cancel[1])
        else:
            state.stop_after_current = True
        return state.job.model_copy(deep=True)

    def close(self, timeout: float = 5.0) -> None:
        """Cancel and bounded-join only jobs owned by this Fix service."""
        # A single deadline bounds shutdown even when several requests are active.
        end_at = time.monotonic() + max(0.0, timeout)
        with self._lock:
            running = list(self._running.items())
            threads = dict(self._threads)
        cancellations = []
        for _job_id, state in running:
            context = state.context
            with context.lock:
                if context.record.status in {"complete", "failed"}:
                    continue
                context.cancel_event.set()
                context.cancel_requested = True
                context.record = context.record.model_copy(update={"status": "cancelled", "current_row_id": None})
                if context.active_request_id and context.active_worker:
                    cancellations.append((context.active_worker, context.active_request_id))
        for worker, request_id in cancellations:
            try:
                worker.cancel_request(request_id)
            except Exception:
                # Shutdown remains bounded; worker teardown may finish on its own.
                pass
        for job_id, _state in running:
            thread = threads.get(job_id)
            if thread is not None and thread.is_alive():
                thread.join(timeout=max(0.0, end_at - time.monotonic()))

    def protected_clips(self, project_id: str) -> set[str]:
        """References in Fix receipts for integration with cache pruning."""
        folder = Path(self.speaker.projects.get(project_id).project_path) / "jobs" / "voice-fix"
        protected = set()
        if folder.is_dir():
            for path in folder.glob("*.json"):
                try:
                    job = self._load_job(path)
                except (OSError, ValueError):
                    continue
                if job.project_id == project_id:
                    protected.update(unit.clip for unit in job.units if unit.clip)
        return protected

    def latest_job(self, project_id: str, output_id: str) -> VoiceFixJob | None:
        folder = Path(self.speaker.projects.get(project_id).project_path) / "jobs" / "voice-fix"
        jobs = []
        if folder.is_dir():
            for path in folder.glob("*.json"):
                try:
                    job = self._load_job(path)
                except (OSError, ValueError):
                    continue
                if job.project_id == project_id and job.output_id == output_id:
                    jobs.append(job)
        if not jobs:
            return None
        latest = max(jobs, key=lambda item: item.created_at)
        return self.get_job(project_id, output_id, latest.id)
