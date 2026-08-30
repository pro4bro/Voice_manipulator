from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.domain.models import ProjectMediaAsset


class MediaIndexStore:
    """Split-file persistence for the Media Pool index and its word timings.

    Word timings dominate the size of a project: a 2.7 hour recording carries tens
    of thousands of words, and keeping them in the shared index made every read of
    any field parse and re-validate all of them. Metadata therefore lives in a
    small `index.json`, while each asset owns `assets/media/<id>/words.json`.

    Both layers are cached in memory and revalidated by file identity, so repeated
    reads cost a `stat` instead of a parse. Writes stay atomic through a temporary
    file, and a legacy index that still embeds words is migrated on first load.
    """

    WORDS_FILE = "words.json"

    @dataclass
    class _Entry:
        signature: tuple[int, int] | None = None
        assets: list[ProjectMediaAsset] = field(default_factory=list)
        words: dict[str, tuple[tuple[int, int] | None, list[dict[str, Any]]]] = field(
            default_factory=dict
        )

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entries: dict[str, MediaIndexStore._Entry] = {}

    # ---------- index ----------

    def read_index(self, project_root: Path, project_id: str) -> list[ProjectMediaAsset]:
        """Return metadata-only assets. `words` is empty until explicitly attached."""
        path = self._index_path(project_root)
        with self._lock:
            entry = self._entries.setdefault(project_id, MediaIndexStore._Entry())
            signature = self._signature(path)
            if signature is not None and signature == entry.signature:
                return list(entry.assets)
            assets, embedded = self._parse_index(path)
            if embedded:
                # Legacy layout: move each asset's words into its own file once, then
                # rewrite the index without them.
                for asset_id, words in embedded.items():
                    self.write_words(project_root, project_id, asset_id, words)
                self.write_index(project_root, project_id, assets)
                return list(self._entries[project_id].assets)
            entry.signature = signature
            entry.assets = assets
            return list(assets)

    def write_index(
        self, project_root: Path, project_id: str, assets: list[ProjectMediaAsset]
    ) -> None:
        path = self._index_path(project_root)
        payload = [
            asset.model_dump(by_alias=True, mode="json", exclude={"words"}) for asset in assets
        ]
        with self._lock:
            self._write_json(path, payload, indent=2)
            entry = self._entries.setdefault(project_id, MediaIndexStore._Entry())
            entry.assets = [asset.model_copy(update={"words": []}) for asset in assets]
            entry.signature = self._signature(path)

    # ---------- words ----------

    def read_words(
        self, project_root: Path, project_id: str, asset_id: str
    ) -> list[dict[str, Any]]:
        path = self._words_path(project_root, asset_id)
        with self._lock:
            entry = self._entries.setdefault(project_id, MediaIndexStore._Entry())
            signature = self._signature(path)
            cached = entry.words.get(asset_id)
            if cached is not None and cached[0] == signature:
                return [dict(word) for word in cached[1]]
            if signature is None:
                entry.words[asset_id] = (None, [])
                return []
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError, TypeError):
                raw = []
            words = [word for word in raw if isinstance(word, dict)] if isinstance(raw, list) else []
            entry.words[asset_id] = (signature, words)
            return [dict(word) for word in words]

    def write_words(
        self,
        project_root: Path,
        project_id: str,
        asset_id: str,
        words: list[dict[str, Any]],
    ) -> None:
        path = self._words_path(project_root, asset_id)
        stored = [dict(word) for word in words if isinstance(word, dict)]
        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            self._write_json(path, stored, indent=None)
            entry = self._entries.setdefault(project_id, MediaIndexStore._Entry())
            entry.words[asset_id] = (self._signature(path), stored)

    def forget(self, project_id: str, asset_id: str | None = None) -> None:
        with self._lock:
            entry = self._entries.get(project_id)
            if entry is None:
                return
            if asset_id is None:
                self._entries.pop(project_id, None)
            else:
                entry.words.pop(asset_id, None)

    def remove_words(self, project_root: Path, project_id: str, asset_id: str) -> None:
        self._words_path(project_root, asset_id).unlink(missing_ok=True)
        self.forget(project_id, asset_id)

    # ---------- internals ----------

    @classmethod
    def _index_path(cls, project_root: Path) -> Path:
        path = project_root / "assets" / "media" / "index.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    def _words_path(cls, project_root: Path, asset_id: str) -> Path:
        return project_root / "assets" / "media" / asset_id / cls.WORDS_FILE

    @staticmethod
    def _signature(path: Path) -> tuple[int, int] | None:
        try:
            stat = path.stat()
        except OSError:
            return None
        return (stat.st_mtime_ns, stat.st_size)

    @staticmethod
    def _write_json(path: Path, payload: Any, indent: int | None) -> None:
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=indent), encoding="utf-8"
        )
        temporary.replace(path)

    @staticmethod
    def _parse_index(
        path: Path,
    ) -> tuple[list[ProjectMediaAsset], dict[str, list[dict[str, Any]]]]:
        if not path.is_file():
            return [], {}
        try:
            records = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return [], {}
        if not isinstance(records, list):
            return [], {}
        assets: list[ProjectMediaAsset] = []
        embedded: dict[str, list[dict[str, Any]]] = {}
        for record in records:
            if not isinstance(record, dict):
                continue
            words = record.get("words")
            try:
                asset = ProjectMediaAsset.model_validate({**record, "words": []})
            except (ValueError, TypeError):
                continue
            if isinstance(words, list) and words:
                embedded[asset.id] = [word for word in words if isinstance(word, dict)]
            assets.append(asset)
        return assets, embedded
