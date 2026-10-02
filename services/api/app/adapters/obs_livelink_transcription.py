"""Best-effort, project-owned live transcript events for durable LiveLink PCM."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import time
import wave
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable
from uuid import uuid4

import httpx

from app.adapters.obs_livelink_connection import LiveLinkError
from app.domain.ports import ProjectRepository


Recognizer = Callable[[str, bytes | None, str], Awaitable[dict]]


class _EventPersistenceError(RuntimeError):
    pass


@dataclass
class _Audio:
    project_id: str
    recording_id: str
    channel_id: str
    source_uuid: str
    alias: str
    sequence: int
    first_sample: int
    sample_rate: int
    channels: int
    plugin_monotonic_ns: int
    recording_started_ns: int
    pcm: bytes
    queued_at: float = field(default_factory=time.monotonic)


@dataclass
class _Utterance:
    utterance_id: str
    start_sequence: int
    start: int
    end: int
    sample_rate: int
    channels: int
    start_monotonic_ns: int
    end_monotonic_ns: int
    source_uuid: str
    alias: str
    session: str
    language: str
    pcm: bytearray = field(default_factory=bytearray)
    buffered_frames: int = 0
    silence_frames: int = 0
    posted: bool = False
    revision: int = 0
    last_text: str = ""
    last_pending: str = ""
    queued_at: float = field(default_factory=time.monotonic)


@dataclass
class _Deferred:
    next_sequence: int
    highest_sequence: int
    template: _Audio


class ObsLiveLinkTranscription:
    """Bounded live queues catch up from committed PCM without delaying ACKs."""

    def __init__(self, projects: ProjectRepository, studio_url: str,
                 batch_running: Callable[[], bool], recognizer: Recognizer | None = None,
                 *, window_seconds: float = 4.0, silence_seconds: float = 0.5,
                 max_queue_chunks: int = 1024, max_queued_bytes: int = 8 * 1024 * 1024) -> None:
        self.projects = projects
        self.studio_url = studio_url.rstrip("/")
        self.batch_running = batch_running
        self.recognizer = recognizer or self._recognize
        self.window_seconds = window_seconds
        self.silence_seconds = silence_seconds
        self.max_queue_chunks = max_queue_chunks
        self.max_queued_bytes = max_queued_bytes
        self._queues: dict[tuple[str, str, str], asyncio.Queue[_Audio | None]] = {}
        self._queued_bytes: dict[tuple[str, str, str], int] = {}
        self._deferred: dict[tuple[str, str, str], _Deferred] = {}
        self._tasks: dict[tuple[str, str, str], asyncio.Task] = {}
        self._model = asyncio.Semaphore(1)
        self._file_lock = asyncio.Lock()
        self._events: dict[Path, list[dict]] = {}
        self._event_keys: dict[Path, dict[tuple[str, str, str, int], dict]] = {}
        self._valid_bytes: dict[Path, int] = {}
        self._finished: set[str] = set()
        self._failed: set[tuple[str, str, str]] = set()
        self._process_epoch = uuid4().hex

    def _path(self, project_id: str, recording_id: str) -> Path:
        root = Path(self.projects.get(project_id).project_path).resolve()
        path = root / "assets" / "obs-livelink" / recording_id / "transcript-events.jsonl"
        if not path.parent.resolve().is_relative_to(root):
            raise LiveLinkError("Invalid transcript path.", 422)
        return path

    def _load(self, path: Path) -> list[dict]:
        if path not in self._events:
            events: list[dict] = []
            valid_bytes = 0
            try:
                with path.open("rb") as source:
                    for line in source:
                        if not line.endswith(b"\n"):
                            break
                        try:
                            event = json.loads(line)
                        except (ValueError, UnicodeDecodeError):
                            break
                        if event.get("eventRevision") != len(events) + 1:
                            break
                        events.append(event)
                        valid_bytes += len(line)
            except FileNotFoundError:
                pass
            self._events[path] = events
            self._event_keys[path] = {
                (event["channelId"], event["utteranceId"], event["status"],
                 event["lastSampleIndexExclusive"]): event
                for event in events if event.get("utteranceId") is not None and
                all(key in event for key in ("channelId", "status", "lastSampleIndexExclusive"))
            }
            self._valid_bytes[path] = valid_bytes
        return self._events[path]

    def snapshot(self, project_id: str, recording_id: str, after_revision: int = 0) -> dict:
        path = self._path(project_id, recording_id)
        if not (path.parent / "recording.json").is_file():
            raise LiveLinkError("OBS recording is unknown.", 404)
        events = self._load(path)
        return {"schemaVersion": 1, "recordingId": recording_id,
                "revision": events[-1]["eventRevision"] if events else 0,
                "events": [event for event in events if event["eventRevision"] > after_revision]}

    async def _append(self, item: _Audio, utterance: _Utterance | None, *, status: str,
                      text: str = "", pending: str = "", error: str | None = None) -> None:
        async with self._file_lock:
            path = self._path(item.project_id, item.recording_id)
            events = self._load(path)
            event_key = ((item.channel_id, utterance.utterance_id, status,
                          utterance.end) if utterance else None)
            existing = self._event_keys[path].get(event_key) if event_key else None
            if existing is not None:
                utterance.revision = max(utterance.revision, existing["revision"])
                return
            revision = events[-1]["eventRevision"] + 1 if events else 1
            if utterance:
                utterance.revision += 1
            event = {
                "schemaVersion": 1, "eventRevision": revision,
                "recordingId": item.recording_id, "channelId": item.channel_id,
                "sourceUuid": item.source_uuid, "alias": item.alias,
                "utteranceId": utterance.utterance_id if utterance else None,
                "revision": utterance.revision if utterance else 0,
                "firstSampleIndex": utterance.start if utterance else item.first_sample,
                "lastSampleIndexExclusive": utterance.end if utterance else item.first_sample,
                "sampleRate": utterance.sample_rate if utterance else item.sample_rate,
                "startSeconds": round(max(0, ((utterance.start_monotonic_ns if utterance else
                                                item.plugin_monotonic_ns) -
                                               item.recording_started_ns) / 1e9), 6),
                "endSeconds": round(max(0, ((utterance.end_monotonic_ns if utterance else
                                              item.plugin_monotonic_ns) -
                                             item.recording_started_ns) / 1e9), 6),
                "status": status, "text": text, "pending": pending,
                "timingTrust": "segment" if utterance else "none",
                "lagSeconds": round(max(0.0, time.monotonic() -
                                         (utterance.queued_at if utterance else item.queued_at)), 3),
                "error": error,
            }
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.is_file() and path.stat().st_size > self._valid_bytes[path]:
                with path.open("r+b") as output:
                    output.truncate(self._valid_bytes[path])
                    output.flush()
                    os.fsync(output.fileno())
            line = (json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
            with path.open("ab") as output:
                output.write(line)
                output.flush()
                os.fsync(output.fileno())
            events.append(event)
            if event_key:
                self._event_keys[path][event_key] = event
            self._valid_bytes[path] += len(line)

    def _progress_path(self, key: tuple[str, str, str]) -> Path:
        project_id, recording_id, channel_id = key
        return self._path(project_id, recording_id).parent / "channels" / channel_id / "live-stt-progress.json"

    def _read_progress(self, key: tuple[str, str, str]) -> dict | None:
        path = self._progress_path(key)
        if not path.is_file():
            return None
        progress = json.loads(path.read_text(encoding="utf-8"))
        active = progress.get("activeStartSequence")
        if (progress.get("schemaVersion") != 1 or
                progress.get("recordingId") != key[1] or
                progress.get("channelId") != key[2] or
                type(progress.get("nextSequence")) is not int or
                progress["nextSequence"] < 0 or
                (active is not None and
                 (type(active) is not int or active < 0 or active >= progress["nextSequence"]))):
            raise ValueError(f"Invalid Live STT progress for track {key[2]}.")
        return progress

    def _save_progress(self, key: tuple[str, str, str], next_sequence: int,
                       active_start_sequence: int | None) -> None:
        path = self._progress_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {"schemaVersion": 1, "recordingId": key[1], "channelId": key[2],
                "nextSequence": next_sequence,
                "activeStartSequence": active_start_sequence}
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("wb") as output:
                output.write(json.dumps(data, separators=(",", ":")).encode())
                output.flush()
                os.fsync(output.fileno())
            for attempt in range(8):
                try:
                    os.replace(temporary, path)
                    break
                except PermissionError:
                    if attempt == 7:
                        raise
                    time.sleep(0.01 * (attempt + 1))
        finally:
            temporary.unlink(missing_ok=True)

    def resume_recording(self, project_id: str, recording_id: str) -> int:
        """Resume committed per-track PCM after the API process is recreated."""
        root = self._path(project_id, recording_id).parent
        journal = json.loads((root / "recording.json").read_text(encoding="utf-8"))
        recording = journal["recording"]
        if recording["recordingId"] != recording_id or recording["projectId"] != project_id:
            raise ValueError("Live STT recording journal identity changed.")
        stopped = recording["status"] == "stopped" and recording.get("archiveStatus") == "ready"
        legacy_ready = (stopped and journal.get("liveSttRecoveryVersion") != 1 and
                        not any((root / "channels").glob("*/live-stt-progress.json")))
        if legacy_ready:
            return 0
        labels = {item["channelId"]: item["relayLabel"] for item in journal["channels"]}
        started = recording["startedMonotonicNs"]
        resumed = 0
        for folder in sorted((root / "channels").glob("*/chunks")):
            channel_id = folder.parent.name
            if channel_id not in labels:
                continue
            key = project_id, recording_id, channel_id
            if key in self._tasks:
                continue
            files = sorted(path for path in folder.glob("*.json") if path.stem.isdecimal())
            if not files:
                continue
            progress = self._read_progress(key)
            next_sequence = progress["nextSequence"] if progress else 0
            active = progress["activeStartSequence"] if progress else None
            first = active if active is not None else next_sequence
            last_sequence = int(files[-1].stem)
            if next_sequence > last_sequence + 1:
                raise ValueError(f"Live STT progress exceeds committed PCM for track {channel_id}.")
            if first > last_sequence:
                continue
            metadata = json.loads(files[-1].read_text(encoding="utf-8"))
            template = _Audio(project_id, recording_id, channel_id,
                              metadata["sourceUuid"], labels[channel_id],
                              last_sequence, metadata["firstSampleIndex"],
                              metadata["sampleRate"], metadata["channels"],
                              metadata["pluginMonotonicNs"], started, b"")
            queue: asyncio.Queue[_Audio | None] = asyncio.Queue(maxsize=self.max_queue_chunks)
            self._queues[key] = queue
            self._queued_bytes[key] = 0
            self._deferred[key] = _Deferred(first, last_sequence, template)
            self._tasks[key] = asyncio.create_task(self._run(key, queue))
            resumed += 1
        if stopped:
            self._finished.add(recording_id)
        return resumed

    async def close(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def offer(self, *, project_id: str, recording_id: str, channel_id: str,
              source_uuid: str, alias: str, sequence: int, first_sample: int,
              sample_rate: int, channels: int, plugin_monotonic_ns: int,
              recording_started_ns: int, pcm: bytes) -> None:
        # Finalize follows the last durable PCM upload. Never open a new queue
        # for a delayed/retried upload after the recording's tail was drained.
        if recording_id in self._finished:
            return
        item = _Audio(project_id, recording_id, channel_id, source_uuid, alias,
                      sequence, first_sample, sample_rate, channels,
                      plugin_monotonic_ns, recording_started_ns, pcm)
        key = project_id, recording_id, channel_id
        if key in self._failed:
            # PCM remains committed; a new API process replays from the last
            # checkpoint. Do not skip this gap by opening a fresh queue.
            return
        queue = self._queues.get(key)
        if queue is None:
            queue = asyncio.Queue(maxsize=self.max_queue_chunks)
            self._queues[key] = queue
            self._queued_bytes[key] = 0
            self._tasks[key] = asyncio.create_task(self._run(key, queue))
        deferred = self._deferred.get(key)
        if deferred is not None:
            deferred.highest_sequence = max(deferred.highest_sequence, sequence)
            deferred.template = replace(item, pcm=b"")
            return
        try:
            if self._queued_bytes[key] + len(pcm) > self.max_queued_bytes:
                raise asyncio.QueueFull
            queue.put_nowait(item)
            self._queued_bytes[key] += len(pcm)
        except asyncio.QueueFull:
            # The API already committed this chunk. Keep only a sequence range
            # here; the worker reads the audio from its durable source files.
            self._deferred[key] = _Deferred(sequence, sequence, replace(item, pcm=b""))

    def finish(self, recording_id: str) -> None:
        if recording_id in self._finished:
            return
        self._finished.add(recording_id)
        for key, queue in list(self._queues.items()):
            if key[1] == recording_id and queue.empty():
                queue.put_nowait(None)

    def _read_deferred(self, key: tuple[str, str, str], deferred: _Deferred) -> _Audio:
        project_id, recording_id, channel_id = key
        sequence = deferred.next_sequence
        root = self._path(project_id, recording_id).parent
        path = root / "channels" / channel_id / "chunks" / f"{sequence:012d}.json"
        metadata = json.loads(path.read_text(encoding="utf-8"))
        pcm = path.with_suffix(".pcm").read_bytes()
        if (metadata["sequence"] != sequence or
                metadata["sourceUuid"] != deferred.template.source_uuid or
                len(pcm) != metadata["frameCount"] * metadata["channels"] * 2 or
                hashlib.sha256(pcm).hexdigest() != metadata["sha256"]):
            raise ValueError(f"Durable Live STT PCM chunk {sequence} failed verification.")
        received = datetime.fromisoformat(metadata["receivedAtUtc"].replace("Z", "+00:00"))
        age = max(0.0, (datetime.now(timezone.utc) - received).total_seconds())
        return replace(
            deferred.template, sequence=sequence,
            first_sample=metadata["firstSampleIndex"], sample_rate=metadata["sampleRate"],
            channels=metadata["channels"], plugin_monotonic_ns=metadata["pluginMonotonicNs"],
            pcm=pcm, queued_at=time.monotonic() - age,
        )

    async def _append_event(self, item: _Audio, utterance: _Utterance | None, **fields) -> None:
        try:
            await self._append(item, utterance, **fields)
        except (OSError, KeyError, ValueError) as exc:
            raise _EventPersistenceError("Live STT event could not be saved.") from exc

    async def _run(self, key: tuple[str, str, str], queue: asyncio.Queue[_Audio | None]) -> None:
        utterance: _Utterance | None = None
        last: _Audio | None = None
        try:
            while True:
                deferred = self._deferred.get(key) if queue.empty() else None
                from_queue = deferred is None
                if deferred is not None:
                    try:
                        item = await asyncio.to_thread(self._read_deferred, key, deferred)
                    except (OSError, ValueError, KeyError, TypeError) as exc:
                        await self._append_event(deferred.template, None, status="error",
                                                 error=f"Durable Live STT catch-up stopped: {exc}")
                        break
                elif queue.empty() and key[1] in self._finished:
                    if utterance and last:
                        await self._complete(last, utterance)
                        await asyncio.to_thread(self._save_progress, key, last.sequence + 1, None)
                    break
                else:
                    item = await queue.get()
                if item is not None and from_queue:
                    self._queued_bytes[key] -= len(item.pcm)
                processed = False
                try:
                    if item is None:
                        continue
                    if utterance and (item.first_sample != utterance.end + utterance.silence_frames or
                                      item.sample_rate != utterance.sample_rate or
                                      item.channels != utterance.channels):
                        await self._complete(last or item, utterance)
                        utterance = None
                    last = item
                    frames = len(item.pcm) // (item.channels * 2)
                    # PCM is s16le; sample a few frames to avoid scanning every channel sample.
                    samples = memoryview(item.pcm).cast("h")
                    voiced = any(abs(samples[index]) >= 500 for index in range(0, len(samples),
                                                                                max(item.channels, len(samples) // 800)))
                    if not voiced:
                        if utterance:
                            utterance.silence_frames += frames
                            if utterance.silence_frames >= item.sample_rate * self.silence_seconds:
                                await self._complete(item, utterance)
                                utterance = None
                        processed = True
                        continue
                    if utterance is None:
                        utterance = _Utterance(
                            utterance_id=f"{item.recording_id}:{item.channel_id}:{item.first_sample}",
                            start_sequence=item.sequence,
                            start=item.first_sample, end=item.first_sample,
                            sample_rate=item.sample_rate, channels=item.channels,
                            start_monotonic_ns=item.plugin_monotonic_ns,
                            end_monotonic_ns=item.plugin_monotonic_ns,
                            source_uuid=item.source_uuid, alias=item.alias,
                            session=(f"obs-v3-{item.recording_id}-{item.channel_id}-"
                                     f"{item.first_sample}-{self._process_epoch}"),
                            language=self.projects.get(item.project_id).language or "",
                            queued_at=item.queued_at,
                        )
                        await self._append_event(item, utterance, status="listening")
                    utterance.alias = item.alias
                    utterance.pcm.extend(item.pcm)
                    utterance.buffered_frames += frames
                    utterance.end = item.first_sample + frames
                    utterance.end_monotonic_ns = (item.plugin_monotonic_ns +
                                                  round(frames * 1e9 / item.sample_rate))
                    utterance.silence_frames = 0
                    if utterance.buffered_frames >= item.sample_rate * self.window_seconds:
                        await self._partial(item, utterance)
                    processed = True
                except _EventPersistenceError:
                    raise
                except Exception as exc:
                    if item is not None:
                        await self._append_event(item, utterance, status="error", error=str(exc))
                    utterance = None
                    processed = True
                finally:
                    try:
                        if item is not None and processed:
                            await asyncio.to_thread(self._save_progress, key, item.sequence + 1,
                                                    utterance.start_sequence if utterance else None)
                    finally:
                        if from_queue:
                            queue.task_done()
                        elif deferred is not None and processed:
                            deferred.next_sequence += 1
                            if deferred.next_sequence > deferred.highest_sequence:
                                self._deferred.pop(key, None)
        except Exception as exc:
            self._failed.add(key)
            logging.getLogger(__name__).exception("LiveLink STT worker stopped for %s", key)
            if last is not None:
                try:
                    await self._append_event(last, None, status="error",
                                             error=f"Live STT worker stopped: {exc}")
                except _EventPersistenceError:
                    pass
        finally:
            self._queues.pop(key, None)
            self._queued_bytes.pop(key, None)
            self._deferred.pop(key, None)
            self._tasks.pop(key, None)

    @staticmethod
    def _wav(utterance: _Utterance) -> bytes:
        output = io.BytesIO()
        with wave.open(output, "wb") as target:
            target.setnchannels(utterance.channels)
            target.setsampwidth(2)
            target.setframerate(utterance.sample_rate)
            target.writeframes(utterance.pcm)
        return output.getvalue()

    async def _partial(self, item: _Audio, utterance: _Utterance) -> None:
        if self.batch_running():
            raise RuntimeError("Batch STT is using the model; durable audio is intact.")
        async with self._model:
            result = await self.recognizer(utterance.session, self._wav(utterance), utterance.language)
        utterance.posted = True
        utterance.pcm.clear()
        utterance.buffered_frames = 0
        utterance.last_text = str(result.get("text") or "")
        utterance.last_pending = str(result.get("pending") or "")
        await self._append_event(item, utterance, status="partial",
                                 text=utterance.last_text, pending=utterance.last_pending)

    async def _final(self, item: _Audio, utterance: _Utterance) -> None:
        if utterance.pcm and not self.batch_running():
            await self._partial(item, utterance)
        if utterance.posted:
            async with self._model:
                result = await self.recognizer(utterance.session, None, utterance.language)
            text = str(result.get("text") or utterance.last_text)
            await self._append_event(item, utterance, status="final", text=text)
        elif self.batch_running():
            await self._append_event(item, utterance, status="error",
                                     error="Live STT unavailable while batch STT uses the model.")

    async def _complete(self, item: _Audio, utterance: _Utterance) -> None:
        try:
            await self._final(item, utterance)
        except _EventPersistenceError:
            raise
        except Exception as exc:
            await self._append_event(item, utterance, status="error", error=str(exc))

    async def _recognize(self, session: str, wav: bytes | None, language: str) -> dict:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=3.0)) as client:
            if wav is None:
                response = await client.post(f"{self.studio_url}/api/audio/live/end",
                                             data={"session": session})
            else:
                response = await client.post(
                    f"{self.studio_url}/api/audio/live/chunk",
                    files={"file": ("obs-v3.wav", wav, "audio/wav")},
                    data={"session": session, "model": "medium", "language": language},
                )
        response.raise_for_status()
        return response.json()
