"""Merge reviewed OBS track transcripts on the imported video's timeline."""

from __future__ import annotations

import html
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.adapters.project_activity_log import ProjectActivityLog
from app.adapters.subtitle_exporter import SubtitleCue, SubtitleExporter, TimedWord
from app.domain.models import ObsCaptureSession, ProjectRecord
from app.domain.ports import MediaLibrary


@dataclass(frozen=True)
class SourceStatus:
    asset_id: str
    source_id: str | None
    source_label: str
    transcription_status: str
    ready_cues: int
    skipped_cues: int
    unsafe_words: int


class ObsSessionSubtitles:
    def __init__(self, media: MediaLibrary, ffmpeg_path: str | None = None,
                 ffprobe_path: str | None = None) -> None:
        self.media = media
        self.ffmpeg = ffmpeg_path
        self.ffprobe = ffprobe_path
        self.subtitles = SubtitleExporter()
        self.activity = ProjectActivityLog()

    def collect(self, project_id: str, session: ObsCaptureSession, asset_ids: set[str] | None = None) -> tuple[list[tuple[SubtitleCue, str]], list[SourceStatus]]:
        if session.status != "ready" or not session.recording_path or session.duration <= 0:
            raise ValueError("Bản ghi OBS chưa sẵn sàng để xuất subtitle.")
        track_ids = {track.asset_id for track in session.tracks}
        if asset_ids is not None and (not asset_ids or not asset_ids <= track_ids):
            raise ValueError("Chọn ít nhất một track thuộc phiên OBS này để xuất SRT.")
        merged: list[tuple[SubtitleCue, str]] = []
        statuses: list[SourceStatus] = []
        for track in session.tracks:
            if asset_ids is not None and track.asset_id not in asset_ids:
                continue
            asset = self.media.get(project_id, track.asset_id)
            words: list[TimedWord] = []
            groups: list[list[TimedWord]] = []
            unsafe_words = 0
            for raw in asset.words:
                text = self.subtitles._clean_text(str(raw.get("text", "")))
                start = self.subtitles._number(raw.get("start"))
                end = self.subtitles._number(raw.get("end"))
                if (not text or start is None or end is None or start < 0
                        or end <= start or (asset.duration > 0 and end > asset.duration + 0.001)):
                    unsafe_words += 1
                    if words:
                        groups.append(words)
                        words = []
                    continue
                if self.subtitles._is_removed((start + end) / 2, asset):
                    if words:
                        groups.append(words)
                        words = []
                    continue
                words.append(TimedWord(
                    text, start, end,
                    self.subtitles._optional_id(raw.get("diarizationSpeakerId") or raw.get("diarization_speaker_id")),
                    self.subtitles._optional_id(raw.get("speakerId") or raw.get("speaker_id")),
                    raw.get("timingTrusted") is True,
                ))
            if words:
                groups.append(words)
            candidates = [cue for group in groups for cue in self.subtitles._sentence_cues(group)]
            ready = skipped = 0
            for cue in candidates:
                start = cue.start + track.video_offset_seconds
                end = cue.end + track.video_offset_seconds
                trusted = (
                    asset.word_timing_quality in {"source", "partial"}
                    and cue.timing_trusted and 0 <= start < session.duration
                    and start + 0.001 <= min(end, session.duration)
                    and end <= session.duration + 0.001
                )
                if trusted:
                    merged.append((SubtitleCue(start, min(end, session.duration), cue.text), track.source_label))
                    ready += 1
                else:
                    skipped += 1
            statuses.append(SourceStatus(
                asset_id=asset.id, source_id=track.source_id,
                source_label=track.source_label,
                transcription_status=asset.transcription_status,
                ready_cues=ready, skipped_cues=skipped, unsafe_words=unsafe_words,
            ))
        merged.sort(key=lambda item: (item[0].start, item[0].end, item[1]))
        return merged, statuses

    def status(self, project_id: str, session: ObsCaptureSession) -> dict:
        merged, sources = self.collect(project_id, session)
        return {
            "sessionId": session.id,
            "readyCues": len(merged),
            "skippedCues": sum(source.skipped_cues for source in sources),
            "unsafeWords": sum(source.unsafe_words for source in sources),
            "sources": [{
                "assetId": source.asset_id,
                "sourceId": source.source_id,
                "sourceLabel": source.source_label,
                "transcriptionStatus": source.transcription_status,
                "readyCues": source.ready_cues,
                "skippedCues": source.skipped_cues,
                "unsafeWords": source.unsafe_words,
            } for source in sources],
        }

    def export(self, project: ProjectRecord, session: ObsCaptureSession, asset_ids: set[str] | None = None) -> Path:
        merged, sources = self.collect(project.id, session, asset_ids)
        if not merged:
            raise ValueError("Chưa có cue đáng tin để xuất SRT phiên OBS.")
        skipped = sum(source.skipped_cues for source in sources)
        suffix = "--" + "-".join(source.asset_id for source in sources)
        destination = Path(project.project_path) / "exports" / "subtitles" / f"{session.id}{suffix}--session.srt"
        destination.parent.mkdir(parents=True, exist_ok=True)
        blocks = []
        for index, (cue, label) in enumerate(merged, start=1):
            # The source prefix is part of the reviewed session export; it never
            # mutates the source asset's own transcript or timing.
            text = html.escape(self.subtitles._clean_text(label)) + ": " + html.escape(cue.text)
            blocks.append(
                f"{index}\n{self.subtitles._format_timestamp(cue.start)} --> "
                f"{self.subtitles._format_timestamp(cue.end)}\n{text}"
            )
        unsafe_words = sum(source.unsafe_words for source in sources)
        temporary = destination.with_suffix(".srt.tmp")
        temporary.write_text("\n\n".join(blocks) + "\n", encoding="utf-8", newline="\n")
        temporary.replace(destination)
        self.activity.append(project.project_path, "OBS_SESSION_SRT_EXPORTED", "Xuất SRT phiên OBS", {
            "sessionId": session.id, "file": destination.relative_to(Path(project.project_path)).as_posix(),
            "readyCues": len(merged), "skippedCues": skipped, "unsafeWords": unsafe_words,
            "sourceAssetIds": [source.asset_id for source in sources],
        })
        return destination

    def render(self, project: ProjectRecord, session: ObsCaptureSession,
               asset_ids: set[str] | None = None) -> Path:
        """Burn reviewed cues into a new MP4 and publish only a validated file."""
        if not self.ffmpeg or not self.ffprobe:
            raise RuntimeError("Cần FFmpeg và FFprobe để render hard subtitle.")
        srt = self.export(project, session, asset_ids)
        root = Path(project.project_path).resolve()
        if not session.recording_path:
            raise ValueError("Phiên OBS không có video gốc.")
        source = (root / session.recording_path).resolve()
        if root not in source.parents or not source.is_file():
            raise ValueError("Video gốc của phiên OBS không còn trong project.")
        selected = [track.asset_id for track in session.tracks
                    if asset_ids is None or track.asset_id in asset_ids]
        suffix = "--" + "-".join(selected)
        destination = root / "exports" / "videos" / f"{session.id}{suffix}--hard-subtitle.mp4"
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".mp4.part")
        temporary.unlink(missing_ok=True)
        # Run beside the SRT so the subtitles filter receives a portable simple
        # filename rather than a Windows drive path that requires filter escaping.
        filter_value = (
            f"subtitles=filename='{srt.name}':charenc=UTF-8:"
            "force_style='FontName=Segoe UI,FontSize=22,Outline=2,Shadow=0,"
            "MarginV=28,Alignment=2'"
        )
        command = [
            str(self.ffmpeg), "-y", "-nostdin", "-hide_banner", "-loglevel", "error",
            "-i", str(source), "-vf", filter_value, "-map", "0:v:0", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
            "-f", "mp4", str(temporary),
        ]
        try:
            result = subprocess.run(
                command, cwd=srt.parent, capture_output=True, text=True,
                encoding="utf-8", errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if result.returncode or not temporary.is_file() or temporary.stat().st_size == 0:
                raise ValueError(result.stderr.strip() or "FFmpeg không tạo được video hard subtitle.")
            rendered_duration = self._duration(temporary)
            if abs(rendered_duration - session.duration) > 0.25:
                raise ValueError(
                    f"Video hard subtitle lệch thời lượng {abs(rendered_duration - session.duration):.3f}s."
                )
            temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        self.activity.append(project.project_path, "OBS_HARD_SUBTITLE_RENDERED", "Render hard subtitle phiên OBS", {
            "sessionId": session.id,
            "file": destination.relative_to(root).as_posix(),
            "subtitleFile": srt.relative_to(root).as_posix(),
            "sourceRecording": session.recording_path,
            "sourceAssetIds": selected,
            "duration": rendered_duration,
        })
        return destination

    def _duration(self, path: Path) -> float:
        result = subprocess.run(
            [str(self.ffprobe), "-v", "error", "-show_entries", "format=duration",
             "-of", "json", str(path)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode:
            raise ValueError(result.stderr.strip() or "FFprobe không đọc được video hard subtitle.")
        return float(json.loads(result.stdout)["format"]["duration"])
