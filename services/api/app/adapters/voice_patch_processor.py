from __future__ import annotations

import hashlib
import json
import math
import os
import re
import struct
import threading
import time
import wave
import contextlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_script_speaker import _Job as SpeakerJobContext
from app.domain.models import VoiceOutput, VoiceOutputSegment, VoiceScriptJob, VoiceScriptRequest, VoiceScriptRow
from app.domain.voice_delivery import unsupported_synthesis_settings
from app.domain.voice_patch_jobs import VoicePatchApplyRequest, VoicePatchJob, VoicePatchJobRequest
from app.domain.voice_script_document import effective_settings


_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
_RATE = 24000
_WIDTH = 2
_MAX_SECONDS = 600
_MAX_SPLICE_STEP = .05
_ROUNDING_FRAMES = 12


@dataclass
class _Running:
    job: VoicePatchJob
    context: SpeakerJobContext
    stop_after_current: bool = False
    lock: threading.RLock = field(default_factory=threading.RLock)


class VoicePatchProcessor:
    """Generate and explicitly apply one whole-row speech replacement."""

    _lock = threading.RLock()

    def __init__(self, store, speaker, bindings=None, schedules=None, *, storage_namespace: str = "voice-patch",
        route_prefix: str = "/api/projects/{project_id}/voice-patch"):
        self.store, self.speaker = store, speaker
        self.bindings, self.schedules = bindings, schedules
        if not _ID.fullmatch(storage_namespace) or not route_prefix.startswith("/api/projects/{project_id}/"):
            raise ValueError("Voice Patch namespace or route prefix is invalid.")
        self.storage_namespace, self.route_prefix = storage_namespace, route_prefix.rstrip("/")
        self.outputs, self.scripts = speaker.outputs, speaker.scripts
        self._running: dict[str, _Running] = {}
        self._threads: dict[str, threading.Thread] = {}
        providers = getattr(self.outputs, "clip_reference_providers", None)
        if isinstance(providers, list) and not any(
            getattr(provider, "__self__", None) is self and
            getattr(provider, "__func__", None) is VoicePatchProcessor.protected_clips
            for provider in providers
        ):
            providers.append(self.protected_clips)

    def _root(self, project_id: str) -> Path:
        return Path(self.speaker.projects.get(project_id).project_path)

    def job_path(self, project_id: str, job_id: str) -> Path:
        if not _ID.fullmatch(job_id):
            raise KeyError(job_id)
        return self._root(project_id) / "jobs" / self.storage_namespace / f"{job_id}.json"

    def artifact_dir(self, project_id: str, job_id: str) -> Path:
        if not _ID.fullmatch(job_id):
            raise KeyError(job_id)
        return self._root(project_id) / "jobs" / self.storage_namespace / job_id

    def applied_path(self, project_id: str, output_id: str) -> Path:
        if not _ID.fullmatch(output_id):
            raise KeyError(output_id)
        return self._root(project_id) / "jobs" / self.storage_namespace / "applied" / f"{output_id}.json"

    def _preview_url(self, project_id: str, job_id: str, kind: str) -> str:
        return f"{self.route_prefix.format(project_id=project_id)}/jobs/{job_id}/audio?kind={kind}"

    def _transaction_locks(self, project_id: str, snapshot: dict[str, Any]):
        return (self.store.edits._lock, self.store.scripts._lock)

    def _source_snapshot(self, project_id: str, draft_revision: int) -> dict[str, Any]:
        return self.store.validate(project_id, draft_revision)

    def _voice_for(self, project_id: str, capture: dict[str, Any], voice_id: str):
        return self.speaker.generator.voices.get(project_id, voice_id)

    def _extra_key_material(self, capture: dict[str, Any]) -> dict[str, Any]:
        return {}

    def _extra_lineage(self, capture: dict[str, Any]) -> dict[str, Any]:
        return {}

    def _extra_report(self, capture: dict[str, Any]) -> dict[str, Any]:
        return {}

    def _review_lineage(self, capture: dict[str, Any]) -> dict[str, Any]:
        draft = capture.get("draft")
        review = getattr(draft, "reviewed_target", None)
        if capture.get("sourceKind") != "media" or not review or not capture.get("targetReviewed"):
            return {}
        return {"targetReviewKey": review.review_key,
            "targetReviewStrategy": self.storage_namespace,
            "reviewedTarget": review.model_dump(mode="json", by_alias=True)}

    @staticmethod
    def _hash_json(value: Any) -> str:
        payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _sha(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _metadata_hash(output: VoiceOutput) -> str:
        return VoicePatchProcessor._hash_json(output.model_dump(mode="json", by_alias=True, exclude={"audio_available"}))

    @staticmethod
    def _write_pcm(path: Path, pcm: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            with wave.open(str(temporary), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(_WIDTH)
                audio.setframerate(_RATE)
                audio.writeframes(pcm)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _read_pcm(path: Path) -> bytes:
        with wave.open(str(path), "rb") as audio:
            frames = audio.getnframes()
            if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                    != (1, _WIDTH, _RATE, "NONE")):
                raise ValueError("Voice Patch requires uncompressed PCM16 mono 24 kHz audio.")
            pcm = audio.readframes(frames)
            if frames <= 0 or len(pcm) != frames * _WIDTH:
                raise ValueError("Voice Patch WAV has an incomplete PCM frame sequence.")
            return pcm

    def _references(self, project_id: str, output_id: str, row_id: str) -> tuple[Any, Any, list[str]]:
        bindings = self.bindings.get(project_id) if self.bindings is not None else None
        schedules = self.schedules.get(project_id) if self.schedules is not None else None
        blockers: list[str] = []
        relevant = []
        for binding in getattr(bindings, "bindings", []):
            scope = binding.scope
            targeted = ((scope.kind == "voice-output" and scope.id == output_id) or
                (scope.kind == "script" and scope.id == project_id and row_id in binding.target.row_ids))
            if targeted:
                relevant.append(binding)
                positive = sorted({prop for source in binding.sources if source.strength > 0 for prop in source.properties})
                if positive:
                    blockers.append(f"Reference binding {binding.id} requests {', '.join(positive)}; Voice Patch has no verified reference conditioning.")
                elif binding.status != "requested":
                    blockers.append(f"Reference binding {binding.id} is {binding.status}; refresh or remove it before Voice Patch.")
        relevant_ids = {item.id for item in relevant}
        for schedule in getattr(schedules, "schedules", []):
            if schedule.binding_id in relevant_ids:
                blockers.append(f"Reference schedule {schedule.binding_id} is not supported by Voice Patch.")
        return bindings, schedules, blockers

    def _capture(self, project_id: str, draft_revision: int) -> dict[str, Any]:
        snapshot = self._source_snapshot(project_id, draft_revision)
        draft = snapshot["draft"]
        output, script, edit = snapshot["output"], snapshot["script"], snapshot["edit"]
        segment = next((item for item in output.segments if item.row_id == draft.row_id), None)
        row = next((item for item in script.rows if item.id == draft.row_id), None)
        if segment is None or row is None:
            raise ScriptRevisionConflict("Selected source row no longer exists in the Voice Output and saved Script.")
        if (script.revision != draft.script_revision or edit.revision != draft.edit_revision
                or segment.speaker_profile_id != draft.speaker_profile_id):
            raise ScriptRevisionConflict("Patch source, Script or Timeline changed; transfer the row again.")
        if (draft.start_frame < 0 or draft.end_frame <= draft.start_frame
                or draft.end_frame > edit.frames or draft.sample_rate != _RATE):
            raise ValueError("Patch row frame range is invalid for the current preview.")
        settings = effective_settings(script, row)
        blockers = []
        if snapshot.get("sourceKind") == "media" and not snapshot.get("targetReviewed", False):
            blockers.append("Review and confirm the selected target span before generating a media Patch.")
        unsupported = unsupported_synthesis_settings(settings)
        if unsupported:
            blockers.append("Saved Script requests unsupported synthesis controls: " + ", ".join(sorted(unsupported)) + ".")
        if settings.get("duration") is not None or "duration" in settings.get("locked", []):
            blockers.append("The selected Script row has an explicit or locked duration; Voice Patch uses natural replacement duration.")
        if float(settings.get("gainDb", 0) or 0) != 0:
            blockers.append("The selected Script row requests loudness gain; apply the separate loudness render before Voice Patch.")
        if row.speaker_profile_id and row.speaker_profile_id != draft.speaker_profile_id:
            blockers.append("The current Script Speaker Profile differs from the immutable source row.")
        bindings, schedules, ref_blockers = self._references(project_id, draft.output_id, draft.row_id)
        blockers.extend(ref_blockers)
        if self.speaker.timing_plans is not None:
            timing = self.speaker.timing_plans.effective(project_id, [row], getattr(bindings, "revision", None))
            if any(item.get("rowId") == row.id and item.get("status") not in {None, "none", "unavailable"}
                    for item in timing.get("plans", [])):
                blockers.append("The selected Script row has a timing plan; Voice Patch does not rewrite reference timing.")
        return {**snapshot, "projectId": project_id, "draft": draft, "draftRevision": draft_revision,
            "output": output, "script": script, "edit": edit,
            "segment": segment, "row": row, "settings": settings, "bindings": bindings,
            "schedules": schedules, "blockers": sorted(set(blockers))}

    def _make_step(self, project_id: str, capture: dict[str, Any], voice_id: str, text: str):
        draft, output, row = capture["draft"], capture["output"], capture["row"]
        voice = self.speaker.generator.voices.get(project_id, voice_id)
        if voice.kind not in {"lora", "full"}:
            raise ValueError("Voice Patch supports trained LoRA or full voices only; clone and RVC voices are unsupported.")
        if voice.engine != "omnivoice":
            raise ValueError(f"Voice Patch supports the trained OmniVoice path only, not {voice.engine}.")
        if voice.speaker_profile_id != draft.speaker_profile_id:
            raise ValueError("Selected trained voice must match the immutable source row Speaker Profile.")
        if voice.kind == "lora" and not voice.adapter_path:
            raise ValueError("Selected LoRA voice has no trained adapter artifact.")
        if voice.kind == "full" and not voice.model_path:
            raise ValueError("Selected full voice has no trained model artifact.")
        if capture["blockers"]:
            raise ValueError(" ".join(capture["blockers"]))
        parameters = output.parameters.get("generators", {})
        if not isinstance(parameters, dict):
            parameters = {}
        request = VoiceScriptRequest(rows=[VoiceScriptRow(
            id=draft.row_id, segment_id=row.segment_id, voice_id=voice_id, text=text,
            origin_ids=row.origin_ids, tags=row.tags,
        )], parameters=parameters, gap_seconds=0)
        steps = self.speaker._plan(project_id, request)
        if len(steps) != 1 or steps[0].plan.engine != "omnivoice":
            raise ValueError("Voice Patch could not prepare one trained OmniVoice row.")
        return steps[0]

    def _build(self, project_id: str, request: VoicePatchJobRequest) -> dict[str, Any]:
        capture = self._capture(project_id, request.expected_draft_revision)
        if capture["script"].revision != request.expected_script_revision:
            raise ScriptRevisionConflict("Script changed; refresh the Voice Patch source before generating.")
        if capture["edit"].revision != request.expected_edit_revision:
            raise ScriptRevisionConflict("Timeline changed; refresh the Voice Patch source before generating.")
        text = " ".join(request.replacement_text.split())
        if not text:
            raise ValueError("Replacement text must contain speech.")
        step = self._make_step(project_id, capture, request.voice_id, text)
        clip_key = self.speaker.clip_key(step)
        material = {
            "version": 1,
            "draftRevision": request.expected_draft_revision,
            "scriptRevision": capture["script"].revision,
            "editRevision": capture["edit"].revision,
            "sourceSha256": capture["draft"].source_sha256,
            "sourceMetadataSha256": capture["draft"].source_metadata_sha256,
            "replacementText": text,
            "voiceId": request.voice_id,
            "clipKey": clip_key,
            "generatorFingerprint": step.plan.artifact_fingerprint,
            "bindings": capture["bindings"].model_dump(mode="json", by_alias=True) if capture["bindings"] else None,
            "schedules": capture["schedules"].model_dump(mode="json", by_alias=True) if capture["schedules"] else None,
            **self._extra_key_material(capture),
            **self._review_lineage(capture),
        }
        key = self._hash_json(material)
        return {**capture, "step": step, "clipKey": clip_key, "key": key,
            "generatorFingerprint": step.plan.artifact_fingerprint, "replacementText": text}

    def plan(self, project_id: str) -> dict[str, Any]:
        document = self.store.get(project_id)
        draft = document.draft
        latest = self.latest_job(project_id)
        if draft is None:
            return {"processingAvailable": False, "draftRevision": document.revision,
                "blockers": ["Transfer one source Script row before processing."], "voiceChoices": [], "latestJob": latest}
        try:
            capture = self._capture(project_id, document.revision)
            voice_choices = []
            for voice in self.speaker.generator.voices.list(project_id):
                if (voice.kind not in {"lora", "full"} or voice.engine != "omnivoice"
                        or voice.speaker_profile_id != draft.speaker_profile_id):
                    continue
                if voice.kind == "lora" and not voice.adapter_path:
                    continue
                if voice.kind == "full" and not voice.model_path:
                    continue
                voice_choices.append({"voiceId": voice.id, "name": voice.name, "kind": voice.kind,
                    "speakerProfileId": voice.speaker_profile_id})
            blockers = list(capture["blockers"])
            if not voice_choices:
                blockers.append("No trained LoRA/full OmniVoice for the source Speaker Profile is available.")
            return {"processingAvailable": not blockers, "draftRevision": document.revision,
                "scriptRevision": draft.script_revision, "editRevision": draft.edit_revision,
                "rowId": draft.row_id, "sourceOutputId": draft.output_id,
                "replacementText": draft.replacement_text, "voiceChoices": voice_choices,
                "blockers": sorted(set(blockers)), "latestJob": latest}
        except (KeyError, OSError, ValueError, ScriptRevisionConflict) as exc:
            return {"processingAvailable": False, "draftRevision": document.revision,
                "rowId": draft.row_id, "sourceOutputId": draft.output_id,
                "voiceChoices": [], "blockers": [str(exc)], "latestJob": latest}

    def _save_job(self, job: VoicePatchJob) -> None:
        path = self.job_path(job.project_id, job.id)
        with self._lock:
            FileProjectRepository._atomic_write(path, job.model_dump_json(by_alias=True, indent=2))
            latest_path = path.parent / "latest.json"
            FileProjectRepository._atomic_write(latest_path, json.dumps({"version": 1, "jobId": job.id}, indent=2))

    def _load_job(self, project_id: str, job_id: str) -> VoicePatchJob:
        path = self.job_path(project_id, job_id)
        if not path.is_file():
            raise KeyError(job_id)
        for attempt in range(6):
            try:
                return VoicePatchJob.model_validate_json(path.read_text(encoding="utf-8"))
            except PermissionError:
                if attempt == 5:
                    raise
                time.sleep(.01 * (2 ** attempt))

    def latest_job(self, project_id: str) -> VoicePatchJob | None:
        root = self._root(project_id) / "jobs" / self.storage_namespace
        pointer = root / "latest.json"
        if not pointer.is_file():
            return None
        try:
            pointer_data = json.loads(pointer.read_text(encoding="utf-8"))
            job_id = pointer_data.get("jobId") if pointer_data.get("version") == 1 else None
            return self.get_job(project_id, job_id) if isinstance(job_id, str) else None
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def _verify_artifacts(self, job: VoicePatchJob) -> None:
        if job.status != "complete":
            return
        if not job.clip or not job.audio_url or not job.replacement_audio_url:
            raise ValueError("Completed Voice Patch job is missing its artifacts.")
        for kind, key in (("replacement", "replacementSha256"), ("composite", "compositeSha256")):
            path = self.preview_path(job.project_id, job.id, kind)
            if not path.is_file() or self._sha(path) != job.report.get(key):
                raise ValueError(f"Voice Patch {kind} preview failed its receipt hash.")
            pcm = self._read_pcm(path)
            if len(pcm) // 2 != job.report.get("replacementFrames" if kind == "replacement" else "compositeFrames"):
                raise ValueError(f"Voice Patch {kind} preview frame count does not match its receipt.")

    def _verify_current_job(self, job: VoicePatchJob) -> None:
        snapshot = self._build(job.project_id, self._request_from_job(job))
        if (snapshot["key"] != job.key or snapshot["generatorFingerprint"] != job.generator_fingerprint
                or snapshot["clipKey"] != job.clip_key
                or snapshot["draft"].source_sha256 != job.source_sha256
                or snapshot["draft"].source_metadata_sha256 != job.source_metadata_sha256
                or self._sha(snapshot["audio_path"]) != job.report.get("sourcePreviewSha256")):
            raise ScriptRevisionConflict("Voice Patch job is stale because its source, Script, Timeline or trained voice changed.")

    def get_job(self, project_id: str, job_id: str) -> VoicePatchJob:
        job = self._load_job(project_id, job_id)
        if job.project_id != project_id:
            raise KeyError(job_id)
        thread = self._threads.get(job_id)
        if thread is not None and thread.is_alive() and job.status in {"complete", "stopped", "cancelled", "failed", "stale"}:
            return job.model_copy(update={"status": "running", "error": None}, deep=True)
        if job.status in {"queued", "running"} and thread is None:
            job = job.model_copy(update={"status": "stopped", "error": "Patch worker stopped; validated speech clips remain reusable.",
                "updated_at": datetime.now(timezone.utc)}, deep=True)
            self._save_job(job)
        if job.status == "complete":
            try:
                self._verify_current_job(job)
                self._verify_artifacts(job)
            except ScriptRevisionConflict as exc:
                job = job.model_copy(update={"status": "stale", "error": str(exc),
                    "audio_url": None, "replacement_audio_url": None, "updated_at": datetime.now(timezone.utc)}, deep=True)
                self._save_job(job)
            except (OSError, ValueError, wave.Error):
                job = job.model_copy(update={"status": "failed", "error": "Voice Patch preview artifact is missing or corrupt.",
                    "audio_url": None, "replacement_audio_url": None, "updated_at": datetime.now(timezone.utc)}, deep=True)
                self._save_job(job)
        return job

    def preview_path(self, project_id: str, job_id: str, kind: str) -> Path:
        if kind not in {"replacement", "composite"}:
            raise KeyError(kind)
        return self.artifact_dir(project_id, job_id) / f"{kind}.wav"

    def _request_from_job(self, job: VoicePatchJob) -> VoicePatchJobRequest:
        return VoicePatchJobRequest(expectedDraftRevision=job.draft_revision,
            expectedScriptRevision=job.script_revision, expectedEditRevision=job.edit_revision,
            replacementText=job.replacement_text, voiceId=job.voice_id)

    def start(self, project_id: str, request: VoicePatchJobRequest) -> VoicePatchJob:
        snapshot = self._build(project_id, request)
        with self._lock:
            existing = self.latest_job(project_id)
            if existing is not None and existing.key == snapshot["key"] and existing.status in {"queued", "running", "complete"}:
                return existing
            # A cached clip may be syntactically valid but have failed the PCM
            # quality gate. An explicit retry must not replay that same failure.
            snapshot["forceRegenerate"] = bool(existing is not None and existing.key == snapshot["key"]
                and existing.status == "failed")
            job = VoicePatchJob(project_id=project_id, output_id=snapshot["draft"].output_id,
                status="queued", key=snapshot["key"], draft_revision=request.expected_draft_revision,
                script_revision=request.expected_script_revision, edit_revision=request.expected_edit_revision,
                source_sha256=snapshot["draft"].source_sha256,
                source_metadata_sha256=snapshot["draft"].source_metadata_sha256,
                generator_fingerprint=snapshot["generatorFingerprint"], clip_key=snapshot["clipKey"],
                replacement_text=snapshot["replacementText"], voice_id=request.voice_id,
                speaker_profile_id=snapshot["draft"].speaker_profile_id)
            context_record = VoiceScriptJob(id=job.id, project_id=project_id, total=1)
            state = _Running(job, SpeakerJobContext(context_record))
            self._save_job(job)
            self._running[job.id] = state
            thread = threading.Thread(target=self._run, args=(snapshot, state), daemon=True,
                name=f"voice-patch-{job.id}")
            self._threads[job.id] = thread
            thread.start()
            return job

    def _cancelled(self, state: _Running) -> bool:
        with state.context.lock:
            return state.context.cancel_event.is_set() or state.context.cancel_requested

    def _fresh(self, project_id: str, snapshot: dict[str, Any]) -> bool:
        try:
            fresh = self._build(project_id, self._request_from_snapshot(snapshot))
        except (KeyError, OSError, ValueError, ScriptRevisionConflict):
            return False
        return (fresh["key"] == snapshot["key"] and fresh["clipKey"] == snapshot["clipKey"]
            and fresh["generatorFingerprint"] == snapshot["generatorFingerprint"]
            and fresh["draft"].source_sha256 == snapshot["draft"].source_sha256
            and self._sha(fresh["audio_path"]) == self._sha(snapshot["audio_path"]))

    @staticmethod
    def _request_from_snapshot(snapshot: dict[str, Any]) -> VoicePatchJobRequest:
        draft = snapshot["draft"]
        return VoicePatchJobRequest(expectedDraftRevision=snapshot["draftRevision"],
            expectedScriptRevision=snapshot["script"].revision, expectedEditRevision=snapshot["edit"].revision,
            replacementText=snapshot["replacementText"], voiceId=snapshot["step"].plan.voice.id)

    @staticmethod
    def _sample(pcm: bytes, frame: int) -> int:
        return struct.unpack_from("<h", pcm, frame * _WIDTH)[0]

    @classmethod
    def _max_boundary_step(cls, pcm: bytes, starts: list[int], ends: list[int]) -> float:
        count = len(pcm) // _WIDTH
        maximum = 0.0
        for start, end in zip(starts, ends):
            for left, right in ((start - 1, start), (end - 1, end)):
                if 0 <= left < count and 0 <= right < count:
                    maximum = max(maximum, abs(cls._sample(pcm, left) - cls._sample(pcm, right)) / 32768.0)
        return maximum

    def _compose_pcm(self, source_pcm: bytes, replacement_pcm: bytes, start: int, end: int):
        frame_count = len(source_pcm) // _WIDTH
        replacement_frames = len(replacement_pcm) // _WIDTH
        if (len(source_pcm) % _WIDTH or len(replacement_pcm) % _WIDTH or start < 0 or end <= start
                or end > frame_count or replacement_frames <= 0):
            raise ValueError("Voice Patch frame range or replacement clip is invalid.")
        composite = source_pcm[:start * _WIDTH] + replacement_pcm + source_pcm[end * _WIDTH:]
        if len(composite) // _WIDTH > _RATE * _MAX_SECONDS:
            raise ValueError("Voice Patch result exceeds ten minutes.")
        if any(value in (-32768, 32767) for (value,) in struct.iter_unpack("<h", composite)):
            raise ValueError("Voice Patch result contains clipped PCM16 samples.")
        max_step = self._max_boundary_step(composite, [start], [start + replacement_frames])
        if max_step > _MAX_SPLICE_STEP:
            raise ValueError(f"Voice Patch splice boundary step {max_step:.6f} exceeds 0.05 full scale.")
        return composite, max_step

    def _run(self, snapshot: dict[str, Any], state: _Running) -> None:
        job, context = state.job, state.context
        lease = None
        try:
            if not self._fresh(job.project_id, snapshot):
                raise ScriptRevisionConflict("Source, Script, Timeline, references or trained voice changed before Patch started.")
            if self._cancelled(state):
                raise RuntimeError("Voice Patch cancelled.")
            step = snapshot["step"]
            root = self.outputs.clips_root(job.project_id)
            cached_folder = root / snapshot["clipKey"]
            cached = self.speaker._cached_record(cached_folder, step)
            force_regenerate = bool(snapshot.get("forceRegenerate"))
            if cached is None or force_regenerate:
                lease = self.speaker.gpu_lease.acquire(f"voice-patch:{job.project_id}:{job.id}")
                if self.speaker.before_start is not None:
                    self.speaker.before_start()
            with context.lock:
                context.record = context.record.model_copy(update={"status": "running", "current_row_id": snapshot["draft"].row_id})
            running_job = job.model_copy(update={"status": "running", "updated_at": datetime.now(timezone.utc)})
            state.job = running_job
            self._save_job(running_job)
            cancellation_id = f"{job.id}-{uuid4().hex}"
            with context.lock:
                context.active_request_id = cancellation_id
                context.active_worker = step.plan.engine_speech.worker
                register = getattr(context.active_worker, "register_request", None)
                if callable(register):
                    register(cancellation_id)
            try:
                clip = self.speaker._clip(job.project_id, step, cancellation_id, job=context,
                    is_cancelled=lambda: self._cancelled(state),
                    commit=lambda action: self._commit(snapshot, state, action), force_regenerate=force_regenerate)
            finally:
                abandon = getattr(step.plan.engine_speech.worker, "abandon_request", None)
                if callable(abandon):
                    abandon(cancellation_id)
                with context.lock:
                    context.active_request_id = None
                    context.active_worker = None
                    context.record = context.record.model_copy(update={"current_row_id": None})
            if self._cancelled(state):
                raise RuntimeError("Voice Patch cancelled.")
            if not self._fresh(job.project_id, snapshot):
                raise ScriptRevisionConflict("Source, Script, Timeline, references or trained voice changed during Patch.")
            clip_folder = root / clip.key
            record = self.speaker._cached_record(clip_folder, step)
            if record is None or not (clip.key == snapshot["clipKey"] or clip.key.startswith(snapshot["clipKey"] + "-")):
                raise ValueError("Generated Voice Patch clip failed cache identity validation.")
            clip_path = clip_folder / "audio.wav"
            clip_pcm = self._read_pcm(clip_path)
            if self._sha(clip_path) != record.get("audioSha256"):
                raise ValueError("Generated Voice Patch clip failed its audio checksum.")
            source_path: Path = snapshot["audio_path"]
            source_pcm = self._read_pcm(source_path)
            start, end = snapshot["draft"].start_frame, snapshot["draft"].end_frame
            composite, max_step = self._compose_pcm(source_pcm, clip_pcm, start, end)
            folder = self.artifact_dir(job.project_id, job.id)
            replacement_path, composite_path = self.preview_path(job.project_id, job.id, "replacement"), self.preview_path(job.project_id, job.id, "composite")
            self._write_pcm(replacement_path, clip_pcm)
            self._write_pcm(composite_path, composite)
            source_segment = snapshot["segment"]
            report = {"version": 1, "freshRetry": force_regenerate, "rowId": snapshot["draft"].row_id,
                "sourceOutputId": job.output_id, "sourceAudioSha256": snapshot["draft"].source_sha256,
                "sourceMetadataSha256": snapshot["draft"].source_metadata_sha256,
                "sourcePreviewSha256": self._sha(source_path), "scriptRevision": job.script_revision,
                "editRevision": job.edit_revision, "startFrame": start, "endFrame": end,
                "sourceFrames": len(source_pcm) // _WIDTH, "replacementFrames": len(clip_pcm) // _WIDTH,
                "compositeFrames": len(composite) // _WIDTH, "deltaFrames": len(clip_pcm) // _WIDTH - (end - start),
                "maxSpliceBoundaryStep": max_step, "replacementSha256": self._sha(replacement_path),
                "compositeSha256": self._sha(composite_path), "clipRecordSha256": self._sha(clip_folder / "clip.json"),
                "sourceSegmentStart": source_segment.start, "sourceSegmentEnd": source_segment.end,
                "preservesPcmOutsideSelectedRow": True, "timingReview": "unverified-natural-duration-ripple",
                "clipTimingQuality": record.get("quality"), "clipTimingNote": record.get("note"),
                **self._review_lineage(snapshot),
                **self._extra_report(snapshot)}
            if not self._fresh(job.project_id, snapshot):
                raise ScriptRevisionConflict("Source, Script, Timeline or trained voice changed before Patch preview publication.")
            complete = state.job.model_copy(update={"status": "complete", "done": 1, "clip": clip.key,
                "replacement_audio_url": self._preview_url(job.project_id, job.id, "replacement"),
                "audio_url": self._preview_url(job.project_id, job.id, "composite"),
                "report": report, "error": None, "updated_at": datetime.now(timezone.utc)}, deep=True)
            self._save_job(complete)
            state.job = complete
            with context.lock:
                context.record = context.record.model_copy(update={"status": "complete", "done": 1})
        except ScriptRevisionConflict as exc:
            self._finish(state, "stale", str(exc))
        except Exception as exc:
            terminal = "cancelled" if self._cancelled(state) else "failed"
            self._finish(state, terminal, str(exc) or type(exc).__name__)
        finally:
            if lease is not None:
                self.speaker.gpu_lease.release(lease.token)
            with self._lock:
                self._running.pop(job.id, None)
                self._threads.pop(job.id, None)

    def _commit(self, snapshot: dict[str, Any], state: _Running, action) -> bool:
        if self._cancelled(state) or not self._fresh(state.job.project_id, snapshot):
            return False
        with contextlib.ExitStack() as stack:
            for lock in self._transaction_locks(state.job.project_id, snapshot):
                stack.enter_context(lock)
            if self._cancelled(state) or not self._fresh(state.job.project_id, snapshot):
                return False
            action()
            return True

    def _finish(self, state: _Running, status: str, error: str) -> None:
        with state.lock:
            state.job = state.job.model_copy(update={"status": status, "error": error,
                "updated_at": datetime.now(timezone.utc)}, deep=True)
            self._save_job(state.job)
            with state.context.lock:
                state.context.record = state.context.record.model_copy(update={"status": status, "error": error,
                    "finished_at": datetime.now(timezone.utc)})

    def stop(self, project_id: str, job_id: str, *, include_active: bool = False) -> VoicePatchJob:
        job = self._load_job(project_id, job_id)
        state = self._running.get(job_id)
        if state is None or job.project_id != project_id or job.status not in {"queued", "running"}:
            return self.get_job(project_id, job_id)
        if include_active:
            context = state.context
            cancel = None
            with context.lock:
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
        deadline = time.monotonic() + max(0, timeout)
        with self._lock:
            running = list(self._running.values())
            threads = dict(self._threads)
        cancellations = []
        for state in running:
            context = state.context
            with context.lock:
                context.cancel_event.set()
                context.cancel_requested = True
                context.record = context.record.model_copy(update={"status": "cancelled", "current_row_id": None})
                if context.active_request_id and context.active_worker:
                    cancellations.append((context.active_worker, context.active_request_id))
        for worker, request_id in cancellations:
            try:
                worker.cancel_request(request_id)
            except Exception:
                pass
        for state in running:
            thread = threads.get(state.job.id)
            if thread and thread.is_alive():
                thread.join(timeout=max(0, deadline - time.monotonic()))

    def protected_clips(self, project_id: str) -> set[str]:
        root = self._root(project_id) / "jobs" / self.storage_namespace
        protected = set()
        if root.is_dir():
            for path in root.glob("patch-*.json"):
                try:
                    job = VoicePatchJob.model_validate_json(path.read_text(encoding="utf-8"))
                    if job.project_id == project_id and job.clip:
                        protected.add(job.clip)
                except (OSError, ValueError):
                    continue
        return protected

    @staticmethod
    def _clip_words(record: dict[str, Any], start_frame: int, segment_index: int, profile_id: str, frames: int) -> list[dict[str, Any]]:
        result = []
        for source in record.get("words", []):
            if not isinstance(source, dict):
                continue
            word = dict(source)
            start = round(float(word.get("start", 0)) * _RATE)
            end = round(float(word.get("end", 0)) * _RATE)
            if start < -_ROUNDING_FRAMES or end < start or end > frames + _ROUNDING_FRAMES:
                raise ValueError("Replacement word timing falls outside generated PCM.")
            start, end = min(max(0, start), frames), min(max(0, end), frames)
            word.update(start=(start_frame + start) / _RATE, end=(start_frame + end) / _RATE,
                segmentIndex=segment_index, speakerId=profile_id)
            result.append(word)
        return result

    def _mapped_spans(self, capture: dict[str, Any], pcm_frames: int) -> dict[str, tuple[int, int]]:
        spans = {}
        for segment in capture["output"].segments:
            start, end = round(segment.start * _RATE), round(segment.end * _RATE)
            for operation in capture["edit"].active:
                start, end = operation.map_frame(start), operation.map_frame(end)
            if end > pcm_frames:
                over = end - pcm_frames
                last = max(capture["output"].segments, key=lambda item: (item.end, item.start, item.row_id))
                if segment.row_id != last.row_id or over > _ROUNDING_FRAMES:
                    raise ValueError("Source Voice Output segment extends beyond Timeline preview audio.")
                end = pcm_frames
            if start < 0 or end <= start or end > pcm_frames:
                raise ValueError("Mapped source segment falls outside Timeline preview audio.")
            spans[segment.row_id] = (start, end)
        return spans

    def _compose_output(self, project_id: str, capture: dict[str, Any], job: VoicePatchJob,
        source_pcm: bytes, replacement_pcm: bytes, clip_record: dict[str, Any], output_id: str, audio_path: Path):
        draft, output, edit = capture["draft"], capture["output"], capture["edit"]
        spans = self._mapped_spans(capture, len(source_pcm) // _WIDTH)
        selected_start, selected_end = draft.start_frame, draft.end_frame
        if spans.get(draft.row_id) != (selected_start, selected_end):
            raise ScriptRevisionConflict("Voice Patch draft no longer covers the complete selected source row.")
        for row_id, (start, end) in spans.items():
            if row_id != draft.row_id and start < selected_end and end > selected_start:
                raise ScriptRevisionConflict("Selected row overlaps another source segment; Patch cannot map it safely.")
        composite, max_step = self._compose_pcm(source_pcm, replacement_pcm, selected_start, selected_end)
        replacement_frames = len(replacement_pcm) // _WIDTH
        delta = replacement_frames - (selected_end - selected_start)
        sorted_segments = sorted(output.segments, key=lambda item: (item.start, item.end, item.row_id))
        index_by_row = {segment.row_id: i for i, segment in enumerate(sorted_segments)}
        current_script_rows = {row.id: row for row in capture["script"].rows}
        voice = self._voice_for(project_id, capture, job.voice_id)
        segments = []
        for segment in sorted_segments:
            start, end = spans[segment.row_id]
            if segment.row_id == draft.row_id:
                new_start, new_end = selected_start, selected_start + replacement_frames
                row = current_script_rows[draft.row_id]
                new_segment = segment.model_copy(update={
                    "voice_id": voice.id, "voice_name": voice.name, "speaker_profile_id": voice.speaker_profile_id,
                    "engine": "omnivoice", "generator_id": job.clip_key and self.speaker.generator.generator_for(voice.engine),
                    "text": job.replacement_text, "start": new_start / _RATE, "end": new_end / _RATE,
                    "clip": job.clip, "requested_duration": None, "duration_report": clip_record.get("durationFit"),
                    "script_row": {**row.model_dump(mode="json", by_alias=True), "text": job.replacement_text,
                        "voiceId": voice.id, "speakerProfileId": voice.speaker_profile_id},
                })
            else:
                new_start = start + (delta if start >= selected_end else 0)
                new_end = end + (delta if end > selected_end else 0)
                new_segment = segment.model_copy(update={"start": new_start / _RATE, "end": new_end / _RATE})
            segments.append(new_segment)
        words = []
        for word in output.words:
            row_id = None
            index = word.get("segmentIndex")
            if isinstance(index, int) and 0 <= index < len(output.segments):
                row_id = output.segments[index].row_id
            if row_id is None:
                point = float(word.get("start", 0))
                source_segment = next((item for item in output.segments if item.start <= point < item.end), None)
                row_id = source_segment.row_id if source_segment else None
            start_word, end_word = round(float(word.get("start", 0)) * _RATE), round(float(word.get("end", 0)) * _RATE)
            for operation in edit.active:
                start_word, end_word = operation.map_frame(start_word), operation.map_frame(end_word)
            overlaps_patch = start_word < selected_end and end_word > selected_start
            if row_id == draft.row_id:
                if start_word < selected_start or end_word > selected_end:
                    raise ValueError("An existing selected word cue crosses the Patch row boundary; source timing is ambiguous.")
                continue
            if overlaps_patch:
                raise ValueError("An existing word cue crosses the selected Patch row boundary; source timing is ambiguous.")
            copy = dict(word)
            if edit.cursor:
                # Keep the Timeline preview's conservative timing warning.
                # Frame mapping is not a fresh acoustic alignment measurement.
                copy["timingTrusted"] = False
            if start_word >= selected_end:
                start_word += delta
                end_word += delta
            copy.update(start=start_word / _RATE, end=end_word / _RATE,
                segmentIndex=index_by_row.get(row_id, word.get("segmentIndex")))
            words.append(copy)
        selected_index = index_by_row[draft.row_id]
        words.extend(self._clip_words(clip_record, selected_start, selected_index, voice.speaker_profile_id,
            replacement_frames))
        words.sort(key=lambda word: (float(word.get("start", 0)), float(word.get("end", 0))))
        trusted = sum(word.get("timingTrusted") is True for word in words)
        quality = "source" if words and trusted == len(words) else "partial" if trusted else "needs-alignment"
        parameters = dict(output.parameters)
        lineage = {"version": 1, "sourceOutputId": output.id, "sourceAudioSha256": draft.source_sha256,
            "sourceMetadataSha256": draft.source_metadata_sha256, "sourcePreviewSha256": self._sha(capture["audio_path"]),
            "draftRevision": job.draft_revision, "scriptRevision": job.script_revision, "editRevision": job.edit_revision,
            "jobId": job.id, "jobKey": job.key, "rowId": draft.row_id, "replacementText": job.replacement_text,
            "voiceId": voice.id, "speakerProfileId": voice.speaker_profile_id, "sampleRate": _RATE,
            "durationDeltaFrames": delta, "timingReview": "unverified-natural-duration-ripple",
            **self._review_lineage(capture),
            **self._extra_lineage(capture)}
        parameters["voicePatch"] = lineage
        first = segments[0]
        distinct_voices = {segment.voice_id for segment in segments}
        patched = output.model_copy(update={
            "id": output_id, "name": f"Voice Patch · {job.replacement_text[:48]}",
            "text": "\n".join(item.text for item in segments), "voice_id": first.voice_id,
            "voice_name": first.voice_name if len(distinct_voices) == 1 else f"{len(distinct_voices)} voice",
            "speaker_profile_id": first.speaker_profile_id, "engine": first.engine, "generator_id": first.generator_id,
            "parameters": parameters, "duration": len(composite) / (_WIDTH * _RATE), "sample_rate": _RATE,
            "audio_path": audio_path.relative_to(self._root(project_id)).as_posix(),
            "words": words, "word_timing_quality": quality,
            "word_timing_note": "Voice Patch replaced one whole Script row; downstream speech rippled by natural replacement duration. Timing and voice identity require human review.",
            "segments": segments, "created_at": datetime.now(timezone.utc),
        })
        report = {"version": 1, "sourceOutputId": output.id, "sourceAudioSha256": draft.source_sha256,
            "sourcePreviewSha256": self._sha(capture["audio_path"]), "rowId": draft.row_id,
            "startFrame": selected_start, "endFrame": selected_end, "replacementFrames": replacement_frames,
            "deltaFrames": delta, "frames": len(composite) // _WIDTH,
            "maxSpliceBoundaryStep": max_step, "timingReview": "unverified-natural-duration-ripple",
            "clipTimingQuality": clip_record.get("quality"), "audioGainPending": False,
            "preservedPcmRanges": [{"sourceStartFrame": 0, "sourceEndFrame": selected_start,
                "outputStartFrame": 0, "outputEndFrame": selected_start},
                {"sourceStartFrame": selected_end, "sourceEndFrame": len(source_pcm) // _WIDTH,
                "outputStartFrame": selected_start + replacement_frames,
                "outputEndFrame": len(composite) // _WIDTH}],
            "preservesPcmOutsideSelectedRow": True}
        return composite, patched, report

    def _valid_apply_receipt(self, project_id: str, receipt: dict[str, Any], capture: dict[str, Any], job: VoicePatchJob):
        if (receipt.get("version") != 1 or receipt.get("sourceOutputId") != job.output_id
                or receipt.get("jobId") != job.id or receipt.get("key") != job.key
                or receipt.get("sourceAudioSha256") != capture["draft"].source_sha256
                or receipt.get("sourceMetadataSha256") != capture["draft"].source_metadata_sha256
                or receipt.get("draftRevision") != job.draft_revision
                or receipt.get("scriptRevision") != job.script_revision or receipt.get("editRevision") != job.edit_revision):
            raise KeyError("applied")
        output_id = receipt.get("outputId")
        if not isinstance(output_id, str) or not _ID.fullmatch(output_id):
            raise KeyError("applied")
        output = self.outputs.get(project_id, output_id)
        path = self.outputs.audio_path(project_id, output_id)
        if self._metadata_hash(output) != receipt.get("outputMetadataSha256") or self._sha(path) != receipt.get("outputAudioSha256"):
            raise ValueError("Applied Voice Patch output failed receipt integrity validation.")
        pcm = self._read_pcm(path)
        if len(pcm) // _WIDTH != receipt.get("frames"):
            raise ValueError("Applied Voice Patch output frame count differs from receipt.")
        return {"output": output, "audioUrl": f"/api/projects/{project_id}/voice-outputs/{output_id}/audio",
            "report": receipt["report"], "sourceOutputId": job.output_id, "key": job.key,
            "sourceScriptRows": [row.model_dump(mode="json", by_alias=True) for row in capture["script"].rows]}

    def apply(self, project_id: str, request: VoicePatchApplyRequest) -> dict[str, Any]:
        job = self.get_job(project_id, request.job_id)
        if job.status != "complete" or job.key != request.expected_key:
            raise ScriptRevisionConflict("A completed, current Voice Patch job is required before Apply.")
        capture = self._capture(project_id, request.expected_draft_revision)
        snapshot = self._build(project_id, self._request_from_job(job))
        if (job.draft_revision != request.expected_draft_revision or snapshot["key"] != job.key
                or snapshot["generatorFingerprint"] != job.generator_fingerprint):
            raise ScriptRevisionConflict("Voice Patch inputs changed; process the current draft again before Apply.")
        receipt_path = self.applied_path(project_id, job.output_id)
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            if receipt_path.is_file():
                try:
                    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
                    return self._valid_apply_receipt(project_id, receipt, capture, job)
                except (OSError, ValueError, KeyError, TypeError, wave.Error):
                    pass
            replacement_path = self.preview_path(project_id, job.id, "replacement")
            self._verify_artifacts(job)
            replacement_pcm = self._read_pcm(replacement_path)
            if self._sha(replacement_path) != job.report.get("replacementSha256"):
                raise ValueError("Voice Patch replacement preview checksum mismatch.")
            output_id, audio_path = self.outputs.reserve(project_id)
            try:
                clip_record_path = self.outputs.clips_root(project_id) / str(job.clip) / "clip.json"
                clip_record = json.loads(clip_record_path.read_text(encoding="utf-8"))
                cached_record = self.speaker._cached_record(clip_record_path.parent, snapshot["step"])
                if (cached_record is None or clip_record != cached_record
                        or self._sha(clip_record_path) != job.report.get("clipRecordSha256")
                        or self._sha(clip_record_path.parent / "audio.wav") != clip_record.get("audioSha256")):
                    raise ValueError("Voice Patch speech clip failed its current cache identity or checksum.")
                source_pcm = self._read_pcm(capture["audio_path"])
                composite, candidate, report = self._compose_output(project_id, capture, job, source_pcm,
                    replacement_pcm, clip_record, output_id, audio_path)
                if self._sha(capture["audio_path"]) != job.report.get("sourcePreviewSha256"):
                    raise ScriptRevisionConflict("Source preview changed after Patch generation; process again.")
                self._write_pcm(audio_path, composite)
                with contextlib.ExitStack() as stack:
                    for lock in self._transaction_locks(project_id, capture):
                        stack.enter_context(lock)
                    fresh = self._capture(project_id, request.expected_draft_revision)
                    rebuilt = self._build(project_id, self._request_from_job(job))
                    rebuilt_hash = self._sha(fresh["audio_path"])
                    candidate_matches = self._read_pcm(audio_path) == composite
                    if (rebuilt["key"] != job.key or rebuilt_hash != job.report.get("sourcePreviewSha256")
                            or not candidate_matches):
                        raise ScriptRevisionConflict(
                            "Source, Script, Timeline or trained voice changed before Apply publication "
                            f"(plan={rebuilt['key'] == job.key}, source={rebuilt_hash == job.report.get('sourcePreviewSha256')}, "
                            f"output={candidate_matches}).")
                    self.outputs.save(project_id, candidate)
                receipt = {"version": 1, "key": job.key, "jobId": job.id, "sourceOutputId": job.output_id,
                    "sourceAudioSha256": job.source_sha256, "sourceMetadataSha256": job.source_metadata_sha256,
                    "draftRevision": job.draft_revision, "sourcePreviewSha256": job.report["sourcePreviewSha256"], "scriptRevision": job.script_revision,
                    "editRevision": job.edit_revision, "outputId": output_id,
                    "outputAudioSha256": self._sha(audio_path), "outputMetadataSha256": self._metadata_hash(candidate),
                    "frames": len(composite) // _WIDTH, "report": {**report, "key": job.key,
                        "outputAudioSha256": self._sha(audio_path)}, "createdAt": datetime.now(timezone.utc).isoformat()}
                FileProjectRepository._atomic_write(receipt_path, json.dumps(receipt, ensure_ascii=False, indent=2))
                return {"output": candidate, "audioUrl": f"/api/projects/{project_id}/voice-outputs/{output_id}/audio",
                    "report": receipt["report"], "sourceOutputId": job.output_id, "key": job.key,
                    "sourceScriptRows": [row.model_dump(mode="json", by_alias=True) for row in capture["script"].rows]}
            except Exception:
                self.outputs.discard(project_id, output_id)
                raise

    def latest(self, project_id: str) -> dict[str, Any]:
        root = self._root(project_id) / "jobs" / self.storage_namespace / "applied"
        if not root.is_dir():
            raise KeyError("applied")
        receipts = []
        for path in root.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                receipts.append(payload)
            except (OSError, ValueError):
                continue
        if not receipts:
            raise KeyError("applied")
        receipt = max(receipts, key=lambda item: item.get("createdAt", ""))
        job = self.get_job(project_id, receipt.get("jobId", ""))
        capture = self._capture(project_id, job.draft_revision)
        return self._valid_apply_receipt(project_id, receipt, capture, job)

