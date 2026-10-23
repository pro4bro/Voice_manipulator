"""Durably follow committed Matroska clusters into project-owned audio tracks.

The live WAV is a provisional, timestamp-aligned decode of independent clusters.
Finishing re-decodes the closed source in one pass to remove codec boundary effects.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import struct
import subprocess
import tempfile
import threading
import time
import wave
from pathlib import Path
from uuid import uuid4

from app.adapters.activity_center import CENTER
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.growing_mkv import assert_same_source, has_closed_segment, scan_committed, source_identity
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.media_asset_paths import create_media_asset_directory, media_asset_directory, media_asset_file, safe_media_stem
from app.domain.models import MediaAssetCreate, MediaAudioTrackChoice, MediaImportResult, ProjectRecord


RATE = 24000
SAMPLE_BYTES = 2
WAV_HEADER = 44


def _atomic_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.flush()
        os.fsync(output.fileno())
    # Windows readers can briefly prevent replacement of an open checkpoint.
    # Retry only that sharing/permission failure; keep permanent errors visible.
    for attempt in range(5):
        try:
            os.replace(temporary, path)
            break
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(.02 * (attempt + 1))


def _read_atomic_json(path: Path) -> dict:
    """Read a replace-atomic checkpoint across brief Windows sharing locks."""
    for attempt in range(5):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(.02 * (attempt + 1))


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def _wav_header(frames: int) -> bytes:
    payload = frames * SAMPLE_BYTES
    if payload > 0xFFFFFFFF - 36:
        raise ValueError("Live WAV vượt giới hạn 4 GiB; hãy kết thúc bản ghi trước khi tiếp tục")
    return (b"RIFF" + struct.pack("<I", payload + 36) + b"WAVEfmt "
            + struct.pack("<IHHIIHH", 16, 1, 1, RATE, RATE * SAMPLE_BYTES, SAMPLE_BYTES, SAMPLE_BYTES * 8)
            + b"data" + struct.pack("<I", payload))


def _write_wav(path: Path, pcm: bytes) -> None:
    with path.open("wb") as raw:
        with wave.open(raw, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(SAMPLE_BYTES)
            output.setframerate(RATE)
            output.writeframes(pcm)
        raw.flush()
        os.fsync(raw.fileno())


class FileGrowingMkvFollower:
    def __init__(self, library: FileMediaLibrary, registry: LocalMediaSourceRegistry,
                 ffmpeg: str | None, ffprobe: str | None) -> None:
        self.library = library
        self.registry = registry
        self.ffmpeg = ffmpeg
        self.ffprobe = ffprobe
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.Lock()

    def _lock(self, parent_id: str) -> threading.RLock:
        with self._locks_guard:
            return self._locks.setdefault(parent_id, threading.RLock())

    @staticmethod
    def _follow_task_id(project: ProjectRecord, parent_id: str) -> str:
        return f"import-follow:{project.id}:{parent_id}"

    def _ensure_follow_task(self, project: ProjectRecord, parent_id: str, label: str,
                            detail: str = "Following growing MKV source") -> str:
        task_id = self._follow_task_id(project, parent_id)
        existing = next((task for task in CENTER.tasks() if task.id == task_id), None)
        if existing is None or existing.status not in {"running", "queued"}:
            CENTER.start_task("import", label, task_id=task_id, detail=detail, fraction=None,
                project_id=project.id, asset_id=parent_id, footage_id=parent_id,
                group_label=label, status="running")
        elif existing.status in {"running", "queued"}:
            CENTER.update_task(task_id, detail=detail, fraction=None, asset_id=parent_id,
                footage_id=parent_id, group_label=label)
        return task_id

    def _fail_follow(self, project: ProjectRecord, parent_id: str, error: Exception) -> None:
        CENTER.finish_task(self._follow_task_id(project, parent_id), status="failed",
            detail=f"MKV import failed: {error}", error=str(error))

    @staticmethod
    def _paths(project: ProjectRecord, parent_id: str) -> tuple[Path, Path]:
        if not parent_id.startswith("asset-") or not parent_id[6:].isalnum():
            raise ValueError("Footage id không hợp lệ")
        directory = media_asset_directory(Path(project.project_path), parent_id)
        return directory, directory / "follow-state.json"

    def _run(self, command: list[str]) -> subprocess.CompletedProcess[bytes]:
        result = subprocess.run(command, capture_output=True, check=False,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode != 0:
            raise ValueError(result.stderr.decode("utf-8", "replace")[-1000:] or "FFmpeg/FFprobe thất bại")
        return result

    def _probe(self, path: Path) -> dict:
        return json.loads(self._run([self.ffprobe, "-v", "error", "-show_streams",
                                     "-of", "json", str(path)]).stdout)

    def _decode_cluster(self, path: Path, tracks: list[dict]) -> list[tuple[dict, float, bytes]]:
        """Probe/decode all selected streams once; retain one-cluster checkpoints."""
        payload = json.loads(self._run([self.ffprobe, "-v", "error", "-select_streams", "a",
            "-show_packets", "-show_entries", "packet=stream_index,pts_time",
            "-of", "json", str(path)]).stdout)
        selected = {track["streamIndex"] for track in tracks}
        present, first = set(), {}
        for packet in payload.get("packets", []):
            index = packet.get("stream_index")
            if index not in selected:
                continue
            present.add(index)
            if index in first:
                continue
            try:
                pts = float(packet["pts_time"])
                if math.isfinite(pts):
                    first[index] = pts
            except (KeyError, TypeError, ValueError):
                continue
        if present - first.keys():
            raise ValueError("Track có packet nhưng thiếu PTS; giữ nguyên checkpoint")
        active = [track for track in tracks if track["streamIndex"] in first]
        if not active:
            return []
        command = [self.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(path)]
        destinations = []
        for track in active:
            index = track["streamIndex"]
            output = path.parent / f"{index}.s16"
            destinations.append((track, output))
            command.extend(["-map", f"0:{index}", "-vn", "-ac", "1", "-ar", str(RATE),
                            "-c:a", "pcm_s16le", "-f", "s16le", str(output)])
        self._run(command)
        decoded = []
        for track, output in destinations:
            pcm = output.read_bytes()
            if pcm:
                decoded.append((track, first[track["streamIndex"]], pcm))
        return decoded

    def _decode_to_wav(self, source: Path, stream_index: int, destination: Path) -> None:
        self._run([self.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(source),
                   "-map", f"0:{stream_index}", "-vn", "-ac", "1", "-ar", str(RATE),
                   "-c:a", "pcm_s16le", str(destination)])
        with wave.open(str(destination), "rb") as output:
            if (output.getnchannels(), output.getframerate(), output.getsampwidth()) != (1, RATE, 2):
                raise ValueError("Final analysis WAV không đúng 24 kHz mono PCM16")

    def inspect(self, source_value: str) -> dict:
        """Probe a stable header plus first committed Cluster, ignoring the growing tail."""
        if not self.ffprobe:
            raise RuntimeError("FFprobe cần có để kiểm tra track MKV")
        source = Path(source_value).expanduser().resolve()
        if source.suffix.lower() != ".mkv" or not source.is_file():
            raise ValueError("Hãy chọn một file MKV trên máy này")
        scan = scan_committed(source, max_clusters=1)
        if scan.header_end is None or not scan.clusters:
            raise ValueError("MKV chưa có header và Cluster hoàn chỉnh; hãy thử lại khi bản ghi bắt đầu")
        with tempfile.TemporaryDirectory() as temporary:
            fragment = Path(temporary) / "initial.mkv"
            with source.open("rb") as original, fragment.open("wb") as output:
                output.write(original.read(scan.header_end))
                cluster = scan.clusters[0]
                original.seek(cluster.start)
                output.write(original.read(cluster.end - cluster.start))
            return self._probe(fragment)

    def start(self, project: ProjectRecord, source_value: str,
              stream_indexes: list[int] | None = None,
              transcribe_stream_indexes: list[int] | None = None,
              stt_segment_seconds: int = 60) -> MediaImportResult:
        reserved = {}
        def on_reserved(parent_id: str, label: str) -> None:
            reserved["parent_id"] = parent_id
            self._ensure_follow_task(project, parent_id, label, "Preparing growing MKV import")
        try:
            return self._start(project, source_value, stream_indexes, transcribe_stream_indexes,
                stt_segment_seconds, on_reserved=on_reserved)
        except Exception as exc:
            if reserved.get("parent_id"):
                self._fail_follow(project, reserved["parent_id"], exc)
            raise

    def _start(self, project: ProjectRecord, source_value: str,
              stream_indexes: list[int] | None = None,
              transcribe_stream_indexes: list[int] | None = None,
              stt_segment_seconds: int = 60, *, on_reserved=None) -> MediaImportResult:
        if not self.ffmpeg or not self.ffprobe:
            raise RuntimeError("FFmpeg và FFprobe cần có để theo dõi MKV")
        source = Path(source_value).expanduser().resolve()
        if source.suffix.lower() != ".mkv" or not source.is_file():
            raise ValueError("Hãy chọn một file MKV trên máy này")
        scan = scan_committed(source, max_clusters=1)
        streams = self.inspect(source_value).get("streams", [])
        header_end = scan.header_end
        audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
        available = {stream["index"] for stream in audio_streams}
        selected = available if stream_indexes is None else set(stream_indexes)
        if not selected or not selected.issubset(available):
            raise ValueError("Danh sách track audio cần import không hợp lệ")
        if len(selected) != len(stream_indexes or selected):
            raise ValueError("Track audio bị chọn trùng")
        selected_stt = set(transcribe_stream_indexes or [])
        if not selected_stt.issubset(selected) or len(selected_stt) != len(transcribe_stream_indexes or []):
            raise ValueError("Track STT phải nằm trong các track được import và không được chọn trùng")
        if not 10 <= stt_segment_seconds <= 600:
            raise ValueError("Độ dài đoạn STT phải từ 10 đến 600 giây")
        parent_id = f"asset-{uuid4().hex[:12]}"
        if on_reserved is not None:
            on_reserved(parent_id, source.name)
        CENTER.update_task(self._follow_task_id(project, parent_id), detail="Copying initial MKV header",
            fraction=None, asset_id=parent_id, footage_id=parent_id, group_label=source.name)
        directory = create_media_asset_directory(Path(project.project_path), parent_id, source.name)
        state_path = directory / "follow-state.json"
        root = Path(project.project_path)
        snapshot = media_asset_file(directory, "source.mkv")
        with source.open("rb") as original, snapshot.open("wb") as output:
            output.write(original.read(header_end))
            output.flush()
            os.fsync(output.fileno())
        track_states = []
        for ordinal, stream in enumerate(audio_streams, 1):
            if stream["index"] not in selected:
                continue
            child_id = f"asset-{uuid4().hex[:12]}"
            child_dir = create_media_asset_directory(root, child_id, f"{safe_media_stem(source.name)[:40]} - Track {stream['index']}.wav")
            analysis = media_asset_file(child_dir, "analysis.wav")
            analysis.write_bytes(_wav_header(0))
            title = str((stream.get("tags") or {}).get("title") or f"Track {ordinal}")[:160]
            track_states.append({"assetId": child_id, "streamIndex": stream["index"],
                                 "title": title, "frames": 0, "gaps": [], "lastChunk": 0})
        first_analysis = (media_asset_file(media_asset_directory(root, track_states[0]["assetId"]), "analysis.wav")).relative_to(root).as_posix()
        identity = source_identity(source, header_end)
        identity["headerEnd"] = header_end
        state = {"version": 1, "parentId": parent_id, "identity": identity,
                 "cursor": header_end, "snapshotBytes": header_end,
                 "lastCluster": None, "sequence": 0, "finished": False,
                 "sttSegmentSeconds": stt_segment_seconds,
                 "sttDetailedEnabled": False,
                 "tracks": track_states}
        _atomic_json(state_path, state)
        self.registry.set(project.id, parent_id, source)
        video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
        parent = self.library.create(project.id, MediaAssetCreate(
            name=source.name, source_extension=".mkv", media_kind="video" if video else "audio",
            source_path=snapshot.relative_to(root).as_posix(), analysis_path=first_analysis,
            has_external_source=True, local_cache_enabled=True,
            growing_mkv_follow=True,
            url=f"/api/projects/{project.id}/media/{parent_id}/audio",
            duration=0, sample_rate=RATE,
            audio_codec=str(next(item for item in audio_streams if item["index"] in selected).get("codec_name") or "unknown"),
            video_codec=str(video.get("codec_name")) if video else None,
            available_audio_tracks=[MediaAudioTrackChoice(
                stream_index=stream["index"],
                title=str((stream.get("tags") or {}).get("title") or f"Track {ordinal}")[:160],
                codec=stream.get("codec_name"), channels=stream.get("channels"),
                imported=stream["index"] in selected,
            ) for ordinal, stream in enumerate(audio_streams, 1)],
            origin="import", status="ready", transcription_status="not-applicable",
        ), parent_id)
        manifest = []
        for track in track_states:
            stream = next(item for item in audio_streams if item["index"] == track["streamIndex"])
            child_id = track["assetId"]
            relative = (media_asset_file(media_asset_directory(root, child_id), "analysis.wav")).relative_to(root).as_posix()
            self.library.create(project.id, MediaAssetCreate(
                name=f"{source.name} · {track['title']}", source_extension=".wav",
                media_kind="audio", source_path=relative, analysis_path=relative,
                source_archive_asset_id=parent_id,
                source_archive_stream_index=track["streamIndex"],
                url=f"/api/projects/{project.id}/media/{child_id}/audio",
                sample_rate=RATE, audio_codec="pcm_s16le", origin="import",
                transcription_status="skipped",
                transcription_selected=track["streamIndex"] in selected_stt,
            ), child_id)
            manifest.append({"assetId": child_id, "streamIndex": track["streamIndex"],
                             "title": track["title"], "codec": stream.get("codec_name"),
                             "sampleRate": stream.get("sample_rate"), "channels": stream.get("channels"),
                             "analysisPath": relative})
        available_manifest = [{
            "streamIndex": stream["index"],
            "title": str((stream.get("tags") or {}).get("title") or f"Track {ordinal}")[:160],
            "codec": stream.get("codec_name"), "channels": stream.get("channels"),
            "imported": stream["index"] in selected,
        } for ordinal, stream in enumerate(audio_streams, 1)]
        _atomic_json(directory / "audio-tracks.json", {
            "version": 2, "tracks": manifest, "availableTracks": available_manifest,
        })
        CENTER.update_task(self._follow_task_id(project, parent_id), detail="Following growing MKV source",
            fraction=None, asset_id=parent_id, footage_id=parent_id, group_label=source.name)
        return MediaImportResult(asset=self.library.get(project.id, parent_id), elapsed=0,
                                 track_asset_ids=[track["assetId"] for track in track_states])

    def _load(self, project: ProjectRecord, parent_id: str) -> tuple[Path, Path, dict, Path]:
        directory, state_path = self._paths(project, parent_id)
        state = _read_atomic_json(state_path)
        if state.get("parentId") != parent_id or state.get("version") != 1:
            raise ValueError("Checkpoint MKV không hợp lệ")
        if state["finished"]:
            final_source = media_asset_file(directory, "source-final.mkv")
            if not final_source.is_file():
                raise FileNotFoundError("Bản MKV cuối trong project đã mất")
            return directory, state_path, state, final_source
        locator = self.registry.get(project.id, parent_id)
        if not locator:
            raise FileNotFoundError("Không có file MKV nguồn trên máy này; hãy kết nối lại file gốc")
        source = Path(locator)
        if not source.is_file():
            raise FileNotFoundError("File MKV nguồn đã di chuyển hoặc bị xóa")
        return directory, state_path, state, source

    def _recover(self, project: ProjectRecord, directory: Path, state: dict) -> None:
        snapshot = media_asset_file(directory, "source.mkv")
        if snapshot.stat().st_size < state["snapshotBytes"]:
            raise ValueError("Bản sao MKV trong project ngắn hơn checkpoint")
        with snapshot.open("r+b") as output:
            output.truncate(state["snapshotBytes"])
        root = Path(project.project_path)
        for track in state["tracks"]:
            path = media_asset_file(media_asset_directory(root, track["assetId"]), "analysis.wav")
            expected = WAV_HEADER + track["frames"] * SAMPLE_BYTES
            if path.stat().st_size < expected:
                raise ValueError("Audio trong project ngắn hơn checkpoint")
            with path.open("r+b") as output:
                output.truncate(expected)
                output.seek(0)
                output.write(_wav_header(track["frames"]))

    def _append_pcm(self, path: Path, prior_frames: int, pcm: bytes,
                    *, gap_frames: int = 0) -> int:
        if len(pcm) % SAMPLE_BYTES:
            raise ValueError("PCM fragment không đủ frame")
        next_frames = prior_frames + gap_frames + len(pcm) // SAMPLE_BYTES
        header = _wav_header(next_frames)
        with path.open("r+b") as output:
            output.seek(WAV_HEADER + prior_frames * SAMPLE_BYTES)
            remaining = gap_frames * SAMPLE_BYTES
            while remaining:
                amount = min(remaining, 1024 * 1024)
                output.write(b"\0" * amount)
                remaining -= amount
            output.write(pcm)
            output.seek(0)
            output.write(header)
            output.flush()
            os.fsync(output.fileno())
        return next_frames

    def _publish(self, project: ProjectRecord, state: dict, *, final: bool = False) -> None:
        root = Path(project.project_path)
        directory, _ = self._paths(project, state["parentId"])
        tracks = {}
        for track in state["tracks"]:
            if final:
                path = directory / "final" / media_asset_file(directory, f"{track['streamIndex']}.wav").name
            else:
                path = media_asset_file(media_asset_directory(root, track["assetId"]), "analysis.wav")
            frames = track.get("finalFrames", track["frames"]) if final else track["frames"]
            tracks[track["assetId"]] = (path.relative_to(root).as_posix(), frames / RATE)
        final_source = (media_asset_file(directory, "source-final.mkv")).relative_to(root).as_posix() if final else None
        self.library.refresh_followed_mkv(project.id, state["parentId"], tracks, final_source)

    def poll(self, project: ProjectRecord, parent_id: str, *, final: bool = False,
             max_clusters: int | None = None) -> dict:
        try:
            return self._poll(project, parent_id, final=final, max_clusters=max_clusters)
        except Exception as exc:
            self._fail_follow(project, parent_id, exc)
            raise

    def _poll(self, project: ProjectRecord, parent_id: str, *, final: bool = False,
              max_clusters: int | None = None) -> dict:
        with self._lock(parent_id):
            directory, state_path, state, source = self._load(project, parent_id)
            if state["finished"]:
                return self.status(project, parent_id)
            parent = self.library.get(project.id, parent_id)
            self._ensure_follow_task(project, parent_id, parent.name,
                f"Reading committed MKV clusters ({state['snapshotBytes']} project bytes; source remains open)")
            assert_same_source(source, state["identity"], state["cursor"],
                               state["lastCluster"], allow_header_change=final)
            self._recover(project, directory, state)
            scan = scan_committed(source, from_offset=state["cursor"], final=final,
                                  max_clusters=max_clusters)
            snapshot = media_asset_file(directory, "source.mkv")
            with snapshot.open("rb") as stored:
                header_bytes = stored.read(state["identity"]["headerEnd"])
            root = Path(project.project_path)
            for cluster in scan.clusters:
                with source.open("rb") as original:
                    original.seek(cluster.start)
                    cluster_bytes = original.read(cluster.end - cluster.start)
                if hashlib.sha256(cluster_bytes).hexdigest() != cluster.sha256:
                    raise ValueError("MKV Cluster thay đổi trong lúc đọc")
                with tempfile.TemporaryDirectory() as temporary:
                    fragment = Path(temporary) / "fragment.mkv"
                    fragment.write_bytes(header_bytes + cluster_bytes)
                    decoded = self._decode_cluster(fragment, state["tracks"])
                sequence = state["sequence"] + 1
                for track, pts, pcm in decoded:
                    chunk_dir = directory / "chunks" / str(track["streamIndex"])
                    chunk_dir.mkdir(parents=True, exist_ok=True)
                    chunk = chunk_dir / f"{sequence:08d}.wav"
                    _write_wav(chunk, pcm)
                    start_frame = round(pts * RATE)
                    if start_frame < 0:
                        pcm = pcm[min(len(pcm), -start_frame * SAMPLE_BYTES):]
                        start_frame = 0
                    if start_frame > track["frames"]:
                        gap = start_frame - track["frames"]
                        track["gaps"].append({"startFrame": track["frames"], "frames": gap})
                    elif start_frame < track["frames"]:
                        pcm = pcm[min(len(pcm), (track["frames"] - start_frame) * SAMPLE_BYTES):]
                        gap = 0
                    else:
                        gap = 0
                    analysis = media_asset_file(media_asset_directory(root, track["assetId"]), "analysis.wav")
                    track["frames"] = self._append_pcm(analysis, track["frames"], pcm,
                                                        gap_frames=gap)
                    track["lastChunk"] = sequence
                with snapshot.open("ab") as output:
                    output.write(cluster_bytes)
                    output.flush()
                    os.fsync(output.fileno())
                state["snapshotBytes"] += len(cluster_bytes)
                state["cursor"] = cluster.end
                state["lastCluster"] = {"start": cluster.start, "end": cluster.end,
                                        "sha256": cluster.sha256}
                state["sequence"] = sequence
                _atomic_json(state_path, state)
            self._publish(project, state)
            CENTER.update_task(self._follow_task_id(project, parent_id),
                detail=f"Reading committed MKV clusters ({state['snapshotBytes']} project bytes; source remains open)",
                fraction=None, asset_id=parent_id, footage_id=parent_id, group_label=parent.name)
            return self._status(state, scan.visible_size)

    @staticmethod
    def _status(state: dict, visible: int) -> dict:
        return {"assetId": state["parentId"], "committedBytes": state["cursor"],
                "visibleBytes": visible, "clusters": state["sequence"],
                "finished": state["finished"],
                "sttDetailedEnabled": bool(state.get("sttDetailedEnabled", True)),
                "sttSegmentSeconds": int(state.get("sttSegmentSeconds", 60)),
                "tracks": [
                    {"assetId": item["assetId"], "streamIndex": item["streamIndex"],
                     "frames": item.get("finalFrames", item["frames"]) if state["finished"] else item["frames"],
                     "lastChunk": item["lastChunk"], "gaps": item["gaps"]}
                    for item in state["tracks"]]}

    def status(self, project: ProjectRecord, parent_id: str) -> dict:
        _, _, state, source = self._load(project, parent_id)
        return self._status(state, source.stat().st_size)

    def request_finish(self, project: ProjectRecord, source_value: str) -> list[str]:
        """Bind an authenticated OBS Stop path to matching local follow checkpoints."""
        source = Path(source_value).expanduser().resolve()
        matched = []
        for parent in self.library.list(project.id):
            if not parent.growing_mkv_follow or parent.deleted_at or parent.disabled:
                continue
            locator = self.registry.get(project.id, parent.id)
            if not locator or Path(locator).resolve() != source:
                continue
            with self._lock(parent.id):
                _, path, state, _ = self._load(project, parent.id)
                if state["finished"]:
                    continue
                state["finishRequested"] = True
                _atomic_json(path, state)
            matched.append(parent.id)
        return matched

    def advance(self, project: ProjectRecord, parent_id: str, *, max_clusters: int = 8) -> dict:
        """Follow live clusters, or import the complete closed source in the worker."""
        try:
            return self._advance(project, parent_id, max_clusters=max_clusters)
        except Exception as exc:
            self._fail_follow(project, parent_id, exc)
            raise

    def _advance(self, project: ProjectRecord, parent_id: str, *, max_clusters: int = 8) -> dict:
        with self._lock(parent_id):
            _, _, state, source = self._load(project, parent_id)
            if state["finished"]:
                return self.status(project, parent_id)
            if state.get("finishRequested") or has_closed_segment(source):
                return self.finish(project, parent_id, explicit_final_stt=True)
            try:
                return self.poll(project, parent_id, max_clusters=max_clusters)
            except ValueError:
                # OBS may seal the header between the closure check and poll.
                if has_closed_segment(source):
                    return self.finish(project, parent_id, explicit_final_stt=True)
                raise

    def configure_detailed_stt(self, project: ProjectRecord, parent_id: str,
                               segment_seconds: int) -> dict:
        if not 10 <= segment_seconds <= 600:
            raise ValueError("Độ dài đoạn STT phải từ 10 đến 600 giây")
        # The decoder can hold the writer lock across several Clusters. Capture
        # its atomically published checkpoint before waiting, to keep click-time bounds.
        directory, state_path = self._paths(project, parent_id)
        requested = _read_atomic_json(state_path)
        requested_frames = {track["assetId"]: int(track.get("finalFrames", track["frames"])
                            if requested["finished"] else track["frames"])
                            for track in requested["tracks"]}
        with self._lock(parent_id):
            directory, state_path = self._paths(project, parent_id)
            state = _read_atomic_json(state_path)
            if state.get("parentId") != parent_id:
                raise ValueError("MKV follow checkpoint không hợp lệ")
            if state.get("finalSttMode") == "explicit-full-file":
                raise ValueError("MKV đã hoàn tất; dùng Speech to text để STT toàn bộ track")
            selected = []
            for track in state["tracks"]:
                asset = self.library.get(project.id, track["assetId"])
                if asset.import_selected and asset.transcription_selected and not asset.deleted_at and not asset.disabled:
                    selected.append(track)
            if not selected:
                raise ValueError("Hãy chọn ít nhất một track STT trong menu footage")
            current_seconds = int(state.get("sttSegmentSeconds", 60))
            if segment_seconds != current_seconds and state.get("sttPlan"):
                raise ValueError("STT kỹ đã bắt đầu; không thể đổi độ dài đoạn trong bản ghi này")
            state["sttSegmentSeconds"] = segment_seconds
            state["sttDetailedEnabled"] = True
            # Snapshot committed audio at the button press, not when the GPU is free.
            # A repeated request resumes the same durable plan.
            plan = state.setdefault("sttPlan", {"id": uuid4().hex, "initialFrames": {}})
            for track in selected:
                plan["initialFrames"].setdefault(track["assetId"], requested_frames.get(track["assetId"], 0))
                plan.setdefault("inputRevisionCounts", {}).setdefault(track["assetId"],
                    len(self.library.get(project.id, track["assetId"]).revisions))
            _atomic_json(state_path, state)
            return {"assetId": parent_id, "segmentSeconds": segment_seconds,
                    "selectedTrackCount": len(selected), "finished": bool(state["finished"])}

    def finish(self, project: ProjectRecord, parent_id: str, *, explicit_final_stt: bool = False) -> dict:
        try:
            return self._finish(project, parent_id, explicit_final_stt=explicit_final_stt)
        except Exception as exc:
            self._fail_follow(project, parent_id, exc)
            raise

    def _finish(self, project: ProjectRecord, parent_id: str, *, explicit_final_stt: bool = False) -> dict:
        with self._lock(parent_id):
            directory, state_path, state, source = self._load(project, parent_id)
            if state["finished"]:
                return self.status(project, parent_id)
            parent = self.library.get(project.id, parent_id)
            self._ensure_follow_task(project, parent_id, parent.name, "Waiting for stable source before final import")
            first = source.stat()
            time.sleep(0.3)
            second = source.stat()
            if (first.st_size, first.st_mtime_ns) != (second.st_size, second.st_mtime_ns):
                raise ValueError("MKV vẫn đang thay đổi; chỉ Finish sau khi recorder dừng")
            if explicit_final_stt:
                # Fence late inference before decoding/copying the full file.
                # Publication uses this same media lock for its check and write.
                with self.library._lock(project.id):
                    state["finalSttMode"] = "explicit-full-file"
                    state["sttDetailedEnabled"] = False
                    _atomic_json(state_path, state)
            self.poll(project, parent_id, final=True)
            state = _read_atomic_json(state_path)
            assert_same_source(source, state["identity"], state["cursor"],
                               state["lastCluster"], allow_header_change=True)
            final_source = media_asset_file(directory, "source-final.mkv")
            self._ensure_follow_task(project, parent_id, parent.name,
                f"Copying final source 0/{second.st_size} bytes")
            with source.open("rb") as original, final_source.open("wb") as output:
                copied = 0
                while chunk := original.read(1024 * 1024):
                    output.write(chunk)
                    copied += len(chunk)
                    if second.st_size > 0:
                        CENTER.update_task(self._follow_task_id(project, parent_id),
                            detail=f"Copying final source {copied}/{second.st_size} bytes",
                            fraction=copied / second.st_size, asset_id=parent_id,
                            footage_id=parent_id, group_label=parent.name)
                output.flush()
                os.fsync(output.fileno())
            final_stat = source.stat()
            if (second.st_size, second.st_mtime_ns) != (final_stat.st_size, final_stat.st_mtime_ns):
                raise ValueError("MKV thay đổi trong lúc hoàn tất; hãy Finish lại")
            digest = _hash_file(final_source)
            final_dir = directory / "final"
            final_dir.mkdir(exist_ok=True)
            for track in state["tracks"]:
                CENTER.update_task(self._follow_task_id(project, parent_id),
                    detail=f"Decoding final audio track {track['streamIndex']}", fraction=None,
                    asset_id=parent_id, footage_id=parent_id, group_label=parent.name)
                destination = final_dir / media_asset_file(directory, f"{track['streamIndex']}.wav").name
                self._decode_to_wav(final_source, track["streamIndex"], destination)
                with wave.open(str(destination), "rb") as audio:
                    track["finalFrames"] = audio.getnframes()
            state["finished"] = True
            state["finalSourceSha256"] = digest
            state["finalSourceBytes"] = final_source.stat().st_size
            state["finalizedAtNs"] = time.time_ns()
            self._publish(project, state, final=True)
            _atomic_json(state_path, state)
            CENTER.finish_task(self._follow_task_id(project, parent_id), status="complete",
                detail="Final MKV source and audio tracks published")
            return self._status(state, final_stat.st_size)
