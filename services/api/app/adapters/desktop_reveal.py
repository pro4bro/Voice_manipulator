from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# Showing a file in the desktop file manager is the one thing a web page cannot
# do for itself, so the local API does it. Every path handed to the shell is
# resolved from a project or asset record first - nothing a caller sends is used
# as a path - which is what keeps this from being a way to run commands.


def reveal(path: Path) -> None:
    """Open the file manager with `path` selected."""
    target = path.resolve()
    if not target.exists():
        raise FileNotFoundError(f"Không tìm thấy: {target}")
    if sys.platform == "win32":
        # explorer.exe returns 1 even when it succeeds, so its code is ignored.
        subprocess.run(["explorer.exe", f"/select,{target}"], check=False)
        return
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(target)], check=False)
        return
    # Linux file managers vary; opening the containing folder is the portable part.
    folder = target if target.is_dir() else target.parent
    subprocess.run(["xdg-open", str(folder)], check=False)
