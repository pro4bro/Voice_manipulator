from __future__ import annotations

import subprocess
import sys
import ctypes
from pathlib import Path

# Showing a file in the desktop file manager is the one thing a web page cannot
# do for itself, so the local API does it. Every path handed to the shell is
# resolved from a project or asset record first - nothing a caller sends is used
# as a path - which is what keeps this from being a way to run commands.


def _reveal_windows(target: Path) -> None:
    # Explorer's /select switch has its own command-line quoting rules. Pass
    # Shell item identity so Unicode, commas and spaces arrive unchanged.
    ole = ctypes.WinDLL("ole32")
    shell = ctypes.WinDLL("shell32")
    pointer = ctypes.c_void_p
    hresult = ctypes.c_long
    ole.CoInitializeEx.argtypes = [pointer, ctypes.c_ulong]
    ole.CoInitializeEx.restype = hresult
    ole.CoUninitialize.argtypes = []
    ole.CoUninitialize.restype = None
    ole.CoTaskMemFree.argtypes = [pointer]
    ole.CoTaskMemFree.restype = None
    shell.SHParseDisplayName.argtypes = [ctypes.c_wchar_p, pointer, ctypes.POINTER(pointer), ctypes.c_ulong, pointer]
    shell.SHParseDisplayName.restype = hresult
    shell.SHOpenFolderAndSelectItems.argtypes = [pointer, ctypes.c_uint, pointer, ctypes.c_ulong]
    shell.SHOpenFolderAndSelectItems.restype = hresult

    def check(result: int, operation: str) -> None:
        if result < 0:
            raise OSError(f"{operation} thất bại (0x{result & 0xffffffff:08X}): {target}")

    initialized = ole.CoInitializeEx(None, 2)  # COINIT_APARTMENTTHREADED
    # RPC_E_CHANGED_MODE means this request thread already has a COM apartment.
    if initialized != -2147417850:
        check(initialized, "CoInitializeEx")
    pidl = pointer()
    try:
        check(shell.SHParseDisplayName(str(target), None, ctypes.byref(pidl), 0, None), "SHParseDisplayName")
        check(shell.SHOpenFolderAndSelectItems(pidl, 0, None, 0), "SHOpenFolderAndSelectItems")
    finally:
        if pidl.value:
            ole.CoTaskMemFree(pidl)
        if initialized >= 0:
            ole.CoUninitialize()


def reveal(path: Path) -> None:
    """Open the file manager with `path` selected."""
    target = path.resolve()
    if not target.exists():
        raise FileNotFoundError(f"Không tìm thấy: {target}")
    if sys.platform == "win32":
        _reveal_windows(target)
        return
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(target)], check=False)
        return
    # Linux file managers vary; opening the containing folder is the portable part.
    folder = target if target.is_dir() else target.parent
    subprocess.run(["xdg-open", str(folder)], check=False)
