from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_edits import FileVoiceEdits
from app.domain.reference_schedule import (
    ReferenceSchedule,
    ReferenceScheduleApplyRequest,
    ReferenceScheduleConflict,
    ReferenceScheduleDocument,
    ReferenceScheduleRequest,
    binding_properties,
    binding_fingerprint,
    plan_reference_schedule,
    script_settings_fingerprint,
)


class FileReferenceSchedules:
    """Portable, project-owned random schedule plans; reading never rerolls."""

    _lock = threading.RLock()

    def __init__(self, bindings, scripts):
        self.bindings, self.scripts = bindings, scripts
        self.edits = FileVoiceEdits(bindings.outputs, scripts)

    def _path(self, project_id: str) -> Path:
        return Path(self.bindings.projects.get(project_id).project_path) / "scripts" / "reference-schedules.json"

    def _read(self, project_id: str) -> ReferenceScheduleDocument:
        path = self._path(project_id)
        return ReferenceScheduleDocument.model_validate_json(path.read_text(encoding="utf-8")) if path.is_file() else ReferenceScheduleDocument()

    def _context(self, project_id: str, request: ReferenceScheduleRequest):
        document = self.bindings.get(project_id)
        binding = next((item for item in document.bindings if item.id == request.binding_id), None)
        if binding is None:
            raise KeyError(request.binding_id)
        if binding.status != "requested":
            raise ReferenceScheduleConflict(f"Reference binding is {binding.status}; refresh or reassign it before scheduling.")
        if binding.target.start is None or binding.target.end is None:
            raise ReferenceScheduleConflict("Reference scheduling requires a timed target; no time will be inferred.")
        script = self.scripts.get(project_id)
        start, end = binding.target.start, binding.target.end
        row_ids = list(binding.target.row_ids)
        edit_fingerprint = "none"
        if binding.scope.kind == "voice-output":
            if not row_ids:
                output = self.bindings.outputs.get(project_id, binding.scope.id)
                row_ids = sorted({segment.row_id for segment in output.segments
                    if segment.start < end and segment.end > start})
            edit_doc = self.edits.get(project_id, binding.scope.id)
            active = edit_doc.active
            mapped_start = round(start * edit_doc.sample_rate)
            mapped_end = round(end * edit_doc.sample_rate)
            for operation in active:
                if mapped_start < operation.end_frame and mapped_end > operation.start_frame:
                    raise ReferenceScheduleConflict("Active voice edit changed this bound interval; reassign the reference to the edited timeline.")
                mapped_start = operation.map_frame(mapped_start)
                mapped_end = operation.map_frame(mapped_end)
            start, end = mapped_start / edit_doc.sample_rate, mapped_end / edit_doc.sample_rate
            edit_fingerprint = hashlib.sha256(json.dumps({
                "revision": edit_doc.revision,
                "cursor": edit_doc.cursor,
                "active": [op.model_dump(by_alias=True) for op in active],
            }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        elif binding.scope.kind == "script":
            raise ReferenceScheduleConflict("Script-only references have no verified audio timeline; assign to a timed output span.")
        return binding, script, start, end, row_ids, edit_fingerprint

    def _plan(self, project_id: str, request: ReferenceScheduleRequest) -> ReferenceSchedule:
        binding, script, start, end, row_ids, edit_fingerprint = self._context(project_id, request)
        return plan_reference_schedule(binding, request, script, target_start=start, target_end=end,
            row_ids=row_ids, edit_fingerprint=edit_fingerprint)

    def preview(self, project_id: str, request: ReferenceScheduleRequest) -> ReferenceSchedule:
        with self._lock:
            return self._plan(project_id, request)

    def get(self, project_id: str) -> ReferenceScheduleDocument:
        with self._lock:
            document = self._read(project_id)
            current_bindings = {item.id: item for item in self.bindings.get(project_id).bindings}
            result = []
            for stored in document.schedules:
                binding = current_bindings.get(stored.binding_id)
                reason = None
                if binding is None:
                    reason = "Reference binding was removed."
                elif binding.status != "requested":
                    reason = f"Reference binding is {binding.status}."
                elif binding_fingerprint(binding) != stored.binding_fingerprint:
                    reason = "Binding target or sources changed."
                else:
                    try:
                        current_binding, current_script, _, _, row_ids, edit_fingerprint = self._context(
                            project_id, ReferenceScheduleRequest(binding_id=stored.binding_id, seed=stored.seed,
                                random_values=stored.random_values, random_times=stored.random_times)
                        )
                        settings_key = script_settings_fingerprint(current_script, row_ids,
                            binding_properties(current_binding), stored.random_values, stored.random_times)
                        if edit_fingerprint != stored.edit_fingerprint or settings_key != stored.settings_fingerprint:
                            reason = "Script locks or active timeline edits changed."
                    except (ReferenceScheduleConflict, KeyError, OSError, ValueError) as exc:
                        reason = str(exc)
                result.append(stored.model_copy(update={
                    "status": "stale" if reason else "ready",
                    "status_reason": reason,
                }))
            return document.model_copy(update={"schedules": result})

    def apply(self, project_id: str, request: ReferenceScheduleApplyRequest) -> ReferenceScheduleDocument:
        with self._lock, self.bindings._lock, self.edits._lock, self.scripts._lock:
            current = self._read(project_id)
            if current.revision != request.expected_revision:
                raise ReferenceScheduleConflict("Reference schedule changed in another window; reload before applying.")
            candidate = self._plan(project_id, request)
            if candidate.key != request.expected_key:
                raise ReferenceScheduleConflict("Preview is stale; preview the current binding again before applying.")
            schedules = [item for item in current.schedules if item.binding_id != candidate.binding_id]
            saved = ReferenceScheduleDocument(revision=current.revision + 1, schedules=[*schedules, candidate])
            FileProjectRepository._atomic_write(self._path(project_id), saved.model_dump_json(by_alias=True, indent=2))
            return saved

    def delete(self, project_id: str, binding_id: str, expected_revision: int) -> ReferenceScheduleDocument:
        with self._lock:
            current = self._read(project_id)
            if current.revision != expected_revision:
                raise ReferenceScheduleConflict("Reference schedule changed; reload before removing it.")
            schedules = [item for item in current.schedules if item.binding_id != binding_id]
            if len(schedules) == len(current.schedules):
                raise KeyError(binding_id)
            saved = current.model_copy(update={"revision": current.revision + 1, "schedules": schedules})
            FileProjectRepository._atomic_write(self._path(project_id), saved.model_dump_json(by_alias=True, indent=2))
            return saved
