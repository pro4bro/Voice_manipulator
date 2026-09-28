"""Bounded, project-owned waveform summaries for acknowledged OBS PCM."""

from __future__ import annotations

from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import threading
from uuid import UUID

from app.adapters.obs_livelink_connection import LiveLinkError
from app.domain.ports import ProjectRepository


BASE_HZ = 20  # 50 ms native-rate PCM buckets; bounded sidecar size for long sessions.
ARCHIVE_BLOCK_SECONDS = 10
MAX_WINDOW_SECONDS = 120
MAX_POINTS = 600


def _samples(pcm: bytes) -> array:
    values = array("h")
    values.frombytes(pcm)
    if sys.byteorder != "little":
        values.byteswap()
    return values


def _points(pcm: bytes, *, channels: int, sample_rate: int, first_frame: int,
            first_sample_index: int | None) -> list[dict]:
    samples = _samples(pcm)
    frames = len(samples) // channels
    bucket_frames = max(1, sample_rate // BASE_HZ)
    result = []
    for offset in range(0, frames, bucket_frames):
        count = min(bucket_frames, frames - offset)
        block = samples[offset * channels:(offset + count) * channels]
        minimum, maximum = min(block), max(block)
        result.append({
            "startFrame": first_frame + offset, "endFrame": first_frame + offset + count,
            "firstSampleIndex": first_sample_index + offset if first_sample_index is not None else None,
            "lastSampleIndexExclusive": first_sample_index + offset + count if first_sample_index is not None else None,
            "min": minimum, "max": maximum,
            "peak": max(abs(minimum), abs(maximum)),
        })
    return result


class ObsLiveLinkWaveform:
    def __init__(self, projects: ProjectRepository, ffmpeg: str | None) -> None:
        self.projects, self.ffmpeg = projects, ffmpeg
        self._archive_lock = threading.RLock()

    def _paths(self, project_id: str, recording_id: str, channel_id: str) -> tuple[Path, Path]:
        try:
            UUID(recording_id)
            UUID(channel_id)
            root = Path(self.projects.get(project_id).project_path).resolve()
        except (ValueError, KeyError) as exc:
            raise LiveLinkError("OBS waveform project or identity is unknown.", 404) from exc
        folder = root / "assets" / "obs-livelink" / recording_id
        return root, folder / "channels" / channel_id

    @staticmethod
    def _write(path: Path, document: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".part")
        with temporary.open("w", encoding="utf-8") as output:
            json.dump(document, output, separators=(",", ":"))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)

    def note_chunk(self, project_id: str, recording_id: str, channel_id: str,
                   started_monotonic_ns: int, metadata: dict, pcm: bytes) -> None:
        _, channel_folder = self._paths(project_id, recording_id, channel_id)
        rate = metadata["sampleRate"]
        first_frame = round((metadata["pluginMonotonicNs"] - started_monotonic_ns) * rate / 1e9)
        document = {
            "schemaVersion": 1, "recordingId": recording_id, "channelId": channel_id,
            "sequence": metadata["sequence"], "pcmSha256": metadata["sha256"],
            "bucketHz": BASE_HZ,
            "sampleRate": rate, "audioChannels": metadata["channels"],
            "points": _points(pcm, channels=metadata["channels"], sample_rate=rate,
                              first_frame=first_frame, first_sample_index=metadata["firstSampleIndex"]),
        }
        with self._archive_lock:
            self._write(channel_folder / "envelopes" / f"{metadata['sequence']:012d}.json", document)

    def _archive_points(self, root: Path, folder: Path, channel_folder: Path,
                        recording: dict, track: dict) -> dict:
        if not self.ffmpeg:
            raise LiveLinkError("FFmpeg is required to rebuild OBS waveform from MKA.", 503)
        archive = (root / recording["sourceArchive"]["sourcePath"]).resolve()
        if not archive.is_relative_to(root) or not archive.is_file():
            raise LiveLinkError("OBS source archive is missing.", 404)
        manifest = json.loads((folder / "pro4bro-session.json").read_text(encoding="utf-8"))
        format_track = next((item for item in manifest["tracks"]
                             if item["channelId"] == track["channelId"]), None)
        rate = format_track["sampleRate"] if format_track else None
        channels = format_track["audioChannels"] if format_track else None
        if not rate or not channels:
            raise LiveLinkError("OBS archive track format is missing.", 503)
        process = subprocess.Popen([
            self.ffmpeg, "-nostdin", "-v", "error", "-i", str(archive),
            "-map", f"0:a:{track['streamIndex']}", "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1",
        ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        block_folder = channel_folder / "archive-envelope-v1"
        block_points: list[dict] = []
        block_index = 0
        frame = 0
        read_bytes = max(1, rate // BASE_HZ) * channels * 2 * 100
        try:
            assert process.stdout is not None
            while chunk := process.stdout.read(read_bytes):
                if len(chunk) % (channels * 2):
                    raise LiveLinkError("OBS archive PCM frame is incomplete.", 503)
                for point in _points(chunk, channels=channels, sample_rate=rate,
                                     first_frame=frame, first_sample_index=None):
                    next_index = point["startFrame"] // (rate * ARCHIVE_BLOCK_SECONDS)
                    if next_index != block_index:
                        self._write(block_folder / f"{block_index:06d}.json", {"points": block_points})
                        block_points = []
                        block_index = next_index
                    block_points.append(point)
                frame += len(chunk) // (channels * 2)
            if process.wait() != 0:
                raise LiveLinkError("OBS archive waveform decode failed.", 503)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        if block_points:
            self._write(block_folder / f"{block_index:06d}.json", {"points": block_points})
        document = {"schemaVersion": 1, "recordingId": recording["recordingId"],
                    "channelId": track["channelId"], "sampleRate": rate,
                    "audioChannels": channels, "sampleAxis": "recording",
                    "frameCount": frame, "blockCount": block_index + 1 if frame else 0,
                    "bucketHz": BASE_HZ,
                    "archiveSha256": recording.get("archiveSha256")}
        self._write(block_folder / "manifest.json", document)
        return document

    def snapshot(self, project_id: str, recording_id: str, channel_id: str,
                 *, start_seconds: float = 0, end_seconds: float = 120,
                 max_points: int = 600, after_sequence: int | None = None) -> dict:
        if (not math.isfinite(start_seconds) or not math.isfinite(end_seconds) or
                start_seconds < 0 or end_seconds <= start_seconds or
                end_seconds - start_seconds > MAX_WINDOW_SECONDS or
                not 1 <= max_points <= MAX_POINTS or
                (after_sequence is not None and after_sequence < -1)):
            raise LiveLinkError("Invalid OBS waveform window or resolution.", 422)
        root, channel_folder = self._paths(project_id, recording_id, channel_id)
        folder = channel_folder.parent.parent
        journal_path = folder / "recording.json"
        if not journal_path.is_file():
            raise LiveLinkError("OBS recording journal is missing.", 404)
        journal = json.loads(journal_path.read_text(encoding="utf-8"))
        recording = journal["recording"]
        if recording["recordingId"] != recording_id or recording["projectId"] != project_id:
            raise LiveLinkError("OBS waveform recording ownership mismatch.", 409)
        known = {item["channelId"] for item in journal["channels"]}
        if channel_id not in known:
            raise LiveLinkError("OBS waveform channel is unknown.", 404)
        archive = recording.get("sourceArchive") if recording.get("archiveStatus") == "ready" else None
        track = next((item for item in archive["tracks"] if item["channelId"] == channel_id), None) if archive else None
        source = "pcm"
        documents = []
        last_sequence, last_included_sequence, has_more = -1, -1, False
        if track:
            block_folder = channel_folder / "archive-envelope-v1"
            manifest_path = block_folder / "manifest.json"
            with self._archive_lock:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else None
                if (not manifest or manifest.get("bucketHz") != BASE_HZ or
                        manifest.get("archiveSha256") != journal.get("archiveSha256") or
                        any(not (block_folder / f"{index:06d}.json").is_file()
                            for index in range(manifest.get("blockCount", 0)))):
                    manifest = self._archive_points(root, folder, channel_folder,
                                                    {**recording, "archiveSha256": journal.get("archiveSha256")}, track)
            rate = manifest["sampleRate"]
            first_block = max(0, int(start_seconds // ARCHIVE_BLOCK_SECONDS))
            last_block = min(manifest["blockCount"], math.ceil(end_seconds / ARCHIVE_BLOCK_SECONDS))
            for index in range(first_block, last_block):
                documents.append(json.loads((block_folder / f"{index:06d}.json").read_text(encoding="utf-8")))
            source = "mka"
        else:
            metadata_paths = sorted((channel_folder / "chunks").glob("*.json"))
            last_sequence = int(metadata_paths[-1].stem) if metadata_paths else -1
            if after_sequence is not None:
                metadata_paths = [path for path in metadata_paths if int(path.stem) > after_sequence]
                has_more = len(metadata_paths) > 32
                metadata_paths = metadata_paths[:32]
                last_included_sequence = int(metadata_paths[-1].stem) if metadata_paths else after_sequence
            for metadata_path in metadata_paths:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                relative_seconds = ((metadata["pluginMonotonicNs"] - recording["startedMonotonicNs"]) / 1e9)
                if relative_seconds > end_seconds or relative_seconds + metadata["frameCount"] / metadata["sampleRate"] < start_seconds:
                    continue
                envelope_path = channel_folder / "envelopes" / metadata_path.name
                if envelope_path.is_file():
                    document = json.loads(envelope_path.read_text(encoding="utf-8"))
                else:
                    document = None
                if not document or document.get("bucketHz") != BASE_HZ:
                    pcm_path = metadata_path.with_suffix(".pcm")
                    if not pcm_path.is_file():
                        continue
                    pcm = pcm_path.read_bytes()
                    if hashlib.sha256(pcm).hexdigest() != metadata["sha256"]:
                        raise LiveLinkError("OBS waveform PCM provenance changed.", 409)
                    self.note_chunk(project_id, recording_id, channel_id,
                                    recording["startedMonotonicNs"], metadata, pcm)
                    document = json.loads(envelope_path.read_text(encoding="utf-8"))
                if document.get("pcmSha256") != metadata["sha256"]:
                    raise LiveLinkError("OBS waveform PCM provenance changed.", 409)
                documents.append(document)
        rate = (manifest["sampleRate"] if track else documents[0]["sampleRate"]) if (track or documents) else None
        if rate is None:
            return {"recordingId": recording_id, "projectId": project_id,
                    "channelId": channel_id, "source": source, "sampleAxis": "channel",
                    "sampleRate": None, "startSeconds": start_seconds, "endSeconds": end_seconds,
                    "lastDurableSequence": last_sequence,
                    "lastIncludedSequence": last_included_sequence, "hasMore": has_more,
                    "points": [], "gaps": []}
        first_frame, last_frame = round(start_seconds * rate), round(end_seconds * rate)
        gap_ranges = []
        if track:
            chunk_paths = sorted((channel_folder / "chunks").glob("*.json"))
            stem = next((item for item in journal.get("sourceStems", [])
                         if item["channelId"] == channel_id), None)
            if stem and chunk_paths:
                first_chunk = json.loads(chunk_paths[0].read_text(encoding="utf-8"))
                initial = round((first_chunk["pluginMonotonicNs"] -
                                 recording["startedMonotonicNs"]) * rate / 1e9)
                for gap in stem.get("gaps", []):
                    start = initial + gap["firstSampleIndex"] - first_chunk["firstSampleIndex"]
                    end = initial + gap["lastSampleIndex"] - first_chunk["firstSampleIndex"]
                    if end > first_frame and start < last_frame:
                        gap_ranges.append({"startFrame": start, "endFrame": end,
                                           "classification": gap["classification"]})
        point_count = max(1, min(max_points, math.ceil((end_seconds - start_seconds) * BASE_HZ)))
        width = max(1, math.ceil((last_frame - first_frame) / point_count))
        bins: dict[int, dict] = {}
        for document in documents:
            for point in document["points"]:
                if point["endFrame"] <= first_frame or point["startFrame"] >= last_frame:
                    continue
                index = min(point_count - 1, (max(point["startFrame"], first_frame) - first_frame) // width)
                existing = bins.get(index)
                if existing is None:
                    bins[index] = dict(point)
                else:
                    existing["min"] = min(existing["min"], point["min"])
                    existing["max"] = max(existing["max"], point["max"])
                    existing["peak"] = max(existing["peak"], point["peak"])
                    existing["firstSampleIndex"] = min(
                        (value for value in (existing["firstSampleIndex"], point["firstSampleIndex"])
                        if value is not None), default=None)
                    existing["lastSampleIndexExclusive"] = max(
                        (value for value in (existing["lastSampleIndexExclusive"], point["lastSampleIndexExclusive"])
                        if value is not None), default=None)
        points = []
        # A cursor response is sparse: the browser merges changed time bins
        # into its earlier full snapshot instead of receiving null padding.
        for index in (sorted(bins) if after_sequence is not None and not track else range(point_count)):
            start = first_frame + index * width
            if start >= last_frame:
                break
            end = min(last_frame, start + width)
            audio = bins.get(index)
            points.append({"startFrame": start, "endFrame": end,
                           "firstSampleIndex": audio["firstSampleIndex"] if audio else None,
                           "lastSampleIndexExclusive": audio["lastSampleIndexExclusive"] if audio else None,
                           "min": audio["min"] if audio else None,
                           "max": audio["max"] if audio else None,
                           "peak": audio["peak"] if audio else None})
        return {"recordingId": recording_id, "projectId": project_id, "channelId": channel_id,
                "source": source, "sampleAxis": "recording" if source == "mka" else "channel",
                "sampleRate": rate, "startSeconds": start_seconds, "endSeconds": end_seconds,
                "lastDurableSequence": -1 if track else last_sequence,
                "lastIncludedSequence": last_included_sequence, "hasMore": has_more,
                "points": points, "gaps": gap_ranges}
