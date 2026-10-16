from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import wave
from pathlib import Path
from typing import Any
from uuid import uuid4


_OUTPUT_ID = re.compile(r"^output-[A-Za-z0-9_-]{1,100}$")
_RATE = 24000
_WIDTH = 2
_MAX_FRAMES = 600 * _RATE
_MAX_WORDS = 10000
_PAD = _RATE // 5
_ROUNDING_TOLERANCE = 12


class OutputWordReview:
    """Serve exact, frame-checked excerpts from saved Voice Output audio."""

    def __init__(self, projects, outputs) -> None:
        self.projects, self.outputs = projects, outputs

    def _root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path).resolve()

    def _contained(self, project_id: str, path: Path) -> Path:
        root, resolved = self._root(project_id), path.resolve()
        if resolved == root or root not in resolved.parents:
            raise ValueError("Word review path escapes its project.")
        return resolved

    @staticmethod
    def _sha_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _metadata_sha(output) -> str:
        metadata = output.model_dump(mode="json", by_alias=True, exclude={"audio_available"})
        payload = json.dumps(metadata, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _capture(self, project_id: str, output_id: str) -> dict[str, Any]:
        if not isinstance(output_id, str) or not _OUTPUT_ID.fullmatch(output_id):
            raise KeyError(output_id)
        output_folder = self._contained(project_id, Path(self.outputs.root(project_id)) / output_id)
        output = self.outputs.get(project_id, output_id)
        if output.id != output_id or not output_folder.is_dir():
            raise ValueError("Voice Output id differs from its saved project record.")
        audio_path = self._contained(project_id, self.outputs.audio_path(project_id, output_id))
        if not audio_path.is_file() or audio_path.stat().st_size <= 0:
            raise ValueError("Saved Voice Output audio is missing or empty.")
        payload = audio_path.read_bytes()
        audio_sha = hashlib.sha256(payload).hexdigest()
        try:
            with wave.open(io.BytesIO(payload), "rb") as wav:
                frames = wav.getnframes()
                if ((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype())
                        != (1, _WIDTH, _RATE, "NONE")):
                    raise ValueError("Word review requires PCM16 mono 24 kHz Voice Output audio.")
                pcm = wav.readframes(frames)
                if frames <= 0 or frames > _MAX_FRAMES or len(pcm) != frames * _WIDTH:
                    raise ValueError("Voice Output audio is empty, incomplete, or longer than 600 seconds.")
        except (wave.Error, EOFError) as exc:
            raise ValueError("Saved Voice Output audio is not a readable PCM WAV.") from exc
        if (not math.isfinite(float(output.duration))
                or abs(round(float(output.duration) * _RATE) - frames) > _ROUNDING_TOLERANCE):
            raise ValueError("Voice Output duration metadata differs from its saved WAV frames.")
        if len(output.words) > _MAX_WORDS:
            raise ValueError("Voice Output exceeds the 10000 word review limit.")
        if not output.words:
            raise ValueError("Voice Output has no saved word timing to review.")

        segments: list[tuple[int, int]] = []
        for segment in output.segments:
            start, end = float(segment.start), float(segment.end)
            if not math.isfinite(start) or not math.isfinite(end):
                raise ValueError("Voice Output has non-finite Script segment bounds.")
            start_frame, end_frame = round(start * _RATE), round(end * _RATE)
            if (start_frame < 0 or end_frame <= start_frame or start_frame > frames
                    or end_frame > frames + _ROUNDING_TOLERANCE):
                raise ValueError("Voice Output has invalid Script segment bounds.")
            segments.append((min(start_frame, frames), min(end_frame, frames)))
        if not segments:
            raise ValueError("Voice Output has no saved Script segments for word ownership.")

        words = []
        previous_end = -1
        for index, word in enumerate(output.words):
            if not isinstance(word, dict):
                raise ValueError(f"Saved word {index} is malformed.")
            try:
                start, end = float(word["start"]), float(word["end"])
                segment_index = word["segmentIndex"]
            except (KeyError, TypeError, ValueError, OverflowError) as exc:
                raise ValueError(f"Saved word {index} has invalid timing or ownership.") from exc
            if (not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start
                    or isinstance(segment_index, bool) or not isinstance(segment_index, int)
                    or not 0 <= segment_index < len(segments)):
                raise ValueError(f"Saved word {index} has invalid timing or segment ownership.")
            start_frame, end_frame = round(start * _RATE), round(end * _RATE)
            segment_start, segment_end = segments[segment_index]
            if (end_frame <= start_frame or start_frame < previous_end or end_frame > frames
                    or start_frame < segment_start - _ROUNDING_TOLERANCE
                    or end_frame > segment_end + _ROUNDING_TOLERANCE):
                raise ValueError(f"Saved word {index} overlaps or falls outside its owning segment/audio.")
            previous_end = end_frame
            text = word.get("word") or word.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"Saved word {index} has no display text.")
            trusted = word.get("timingTrusted", False)
            if not isinstance(trusted, bool):
                raise ValueError(f"Saved word {index} has an invalid timing trust flag.")
            timing_source = word.get("timingSource")
            if timing_source is not None and not isinstance(timing_source, str):
                raise ValueError(f"Saved word {index} has invalid timing provenance.")
            words.append({
                "index": index,
                "text": text,
                "startFrame": start_frame,
                "endFrame": end_frame,
                "segmentIndex": segment_index,
                "minFrame": segment_start,
                "maxFrame": segment_end,
                "timingTrusted": trusted,
                "timingSource": timing_source,
            })

        metadata_sha = self._metadata_sha(output)
        key_material = {"policy": 1, "outputId": output_id, "audioSha256": audio_sha,
            "metadataSha256": metadata_sha, "sampleRate": _RATE, "frames": frames}
        key = hashlib.sha256(json.dumps(key_material, sort_keys=True, separators=(",", ":"))
            .encode("utf-8")).hexdigest()
        return {"output": output, "audioPath": audio_path, "pcm": pcm, "audioSha256": audio_sha,
            "metadataSha256": metadata_sha, "key": key, "frames": frames, "words": words}

    def plan(self, project_id: str, output_id: str) -> dict[str, Any]:
        capture = self._capture(project_id, output_id)
        trusted = sum(word["timingTrusted"] for word in capture["words"])
        return {"key": capture["key"], "audioSha256": capture["audioSha256"], "sampleRate": _RATE,
            "frames": capture["frames"], "words": capture["words"], "trustedWords": trusted,
            "totalWords": len(capture["words"])}

    def audio(self, project_id: str, output_id: str, index: int, key: str) -> tuple[Path, dict[str, Any]]:
        capture = self._capture(project_id, output_id)
        if key != capture["key"]:
            raise ValueError("Saved word timing or Voice Output audio changed; reload the word review.")
        if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(capture["words"]):
            raise KeyError(index)
        word = capture["words"][index]
        start = max(word["minFrame"], word["startFrame"] - _PAD)
        end = min(word["maxFrame"], word["endFrame"] + _PAD)
        if end <= start:
            raise ValueError("Word review crop is empty after clamping to its owning segment.")
        pcm = capture["pcm"][start * _WIDTH:end * _WIDTH]
        root = self._root(project_id)
        cache_root = self._contained(project_id, root / "cache" / "output-word-review")
        digest = hashlib.sha256(f"{capture['key']}:{index}:{start}:{end}".encode("ascii")).hexdigest()
        path = self._contained(project_id, cache_root / f"{digest}.wav")
        cache_root.mkdir(parents=True, exist_ok=True)
        if not self._cache_matches(path, pcm, end - start):
            self._write_cache(path, pcm)
        return path, {"outputId": output_id, "wordIndex": index, "key": capture["key"],
            "audioSha256": capture["audioSha256"], "sampleRate": _RATE,
            "startFrame": start, "endFrame": end, "frames": end - start}

    @staticmethod
    def _cache_matches(path: Path, expected_pcm: bytes, frames: int) -> bool:
        try:
            with wave.open(str(path), "rb") as wav:
                if ((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype())
                        != (1, _WIDTH, _RATE, "NONE") or wav.getnframes() != frames):
                    return False
                return wav.readframes(frames) == expected_pcm
        except (OSError, EOFError, wave.Error):
            return False

    @staticmethod
    def _write_cache(path: Path, pcm: bytes) -> None:
        temporary = path.with_name(f".{path.stem}.{uuid4().hex}.tmp")
        try:
            with wave.open(str(temporary), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(_WIDTH)
                wav.setframerate(_RATE)
                wav.writeframes(pcm)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
