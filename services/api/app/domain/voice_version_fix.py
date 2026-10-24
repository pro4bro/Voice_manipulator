from __future__ import annotations

import hashlib
import math
from difflib import SequenceMatcher
from typing import Any

from app.domain.models import VoiceOutput, VoiceOutputSegment
from app.domain.script_word_alignment import normalized
from app.domain.voice_script_document import ScriptSentence, VoiceScriptDocument, effective_settings

_FRAME_TOLERANCE = 12


def _frames(seconds: Any, sample_rate: int, total_frames: int) -> int | None:
    try:
        value = float(seconds)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(value):
        return None
    frame = round(value * sample_rate)
    if frame < -_FRAME_TOLERANCE or frame > total_frames + _FRAME_TOLERANCE:
        return None
    return min(total_frames, max(0, frame))


def _generator_parameters(config: dict[str, Any], generator_id: str) -> tuple[dict[str, Any], Any]:
    source = config.get("generatorParameters", config.get("generator_parameters", config.get("generators")))
    if isinstance(source, dict):
        params = source.get(generator_id, {})
        params = dict(params) if isinstance(params, dict) else {"value": params}
    else:
        # Some callers provide the selected generator's parameters directly.
        control_keys = {"speed", "gain", "generationEngine", "generation_engine"}
        params = {key: value for key, value in config.items() if key not in control_keys}
    speed = params.pop("speed", config.get("speed", 1))
    return params, speed


def _configuration_changed(current: dict[str, Any], generated: dict[str, Any], generator_id: str) -> bool:
    current_params, current_speed = _generator_parameters(current, generator_id)
    generated_params, generated_speed = _generator_parameters(generated, generator_id)
    return (current_params != generated_params or current_speed != generated_speed or
            current.get("generationEngine", current.get("generation_engine")) !=
            generated.get("generationEngine", generated.get("generation_engine")))


def _effective_synthesis_settings(document: VoiceScriptDocument, row: ScriptSentence) -> dict[str, Any]:
    values = effective_settings(document, row)
    values.pop("locked", None)
    return values


def _safe_row_span(segment: VoiceOutputSegment, sample_rate: int, total_frames: int) -> tuple[int, int] | None:
    start = _frames(segment.start, sample_rate, total_frames)
    end = _frames(segment.end, sample_rate, total_frames)
    if start is None or end is None or end <= start:
        return None
    return start, end


def _trusted_row_words(
    output: VoiceOutput, row_index: int, old_tokens: list[str], segment: VoiceOutputSegment,
    sample_rate: int, total_frames: int,
) -> list[tuple[int, int]] | None:
    selected = [word for word in output.words if isinstance(word, dict) and word.get("segmentIndex") == row_index]
    if len(selected) != len(old_tokens):
        return None
    row_span = _safe_row_span(segment, sample_rate, total_frames)
    if row_span is None:
        return None
    mapped: list[tuple[int, int]] = []
    previous_start = previous_end = -1
    for token, word in zip(old_tokens, selected):
        word_text = word.get("text")
        if (not isinstance(word_text, str) or normalized(token) != normalized(word_text) or
                word.get("timingTrusted") is not True):
            return None
        start = _frames(word.get("start"), sample_rate, total_frames)
        end = _frames(word.get("end"), sample_rate, total_frames)
        if (start is None or end is None or end <= start or start < previous_start or end < previous_end or
                start < row_span[0] - _FRAME_TOLERANCE or end > row_span[1] + _FRAME_TOLERANCE):
            return None
        start = max(row_span[0], start)
        end = min(row_span[1], end)
        if end <= start:
            return None
        mapped.append((start, end))
        previous_start, previous_end = start, end
    return mapped


def _region(
    row_id: str, text: str, voice_id: str, speaker_profile_id: str | None,
    settings: dict[str, Any], start: int, end: int, reason: str, ordinal: int,
) -> dict[str, Any]:
    digest = hashlib.sha256(f"{row_id}\0{start}\0{end}\0{text}\0{reason}\0{ordinal}".encode("utf-8")).hexdigest()[:16]
    return {
        "id": f"region-{digest}",
        "rowId": row_id,
        "text": text,
        "voiceId": voice_id,
        "speakerProfileId": speaker_profile_id,
        "startFrame": start,
        "frameCount": end - start,
        "settings": {key: value for key, value in settings.items() if key != "duration"},
        "reason": reason,
    }


def plan_version_fix(
    current_script: VoiceScriptDocument,
    generated_script: VoiceScriptDocument | None,
    current_config: dict[str, Any],
    generated_config: dict[str, Any],
    output: VoiceOutput,
) -> dict[str, Any]:
    """Plan bounded row-local replacements against the last generated Script snapshot."""
    if generated_script is None:
        return {"regions": [], "blockers": [
            "No generated Script snapshot is available; run Full generation or review the Timeline before local fixes."]}

    current_rows = current_script.rows
    generated_rows = generated_script.rows
    current_ids = [row.id for row in current_rows]
    generated_ids = [row.id for row in generated_rows]
    output_ids = [segment.row_id for segment in output.segments]
    if current_ids != generated_ids:
        return {"regions": [], "blockers": [
            "Script rows were added, removed, or reordered; run Full generation or review the Timeline before local fixes."]}
    generated_nonempty_ids = [row.id for row in generated_rows if row.text.strip()]
    if output_ids != generated_nonempty_ids or len(set(output_ids)) != len(output_ids):
        return {"regions": [], "blockers": [
            "Generated output row IDs do not match the Script snapshot; review the Timeline before local fixes."]}
    sample_rate = output.sample_rate
    if sample_rate <= 0 or not math.isfinite(output.duration) or output.duration <= 0:
        return {"regions": [], "blockers": ["Generated output has no valid frame clock or duration."]}
    total_frames = round(output.duration * sample_rate)
    segments = {segment.row_id: segment for segment in output.segments}
    regions: list[dict[str, Any]] = []
    blockers: list[str] = []

    for row_index, (current_row, generated_row) in enumerate(zip(current_rows, generated_rows)):
        if not generated_row.text.strip():
            if current_row.text.strip():
                blockers.append(f"Row {current_row.id} was empty in the Full output; Generate Full is required to establish its timing.")
            continue
        segment = segments[current_row.id]
        row_span = _safe_row_span(segment, sample_rate, total_frames)
        if row_span is None:
            blockers.append(f"Output row {current_row.id} has no safe source span; review the Timeline before local fixes.")
            continue
        current_settings = effective_settings(current_script, current_row)
        current_synthesis_settings = _effective_synthesis_settings(current_script, current_row)
        generated_settings = _effective_synthesis_settings(generated_script, generated_row)
        voice_changed = (current_row.voice_id != generated_row.voice_id or
                         current_row.speaker_profile_id != generated_row.speaker_profile_id)
        settings_changed = (current_synthesis_settings != generated_settings or
                            current_row.segment_id != generated_row.segment_id)
        config_changed = _configuration_changed(current_config, generated_config, segment.generator_id)
        old_tokens = generated_row.text.split()
        new_tokens = current_row.text.split()
        text_changed = old_tokens != new_tokens
        if not (voice_changed or settings_changed or config_changed or text_changed):
            continue

        effective_voice = current_row.voice_id or segment.voice_id
        effective_speaker = (current_row.speaker_profile_id or generated_row.speaker_profile_id or
                             segment.speaker_profile_id)
        if voice_changed or settings_changed or config_changed:
            reasons = []
            if voice_changed:
                reasons.append("voice changed")
            if settings_changed:
                reasons.append("effective settings changed")
            if config_changed:
                reasons.append("generator configuration changed")
            regions.append(_region(current_row.id, current_row.text, effective_voice, effective_speaker,
                current_settings, row_span[0], row_span[1], "; ".join(reasons) + "; replacing the full row.", len(regions)))
            continue

        old_words = _trusted_row_words(output, output_ids.index(current_row.id), old_tokens, segment, sample_rate, total_frames)
        if old_words is None:
            regions.append(_region(current_row.id, current_row.text, effective_voice, effective_speaker,
                current_settings, row_span[0], row_span[1],
                "Trusted word alignment is unavailable or does not match the generated row; full-row fallback.",
                len(regions)))
            continue

        candidates: list[dict[str, Any]] = []
        matcher = SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
        for tag, old_start, old_end, new_start, new_end in matcher.get_opcodes():
            if tag == "equal":
                continue
            source_start, source_end = old_start, old_end
            replacement_start, replacement_end = new_start, new_end
            if tag in {"insert", "delete"}:
                source_start = max(0, old_start - 1)
                source_end = min(len(old_tokens), old_end + 1)
                replacement_start = max(0, new_start - 1)
                replacement_end = min(len(new_tokens), new_end + 1)
            if source_start == source_end:
                # An empty source row has no word edges; use its known row span.
                if not old_words:
                    candidates = []
                    break
                source_start = max(0, min(len(old_words) - 1, source_start - 1))
                source_end = min(len(old_words), source_start + 1)
            if source_end > len(old_words) or source_start >= source_end:
                candidates = []
                break
            text = " ".join(new_tokens[replacement_start:replacement_end])
            candidates.append({"start": old_words[source_start][0], "end": old_words[source_end - 1][1],
                               "newStart": replacement_start, "newEnd": replacement_end, "text": text})

        if not candidates:
            # The edited row has no mapped source token (for example an insertion into an empty row).
            regions.append(_region(current_row.id, current_row.text, effective_voice, effective_speaker,
                current_settings, row_span[0], row_span[1],
                "No source word edges exist for the change; full-row fallback.", len(regions)))
            continue

        merged: list[dict[str, Any]] = []
        for candidate in candidates:
            if merged and candidate["start"] < merged[-1]["end"]:
                previous = merged[-1]
                previous["end"] = max(previous["end"], candidate["end"])
                previous["newStart"] = min(previous["newStart"], candidate["newStart"])
                previous["newEnd"] = max(previous["newEnd"], candidate["newEnd"])
                previous["text"] = " ".join(new_tokens[previous["newStart"]:previous["newEnd"]])
            else:
                merged.append(candidate)
        for candidate in merged:
            regions.append(_region(current_row.id, candidate["text"], effective_voice, effective_speaker,
                current_settings, candidate["start"], candidate["end"], "Script text changed.", len(regions)))

    return {"regions": regions, "blockers": blockers}
