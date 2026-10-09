from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import subprocess
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from app.adapters.startup_diagnostics import StartupDiagnostics


# Arm before HTTP/FastAPI/Pydantic imports: a pre-bind stall otherwise has no
# Uvicorn log or observer yet. Keep the existing launcher/module identity.
_boot_started = time.monotonic()
_startup_watch: StartupDiagnostics | None = None
if __name__ == "__main__":
    controller_logger = logging.getLogger("uvicorn")
    controller_logger.setLevel(logging.INFO)
    controller_logger.propagate = False
    boot_handler = logging.StreamHandler()
    boot_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s: %(message)s"))
    controller_logger.addHandler(boot_handler)
    _startup_watch = StartupDiagnostics(logging.getLogger("uvicorn.error"))
    _startup_watch.__enter__()
    controller_logger.info("Controller boot pid=%s phase=imports", os.getpid())

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask

from app.adapters.listening_ports import descends_from, listening_owners, parent_pids, process_is_alive
from app.domain.models import DomainModel


PROJECT_ROOT = Path(__file__).resolve().parents[3]
WEB_DIST = PROJECT_ROOT / "apps" / "web" / "dist"
WORKLOAD_SCRIPT = PROJECT_ROOT / "scripts" / "pro4bro-workloads.ps1"
ACTION_LOG = PROJECT_ROOT / "data" / "logs" / "pro4bro-runtime-actions.log"
SESSION_FILE = PROJECT_ROOT / "data" / "runtime" / "pro4bro-services.json"
API_ORIGIN = "http://127.0.0.1:18120"
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


class RuntimeActionRequest(BaseModel):
    action: Literal["start", "stop", "restart"]


ServiceState = Literal["running", "stopped", "foreign"]


class RuntimeProcess(DomainModel):
    """One managed listener, and whether the process holding its port is ours."""

    role: Literal["controller", "api", "studio"]
    label: str
    port: int
    state: ServiceState
    pid: int | None = None


class RuntimeWorkloadState(DomainModel):
    overall: Literal["running", "stopped", "partial", "busy", "blocked"]
    api: ServiceState
    studio: ServiceState
    busy: bool = False
    active_action: Literal["start", "stop", "restart"] | None = None
    last_action: Literal["start", "stop", "restart"] | None = None
    last_error: str | None = None
    processes: list[RuntimeProcess] = []
    updated_at: datetime


class RuntimeLifecycle:
    """Deep module that hides safe local workload lifecycle orchestration."""

    def __init__(self, script: Path) -> None:
        self.script = script
        self._lock = threading.RLock()
        self._busy = False
        self._active_action: Literal["start", "stop", "restart"] | None = None
        self._last_action: Literal["start", "stop", "restart"] | None = None
        self._last_error: str | None = None

    SERVICES = (
        ("controller", "Runtime controller", 18119, None),
        ("api", "Pro4Bro API", 18120, "apiPid"),
        ("studio", "OmniVoice Studio", 18081, "studioPid"),
    )

    @staticmethod
    def _session() -> dict:
        """The pids the launcher recorded when it started the workloads."""
        try:
            return json.loads(SESSION_FILE.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError, TypeError):
            return {}

    def inventory(self) -> list[RuntimeProcess]:
        """Report who actually holds each port, not merely whether it is held.

        A plain connect test called any listener "running", so a stray process on
        18120 left the workspace reporting every system healthy while nothing of
        ours was answering. A service counts as ours when the process owning its
        port descends from the pid the launcher recorded - or, for the controller,
        when it is this process.
        """
        owners = listening_owners()
        session = self._session()
        parents: dict[int, int] | None = None
        processes: list[RuntimeProcess] = []
        for role, label, port, key in self.SERVICES:
            owner = owners.get(port)
            if owner is None:
                state: ServiceState = "stopped"
            elif role == "controller":
                if parents is None:
                    parents = parent_pids()
                own = os.getpid()
                state = "running" if (owner == own or descends_from(own, owner, parents)) else "foreign"
            else:
                expected = session.get(key) if key else None
                if parents is None:
                    parents = parent_pids()
                state = "running" if descends_from(owner, expected, parents) else "foreign"
            processes.append(
                RuntimeProcess(role=role, label=label, port=port, state=state, pid=owner)
            )
        return processes

    def status(self) -> RuntimeWorkloadState:
        processes = self.inventory()
        by_role = {process.role: process.state for process in processes}
        api = by_role.get("api", "stopped")
        studio = by_role.get("studio", "stopped")
        with self._lock:
            busy = self._busy
            if busy:
                overall = "busy"
            elif "foreign" in (api, studio) or by_role.get("controller") == "foreign":
                overall = "blocked"
            elif api == "running" and studio == "running":
                overall = "running"
            elif api == "stopped" and studio == "stopped":
                overall = "stopped"
            else:
                overall = "partial"
            return RuntimeWorkloadState(
                overall=overall,
                api=api,
                studio=studio,
                busy=busy,
                active_action=self._active_action,
                last_action=self._last_action,
                last_error=self._last_error,
                processes=processes,
                updated_at=datetime.now(timezone.utc),
            )

    def request(self, action: Literal["start", "stop", "restart"]) -> RuntimeWorkloadState:
        with self._lock:
            if self._busy:
                raise RuntimeError(f"Runtime is already handling {self._active_action}.")
            self._busy = True
            self._active_action = action
            self._last_error = None
        threading.Thread(target=self._run, args=(action,), daemon=True).start()
        return self.status()

    def _run(self, action: Literal["start", "stop", "restart"]) -> None:
        error: str | None = None
        try:
            ACTION_LOG.parent.mkdir(parents=True, exist_ok=True)
            with ACTION_LOG.open("a", encoding="utf-8") as action_log:
                action_log.write(f"\n[{datetime.now(timezone.utc).isoformat()}] {action}\n")
                action_log.flush()
                result = subprocess.run(
                    [
                        "powershell.exe",
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-File",
                        str(self.script),
                        "-Action",
                        action,
                    ],
                    cwd=PROJECT_ROOT,
                    stdout=action_log,
                    stderr=subprocess.STDOUT,
                    check=False,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            if result.returncode != 0:
                error = f"Runtime command failed ({result.returncode}). See {ACTION_LOG.name}."
        except OSError as exc:
            error = str(exc)
        with self._lock:
            self._busy = False
            self._active_action = None
            self._last_action = action
            self._last_error = error
        self._record_inventory(action, error)

    def _record_inventory(self, action: str, error: str | None) -> None:
        """Write who is listening after an action, so the log answers "is it up?".

        The script's own summary named only the listener pid for two of the three
        services. Reading the log later, there was no way to tell a healthy stack
        from one where something else had taken a port.
        """
        try:
            with ACTION_LOG.open("a", encoding="utf-8") as action_log:
                action_log.write(f"[{datetime.now(timezone.utc).isoformat()}] {action} finished\n")
                for process in self.inventory():
                    action_log.write(
                        f"    {process.label:<20} port {process.port}  "
                        f"{process.state:<8} pid {process.pid if process.pid else '-'}\n"
                    )
                if error:
                    action_log.write(f"    error: {error}\n")
        except OSError:
            # The log is a convenience; never fail an action because it cannot be written.
            pass

    def diagnostic_snapshot(self, client: httpx.Client) -> list[dict]:
        """Keep process life, listener ownership and HTTP readiness distinct.

        The UI's existing `state` contract describes port ownership. These
        machine-local observations retain why a service stops answering without
        turning a CUDA status query into a health probe or probing foreign ports.
        """
        session = self._session()
        records = []
        for process in self.inventory():
            expected = os.getpid() if process.role == "controller" else session.get(f"{process.role}Pid")
            health = "no-listener" if process.pid is None else process.state
            if process.state == "running":
                if process.role == "controller":
                    health = "ok"
                else:
                    try:
                        response = client.get(f"http://127.0.0.1:{process.port}/api/health")
                        if response.status_code != 200:
                            health = f"http-{response.status_code}"
                        else:
                            health = "ok" if response.json().get("status") == "ok" else "invalid-health"
                    except (ValueError, AttributeError):
                        health = "invalid-health"
                    except httpx.HTTPError as exc:
                        health = type(exc).__name__
            records.append({
                "role": process.role, "port": process.port, "state": process.state,
                "listenerPid": process.pid, "expectedPid": expected,
                "processAlive": process_is_alive(expected), "health": health,
            })
        return records

    def observe(self, stop: threading.Event) -> None:
        """Log changes outside lifecycle actions, including unexpected loss."""
        previous = None
        # These probes target fixed HTTP loopback URLs, never HTTPS.
        with httpx.Client(timeout=0.75, trust_env=False, verify=False) as client:
            while not stop.is_set():
                snapshot = self.diagnostic_snapshot(client)
                if snapshot != previous:
                    try:
                        ACTION_LOG.parent.mkdir(parents=True, exist_ok=True)
                        with ACTION_LOG.open("a", encoding="utf-8") as log:
                            log.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(),
                                                  "event": "runtime-observation", "services": snapshot}) + "\n")
                    except OSError:
                        pass
                    previous = snapshot
                stop.wait(2)


lifecycle = RuntimeLifecycle(WORKLOAD_SCRIPT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The upstream is fixed HTTP loopback. System CA loading and proxy discovery
    # must not hold startup or reroute local requests through an external proxy.
    app.state.upstream = httpx.AsyncClient(timeout=None, trust_env=False, verify=False)
    stop = threading.Event()
    observer = threading.Thread(target=lifecycle.observe, args=(stop,), daemon=True)
    observer.start()
    try:
        yield
    finally:
        stop.set()
        await asyncio.to_thread(observer.join, 3)
        await app.state.upstream.aclose()


app = FastAPI(title="Pro4Bro Runtime Controller", version="1.0", lifespan=lifespan)


@app.get("/api/runtime/health")
def controller_health() -> dict[str, str]:
    return {"status": "ok", "controller": "running"}


@app.get("/api/runtime/status", response_model=RuntimeWorkloadState)
def runtime_status() -> RuntimeWorkloadState:
    return lifecycle.status()


@app.post("/api/runtime/actions", response_model=RuntimeWorkloadState, status_code=202)
def runtime_action(payload: RuntimeActionRequest) -> RuntimeWorkloadState:
    try:
        return lifecycle.request(payload.action)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.api_route(
    "/api/{api_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
async def proxy_api(api_path: str, request: Request):
    upstream_url = httpx.URL(f"{API_ORIGIN}/api/{api_path}").copy_with(
        query=request.url.query.encode("utf-8")
    )
    request_headers = {
        name: value
        for name, value in request.headers.items()
        if name.lower() not in HOP_BY_HOP_HEADERS and name.lower() != "host"
    }

    async def request_body():
        async for chunk in request.stream():
            yield chunk

    upstream_request = request.app.state.upstream.build_request(
        request.method,
        upstream_url,
        headers=request_headers,
        content=request_body(),
    )
    try:
        upstream_response = await request.app.state.upstream.send(
            upstream_request, stream=True
        )
    except httpx.RequestError:
        return JSONResponse(
            {"detail": "Pro4Bro workloads are stopped. Use Windows → Turn on all."},
            status_code=503,
        )
    response_headers = {
        name: value
        for name, value in upstream_response.headers.items()
        if name.lower() not in HOP_BY_HOP_HEADERS
    }
    return StreamingResponse(
        upstream_response.aiter_raw(),
        status_code=upstream_response.status_code,
        headers=response_headers,
        background=BackgroundTask(upstream_response.aclose),
    )


if WEB_DIST.is_dir() and (WEB_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

# Vite fingerprints everything under /assets, so those stay cacheable forever.
# index.html is the only file whose name is stable across builds; caching it is
# what makes a rebuilt bundle keep serving the previous application.
NO_STORE = {"cache-control": "no-store, must-revalidate", "pragma": "no-cache"}


@app.get("/{full_path:path}", include_in_schema=False)
def frontend(full_path: str):
    candidate = (WEB_DIST / full_path).resolve()
    if WEB_DIST.resolve() in candidate.parents and candidate.is_file():
        headers = None if candidate.name != "index.html" else NO_STORE
        return FileResponse(candidate, headers=headers)
    index = WEB_DIST / "index.html"
    if index.is_file():
        return FileResponse(index, headers=NO_STORE)
    return JSONResponse(
        {"detail": "Frontend build is missing. Run scripts/setup-pro4bro.ps1."},
        status_code=503,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18119)
    args = parser.parse_args()
    if _startup_watch is not None:
        logging.getLogger("uvicorn.error").info("Controller imports complete pid=%s elapsedSeconds=%.3f",
                                               os.getpid(), time.monotonic() - _boot_started)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info",
                log_config=None if _startup_watch is not None else uvicorn.config.LOGGING_CONFIG)


if __name__ == "__main__":
    try:
        main()
    finally:
        if _startup_watch is not None:
            _startup_watch.__exit__(None, None, None)
