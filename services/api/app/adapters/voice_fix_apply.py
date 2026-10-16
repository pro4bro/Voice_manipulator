from __future__ import annotations

import hashlib
import json
import math
import os
import re
import struct
import threading
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_edit_preview import VoiceEditPreview
from app.adapters.voice_render import VoiceRenderService
from app.domain.models import VoiceOutput, VoiceOutputSegment
from app.domain.voice_script_document import effective_settings


_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
_RATE = 24000
_SAMPLE_BYTES = 2
_BOUNDARY_LIMIT = .05
_ROUNDING_TOLERANCE_FRAMES = 12


class VoiceFixApply:
    """Compose validated Fix clips into a new immutable Voice Output."""

    _lock = threading.RLock()

    def __init__(self, fixes):
        self.fixes = fixes
        self.edits = fixes.edits
        self.outputs = fixes.outputs
        self.scripts = fixes.scripts
        self.previews = VoiceEditPreview(self.edits)
        self.renderer = VoiceRenderService(self.edits, self.scripts)

    def receipt_path(self, project_id: str, source_output_id: str) -> Path:
        if not _ID.fullmatch(source_output_id):
            raise KeyError(source_output_id)
        root = Path(self.fixes.speaker.projects.get(project_id).project_path)
        return root / "jobs" / "voice-fix" / "applied" / f"{source_output_id}.json"

    @staticmethod
    def _metadata_digest(output: VoiceOutput) -> str:
        payload = json.dumps(output.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _sha(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _read_pcm(path: Path) -> bytes:
        with wave.open(str(path), "rb") as audio:
            frames = audio.getnframes()
            if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                    != (1, 2, _RATE, "NONE")):
                raise ValueError("Fix apply needs uncompressed PCM16 mono 24 kHz audio.")
            pcm = audio.readframes(frames)
            if frames <= 0 or len(pcm) != frames * _SAMPLE_BYTES:
                raise ValueError("Fix apply source has an incomplete PCM frame sequence.")
            return pcm

    @staticmethod
    def _write_pcm(path: Path, pcm: bytes) -> None:
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        try:
            with wave.open(str(temporary), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(_SAMPLE_BYTES)
                audio.setframerate(_RATE)
                audio.writeframes(pcm)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def _base_audio(self, snapshot, *, create_preview: bool) -> tuple[Path, str, str]:
        source = self.outputs.audio_path(snapshot.project_id, snapshot.output_id)
        source_hash = self._sha(source)
        if source_hash != snapshot.edit.source_sha256:
            raise ScriptRevisionConflict("Source Voice Output changed since its Timeline was opened.")
        if not snapshot.edit.cursor:
            return source, source_hash, source.relative_to(self.fixes.speaker.projects.get(snapshot.project_id).project_path).as_posix()
        if create_preview:
            audio_url, _report = self.previews.render(snapshot.project_id, snapshot.output_id, snapshot.edit)
        else:
            audio_url = None
        if audio_url is None:
            payload = json.dumps({
                "source": snapshot.edit.source_sha256,
                "operations": [operation.model_dump(by_alias=True) for operation in snapshot.edit.active],
                "policy": 1,
            }, sort_keys=True)
            preview_key = hashlib.sha256(payload.encode()).hexdigest()[:32]
        else:
            match = re.search(r"/edit/previews/([a-f0-9]{32})/audio$", audio_url)
            if not match:
                raise ValueError("Timeline preview returned an unexpected audio reference.")
            preview_key = match.group(1)
        path = self.previews.path(snapshot.project_id, snapshot.output_id, preview_key)
        self.previews.validate(path, snapshot.edit.source_sha256, snapshot.edit.frames)
        project_root = Path(self.fixes.speaker.projects.get(snapshot.project_id).project_path)
        return path, self._sha(path), path.relative_to(project_root).as_posix()

    def _row_cache(self, snapshot, unit, step):
        if not unit.clip or not _ID.fullmatch(unit.clip):
            raise ScriptRevisionConflict(f"Fix cache for row {unit.row_id} is unavailable.")
        desired_key = self.fixes.speaker.clip_key(step)
        if unit.clip != desired_key and not unit.clip.startswith(desired_key + "-"):
            raise ScriptRevisionConflict(f"Fix cache for row {unit.row_id} does not match its desired generation fingerprint.")
        folder = self.outputs.clips_root(snapshot.project_id) / unit.clip
        record = self.fixes.speaker._cached_record(folder, step)
        if record is None:
            raise ScriptRevisionConflict(f"Fix cache for row {unit.row_id} failed identity/integrity validation.")
        audio = folder / "audio.wav"
        pcm = self._read_pcm(audio)
        if record.get("audioSha256") != self._sha(audio):
            raise ScriptRevisionConflict(f"Fix cache for row {unit.row_id} changed during Apply.")
        return folder, record, pcm

    @staticmethod
    def _sample(pcm: bytes, frame: int) -> int:
        return struct.unpack_from("<h", pcm, frame * _SAMPLE_BYTES)[0]

    @classmethod
    def _max_splice_step(cls, pcm: bytes, starts: list[int], ends: list[int]) -> float:
        maximum = 0.0
        frames = len(pcm) // _SAMPLE_BYTES
        for start, end in zip(starts, ends):
            for left, right in ((start - 1, start), (end - 1, end)):
                if 0 <= left < frames and 0 <= right < frames:
                    step = abs(cls._sample(pcm, left) - cls._sample(pcm, right)) / 32768.0
                    maximum = max(maximum, step)
        return maximum

    @staticmethod
    def _clip_words(record: dict[str, Any], start_frame: int, segment_index: int, speaker_id: str,
        end_frame: int) -> list[dict[str, Any]]:
        words = []
        for source_word in record.get("words", []):
            if not isinstance(source_word, dict):
                continue
            word = dict(source_word)
            start = int(round(float(word.get("start", 0)) * _RATE))
            end = int(round(float(word.get("end", 0)) * _RATE))
            if end < start or start < -_ROUNDING_TOLERANCE_FRAMES or end > end_frame - start_frame + _ROUNDING_TOLERANCE_FRAMES:
                raise ValueError("Replacement clip word timing falls outside its audio.")
            start = min(max(0, start), end_frame - start_frame)
            end = min(max(start, end), end_frame - start_frame)
            word.update(start=(start_frame + start) / _RATE, end=(start_frame + end) / _RATE,
                speakerId=speaker_id, segmentIndex=segment_index)
            words.append(word)
        return words

    @staticmethod
    def _source_words(output: VoiceOutput, edit, segment_index: int, segment, start_frame: int,
        end_frame: int, target_start_frame: int, segment_index_out: int) -> list[dict[str, Any]]:
        selected = []
        for word in output.words:
            if word.get("segmentIndex") == segment_index:
                selected.append(word)
            elif "segmentIndex" not in word and segment.start <= float(word.get("start", -1)) <= segment.end:
                selected.append(word)
        segment_start = start_frame  # spans were already mapped by VoiceFixService._map_segments.
        delta_frames = target_start_frame - segment_start
        result = []
        for source_word in selected:
            word = dict(source_word)
            start_source = round(float(word.get("start", 0)) * _RATE)
            end_source = round(float(word.get("end", 0)) * _RATE)
            if end_source < start_source:
                raise ValueError("Source Voice Output has invalid word timing.")
            for operation in edit.active:
                start_source = operation.map_frame(start_source)
                end_source = operation.map_frame(end_source)
            start = (start_source + delta_frames) / _RATE
            end = (end_source + delta_frames) / _RATE
            # Keep cues within this segment when existing three-decimal metadata
            # rounded an endpoint a few samples beyond its PCM boundary.
            target_end_frame = target_start_frame + max(0, end_frame - start_frame)
            bound_start, bound_end = target_start_frame / _RATE, target_end_frame / _RATE
            if start < bound_start - .0005 or end > bound_end + .0005:
                raise ValueError(f"Source word timing {start:.6f}-{end:.6f}s falls outside row audio {bound_start:.6f}-{bound_end:.6f}s.")
            word.update(start=max(bound_start, start), end=min(bound_end, end), segmentIndex=segment_index_out)
            result.append(word)
        return result

    def _compose(self, snapshot, base_path: Path, base_pcm: bytes):
        frame_count = len(base_pcm) // _SAMPLE_BYTES
        spans, stretched_rows, blockers = self.fixes._map_segments(snapshot.output, snapshot.edit)
        if blockers:
            raise ScriptRevisionConflict("Timeline cannot be composed safely: " + " ".join(blockers))
        if not snapshot.steps or len(snapshot.steps) != len(snapshot.output.segments):
            raise ScriptRevisionConflict("Fix apply needs matching Script rows and Voice Output segments.")
        steps = {step.row.id: step for step in snapshot.steps}
        units = {unit.row_id: unit for unit in snapshot.plan.units}
        last_row = max(snapshot.output.segments, key=lambda segment: (segment.end, segment.start)).row_id
        normalized = {}
        clamps = []
        prior_end = 0
        for segment in sorted(snapshot.output.segments, key=lambda item: (item.start, item.end, item.row_id)):
            if segment.row_id not in spans or segment.row_id not in steps or segment.row_id not in units:
                raise ScriptRevisionConflict("Timeline row has no matching Fix plan unit.")
            start, end = spans[segment.row_id]
            if end > frame_count:
                difference = end - frame_count
                if segment.row_id != last_row or difference > _ROUNDING_TOLERANCE_FRAMES:
                    raise ValueError("Voice Output segment extends beyond preview audio.")
                clamps.append({"rowId": segment.row_id, "frames": difference, "reason": "three-decimal segment endpoint precision"})
                end = frame_count
            if start < prior_end or start < 0 or end <= start or end > frame_count:
                raise ValueError("Voice Output segments overlap or fall outside preview audio.")
            normalized[segment.row_id] = (start, end)
            prior_end = end

        output_pcm = bytearray()
        new_segments = []
        assembled_words = []
        actions = []
        replacement_splice_starts = []
        replacement_splice_ends = []
        target_map = self.fixes.duration_targets(snapshot.output)
        output_cursor = 0
        for index, segment in enumerate(sorted(snapshot.output.segments, key=lambda item: (item.start, item.end, item.row_id))):
            step, unit = steps[segment.row_id], units[segment.row_id]
            start, end = normalized[segment.row_id]
            output_pcm.extend(base_pcm[output_cursor * 2:start * 2])
            output_start = len(output_pcm) // 2
            base_expected_key = self.fixes.speaker.clip_key(step)
            base_clip_identity_matches = bool(segment.clip and _ID.fullmatch(segment.clip)
                and (segment.clip == base_expected_key or segment.clip.startswith(base_expected_key + "-")))
            base_clip_folder = self.outputs.clips_root(snapshot.project_id) / segment.clip if base_clip_identity_matches else None
            base_record = self.fixes.speaker._cached_record(base_clip_folder, step) if base_clip_folder else None
            if base_record is not None:
                source_segment_pcm = base_pcm[start * 2:end * 2]
                selected_pcm = source_segment_pcm
                action = "reused"
                clip_id = segment.clip
                record = base_record
            else:
                folder, record, selected_pcm = self._row_cache(snapshot, unit, step)
                action = "replaced"
                clip_id = folder.name
                replacement_splice_starts.append(output_start)
                replacement_splice_ends.append(output_start + len(selected_pcm) // 2)
            if not selected_pcm:
                raise ValueError(f"Fix row {segment.row_id} has no PCM frames.")
            output_pcm.extend(selected_pcm)
            output_end = len(output_pcm) // 2
            voice = step.plan.voice
            new_segments.append(segment.model_copy(update={
                "voice_id": voice.id,
                "voice_name": voice.name,
                "speaker_profile_id": voice.speaker_profile_id,
                "engine": step.plan.engine,
                "generator_id": step.plan.generator_id,
                "text": step.text,
                "start": output_start / _RATE,
                "end": output_end / _RATE,
                "clip": clip_id,
                "requested_duration": step.duration,
                "duration_report": record.get("durationFit"),
                "script_row": {**step.row.model_dump(mode="json", by_alias=True),
                    "text": step.row.source_text if step.row.source_text is not None else step.row.text,
                    "speakerProfileId": voice.speaker_profile_id},
            }))
            if action == "replaced":
                assembled_words.extend(self._clip_words(record, output_start, index, voice.speaker_profile_id, output_end))
            else:
                assembled_words.extend(self._source_words(snapshot.output, snapshot.edit, index, segment, start, end,
                    output_start, index))
            if segment.row_id in stretched_rows:
                target_map[segment.row_id] = len(selected_pcm) // 2
            actions.append({"rowId": segment.row_id, "action": action, "sourceClip": segment.clip,
                "clip": clip_id, "sourceStartFrame": start, "sourceEndFrame": end,
                "outputStartFrame": output_start, "outputEndFrame": output_end})
            output_cursor = end
        output_pcm.extend(base_pcm[output_cursor * 2:])
        if not output_pcm or len(output_pcm) // 2 > _RATE * 600:
            raise ValueError("Fix output PCM is empty or exceeds ten minutes.")
        samples = struct.iter_unpack("<h", output_pcm)
        if any(sample[0] in (-32768, 32767) for sample in samples):
            raise ValueError("Fix output contains clipped PCM16 samples.")
        max_step = self._max_splice_step(bytes(output_pcm), replacement_splice_starts, replacement_splice_ends)
        if max_step > _BOUNDARY_LIMIT:
            raise ValueError(f"Fix splice boundary step {max_step:.6f} exceeds 0.05 full scale.")
        trusted = sum(word.get("timingTrusted") is True for word in assembled_words)
        quality = ("source" if assembled_words and trusted == len(assembled_words) else
            "partial" if trusted else "needs-alignment")
        old_fix = snapshot.output.parameters.get("fix")
        if not isinstance(old_fix, dict):
            old_fix = {}
        current_rows = {row.id: row for row in snapshot.script.rows}
        kept_targets = {}
        for row_id, frames in target_map.items():
            row = current_rows.get(row_id)
            if row is None:
                continue
            if effective_settings(snapshot.script, row).get("duration") is not None:
                continue
            step = steps[row_id]
            if step.timing is not None:
                continue
            kept_targets[row_id] = frames
        gain_pending = self._has_requested_gain(snapshot)
        report = {
            "version": 1,
            "planKey": snapshot.plan.key,
            "sourceOutputId": snapshot.output.id,
            "sourceOutputAudioSha256": None,
            "sourcePreviewSha256": None,
            "scriptRevision": snapshot.script.revision,
            "editRevision": snapshot.edit.revision,
            "frames": len(output_pcm) // 2,
            "durationPrecisionClamps": clamps,
            "maxSpliceBoundaryStep": max_step,
            "rows": actions,
            "preservedByteRanges": [],
            "audioGainApplied": False,
            "gainPending": gain_pending,
        }
        for action in actions:
            if action["action"] == "reused":
                report["preservedByteRanges"].append({"rowId": action["rowId"],
                    "sourceStartFrame": action["sourceStartFrame"], "sourceEndFrame": action["sourceEndFrame"],
                    "outputStartFrame": action["outputStartFrame"], "outputEndFrame": action["outputEndFrame"]})
        parameters = dict(snapshot.output.parameters)
        allocation = snapshot.steps[0].allocation or {}
        actual_duration = len(output_pcm) / (_SAMPLE_BYTES * _RATE)
        requested_clip = allocation.get("requestedClip")
        duration_error = actual_duration - requested_clip if requested_clip is not None else None
        parameters["durationAllocation"] = allocation
        parameters["durationFit"] = {
            "requestedClip": requested_clip,
            "actualClip": actual_duration,
            "completeRows": len(snapshot.steps) == len(allocation.get("rows", snapshot.steps)),
            "durationError": duration_error,
            "speechQuality": "needs-listening",
            "segments": {},
        }
        parameters["generators"] = {
            step.plan.generator_id: {**step.plan.generation, "language": step.plan.language, "speed": step.plan.speed}
            for step in snapshot.steps
        }
        lineage = {
            **old_fix,
            "version": 1,
            "sourceOutputId": snapshot.output.id,
            "sourceAudioSha256": None,
            "sourcePreviewSha256": None,
            "planKey": snapshot.plan.key,
            "scriptRevision": snapshot.script.revision,
            "editRevision": snapshot.edit.revision,
            "durationTargets": kept_targets,
            "sampleRate": _RATE,
        }
        if not kept_targets:
            lineage.pop("durationTargets", None)
            lineage.pop("sampleRate", None)
        parameters["fix"] = lineage
        words = assembled_words
        first_step = snapshot.steps[0]
        distinct_voices = {step.plan.voice.id for step in snapshot.steps}
        preview_text = " ".join(first_step.text.split()[:6])
        output_name = (f"{first_step.plan.voice.name} · {preview_text}"
            if len(distinct_voices) == 1 and len(snapshot.steps) == 1 else
            f"Script · {len(snapshot.steps)} đoạn · {len(distinct_voices)} voice · {preview_text}")
        if words:
            note = "Fix changed selected speech clips; timing confidence follows source and replacement clip records. Human review remains open."
        else:
            note = "Fix preserved source word timing metadata; no timing review was performed."
        output = snapshot.output.model_copy(update={
            "id": "",  # Replaced after reserve() chooses a unique project-owned ID.
            "name": output_name,
            "text": "\n".join(step.text for step in snapshot.steps),
            "voice_id": first_step.plan.voice.id,
            "voice_name": first_step.plan.voice.name if len(distinct_voices) == 1 else f"{len(distinct_voices)} voice",
            "speaker_profile_id": first_step.plan.voice.speaker_profile_id,
            "engine": first_step.plan.engine,
            "generator_id": first_step.plan.generator_id,
            "parameters": parameters,
            "duration": len(output_pcm) / (_SAMPLE_BYTES * _RATE),
            "sample_rate": _RATE,
            "created_at": datetime.now(timezone.utc),
            "audio_path": "",
            "words": words,
            "word_timing_quality": quality,
            "word_timing_note": note,
            "segments": new_segments,
        })
        return bytes(output_pcm), output, report, target_map

    @staticmethod
    def _has_requested_gain(snapshot) -> bool:
        """Fix publishes raw speech PCM; loudness remains a separate render pass."""
        if float(snapshot.script.settings.gain_db or 0) != 0:
            return True
        segments = {segment.id: segment for segment in snapshot.script.segments}
        rows = {row.id: row for row in snapshot.script.rows}
        for output_segment in snapshot.output.segments:
            row = rows.get(output_segment.row_id)
            if row is None:
                continue
            segment = segments.get(row.segment_id)
            if "gainDb" in snapshot.script.settings.locked:
                region_gain = 0.0
            elif segment is not None and "gainDb" in segment.settings.locked:
                region_gain = float(segment.settings.gain_db or 0)
            elif row.settings.gain_db is not None:
                region_gain = float(row.settings.gain_db)
            elif segment is not None and segment.settings.gain_db is not None:
                region_gain = float(segment.settings.gain_db)
            else:
                region_gain = 0.0
            if region_gain != 0:
                return True
        return False

    def _packet(self, project_id: str, output: VoiceOutput, source_output_id: str, key: str, report: dict,
        rendered: dict | None = None) -> dict:
        return {"output": output,
            "audioUrl": (rendered["audioUrl"] if rendered else
                f"/api/projects/{project_id}/voice-outputs/{output.id}/audio"),
            "report": report, "sourceOutputId": source_output_id, "key": key}

    def _valid_receipt(self, project_id: str, source_output_id: str, receipt: dict, snapshot, source_hash: str,
        preview_hash: str) -> dict:
        if (receipt.get("version") != 1 or receipt.get("sourceOutputId") != source_output_id
                or receipt.get("sourceAudioSha256") != source_hash or receipt.get("sourcePreviewSha256") != preview_hash
                or receipt.get("scriptRevision") != snapshot.script.revision
                or receipt.get("editRevision") != snapshot.edit.revision
                or receipt.get("planKey") != snapshot.plan.key):
            raise KeyError("applied")
        output_id = receipt.get("outputId")
        if not isinstance(output_id, str) or not _ID.fullmatch(output_id):
            raise KeyError("applied")
        output = self.outputs.get(project_id, output_id)
        audio = self.outputs.audio_path(project_id, output_id)
        root = Path(self.fixes.speaker.projects.get(project_id).project_path)
        if (output.id != output_id or output.audio_path != audio.relative_to(root).as_posix()
                or self._metadata_digest(output) != receipt.get("outputMetadataSha256")):
            raise ValueError("Applied Fix output metadata or lineage checksum mismatch.")
        if self._sha(audio) != receipt.get("outputAudioSha256"):
            raise ValueError("Applied Fix output audio checksum mismatch.")
        pcm = self._read_pcm(audio)
        if len(pcm) // 2 != receipt.get("frames"):
            raise ValueError("Applied Fix output frame count mismatch.")
        report = receipt.get("report")
        if not isinstance(report, dict):
            raise ValueError("Applied Fix receipt has no report.")
        rendered = None
        render_key = receipt.get("renderCacheKey")
        if render_key is not None:
            rendered = self.renderer.latest(project_id, output_id)
            if rendered.get("cacheKey") != render_key:
                raise KeyError("applied")
            render_path = self.renderer.audio_path(project_id, output_id, render_key)
            if self._sha(render_path) != receipt.get("renderedAudioSha256"):
                raise ValueError("Applied Fix render checksum mismatch.")
        elif report.get("gainPending"):
            raise KeyError("applied")
        return self._packet(project_id, output, source_output_id, receipt["key"], report, rendered)

    def _current_preview_hash(self, snapshot, *, create: bool) -> tuple[Path, str, str, str]:
        base, preview_hash, relative_path = self._base_audio(snapshot, create_preview=create)
        source = self.outputs.audio_path(snapshot.project_id, snapshot.output_id)
        return base, preview_hash, relative_path, self._sha(source)

    def apply(self, project_id: str, source_output_id: str, expected_script_revision: int,
        expected_edit_revision: int, expected_key: str) -> dict:
        snapshot = self.fixes.validated_snapshot(project_id, source_output_id, expected_script_revision,
            expected_edit_revision, expected_key)
        base_path, preview_hash, preview_relative, source_hash = self._current_preview_hash(snapshot, create=True)
        base_pcm = self._read_pcm(base_path)
        receipt_path = self.receipt_path(project_id, source_output_id)
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            if receipt_path.is_file():
                try:
                    existing = json.loads(receipt_path.read_text(encoding="utf-8"))
                    return self._valid_receipt(project_id, source_output_id, existing, snapshot, source_hash, preview_hash)
                except (OSError, ValueError, KeyError, TypeError, wave.Error):
                    pass

            audio_pcm, candidate, report, _targets = self._compose(snapshot, base_path, base_pcm)
            actual_composed_hash = hashlib.sha256(audio_pcm).hexdigest()
            no_audio_change = audio_pcm == base_pcm
            all_reused = all(row["action"] == "reused" for row in report["rows"])
            metadata_matches = all(
                segment.text == step.text and segment.voice_id == step.plan.voice.id
                and segment.generator_id == step.plan.generator_id and segment.engine == step.plan.engine
                for segment, step in zip(snapshot.output.segments, snapshot.steps)
            )
            no_op = (not snapshot.edit.cursor and all_reused and no_audio_change and metadata_matches
                and candidate.text == snapshot.output.text)
            key_material = {"version": 1, "sourceOutputId": source_output_id,
                "sourceAudioSha256": source_hash, "sourcePreviewSha256": preview_hash,
                "previewPath": preview_relative, "scriptRevision": snapshot.script.revision,
                "editRevision": snapshot.edit.revision, "planKey": snapshot.plan.key,
                "rows": [{"rowId": row["rowId"], "action": row["action"], "sourceClip": row["sourceClip"],
                    "clip": row["clip"]} for row in report["rows"]],
                "composedAudioSha256": actual_composed_hash, "noOp": no_op}
            key = hashlib.sha256(json.dumps(key_material, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            report.update(key=key, sourceOutputAudioSha256=source_hash, sourcePreviewSha256=preview_hash,
                previewPath=preview_relative)

            source_project_root = Path(self.fixes.speaker.projects.get(project_id).project_path)
            output_id = source_output_id
            candidate_audio_hash = source_hash
            candidate_output = snapshot.output
            if not no_op:
                output_id, audio_path = self.outputs.reserve(project_id)
                candidate = candidate.model_copy(update={"id": output_id,
                    "audio_path": audio_path.relative_to(source_project_root).as_posix()})
                lineage = dict(candidate.parameters["fix"])
                lineage.update({"sourceAudioSha256": source_hash, "sourcePreviewSha256": preview_hash,
                    "applyKey": key, "receiptPath": receipt_path.relative_to(source_project_root).as_posix()})
                candidate = candidate.model_copy(update={"parameters": {**candidate.parameters, "fix": lineage}})
                try:
                    self._write_pcm(audio_path, audio_pcm)
                    candidate_audio_hash = self._sha(audio_path)
                    with self.edits._lock, self.scripts._lock:
                        fresh = self.fixes.validated_snapshot(project_id, source_output_id, expected_script_revision,
                            expected_edit_revision, expected_key)
                        fresh_base, fresh_preview_hash, _fresh_rel, fresh_source_hash = self._current_preview_hash(fresh, create=False)
                        if (fresh_source_hash != source_hash or fresh_preview_hash != preview_hash
                                or fresh.plan.key != snapshot.plan.key or self._sha(fresh_base) != preview_hash):
                            raise ScriptRevisionConflict("Script/Timeline/source/cache changed during Apply; output was discarded.")
                        # Recheck every referenced clip before publication, not just when planning.
                        for unit, step in zip(fresh.plan.units, fresh.steps):
                            self._row_cache(fresh, unit, step)
                        with wave.open(str(audio_path), "rb") as rendered:
                            frames = rendered.getnframes()
                            pcm_check = rendered.readframes(frames)
                            if (rendered.getnchannels(), rendered.getsampwidth(), rendered.getframerate(), rendered.getcomptype()) != (1, 2, _RATE, "NONE") or pcm_check != audio_pcm:
                                raise ValueError("Candidate Fix output failed final PCM validation.")
                        self.outputs.save(project_id, candidate)
                except Exception:
                    self.outputs.discard(project_id, output_id)
                    raise
                candidate_output = candidate
            else:
                with self.edits._lock, self.scripts._lock:
                    fresh = self.fixes.validated_snapshot(project_id, source_output_id, expected_script_revision,
                        expected_edit_revision, expected_key)
                    _fresh_base, fresh_preview_hash, _fresh_rel, fresh_source_hash = self._current_preview_hash(fresh, create=False)
                    if fresh_source_hash != source_hash or fresh_preview_hash != preview_hash:
                        raise ScriptRevisionConflict("Script/Timeline/source changed during Apply; retry with a current plan.")

            rendered = None
            render_metadata = {}
            try:
                if report["gainPending"]:
                    rendered = self.renderer.render(project_id, output_id, snapshot.script.revision, 0)
                    render_path = self.renderer.audio_path(project_id, output_id, rendered["cacheKey"])
                    render_metadata = {"renderCacheKey": rendered["cacheKey"],
                        "renderedAudioSha256": self._sha(render_path)}
                    report.update(audioGainApplied=True, gainPending=False, gainReport=rendered["report"])

                # Loudness can take time. Recheck the exact Fix request before the
                # durable pointer is installed; the renderer separately rechecks
                # Script/timeline/output around its own artifact publication.
                with self.edits._lock, self.scripts._lock:
                    fresh = self.fixes.validated_snapshot(project_id, source_output_id, expected_script_revision,
                        expected_edit_revision, expected_key)
                    fresh_base, fresh_preview_hash, _fresh_relative, fresh_source_hash = self._current_preview_hash(fresh, create=False)
                    if (fresh_source_hash != source_hash or fresh_preview_hash != preview_hash
                            or fresh.plan.key != snapshot.plan.key or self._sha(fresh_base) != preview_hash):
                        raise ScriptRevisionConflict("Script/Timeline/source changed during Apply; retry with a current plan.")
                    receipt = {"version": 1, "key": key, "planKey": snapshot.plan.key,
                        "sourceOutputId": source_output_id, "sourceOutputAudioSha256": source_hash,
                        "sourceAudioSha256": source_hash, "sourcePreviewSha256": preview_hash,
                        "previewPath": preview_relative, "scriptRevision": snapshot.script.revision,
                        "editRevision": snapshot.edit.revision, "outputId": output_id,
                        "outputAudioSha256": candidate_audio_hash,
                        "outputMetadataSha256": self._metadata_digest(candidate_output),
                        "frames": len(audio_pcm) // 2,
                        "noOp": no_op, "report": report, **render_metadata}
                    FileProjectRepository._atomic_write(receipt_path, json.dumps(receipt, ensure_ascii=False, indent=2))
            except Exception:
                if not no_op:
                    self.outputs.discard(project_id, output_id)
                raise
            return self._packet(project_id, candidate_output, source_output_id, key, report, rendered)

    def latest(self, project_id: str, source_output_id: str) -> dict:
        receipt_path = self.receipt_path(project_id, source_output_id)
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        snapshot = self.fixes.validated_snapshot(project_id, source_output_id, receipt["scriptRevision"],
            receipt["editRevision"], receipt["planKey"])
        _base, preview_hash, _relative, source_hash = self._current_preview_hash(snapshot, create=False)
        return self._valid_receipt(project_id, source_output_id, receipt, snapshot, source_hash, preview_hash)
