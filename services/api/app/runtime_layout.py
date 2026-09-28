from __future__ import annotations

import os
from pathlib import Path


def python_executable(root: Path) -> Path:
    """Return the private runtime interpreter, with legacy venv compatibility."""
    if os.name == "nt":
        portable = root / "python.exe"
        return portable if portable.is_file() else root / "Scripts" / "python.exe"
    portable = root / "bin" / "python"
    return portable if portable.is_file() else root / "python"


def site_packages(root: Path) -> Path | None:
    """Locate vendored packages in a private runtime or a legacy venv."""
    candidates = [root / "site-packages"]
    if os.name == "nt":
        candidates.append(root / "Lib" / "site-packages")
    else:
        candidates.extend(sorted((root / "lib").glob("python*/site-packages")))
    return next((path for path in candidates if path.is_dir()), None)
