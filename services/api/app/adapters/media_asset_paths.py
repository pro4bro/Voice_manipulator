"""Readable folders for new imports, with unchanged lookup of legacy assets.

IDs remain the identity. Names are only a filesystem label fixed at import time;
all persisted media paths remain relative to the project.
"""
from functools import lru_cache
from pathlib import Path
import re


def safe_media_stem(filename: str) -> str:
    # Treat either upload separator as a basename, even on another host OS.
    stem = Path(filename.replace("\\", "/").rsplit("/", 1)[-1]).stem
    stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", stem).strip(" .")[:64].rstrip(" .")
    if not stem:
        return "footage"
    if re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", stem):
        stem = "_" + stem
    return stem


def _media_root(root: Path, asset_id: str) -> Path:
    if not asset_id or asset_id in {".", ".."} or not re.fullmatch(r"[\w-]+", asset_id):
        raise ValueError("Media asset id không hợp lệ")
    root = root.resolve()
    media = root / "assets" / "media"
    if not media.resolve().is_relative_to(root):
        raise ValueError("Media folder nằm ngoài project")
    return media


def asset_id_from_directory(directory: Path) -> str:
    return directory.name.rsplit("--", 1)[-1]


@lru_cache(maxsize=4096)
def _named_directory(media: Path, asset_id: str) -> Path:
    matches = [path for path in media.glob(f"*--{asset_id}") if path.is_dir()]
    if not matches:
        raise FileNotFoundError(asset_id)  # Missing lookups are not cached.
    if len(matches) != 1:
        raise ValueError("Media asset có nhiều folder trùng id")
    return matches[0]


def media_asset_directory(root: Path, asset_id: str) -> Path:
    media = _media_root(root, asset_id)
    legacy = media / asset_id
    directory = legacy
    if not legacy.is_dir():
        try:
            directory = _named_directory(media, asset_id)
            if not directory.is_dir():
                _named_directory.cache_clear()
                directory = _named_directory(media, asset_id)
        except FileNotFoundError:
            pass
    if not directory.resolve().is_relative_to(media.resolve()):
        raise ValueError("Media asset folder nằm ngoài project")
    return directory


def create_media_asset_directory(root: Path, asset_id: str, filename: str) -> Path:
    directory = _media_root(root, asset_id) / f"{safe_media_stem(filename)}--{asset_id}"
    directory.mkdir(parents=True, exist_ok=False)
    return directory


def media_asset_file(directory: Path, role: str) -> Path:
    """Prefix media bytes; keep checkpoint/JSON sidecar names stable."""
    prefix, separator, _ = directory.name.rpartition("--asset-")
    return directory / (f"{prefix}--{role}" if separator else role)
