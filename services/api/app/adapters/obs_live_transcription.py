"""Best-effort provisional STT fed only after OBS chunks are durably acknowledged."""

from __future__ import annotations

import asyncio
import io
import time
import wave
from dataclasses import dataclass, field
from typing import Callable, Literal

import httpx

from app.adapters.obs_live_sessions import FileObsLiveSessions
from app.domain.models import ObsLiveSession


@dataclass
class _Stream:
    project_id: str
    session_id: str
    sample_rate: int
    channels: int
    pcm: bytearray = field(default_factory=bytearray)


@dataclass(frozen=True)
class _Message:
    kind: Literal["audio", "stop"]
    project_id: str
    session_id: str
    session: ObsLiveSession | None = None
    pcm: bytes = b""
    queued_at: float = 0.0


class ObsLiveTranscriber:
    """A bounded single-GPU queue; failure never propagates to capture ingest."""

    def __init__(
        self, sessions: FileObsLiveSessions, studio_url: str,
        batch_running: Callable[[], bool], chunk_seconds: int = 4,
    ) -> None:
        self.sessions = sessions
        self.studio_url = studio_url.rstrip("/")
        self.batch_running = batch_running
        self.chunk_seconds = chunk_seconds
        self._queue: asyncio.Queue[_Message] = asyncio.Queue(maxsize=128)
        self._streams: dict[tuple[str, str], _Stream] = {}
        self._worker: asyncio.Task[None] | None = None

    def offer(self, project_id: str, session: ObsLiveSession, pcm: bytes) -> None:
        self._start()
        try:
            self._queue.put_nowait(_Message(
                kind="audio", project_id=project_id, session_id=session.id,
                session=session, pcm=pcm, queued_at=time.monotonic(),
            ))
            self.sessions.update_live_stt(project_id, session.id, status="listening")
        except asyncio.QueueFull:
            self.sessions.update_live_stt(
                project_id, session.id, status="error",
                error="Live STT chậm hơn luồng ghi; audio gốc vẫn được giữ đầy đủ.",
            )

    def finish(self, project_id: str, session_id: str) -> None:
        self._start()
        try:
            self._queue.put_nowait(_Message(
                kind="stop", project_id=project_id, session_id=session_id,
                queued_at=time.monotonic(),
            ))
        except asyncio.QueueFull:
            self.sessions.update_live_stt(project_id, session_id, status="stopped")

    def _start(self) -> None:
        if self._worker is None or self._worker.done():
            self._worker = asyncio.create_task(self._run(), name="obs-live-stt")

    async def _run(self) -> None:
        while True:
            message = await self._queue.get()
            try:
                await self._handle(message)
            except Exception as exc:  # Capture remains authoritative even when provisional STT fails.
                try:
                    self.sessions.update_live_stt(
                        message.project_id, message.session_id, status="error", error=str(exc),
                    )
                except (KeyError, OSError):
                    pass
            finally:
                self._queue.task_done()

    async def _handle(self, message: _Message) -> None:
        key = (message.project_id, message.session_id)
        if message.kind == "stop":
            stream = self._streams.pop(key, None)
            if stream and stream.pcm and not self.batch_running():
                await self._transcribe(stream, message.queued_at)
            await self._end(message.project_id, message.session_id)
            return

        assert message.session is not None
        stream = self._streams.setdefault(key, _Stream(
            project_id=message.project_id, session_id=message.session_id,
            sample_rate=message.session.sample_rate, channels=message.session.channels,
        ))
        stream.pcm.extend(message.pcm)
        needed = stream.sample_rate * stream.channels * 2 * self.chunk_seconds
        if len(stream.pcm) < needed:
            return
        if self.batch_running():
            self.sessions.update_live_stt(
                message.project_id, message.session_id, status="paused",
                error="Live STT tạm nghỉ trong khi batch Speech to Text dùng model.",
            )
            return
        await self._transcribe(stream, message.queued_at)

    async def _transcribe(self, stream: _Stream, queued_at: float) -> None:
        pcm = bytes(stream.pcm)
        stream.pcm.clear()
        wav = io.BytesIO()
        with wave.open(wav, "wb") as output:
            output.setnchannels(stream.channels)
            output.setsampwidth(2)
            output.setframerate(stream.sample_rate)
            output.writeframes(pcm)
        self.sessions.update_live_stt(stream.project_id, stream.session_id, status="transcribing", error=None)
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=3.0)) as client:
            response = await client.post(
                f"{self.studio_url}/api/audio/live/chunk",
                files={"file": ("obs-live.wav", wav.getvalue(), "audio/wav")},
                data={"session": f"obs-{stream.session_id}", "model": "tiny", "language": ""},
            )
        if response.status_code >= 400:
            raise RuntimeError("Studio không nhận dạng được OBS live audio.")
        result = response.json()
        self.sessions.update_live_stt(
            stream.project_id, stream.session_id, status="live",
            text=str(result.get("text") or ""), pending=str(result.get("pending") or ""),
            error=None, lag_seconds=time.monotonic() - queued_at,
        )

    async def _end(self, project_id: str, session_id: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=3.0)) as client:
                response = await client.post(
                    f"{self.studio_url}/api/audio/live/end",
                    data={"session": f"obs-{session_id}"},
                )
            if response.status_code < 400:
                result = response.json()
                current = self.sessions.get(project_id, session_id)
                self.sessions.update_live_stt(
                    project_id, session_id, status="stopped",
                    text=str(result.get("text") or current.live_text), pending="", error=None,
                )
                return
        except httpx.RequestError:
            pass
        self.sessions.update_live_stt(project_id, session_id, status="stopped", pending="")
