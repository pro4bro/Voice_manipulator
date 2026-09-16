"""What the app is doing right now, and everything it has said about it.

One place the whole app reports into, so a person never has to guess whether
something is running:

- **tasks** - the work in flight (training, STT, diarization, TTS, a voice
  changer session, a model being loaded), each with a label, a detail line and a
  fraction where one is known. The status bar reads these.
- **events** - the log, from every part of the app: Python logging in this
  process (the runner, the queues, uvicorn) and the STT sidecar's own log file,
  which is a separate process. The Voice Training log panel reads these.

A repeated line is kept once with a count rather than a thousand times: engines
print the same warning per step, and a log that is 97% one line hides the line
that matters.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.domain.models import ActivityEvent, ActivitySnapshot, ActivityTask

# Loggers to the part of the app a person recognises.
SOURCES = {
    "pro4bro.training": "training",
    "pro4bro.activity": "job",
    "pro4bro.tts": "tts",
    "pro4bro.voice-changer": "voice-changer",
    "app.adapters.voice_changer": "voice-changer",
    "app.adapters.voice_script_speaker": "tts",
    "app.adapters.omnivoice_generator": "tts",
    "app.adapters.engine_worker": "engine",
    "uvicorn.error": "api",
    "uvicorn.access": "api",
    "uvicorn": "api",
    "fastapi": "api",
}

LEVELS = {
    logging.DEBUG: "info",
    logging.INFO: "info",
    logging.WARNING: "warning",
    logging.ERROR: "error",
    logging.CRITICAL: "error",
}

# How long a finished task stays visible, so the end of a job is seen and not
# just its disappearance.
KEEP_FINISHED_SECONDS = 25.0


def source_for(logger_name: str) -> str:
    if logger_name in SOURCES:
        return SOURCES[logger_name]
    for prefix, source in SOURCES.items():
        if logger_name.startswith(prefix + "."):
            return source
    return "app"


class ActivityCenter:
    def __init__(self, capacity: int = 3000) -> None:
        self._events: deque[ActivityEvent] = deque(maxlen=capacity)
        self._tasks: dict[str, ActivityTask] = {}
        self._lock = threading.Lock()
        self._seq = 0

    # ---------- log ----------

    def log(self, source: str, message: str, level: str = "info", task_id: str | None = None) -> None:
        message = message.rstrip()
        if not message:
            return
        with self._lock:
            last = self._events[-1] if self._events else None
            if last is not None and last.source == source and last.level == level and last.message == message:
                # The same line again: count it where it already is.
                self._events.pop()
                self._seq += 1
                self._events.append(
                    last.model_copy(update={"seq": self._seq, "at": datetime.now(timezone.utc), "repeat": last.repeat + 1})
                )
                return
            self._seq += 1
            self._events.append(
                ActivityEvent(seq=self._seq, source=source, level=level, message=message, task_id=task_id)
            )

    def events(self, after: int = 0, limit: int = 400) -> list[ActivityEvent]:
        with self._lock:
            found = [event for event in self._events if event.seq > after]
        return found[-limit:]

    # ---------- tasks ----------

    def start_task(
        self,
        kind: str,
        label: str,
        *,
        task_id: str | None = None,
        detail: str = "",
        fraction: float | None = None,
        project_id: str | None = None,
    ) -> str:
        task_id = task_id or f"{kind}-{uuid4().hex[:8]}"
        with self._lock:
            self._tasks[task_id] = ActivityTask(
                id=task_id, kind=kind, label=label, detail=detail, fraction=fraction,
                status="running", project_id=project_id,
            )
        return task_id

    def update_task(
        self,
        task_id: str,
        *,
        detail: str | None = None,
        fraction: float | None = None,
        label: str | None = None,
        eta_seconds: float | None = None,
    ) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None or task.status != "running":
                return
            updates: dict[str, object] = {"updated_at": datetime.now(timezone.utc)}
            if detail is not None:
                updates["detail"] = detail
            if fraction is not None:
                updates["fraction"] = max(0.0, min(1.0, fraction))
            if label is not None:
                updates["label"] = label
            if eta_seconds is not None:
                updates["eta_seconds"] = max(0.0, eta_seconds)
            self._tasks[task_id] = task.model_copy(update=updates)

    def finish_task(self, task_id: str, status: str = "complete", detail: str | None = None, error: str | None = None) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            now = datetime.now(timezone.utc)
            self._tasks[task_id] = task.model_copy(update={
                "status": status,
                "detail": detail if detail is not None else task.detail,
                "error": error,
                "fraction": 1.0 if status == "complete" else task.fraction,
                "eta_seconds": None,
                "updated_at": now,
                "finished_at": now,
                "seconds": (now - task.started_at).total_seconds(),
            })

    def tasks(self) -> list[ActivityTask]:
        """Everything running, plus what just finished, newest last."""
        cutoff = datetime.now(timezone.utc).timestamp() - KEEP_FINISHED_SECONDS
        with self._lock:
            for task_id, task in list(self._tasks.items()):
                if task.finished_at is not None and task.finished_at.timestamp() < cutoff:
                    self._tasks.pop(task_id, None)
            return sorted(self._tasks.values(), key=lambda task: task.started_at)

    def snapshot(self, after: int = 0, limit: int = 400) -> ActivitySnapshot:
        with self._lock:
            seq = self._seq
        return ActivitySnapshot(seq=seq, events=self.events(after, limit), tasks=self.tasks())

    def reset(self) -> None:
        with self._lock:
            self._events.clear()
            self._tasks.clear()
            self._seq = 0


# One per process, like the logger it listens to.
CENTER = ActivityCenter()


# Libraries that narrate their own plumbing. Their lines say nothing about what
# the app is doing and would be most of the log.
IGNORED_ROOTS = {"httpx", "httpcore", "urllib3", "asyncio", "watchfiles", "multipart", "filelock", "PIL", "matplotlib", "numba"}


class ActivityLogHandler(logging.Handler):
    """Every log line in this process, into the activity stream."""

    def __init__(self, center: ActivityCenter | None = None) -> None:
        super().__init__(level=logging.INFO)
        self.center = center or CENTER
        self._quiet: logging.Filter | None = None

    def quiet_polls(self) -> logging.Filter:
        # Imported here: activity_logging reports into this module.
        from app.adapters.activity_logging import QuietPollFilter

        if self._quiet is None:
            self._quiet = QuietPollFilter()
        return self._quiet

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if record.name.split(".")[0] in IGNORED_ROOTS:
                return
            if record.name == "uvicorn.access" and not self.quiet_polls().filter(record):
                return
            message = record.getMessage()
            if record.exc_info and record.exc_text is None:
                record.exc_text = self.format(record)
            self.center.log(source_for(record.name), message, LEVELS.get(record.levelno, "info"))
        except Exception:  # noqa: BLE001 - logging must never take the app down
            pass


class LogFileTail:
    """New lines of another process's log file, into the activity stream.

    The STT sidecar runs as its own process; without this its model loading and
    recognition lines would only ever be in a file nobody has open.
    """

    def __init__(self, paths: list[Path], center: ActivityCenter | None = None, source: str = "stt", interval: float = 2.0) -> None:
        self.paths = paths
        self.center = center or CENTER
        self.source = source
        self.interval = interval
        self._offsets: dict[Path, int] = {}
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        for path in self.paths:
            try:
                self._offsets[path] = path.stat().st_size if path.is_file() else 0
            except OSError:
                self._offsets[path] = 0
        self._thread = threading.Thread(target=self._run, name="pro4bro-log-tail", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def read_once(self) -> int:
        lines = 0
        for path in self.paths:
            try:
                if not path.is_file():
                    continue
                size = path.stat().st_size
                offset = self._offsets.get(path, 0)
                if size < offset:  # the file was rotated or truncated
                    offset = 0
                if size == offset:
                    continue
                with path.open("rb") as handle:
                    handle.seek(offset)
                    chunk = handle.read(size - offset)
                self._offsets[path] = size
                for line in chunk.decode("utf-8", errors="replace").splitlines():
                    text = line.strip()
                    if not text:
                        continue
                    self.center.log(self.source, text, level_of(text))
                    lines += 1
            except OSError:
                continue
        return lines

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self.read_once()


def level_of(text: str) -> str:
    upper = text.upper()
    if "ERROR" in upper or "TRACEBACK" in upper or "EXCEPTION" in upper or "CRITICAL" in upper:
        return "error"
    if "WARN" in upper:
        return "warning"
    return "info"


# Loggers uvicorn and the app configure with propagate=False: the root handler
# never sees them, so the handler goes on them as well.
STANDALONE_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access", "pro4bro.activity")


def install(center: ActivityCenter | None = None) -> ActivityLogHandler:
    """Listen to this process's logging; safe to call twice."""
    target = center or CENTER
    root = logging.getLogger()
    handler = next(
        (item for item in root.handlers if isinstance(item, ActivityLogHandler) and item.center is target),
        None,
    )
    if handler is None:
        handler = ActivityLogHandler(target)
        root.addHandler(handler)
        if root.level > logging.INFO or root.level == logging.NOTSET:
            root.setLevel(logging.INFO)
    for name in STANDALONE_LOGGERS:
        logger = logging.getLogger(name)
        if logger.propagate:
            continue  # it reaches the root handler already
        if not any(isinstance(item, ActivityLogHandler) and item.center is target for item in logger.handlers):
            logger.addHandler(handler)
    return handler


def seconds_since(started: float) -> float:
    return max(0.0, time.perf_counter() - started)
