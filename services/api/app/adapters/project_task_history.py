"""Project-owned task receipts. Execution remains owned by the existing queues."""
from __future__ import annotations

import json
import os
import threading
import time
import ctypes
from ctypes import wintypes
from uuid import uuid4
from datetime import datetime, timezone
from pathlib import Path

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.listening_ports import process_is_alive
from app.domain.models import ActivityTask

PROCESS_INSTANCE = uuid4().hex


def process_identity(pid):
    """Creation time distinguishes an API process from a reused Windows PID."""
    try:
        kernel = ctypes.WinDLL("kernel32.dll")
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *([ctypes.POINTER(wintypes.FILETIME)] * 4)]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, int(pid))
        if not handle:
            return None
        try:
            creation, exit_time, kernel_time, user_time = (wintypes.FILETIME() for _ in range(4))
            if kernel.GetProcessTimes(handle, ctypes.byref(creation), ctypes.byref(exit_time), ctypes.byref(kernel_time), ctypes.byref(user_time)):
                return str((creation.dwHighDateTime << 32) | creation.dwLowDateTime)
        finally:
            kernel.CloseHandle(handle)
    except (OSError, AttributeError, TypeError, ValueError):
        return None


PROCESS_STARTED_AT = process_identity(os.getpid())


def owner_record(task):
    return {"ownerPid": os.getpid(), "ownerStartedAt": PROCESS_STARTED_AT,
            "ownerInstance": PROCESS_INSTANCE, "task": task.model_dump(mode="json", by_alias=True)}


def owner_alive(record):
    pid = record.get("ownerPid", 0)
    if pid == os.getpid() and record.get("ownerInstance") == PROCESS_INSTANCE:
        return True
    identity = process_identity(pid)
    return identity is not None and identity == record.get("ownerStartedAt") and process_is_alive(pid)


class ProjectTaskHistory:
    def __init__(self, projects):
        self.projects = projects
        self._lock = threading.RLock()
        self._documents = {}
        self._last_write = {}

    def _load(self, project_id):
        root = Path(self.projects.get(project_id).project_path)
        path = root / "jobs" / "task-queue" / "tasks.json"
        if path not in self._documents:
            document = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"version": 1, "tasks": {}}
            if document.get("version") != 1 or not isinstance(document.get("tasks"), dict):
                raise ValueError("Unsupported project task history")
            changed = False
            for record in document["tasks"].values():
                task = ActivityTask.model_validate(record["task"])
                if task.project_id != project_id:
                    raise ValueError("Task history belongs to another project")
                if task.status in {"queued", "running"} and not owner_alive(record):
                    now = datetime.now(timezone.utc)
                    task = task.model_copy(update={"status": "interrupted", "updated_at": now,
                        "finished_at": now, "eta_seconds": None, "detail": "API đã dừng; chạy lại tác vụ."})
                    record["task"] = task.model_dump(mode="json", by_alias=True)
                    changed = True
            self._documents[path] = document
            if changed:
                self._write(path)
        return path, self._documents[path]

    def _write(self, path):
        FileProjectRepository._atomic_write(path, json.dumps(self._documents[path], ensure_ascii=False))
        self._last_write[path] = time.monotonic()

    def record(self, task, *, force=False):
        if not task.project_id:
            return
        with self._lock:
            path, document = self._load(task.project_id)
            previous = document["tasks"].get(task.id)
            if previous:
                old = ActivityTask.model_validate(previous["task"])
                if old.started_at != task.started_at and not (old.status == "queued" and task.status == "running"):
                    key = f"{old.id}@{old.started_at.isoformat()}"
                    document["tasks"][key] = {**previous, "task": old.model_copy(update={"id": key}).model_dump(mode="json", by_alias=True)}
            document["tasks"][task.id] = owner_record(task)
            if force or time.monotonic() - self._last_write.get(path, 0) >= 1:
                self._write(path)

    def reserve(self, tasks):
        """Publish a batch in one atomic snapshot, retaining no partial prefix."""
        with self._lock:
            path, document = self._load(tasks[0].project_id)
            if any(task.id in document["tasks"] for task in tasks):
                raise ValueError("Task attempt already exists")
            previous = dict(document["tasks"])
            try:
                document["tasks"].update({task.id: owner_record(task) for task in tasks})
                self._write(path)
            except Exception:
                document["tasks"] = previous
                raise

    def tasks(self, project_id):
        with self._lock:
            _, document = self._load(project_id)
            return sorted((ActivityTask.model_validate(record["task"]) for record in document["tasks"].values()),
                          key=lambda task: (task.started_at, task.id))
