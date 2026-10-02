"""Durable v3 PCM chunks, provisional WAVs and verified MKA publication."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import threading
import wave
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from app.adapters.obs_livelink_connection import LiveLinkError, ObsLiveLinkConnection
from app.adapters.obs_livelink_deletions import deleted_recording_ids
from app.adapters.obs_livelink_archive import ObsLiveLinkArchiver
from app.adapters.obs_livelink_runtime import ObsLiveLinkRuntime
from app.adapters.obs_livelink_waveform import ObsLiveLinkWaveform
from app.domain.models import MediaAssetCreate
from app.domain.obs_livelink_state import ObsCaptureRecording, ObsChannel
from app.domain.ports import MediaLibrary, ProjectRepository

MAX_CHUNK_BYTES = 3_072_000


class FileObsLiveLinkAudio:
    def __init__(self, connection: ObsLiveLinkConnection, runtime: ObsLiveLinkRuntime,
                 projects: ProjectRepository, media: MediaLibrary, ffmpeg: str | None,
                 ffprobe: str | None = None) -> None:
        self.connection, self.runtime = connection, runtime
        self.projects, self.media, self.ffmpeg = projects, media, ffmpeg
        self._lock = threading.RLock()
        self._recording_locks: dict[str, threading.RLock] = {}
        self.archiver = ObsLiveLinkArchiver(media, ffmpeg, ffprobe)
        self.waveform = ObsLiveLinkWaveform(projects, ffmpeg)

    def _recording_lock(self, recording_id: str) -> threading.RLock:
        # Encoding a stopped take must never hold the ingress lock for another take.
        with self._lock:
            return self._recording_locks.setdefault(recording_id, threading.RLock())

    def _recording(self, recording_id: str):
        try:
            UUID(recording_id)
        except ValueError as exc:
            raise LiveLinkError("Invalid OBS recording ID.", 422) from exc
        state = self.runtime._require_state()
        recording = state.recording if state.recording and state.recording.recording_id == recording_id else next(
            (item for item in state.completed_recordings if item.recording_id == recording_id), None)
        if recording is None:
            raise LiveLinkError("OBS recording is unknown.")
        return state, recording

    def _folder(self, project_id: str, recording_id: str) -> tuple[Path, Path]:
        root = Path(self.projects.get(project_id).project_path).resolve()
        return root, root / "assets" / "obs-livelink" / recording_id

    @staticmethod
    def _write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".part")
        with temporary.open("wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)

    @staticmethod
    def _hash_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _write_silence(output: wave.Wave_write, frames: int, channels: int) -> None:
        block_frames = 65536
        block = b"\0" * (block_frames * channels * 2)
        while frames:
            count = min(frames, block_frames)
            output.writeframesraw(block[:count * channels * 2])
            frames -= count

    def chunk(self, authorization: str, *, install_id: str, connection_id: str,
              epoch: str, recording_id: str, channel_id: str, source_uuid: str,
              sequence: int, first_sample_index: int, frame_count: int,
              sample_rate: int, channels: int, obs_audio_timestamp_ns: int,
              plugin_monotonic_ns: int, sha256: str, pcm: bytes) -> dict:
        self.connection.require_connection(authorization, install_id, connection_id, epoch)
        if (sequence < 0 or first_sample_index < 0 or frame_count < 1 or
                not 8000 <= sample_rate <= 192000 or not 1 <= channels <= 8 or
                obs_audio_timestamp_ns < 0 or plugin_monotonic_ns < 0 or
                len(pcm) > MAX_CHUNK_BYTES or len(pcm) != frame_count * channels * 2 or
                len(sha256) != 64 or hashlib.sha256(pcm).hexdigest() != sha256):
            raise LiveLinkError("Invalid OBS PCM chunk.", 422)
        try:
            UUID(channel_id)
            UUID(source_uuid)
        except ValueError as exc:
            raise LiveLinkError("Invalid OBS source identity.", 422) from exc
        with self._recording_lock(recording_id), self.runtime._lock:
            state, recording = self._recording(recording_id)
            chunk_end_ns = plugin_monotonic_ns + (frame_count * 1_000_000_000 + sample_rate - 1) // sample_rate
            if (recording.ended_monotonic_ns is not None and
                    chunk_end_ns > recording.ended_monotonic_ns):
                raise LiveLinkError("PCM arrived after the recording boundary.")
            if plugin_monotonic_ns < recording.started_monotonic_ns:
                raise LiveLinkError("PCM precedes the recording boundary.")
            _, folder = self._folder(recording.project_id, recording_id)
            channel = next((item for item in state.channels if item.channel_id == channel_id), None)
            if channel is None or channel.source_uuid != source_uuid:
                try:
                    journal = json.loads((folder / "recording.json").read_text(encoding="utf-8"))
                    historical = next((item for item in journal["channels"]
                                       if item["channelId"] == channel_id and item["sourceUuid"] == source_uuid), None)
                except (OSError, ValueError, KeyError):
                    historical = None
                if historical is None:
                    raise LiveLinkError("OBS channel identity changed.")
            for interval in recording.channel_intervals:
                if interval.channel_id == channel_id and interval.start_monotonic_ns <= plugin_monotonic_ns and (
                    interval.end_monotonic_ns is None or plugin_monotonic_ns < interval.end_monotonic_ns
                ):
                    raise LiveLinkError("PCM falls inside a disabled or missing-source interval.")
            channel_folder = folder / "channels" / channel_id / "chunks"
            pcm_path = channel_folder / f"{sequence:012d}.pcm"
            metadata_path = channel_folder / f"{sequence:012d}.json"
            metadata = {"sequence": sequence, "firstSampleIndex": first_sample_index,
                        "frameCount": frame_count, "sampleRate": sample_rate,
                        "channels": channels, "obsAudioTimestampNs": obs_audio_timestamp_ns,
                        "pluginMonotonicNs": plugin_monotonic_ns, "sha256": sha256,
                        "sourceUuid": source_uuid,
                        "receivedAtUtc": datetime.now(timezone.utc).isoformat()}
            if metadata_path.is_file():
                existing_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                if {key: value for key, value in existing_metadata.items() if key != "receivedAtUtc"} != {
                    key: value for key, value in metadata.items() if key != "receivedAtUtc"
                } or (
                    not pcm_path.is_file() or hashlib.sha256(pcm_path.read_bytes()).hexdigest() != sha256
                ):
                    raise LiveLinkError("Conflicting OBS PCM sequence.")
                existing_metadata.setdefault("receivedAtUtc", datetime.fromtimestamp(
                    metadata_path.stat().st_mtime, timezone.utc).isoformat())
                self.waveform.note_chunk(recording.project_id, recording_id, channel_id,
                                         recording.started_monotonic_ns, existing_metadata, pcm)
                self.runtime.note_durable_chunk(recording, channel_id, existing_metadata, duplicate=True)
                return {"sequence": sequence, "durable": True, "duplicate": True}
            if sequence:
                previous_path = channel_folder / f"{sequence - 1:012d}.json"
                if not previous_path.is_file():
                    raise LiveLinkError("OBS PCM sequence, sample index or format discontinuity requires resync.")
                previous = json.loads(previous_path.read_text(encoding="utf-8"))
                if (previous["sequence"] != sequence - 1 or
                        first_sample_index < previous["firstSampleIndex"] + previous["frameCount"] or
                        (sample_rate, channels) != (previous["sampleRate"], previous["channels"])):
                    raise LiveLinkError("OBS PCM sequence, sample index or format discontinuity requires resync.")
            elif channel_folder.is_dir() and any(
                path.suffix == ".json" for path in channel_folder.iterdir()
            ):
                raise LiveLinkError("OBS PCM sequence, sample index or format discontinuity requires resync.")
            self._write(pcm_path, pcm)
            self._write(metadata_path, json.dumps(metadata, separators=(",", ":")).encode())
            self.waveform.note_chunk(recording.project_id, recording_id, channel_id,
                                     recording.started_monotonic_ns, metadata, pcm)
            self.runtime.note_durable_chunk(recording, channel_id, metadata, duplicate=False)
            return {"sequence": sequence, "durable": True, "duplicate": False}

    def finalize(self, authorization: str, *, install_id: str, connection_id: str,
                 epoch: str, recording_id: str) -> dict:
        self.connection.require_connection(authorization, install_id, connection_id, epoch)
        with self._recording_lock(recording_id):
            with self.runtime._lock:
                state, recording = self._recording(recording_id)
                _, folder = self._folder(recording.project_id, recording_id)
                journal = json.loads((folder / "recording.json").read_text(encoding="utf-8"))
                known = {item.channel_id for item in state.channels}
                historical = [ObsChannel.model_validate(item) for item in journal["channels"]
                              if item["channelId"] not in known]
            try:
                return self._finalize(recording_id, recording, [*state.channels, *historical],
                                      update_runtime=True)
            except (LiveLinkError, OSError):
                self.runtime.archive_error(recording_id)
                raise

    def retry(self, project_id: str, recording_id: str) -> dict:
        """Rebuild a stopped capture from project-owned chunks after OBS/API restart."""
        with self._recording_lock(recording_id):
            return self._retry(project_id, recording_id)

    def _retry(self, project_id: str, recording_id: str) -> dict:
        try:
            UUID(recording_id)
        except ValueError as exc:
            raise LiveLinkError("Invalid OBS recording ID.", 422) from exc
        root, folder = self._folder(project_id, recording_id)
        if recording_id in deleted_recording_ids(root):
            raise LiveLinkError("OBS recording was permanently deleted.", 404)
        record_path = folder / "recording.json"
        if not record_path.is_file():
            raise LiveLinkError("OBS recording journal is missing.", 404)
        record = json.loads(record_path.read_text(encoding="utf-8"))
        recording = ObsCaptureRecording.model_validate(record["recording"])
        if recording.recording_id != recording_id or recording.project_id != project_id:
            raise LiveLinkError("OBS recording ownership does not match project.", 409)
        if (recording.archive_status == "ready" and recording.source_archive and
                (root / recording.source_archive.source_path).is_file() and
                record.get("archiveSha256") == self._hash_file(
                    root / recording.source_archive.source_path)):
            return {"recordingId": recording_id, "artifactReady": True,
                    "sourceArchive": recording.source_archive.model_dump(mode="json", by_alias=True),
                    "sourceStems": record.get("sourceStems", [])}
        source_channels = [ObsChannel.model_validate(item) for item in record["channels"]]
        try:
            finalized = self._finalize(recording_id, recording, source_channels, update_runtime=False)
        except LiveLinkError:
            failed = json.loads(record_path.read_text(encoding="utf-8"))
            failed["recording"]["archiveStatus"] = "error"
            self._write(record_path, json.dumps(failed, indent=2).encode())
            with self.runtime._lock:
                state = self.runtime._state
                if state and any(item.recording_id == recording_id for item in state.completed_recordings):
                    self.runtime.archive_error(recording_id)
            raise
        with self.runtime._lock:
            state = self.runtime._state
            if state and any(item.recording_id == recording_id for item in state.completed_recordings):
                self.runtime.archive_ready(recording_id, finalized["sourceArchive"])
        return finalized

    def _finalize(self, recording_id: str, recording: ObsCaptureRecording,
                  source_channels: list[ObsChannel], *, update_runtime: bool) -> dict:
        with self._recording_lock(recording_id):
            if recording.status != "stopped":
                raise LiveLinkError("OBS recording has not stopped.")
            root, folder = self._folder(recording.project_id, recording_id)
            record = json.loads((folder / "recording.json").read_text(encoding="utf-8"))
            archive = record["recording"].get("sourceArchive")
            if (record["recording"].get("archiveStatus") == "ready" and archive and
                    (root / archive["sourcePath"]).is_file() and
                    record.get("archiveSha256") == self._hash_file(root / archive["sourcePath"])):
                return {"recordingId": recording_id, "sourceStems": record.get("sourceStems", []),
                        "sourceArchive": archive, "artifactReady": True}
            stems: list[dict] = []
            for channel_folder in sorted((folder / "channels").glob("*")):
                metadata_paths = sorted((channel_folder / "chunks").glob("*.json"))
                if not metadata_paths:
                    continue
                metadata = [json.loads(path.read_text(encoding="utf-8")) for path in metadata_paths]
                metadata = [item for item in metadata if recording.ended_monotonic_ns is None or
                            item["pluginMonotonicNs"] < recording.ended_monotonic_ns]
                if not metadata:
                    continue
                sample_rate, channels = metadata[0]["sampleRate"], metadata[0]["channels"]
                channel_id = channel_folder.name
                channel = next((item for item in source_channels if item.channel_id == channel_id), None)
                if channel is None:
                    raise LiveLinkError("OBS channel mapping vanished before finalize.")
                asset_id = "asset-live-" + hashlib.sha256(
                    f"{recording_id}:{channel_id}".encode()).hexdigest()[:12]
                asset_folder = root / "assets" / "media" / asset_id
                asset_folder.mkdir(parents=True, exist_ok=True)
                stem_path = asset_folder / "source.wav"
                temporary = asset_folder / "source.wav.part"
                gaps: list[dict] = []
                with wave.open(str(temporary), "wb") as output:
                    output.setnchannels(channels)
                    output.setsampwidth(2)
                    output.setframerate(sample_rate)
                    first = metadata[0]
                    initial_frames = max(0, round((first["pluginMonotonicNs"] -
                                                   recording.started_monotonic_ns) * sample_rate / 1e9))
                    self._write_silence(output, initial_frames, channels)
                    expected = first["firstSampleIndex"]
                    previous = None
                    for item in metadata:
                        gap_frames = item["firstSampleIndex"] - expected
                        if gap_frames:
                            gap_start_ns = (previous["pluginMonotonicNs"] +
                                            previous["frameCount"] * 1_000_000_000 // sample_rate) if previous else item["pluginMonotonicNs"]
                            gap_end_ns = item["pluginMonotonicNs"]
                            reason = "transport-gap"
                            for interval in recording.channel_intervals:
                                if (interval.channel_id == channel_id and
                                        interval.start_monotonic_ns < gap_end_ns and
                                        (interval.end_monotonic_ns is None or interval.end_monotonic_ns > gap_start_ns)):
                                    reason = interval.reason
                                    break
                            if reason == "transport-gap" and any(
                                interval.start_monotonic_ns < gap_end_ns and
                                (interval.end_monotonic_ns is None or interval.end_monotonic_ns > gap_start_ns)
                                for interval in recording.capture_pause_intervals
                            ):
                                reason = "app-paused"
                            gaps.append({"firstSampleIndex": expected,
                                         "lastSampleIndex": item["firstSampleIndex"],
                                         "classification": reason})
                            self._write_silence(output, gap_frames, channels)
                        pcm_path = channel_folder / "chunks" / f"{item['sequence']:012d}.pcm"
                        data = pcm_path.read_bytes()
                        if hashlib.sha256(data).hexdigest() != item["sha256"]:
                            raise LiveLinkError("OBS PCM chunk hash changed before finalize.")
                        allowed_frames = item["frameCount"]
                        if recording.ended_monotonic_ns is not None:
                            allowed_frames = min(allowed_frames, max(0,
                                (recording.ended_monotonic_ns - item["pluginMonotonicNs"]) * sample_rate // 1_000_000_000))
                        audible = bytearray(data[:allowed_frames * channels * 2])
                        for interval in [*recording.capture_pause_intervals,
                                         *(part for part in recording.channel_intervals if part.channel_id == channel_id)]:
                            end_ns = interval.end_monotonic_ns or recording.ended_monotonic_ns
                            if end_ns is None:
                                continue
                            start_frame = max(0, (interval.start_monotonic_ns - item["pluginMonotonicNs"]) * sample_rate // 1_000_000_000)
                            end_frame = min(allowed_frames, max(0,
                                (end_ns - item["pluginMonotonicNs"]) * sample_rate // 1_000_000_000))
                            if end_frame > start_frame:
                                audible[start_frame * channels * 2:end_frame * channels * 2] = b"\0" * (
                                    (end_frame - start_frame) * channels * 2)
                        output.writeframes(audible)
                        expected = item["firstSampleIndex"] + allowed_frames
                        previous = item
                temporary.replace(stem_path)
                analysis_path = asset_folder / "analysis.wav"
                if self.ffmpeg:
                    result = subprocess.run([
                        self.ffmpeg, "-y", "-nostdin", "-v", "error", "-i", str(stem_path),
                        "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(analysis_path),
                    ], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    if result.returncode:
                        raise LiveLinkError(result.stderr.strip() or "OBS analysis WAV failed.", 503)
                if analysis_path.is_file():
                    try:
                        self.media.get(recording.project_id, asset_id)
                    except KeyError:
                        with wave.open(str(stem_path), "rb") as source:
                            duration = source.getnframes() / source.getframerate()
                        self.media.create(recording.project_id, MediaAssetCreate(
                            name=f"OBS LiveLink · {channel.relay_label}",
                            source_extension=".wav", media_kind="audio",
                            source_path=stem_path.relative_to(root).as_posix(),
                            analysis_path=analysis_path.relative_to(root).as_posix(),
                            obs_recording_id=recording_id,
                            duration=duration, sample_rate=sample_rate,
                            audio_codec="pcm_s16le", origin="record",
                            transcription_status="skipped",
                        ), asset_id)
                stems.append({"channelId": channel_id, "sourceUuid": channel.source_uuid,
                              "alias": channel.relay_label, "assetId": asset_id if analysis_path.is_file() else None,
                              "sourcePath": stem_path.relative_to(root).as_posix(),
                              "analysisPath": analysis_path.relative_to(root).as_posix() if analysis_path.is_file() else None,
                              "gaps": gaps})
            record_path = folder / "recording.json"
            with self.runtime._lock:
                record = json.loads(record_path.read_text(encoding="utf-8"))
                record["sourceStems"] = stems
                self._write(record_path, json.dumps(record, indent=2).encode())
            archive = self.archiver.finalize(recording.project_id, root, folder, record)
            if update_runtime:
                self.runtime.archive_ready(recording_id, archive.model_dump(mode="json", by_alias=True))
            for stem in stems:
                stem["sourcePath"] = stem["analysisPath"]
                stem["parentAssetId"] = archive.parent_asset_id
                track = next(item for item in archive.tracks if item.channel_id == stem["channelId"])
                stem["streamIndex"] = track.stream_index
                stem["trackUid"] = track.track_uid
            archive_hash = self._hash_file(root / archive.source_path)
            with self.runtime._lock:
                ready_record = json.loads(record_path.read_text(encoding="utf-8"))
                ready_record["sourceStems"] = stems
                ready_record["recording"]["archiveStatus"] = "ready"
                ready_record["recording"]["sourceArchive"] = archive.model_dump(mode="json", by_alias=True)
                ready_record["archiveSha256"] = archive_hash
                self._write(record_path, json.dumps(ready_record, indent=2).encode())
            for channel_folder in sorted((folder / "channels").glob("*")):
                candidate = root / "assets" / "media" / ("asset-live-" + hashlib.sha256(
                    f"{recording_id}:{channel_folder.name}".encode()).hexdigest()[:12]) / "source.wav"
                try:
                    candidate.unlink(missing_ok=True)
                except OSError:
                    logging.getLogger(__name__).warning("Verified OBS archive retained temporary stem %s", candidate)
            return {"recordingId": recording_id, "sourceStems": stems,
                    "sourceArchive": archive.model_dump(mode="json", by_alias=True),
                    "artifactReady": True}
