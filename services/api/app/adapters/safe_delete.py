"""Deleting one record folder, and nothing beside it.

Every store in the app keeps a record as a folder named by its id under a root
it owns. An id comes from a URL, so it is checked to be one plain folder name
directly under that root before anything is removed: `..`, a separator or a
drive letter never reaches `rmtree`.
"""

from __future__ import annotations

import os
import re
import shutil
import stat
from pathlib import Path

_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,159}$")


def child_folder(root: Path, record_id: str) -> Path:
    """The record's folder under `root`; ValueError for anything that is not one."""
    if not _SAFE_ID.match(record_id) or record_id in {".", ".."}:
        raise ValueError(f"Mã không hợp lệ: {record_id!r}")
    folder = (root / record_id).resolve()
    if folder.parent != root.resolve():
        raise ValueError(f"Mã không hợp lệ: {record_id!r}")
    return folder


def remove_tree(folder: Path) -> int:
    """Remove a folder and return the bytes it held. Read-only files are removed too."""
    if not folder.exists():
        return 0
    size = folder_bytes(folder)

    def clear_readonly(function, path, _info):
        os.chmod(path, stat.S_IWRITE)
        function(path)

    shutil.rmtree(folder, onerror=clear_readonly)
    return size


def folder_bytes(folder: Path) -> int:
    total = 0
    for dirpath, _dirnames, filenames in os.walk(folder):
        for filename in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, filename))
            except OSError:
                continue
    return total
