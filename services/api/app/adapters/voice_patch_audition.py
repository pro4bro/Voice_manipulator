from __future__ import annotations

import hashlib
import io
import os
import wave
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4


_RATE = 24000
_WIDTH = 2
_PAD = _RATE // 4
_KINDS = {"source", "variant"}
_VIEWS = {"region", "head", "tail", "full"}


class VoicePatchSourceUnavailable(ValueError):
    pass


class VoicePatchAudition:
    """Build project-owned, integrity-checked crops for accepted Patch audition."""

    def __init__(self, history, outputs, media) -> None:
        self.history = history
        self.outputs = outputs
        self.media = media

    def _root(self, project_id: str) -> Path:
        return Path(self.history.projects.get(project_id).project_path).resolve()

    def _revision(self, project_id: str, output_id: str) -> dict[str, Any]:
        packet = self.history.list(project_id)
        revision = next((item for item in packet["revisions"] if item["output"].id == output_id), None)
        if revision is None:
            raise KeyError(output_id)
        lineage = revision["output"].parameters.get("voicePatch")
        report = revision.get("report")
        if not isinstance(lineage, dict) or not isinstance(report, dict):
            raise KeyError(output_id)
        start, end = report.get("startFrame"), report.get("endFrame")
        replacement_frames = report.get("replacementFrames")
        if (not isinstance(start, int) or not isinstance(end, int) or not isinstance(replacement_frames, int)
                or start < 0 or end <= start or replacement_frames <= 0):
            raise KeyError(output_id)
        return {**revision, "lineage": lineage, "report": report,
            "startFrame": start, "endFrame": end, "replacementFrames": replacement_frames}

    def _expected_source_sha(self, revision: dict[str, Any]) -> str | None:
        lineage = revision["lineage"]
        value = lineage.get("sourcePreviewSha256") or revision["report"].get("sourcePreviewSha256")
        return value if isinstance(value, str) and len(value) == 64 else None

    def _source(self, project_id: str, revision: dict[str, Any]):
        lineage = revision["lineage"]
        parameters = revision["output"].parameters
        # Trained media outputs keep media identity on the immutable output;
        # context outputs also include it in the nested Patch lineage.
        source_kind = lineage.get("sourceKind", parameters.get("sourceKind"))
        try:
            if source_kind == "media":
                asset_id = lineage.get("sourceAssetId", parameters.get("sourceAssetId"))
                if not isinstance(asset_id, str) or not asset_id:
                    raise KeyError("sourceAssetId")
                if lineage.get("sourceOutputId") != asset_id:
                    raise ValueError("Saved media source differs from the accepted Patch association.")
                asset = self.media.get(project_id, asset_id)
                path = self.media.resolve_audio_path(project_id, asset_id).resolve()
                name = asset.name
            else:
                source_id = lineage.get("sourceOutputId")
                if not isinstance(source_id, str) or not source_id:
                    raise KeyError("sourceOutputId")
                source_output = self.outputs.get(project_id, source_id)
                path = self.outputs.audio_path(project_id, source_id).resolve()
                name = source_output.name
            root = self._root(project_id)
            if root not in path.parents:
                raise ValueError("Original Patch source path escapes its project.")
            expected_sha = self._expected_source_sha(revision)
            if expected_sha is None:
                return None, None, "The accepted Patch has no saved original-source checksum.", None, None, None
            if not path.is_file():
                return path, name, "The original source is missing or no longer matches the accepted Patch checksum.", None, None, None
            pcm, frames, actual_sha = self._read_pcm(path)
            if actual_sha != expected_sha:
                return path, name, "The original source is missing or no longer matches the accepted Patch checksum.", None, None, actual_sha
            return path, name, None, pcm, frames, actual_sha
        except ValueError as exc:
            return None, None, str(exc) or "The original source is unavailable.", None, None, None
        except (KeyError, OSError, wave.Error):
            return None, None, "The original source is missing or is not readable PCM audio.", None, None, None

    def _variant(self, project_id: str, revision: dict[str, Any]) -> tuple[Path, bytes, int, str]:
        output = revision["output"]
        path = self.outputs.audio_path(project_id, output.id).resolve()
        root = self._root(project_id)
        if root not in path.parents or not path.is_file():
            raise KeyError(output.id)
        pcm, frames, actual_sha = self._read_pcm(path)
        expected_sha = revision["report"].get("outputAudioSha256")
        if isinstance(expected_sha, str) and actual_sha != expected_sha:
            raise ValueError("Accepted Patch variant changed after its history check.")
        if frames != round(output.duration * _RATE) or len(pcm) != frames * _WIDTH:
            raise ValueError("Accepted Patch variant frame count differs from its saved output metadata.")
        return path, pcm, frames, actual_sha

    @staticmethod
    def _crop_bounds(kind: str, view: str, frames: int, start_target: int,
        source_end_target: int, replacement_frames: int) -> tuple[int, int]:
        end_target = start_target + replacement_frames if kind == "variant" else source_end_target
        if view == "full":
            start, end = 0, frames
        elif view == "region":
            start, end = max(0, start_target - _PAD), min(frames, end_target + _PAD)
        elif view == "head":
            start, end = max(0, start_target - _PAD), min(frames, start_target + _PAD)
        else:
            start, end = max(0, end_target - _PAD), min(frames, end_target + _PAD)
        return start, end

    @staticmethod
    def _read_pcm(path: Path) -> tuple[bytes, int, str]:
        payload = path.read_bytes()
        actual_sha = hashlib.sha256(payload).hexdigest()
        with wave.open(io.BytesIO(payload), "rb") as audio:
            frames = audio.getnframes()
            if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                    != (1, _WIDTH, _RATE, "NONE")):
                raise ValueError("Audition requires PCM16 mono 24 kHz WAV audio.")
            pcm = audio.readframes(frames)
            if frames <= 0 or len(pcm) != frames * _WIDTH:
                raise ValueError("Audition WAV has an incomplete PCM frame sequence.")
            return pcm, frames, actual_sha

    def plan(self, project_id: str, output_id: str) -> dict[str, Any]:
        revision = self._revision(project_id, output_id)
        source_path, source_name, source_reason, _source_pcm, _source_frames, _source_sha = self._source(project_id, revision)
        _variant_path, _variant_pcm, _variant_frames, variant_sha = self._variant(project_id, revision)
        key_material = "|".join((output_id, variant_sha, self._expected_source_sha(revision) or "",
            str(revision["startFrame"]), str(revision["endFrame"])))
        key = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
        base = f"/api/projects/{project_id}/voice-patch/history/{output_id}/audition/audio?key={key}"
        urls = {
            kind: {view: f"{base}&kind={kind}&view={view}" for view in sorted(_VIEWS)}
            for kind in sorted(_KINDS)
        }
        return {
            "outputId": output_id,
            "key": key,
            "sourceAvailable": source_path is not None and source_reason is None,
            "sourceReason": source_reason,
            "sourceName": source_name,
            "voiceName": revision["output"].voice_name,
            "sourceUrl": urls["source"]["full"],
            "variantUrl": urls["variant"]["full"],
            "audioUrls": urls,
            "sourceAudioSha256": self._expected_source_sha(revision),
            "variantAudioSha256": variant_sha,
            "sampleRate": _RATE,
            "target": {"startFrame": revision["startFrame"], "endFrame": revision["endFrame"],
                "replacementFrames": revision["replacementFrames"]},
        }

    def audio(self, project_id: str, output_id: str, kind: Literal["source", "variant"],
        view: Literal["region", "head", "tail", "full"], expected_key: str | None = None) -> tuple[Path, dict[str, Any]]:
        if kind not in _KINDS or view not in _VIEWS:
            raise ValueError("Unknown Voice Patch audition kind or view.")
        revision = self._revision(project_id, output_id)
        variant_path, variant_pcm, variant_frames, variant_sha = self._variant(project_id, revision)
        if kind == "source":
            source_path, _source_name, reason, pcm, frames, actual_sha = self._source(project_id, revision)
            if source_path is None or reason is not None:
                raise VoicePatchSourceUnavailable(reason or "The original source is unavailable.")
            input_path = source_path
            if actual_sha != self._expected_source_sha(revision):
                raise VoicePatchSourceUnavailable("The original source changed after audition planning.")
        else:
            input_path, pcm, frames, actual_sha = variant_path, variant_pcm, variant_frames, variant_sha
        key_material = "|".join((output_id, variant_sha,
            self._expected_source_sha(revision) or "", str(revision["startFrame"]), str(revision["endFrame"])))
        audition_key = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
        if expected_key is not None and expected_key != audition_key:
            raise ValueError("Audition identity changed; refresh the accepted Patch history entry.")
        start, end = self._crop_bounds(kind, view, frames, revision["startFrame"],
            revision["endFrame"], revision["replacementFrames"])
        if end <= start:
            raise ValueError("Audition crop is empty after clamping to audio bounds.")
        cropped_pcm = pcm[start * _WIDTH:end * _WIDTH]
        cache_path = self._cache_path(project_id, actual_sha, start, end)
        if not self._cache_matches(cache_path, cropped_pcm, end - start):
            self._write_cache(cache_path, cropped_pcm)
        return cache_path, {"kind": kind, "view": view, "sourceSha256": actual_sha,
            "sampleRate": _RATE, "startFrame": start, "endFrame": end, "frames": end - start,
            "acceptedOutputId": output_id, "key": audition_key}

    def _cache_path(self, project_id: str, audio_sha: str, start: int, end: int) -> Path:
        root = self._root(project_id)
        cache_root = (root / "cache" / "voice-patch-audition").resolve()
        if root not in cache_root.parents:
            raise ValueError("Audition cache path escapes its project.")
        digest = hashlib.sha256(f"{audio_sha}:{start}:{end}".encode("ascii")).hexdigest()
        path = (cache_root / f"{digest}.wav").resolve()
        if cache_root not in path.parents:
            raise ValueError("Audition cache file escapes its project cache.")
        cache_root.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def _cache_matches(path: Path, expected_pcm: bytes, frames: int) -> bool:
        if not path.is_file():
            return False
        try:
            with wave.open(str(path), "rb") as audio:
                if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                        != (1, _WIDTH, _RATE, "NONE") or audio.getnframes() != frames):
                    return False
                return audio.readframes(frames) == expected_pcm
        except (OSError, EOFError, wave.Error):
            return False

    @staticmethod
    def _write_cache(path: Path, pcm: bytes) -> None:
        temporary = path.with_name(f".{path.stem}.{uuid4().hex}.tmp")
        try:
            with wave.open(str(temporary), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(_WIDTH)
                audio.setframerate(_RATE)
                audio.writeframes(pcm)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
