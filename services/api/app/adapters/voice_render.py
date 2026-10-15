from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import uuid
import wave
from pathlib import Path
from typing import Any

from app.adapters.audio_waveform_envelope import AudioWaveformEnvelope
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_edit_preview import VoiceEditPreview
from app.adapters.voice_loudness_audio import render_loudness


class VoiceRenderService:
    """Render and validate project-owned, non-destructive output loudness."""

    POLICY_VERSION = 1
    _lock = threading.RLock()

    def __init__(self, edits, scripts):
        self.edits = edits
        self.scripts = scripts
        self.outputs = edits.outputs
        self.previews = VoiceEditPreview(edits)
        self.envelopes = AudioWaveformEnvelope()

    def _snapshot(self, project_id: str, output_id: str, script_revision: int | None = None, edit_revision: int | None = None):
        with self.edits._lock, self.scripts._lock:
            script = self.scripts.get(project_id)
            edit = self.edits.get(project_id, output_id)
            output = self.outputs.get(project_id, output_id)
            if script_revision is not None and script.revision != script_revision:
                raise ScriptRevisionConflict("Script đã thay đổi; tải lại trước khi render.")
            if edit_revision is not None and edit.revision != edit_revision:
                raise ScriptRevisionConflict("Timeline đã thay đổi; tải lại trước khi render.")
            return script, edit, output

    @staticmethod
    def _gain_plan(script, edit, output) -> tuple[float, list[dict[str, Any]]]:
        rows = {row.id: row for row in script.rows}
        segments_by_id = {segment.id: segment for segment in script.segments}
        clip_gain = float(script.settings.gain_db or 0)
        segments = sorted(output.segments, key=lambda item: (item.start, item.end, item.row_id))
        regions: list[dict[str, Any]] = []
        prior_end = 0
        for segment in segments:
            row = rows.get(segment.row_id)
            if row is None or row.text != segment.text or row.voice_id != segment.voice_id:
                raise ScriptRevisionConflict("Output không còn khớp text/voice của Script hiện tại.")
            segment_settings = segments_by_id.get(row.segment_id).settings if row.segment_id in segments_by_id else None
            if "gainDb" in script.settings.locked:
                region_gain = 0.0
            elif segment_settings is not None and "gainDb" in segment_settings.locked:
                region_gain = float(segment_settings.gain_db or 0)
            elif row.settings.gain_db is not None:
                region_gain = float(row.settings.gain_db)
            elif segment_settings is not None and segment_settings.gain_db is not None:
                region_gain = float(segment_settings.gain_db)
            else:
                region_gain = 0.0
            if not -60 <= region_gain <= 12:
                raise ValueError("Chênh lệch gain của một row vượt khoảng render hỗ trợ (-60..12 dB).")
            start = round(edit.map_seconds(segment.start) * edit.sample_rate)
            end = round(edit.map_seconds(segment.end) * edit.sample_rate)
            if start < 0 or end <= start or end > edit.frames:
                raise ValueError("Segment output nằm ngoài audio đã chỉnh.")
            if regions and start < prior_end:
                raise ValueError("Segment output bị chồng lấn; gain theo row không thể render an toàn.")
            regions.append({"rowId": segment.row_id, "startFrame": start, "endFrame": end, "gainDb": region_gain})
            prior_end = end
        return clip_gain, regions

    def _base_audio(self, project_id: str, output_id: str, edit, *, create_preview: bool) -> tuple[Path, str]:
        original = self.outputs.audio_path(project_id, output_id)
        if not edit.cursor:
            return original, _file_hash(original)
        payload = json.dumps({
            "source": edit.source_sha256,
            "operations": [operation.model_dump(by_alias=True) for operation in edit.active],
            "policy": 1,
        }, sort_keys=True)
        key = hashlib.sha256(payload.encode()).hexdigest()[:32]
        path = self.previews.path(project_id, output_id, key)
        if create_preview:
            self.previews.render(project_id, output_id, edit)
        report = self.previews.validate(path, edit.source_sha256, edit.frames)
        if not isinstance(report.get("audioSha256"), str):
            raise ValueError("Stretch preview không có checksum hợp lệ.")
        return path, report["audioSha256"]

    def _plan(self, project_id: str, output_id: str, script, edit, output, *, create_preview: bool):
        clip_gain, regions = self._gain_plan(script, edit, output)
        base, base_hash = self._base_audio(project_id, output_id, edit, create_preview=create_preview)
        key_material = {
            "version": self.POLICY_VERSION,
            "outputId": output_id,
            "sourceSha256": edit.source_sha256,
            "baseAudioSha256": base_hash,
            "operations": [operation.model_dump(by_alias=True) for operation in edit.active],
            "regions": regions,
            "globalGainDb": clip_gain,
            "scriptRevision": script.revision,
            "editRevision": edit.revision,
        }
        key = hashlib.sha256(json.dumps(key_material, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:32]
        folder = self.outputs.audio_path(project_id, output_id).parent / "rendered"
        return {"script": script, "edit": edit, "output": output, "base": base, "baseHash": base_hash,
                "regions": regions, "globalGainDb": clip_gain, "keyMaterial": key_material, "key": key,
                "folder": folder, "path": folder / f"{key}.wav", "reportPath": folder / f"{key}.json",
                "latestPath": folder / "latest-render.json"}

    @staticmethod
    def _validate(path: Path, report_path: Path, plan: dict[str, Any]) -> dict[str, Any]:
        metadata = json.loads(report_path.read_text(encoding="utf-8"))
        if (metadata.get("version") != 1 or metadata.get("cacheKey") != plan["key"]
                or metadata.get("keyMaterial") != plan["keyMaterial"]
                or metadata.get("baseAudioSha256") != plan["baseHash"]
                or metadata.get("outputId") != plan["output"].id
                or not isinstance(metadata.get("renderReport"), dict)):
            raise ValueError("Render cache metadata does not match request.")
        if metadata.get("outputSha256") != _file_hash(path):
            raise ValueError("Render cache checksum does not match audio.")
        with wave.open(str(path), "rb") as audio:
            frames = audio.getnframes()
            raw = audio.readframes(frames)
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 24000, "NONE"):
                raise ValueError("Render cache is not PCM16 mono 24 kHz.")
            if len(raw) != frames * 2 or frames != plan["edit"].frames or frames != metadata.get("frames"):
                raise ValueError("Render cache frame count does not match source timeline.")
        return metadata

    def _current_plan(self, project_id: str, output_id: str, plan: dict[str, Any]) -> None:
        with self.edits._lock, self.scripts._lock:
            script = self.scripts.get(project_id)
            edit = self.edits.get(project_id, output_id)
            output = self.outputs.get(project_id, output_id)
            if (script != plan["script"] or edit != plan["edit"] or output != plan["output"]):
                raise ScriptRevisionConflict("Script/Timeline/audio đã đổi trong lúc render; artifact không được áp dụng.")
            if self._gain_plan(script, edit, output) != (plan["globalGainDb"], plan["regions"]):
                raise ScriptRevisionConflict("Gain mapping đã đổi trong lúc render; artifact không được áp dụng.")

    def render(self, project_id: str, output_id: str, expected_script_revision: int, expected_edit_revision: int) -> dict[str, Any]:
        script, edit, output = self._snapshot(project_id, output_id, expected_script_revision, expected_edit_revision)
        plan = self._plan(project_id, output_id, script, edit, output, create_preview=True)
        plan["folder"].mkdir(parents=True, exist_ok=True)
        with self._lock:
            try:
                metadata = self._validate(plan["path"], plan["reportPath"], plan)
            except (OSError, ValueError, wave.Error, EOFError, TypeError):
                temp = plan["folder"] / f".{plan['key']}.{uuid.uuid4().hex}.wav"
                try:
                    render_report = render_loudness(plan["base"], temp, plan["regions"], plan["globalGainDb"])
                    metadata = {"version": 1, "cacheKey": plan["key"], "keyMaterial": plan["keyMaterial"],
                                "outputId": output_id, "sourceSha256": edit.source_sha256,
                                "baseAudioSha256": plan["baseHash"], "outputSha256": _file_hash(temp),
                                "frames": edit.frames, "scriptRevision": script.revision,
                                "editRevision": edit.revision, "renderReport": render_report}
                    temp_report = plan["folder"] / f".{plan['key']}.{uuid.uuid4().hex}.json"
                    FileProjectRepository._atomic_write(temp_report, json.dumps(metadata, ensure_ascii=False))
                    self._validate(temp, temp_report, plan)
                    self._current_plan(project_id, output_id, plan)
                    # The revision guard and publication share the store locks.
                    with self.edits._lock, self.scripts._lock:
                        self._current_plan(project_id, output_id, plan)
                        os.replace(temp, plan["path"])
                        os.replace(temp_report, plan["reportPath"])
                finally:
                    temp.unlink(missing_ok=True)
                    if "temp_report" in locals():
                        temp_report.unlink(missing_ok=True)
                metadata = self._validate(plan["path"], plan["reportPath"], plan)
            self._current_plan(project_id, output_id, plan)
            with self.edits._lock, self.scripts._lock:
                self._current_plan(project_id, output_id, plan)
                pointer = {"version": 1, "cacheKey": plan["key"], "sourceSha256": edit.source_sha256,
                           "scriptRevision": script.revision, "editRevision": edit.revision}
                FileProjectRepository._atomic_write(plan["latestPath"], json.dumps(pointer, separators=(",", ":")))
        return self._packet(project_id, output_id, plan, metadata)

    def latest(self, project_id: str, output_id: str) -> dict[str, Any]:
        # GET reports only a previously applied render. It never creates a
        # stretch preview or audio artifact as a side effect.
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", output_id):
            raise KeyError(output_id)
        script, edit, output = self._snapshot(project_id, output_id)
        folder = self.outputs.audio_path(project_id, output_id).parent / "rendered"
        pointer = json.loads((folder / "latest-render.json").read_text(encoding="utf-8"))
        if pointer.get("version") != 1 or not re.fullmatch(r"[a-f0-9]{32}", str(pointer.get("cacheKey", ""))):
            raise KeyError("render")
        if (pointer.get("sourceSha256") != edit.source_sha256 or pointer.get("scriptRevision") != script.revision
                or pointer.get("editRevision") != edit.revision):
            raise KeyError("render")
        plan = self._plan(project_id, output_id, script, edit, output, create_preview=False)
        if pointer["cacheKey"] != plan["key"]:
            raise KeyError("render")
        metadata = self._validate(plan["path"], plan["reportPath"], plan)
        return self._packet(project_id, output_id, plan, metadata)

    def _packet(self, project_id: str, output_id: str, plan: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
        return {"audioUrl": f"/api/projects/{project_id}/voice-outputs/{output_id}/rendered/{plan['key']}/audio",
                "output": self.edits.mapped_output(project_id, output_id, plan["edit"]).model_dump(mode="json", by_alias=True),
                "report": metadata["renderReport"], "sourceFrameCount": plan["edit"].frames,
                "scriptRevision": plan["script"].revision, "editRevision": plan["edit"].revision,
                "cacheKey": plan["key"]}

    def audio_path(self, project_id: str, output_id: str, key: str) -> Path:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", output_id) or not re.fullmatch(r"[a-f0-9]{32}", key):
            raise KeyError(key)
        self.edits.get(project_id, output_id)
        path = self.outputs.audio_path(project_id, output_id).parent / "rendered" / f"{key}.wav"
        report = path.with_suffix(".json")
        if not path.is_file():
            raise KeyError(key)
        # Identity/hash validation uses only the immutable report fields here;
        # plan-specific validation is done by GET /render.
        metadata = json.loads(report.read_text(encoding="utf-8"))
        if metadata.get("cacheKey") != key or metadata.get("outputId") != output_id or metadata.get("outputSha256") != _file_hash(path):
            raise ValueError("Render artifact checksum does not match metadata.")
        with wave.open(str(path), "rb") as audio:
            frames = audio.getnframes()
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 24000, "NONE") or len(audio.readframes(frames)) != frames * 2 or frames != metadata.get("frames"):
                raise ValueError("Render artifact is not a valid PCM frame sequence.")
        return path

    def waveform(self, project_id: str, output_id: str, key: str, start: float | None, end: float | None, points: int | None):
        path = self.audio_path(project_id, output_id, key)
        cache = path.with_suffix(".peaks.json")
        if start is None and end is None and points is None:
            return self.envelopes.read(path, cache)
        if start is None or end is None or points is None:
            raise ValueError("Thiếu khoảng waveform.")
        return self.envelopes.read_detail(path, cache, start, end, points)


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
