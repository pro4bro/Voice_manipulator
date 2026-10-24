from __future__ import annotations

import hashlib
import math
import struct
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.domain.models import VoiceOutput
from app.domain.voice_composition import VoiceComposition, VoiceCompositionClip

RATE = 24_000
SAMPLE_BYTES = 2


@dataclass(frozen=True)
class _Source:
    output: VoiceOutput
    path: Path
    pcm: bytes
    frames: int
    sha256: str


@dataclass(frozen=True)
class _Interval:
    start: int
    end: int
    layer_index: int
    clip_index: int
    clip: VoiceCompositionClip


class VoiceLayerCompositor:
    """Render project-owned Voice Outputs into a bottom-layer-wins PCM WAV."""

    def __init__(self, outputs: FileVoiceOutputs, crossfade_frames: int = 240) -> None:
        self.outputs = outputs
        self.crossfade_frames = max(0, min(int(crossfade_frames), 2400))

    @staticmethod
    def _source_frames(clip: VoiceCompositionClip, source: _Source) -> None:
        if clip.source_start_frame + clip.frame_count > source.frames:
            raise ValueError(f"Composition clip {clip.id} extends past source audio.")

    @staticmethod
    def _read_source(outputs: FileVoiceOutputs, project_id: str, output_id: str) -> _Source:
        try:
            output = outputs.get(project_id, output_id)
            path = outputs.audio_path(project_id, output_id)
            with wave.open(str(path), "rb") as audio:
                channels, width, rate, frames = (audio.getnchannels(), audio.getsampwidth(),
                                                  audio.getframerate(), audio.getnframes())
                if audio.getcomptype() != "NONE" or (channels, width, rate) != (1, 2, RATE):
                    raise ValueError(f"Source output {output_id} is not mono PCM16 at 24 kHz.")
                pcm = audio.readframes(frames)
            if not frames or len(pcm) != frames * SAMPLE_BYTES:
                raise ValueError(f"Source output {output_id} WAV is truncated or empty.")
            if output.sample_rate != RATE or round(output.duration * RATE) != frames:
                raise ValueError(f"Source output {output_id} metadata duration does not match its WAV.")
            return _Source(output, path, pcm, frames, hashlib.sha256(path.read_bytes()).hexdigest())
        except (FileNotFoundError, KeyError) as exc:
            raise ValueError(f"Composition source audio is missing: {output_id}.") from exc
        except (wave.Error, EOFError, OSError) as exc:
            raise ValueError(f"Composition source WAV is invalid: {output_id}.") from exc

    @staticmethod
    def _visible_intervals(composition: VoiceComposition) -> list[_Interval]:
        events: dict[int, list[tuple[bool, int, int, VoiceCompositionClip]]] = {}
        solo_active = any(layer.solo for layer in composition.layers)
        for layer_index, layer in enumerate(composition.layers):
            # Disabled (muted) layers never contribute, including when soloed.
            if not layer.enabled or (solo_active and not layer.solo):
                continue
            for clip_index, clip in enumerate(layer.clips):
                if not clip.enabled:
                    continue
                events.setdefault(clip.start_frame, []).append((True, layer_index, clip_index, clip))
                events.setdefault(clip.end_frame, []).append((False, layer_index, clip_index, clip))
        if not events:
            return []
        positions = sorted(events)
        active: dict[tuple[int, int], VoiceCompositionClip] = {}
        intervals: list[_Interval] = []
        for index, position in enumerate(positions[:-1]):
            for adding, layer_index, clip_index, clip in events[position]:
                key = (layer_index, clip_index)
                if not adding:
                    active.pop(key, None)
            for adding, layer_index, clip_index, clip in events[position]:
                if adding:
                    active[(layer_index, clip_index)] = clip
            next_position = positions[index + 1]
            if not active or next_position <= position:
                continue
            layer_index, clip_index = max(active)
            winner = _Interval(position, next_position, layer_index, clip_index, active[(layer_index, clip_index)])
            if intervals and intervals[-1].end == winner.start and intervals[-1].clip.id == winner.clip.id:
                previous = intervals[-1]
                intervals[-1] = _Interval(previous.start, winner.end, winner.layer_index, winner.clip_index, winner.clip)
            else:
                intervals.append(winner)
        return intervals

    @staticmethod
    def _sample(pcm: bytes, frame: int) -> int:
        return struct.unpack_from("<h", pcm, frame * SAMPLE_BYTES)[0]

    def _crossfade(
        self,
        pcm: bytearray,
        intervals: list[_Interval],
        sources: dict[str, _Source],
    ) -> tuple[list[dict[str, Any]], list[tuple[int, int]]]:
        seams: list[dict[str, Any]] = []
        excluded: list[tuple[int, int]] = []
        reserved_end = -1
        for left, right in zip(intervals, intervals[1:]):
            seam = left.end
            fade_frames = 0
            if left.end == right.start and self.crossfade_frames:
                common_start = max(left.clip.start_frame, right.clip.start_frame)
                common_end = min(left.clip.end_frame, right.clip.end_frame)
                if common_start < seam < common_end:
                    fade_frames = min(self.crossfade_frames, seam - common_start, common_end - seam)
                    start, end = seam - fade_frames, seam + fade_frames
                elif common_start == seam and common_end > seam:
                    fade_frames = min(self.crossfade_frames, common_end - seam)
                    start, end = seam, seam + fade_frames
                elif common_end == seam and common_start < seam:
                    fade_frames = min(self.crossfade_frames, seam - common_start)
                    start, end = seam - fade_frames, seam
                else:
                    start, end = seam, seam
                if fade_frames and start < reserved_end:
                    fade_frames = 0
                if fade_frames:
                    left_pcm = sources[left.clip.output_id].pcm
                    right_pcm = sources[right.clip.output_id].pcm
                    for frame in range(start, end):
                        left_source_frame = left.clip.source_start_frame + frame - left.clip.start_frame
                        right_source_frame = right.clip.source_start_frame + frame - right.clip.start_frame
                        if start < seam < end:
                            alpha = (frame - start) / max(1, end - start - 1)
                        else:
                            alpha = (frame - start + 1) / fade_frames
                        value = round(self._sample(left_pcm, left_source_frame) * (1 - alpha) +
                                      self._sample(right_pcm, right_source_frame) * alpha)
                        struct.pack_into("<h", pcm, frame * SAMPLE_BYTES, max(-32768, min(32767, value)))
                    excluded.append((start, end))
                    reserved_end = end
            seams.append({"frame": seam, "leftClipId": left.clip.id, "rightClipId": right.clip.id,
                          "rightStartFrame": right.start, "gapFrames": max(0, right.start - left.end),
                          "crossfaded": fade_frames > 0, "crossfadeFrames": fade_frames})
        if intervals:
            first, last = intervals[0], intervals[-1]
            seams.insert(0, {"frame": first.start, "leftClipId": None, "rightClipId": first.clip.id,
                             "rightStartFrame": first.start, "gapFrames": first.start,
                             "crossfaded": False, "crossfadeFrames": 0})
            seams.append({"frame": last.end, "leftClipId": last.clip.id, "rightClipId": None,
                          "rightStartFrame": last.end, "gapFrames": 0,
                          "crossfaded": False, "crossfadeFrames": 0})
        return seams, excluded

    @staticmethod
    def _map_metadata(
        intervals: list[_Interval], sources: dict[str, _Source], excluded: list[tuple[int, int]],
        template_segments: list[Any],
    ) -> tuple[list[dict[str, Any]], list[Any], bool]:
        words: list[dict[str, Any]] = []
        segments = [segment.model_copy(deep=True) for segment in template_segments]
        target_segment_indices = {segment.row_id: index for index, segment in enumerate(template_segments)}
        cropped_words = False
        for interval in intervals:
            source = sources[interval.clip.output_id]
            source_start = interval.clip.source_start_frame + interval.start - interval.clip.start_frame
            source_end = source_start + interval.end - interval.start
            for source_word in source.output.words:
                if not isinstance(source_word, dict) or "start" not in source_word or "end" not in source_word:
                    cropped_words = True
                    continue
                try:
                    word_start = round(float(source_word["start"]) * RATE)
                    word_end = round(float(source_word["end"]) * RATE)
                except (TypeError, ValueError, OverflowError) as exc:
                    raise ValueError(f"Source output {source.output.id} has invalid word timing.") from exc
                if not math.isfinite(float(source_word["start"])) or not math.isfinite(float(source_word["end"])) or word_end < word_start:
                    raise ValueError(f"Source output {source.output.id} has invalid word timing.")
                if word_end <= source_start or word_start >= source_end:
                    continue
                if word_start < source_start or word_end > source_end:
                    cropped_words = True
                    continue
                mapped_start = interval.clip.start_frame + word_start - interval.clip.source_start_frame
                mapped_end = interval.clip.start_frame + word_end - interval.clip.source_start_frame
                word = dict(source_word)
                word.update(start=mapped_start / RATE, end=mapped_end / RATE)
                if any(mapped_start < end and start < mapped_end for start, end in excluded):
                    # The PCM is blended at this boundary, but the complete word
                    # remains visible and its timing geometry is unchanged.
                    word["timingNote"] = "Audio boundary is crossfaded; timing retains source geometry."
                source_segment_index = source_word.get("segmentIndex")
                source_row_id = None
                if isinstance(source_segment_index, int) and 0 <= source_segment_index < len(source.output.segments):
                    source_row_id = source.output.segments[source_segment_index].row_id
                else:
                    for source_segment in source.output.segments:
                        if source_segment.start * RATE <= word_start and word_end <= source_segment.end * RATE:
                            source_row_id = source_segment.row_id
                            break
                if template_segments:
                    target_index = target_segment_indices.get(source_row_id)
                    if target_index is None:
                        cropped_words = True
                        continue
                    word["segmentIndex"] = target_index
                elif source_row_id is None:
                    word.pop("segmentIndex", None)
                else:
                    word.pop("segmentIndex", None)
                words.append(word)
        return words, segments, cropped_words

    @staticmethod
    def _validate_written_wav(path: Path, expected_frames: int) -> None:
        try:
            with wave.open(str(path), "rb") as audio:
                if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, RATE, "NONE"):
                    raise ValueError("Rendered WAV is not mono PCM16 at 24 kHz.")
                frames = audio.getnframes()
                payload = audio.readframes(frames)
            if frames != expected_frames or len(payload) != expected_frames * SAMPLE_BYTES:
                raise ValueError("Rendered WAV frame count does not match its composition.")
        except (wave.Error, EOFError, OSError) as exc:
            raise ValueError("Rendered WAV failed validation.") from exc

    def render(self, project_id: str, composition: VoiceComposition, template_output_id: str) -> VoiceOutput:
        template = self.outputs.get(project_id, template_output_id)
        solo_active = any(layer.solo for layer in composition.layers)
        required_ids = {template_output_id}
        required_ids.update(clip.output_id for layer in composition.layers for clip in layer.clips
                            if layer.enabled and (not solo_active or layer.solo) and clip.enabled)
        sources = {output_id: self._read_source(self.outputs, project_id, output_id) for output_id in required_ids}
        intervals = self._visible_intervals(composition)
        for interval in intervals:
            self._source_frames(interval.clip, sources[interval.clip.output_id])

        pcm = bytearray(composition.duration_frames * SAMPLE_BYTES)
        for interval in intervals:
            source = sources[interval.clip.output_id]
            source_start = interval.clip.source_start_frame + interval.start - interval.clip.start_frame
            source_end = source_start + interval.end - interval.start
            target_start, target_end = interval.start * SAMPLE_BYTES, interval.end * SAMPLE_BYTES
            pcm[target_start:target_end] = source.pcm[source_start * SAMPLE_BYTES:source_end * SAMPLE_BYTES]
        seams, excluded_cue_ranges = self._crossfade(pcm, intervals, sources)
        words, segments, cropped_words = self._map_metadata(
            intervals, sources, excluded_cue_ranges, template.segments)

        output_id, audio_path = self.outputs.reserve(project_id)
        accepted = False
        try:
            with wave.open(str(audio_path), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(SAMPLE_BYTES)
                audio.setframerate(RATE)
                audio.writeframes(pcm)
            self._validate_written_wav(audio_path, composition.duration_frames)
            provenance = {
                "revision": composition.revision,
                "durationFrames": composition.duration_frames,
                "sampleRate": RATE,
                "channels": 1,
                "format": "pcm_s16le",
                "layers": composition.model_dump(mode="json", by_alias=True)["layers"],
                "templateOutputId": template_output_id,
                "sources": [{"outputId": output_id_, "sha256": source.sha256, "frames": source.frames}
                            for output_id_, source in sorted(sources.items())],
                "seams": seams,
            }
            candidate = template.model_copy(update={
                "id": output_id,
                "name": f"{template.name} composition",
                "parameters": {**template.parameters, "voiceComposition": provenance},
                "duration": composition.duration_frames / RATE,
                "sample_rate": RATE,
                "audio_path": f"assets/voice-output/{output_id}/audio.wav",
                "audio_available": True,
                "words": words,
                "word_timing_quality": ("partial" if cropped_words else template.word_timing_quality or "source") if words else None,
                "word_timing_note": "Cropped or occluded source words were omitted from trusted cues." if cropped_words else None,
                "segments": segments,
            })
            saved = self.outputs.save(project_id, candidate)
            accepted = True
            return saved
        finally:
            if not accepted:
                self.outputs.discard(project_id, output_id)
