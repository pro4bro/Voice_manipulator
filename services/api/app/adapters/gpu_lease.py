from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.adapters.listening_ports import process_is_alive
from app.domain.models import GpuLeaseHolder

# How long a holder may go quiet before a live process is still assumed to be
# working. Training goes minutes between anything worth writing down, so this is
# generous on purpose; a dead process is detected by its pid, not by this.
HEARTBEAT_GRACE_SECONDS = 900


class GpuBusy(RuntimeError):
    """Someone else holds the GPU, and the caller asked not to wait."""

    def __init__(self, holder: GpuLeaseHolder) -> None:
        super().__init__(f"GPU đang được {holder.label} sử dụng.")
        self.holder = holder


class GpuLease:
    """One lease over the machine's GPU, shared by every workload that wants it.

    Transcription, diarization and training all run in different processes and
    all want the same card. Without a lease, a transcription queued during
    training either dies on out-of-memory or drags the run to a crawl - and
    neither failure points anywhere near its cause, which is the expensive part.

    A file rather than an in-process lock, because the three claimants are three
    processes. A holder proves it is alive by its pid: a heartbeat alone cannot
    tell a busy process from a killed one, and a killed one must not hold the
    card until a timeout expires.
    """

    def __init__(self, path: Path) -> None:
        self.path = path

    # ---------- reading ----------

    def holder(self) -> GpuLeaseHolder | None:
        """Who holds it, or None once a dead holder has been cleared."""
        current = self._read()
        if current is None:
            return None
        if not process_is_alive(current.pid):
            # The process that held it is gone. Releasing here is what stops one
            # crashed run from locking the GPU until somebody notices.
            self._clear()
            return None
        return current

    def available(self) -> bool:
        return self.holder() is None

    # ---------- claiming ----------

    def acquire(self, label: str, wait_seconds: float = 0.0, poll: float = 0.5) -> GpuLeaseHolder:
        deadline = time.monotonic() + max(0.0, wait_seconds)
        while True:
            current = self.holder()
            if current is None:
                return self._claim(label)
            if time.monotonic() >= deadline:
                raise GpuBusy(current)
            time.sleep(poll)

    def release(self, token: str) -> bool:
        """Only the holder may release, so a late caller cannot free someone else."""
        current = self._read()
        if current is None or current.token != token:
            return False
        self._clear()
        return True

    def heartbeat(self, token: str) -> bool:
        current = self._read()
        if current is None or current.token != token:
            return False
        self._write(current.model_copy(update={"heartbeat_at": datetime.now(timezone.utc)}))
        return True

    # ---------- internals ----------

    def _claim(self, label: str) -> GpuLeaseHolder:
        now = datetime.now(timezone.utc)
        holder = GpuLeaseHolder(
            token=uuid4().hex,
            label=label,
            pid=os.getpid(),
            acquired_at=now,
            heartbeat_at=now,
        )
        self._write(holder)
        return holder

    def _read(self) -> GpuLeaseHolder | None:
        if not self.path.is_file():
            return None
        try:
            return GpuLeaseHolder.model_validate(json.loads(self.path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            # A half-written lease is not a lease. Treating it as one would hand
            # the GPU to nobody, permanently.
            self._clear()
            return None

    def _write(self, holder: GpuLeaseHolder) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(holder.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def _clear(self) -> None:
        self.path.unlink(missing_ok=True)
