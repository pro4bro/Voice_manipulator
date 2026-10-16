from __future__ import annotations

import hashlib
import json
import math
import os
import re
import struct
import threading
import wave
from pathlib import Path
from typing import Any, Literal

from pydantic import Field

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.project_dataset_compiler import (
    BOUNDARY_GAP_SECONDS,
    OVERLAP_GAP_SECONDS,
    OVERLAP_WORD_SECONDS,
    SEGMENT_MAX_SECONDS,
    SEGMENT_MIN_SECONDS,
    _SpeakerContext,
)
from app.domain.models import DomainModel, VoiceOutput, VoiceOutputSegment
from app.domain.timeline_intervals import excluded_intervals
from app.domain.voice_edits import VoiceEditDocument
from app.domain.voice_script_document import ScriptSegment, ScriptSentence


_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
_RATE = 24000
_WIDTH = 2
_SILENCE_AMPLITUDE = 327  # -40 dBFS for an observable silence fraction, not a denoiser.
_SILENCE_MAX_FRACTION = 0.98


class ContextPatchTransferRequest(DomainModel):
    expected_revision: int = Field(ge=0)
    expected_script_revision: int = Field(ge=0)
    asset_id: str = Field(min_length=1, max_length=100)
    start_word: int = Field(ge=0)
    end_word: int = Field(ge=0)


class ContextPatchCandidate(DomainModel):
    id: str
    side: Literal["before", "after"]
    start_word: int = Field(ge=0)
    end_word: int = Field(ge=0)
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    speaker_profile_id: str
    text: str = Field(min_length=1)
    source_audio_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    report: dict[str, Any] = Field(default_factory=dict)
    artifact_path: str | None = None
    artifact_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class ReviewedContextPatchTarget(DomainModel):
    """Explicit user review of the current whole-word media target bounds."""

    review_key: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_metadata_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    target_word_indices: list[int] = Field(min_length=1)
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    script_revision: int = Field(ge=0)


class ContextPatchDraft(DomainModel):
    source_kind: Literal["media"] = "media"
    source_origin: Literal["import", "record"]
    asset_id: str
    output_id: str
    row_id: str
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_metadata_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    script_revision: int = Field(ge=0)
    edit_revision: int = 0
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    sample_rate: Literal[24000] = 24000
    text: str = Field(min_length=1)
    replacement_text: str = Field(min_length=1)
    voice_id: Literal["context-clone"] = "context-clone"
    speaker_profile_id: str
    status: Literal["ready", "stale", "missing"] = "ready"
    reason: str | None = None
    audio_url: str
    processing_available: Literal[False] = False
    context_candidates: list[ContextPatchCandidate] = Field(default_factory=list)
    selected_context: ContextPatchCandidate | None = None
    reviewed_target: ReviewedContextPatchTarget | None = None
    report: dict[str, Any] = Field(default_factory=dict)


class ContextPatchDocument(DomainModel):
    revision: int = Field(default=0, ge=0)
    draft: ContextPatchDraft | None = None


class FileContextPatchSource:
    """Portable imported-media Patch source and explicit same-speaker context harvest."""

    _lock = threading.RLock()

    def __init__(self, media, scripts, projects):
        self.media, self.scripts, self.projects = media, scripts, projects

    def path(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "scripts" / "context-patch-source.json"

    def _record(self, project_id: str) -> dict[str, Any]:
        path = self.path(project_id)
        if not path.is_file():
            return {"revision": 0, "draft": None}
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Context Patch source draft is invalid.")
        return payload

    @staticmethod
    def _hash_bytes(payload: bytes) -> str:
        return hashlib.sha256(payload).hexdigest()

    @staticmethod
    def _hash_json(payload: Any) -> str:
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _hash_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _read_pcm(path: Path) -> tuple[bytes, int]:
        try:
            with wave.open(str(path), "rb") as audio:
                frames = audio.getnframes()
                if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                        != (1, _WIDTH, _RATE, "NONE")):
                    raise ValueError("Context Patch media source must be PCM16 mono 24 kHz WAV.")
                pcm = audio.readframes(frames)
                if frames <= 0 or len(pcm) != frames * _WIDTH:
                    raise ValueError("Context Patch media source has incomplete PCM frames.")
                return pcm, frames
        except (wave.Error, EOFError) as exc:
            raise ValueError("Context Patch media source must be a valid PCM16 mono 24 kHz WAV.") from exc

    @staticmethod
    def _metrics(pcm: bytes, start_frame: int, end_frame: int) -> dict[str, Any]:
        region = pcm[start_frame * _WIDTH:end_frame * _WIDTH]
        if not region or len(region) % _WIDTH:
            raise ValueError("Context Patch source span is outside the PCM frame range.")
        samples = struct.unpack(f"<{len(region) // 2}h", region)
        peak = max(abs(value) for value in samples)
        clipped = sum(value in {-32768, 32767} for value in samples)
        silent = sum(abs(value) <= _SILENCE_AMPLITUDE for value in samples)
        fraction = silent / len(samples)
        return {
            "frames": len(samples),
            "peak": peak,
            "clippedSamples": clipped,
            "silenceFractionBelowMinus40dB": round(fraction, 6),
            "noiseAssessment": "unverified",
            "requiresUserReview": True,
        }

    @staticmethod
    def _owner(word: dict[str, Any], asset) -> str | None:
        # A direct user Script assignment wins. Otherwise use an explicitly
        # mapped diarization label; file-level defaults never prove identity.
        if "speakerId" in word:
            return str(word["speakerId"]) if word["speakerId"] else None
        label = word.get("manualDiarizationSpeakerId") or word.get("diarizationSpeakerId")
        if not label:
            return None
        profile = (asset.diarization_speaker_assignments or {}).get(str(label))
        return str(profile) if profile else None

    @staticmethod
    def _word(word: dict[str, Any]) -> tuple[float, float] | None:
        if word.get("timingTrusted") is not True or not str(word.get("text", "")).strip():
            return None
        try:
            start, end = float(word["start"]), float(word["end"])
        except (KeyError, TypeError, ValueError):
            return None
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            return None
        return start, end

    @staticmethod
    def _source_word_geometry(word: dict[str, Any]) -> tuple[float, float] | None:
        """Return a bounded source cue span, even when its timing is untrusted."""
        if not str(word.get("text", "")).strip():
            return None
        try:
            start, end = float(word["start"]), float(word["end"])
        except (KeyError, TypeError, ValueError):
            return None
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            return None
        return start, end

    def _capture(self, project_id: str, asset_id: str) -> dict[str, Any]:
        if not _ID.fullmatch(asset_id):
            raise ValueError("Media asset ID is invalid.")
        asset = self.media.get(project_id, asset_id)
        if asset.id != asset_id:
            raise ValueError("Media asset identity does not match the request.")
        if asset.deleted_at or asset.disabled or not asset.import_selected:
            raise ValueError("Media source is deleted, disabled, or excluded from import use.")
        if asset.origin not in {"import", "record"}:
            raise ValueError("Context Patch requires imported or project-owned recorded media; generated audio is not accepted here.")
        if asset.status != "ready" or not asset.analysis_path:
            raise ValueError("Imported media has no ready analysis audio.")
        if asset.transcription_status == "failed" or asset.ai_review_status == "failed":
            raise ValueError("Media has an explicit failed transcript/QC status and cannot be used for Patch.")
        if asset.word_timing_quality not in {"source", "partial"}:
            raise ValueError("Media word timing is not verified for Patch source selection.")
        audio_path = self.media.resolve_audio_path(project_id, asset_id)
        pcm, frames = self._read_pcm(audio_path)
        if asset.sample_rate != _RATE:
            raise ValueError("Context Patch media source metadata must report 24 kHz.")
        if asset.duration > frames / _RATE + 1 / _RATE:
            raise ValueError("Media duration exceeds its PCM frame range.")
        source_hash = self._hash_bytes(audio_path.read_bytes())
        asset_hash = self._hash_json(asset.model_dump(mode="json", by_alias=True))
        root = Path(self.projects.get(project_id).project_path).resolve()
        diarization_path = root / "assets" / "media" / asset_id / "diarization" / "spans.json"
        diarization_hash = self._hash_file(diarization_path) if diarization_path.is_file() else None
        context = _SpeakerContext.for_asset(asset, root)
        return {
            "asset": asset,
            "audio_path": audio_path,
            "pcm": pcm,
            "frames": frames,
            "source_hash": source_hash,
            "asset_hash": asset_hash,
            "diarization_hash": diarization_hash,
            "context": context,
            "script": self.scripts.get(project_id),
        }

    def _candidates(self, capture: dict[str, Any], target_indices: set[int], profile_id: str) -> list[ContextPatchCandidate]:
        asset, pcm = capture["asset"], capture["pcm"]
        words = asset.words or []
        target_start = min(float(words[index]["start"]) for index in target_indices)
        target_end = max(float(words[index]["end"]) for index in target_indices)
        excluded = excluded_intervals(asset)
        groups: list[list[tuple[int, dict, float, float]]] = []
        current: list[tuple[int, dict, float, float]] = []

        def close() -> None:
            nonlocal current
            if current:
                groups.append(current)
            current = []

        for index, word in enumerate(words):
            timing = self._word(word)
            owner = self._owner(word, asset)
            if timing is None or owner != profile_id:
                close()
                continue
            start, end = timing
            if index in target_indices or (start < target_end + BOUNDARY_GAP_SECONDS and end > target_start - BOUNDARY_GAP_SECONDS):
                close()
                continue
            if any(start < item.end and end > item.start for item in excluded):
                close()
                continue
            if capture["context"].foreign_seconds(start, end, profile_id) >= OVERLAP_WORD_SECONDS:
                close()
                continue
            if current:
                previous = current[-1]
                gap = start - previous[3]
                if gap < 0 or gap >= BOUNDARY_GAP_SECONDS:
                    close()
                elif any(previous[3] < item.end and start > item.start for item in excluded):
                    close()
                elif (capture["context"].foreign_seconds(previous[3], start, profile_id) >= OVERLAP_GAP_SECONDS):
                    close()
            current.append((index, word, start, end))
        close()

        candidates = []
        for group in groups:
            start, end = group[0][2], group[-1][3]
            duration = end - start
            if not SEGMENT_MIN_SECONDS <= duration <= SEGMENT_MAX_SECONDS:
                continue
            if start + BOUNDARY_GAP_SECONDS <= target_start and end + BOUNDARY_GAP_SECONDS > target_start:
                continue
            if start < target_end + BOUNDARY_GAP_SECONDS and end >= target_end:
                continue
            if any(start < item.end and end > item.start for item in excluded):
                continue
            start_frame, end_frame = round(start * _RATE), round(end * _RATE)
            metrics = self._metrics(pcm, start_frame, end_frame)
            if metrics["clippedSamples"] or metrics["silenceFractionBelowMinus40dB"] >= _SILENCE_MAX_FRACTION:
                continue
            if end <= target_start - BOUNDARY_GAP_SECONDS:
                side: Literal["before", "after"] = "before"
            elif start >= target_end + BOUNDARY_GAP_SECONDS:
                side = "after"
            else:
                continue
            text = " ".join(str(item[1].get("text", "")).strip() for item in group).strip()
            if not text:
                continue
            identity = self._hash_json({
                "assetId": asset.id, "sourceSha256": capture["source_hash"],
                "startFrame": start_frame, "endFrame": end_frame,
                "wordIndices": [item[0] for item in group], "speakerProfileId": profile_id,
            })[:24]
            candidates.append(ContextPatchCandidate(
                id=f"context-{identity}", side=side,
                start_word=group[0][0], end_word=group[-1][0],
                start_frame=start_frame, end_frame=end_frame,
                speaker_profile_id=profile_id, text=text,
                source_audio_sha256=capture["source_hash"], report=metrics,
            ))
        return candidates

    def _target_snapshot(self, capture: dict[str, Any], indices: Any) -> dict[str, Any]:
        words = capture["asset"].words or []
        if (not isinstance(indices, list) or not indices or any(type(index) is not int for index in indices)
                or indices != sorted(set(indices)) or indices[0] < 0 or indices[-1] >= len(words)
                or indices != list(range(indices[0], indices[-1] + 1))):
            raise ValueError("Stored Context Patch target word range is invalid.")
        selected = [(index, words[index], self._word(words[index])) for index in indices]
        profile_ids: set[str] = set()
        previous_end = None
        excluded = excluded_intervals(capture["asset"])
        for _index, word, timing in selected:
            if timing is None:
                raise ValueError("Selected target words require trusted source timing.")
            start, end = timing
            profile = self._owner(word, capture["asset"])
            if not profile:
                raise ValueError("Selected target words need an explicit Speaker Profile assignment.")
            profile_ids.add(profile)
            if previous_end is not None and start < previous_end:
                raise ValueError("Selected target words overlap or are out of time order.")
            if any(start < item.end and end > item.start for item in excluded):
                raise ValueError("Selected target words cross a removed or out-of-range media interval.")
            if capture["context"].foreign_seconds(start, end, profile) >= OVERLAP_WORD_SECONDS:
                raise ValueError("Selected target word overlaps another or unknown diarization span.")
            previous_end = end
        if len(profile_ids) != 1:
            raise ValueError("Target word range must belong to exactly one speaker profile.")
        profile_id = next(iter(profile_ids))
        start_seconds, end_seconds = selected[0][2][0], selected[-1][2][1]
        if any(start_seconds < item.end and end_seconds > item.start for item in excluded):
            raise ValueError("Selected target span crosses a removed or out-of-range media interval.")
        if capture["context"].foreign_seconds(start_seconds, end_seconds, profile_id) >= OVERLAP_WORD_SECONDS:
            raise ValueError("Selected target span overlaps another or unknown diarization span.")
        start_frame, end_frame = round(start_seconds * _RATE), round(end_seconds * _RATE)
        if start_frame < 0 or end_frame <= start_frame or end_frame > capture["frames"]:
            raise ValueError("Selected target word range is outside the media PCM frame range.")
        metrics = self._metrics(capture["pcm"], start_frame, end_frame)
        if metrics["clippedSamples"]:
            raise ValueError("Selected target audio contains clipped PCM samples.")
        if metrics["silenceFractionBelowMinus40dB"] >= _SILENCE_MAX_FRACTION:
            raise ValueError("Selected target audio is almost entirely silent.")
        text = " ".join(str(word.get("text", "")).strip() for _index, word, _timing in selected).strip()
        row_id = f"media-{capture['asset'].id}-{start_frame}-{end_frame}"
        if len(row_id) > 80:
            row_id = f"media-{self._hash_json(row_id)[:32]}"
        return {
            "indices": indices, "profile_id": profile_id,
            "start_frame": start_frame, "end_frame": end_frame,
            "text": text, "row_id": row_id, "metrics": metrics,
            "word_texts": [str(item[1].get("text", "")) for item in selected],
        }

    @staticmethod
    def _same_candidate_metadata(stored: ContextPatchCandidate, current: ContextPatchCandidate) -> bool:
        return (
            stored.id == current.id and stored.side == current.side
            and stored.start_word == current.start_word and stored.end_word == current.end_word
            and stored.start_frame == current.start_frame and stored.end_frame == current.end_frame
            and stored.speaker_profile_id == current.speaker_profile_id and stored.text == current.text
            and stored.source_audio_sha256 == current.source_audio_sha256
            and all(stored.report.get(key) == value for key, value in current.report.items())
        )

    def _selected_artifact_matches(self, project_id: str, capture: dict[str, Any], candidate: ContextPatchCandidate) -> bool:
        expected_relative = (Path("assets") / "media" / capture["asset"].id / "context-patch"
                             / "references" / f"{candidate.id}.wav").as_posix()
        if candidate.artifact_path != expected_relative or not candidate.artifact_sha256:
            return False
        path = self._project_path(project_id, candidate.artifact_path)
        if not path.is_file() or self._hash_file(path) != candidate.artifact_sha256:
            return False
        try:
            with wave.open(str(path), "rb") as audio:
                if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                        != (1, _WIDTH, _RATE, "NONE")
                        or audio.getnframes() != candidate.end_frame - candidate.start_frame):
                    return False
                payload = audio.readframes(audio.getnframes())
        except (wave.Error, EOFError, OSError):
            return False
        expected = capture["pcm"][candidate.start_frame * _WIDTH:candidate.end_frame * _WIDTH]
        return bool(expected) and payload == expected

    def _draft_source_is_current(
        self, project_id: str, capture: dict[str, Any], draft: ContextPatchDraft, *, check_artifact: bool = True,
    ) -> bool:
        try:
            target = self._target_snapshot(capture, draft.report.get("targetWordIndices"))
        except (KeyError, TypeError, ValueError):
            return False
        asset = capture["asset"]
        if (draft.source_origin != asset.origin or draft.source_kind != "media"
                or draft.output_id != asset.id or draft.asset_id != asset.id
                or draft.source_sha256 != capture["source_hash"]
                or draft.source_metadata_sha256 != capture["asset_hash"]
                or draft.start_frame != target["start_frame"] or draft.end_frame != target["end_frame"]
                or draft.text != target["text"] or draft.speaker_profile_id != target["profile_id"]
                or draft.row_id != target["row_id"] or draft.sample_rate != _RATE
                or draft.report.get("targetWordTexts") != target["word_texts"]
                or draft.report.get("targetPcm") != target["metrics"]
                or draft.report.get("diarizationSha256") != capture["diarization_hash"]):
            return False
        expected_candidates = self._candidates(capture, set(target["indices"]), target["profile_id"])
        if len(expected_candidates) != len(draft.context_candidates):
            return False
        if any(not self._same_candidate_metadata(saved, current)
               for saved, current in zip(draft.context_candidates, expected_candidates)):
            return False
        if draft.selected_context is not None:
            selected = draft.selected_context
            current = next((item for item in expected_candidates if item.id == selected.id), None)
            if (current is None or selected.speaker_profile_id != target["profile_id"]
                    or not self._same_candidate_metadata(selected, current)):
                return False
            if check_artifact and not self._selected_artifact_matches(project_id, capture, selected):
                return False
        return True

    def _reviewed_target(self, capture: dict[str, Any], draft: ContextPatchDraft) -> ReviewedContextPatchTarget:
        indices = [int(index) for index in draft.report.get("targetWordIndices", [])]
        material = {
            "sourceSha256": capture["source_hash"],
            "sourceMetadataSha256": capture["asset_hash"],
            "targetWordIndices": indices,
            "startFrame": draft.start_frame,
            "endFrame": draft.end_frame,
            "scriptRevision": capture["script"].revision,
        }
        return ReviewedContextPatchTarget(**{
            "reviewKey": self._hash_json(material),
            "sourceSha256": capture["source_hash"],
            "sourceMetadataSha256": capture["asset_hash"],
            "targetWordIndices": indices,
            "startFrame": draft.start_frame,
            "endFrame": draft.end_frame,
            "scriptRevision": capture["script"].revision,
        })

    def _target_review_is_current(self, capture: dict[str, Any], draft: ContextPatchDraft) -> bool:
        if draft.reviewed_target is None:
            return False
        try:
            current = self._reviewed_target(capture, draft)
        except (KeyError, TypeError, ValueError):
            return False
        return draft.reviewed_target.model_dump(mode="json", by_alias=True) == current.model_dump(
            mode="json", by_alias=True)

    def transfer(self, project_id: str, request: ContextPatchTransferRequest) -> ContextPatchDocument:
        if not _ID.fullmatch(request.asset_id):
            raise ValueError("Media asset ID is invalid.")
        with self._lock:
            current = self._record(project_id)
            if current.get("revision", 0) != request.expected_revision:
                raise ScriptRevisionConflict("Context Patch source changed; refresh before selecting another range.")
            capture = self._capture(project_id, request.asset_id)
            script = capture["script"]
            if script.revision != request.expected_script_revision:
                raise ScriptRevisionConflict("Script changed; refresh before selecting a Context Patch source.")
            asset, words = capture["asset"], capture["asset"].words or []
            if request.end_word < request.start_word or request.end_word >= len(words):
                raise ValueError("Selected media word range is outside the annotated transcript.")
            indices = set(range(request.start_word, request.end_word + 1))
            selected = [(index, words[index], self._word(words[index])) for index in sorted(indices)]
            profile_ids = set()
            previous_end = None
            for _index, word, timing in selected:
                if timing is None:
                    raise ValueError("Selected target words require trusted source timing.")
                start, end = timing
                profile = self._owner(word, asset)
                if not profile:
                    raise ValueError("Selected target words need an explicit Speaker Profile assignment.")
                profile_ids.add(profile)
                if previous_end is not None and start < previous_end:
                    raise ValueError("Selected target words overlap or are out of time order.")
                if any(start < item.end and end > item.start for item in excluded_intervals(asset)):
                    raise ValueError("Selected target words cross a removed or out-of-range media interval.")
                if capture["context"].foreign_seconds(start, end, profile) >= OVERLAP_WORD_SECONDS:
                    raise ValueError("Selected target word overlaps another or unknown diarization span.")
                previous_end = end
            if len(profile_ids) != 1:
                raise ValueError("Target word range must belong to exactly one speaker profile.")
            profile_id = next(iter(profile_ids))
            start_seconds = selected[0][2][0]
            end_seconds = selected[-1][2][1]
            # The replacement span includes silence between selected words.
            # Guard that whole span too: a cut or another voice can occupy only
            # a gap and otherwise be copied into the target patch unnoticed.
            if any(start_seconds < item.end and end_seconds > item.start
                   for item in excluded_intervals(asset)):
                raise ValueError("Selected target span crosses a removed or out-of-range media interval.")
            if capture["context"].foreign_seconds(start_seconds, end_seconds, profile_id) >= OVERLAP_WORD_SECONDS:
                raise ValueError("Selected target span overlaps another or unknown diarization span.")
            start_frame, end_frame = round(start_seconds * _RATE), round(end_seconds * _RATE)
            if start_frame < 0 or end_frame <= start_frame or end_frame > capture["frames"]:
                raise ValueError("Selected target word range is outside the media PCM frame range.")
            target_metrics = self._metrics(capture["pcm"], start_frame, end_frame)
            if target_metrics["clippedSamples"]:
                raise ValueError("Selected target audio contains clipped PCM samples.")
            if target_metrics["silenceFractionBelowMinus40dB"] >= _SILENCE_MAX_FRACTION:
                raise ValueError("Selected target audio is almost entirely silent.")
            text = " ".join(str(word.get("text", "")).strip() for _index, word, _timing in selected).strip()
            candidates = self._candidates(capture, indices, profile_id)
            row_id = f"media-{asset.id}-{start_frame}-{end_frame}"
            if len(row_id) > 80:
                row_id = f"media-{self._hash_json(row_id)[:32]}"
            draft = ContextPatchDraft(
                asset_id=asset.id, output_id=asset.id, row_id=row_id,
                source_origin=asset.origin,
                source_sha256=capture["source_hash"], source_metadata_sha256=capture["asset_hash"],
                script_revision=script.revision, start_frame=start_frame, end_frame=end_frame,
                text=text, replacement_text=text, speaker_profile_id=profile_id,
                audio_url=asset.url or f"/api/projects/{project_id}/media/{asset.id}/audio",
                context_candidates=candidates,
                report={
                    "targetPcm": target_metrics,
                    "sourceSampleRate": asset.sample_rate,
                    "sourceChannels": 1,
                    "sourceCodec": asset.audio_codec,
                    "targetWordIndices": sorted(indices),
                    "targetWordTexts": [str(item[1].get("text", "")) for item in selected],
                    "diarizationSha256": capture["diarization_hash"],
                    "acousticNoiseAssessment": "unverified; manual review required",
                },
            )
            fresh = self._capture(project_id, request.asset_id)
            latest = self._record(project_id)
            if (latest.get("revision", 0) != request.expected_revision
                    or fresh["source_hash"] != capture["source_hash"]
                    or fresh["asset_hash"] != capture["asset_hash"]
                    or fresh["diarization_hash"] != capture["diarization_hash"]
                    or fresh["script"].revision != script.revision):
                raise ScriptRevisionConflict("Media, transcript, diarization or Script changed while capturing the source.")
            document = ContextPatchDocument(revision=request.expected_revision + 1, draft=draft)
            self._save(project_id, document)
            return document

    def get(self, project_id: str) -> ContextPatchDocument:
        record = self._record(project_id)
        document = ContextPatchDocument.model_validate({"revision": record.get("revision", 0), "draft": record.get("draft")})
        draft = document.draft
        if draft is None:
            return document
        try:
            capture = self._capture(project_id, draft.asset_id)
        except (KeyError, FileNotFoundError, OSError, ValueError) as exc:
            return document.model_copy(update={"draft": draft.model_copy(update={"status": "missing", "reason": str(exc)})})
        if (capture["source_hash"] != draft.source_sha256
                or capture["asset_hash"] != draft.source_metadata_sha256
                or capture["script"].revision != draft.script_revision
                or capture["diarization_hash"] != draft.report.get("diarizationSha256")):
            return document.model_copy(update={"draft": draft.model_copy(update={
                "status": "stale", "reason": "Imported source, annotations, diarization or Script changed after selection."})})
        if not self._draft_source_is_current(project_id, capture, draft, check_artifact=False):
            return document.model_copy(update={"draft": draft.model_copy(update={
                "status": "stale", "reason": "Target or context annotations no longer match the selected source audio."})})
        if draft.selected_context and not self._selected_artifact_matches(project_id, capture, draft.selected_context):
            return document.model_copy(update={"draft": draft.model_copy(update={
                "status": "missing", "reason": "Extracted context reference is missing, altered, or no longer matches its source frames."})})
        if draft.reviewed_target is not None and not self._target_review_is_current(capture, draft):
            return document.model_copy(update={"draft": draft.model_copy(update={"reviewed_target": None})})
        return document

    def review_target(
        self, project_id: str, expected_revision: int, expected_source_sha256: str,
        start_frame: int, end_frame: int,
    ) -> ContextPatchDocument:
        """Record explicit review of the exact current media target word span."""
        with self._lock:
            document = self.get(project_id)
            if document.revision != expected_revision:
                raise ScriptRevisionConflict("Context Patch source revision changed; refresh before reviewing the target.")
            draft = document.draft
            if draft is None or draft.status != "ready":
                detail = draft.reason if draft and draft.reason else "A current imported-media Patch source is required."
                raise ScriptRevisionConflict(detail)
            if (expected_source_sha256 != draft.source_sha256
                    or start_frame != draft.start_frame or end_frame != draft.end_frame):
                raise ScriptRevisionConflict("Reviewed target source hash or frame bounds differ from the current displayed selection.")
            capture = self._capture(project_id, draft.asset_id)
            if (capture["source_hash"] != draft.source_sha256
                    or capture["asset_hash"] != draft.source_metadata_sha256
                    or capture["script"].revision != draft.script_revision
                    or capture["diarization_hash"] != draft.report.get("diarizationSha256")
                    or not self._draft_source_is_current(project_id, capture, draft)):
                raise ScriptRevisionConflict("Media source, target words or Script changed; recapture before reviewing.")
            reviewed = self._reviewed_target(capture, draft)
            if draft.reviewed_target == reviewed:
                return document
            fresh = self._capture(project_id, draft.asset_id)
            latest = self._record(project_id)
            if (latest.get("revision", 0) != expected_revision
                    or fresh["source_hash"] != capture["source_hash"]
                    or fresh["asset_hash"] != capture["asset_hash"]
                    or fresh["script"].revision != capture["script"].revision
                    or fresh["diarization_hash"] != capture["diarization_hash"]):
                raise ScriptRevisionConflict("Media, annotations or Script changed while reviewing the target.")
            updated = draft.model_copy(update={"reviewed_target": reviewed})
            result = ContextPatchDocument(revision=expected_revision + 1, draft=updated)
            self._save(project_id, result)
            return result

    def select_context(self, project_id: str, expected_revision: int, candidate_id: str) -> ContextPatchDocument:
        if not _ID.fullmatch(candidate_id):
            raise ValueError("Context candidate ID is invalid.")
        with self._lock:
            document = self.get(project_id)
            if document.revision != expected_revision:
                raise ScriptRevisionConflict("Context Patch source revision changed; refresh before selecting context.")
            draft = document.draft
            if draft is None or draft.status != "ready":
                detail = draft.reason if draft and draft.reason else "A current Context Patch source selection is required."
                raise ScriptRevisionConflict(detail)
            candidate = next((item for item in draft.context_candidates if item.id == candidate_id), None)
            if candidate is None:
                raise ValueError("Context candidate is not part of this source selection.")
            capture = self._capture(project_id, draft.asset_id)
            if capture["source_hash"] != draft.source_sha256 or capture["asset_hash"] != draft.source_metadata_sha256:
                raise ScriptRevisionConflict("Imported source changed; recapture the media Patch target.")
            if self._hash_json(capture["asset"].model_dump(mode="json", by_alias=True)) != draft.source_metadata_sha256:
                raise ScriptRevisionConflict("Media transcript changed; recapture the media Patch target.")
            # Candidate identity is recomputed from the current media snapshot;
            # a stale or client-invented span cannot be extracted.
            current = self._candidates(capture, set(draft.report["targetWordIndices"]), draft.speaker_profile_id)
            exact = next((item for item in current if item.id == candidate_id), None)
            if exact is None or exact.model_dump(mode="json", by_alias=True) != candidate.model_dump(mode="json", by_alias=True):
                raise ScriptRevisionConflict("Context candidate changed; refresh the source before extraction.")
            start, end = candidate.start_frame, candidate.end_frame
            pcm = capture["pcm"][start * _WIDTH:end * _WIDTH]
            if not pcm or len(pcm) != (end - start) * _WIDTH:
                raise ValueError("Context candidate PCM range is incomplete.")
            root = Path(self.projects.get(project_id).project_path).resolve()
            relative = Path("assets") / "media" / draft.asset_id / "context-patch" / "references" / f"{candidate.id}.wav"
            destination = self._project_path(project_id, relative.as_posix())
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
            try:
                with wave.open(str(temporary), "wb") as audio:
                    audio.setparams((1, _WIDTH, _RATE, 0, "NONE", "not compressed"))
                    audio.writeframes(pcm)
                fresh = self._capture(project_id, draft.asset_id)
                latest = self._record(project_id)
                if (latest.get("revision", 0) != expected_revision
                        or fresh["source_hash"] != capture["source_hash"]
                        or fresh["asset_hash"] != capture["asset_hash"]
                        or fresh["diarization_hash"] != capture["diarization_hash"]
                        or fresh["script"].revision != capture["script"].revision):
                    raise ScriptRevisionConflict("Media, transcript, diarization or Script changed during context extraction.")
                os.replace(temporary, destination)
            finally:
                temporary.unlink(missing_ok=True)
            artifact_hash = self._hash_file(destination)
            selected = candidate.model_copy(update={
                "artifact_path": relative.as_posix(), "artifact_sha256": artifact_hash,
                "report": {**candidate.report, "extractedFrames": end - start,
                           "sourceRangeStartFrame": start, "sourceRangeEndFrame": end},
            })
            next_draft = draft.model_copy(update={"selected_context": selected, "status": "ready", "reason": None})
            result = ContextPatchDocument(revision=expected_revision + 1, draft=next_draft)
            self._save(project_id, result)
            return result

    def _output_and_script(self, project_id: str, capture: dict[str, Any], draft: ContextPatchDraft):
        """Build an ephemeral source-output view while retaining all usable cues."""
        asset = capture["asset"]
        words = asset.words or []
        target_indices = set(draft.report["targetWordIndices"])
        excluded = excluded_intervals(asset)
        timed: list[tuple[int, dict[str, Any], float, float, str | None]] = []
        for index, word in enumerate(words):
            timing = self._source_word_geometry(word)
            if timing is None:
                continue
            start, end = timing
            if end * _RATE > capture["frames"] + 1:
                continue
            if any(start < item.end and end > item.start for item in excluded):
                continue
            timed.append((index, word, start, end, self._owner(word, asset)))

        selected = {index for index, *_rest in timed if index in target_indices}
        if selected != target_indices:
            raise ScriptRevisionConflict("One or more selected source word cues are no longer valid.")
        target = next((item for item in timed if item[0] in target_indices), None)
        if target is None:
            raise ScriptRevisionConflict("Selected target source words are missing.")
        target_start, target_end = draft.start_frame / _RATE, draft.end_frame / _RATE
        if any(index not in target_indices and start < target_end and end > target_start
               for index, _word, start, end, _owner in timed):
            raise ScriptRevisionConflict("A source word cue overlaps the selected Patch target; mapping is ambiguous.")
        # Voice Patch requires non-overlapping source segments. Fail safely when
        # otherwise valid source cues overlap each other rather than dropping or
        # flattening a second speaker into the target profile.
        ordered = sorted(timed, key=lambda item: (item[2], item[3], item[0]))
        if any(right[2] < left[3] for left, right in zip(ordered, ordered[1:])):
            raise ScriptRevisionConflict("Overlapping source word cues cannot be represented safely in this Patch view.")

        def category(item):
            index, _word, _start, _end, owner = item
            if index in target_indices:
                if owner != draft.speaker_profile_id:
                    raise ScriptRevisionConflict("Selected target speaker assignment changed.")
                return ("target", draft.speaker_profile_id)
            return ("source", owner)

        groups: list[list[tuple[int, dict[str, Any], float, float, str | None]]] = []
        for item in ordered:
            if groups:
                prior = groups[-1][-1]
                pause = item[2] - prior[3]
                if category(item) == category(prior) and pause < BOUNDARY_GAP_SECONDS:
                    groups[-1].append(item)
                    continue
            groups.append([item])
        if len(groups) > 400:
            raise ValueError("Imported source has too many separated speech runs for the Script limit.")

        script = capture["script"].model_copy(deep=True)
        output_segments: list[VoiceOutputSegment] = []
        output_words: list[dict[str, Any]] = []
        source_origin = draft.source_origin
        for segment_index, group in enumerate(groups):
            is_target = category(group[0])[0] == "target"
            owner = group[0][4]
            start, end = group[0][2], group[-1][3]
            text = " ".join(str(item[1].get("text", "")).strip() for item in group).strip()
            if is_target:
                row_id = draft.row_id
                voice_id, voice_name = "context-clone", "Imported media · selected speaker"
                profile_id = draft.speaker_profile_id
            else:
                row_id = f"media-run-{self._hash_json([asset.id, group[0][0], group[-1][0]])[:24]}"
                voice_id = "source-media"
                voice_name = "Imported media source"
                profile_id = owner or "unknown-speaker"
            row_payload = {
                "sourceKind": "media", "sourceOrigin": source_origin,
                "sourceAssetId": asset.id,
                "sourceWordIndices": [item[0] for item in group],
                "speakerProfileId": owner,
            }
            output_segments.append(VoiceOutputSegment(
                row_id=row_id, voice_id=voice_id, voice_name=voice_name,
                speaker_profile_id=profile_id, engine="source-media", generator_id="import",
                text=text, start=start, end=end, script_row=row_payload,
            ))
            segment_id = f"media-seg-{self._hash_json([asset.id, row_id])[:24]}"
            if not any(item.id == segment_id for item in script.segments):
                script.segments.append(ScriptSegment(id=segment_id, name="Imported media source"))
            if any(row.id == row_id for row in script.rows):
                raise ScriptRevisionConflict("In-memory media Patch row ID collides with a saved Script row.")
            script.rows.append(ScriptSentence(
                id=row_id, text=text, voice_id=voice_id,
                speaker_profile_id=owner if owner else None,
                segment_id=segment_id, source_text=text,
            ))
            for index, word, word_start, word_end, word_owner in group:
                output_words.append({
                    **word,
                    "start": word_start, "end": word_end,
                    "segmentIndex": segment_index,
                    "speakerId": word_owner,
                    "sourceKind": "media", "sourceOrigin": source_origin,
                    "sourceAssetId": asset.id, "sourceWordIndex": index,
                })
        output_words.sort(key=lambda item: (item["start"], item["end"], item["sourceWordIndex"]))
        if len(script.rows) > 400 or len(script.segments) > 400:
            raise ValueError("Imported source view exceeds the Script row or segment limit.")
        root = Path(self.projects.get(project_id).project_path).resolve()
        source_relative = capture["audio_path"].resolve().relative_to(root).as_posix()
        output = VoiceOutput(
            id=asset.id, name=asset.name, text="\n".join(item.text for item in output_segments),
            voice_id="source-media", voice_name="Imported media source",
            speaker_profile_id=draft.speaker_profile_id, engine="source-media", generator_id="import",
            parameters={
                "sourceKind": "media", "sourceOrigin": source_origin,
                "sourceAssetId": asset.id, "sourceAudioSha256": draft.source_sha256,
                "sourceMetadataSha256": draft.source_metadata_sha256,
                "sourcePath": source_relative,
            },
            duration=capture["frames"] / _RATE, sample_rate=_RATE,
            audio_path=source_relative,
            words=output_words,
            word_timing_quality=("source" if all(item.get("timingTrusted") is True for item in output_words)
                                 else "partial"),
            segments=output_segments,
        )
        return output, script

    def validate(
        self, project_id: str, expected_revision: int, *, require_context: bool = True,
        require_review: bool = False,
    ) -> dict[str, Any]:
        document = self.get(project_id)
        if document.revision != expected_revision:
            raise ScriptRevisionConflict("Context Patch source revision changed; refresh before processing.")
        draft = document.draft
        if draft is None:
            raise ScriptRevisionConflict("A current imported-media Patch source is required.")
        if draft.status != "ready":
            raise ScriptRevisionConflict(draft.reason or "A current imported-media Patch source is required.")
        if require_context and draft.selected_context is None:
            raise ScriptRevisionConflict("Select one context utterance explicitly before processing.")
        capture = self._capture(project_id, draft.asset_id)
        if (capture["source_hash"] != draft.source_sha256
                or capture["asset_hash"] != draft.source_metadata_sha256
                or capture["script"].revision != draft.script_revision
                or capture["diarization_hash"] != draft.report.get("diarizationSha256")
                or not self._draft_source_is_current(project_id, capture, draft)):
            raise ScriptRevisionConflict("Media source changed; recapture the Patch source.")
        selected = draft.selected_context
        context = None
        if selected is not None:
            if not self._selected_artifact_matches(project_id, capture, selected):
                raise ScriptRevisionConflict("Extracted context audio is missing or stale.")
            context_path = self._project_path(project_id, selected.artifact_path or "")
            with wave.open(str(context_path), "rb") as audio:
                context_frames = audio.getnframes()
            context = {
                **selected.model_dump(mode="json", by_alias=True),
                "audio_path": context_path,
                "frames": context_frames,
                "audio_sha256": selected.artifact_sha256,
                "applied": False,
                "mode": "clone-only-context",
                "sourceKind": "media", "sourceOrigin": draft.source_origin,
            }
        target_reviewed = self._target_review_is_current(capture, draft)
        if require_review and not target_reviewed:
            raise ScriptRevisionConflict("Review and confirm the selected target span before processing.")
        output, script = self._output_and_script(project_id, capture, draft)
        edit = VoiceEditDocument(
            revision=0, output_id=draft.output_id, source_sha256=draft.source_sha256,
            sample_rate=_RATE, source_frames=capture["frames"], operations=[], cursor=0,
        )
        root = Path(self.projects.get(project_id).project_path).resolve()
        source_path = capture["audio_path"].resolve()
        source_path.relative_to(root)
        return {
            "draft": draft,
            "output": output,
            "audio_path": source_path,
            "script": script,
            "edit": edit,
            "context": context,
            "sourceKind": "media",
            "targetReviewed": target_reviewed,
            "reviewKey": draft.reviewed_target.review_key if target_reviewed else None,
        }

    def _save(self, project_id: str, document: ContextPatchDocument) -> None:
        path = self.path(project_id)
        payload = document.model_dump_json(by_alias=True, indent=2)
        FileProjectRepository._atomic_write(path, payload)

    def _project_path(self, project_id: str, relative: str) -> Path:
        root = Path(self.projects.get(project_id).project_path).resolve()
        path = (root / relative).resolve()
        if path != root and root not in path.parents:
            raise ValueError("Context Patch artifact path escapes its project folder.")
        return path
