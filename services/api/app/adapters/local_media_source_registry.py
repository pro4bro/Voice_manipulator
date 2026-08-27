from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path


class LocalMediaSourceRegistry:
    """Machine-local source locators. Never stored in portable project files."""

    def __init__(self, data_root: Path) -> None:
        self.path = data_root / ".registry" / "local-media-sources.json"
        self._lock = threading.RLock()

    def get(self, project_id: str, asset_id: str) -> str | None:
        with self._lock:
            record = self._read().get(self._key(project_id, asset_id))
            value = record.get("sourcePath") if isinstance(record, dict) else None
            return str(value) if value else None

    def set(self, project_id: str, asset_id: str, source_path: Path) -> None:
        source = source_path.resolve()
        with self._lock:
            records = self._read()
            records[self._key(project_id, asset_id)] = {
                "sourcePath": str(source),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
            self._write(records)

    def remove(self, project_id: str, asset_id: str) -> None:
        with self._lock:
            records = self._read()
            if records.pop(self._key(project_id, asset_id), None) is not None:
                self._write(records)

    @staticmethod
    def _key(project_id: str, asset_id: str) -> str:
        return f"{project_id}:{asset_id}"

    def _read(self) -> dict[str, dict[str, str]]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, ValueError, TypeError):
            return {}

    def _write(self, records: dict[str, dict[str, str]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(records, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(self.path)
