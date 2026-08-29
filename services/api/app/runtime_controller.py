from __future__ import annotations

import argparse
import socket
import subprocess
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask

from app.domain.models import DomainModel


PROJECT_ROOT = Path(__file__).resolve().parents[3]
WEB_DIST = PROJECT_ROOT / "apps" / "web" / "dist"
WORKLOAD_SCRIPT = PROJECT_ROOT / "scripts" / "pro4bro-workloads.ps1"
ACTION_LOG = PROJECT_ROOT / "data" / "logs" / "pro4bro-runtime-actions.log"
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


class RuntimeWorkloadState(DomainModel):
    overall: Literal["running", "stopped", "partial", "busy"]
    api: Literal["running", "stopped"]
    studio: Literal["running", "stopped"]
    busy: bool = False
    active_action: Literal["start", "stop", "restart"] | None = None
    last_action: Literal["start", "stop", "restart"] | None = None
    last_error: str | None = None
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

    @staticmethod
    def _port_open(port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return True
        except OSError:
            return False

    def status(self) -> RuntimeWorkloadState:
        api_running = self._port_open(18120)
        studio_running = self._port_open(18081)
        with self._lock:
            busy = self._busy
            if busy:
                overall = "busy"
            elif api_running and studio_running:
                overall = "running"
            elif not api_running and not studio_running:
                overall = "stopped"
            else:
                overall = "partial"
            return RuntimeWorkloadState(
                overall=overall,
                api="running" if api_running else "stopped",
                studio="running" if studio_running else "stopped",
                busy=busy,
                active_action=self._active_action,
                last_action=self._last_action,
                last_error=self._last_error,
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


lifecycle = RuntimeLifecycle(WORKLOAD_SCRIPT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.upstream = httpx.AsyncClient(timeout=None)
    yield
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


@app.get("/{full_path:path}", include_in_schema=False)
def frontend(full_path: str):
    candidate = (WEB_DIST / full_path).resolve()
    if WEB_DIST.resolve() in candidate.parents and candidate.is_file():
        return FileResponse(candidate)
    index = WEB_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse(
        {"detail": "Frontend build is missing. Run scripts/setup-pro4bro.ps1."},
        status_code=503,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18119)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
