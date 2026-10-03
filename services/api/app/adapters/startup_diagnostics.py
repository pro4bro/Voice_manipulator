"""Bounded Python stack evidence for a startup that has not bound its listener."""
from __future__ import annotations

import logging
import os
import sys
import threading
import time


class StartupDiagnostics(logging.Handler):
    def __init__(self, logger: logging.Logger, delay: float = 15,
                 samples: int = 3) -> None:
        super().__init__()
        self.logger = logger
        self.delay = delay
        self.samples = samples
        self._finished = threading.Event()
        self._thread = threading.Thread(target=self._watch, name="pro4bro-startup-watch", daemon=True)

    def __enter__(self):
        self.logger.addHandler(self)
        self._thread.start()
        return self

    def emit(self, record: logging.LogRecord) -> None:
        # Lifespan completion precedes socket creation. Stop only after binding,
        # or a terminal startup failure, so a post-recovery stall stays visible.
        if record.getMessage().startswith(("Uvicorn running on", "Application startup failed")):
            self._finished.set()

    def __exit__(self, *_args) -> None:
        self._finished.set()
        self.logger.removeHandler(self)
        self._thread.join(timeout=1)
        self.close()

    def _watch(self) -> None:
        started = time.monotonic()
        for _ in range(self.samples):
            if self._finished.wait(self.delay):
                return
            frames = sys._current_frames()
            lines = []
            try:
                names = {thread.ident: thread.name for thread in threading.enumerate()}
                for ident, frame in frames.items():
                    if ident == threading.get_ident():
                        continue
                    lines.append(f"thread={names.get(ident, 'unknown')} id={ident}")
                    # No locals or source lines: capture only frame locations.
                    for _ in range(40):
                        lines.append(f"  {frame.f_code.co_filename}:{frame.f_lineno} in {frame.f_code.co_name}")
                        frame = frame.f_back
                        if frame is None:
                            break
            finally:
                # Frame references must not keep workers/projects alive.
                del frames
                frame = None
            if self._finished.is_set():
                return
            self.logger.warning("[startup-stall] pid=%s elapsedSeconds=%.3f\n%s",
                                os.getpid(), time.monotonic() - started, "\n".join(lines))
