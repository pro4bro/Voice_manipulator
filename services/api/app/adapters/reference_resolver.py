from __future__ import annotations

import audioop
import hashlib
import json
import math
import subprocess
import tempfile
import wave
from pathlib import Path

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.omnivoice_generator import file_digest
from app.domain.voice_script_document import effective_settings


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


class ReferenceResolver:
    """Resolve each property independently. Measurements never imply conditioning."""

    def __init__(self, bindings, ffmpeg_path: str | None = None):
        self.bindings, self.ffmpeg_path = bindings, ffmpeg_path

    def features(self, root: Path, path: Path, source) -> dict:
        key = digest(["pcm-features-v1", source.audio_sha256, source.start, source.end])
        cache = root / "cache" / "reference-features" / f"{key}.json"
        if cache.is_file():
            try:
                result = json.loads(cache.read_text(encoding="utf-8"))
                if result["key"] == key and result["duration"] > 0:
                    return result
            except (ValueError, KeyError, TypeError):
                pass
        try:
            result = self._measure(path, source.start, source.end)
        except (wave.Error, EOFError):
            if not self.ffmpeg_path:
                raise ValueError("Định dạng cần bộ giải mã audio; chưa có FFmpeg.")
            cache.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=cache.parent) as folder:
                decoded = Path(folder) / "analysis.wav"
                subprocess.run([self.ffmpeg_path, "-v", "error", "-nostdin", "-i", str(path), "-ss", str(source.start), "-t", str(source.end - source.start), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(decoded)], check=True, capture_output=True, timeout=60)
                result = self._measure(decoded, 0, source.end - source.start)
        if file_digest(path) != source.audio_sha256:
            raise ValueError("Audio source đã đổi trong lúc đo; chưa lưu feature cache.")
        result["key"] = key
        FileProjectRepository._atomic_write(cache, json.dumps(result))
        return result

    @staticmethod
    def _measure(path: Path, start: float, end: float) -> dict:
        with wave.open(str(path), "rb") as audio:
            rate, width, channels = audio.getframerate(), audio.getsampwidth(), audio.getnchannels()
            first, last = round(start * rate), round(end * rate)
            if last > audio.getnframes() + 1 or first >= last:
                raise ValueError("Reference span vượt quá audio thực.")
            audio.setpos(first)
            remaining, count, squares, peak = last - first, 0, 0.0, 0
            while remaining > 0:
                raw = audio.readframes(min(remaining, rate))
                if not raw: break
                frames = len(raw) // (width * channels)
                remaining -= frames
                if width == 1: raw = audioop.bias(raw, 1, -128)
                normalized = audioop.lin2lin(raw, width, 2) if width != 2 else raw
                samples = frames * channels
                squares += audioop.rms(normalized, 2) ** 2 * samples
                peak = max(peak, audioop.max(normalized, 2))
                count += samples
            if remaining > 1 or not count: raise ValueError("Audio reference thiếu frames.")
        rms = math.sqrt(squares / count)
        return {"duration": count / channels / rate, "sampleRate": rate, "channels": channels,
                "rmsDbfs": 20 * math.log10(rms / 32768) if rms else None,
                "peakDbfs": 20 * math.log10(peak / 32768) if peak else None,
                "hasFullScaleSamples": peak >= 32767}

    def resolve(self, project_id: str, binding_id: str, expected_revision: int) -> dict:
        store = self.bindings
        document = store.get(project_id)
        if document.revision != expected_revision:
            raise ScriptRevisionConflict("Reference đã đổi. Làm mới trước khi phân tích.")
        binding = next((item for item in document.bindings if item.id == binding_id), None)
        if binding is None: raise KeyError(binding_id)
        root = Path(store.projects.get(project_id).project_path)
        script = store.scripts.get(project_id)
        row_ids = binding.target.row_ids
        if binding.scope.kind == "voice-output" and not row_ids:
            output = store.outputs.get(project_id, binding.scope.id)
            row_ids = [segment.row_id for segment in output.segments if segment.end > binding.target.start and segment.start < binding.target.end]
        rows = [row for row in script.rows if row.id in row_ids]
        identities = [{"rowId": row.id, "voiceId": row.voice_id, "speakerProfileId": row.speaker_profile_id} for row in rows]
        source_results = []
        for source in binding.sources:
            item = source.model_dump(by_alias=True)
            try:
                asset = store.media.get(project_id, source.asset_id)
                path = store.media.resolve_audio_path(project_id, source.asset_id)
                if asset.deleted_at or asset.disabled or not asset.reference_selected:
                    raise ValueError("Footage thiếu, bị tắt hoặc không còn là Reference.")
                if not path.is_file() or file_digest(path) != source.audio_sha256:
                    raise ValueError("Audio source đã thay đổi hoặc không còn tồn tại.")
                item.update(features=self.features(root, path, source), state="measured")
            except (KeyError, OSError, ValueError, subprocess.SubprocessError) as exc:
                item.update(state="unavailable", reason=str(exc))
            source_results.append(item)
        units = []
        for row in rows or [None]:
            settings = effective_settings(script, row) if row else {}
            properties = {}
            for property_name, setting in [("timing", "duration"), ("volume", "gainDb"), ("emotion", "emotion"), ("intonation", "mood"), ("shout", "delivery"), ("whisper", "delivery")]:
                candidates = [item for item in source_results if property_name in item["properties"] and item["strength"] > 0]
                if not candidates: continue
                result = {"state": "unsupported", "reason": "Chưa có processor đã kiểm chứng cho đặc tính này.", "applied": False}
                if binding.status == "stale":
                    result.update(state="stale", reason="Vùng đích/reference đã thay đổi. Gán lại trước khi áp dụng.")
                elif setting in settings.get("locked", []) or settings.get(setting) is not None:
                    result.update(state="locked", reason="Ưu tiên cấu hình người dùng.", value=settings.get(setting))
                else:
                    priority = max(item["priority"] for item in candidates)
                    chosen = [item for item in candidates if item["priority"] == priority]
                    distinct = {(item["assetId"], item["start"], item["end"], item["strength"]) for item in chosen}
                    if len(distinct) > 1:
                        result.update(state="conflict", reason="Nhiều source ngang ưu tiên. Chọn primary bằng priority; chưa hỗ trợ blend.")
                    else:
                        source = chosen[0]
                        result["source"] = source
                        if source["state"] == "unavailable": result.update(state="unavailable", reason=source["reason"])
                        elif property_name in ["timing", "volume"]:
                            result.update(state="measured", reason="Đã đo source; chưa áp dụng vào audio.")
                properties[property_name] = result
            if all(properties.get(key, {}).get("state") not in [None, "locked"] for key in ["shout", "whisper"]):
                for key in ["shout", "whisper"]:
                    properties[key].update(state="conflict", reason="Hét và thì thầm cùng vùng cần chọn một cách diễn.")
            units.append({"rowId": row.id if row else None, "settings": settings, "properties": properties})
        result = {"version": 1, "bindingId": binding.id, "target": binding.target.model_dump(by_alias=True),
                  "scope": binding.scope.model_dump(), "identity": identities, "units": units, "sources": source_results,
                  "applied": False, "randomValues": False, "randomTimes": False}
        # A resolution key depends only on its units and inputs, not unrelated assignments.
        result["key"] = digest(result)
        after = store.get(project_id)
        after_binding = next((item for item in after.bindings if item.id == binding.id), None)
        if after.revision != expected_revision or after_binding is None or (after_binding.status, after_binding.warnings) != (binding.status, binding.warnings) or store.scripts.get(project_id).revision != script.revision:
            raise ScriptRevisionConflict("Source hoặc Script đã đổi trong lúc phân tích. Thử lại.")
        FileProjectRepository._atomic_write(root / "scripts" / "reference-resolutions" / f"{binding.id}.json", json.dumps(result, ensure_ascii=False, indent=2))
        return result
