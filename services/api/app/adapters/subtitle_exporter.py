from __future__ import annotations

import csv
import html
import io
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.adapters.project_activity_log import ProjectActivityLog
from app.domain.models import ProjectMediaAsset, ProjectRecord, SpeakerProfile

SubtitleExportMode = Literal["sentence", "word", "table"]


@dataclass(frozen=True)
class SubtitleCue:
    start: float
    end: float
    text: str
    diarization_speaker_id: str | None = None
    speaker_profile_id: str | None = None


@dataclass(frozen=True)
class TimedWord:
    text: str
    start: float
    end: float
    diarization_speaker_id: str | None = None
    speaker_profile_id: str | None = None


class SubtitleExporter:
    """Writes portable, speaker-aware exports from persisted word timing."""

    def __init__(self) -> None:
        self.activity = ProjectActivityLog()

    def export(
        self,
        project: ProjectRecord,
        asset: ProjectMediaAsset,
        mode: SubtitleExportMode,
        speakers: list[SpeakerProfile] | None = None,
    ) -> Path:
        words = self._timed_words(asset)
        if not words:
            raise ValueError("Footage chưa có word timing hợp lệ để xuất.")
        profiles = {speaker.id: speaker for speaker in speakers or []}
        destination = self._destination(project, asset, mode)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if mode == "table":
            destination.write_text(self._render_table(words, profiles), encoding="utf-8-sig", newline="")
        else:
            cues = self._word_cues(words) if mode == "word" else self._sentence_cues(words)
            if not cues:
                raise ValueError("Không còn word timing hợp lệ sau các đoạn đã cắt.")
            destination.write_text(self._render_srt(cues, profiles), encoding="utf-8", newline="\n")
        self.activity.append(
            project.project_path,
            "SUBTITLE_EXPORTED",
            f"Xuất {self._mode_label(mode)}: {asset.name}",
            {
                "assetId": asset.id,
                "mode": mode,
                "file": destination.relative_to(Path(project.project_path)).as_posix(),
                "wordCount": len(words),
            },
        )
        return destination

    def _timed_words(self, asset: ProjectMediaAsset) -> list[TimedWord]:
        words: list[TimedWord] = []
        for raw in asset.words:
            text = self._clean_text(str(raw.get("text", "")))
            start = self._number(raw.get("start"))
            end = self._number(raw.get("end"))
            if not text or start is None or end is None or end < start:
                continue
            start = max(0.0, start)
            end = min(end, asset.duration) if asset.duration > 0 else end
            if self._is_removed((start + end) / 2, asset):
                continue
            diarization_speaker_id = self._optional_id(raw.get("diarizationSpeakerId") or raw.get("diarization_speaker_id"))
            speaker_profile_id = self._optional_id(raw.get("speakerId") or raw.get("speaker_id"))
            words.append(TimedWord(text, start, end, diarization_speaker_id, speaker_profile_id))
        return words

    @staticmethod
    def _is_removed(time: float, asset: ProjectMediaAsset) -> bool:
        return any(item.start <= time < item.end for item in asset.removed_ranges)

    def _sentence_cues(self, words: list[TimedWord]) -> list[SubtitleCue]:
        cues: list[SubtitleCue] = []
        current: list[TimedWord] = []
        for word in words:
            if current and self._should_break(current, word):
                cues.append(self._cue_from_words(current))
                current = []
            current.append(word)
            text = self._join_words(current)
            elapsed = current[-1].end - current[0].start
            if self._ends_sentence(word.text) and (len(text) >= 18 or elapsed >= 1.2):
                cues.append(self._cue_from_words(current))
                current = []
        if current:
            cues.append(self._cue_from_words(current))
        return cues

    @staticmethod
    def _speaker_key(word: TimedWord) -> str | None:
        return word.speaker_profile_id or word.diarization_speaker_id

    @classmethod
    def _should_break(cls, current: list[TimedWord], next_word: TimedWord) -> bool:
        text = cls._join_words(current)
        gap = next_word.start - current[-1].end
        next_length = len(text) + 1 + len(next_word.text)
        return (
            cls._speaker_key(current[-1]) != cls._speaker_key(next_word)
            or gap >= 0.68
            or next_length > 76
            or (cls._ends_sentence(current[-1].text) and len(text) >= 14)
        )

    @staticmethod
    def _ends_sentence(text: str) -> bool:
        return bool(re.search(r"[.!?…][\"')\]»”]*$", text))

    @staticmethod
    def _word_cues(words: list[TimedWord]) -> list[SubtitleCue]:
        return [SubtitleCue(word.start, word.end, word.text, word.diarization_speaker_id, word.speaker_profile_id) for word in words]

    def _cue_from_words(self, words: list[TimedWord]) -> SubtitleCue:
        first = words[0]
        return SubtitleCue(first.start, words[-1].end, self._wrap_text(self._join_words(words)), first.diarization_speaker_id, first.speaker_profile_id)

    @staticmethod
    def _clean_text(value: str) -> str:
        return " ".join(value.replace("\r", " ").replace("\n", " ").split())

    @staticmethod
    def _join_words(words: list[TimedWord]) -> str:
        text = " ".join(word.text for word in words)
        return re.sub(r"\s+([,.;:!?…])", r"\1", text)

    @staticmethod
    def _wrap_text(text: str) -> str:
        if len(text) <= 42:
            return text
        midpoint = len(text) // 2
        candidates = [index for index, character in enumerate(text) if character == " "]
        if not candidates:
            return text
        split = min(candidates, key=lambda index: abs(index - midpoint))
        return f"{text[:split]}\n{text[split + 1:]}"

    @staticmethod
    def _optional_id(value: object) -> str | None:
        text = str(value or "").strip()
        return text or None

    @staticmethod
    def _number(value: object) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    @staticmethod
    def _format_timestamp(seconds: float) -> str:
        milliseconds = max(0, int(round(seconds * 1000)))
        hours, remainder = divmod(milliseconds, 3_600_000)
        minutes, remainder = divmod(remainder, 60_000)
        seconds, milliseconds = divmod(remainder, 1_000)
        return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

    def _render_srt(self, cues: list[SubtitleCue], profiles: dict[str, SpeakerProfile]) -> str:
        blocks = []
        for index, cue in enumerate(cues, start=1):
            end = max(cue.end, cue.start + 0.001)
            blocks.append(f"{index}\n{self._format_timestamp(cue.start)} --> {self._format_timestamp(end)}\n{self._render_cue_text(cue, profiles)}")
        return "\n\n".join(blocks) + "\n"

    def _render_cue_text(self, cue: SubtitleCue, profiles: dict[str, SpeakerProfile]) -> str:
        profile = profiles.get(cue.speaker_profile_id or "")
        label = profile.name if profile else self._speaker_label(cue.diarization_speaker_id)
        if not label:
            return html.escape(cue.text)
        color = profile.color if profile else "#F3F0E7"
        return f'<font color="{color}">{html.escape(label)}</font>: {html.escape(cue.text)}'

    @staticmethod
    def _speaker_label(diarization_speaker_id: str | None) -> str | None:
        if not diarization_speaker_id:
            return None
        number = re.search(r"(?:speaker|spk)[-_ ]?(\d+)$", diarization_speaker_id, re.IGNORECASE)
        return f"Speaker {number.group(1)}" if number else diarization_speaker_id.replace("_", " ").replace("-", " ")

    def _render_table(self, words: list[TimedWord], profiles: dict[str, SpeakerProfile]) -> str:
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["Speaker", "Content", "Start", "End"])
        current: list[TimedWord] = []
        for word in words:
            if current and self._speaker_key(current[-1]) != self._speaker_key(word):
                self._write_table_row(writer, current, profiles)
                current = []
            current.append(word)
        if current:
            self._write_table_row(writer, current, profiles)
        return output.getvalue()

    def _write_table_row(self, writer: csv.writer, words: list[TimedWord], profiles: dict[str, SpeakerProfile]) -> None:
        first = words[0]
        profile = profiles.get(first.speaker_profile_id or "")
        speaker = profile.name if profile else self._speaker_label(first.diarization_speaker_id) or "Speaker 1"
        writer.writerow([speaker, self._join_words(words), f"{first.start:.3f}", f"{words[-1].end:.3f}"])

    @staticmethod
    def _destination(project: ProjectRecord, asset: ProjectMediaAsset, mode: SubtitleExportMode) -> Path:
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(asset.name).stem).strip("-._") or asset.id
        extension = "csv" if mode == "table" else "srt"
        return Path(project.project_path) / "exports" / "subtitles" / f"{stem}--{mode}.{extension}"

    @staticmethod
    def _mode_label(mode: SubtitleExportMode) -> str:
        return {"sentence": "SRT theo câu", "word": "SRT từng từ", "table": "bảng Script CSV"}[mode]