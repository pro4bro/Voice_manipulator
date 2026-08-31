from __future__ import annotations

import ctypes
import socket
from ctypes import wintypes

# Who is listening matters as much as whether anyone is. A port check alone
# reported "running" for any process that happened to hold the port, so the UI
# could show every system healthy while nothing of ours was up.

AF_INET = 2
TCP_TABLE_OWNER_PID_LISTENER = 3
NO_ERROR = 0
ERROR_INSUFFICIENT_BUFFER = 122


class _TcpRowOwnerPid(ctypes.Structure):
    _fields_ = [
        ("dwState", wintypes.DWORD),
        ("dwLocalAddr", wintypes.DWORD),
        ("dwLocalPort", wintypes.DWORD),
        ("dwRemoteAddr", wintypes.DWORD),
        ("dwRemotePort", wintypes.DWORD),
        ("dwOwningPid", wintypes.DWORD),
    ]


def listening_owners() -> dict[int, int]:
    """Map each listening TCP port to the pid holding it.

    Uses GetExtendedTcpTable rather than shelling out: the controller answers a
    status poll every few seconds, and spawning PowerShell to read the same table
    costs about a second each time.
    """
    try:
        iphlpapi = ctypes.WinDLL("iphlpapi.dll")
    except (OSError, AttributeError):
        return {}

    size = wintypes.DWORD(0)
    result = iphlpapi.GetExtendedTcpTable(
        None, ctypes.byref(size), False, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0
    )
    if result not in (NO_ERROR, ERROR_INSUFFICIENT_BUFFER) or not size.value:
        return {}

    buffer = ctypes.create_string_buffer(size.value)
    if iphlpapi.GetExtendedTcpTable(
        buffer, ctypes.byref(size), False, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0
    ) != NO_ERROR:
        return {}

    count = ctypes.cast(buffer, ctypes.POINTER(wintypes.DWORD)).contents.value
    rows = ctypes.cast(
        ctypes.byref(buffer, ctypes.sizeof(wintypes.DWORD)),
        ctypes.POINTER(_TcpRowOwnerPid * count),
    ).contents
    owners: dict[int, int] = {}
    for row in rows:
        # dwLocalPort is stored in network byte order in the low half-word.
        port = socket.ntohs(row.dwLocalPort & 0xFFFF)
        owners.setdefault(port, int(row.dwOwningPid))
    return owners


def port_owner(port: int) -> int | None:
    return listening_owners().get(port)


class _ProcessEntry32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
        ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", wintypes.DWORD),
        ("szExeFile", ctypes.c_char * 260),
    ]


def parent_pids() -> dict[int, int]:
    """Snapshot every process's parent, so a service can be recognised by descent."""
    TH32CS_SNAPPROCESS = 0x00000002
    INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
    try:
        kernel32 = ctypes.WinDLL("kernel32.dll")
    except (OSError, AttributeError):
        return {}
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snapshot in (0, INVALID_HANDLE_VALUE, None):
        return {}
    parents: dict[int, int] = {}
    try:
        entry = _ProcessEntry32()
        entry.dwSize = ctypes.sizeof(_ProcessEntry32)
        if not kernel32.Process32First(snapshot, ctypes.byref(entry)):
            return {}
        while True:
            parents[int(entry.th32ProcessID)] = int(entry.th32ParentProcessID)
            if not kernel32.Process32Next(snapshot, ctypes.byref(entry)):
                break
    finally:
        kernel32.CloseHandle(snapshot)
    return parents


def descends_from(pid: int | None, ancestor: int | None, parents: dict[int, int]) -> bool:
    """True when `pid` is `ancestor` or was started, directly or not, by it.

    A venv `python.exe` on Windows re-executes the base interpreter, so the
    process holding a port is a child of the one the launcher recorded. Comparing
    pids directly would call every healthy service foreign.
    """
    if not pid or not ancestor:
        return False
    seen: set[int] = set()
    current = int(pid)
    while current and current not in seen:
        if current == int(ancestor):
            return True
        seen.add(current)
        current = parents.get(current, 0)
    return False


def process_is_alive(pid: int | None) -> bool:
    if not pid or pid <= 0:
        return False
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    STILL_ACTIVE = 259
    try:
        kernel32 = ctypes.WinDLL("kernel32.dll")
    except (OSError, AttributeError):
        return False
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if not handle:
        return False
    try:
        code = wintypes.DWORD()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            return False
        return code.value == STILL_ACTIVE
    finally:
        kernel32.CloseHandle(handle)
