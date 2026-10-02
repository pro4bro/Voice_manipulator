"""Project-owned IDs of OBS recordings permanently removed from Media Pool."""

from __future__ import annotations

import json
import os
from pathlib import Path


def _path(project_root: Path) -> Path:
    return project_root / "assets" / "obs-livelink" / "deleted-recordings.json"


def deleted_recording_ids(project_root: Path) -> set[str]:
    try:
        value = json.loads(_path(project_root).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return set()
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError("OBS deletion marker is invalid.")
    return set(value)


def mark_recording_deleted(project_root: Path, recording_id: str) -> None:
    path = _path(project_root)
    ids = deleted_recording_ids(project_root)
    ids.add(recording_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(sorted(ids), output, indent=2)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)
