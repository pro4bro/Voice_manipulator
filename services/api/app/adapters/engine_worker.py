from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
from collections import deque
from pathlib import Path
from uuid import uuid4

# Every worker script prints this before a reply line. The scripts run under
# an engine's own interpreter and cannot import `app`, so each repeats it; a
# test keeps the copies equal.
REPLY_PREFIX = "@@PRO4BRO@@"


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
        self._idle: threading.Timer | None = None
        self._idle_token = 0

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def request(self, payload: dict) -> dict:
        with self._lock:
            self._cancel_idle()
            try:
                self._ensure_started()
                request_id = payload.setdefault("id", uuid4().hex)
                assert self._process is not None and self._process.stdin is not None
                self._process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
                self._process.stdin.flush()
                while True:
                    reply = self._next_reply()
                    if reply.get("id") == request_id:
                        return reply
            except (OSError, ValueError) as exc:
                self._stop_locked()
                raise EngineWorkerError(f"Worker {self.label} dừng giữa chừng: {exc}") from exc
            finally:
                self._schedule_idle()

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
        self._replies = queue.Queue()
        self._stderr.clear()
        environment = {**os.environ, "PYTHONIOENCODING": "utf-8", **self.env}
        self._process = subprocess.Popen(
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
        threading.Thread(target=self._read_stdout, args=(self._process,), daemon=True).start()
        threading.Thread(target=self._read_stderr, args=(self._process,), daemon=True).start()
        ready = self._next_reply()
        if not ready.get("ready"):
            raise EngineWorkerError(f"Worker {self.label} không báo sẵn sàng.")

    def _next_reply(self) -> dict:
        try:
            reply = self._replies.get(timeout=self.request_timeout)
        except queue.Empty as exc:
            raise EngineWorkerError(f"Worker {self.label} không trả lời kịp.") from exc
        if reply is None:
            tail = " | ".join(list(self._stderr)[-5:])
            raise EngineWorkerError(f"Worker {self.label} đã thoát. {tail}".strip())
        return reply

    def _read_stdout(self, process: subprocess.Popen[str]) -> None:
        assert process.stdout is not None
        for line in process.stdout:
            if line.startswith(REPLY_PREFIX):
                try:
                    self._replies.put(json.loads(line[len(REPLY_PREFIX):]))
                except ValueError:
                    continue
        self._replies.put(None)

    def _read_stderr(self, process: subprocess.Popen[str]) -> None:
        assert process.stderr is not None
        for line in process.stderr:
            text = line.strip()
            if text:
                self._stderr.append(text)

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
        if process is None or process.poll() is not None:
            return
        try:
            assert process.stdin is not None
            process.stdin.write(json.dumps({"command": "shutdown", "id": "shutdown"}) + "\n")
            process.stdin.flush()
            process.wait(timeout=10)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            process.kill()
