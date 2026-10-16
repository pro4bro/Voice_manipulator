from __future__ import annotations

import hashlib
import json
import re
import wave
from pathlib import Path
from typing import Any

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_edit_preview import VoiceEditPreview
from app.domain.voice_patch import VoicePatchDocument, VoicePatchDraft, VoicePatchTransferRequest


_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
_RATE = 24000
_FINAL_ROUNDING_FRAMES = 12


def _json_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class FileVoicePatch:
    """Persist one explicit whole-row transfer draft; no synthesis is performed."""

    def __init__(self, edits):
        self.edits = edits
        self.outputs = edits.outputs
        self.scripts = edits.scripts
        self.projects = self.outputs.projects
        self.previews = VoiceEditPreview(edits)

    def path(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "scripts" / "voice-patch.json"

    def _record(self, project_id: str) -> dict[str, Any]:
        path = self.path(project_id)
        if not path.is_file():
            return {"revision": 0, "draft": None}
        record = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(record, dict):
            raise ValueError("Voice Patch draft is invalid.")
        return record

    @staticmethod
    def _output_metadata_hash(output) -> str:
        value = output.model_dump(mode="json", by_alias=True, exclude={"audio_available"})
        return _json_hash(value)

    @staticmethod
    def _script_hash(script) -> str:
        return _json_hash(script.model_dump(mode="json", by_alias=True))

    @staticmethod
    def _edit_hash(edit) -> str:
        return _json_hash(edit.model_dump(mode="json", by_alias=True))

    @staticmethod
    def _file_hash(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    def _capture(self, project_id: str, output_id: str) -> dict[str, Any]:
        with self.edits._lock, self.scripts._lock:
            output = self.outputs.get(project_id, output_id)
            script = self.scripts.get(project_id)
            edit = self.edits.get(project_id, output_id)
            source_path = self.outputs.audio_path(project_id, output_id)
            source_hash = self._file_hash(source_path)
            with wave.open(str(source_path), "rb") as audio:
                frames = audio.getnframes()
                if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                        != (1, 2, _RATE, "NONE") or frames <= 0 or len(audio.readframes(frames)) != frames * 2):
                    raise ValueError("Voice Patch source must be complete PCM16 mono 24 kHz audio.")
            if edit.source_sha256 != source_hash or edit.source_frames != frames or edit.sample_rate != _RATE:
                raise ScriptRevisionConflict("Source audio changed; reload the Timeline before transferring a patch.")
        return {"output": output, "script": script, "edit": edit, "sourcePath": source_path,
            "sourceHash": source_hash, "metadataHash": self._output_metadata_hash(output),
            "scriptHash": self._script_hash(script), "editHash": self._edit_hash(edit), "sourceFrames": frames}

    def _preview_path(self, project_id: str, output_id: str, edit, *, create: bool) -> tuple[Path, str]:
        if not edit.cursor:
            return self.outputs.audio_path(project_id, output_id), f"/api/projects/{project_id}/voice-outputs/{output_id}/audio"
        payload = json.dumps({"source": edit.source_sha256,
            "operations": [operation.model_dump(by_alias=True) for operation in edit.active], "policy": 1}, sort_keys=True)
        key = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
        path = self.previews.path(project_id, output_id, key)
        if create:
            self.previews.render(project_id, output_id, edit)
        if not path.is_file() or not path.with_suffix(".json").is_file():
            raise FileNotFoundError("Current Timeline preview is missing; open Timeline to rebuild it.")
        self.previews.validate(path, edit.source_sha256, edit.frames)
        return path, f"/api/projects/{project_id}/voice-outputs/{output_id}/edit/previews/{key}/audio"

    def _resolve_row(self, capture: dict[str, Any], row_id: str, audio_url: str) -> VoicePatchDraft:
        output, script, edit = capture["output"], capture["script"], capture["edit"]
        segment = next((item for item in output.segments if item.row_id == row_id), None)
        if segment is None:
            raise ValueError("Select one complete source Script row before creating a Voice Patch draft.")
        last = max(output.segments, key=lambda item: (item.end, item.start, item.row_id))
        start_frame = round(segment.start * _RATE)
        end_frame = round(segment.end * _RATE)
        precision_clamps = []
        if end_frame > capture["sourceFrames"]:
            over = end_frame - capture["sourceFrames"]
            if segment.row_id != last.row_id or over > _FINAL_ROUNDING_FRAMES:
                raise ValueError("Selected source row falls outside the actual PCM frame range.")
            precision_clamps.append({"rowId": row_id, "stage": "source", "frames": over,
                "reason": "three-decimal segment endpoint precision"})
            end_frame = capture["sourceFrames"]
        if start_frame < 0 or end_frame <= start_frame:
            raise ValueError("Selected source row has an invalid PCM frame range.")
        for operation in edit.active:
            start_frame = operation.map_frame(start_frame)
            end_frame = operation.map_frame(end_frame)
        if end_frame > edit.frames:
            over = end_frame - edit.frames
            if segment.row_id != last.row_id or over > _FINAL_ROUNDING_FRAMES:
                raise ValueError("Selected source row falls outside the current Timeline preview.")
            precision_clamps.append({"rowId": row_id, "stage": "timeline", "frames": over,
                "reason": "three-decimal segment endpoint precision"})
            end_frame = edit.frames
        if end_frame <= start_frame or start_frame < 0 or end_frame > edit.frames:
            raise ValueError("Selected source row has an invalid edited frame range.")
        row = next((item for item in script.rows if item.id == row_id), None)
        replacement_text = row.text if row is not None else segment.text
        # These fields describe the audible source. A later Script assignment
        # cannot relabel its identity; a replacement model is selected separately.
        voice_id = segment.voice_id
        speaker_profile_id = segment.speaker_profile_id
        if not replacement_text.strip() or not voice_id or not speaker_profile_id:
            raise ValueError("Selected row needs replacement text and a resolved voice/profile.")
        return VoicePatchDraft(output_id=output.id, row_id=row_id,
            source_sha256=capture["sourceHash"], source_metadata_sha256=capture["metadataHash"],
            script_revision=script.revision, edit_revision=edit.revision,
            start_frame=start_frame, end_frame=end_frame, sample_rate=_RATE,
            text=segment.text, replacement_text=replacement_text, voice_id=voice_id,
            speaker_profile_id=speaker_profile_id, status="ready", audio_url=audio_url,
            processing_available=False, report={"durationPrecisionClamps": precision_clamps})

    def transfer(self, project_id: str, request: VoicePatchTransferRequest) -> VoicePatchDocument:
        if not _ID.fullmatch(request.output_id):
            raise ValueError("Output ID is invalid.")
        record = self._record(project_id)
        if record.get("revision", 0) != request.expected_revision:
            raise ScriptRevisionConflict("Voice Patch draft changed; refresh before transferring another row.")
        capture = self._capture(project_id, request.output_id)
        if capture["script"].revision != request.expected_script_revision:
            raise ScriptRevisionConflict("Script changed; refresh before transferring the selected row.")
        if capture["edit"].revision != request.expected_edit_revision:
            raise ScriptRevisionConflict("Timeline changed; refresh before transferring the selected row.")
        preview_path, audio_url = self._preview_path(project_id, request.output_id, capture["edit"], create=True)
        # The preview processor runs outside the stores' locks. Re-capture before
        # publishing so the draft can never point at stale text, metadata or audio.
        fresh = self._capture(project_id, request.output_id)
        if any(fresh[key] != capture[key] for key in ("sourceHash", "metadataHash", "scriptHash", "editHash")):
            raise ScriptRevisionConflict("Source, Script or Timeline changed while preparing the preview; retry transfer.")
        if fresh["edit"].cursor:
            self.previews.validate(preview_path, fresh["edit"].source_sha256, fresh["edit"].frames)
        draft = self._resolve_row(fresh, request.row_id, audio_url)
        document = VoicePatchDocument(revision=request.expected_revision + 1, draft=draft)
        path = self.path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        stored = {"revision": document.revision, "draft": draft.model_dump(mode="json", by_alias=True),
            "scriptFingerprint": fresh["scriptHash"], "editFingerprint": fresh["editHash"]}
        with self.edits._lock, self.scripts._lock:
            latest = self._capture(project_id, request.output_id)
            latest_record = self._record(project_id)
            if (latest_record.get("revision", 0) != request.expected_revision
                    or any(latest[key] != fresh[key] for key in ("sourceHash", "metadataHash", "scriptHash", "editHash"))):
                raise ScriptRevisionConflict("Source, Script, Timeline or Voice Patch draft changed before save.")
            FileProjectRepository._atomic_write(path, json.dumps(stored, ensure_ascii=False, indent=2))
        return document

    def get(self, project_id: str) -> VoicePatchDocument:
        record = self._record(project_id)
        document = VoicePatchDocument.model_validate({"revision": record.get("revision", 0), "draft": record.get("draft")})
        draft = document.draft
        if draft is None:
            return document
        try:
            capture = self._capture(project_id, draft.output_id)
        except (KeyError, FileNotFoundError, OSError):
            return document.model_copy(update={"draft": draft.model_copy(update={"status": "missing",
                "reason": "Source Voice Output or valid PCM audio is missing."})})
        except ValueError:
            return document.model_copy(update={"draft": draft.model_copy(update={"status": "stale",
                "reason": "Source audio or its Timeline journal changed after this draft was made."})})
        if (capture["sourceHash"] != draft.source_sha256
                or capture["metadataHash"] != draft.source_metadata_sha256
                or capture["script"].revision != draft.script_revision
                or capture["edit"].revision != draft.edit_revision
                or capture["scriptHash"] != record.get("scriptFingerprint")
                or capture["editHash"] != record.get("editFingerprint")):
            return document.model_copy(update={"draft": draft.model_copy(update={"status": "stale",
                "reason": "Source, metadata, Script or Timeline changed after this patch draft was made."})})
        try:
            _path, audio_url = self._preview_path(project_id, draft.output_id, capture["edit"], create=False)
            if capture["edit"].cursor:
                self.previews.validate(_path, capture["edit"].source_sha256, capture["edit"].frames)
            if audio_url != draft.audio_url:
                raise ValueError("Current source preview URL differs from the captured draft.")
            return document.model_copy(update={"draft": draft.model_copy(update={"status": "ready", "reason": None})})
        except (FileNotFoundError, ValueError, OSError, wave.Error):
            return document.model_copy(update={"draft": draft.model_copy(update={"status": "missing",
                "reason": "Current source preview artifact is missing or failed integrity validation."})})

    def validate(self, project_id: str, expected_revision: int) -> dict[str, Any]:
        document = self.get(project_id)
        if document.revision != expected_revision:
            raise ScriptRevisionConflict("Voice Patch draft revision changed; refresh before processing.")
        if document.draft is None or document.draft.status != "ready":
            raise ScriptRevisionConflict("A current, validated Voice Patch draft is required.")
        capture = self._capture(project_id, document.draft.output_id)
        record = self._record(project_id)
        preview_path, _audio_url = self._preview_path(project_id, document.draft.output_id, capture["edit"], create=False)
        if capture["edit"].cursor:
            self.previews.validate(preview_path, capture["edit"].source_sha256, capture["edit"].frames)
        if (capture["sourceHash"] != document.draft.source_sha256
                or capture["metadataHash"] != document.draft.source_metadata_sha256
                or capture["script"].revision != document.draft.script_revision
                or capture["edit"].revision != document.draft.edit_revision
                or capture["scriptHash"] != record.get("scriptFingerprint")
                or capture["editHash"] != record.get("editFingerprint")):
            raise ScriptRevisionConflict("Voice Patch inputs changed; refresh the draft before processing.")
        return {"draft": document.draft, "output": capture["output"], "audio_path": preview_path,
            "script": capture["script"], "edit": capture["edit"]}
