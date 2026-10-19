from __future__ import annotations

import asyncio
import base64
import json
import struct
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.adapters.engine_worker import EngineWorkerError, EngineWorkerProcess
from app.adapters.gpu_lease import GpuBusy, GpuLease

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "vibevoice_streaming_worker.py"
MAX_CHUNK_SECONDS = 1.0
MAX_SESSION_SECONDS = 60 * 60
SESSION_IDLE_SECONDS = 25.0
MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024
MAX_CONTEXT_CHARS = 4096


class VibeVoiceStreamingError(RuntimeError):
    """The streaming VibeVoice ASR session could not continue safely."""


@dataclass
class _Session:
    session_id: str
    lease_token: str
    started_at: float
    last_activity: float
    request_id: str | None = None
    cancelled: bool = False
    starting: bool = True
    cancel_event: threading.Event = field(default_factory=threading.Event)
    startup_done: threading.Event = field(default_factory=threading.Event)


class VibeVoiceStreamingAsr:
    """Own one GPU-leased streaming ASR session through a separate checkout."""

    def __init__(
        self,
        vibevoice_root: Path | None,
        python: Path | None,
        gpu_lease: GpuLease,
        *,
        before_gpu_work=None,
        worker: EngineWorkerProcess | None = None,
        session_idle_seconds: float = SESSION_IDLE_SECONDS,
        max_session_seconds: float = MAX_SESSION_SECONDS,
    ) -> None:
        self.root = Path(vibevoice_root).resolve() if vibevoice_root else None
        self.checkout = self.root / "VibeVoice-streaming" if self.root else None
        # VibeVoice-streaming uses the lowercase import package directly under
        # the checkout; never point embedded Python at the legacy VibeVoice tree.
        self.repo = self.checkout if self.checkout else None
        self.model_dir = (
            self.root / "VibeVoice_models" / "microsoft" / "VibeVoice-ASR-Streaming-7B"
            if self.root else None
        )
        self.python = Path(python).resolve() if python else None
        self.gpu_lease = gpu_lease
        self.before_gpu_work = before_gpu_work
        self.session_idle_seconds = session_idle_seconds
        self.max_session_seconds = max_session_seconds
        self.worker = worker or self._default_worker()
        self._lock = threading.RLock()
        self._session: _Session | None = None
        self._config: dict[str, Any] | None = None

    def unavailable_reason(self) -> str | None:
        if not self.checkout or not (self.checkout / "demo" / "vibevoice_asr_streaming_fastapi_demo.py").is_file():
            return "VibeVoice streaming checkout or its official demo is missing."
        if (
            not self.repo
            or not (self.repo / "vibevoice" / "__init__.py").is_file()
            or not (self.repo / "vibevoice" / "modular" / "modeling_vibevoice_asr.py").is_file()
        ):
            return "VibeVoice streaming model source is missing."
        if not self.python or not self.python.is_file():
            return "VibeVoice Python runtime is missing."
        if not self.model_dir or not (self.model_dir / "config.json").is_file():
            return "VibeVoice-ASR-Streaming-7B config is missing."
        preprocessor = self.model_dir / "preprocessor_config.json"
        if not preprocessor.is_file():
            return "Streaming checkpoint preprocessor_config.json is missing."
        try:
            config = json.loads(preprocessor.read_text(encoding="utf-8"))
            sample_rate = int(config["target_sample_rate"])
            compression = int(config["speech_tok_compress_ratio"])
            chunk_frames = int(config["chunk_frames"])
            lookahead_frames = int(config["lookahead_frames"])
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            return "Streaming checkpoint preprocessor configuration is invalid."
        if (
            min(sample_rate, compression, chunk_frames) <= 0
            or lookahead_frames < 0
            or sample_rate > 192000
            or compression > 100000
            or chunk_frames > 100000
            or lookahead_frames > 100000
            or (chunk_frames + lookahead_frames) * compression > sample_rate * 30
        ):
            return "Streaming checkpoint chunk settings are invalid."
        for name in ("tokenizer.json", "tokenizer_config.json", "added_tokens.json"):
            path = self.model_dir / name
            if not path.is_file() or path.stat().st_size == 0:
                return f"Streaming checkpoint {name} is missing or empty."
        index = self.model_dir / "model.safetensors.index.json"
        if index.is_file():
            try:
                weight_map = json.loads(index.read_text(encoding="utf-8"))["weight_map"]
            except (OSError, ValueError, KeyError, TypeError, AttributeError):
                return "Streaming checkpoint shard index is invalid."
            if not isinstance(weight_map, dict) or any(not isinstance(name, str) for name in weight_map.values()):
                return "Streaming checkpoint shard index is invalid."
            shards = set(weight_map.values())
            if not shards or any(
                Path(name).name != name or not (self.model_dir / name).is_file()
                or (self.model_dir / name).stat().st_size == 0
                for name in shards
            ):
                return "Streaming checkpoint has missing or empty weight shards."
        else:
            single = self.model_dir / "model.safetensors"
            if not single.is_file() or single.stat().st_size == 0:
                return "Streaming checkpoint weights are missing."
        self._config = config
        return None

    def status(self) -> dict[str, Any]:
        reason = self.unavailable_reason()
        config = self._config or {}
        compression = int(config.get("speech_tok_compress_ratio") or 1)
        sample_rate = int(config.get("target_sample_rate") or 0)
        chunk_samples = int(config.get("chunk_frames") or 0) * compression
        with self._lock:
            session_active = self._session is not None
        return {
            "available": reason is None,
            "running": bool(getattr(self.worker, "running", False)),
            "reason": reason,
            "sampleRate": sample_rate or None,
            "chunkSeconds": chunk_samples / sample_rate if sample_rate else None,
            "sessionActive": session_active,
        }

    def begin(
        self,
        session_id: str,
        context: str | None = None,
        cancel_event: threading.Event | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            if cancel_event is not None and cancel_event.is_set():
                raise VibeVoiceStreamingError("Streaming ASR session was cancelled.")
            if self._session is not None:
                raise VibeVoiceStreamingError("A streaming ASR session is already active.")
            reason = self.unavailable_reason()
            if reason:
                raise VibeVoiceStreamingError(reason)
            assert self._config is not None
            sample_rate = int(self._config["target_sample_rate"])
            if context and len(context) > MAX_CONTEXT_CHARS:
                raise VibeVoiceStreamingError(f"Context must be at most {MAX_CONTEXT_CHARS} characters.")
            try:
                lease = self.gpu_lease.acquire(f"vibevoice-streaming:{session_id}")
            except GpuBusy as exc:
                raise VibeVoiceStreamingError(str(exc)) from exc
            session = _Session(
                session_id, lease.token, time.monotonic(), time.monotonic(),
                cancel_event=cancel_event or threading.Event(),
            )
            self._session = session
        try:
            with self._lock:
                if session.cancel_event.is_set():
                    raise VibeVoiceStreamingError("Streaming ASR session was cancelled.")
            try:
                # Acquire the shared lease before touching other runtimes or loading
                # this model. This callback may free VRAM owned by another worker.
                if self.before_gpu_work:
                    self.before_gpu_work()
            finally:
                with self._lock:
                    session.starting = False
                    session.startup_done.set()
            if session.cancel_event.is_set():
                raise VibeVoiceStreamingError("Streaming ASR session was cancelled.")
            reply = self._request(session, {
                "command": "begin", "sessionId": session_id, "repo": str(self.repo),
                "model": str(self.model_dir), "context": (context or "")[:MAX_CONTEXT_CHARS],
                "maxSessionSeconds": self.max_session_seconds,
                "maxTranscriptBytes": MAX_TRANSCRIPT_BYTES,
            })
            if not reply.get("ok"):
                raise VibeVoiceStreamingError(reply.get("error") or "Streaming ASR did not start.")
            return {"sampleRate": sample_rate, "chunkSeconds": reply.get("chunkSeconds")}
        except Exception:
            self._release(session)
            raise

    def chunk(self, session_id: str, pcm: bytes, sample_rate: int) -> dict[str, Any]:
        with self._lock:
            session = self._require_session(session_id)
            assert self._config is not None
            expected_rate = int(self._config["target_sample_rate"])
            if sample_rate != expected_rate:
                raise VibeVoiceStreamingError(f"PCM sample rate must be {expected_rate} Hz.")
            if not pcm or len(pcm) % 4:
                raise VibeVoiceStreamingError("PCM chunk must contain little-endian float32 samples.")
            if len(pcm) > int(expected_rate * MAX_CHUNK_SECONDS * 4):
                raise VibeVoiceStreamingError("PCM chunk must be no longer than one second.")
            try:
                samples = struct.unpack(f"<{len(pcm) // 4}f", pcm)
            except struct.error as exc:
                raise VibeVoiceStreamingError("PCM chunk is malformed.") from exc
            if any(not (-1.0 <= value <= 1.0) for value in samples):
                raise VibeVoiceStreamingError("PCM chunk contains non-finite or out-of-range samples.")
            self._check_limits(session, len(samples), expected_rate)
        try:
            reply = self._request(session, {
                "command": "chunk", "pcmBase64": base64.b64encode(pcm).decode("ascii"),
                "sampleRate": sample_rate,
            })
            if not reply.get("ok"):
                raise VibeVoiceStreamingError(reply.get("error") or "Streaming ASR chunk failed.")
            return {"type": "partial", "text": reply.get("partial", ""), "chunks": reply.get("chunks", 0)}
        except Exception:
            self._release(session)
            raise

    def end(self, session_id: str) -> dict[str, Any]:
        with self._lock:
            session = self._require_session(session_id)
        try:
            reply = self._request(session, {"command": "end"})
            if not reply.get("ok"):
                raise VibeVoiceStreamingError(reply.get("error") or "Streaming ASR finalization failed.")
            return {"type": "final", "text": reply.get("final", ""), "chunks": reply.get("chunks", 0)}
        except EngineWorkerError as exc:
            raise VibeVoiceStreamingError(str(exc)) from exc
        finally:
            self._release(session)

    def cancel(self, session_id: str) -> bool:
        with self._lock:
            session = self._session
            if session is None or session.session_id != session_id:
                return False
            session.cancelled = True
            session.cancel_event.set()
            request_id = session.request_id
            starting = session.starting
        if starting and request_id is None:
            # Startup owns the lease until the hook/model initialization exits.
            # The begin thread observes the event and performs final cleanup.
            return True
        try:
            if request_id:
                self.worker.cancel_request(request_id)
        except Exception:
            pass
        finally:
            self._release(session)
        return True

    def close(self) -> None:
        """Stop the owned worker and release any active session on app shutdown."""
        with self._lock:
            session = self._session
        if session is not None:
            self.cancel(session.session_id)
            if session.starting:
                session.startup_done.wait(timeout=300.0)
            # The begin thread performs release after an in-flight startup hook
            # exits; this call waits for it before application shutdown continues.
            deadline = time.monotonic() + 300.0
            while self._session is session and time.monotonic() < deadline:
                time.sleep(0.01)
        else:
            self.worker.shutdown()

    def expire_if_idle(self, session_id: str) -> bool:
        with self._lock:
            session = self._session
            if session is None or session.session_id != session_id:
                return False
            if time.monotonic() - session.last_activity <= self.session_idle_seconds:
                return False
        self.cancel(session_id)
        return True

    def _request(self, session: _Session, payload: dict[str, Any]) -> dict[str, Any]:
        request_id = uuid4().hex
        with self._lock:
            if self._session is not session or session.cancelled or session.cancel_event.is_set():
                raise VibeVoiceStreamingError("Streaming ASR session was cancelled.")
            session.request_id = request_id
        try:
            return self.worker.request(payload, cancellation_id=request_id)
        except EngineWorkerError as exc:
            raise VibeVoiceStreamingError(str(exc)) from exc
        finally:
            with self._lock:
                if session.request_id == request_id:
                    session.request_id = None
                session.last_activity = time.monotonic()

    def _require_session(self, session_id: str) -> _Session:
        session = self._session
        if session is None or session.session_id != session_id:
            raise VibeVoiceStreamingError("Streaming ASR session is not active.")
        if time.monotonic() - session.started_at > self.max_session_seconds:
            self._release(session)
            raise VibeVoiceStreamingError("Streaming ASR session exceeded its maximum duration.")
        if time.monotonic() - session.last_activity > self.session_idle_seconds:
            self._release(session)
            raise VibeVoiceStreamingError("Streaming ASR session expired after inactivity.")
        return session

    def _check_limits(self, session: _Session, sample_count: int, sample_rate: int) -> None:
        if time.monotonic() - session.started_at + sample_count / sample_rate > self.max_session_seconds:
            self._release(session)
            raise VibeVoiceStreamingError("Streaming ASR session exceeded its maximum duration.")

    def _release(self, session: _Session) -> None:
        with self._lock:
            if self._session is session:
                session.cancelled = True
                self._session = None
                release_lease = True
            else:
                release_lease = False
        if release_lease:
            # Keep the lease until inference has stopped and model memory is freed.
            self.worker.shutdown()
            self.gpu_lease.release(session.lease_token)

    def _default_worker(self) -> EngineWorkerProcess:
        env = {
            "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
        }
        python = self.python or Path("python")
        return EngineWorkerProcess(
            python, WORKER_SCRIPT, env, label="VibeVoice-ASR-Streaming",
            idle_seconds=max(30.0, self.session_idle_seconds + 5.0), request_timeout=300.0,
        )


def make_vibevoice_streaming_router(service: VibeVoiceStreamingAsr) -> APIRouter:
    router = APIRouter()

    @router.get("/api/stt/vibevoice-streaming/status")
    async def status() -> dict[str, Any]:
        return service.status()

    @router.websocket("/api/stt/vibevoice-streaming")
    async def stream(ws: WebSocket) -> None:
        await ws.accept()
        session_id = uuid4().hex
        complete = False
        try:
            try:
                options = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=15.0))
            except (asyncio.TimeoutError, json.JSONDecodeError, ValueError, RuntimeError):
                await ws.close(code=1008, reason="A JSON start message is required.")
                return
            if not isinstance(options, dict) or options.get("type") != "start":
                await ws.close(code=1008, reason="A JSON start message is required.")
                return
            requested_rate = options.get("sampleRate")
            availability = await asyncio.to_thread(service.status)
            if not availability["available"]:
                await ws.send_json({"type": "error", "error": availability["reason"]})
                await ws.close(code=1011, reason="Streaming ASR is unavailable.")
                return
            expected_rate = availability["sampleRate"]
            if isinstance(requested_rate, bool) or requested_rate != expected_rate:
                await ws.send_json({"type": "error", "error": f"sampleRate must be {expected_rate} Hz."})
                await ws.close(code=1008, reason="Unsupported sample rate.")
                return
            context = options.get("context") or ""
            if not isinstance(context, str):
                await ws.close(code=1008, reason="Context must be text.")
                return
            cancel_event = threading.Event()
            begin_task = asyncio.create_task(asyncio.to_thread(service.begin, session_id, context, cancel_event))
            startup_receive = asyncio.create_task(ws.receive())
            done, _ = await asyncio.wait(
                {begin_task, startup_receive}, return_when=asyncio.FIRST_COMPLETED
            )
            if startup_receive in done:
                startup_message = startup_receive.result()
                cancel_event.set()
                await asyncio.to_thread(service.cancel, session_id)
                await asyncio.gather(begin_task, return_exceptions=True)
                if startup_message.get("type") != "websocket.disconnect":
                    await ws.send_json({"type": "error", "error": "Wait for the ready response before sending audio."})
                    await ws.close(code=1008, reason="Audio arrived before session readiness.")
                return
            startup_receive.cancel()
            await asyncio.gather(startup_receive, return_exceptions=True)
            started = await begin_task
            await ws.send_json({"type": "ready", **started})
            while True:
                try:
                    message = await asyncio.wait_for(ws.receive(), timeout=min(30.0, service.session_idle_seconds))
                except asyncio.TimeoutError:
                    if await asyncio.to_thread(service.expire_if_idle, session_id):
                        await ws.close(code=1008, reason="Session expired after inactivity.")
                        return
                    continue
                if message.get("type") == "websocket.disconnect":
                    return
                if message.get("bytes") is not None:
                    reply = await asyncio.to_thread(service.chunk, session_id, message["bytes"], started["sampleRate"])
                    await ws.send_json(reply)
                    continue
                raw = message.get("text")
                try:
                    command = json.loads(raw) if raw else None
                except json.JSONDecodeError:
                    command = {"type": raw}
                if command == "end" or (isinstance(command, dict) and command.get("type") == "end"):
                    reply = await asyncio.to_thread(service.end, session_id)
                    await ws.send_json(reply)
                    complete = True
                    return
                await ws.send_json({"type": "error", "error": "Expected binary PCM or a JSON end message."})
                await ws.close(code=1008, reason="Invalid streaming protocol message.")
                return
        except WebSocketDisconnect:
            return
        except (VibeVoiceStreamingError, EngineWorkerError) as exc:
            try:
                await ws.send_json({"type": "error", "error": str(exc)})
                await ws.close(code=1011, reason="Streaming ASR failed.")
            except Exception:
                pass
        finally:
            if not complete:
                await asyncio.to_thread(service.cancel, session_id)

    return router
