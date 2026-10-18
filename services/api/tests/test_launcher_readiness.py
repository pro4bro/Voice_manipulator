"""Exercise the PowerShell launch boundary with real HTTP and process state."""
import json
import os
import re
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
pytestmark = pytest.mark.skipif(os.name != "nt", reason="Windows launcher")


@contextmanager
def health_server(payloads):
    class Handler(BaseHTTPRequestHandler):
        calls = 0

        def do_GET(self):
            payload = payloads[min(self.calls, len(payloads) - 1)]
            type(self).calls += 1
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/api/health", Handler
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def ps_string(value):
    return "'" + str(value).replace("'", "''") + "'"


def run_probe(tmp_path, uri, process_setup="$process = Get-Process -Id $PID", timeout=2):
    script = tmp_path / "probe.ps1"
    evidence = tmp_path / "readiness.log"
    script.write_text(
        "$ErrorActionPreference = 'Stop'\n"
        f". {ps_string(ROOT / 'scripts/pro4bro-process-tree.ps1')}\n"
        f". {ps_string(ROOT / 'scripts/pro4bro-readiness.ps1')}\n"
        f"{process_setup}\n"
        "try {\n"
        f"Wait-Pro4BroReady 'Fixture' $process {ps_string(uri)} {timeout} {ps_string(evidence)} 50\n"
        "Write-Output 'READY'\n"
        "} catch { Write-Output $_.Exception.Message; exit 1 }\n",
        encoding="utf-8-sig",
    )
    started = time.monotonic()
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        capture_output=True, text=True, timeout=15,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return result, evidence.read_text(encoding="utf-8-sig") if evidence.exists() else "", time.monotonic() - started


def test_readiness_retries_invalid_health_then_records_ready(tmp_path):
    with health_server([{"status": "starting"}, {"status": "ok"}]) as (uri, handler):
        result, evidence, _elapsed = run_probe(tmp_path, uri, timeout=6)
    assert result.returncode == 0, result.stdout + result.stderr
    assert handler.calls >= 2
    assert "state=waiting" in evidence and "state=ready" in evidence
    assert "alive=True" in evidence and "probe=ok" in evidence


def test_readiness_reports_exited_process_instead_of_waiting_for_deadline(tmp_path):
    exit_script = tmp_path / "exit.py"
    exit_script.write_text("raise SystemExit(7)")
    setup = (f"$process = Start-Process {ps_string(sys.executable)} -ArgumentList "
             f"{ps_string(chr(34) + str(exit_script) + chr(34))} -WindowStyle Hidden -PassThru\n"
             "$process.WaitForExit()")
    with health_server([{"status": "ok"}]) as (uri, handler):
        result, evidence, _elapsed = run_probe(tmp_path, uri, setup)
    assert result.returncode == 1
    assert "exited before readiness" in result.stdout
    assert "exit=7" in evidence and "state=exited" in evidence
    assert handler.calls == 0


def test_readiness_deadline_retains_live_process_and_listener_evidence(tmp_path):
    with health_server([{"status": "starting"}]) as (uri, _handler):
        result, evidence, elapsed = run_probe(tmp_path, uri)
    assert result.returncode == 1
    assert "still alive" in result.stdout
    assert "state=timeout" in evidence and "probe=invalid-health" in evidence
    assert "listener=-" not in evidence
    assert elapsed < 8, f"A two-second budget took {elapsed:.3f}s"


def test_readiness_probes_health_when_listener_diagnostics_use_the_initial_budget(tmp_path):
    setup = ("$process = Get-Process -Id $PID\n"
             "function Get-Pro4BroListener([int]$Port) { "
             "Start-Sleep -Milliseconds 1100; [pscustomobject]@{ OwningProcess = $PID } }")
    with health_server([{"status": "starting"}]) as (uri, handler):
        result, evidence, _elapsed = run_probe(tmp_path, uri, setup, timeout=1)
    assert result.returncode == 1
    assert handler.calls >= 1
    assert "state=timeout" in evidence and "probe=invalid-health" in evidence


def test_startup_log_archive_preserves_existing_output_across_retries(tmp_path):
    log_root = tmp_path / "logs with spaces 日本語"
    log_root.mkdir()
    stdout = log_root / "pro4bro-api.out.log"
    stderr = log_root / "pro4bro-api.err.log"
    stdout.write_text("first attempt stdout", encoding="utf-8")
    stderr.write_text("first attempt stderr", encoding="utf-8")
    script = tmp_path / "archive logs.ps1"
    script.write_text(
        "$ErrorActionPreference = 'Stop'\n"
        f". {ps_string(ROOT / 'scripts/pro4bro-readiness.ps1')}\n"
        f"Preserve-Pro4BroStartupLogs @({ps_string(stdout)}, {ps_string(stderr)})\n"
        "Write-Output 'ARCHIVED'\n",
        encoding="utf-8-sig",
    )
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        capture_output=True, text=True, timeout=15,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert result.returncode == 0, result.stdout + result.stderr
    history = log_root / "startup-history"
    archives = sorted(history.glob("*"))
    assert len(archives) == 2
    assert all(re.search(r"\.\d{8}T\d{6}\.\d{7}Z\.[0-9a-f]{32}\.log$", path.name)
               for path in archives)
    assert {path.read_text(encoding="utf-8") for path in archives} == {
        "first attempt stdout", "first attempt stderr",
    }
    assert "ARCHIVED" in result.stdout
    assert stdout.read_text(encoding="utf-8") == "first attempt stdout"
    assert stderr.read_text(encoding="utf-8") == "first attempt stderr"

    script.write_text(
        "$ErrorActionPreference = 'Stop'\n"
        f". {ps_string(ROOT / 'scripts/pro4bro-readiness.ps1')}\n"
        f"Preserve-Pro4BroStartupLogs @({ps_string(stdout)}, {ps_string(stderr)})\n",
        encoding="utf-8-sig",
    )
    retry = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        capture_output=True, text=True, timeout=15,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert retry.returncode == 0, retry.stdout + retry.stderr
    retry_archives = sorted(history.glob("*"))
    assert len(retry_archives) == 4
    assert len({path.name for path in retry_archives}) == 4


def test_startup_log_archive_ignores_missing_empty_and_never_throws(tmp_path):
    log_root = tmp_path / "log root"
    log_root.mkdir()
    empty_log = log_root / "empty.log"
    empty_log.write_bytes(b"")
    missing_log = log_root / "missing.log"
    script = tmp_path / "archive failure.ps1"
    failure_root = tmp_path / "archive failure root"
    failure_root.mkdir()
    blocked_history = failure_root / "startup-history"
    blocked_history.write_text("not a directory", encoding="utf-8")
    script.write_text(
        "$ErrorActionPreference = 'Stop'\n"
        f". {ps_string(ROOT / 'scripts/pro4bro-readiness.ps1')}\n"
        f"Preserve-Pro4BroStartupLogs @({ps_string(missing_log)}, {ps_string(empty_log)})\n"
        f"Preserve-Pro4BroStartupLogs @({ps_string(blocked_history)})\n"
        "Write-Output 'LAUNCH MAY CONTINUE'\n",
        encoding="utf-8-sig",
    )
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        capture_output=True, text=True, timeout=15,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "LAUNCH MAY CONTINUE" in result.stdout
    assert not (log_root / "startup-history").exists()
    assert not (failure_root / "startup-history").is_dir()
