from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from app.domain.models import (
    DatasetExportReport,
    DatasetManifest,
    DatasetSegment,
    SpeakerProfile,
)

# What `extract_audio_tokens` resamples to anyway, and what `analysis.wav`
# already is, so a slice that matches costs one copy of samples and no decode.
TARGET_SAMPLE_RATE = 24_000


class DatasetExportError(RuntimeError):
    pass


class OmniVoiceDatasetExporter:
    """Writes the JSONL pair OmniVoice's tokenizer reads.

    Two things about this format drive the whole adapter.

    Each line is **one audio file**, not a span inside one. There is no offset
    field, so a segment cut out of longer footage has to become a real file on
    disk; only a guided take, whose segment already spans its whole file, can
    point at the audio that is already there.

    Paths are **absolute**, which is the opposite of the manifest's rule. That is
    not a contradiction: the manifest is the portable record and stays
    project-relative, while an export is machine-local scratch that belongs to
    one run and is thrown away with it. Resolving happens here, at the boundary,
    and nothing absolute is ever written back into the project.
    """

    def __init__(self, ffmpeg_path: str | None = None) -> None:
        self.ffmpeg_path = ffmpeg_path or shutil.which("ffmpeg")

    def export(
        self,
        manifest: DatasetManifest,
        project_root: Path,
        run_dir: Path,
        speakers: list[SpeakerProfile] | None = None,
        default_language: str | None = None,
    ) -> DatasetExportReport:
        data_dir = run_dir / "data"
        segment_dir = data_dir / "segments"
        segment_dir.mkdir(parents=True, exist_ok=True)

        language_by_speaker = {
            speaker.id: (speaker.language_id or speaker.language)
            for speaker in (speakers or [])
        }

        lines: dict[str, list[str]] = {"train": [], "dev": []}
        sliced = 0
        reused = 0

        for segment in manifest.segments:
            source = (project_root / segment.audio_path).resolve()
            if not source.is_file():
                raise DatasetExportError(f"Thiếu audio cho đoạn {segment.id}: {segment.audio_path}")

            if self._covers_whole_file(segment):
                audio = source
                reused += 1
            else:
                audio = (segment_dir / f"{segment.id}.wav").resolve()
                self._slice(source, audio, segment.start, segment.end)
                sliced += 1

            record = {
                "id": segment.id,
                "audio_path": str(audio),
                "text": segment.text,
            }
            language = language_by_speaker.get(segment.speaker_profile_id or "") or default_language
            if language:
                record["language_id"] = language
            # Read per sample by the training processor; an engine that does not
            # want it ignores the key rather than failing on it.
            if segment.instruct:
                record["instruct"] = segment.instruct
            lines[segment.split].append(json.dumps(record, ensure_ascii=False))

        train_path = data_dir / "train.jsonl"
        dev_path = data_dir / "dev.jsonl"
        train_path.write_text("\n".join(lines["train"]) + "\n", encoding="utf-8")
        dev_path.write_text("\n".join(lines["dev"]) + "\n", encoding="utf-8")

        if not lines["train"]:
            raise DatasetExportError("Không có mẫu train nào sau khi xuất.")
        if not lines["dev"]:
            # The compiler guarantees a dev segment, so an empty dev file here
            # means the manifest was hand-edited. Failing now is cheaper than
            # failing after tokenization.
            raise DatasetExportError("Không có mẫu dev nào; data config của OmniVoice bắt buộc phải có.")

        return DatasetExportReport(
            train_jsonl=str(train_path),
            dev_jsonl=str(dev_path),
            train_samples=len(lines["train"]),
            dev_samples=len(lines["dev"]),
            sliced_segments=sliced,
            reused_segments=reused,
            total_seconds=round(sum(segment.duration for segment in manifest.segments), 2),
        )

    def write_data_config(self, run_dir: Path, train_lst: Path, dev_lst: Path) -> Path:
        """The config that points at tokenized shards, written after tokenizing.

        Separate from `export` because `data.lst` does not exist until
        `extract_audio_tokens` has run; writing it earlier would name a file that
        is not there yet.
        """
        path = run_dir / "data" / "data_config.json"
        path.write_text(
            json.dumps(
                {
                    "train": [{"manifest_path": [str(train_lst.resolve())], "repeat": 1}],
                    "dev": [{"manifest_path": [str(dev_lst.resolve())], "repeat": 1}],
                },
                indent=4,
            ),
            encoding="utf-8",
        )
        return path

    # ---------- internals ----------

    @staticmethod
    def _covers_whole_file(segment: DatasetSegment) -> bool:
        """A guided take is its own file already; cutting it would only re-encode."""
        return segment.capture_tier == "guided" and segment.start <= 0.001

    def _slice(self, source: Path, destination: Path, start: float, end: float) -> None:
        if not self.ffmpeg_path:
            raise DatasetExportError("Không tìm thấy FFmpeg để cắt đoạn audio.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                self.ffmpeg_path, "-y", "-hide_banner", "-loglevel", "error",
                "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(source),
                "-map", "0:a:0", "-vn", "-ac", "1", "-ar", str(TARGET_SAMPLE_RATE),
                "-c:a", "pcm_s16le", str(destination),
            ],
            check=True,
            capture_output=True,
        )
