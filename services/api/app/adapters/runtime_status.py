from __future__ import annotations

import ctypes
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from app.domain.models import SystemLog, SystemMetrics


_LOG_TIMESTAMP_RE = re.compile(r"^(?P<timestamp>\[?\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}|\[?\d{2}:\d{2}:\d{2})")


class _FileTime(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.c_uint32), ("dwHighDateTime", ctypes.c_uint32)]


class _MemoryStatus(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_uint32),
        ("dwMemoryLoad", ctypes.c_uint32),
        ("ullTotalPhys", ctypes.c_uint64),
        ("ullAvailPhys", ctypes.c_uint64),
        ("ullTotalPageFile", ctypes.c_uint64),
        ("ullAvailPageFile", ctypes.c_uint64),
        ("ullTotalVirtual", ctypes.c_uint64),
        ("ullAvailVirtual", ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
    ]


class _MibIfRow(ctypes.Structure):
    _fields_ = [
        ("wszName", ctypes.c_wchar * 256),
        ("dwIndex", ctypes.c_uint32),
        ("dwType", ctypes.c_uint32),
        ("dwMtu", ctypes.c_uint32),
        ("dwSpeed", ctypes.c_uint32),
        ("dwPhysAddrLen", ctypes.c_uint32),
        ("bPhysAddr", ctypes.c_ubyte * 8),
        ("dwAdminStatus", ctypes.c_uint32),
        ("dwOperStatus", ctypes.c_uint32),
        ("dwLastChange", ctypes.c_uint32),
        ("dwInOctets", ctypes.c_uint32),
        ("dwInUcastPkts", ctypes.c_uint32),
        ("dwInNUcastPkts", ctypes.c_uint32),
        ("dwInDiscards", ctypes.c_uint32),
        ("dwInErrors", ctypes.c_uint32),
        ("dwInUnknownProtos", ctypes.c_uint32),
        ("dwOutOctets", ctypes.c_uint32),
        ("dwOutUcastPkts", ctypes.c_uint32),
        ("dwOutNUcastPkts", ctypes.c_uint32),
        ("dwOutDiscards", ctypes.c_uint32),
        ("dwOutErrors", ctypes.c_uint32),
        ("dwOutQLen", ctypes.c_uint32),
        ("dwDescrLen", ctypes.c_uint32),
        ("bDescr", ctypes.c_ubyte * 256),
    ]


class RuntimeStatus:
    """Small local monitor for the workstation footer; it has no project data or side effects."""

    def __init__(self, data_root: Path) -> None:
        self.log_root = data_root / "logs"
        self._lock = threading.Lock()
        self._last_cpu: tuple[int, int] | None = None
        self._last_network: tuple[int, float] | None = None
        self._last_gpu: tuple[float, tuple[float | None, int | None, int | None]] | None = None

    def snapshot(self) -> SystemMetrics:
        with self._lock:
            cpu_percent = self._cpu_percent()
            memory_used_mb, memory_total_mb, memory_percent = self._memory()
            network_mbps = self._network_mbps()
            gpu_percent, gpu_used, gpu_total = self._gpu()
            return SystemMetrics(
                cpu_percent=cpu_percent,
                gpu_percent=gpu_percent,
                gpu_memory_used_mb=gpu_used,
                gpu_memory_total_mb=gpu_total,
                memory_percent=memory_percent,
                memory_used_mb=memory_used_mb,
                memory_total_mb=memory_total_mb,
                network_mbps=network_mbps,
                sampled_at=datetime.now(timezone.utc),
            )

    def logs(self, lines: int = 240) -> SystemLog:
        self.log_root.mkdir(parents=True, exist_ok=True)
        files = sorted(self.log_root.glob("*.log"), key=lambda item: item.stat().st_mtime, reverse=True)
        chunks: list[str] = []
        for path in files[:4]:
            try:
                content = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            fallback_timestamp = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            last_timestamp = fallback_timestamp
            formatted = []
            for line in content[-lines:]:
                match = _LOG_TIMESTAMP_RE.match(line)
                if match:
                    last_timestamp = match.group("timestamp").strip("[]")
                    formatted.append(line)
                elif line.strip():
                    formatted.append(f"[{last_timestamp}] {line}")
                else:
                    formatted.append(line)
            chunks.append(f"--- {path.name} ---\n" + "\n".join(formatted))
        return SystemLog(files=[path.name for path in files], text="\n\n".join(chunks) or "Chưa có file log runtime.")

    def _cpu_percent(self) -> float:
        idle = _FileTime()
        kernel = _FileTime()
        user = _FileTime()
        if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
            return 0.0
        to_int = lambda value: (value.dwHighDateTime << 32) | value.dwLowDateTime
        idle_time = to_int(idle)
        total_time = to_int(kernel) + to_int(user)
        previous = self._last_cpu
        self._last_cpu = (idle_time, total_time)
        if previous is None or total_time <= previous[1]:
            return 0.0
        return round(max(0.0, min(100.0, 100.0 * (1.0 - ((idle_time - previous[0]) / (total_time - previous[1]))))), 1)

    def _memory(self) -> tuple[int, int, float]:
        status = _MemoryStatus()
        status.dwLength = ctypes.sizeof(_MemoryStatus)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return 0, 0, 0.0
        total = int(status.ullTotalPhys / 1024 / 1024)
        used = max(0, total - int(status.ullAvailPhys / 1024 / 1024))
        return used, total, round(float(status.dwMemoryLoad), 1)

    def _network_mbps(self) -> float:
        size = ctypes.c_uint32(0)
        iphlpapi = ctypes.windll.iphlpapi
        if iphlpapi.GetIfTable(None, ctypes.byref(size), True) not in (0, 122) or not size.value:
            return 0.0
        buffer = (ctypes.c_ubyte * size.value)()
        if iphlpapi.GetIfTable(ctypes.byref(buffer), ctypes.byref(size), True) != 0:
            return 0.0
        count = ctypes.c_uint32.from_buffer(buffer).value
        total_bytes = 0
        row_size = ctypes.sizeof(_MibIfRow)
        for index in range(count):
            offset = ctypes.sizeof(ctypes.c_uint32) + index * row_size
            if offset + row_size > size.value:
                break
            row = _MibIfRow.from_buffer(buffer, offset)
            total_bytes += int(row.dwInOctets) + int(row.dwOutOctets)
        now = time.monotonic()
        previous = self._last_network
        self._last_network = (total_bytes, now)
        if previous is None or now <= previous[1]:
            return 0.0
        delta = total_bytes - previous[0]
        if delta < 0:
            delta += 2**32
        return round(max(0.0, delta * 8 / (now - previous[1]) / 1_000_000), 2)

    def _gpu(self) -> tuple[float | None, int | None, int | None]:
        now = time.monotonic()
        if self._last_gpu and now - self._last_gpu[0] < 1.5:
            return self._last_gpu[1]
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True,
                check=False,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=1.5,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            values = [part.strip() for part in result.stdout.splitlines()[0].split(",")]
            snapshot = (float(values[0]), int(float(values[1])), int(float(values[2]))) if result.returncode == 0 and len(values) == 3 else (None, None, None)
        except (FileNotFoundError, IndexError, OSError, ValueError, subprocess.TimeoutExpired):
            snapshot = (None, None, None)
        self._last_gpu = (now, snapshot)
        return snapshot
