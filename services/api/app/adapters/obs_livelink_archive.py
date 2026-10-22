"""Verify and publish one portable Matroska audio archive per OBS capture."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import wave
from pathlib import Path

from app.adapters.obs_livelink_connection import LiveLinkError
from app.domain.models import MediaAssetCreate
from app.domain.obs_livelink_state import ObsSourceArchive
from app.domain.ports import MediaLibrary


def _run(args: list[str]) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(args, capture_output=True,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode:
        raise LiveLinkError(result.stderr.decode("utf-8", "replace").strip() or
                            "OBS archive command failed.", 503)
    return result


def _decoded_hash(args: list[str]) -> bytes:
    digest = hashlib.sha256()
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    assert process.stdout is not None and process.stderr is not None
    for block in iter(lambda: process.stdout.read(1024 * 1024), b""):
        digest.update(block)
    error = process.stderr.read()
    if process.wait():
        raise LiveLinkError(error.decode("utf-8", "replace").strip() or
                            "OBS MKA track decode failed.", 503)
    return digest.digest()


def _vint(stream, *, size: bool) -> int:
    first = stream.read(1)
    if not first:
        raise ValueError("Truncated Matroska element")
    byte = first[0]
    mask, width = 0x80, 1
    while width <= 8 and not byte & mask:
        mask >>= 1
        width += 1
    if width > 8:
        raise ValueError("Invalid Matroska variable integer")
    value = byte & (mask - 1) if size else byte
    for extra in stream.read(width - 1):
        value = (value << 8) | extra
    if size and value == (1 << (7 * width)) - 1:
        return -1
    return value


def _elements(stream, end: int):
    while stream.tell() < end:
        try:
            element_id = _vint(stream, size=False)
            length = _vint(stream, size=True)
        except ValueError:
            return
        payload = stream.tell()
        following = end if length < 0 else payload + length
        if following > end or following < payload:
            raise ValueError("Invalid Matroska element length")
        yield element_id, payload, following
        stream.seek(following)


def _uid_fields(path: Path) -> list[tuple[int, int, int, int]]:
    """TrackNumber, TrackUID, UID byte offset and width from Matroska Tracks."""
    with path.open("rb") as stream:
        size = path.stat().st_size
        for outer_id, start, end in _elements(stream, size):
            if outer_id != 0x18538067:  # Segment
                continue
            stream.seek(start)
            for child_id, child_start, child_end in _elements(stream, end):
                if child_id != 0x1654AE6B:  # Tracks
                    continue
                found: list[tuple[int, int, int, int]] = []
                stream.seek(child_start)
                for entry_id, entry_start, entry_end in _elements(stream, child_end):
                    if entry_id != 0xAE:  # TrackEntry
                        continue
                    number = uid = uid_offset = uid_width = None
                    stream.seek(entry_start)
                    for field_id, field_start, field_end in _elements(stream, entry_end):
                        if field_id in {0xD7, 0x73C5}:  # TrackNumber, TrackUID
                            stream.seek(field_start)
                            value = int.from_bytes(stream.read(field_end - field_start), "big")
                            if field_id == 0xD7:
                                number = value
                            else:
                                uid = value
                                uid_offset, uid_width = field_start, field_end - field_start
                    if number is not None and uid is not None and uid_offset is not None:
                        found.append((number, uid, uid_offset, uid_width))
                return sorted(found)
    raise ValueError("Matroska Tracks element is missing")


def track_uids(path: Path) -> list[int]:
    """Read actual Matroska TrackUID values, which FFprobe does not expose."""
    return [uid for _, uid, _, _ in _uid_fields(path)]


def _set_track_uids(path: Path, desired: list[int]) -> None:
    fields = _uid_fields(path)
    if len(fields) < len(desired):
        raise LiveLinkError("OBS MKA is missing an audio TrackUID.", 503)
    with path.open("r+b") as output:
        for (_, _, offset, width), uid in zip(fields, desired):
            if uid <= 0 or uid >= 1 << (8 * width):
                raise LiveLinkError("OBS MKA TrackUID width cannot hold source identity.", 503)
            output.seek(offset)
            output.write(uid.to_bytes(width, "big"))
        output.flush()
        os.fsync(output.fileno())


def _project_path(root: Path, value: str) -> Path:
    relative = Path(value)
    if relative.is_absolute() or relative.drive or ".." in relative.parts:
        raise LiveLinkError("OBS archive path must stay inside its project.", 422)
    resolved = (root / relative).resolve()
    if root.resolve() not in resolved.parents:
        raise LiveLinkError("OBS archive path escapes its project.", 422)
    return resolved


class ObsLiveLinkArchiver:
    def __init__(self, media: MediaLibrary, ffmpeg: str | None, ffprobe: str | None) -> None:
        self.media, self.ffmpeg, self.ffprobe = media, ffmpeg, ffprobe

    def finalize(self, project_id: str, root: Path, folder: Path, record: dict) -> ObsSourceArchive:
        if not self.ffmpeg or not self.ffprobe:
            raise LiveLinkError("FFmpeg and FFprobe are required for the OBS MKA archive.", 503)
        recording = record["recording"]
        if recording["status"] != "stopped":
            raise LiveLinkError("OBS recording has not stopped.")
        stems = record.get("sourceStems", [])
        if not stems or any(not _project_path(root, item["sourcePath"]).is_file() for item in stems):
            raise LiveLinkError("OBS source stems are missing; rebuild them from retained chunks.", 503)
        archive_path = folder / "source.mka"
        temporary = folder / "source.mka.part"
        attachment = folder / "pro4bro-session.json"
        parent_id = "asset-live-" + hashlib.sha256(
            f"{recording['recordingId']}:archive".encode()).hexdigest()[:12]
        channels = {item["channelId"]: item for item in record["channels"]}
        manifest = {
            "protocolVersion": 3, "recordingId": recording["recordingId"],
            "startedMonotonicNs": recording["startedMonotonicNs"],
            "endedMonotonicNs": recording["endedMonotonicNs"],
            "videoSpans": record["videoSpans"],
            "capturePauseIntervals": recording.get("capturePauseIntervals", []),
            "channelIntervals": recording["channelIntervals"],
            "tracks": [],
        }
        for index, stem in enumerate(stems):
            channel = channels[stem["channelId"]]
            chunk_metadata = sorted((folder / "channels" / stem["channelId"] / "chunks").glob("*.json"))
            if not chunk_metadata:
                raise LiveLinkError("OBS source has no durable PCM chunk catalog.", 503)
            catalog_hash = hashlib.sha256()
            for item in chunk_metadata:
                catalog_hash.update(item.read_bytes())
            with wave.open(str(_project_path(root, stem["sourcePath"])), "rb") as wav:
                if wav.getsampwidth() != 2:
                    raise LiveLinkError("OBS source WAV must be PCM16.", 503)
                sample_rate, audio_channels, frames = wav.getframerate(), wav.getnchannels(), wav.getnframes()
            manifest["tracks"].append({
                "streamIndex": index, "channelId": stem["channelId"],
                "sourceUuid": stem["sourceUuid"], "relayLabel": stem["alias"],
                "trackUid": int.from_bytes(hashlib.sha256(
                    f"{recording['recordingId']}:{stem['channelId']}".encode()).digest()[:8], "big") or 1,
                "aliasRevision": channel["aliasRevision"], "sampleRate": sample_rate,
                "audioChannels": audio_channels, "frames": frames,
                "gaps": stem["gaps"], "chunkCount": len(chunk_metadata),
                "chunkCatalogSha256": catalog_hash.hexdigest(),
            })
        attachment.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        inputs = [part for stem in stems for part in ("-i", str(_project_path(root, stem["sourcePath"])))]
        mapping = [part for index in range(len(stems)) for part in ("-map", f"{index}:a:0")]
        titles = [part for index, stem in enumerate(stems)
                  for part in (f"-metadata:s:a:{index}", f"title={stem['alias']}")]
        for codec in ("flac", "pcm_s16le"):
            try:
                _run([self.ffmpeg, "-y", "-nostdin", "-v", "error", *inputs, *mapping,
                      "-c:a", codec, *titles, "-attach", str(attachment),
                      "-metadata:s:t:0", "filename=pro4bro-session.json",
                      "-metadata:s:t:0", "mimetype=application/json",
                      "-f", "matroska", str(temporary)])
                _set_track_uids(temporary, [item["trackUid"] for item in manifest["tracks"]])
                self._verify(temporary, attachment, stems, root, codec)
                break
            except (LiveLinkError, ValueError):
                temporary.unlink(missing_ok=True)
                if codec == "pcm_s16le":
                    raise LiveLinkError("OBS MKA FLAC and PCM verification failed.", 503)
        os.replace(temporary, archive_path)
        uids = track_uids(archive_path)
        if len(uids) < len(stems) or uids[:len(stems)] != [item["trackUid"] for item in manifest["tracks"]]:
            raise LiveLinkError("OBS MKA track UID verification failed.", 503)
        tracks = []
        for index, stem in enumerate(stems):
            tracks.append({"channelId": stem["channelId"],
                           "sourceUuid": stem["sourceUuid"],
                           "streamIndex": index, "trackUid": uids[index],
                           "relayLabel": stem["alias"],
                           "aliasRevision": channels[stem["channelId"]]["aliasRevision"],
                           "analysisPath": stem.get("analysisPath")})
        archive = ObsSourceArchive.model_validate({
            "parentAssetId": parent_id,
            "sourcePath": archive_path.relative_to(root).as_posix(),
            "tracks": tracks,
        })
        for track in archive.tracks:
            if not track.analysis_path:
                raise LiveLinkError("OBS track has no analysis WAV destination.", 503)
            analysis = _project_path(root, track.analysis_path)
            temporary_analysis = analysis.with_name("analysis.wav.part")
            _run([self.ffmpeg, "-y", "-nostdin", "-v", "error", "-i", str(archive_path),
                  "-map", f"0:a:{track.stream_index}", "-ac", "1", "-ar", "24000",
                  "-c:a", "pcm_s16le", "-f", "wav", str(temporary_analysis)])
            with wave.open(str(temporary_analysis), "rb") as decoded:
                if (decoded.getframerate(), decoded.getnchannels(), decoded.getsampwidth()) != (24000, 1, 2):
                    raise LiveLinkError("OBS track analysis format verification failed.", 503)
            os.replace(temporary_analysis, analysis)
        duration = (recording["endedMonotonicNs"] - recording["startedMonotonicNs"]) / 1e9
        try:
            existing_parent = self.media.get(project_id, parent_id)
        except KeyError:
            self.media.create(project_id, MediaAssetCreate(
                name=recording.get("displayName") or f"OBS LiveLink · {recording['recordingId'][:8]}", source_extension=".mka",
                media_kind="audio", source_path=archive.source_path,
                obs_recording_id=recording["recordingId"],
                duration=duration, audio_codec=codec, origin="record",
                transcription_status="skipped",
            ), parent_id)
        else:
            if (existing_parent.source_path != archive.source_path or
                    existing_parent.audio_codec != codec or existing_parent.duration != duration):
                self.media.refresh_obs_archive_parent(project_id, parent_id,
                                                      archive.source_path, duration, codec)
        for stem, track in zip(stems, archive.tracks):
            if not stem.get("analysisPath") or not stem.get("assetId"):
                raise LiveLinkError("OBS track analysis WAV or child asset is missing.", 503)
            self.media.link_obs_archive_track(
                project_id, stem["assetId"], parent_id, track.stream_index,
                track.track_uid, stem["analysisPath"],
            )
        from app.adapters.obs_retained_live_script import retain_live_script
        retain_live_script(self.media, project_id, folder)
        return archive

    def _verify(self, path: Path, attachment: Path, stems: list[dict], root: Path,
                codec: str) -> None:
        probe = json.loads(_run([self.ffprobe, "-v", "error", "-show_streams",
                                 "-of", "json", str(path)]).stdout)
        audio = [item for item in probe["streams"] if item["codec_type"] == "audio"]
        attached = [item for item in probe["streams"] if item["codec_type"] == "attachment"]
        if (len(audio) != len(stems) or len(attached) != 1 or
                attached[0].get("tags", {}).get("filename") != "pro4bro-session.json" or
                attached[0].get("tags", {}).get("mimetype") != "application/json" or
                any(item["codec_name"] != codec or
                    item.get("tags", {}).get("title") != stem["alias"]
                    for item, stem in zip(audio, stems))):
            raise LiveLinkError("OBS MKA stream mapping or codec verification failed.", 503)
        if len(set(track_uids(path)[:len(stems)])) != len(stems):
            raise LiveLinkError("OBS MKA track UIDs are not distinct.", 503)
        extracted = attachment.with_name("pro4bro-session.verify.json")
        try:
            _run([self.ffmpeg, "-y", "-nostdin", "-v", "error",
                  "-dump_attachment:t:0", str(extracted), "-i", str(path),
                  "-map", "0:a:0", "-frames:a", "0", "-f", "null", os.devnull])
            if extracted.read_bytes() != attachment.read_bytes():
                raise LiveLinkError("OBS MKA attachment differs from its manifest.", 503)
        finally:
            extracted.unlink(missing_ok=True)
        for index, stem in enumerate(stems):
            with wave.open(str(_project_path(root, stem["sourcePath"])), "rb") as source:
                expected_hash = hashlib.sha256()
                for block in iter(lambda: source.readframes(65536), b""):
                    expected_hash.update(block)
            decoded = _decoded_hash([self.ffmpeg, "-nostdin", "-v", "error", "-i", str(path),
                                     "-map", f"0:a:{index}", "-c:a", "pcm_s16le",
                                     "-f", "s16le", "pipe:1"])
            if decoded != expected_hash.digest():
                raise LiveLinkError("OBS MKA audio does not match the source PCM stem.", 503)
