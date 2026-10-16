from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import shutil
import threading
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import Field, StrictInt

from app.domain.models import DomainModel


_OUTPUT_ID = re.compile(r"^output-[A-Za-z0-9_-]{1,100}$")
_RATE = 24000
_WIDTH = 2
_MAX_FRAMES = 600 * _RATE
_MAX_WORDS = 10000
_PAD = _RATE // 5
_ROUNDING_TOLERANCE = 12


class OutputWordReviewChange(DomainModel):
    index: StrictInt = Field(ge=0)
    start_frame: StrictInt = Field(ge=0)
    end_frame: StrictInt = Field(gt=0)


class OutputWordReviewApplyRequest(DomainModel):
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")
    reviewed: Literal[True]
    changes: list[OutputWordReviewChange] = Field(min_length=1, max_length=_MAX_WORDS)


class OutputWordReviewConflict(ValueError):
    """The accepted word timing changed after the user reviewed it."""


class OutputWordReview:
    """Serve exact, frame-checked excerpts from saved Voice Output audio."""

    _lock = threading.RLock()

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

    def audio(self, project_id: str, output_id: str, index: int, key: str,
        start_frame: int | None = None, end_frame: int | None = None) -> tuple[Path, dict[str, Any]]:
        capture = self._capture(project_id, output_id)
        if key != capture["key"]:
            raise ValueError("Saved word timing or Voice Output audio changed; reload the word review.")
        if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(capture["words"]):
            raise KeyError(index)
        if (start_frame is None) != (end_frame is None):
            raise ValueError("Both proposed word boundary frames must be provided together.")
        word = capture["words"][index]
        target_start = word["startFrame"] if start_frame is None else start_frame
        target_end = word["endFrame"] if end_frame is None else end_frame
        if (isinstance(target_start, bool) or not isinstance(target_start, int)
                or isinstance(target_end, bool) or not isinstance(target_end, int)
                or target_start < word["minFrame"] or target_end > word["maxFrame"]
                or target_end <= target_start):
            raise ValueError("Requested word boundaries must be positive and inside the owning Script segment.")
        if index and capture["words"][index - 1]["endFrame"] > target_start:
            raise ValueError("Requested word start overlaps the preceding saved word.")
        if index + 1 < len(capture["words"]) and target_end > capture["words"][index + 1]["startFrame"]:
            raise ValueError("Requested word end overlaps the following saved word.")
        start = max(word["minFrame"], target_start - _PAD)
        end = min(word["maxFrame"], target_end + _PAD)
        if end <= start:
            raise ValueError("Word review crop is empty after clamping to its owning segment.")
        pcm = capture["pcm"][start * _WIDTH:end * _WIDTH]
        root = self._root(project_id)
        cache_root = self._contained(project_id, root / "cache" / "output-word-review")
        digest = hashlib.sha256(
            f"{capture['key']}:{index}:{target_start}:{target_end}:{start}:{end}".encode("ascii")).hexdigest()
        path = self._contained(project_id, cache_root / f"{digest}.wav")
        cache_root.mkdir(parents=True, exist_ok=True)
        if not self._cache_matches(path, pcm, end - start):
            self._write_cache(path, pcm)
        return path, {"outputId": output_id, "wordIndex": index, "key": capture["key"],
            "audioSha256": capture["audioSha256"], "sampleRate": _RATE,
            "startFrame": start, "endFrame": end, "frames": end - start,
            "targetStartFrame": target_start, "targetEndFrame": target_end}

    def _receipt_path(self, project_id: str, request_hash: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{64}", request_hash):
            raise ValueError("Word review request hash is invalid.")
        root = self._root(project_id)
        return self._contained(project_id,
            root / "jobs" / "output-word-review" / "applied" / f"{request_hash}.json")

    def _valid_receipt(self, project_id: str, receipt: Any, source: dict[str, Any],
        request_hash: str, changes: list[dict[str, int]]) -> dict[str, Any]:
        if (not isinstance(receipt, dict) or receipt.get("version") != 1
                or receipt.get("requestHash") != request_hash
                or receipt.get("sourceOutputId") != source["output"].id
                or receipt.get("sourceKey") != source["key"]
                or receipt.get("sourceAudioSha256") != source["audioSha256"]
                or receipt.get("sourceMetadataSha256") != source["metadataSha256"]
                or receipt.get("changes") != changes):
            raise OutputWordReviewConflict("Existing word review receipt is corrupt or does not match this request.")
        output_id = receipt.get("outputId")
        if not isinstance(output_id, str) or not _OUTPUT_ID.fullmatch(output_id):
            raise OutputWordReviewConflict("Word review receipt has an invalid output id.")
        try:
            output_folder = self._contained(project_id, Path(self.outputs.root(project_id)) / output_id)
            output = self.outputs.get(project_id, output_id)
            output_path = self._contained(project_id, self.outputs.audio_path(project_id, output_id))
            if (not output_folder.is_dir() or not output_path.is_file()
                    or self._sha_file(output_path) != source["audioSha256"]
                    or self._metadata_sha(output) != receipt.get("outputMetadataSha256")
                    or receipt.get("outputAudioSha256") != source["audioSha256"]):
                raise OutputWordReviewConflict("Applied word review output failed WAV or metadata integrity checks.")
            lineage = output.parameters.get("wordTimingReview")
            if (not isinstance(lineage, dict) or lineage.get("version") != 1
                    or lineage.get("sourceOutputId") != source["output"].id
                    or lineage.get("sourceAudioSha256") != source["audioSha256"]
                    or lineage.get("sourceMetadataSha256") != source["metadataSha256"]
                    or lineage.get("requestHash") != request_hash
                    or lineage.get("indexes") != [item["index"] for item in changes]
                    or lineage != receipt.get("lineage")):
                raise OutputWordReviewConflict("Applied output lineage does not match its word review receipt.")
        except (KeyError, OSError, ValueError) as exc:
            if isinstance(exc, OutputWordReviewConflict):
                raise
            raise OutputWordReviewConflict("Applied word review output is missing or invalid.") from exc
        return {"output": output, "audioUrl": f"/api/projects/{project_id}/voice-outputs/{output.id}/audio",
            "sourceOutputId": source["output"].id}

    def save(self, project_id: str, output_id: str,
        request: OutputWordReviewApplyRequest | dict[str, Any]) -> dict[str, Any]:
        if isinstance(request, dict):
            request = OutputWordReviewApplyRequest.model_validate(request)
        capture = self._capture(project_id, output_id)
        if request.expected_key != capture["key"]:
            raise OutputWordReviewConflict("Voice Output changed; reload the word review before saving.")
        changes = sorted((item.model_dump(by_alias=True) for item in request.changes), key=lambda item: item["index"])
        indexes = [item["index"] for item in changes]
        if len(indexes) != len(set(indexes)):
            raise ValueError("Word review indexes must be unique.")
        for item in changes:
            index = item["index"]
            if index >= len(capture["words"]):
                raise ValueError(f"Word review index {index} is outside the saved word list.")
            word = capture["words"][index]
            if (item["startFrame"] < word["minFrame"] or item["endFrame"] > word["maxFrame"]
                    or item["endFrame"] <= item["startFrame"]):
                raise ValueError(f"Word review interval {index} is outside its owning Script segment.")
        timing = [(item["startFrame"], item["endFrame"]) for item in capture["words"]]
        for item in changes:
            timing[item["index"]] = (item["startFrame"], item["endFrame"])
        if any(right[0] < left[1] for left, right in zip(timing, timing[1:])):
            raise ValueError("Reviewed word intervals must not overlap any saved neighboring word.")

        request_hash = hashlib.sha256(json.dumps({"version": 1, "sourceKey": capture["key"],
            "changes": changes}, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        receipt_path = self._receipt_path(project_id, request_hash)
        with self._lock:
            current = self._capture(project_id, output_id)
            if current["key"] != capture["key"]:
                raise OutputWordReviewConflict("Voice Output changed while saving the word review.")
            if receipt_path.exists():
                try:
                    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
                except (OSError, ValueError) as exc:
                    raise OutputWordReviewConflict("Word review receipt is corrupt; refusing duplicate Save.") from exc
                return self._valid_receipt(project_id, receipt, current, request_hash, changes)

            words = [dict(word) for word in current["output"].words]
            reviewed_at = datetime.now(timezone.utc).isoformat()
            for item in changes:
                word = words[item["index"]]
                word["timingReview"] = {"originalStart": word["start"], "originalEnd": word["end"],
                    "originalTimingTrusted": word.get("timingTrusted", False),
                    "originalTimingSource": word.get("timingSource")}
                word["start"] = item["startFrame"] / _RATE
                word["end"] = item["endFrame"] / _RATE
                word["timingTrusted"] = True
                word["timingSource"] = "user-reviewed"
            untrusted = sum(word.get("timingTrusted") is not True for word in words)
            ratio = untrusted / len(words)
            quality = "source" if untrusted == 0 else "partial" if ratio < 0.05 else "needs-alignment"
            lineage = {"version": 1, "sourceOutputId": output_id,
                "sourceAudioSha256": current["audioSha256"],
                "sourceMetadataSha256": current["metadataSha256"],
                "requestHash": request_hash, "indexes": indexes, "reviewedAt": reviewed_at}
            parameters = dict(current["output"].parameters)
            parameters["wordTimingReview"] = lineage
            output_id_new = None
            owned_output_id = None
            try:
                output_id_new, output_audio = self.outputs.reserve(project_id)
                if not isinstance(output_id_new, str) or not _OUTPUT_ID.fullmatch(output_id_new):
                    raise ValueError("Voice Outputs returned an invalid reserved output id.")
                output_folder = self._contained(project_id, Path(self.outputs.root(project_id)) / output_id_new)
                output_audio = self._contained(project_id, output_audio)
                if output_audio.parent != output_folder or not output_folder.is_dir():
                    raise ValueError("Reserved Voice Output paths do not match the contained project output folder.")
                owned_output_id = output_id_new
                shutil.copyfile(current["audioPath"], output_audio)
                if self._sha_file(output_audio) != current["audioSha256"]:
                    raise ValueError("Word review output WAV is not byte-identical to its source.")
                root = self._root(project_id)
                candidate = current["output"].model_copy(update={
                    "id": output_id_new,
                    "name": f"Word Review - {current['output'].name}",
                    "audio_path": output_audio.relative_to(root).as_posix(),
                    "parameters": parameters,
                    "words": words,
                    "word_timing_quality": quality,
                    "word_timing_note": "Selected word boundaries were explicitly reviewed by a person against saved audio. Unselected word timing retains its prior trust state.",
                    "created_at": datetime.now(timezone.utc),
                })
                if self._capture(project_id, output_id)["key"] != current["key"]:
                    raise OutputWordReviewConflict("Source Voice Output changed before the reviewed output could be saved.")
                self.outputs.save(project_id, candidate)
                saved = self.outputs.get(project_id, output_id_new)
                output_audio_sha = self._sha_file(self._contained(project_id,
                    self.outputs.audio_path(project_id, output_id_new)))
                output_metadata_sha = self._metadata_sha(saved)
                if output_audio_sha != current["audioSha256"] or output_metadata_sha != self._metadata_sha(candidate):
                    raise ValueError("Saved word review output failed post-save integrity validation.")
                if self._capture(project_id, output_id)["key"] != current["key"]:
                    raise OutputWordReviewConflict("Source Voice Output changed before the word review receipt could be recorded.")
                receipt = {"version": 1, "requestHash": request_hash, "sourceKey": current["key"],
                    "sourceOutputId": output_id, "sourceAudioSha256": current["audioSha256"],
                    "sourceMetadataSha256": current["metadataSha256"], "changes": changes,
                    "outputId": output_id_new, "outputAudioSha256": output_audio_sha,
                    "outputMetadataSha256": output_metadata_sha, "lineage": lineage,
                    "createdAt": reviewed_at}
                receipt_path.parent.mkdir(parents=True, exist_ok=True)
                temporary = receipt_path.with_name(f".{receipt_path.name}.{uuid4().hex}.tmp")
                try:
                    with temporary.open("x", encoding="utf-8") as stream:
                        stream.write(json.dumps(receipt, ensure_ascii=False, indent=2))
                        stream.flush()
                        os.fsync(stream.fileno())
                    try:
                        os.link(temporary, receipt_path)
                    except FileExistsError:
                        existing = json.loads(receipt_path.read_text(encoding="utf-8"))
                        self._valid_receipt(project_id, existing, current, request_hash, changes)
                        if owned_output_id is not None:
                            self.outputs.discard(project_id, owned_output_id)
                            owned_output_id = None
                        return self._valid_receipt(project_id, existing, current, request_hash, changes)
                finally:
                    temporary.unlink(missing_ok=True)
                return self._valid_receipt(project_id, receipt, current, request_hash, changes)
            except Exception:
                if owned_output_id is not None and not receipt_path.exists():
                    self.outputs.discard(project_id, owned_output_id)
                raise

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
