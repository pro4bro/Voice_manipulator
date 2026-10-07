from __future__ import annotations

import json
import logging
import os
import queue
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from uuid import uuid4

from app.adapters.activity_center import CENTER
from app.adapters.processing_cancellation import ProcessingStopError

# Every worker script prints this before a reply line. The scripts run under
# an engine's own interpreter and cannot import `app`, so each repeats it; a
# test keeps the copies equal.
REPLY_PREFIX = "@@PRO4BRO@@"


logger = logging.getLogger("app.adapters.engine_worker")


class EngineWorkerError(RuntimeError):
    """The engine process could not answer a request."""


class EngineWorkerProcess:
    """One warm engine process, started on first use and stopped when idle.

    The process runs a worker script under the engine's own Python and keeps
    its model loaded between requests; the API side only speaks JSON lines.

    Idle shutdown matters as much as warm starts: a model parked on the GPU is
    VRAM a training run or transcription cannot have.
    """

    def __init__(
        self,
        python: Path,
        script: Path,
        env: dict[str, str] | None = None,
        label: str = "engine",
        idle_seconds: float = 300.0,
        request_timeout: float = 900.0,
    ) -> None:
        self.python = python
        self.env = env or {}
        self.script = script
        self.label = label
        self.idle_seconds = idle_seconds
        self.request_timeout = request_timeout
        self._process: subprocess.Popen[str] | None = None
        self._replies: queue.Queue[dict | None] = queue.Queue()
        self._stderr: deque[str] = deque(maxlen=40)
        self._lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._active_request_id: str | None = None
        self._pending_request_ids: set[str] = set()
        self._cancelled_requests: set[str] = set()
        self._idle: threading.Timer | None = None
        self._idle_token = 0

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def request(self, payload: dict, cancellation_id: str | None = None) -> dict:
        request_id = cancellation_id or payload.get("id") or uuid4().hex
        supplied_id = payload.get("id")
        if supplied_id is not None and supplied_id != request_id:
            raise ValueError("Worker request id must match its cancellation id.")
        payload["id"] = request_id
        self.register_request(request_id)
        with self._lock:
            self._cancel_idle()
            with self._state_lock:
                self._pending_request_ids.discard(request_id)
                if request_id in self._cancelled_requests:
                    self._cancelled_requests.discard(request_id)
                    raise EngineWorkerError(f"Worker {self.label} request was cancelled before it started.")
                self._active_request_id = request_id
            try:
                self._ensure_started()
                with self._state_lock:
                    if request_id in self._cancelled_requests:
                        self._cancelled_requests.discard(request_id)
                        raise EngineWorkerError(f"Worker {self.label} request was cancelled before inference.")
                assert self._process is not None and self._process.stdin is not None
                self._process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
                self._process.stdin.flush()
                while True:
                    reply = self._next_reply()
                    if reply.get("id") == request_id:
                        return reply
            except EngineWorkerError:
                # A worker that did not answer in time is in an unknown state and
                # may be holding the GPU or an audio device; it does not get reused.
                self._stop_locked()
                raise
            except (OSError, ValueError) as exc:
                self._stop_locked()
                raise EngineWorkerError(f"Worker {self.label} dừng giữa chừng: {exc}") from exc
            finally:
                with self._state_lock:
                    if self._active_request_id == request_id:
                        self._active_request_id = None
                    self._cancelled_requests.discard(request_id)
                self._schedule_idle()

    def register_request(self, cancellation_id: str) -> None:
        """Register a caller-owned key before work reaches the serialized worker."""
        with self._state_lock:
            self._pending_request_ids.add(cancellation_id)

    def abandon_request(self, cancellation_id: str) -> None:
        """Forget a registered request that its caller cancelled before dispatch."""
        with self._state_lock:
            if self._active_request_id != cancellation_id:
                self._pending_request_ids.discard(cancellation_id)
                self._cancelled_requests.discard(cancellation_id)

    def cancel_request(self, cancellation_id: str) -> bool:
        """Cancel only the inference request with this caller-owned key."""
        with self._state_lock:
            if self._active_request_id == cancellation_id:
                process = self._process
                if process is not None and process.poll() is None:
                    self._cancelled_requests.add(cancellation_id)
                    try:
                        process.kill()
                    except OSError as exc:
                        if process.poll() is None:
                            raise ProcessingStopError(
                                f"Cannot confirm worker {self.label} stopped after cancellation."
                            ) from exc
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired as exc:
                        if process.poll() is None:
                            raise ProcessingStopError(
                                f"Worker {self.label} remained alive after cancellation."
                            ) from exc
                    return True
                self._cancelled_requests.add(cancellation_id)
                return True
            # A caller may stop after it registers its owner but just before
            # request() reaches the serialized worker lock. This marker makes
            # that exact future request refuse to start without touching a
            # different project's active request.
            if cancellation_id in self._pending_request_ids:
                self._cancelled_requests.add(cancellation_id)
                return True
            return False

    def shutdown(self) -> None:
        with self._lock:
            self._cancel_idle()
            self._stop_locked()

    # ---------- internals ----------

    def _ensure_started(self) -> None:
        if self.running:
            return
        if not self.python.is_file():
            raise EngineWorkerError(f"Không thấy Python của runtime {self.label}: {self.python}")
        # Loading a model takes tens of seconds and used to look like a hang.
        task = CENTER.start_task("model", f"Nạp {self.label}", detail="Khởi động runtime và nạp trọng số")
        logger.info("Nạp %s: khởi động runtime", self.label)
        began = time.perf_counter()
        replies: queue.Queue[dict | None] = queue.Queue()
        stderr: deque[str] = deque(maxlen=40)
        self._replies = replies
        self._stderr = stderr
        environment = {**os.environ, "PYTHONIOENCODING": "utf-8", **self.env}
        with self._state_lock:
            active_id = self._active_request_id
            if active_id in self._cancelled_requests:
                raise EngineWorkerError(f"Worker {self.label} request was cancelled before worker startup.")
            process = subprocess.Popen(
                [str(self.python), "-u", str(self.script)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                env=environment,
                creationflags=0x08000000 if sys.platform == "win32" else 0,  # no console window
            )
            self._process = process
        threading.Thread(target=self._read_stdout, args=(process, replies), daemon=True).start()
        threading.Thread(target=self._read_stderr, args=(process, stderr), daemon=True).start()
        try:
            ready = self._next_reply()
        except Exception as exc:
            CENTER.finish_task(task, status="failed", error=str(exc))
            logger.error("Nạp %s thất bại: %s", self.label, exc)
            raise
        if not ready.get("ready"):
            CENTER.finish_task(task, status="failed", error="worker không báo sẵn sàng")
            raise EngineWorkerError(f"Worker {self.label} không báo sẵn sàng.")
        seconds = time.perf_counter() - began
        CENTER.finish_task(task, detail="Model đã nạp")
        logger.info("%s sẵn sàng sau %.1f giây", self.label, seconds)

    def _next_reply(self) -> dict:
        try:
            reply = self._replies.get(timeout=self.request_timeout)
        except queue.Empty as exc:
            raise EngineWorkerError(f"Worker {self.label} không trả lời kịp.") from exc
        if reply is None:
            tail = " | ".join(list(self._stderr)[-5:])
            raise EngineWorkerError(f"Worker {self.label} đã thoát. {tail}".strip())
        return reply

    def _read_stdout(self, process: subprocess.Popen[str], replies: queue.Queue[dict | None]) -> None:
        assert process.stdout is not None
        for line in process.stdout:
            if line.startswith(REPLY_PREFIX):
                try:
                    replies.put(json.loads(line[len(REPLY_PREFIX):]))
                except ValueError:
                    continue
        replies.put(None)

    def _read_stderr(self, process: subprocess.Popen[str], stderr: deque[str]) -> None:
        assert process.stderr is not None
        for line in process.stderr:
            text = line.strip()
            if text:
                stderr.append(text)

    def _schedule_idle(self) -> None:
        if not self.running or self.idle_seconds <= 0:
            return
        self._idle_token += 1
        self._idle = threading.Timer(self.idle_seconds, self._idle_shutdown, args=(self._idle_token,))
        self._idle.daemon = True
        self._idle.start()

    def _idle_shutdown(self, token: int) -> None:
        with self._lock:
            # A request that started while this timer was waiting for the lock
            # scheduled a newer timer; this one is stale.
            if token == self._idle_token:
                self._stop_locked()

    def _cancel_idle(self) -> None:
        self._idle_token += 1
        if self._idle is not None:
            self._idle.cancel()
            self._idle = None

    def _stop_locked(self) -> None:
        process = self._process
        self._process = None
        if process is None:
            return
        if process.poll() is not None:
            process.wait()
            return
        try:
            assert process.stdin is not None
            process.stdin.write(json.dumps({"command": "shutdown", "id": "shutdown"}) + "\n")
            process.stdin.flush()
            process.wait(timeout=10)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            try:
                process.kill()
            except OSError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.error("Worker %s did not exit after kill", self.label)
