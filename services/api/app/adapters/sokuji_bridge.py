"""Bounded local RPC bridge to the Sokuji sidecar.

This bridge exposes only inspection operations. It does not download models,
start inference sessions, or claim a live translation workflow.
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query


class SokujiBridgeError(RuntimeError):
    """The local Sokuji runtime could not be started or queried safely."""


class SokujiRuntimeUnavailable(SokujiBridgeError):
    """The source or isolated runtime prerequisites are not ready."""


class SokujiBridge:
    _EXPECTED_TYPES = {
        "ping": "pong",
        "hardware_info": "hardware_info_result",
        "models_catalog": "models_catalog_result",
        "list_tts_voices": "list_tts_voices_result",
    }

    def __init__(
        self,
        repo: Path,
        runtime: Path,
        *,
        startup_timeout: float = 20.0,
        request_timeout: float = 15.0,
        stop_timeout: float = 3.0,
    ) -> None:
        self.repo = Path(repo).resolve()
        self.runtime = Path(runtime).resolve()
        self.startup_timeout = startup_timeout
        self.request_timeout = request_timeout
        self.stop_timeout = stop_timeout
        self._process: subprocess.Popen[str] | None = None
        self._port: int | None = None
        self._stderr: deque[str] = deque(maxlen=40)
        self._lock = threading.RLock()
        self._stdout_queue: queue.Queue[str | None] | None = None
        self._readiness_checked = False
        self._readiness_reason: str | None = None

    @property
    def sidecar(self) -> Path:
        return self.repo / "sidecar"

    @property
    def python(self) -> Path:
        windows = self.runtime / ".venv" / "Scripts" / "python.exe"
        return windows if windows.is_file() else self.runtime / ".venv" / "bin" / "python"

    @property
    def running(self) -> bool:
        process = self._process
        return process is not None and process.poll() is None and self._port is not None

    def status(self) -> dict[str, Any]:
        reason = self._readiness_reason if self._readiness_checked else self._quick_unavailable_reason()
        running = self.running
        return {"installed": reason is None, "running": running, "reason": reason,
                "port": self._port if running else None}

    def _quick_unavailable_reason(self) -> str | None:
        if not (self.sidecar / "sokuji_sidecar" / "__main__.py").is_file():
            return "Sokuji sidecar source is missing."
        if not self.python.is_file():
            return "Sokuji runtime is not installed."
        if not (self.sidecar / "sokuji_sidecar" / "wire_schema.json").is_file():
            return "Sokuji sidecar wire schema is missing."
        return None

    def unavailable_reason(self) -> str | None:
        reason = self._quick_unavailable_reason()
        if reason:
            self._readiness_checked = True
            self._readiness_reason = reason
            return reason
        env = os.environ.copy()
        env["PYTHONPATH"] = str(self.sidecar)
        try:
            result = subprocess.run(
                [str(self.python), "-c", "import sokuji_native, websockets, sokuji_sidecar"],
                cwd=self.sidecar,
                env=env,
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except subprocess.TimeoutExpired:
            reason = "Runtime Sokuji chưa phản hồi sau 10 giây. Thử lại khi máy có đủ tài nguyên."
            self._readiness_checked = True
            self._readiness_reason = reason
            return reason
        except OSError:
            reason = "Không khởi động được Python Sokuji; kiểm tra lại runtime đã cài."
            self._readiness_checked = True
            self._readiness_reason = reason
            return reason
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()
            reason = "Sokuji runtime is missing a required package" + (f": {detail[-1]}" if detail else ".")
            self._readiness_checked = True
            self._readiness_reason = reason
            return reason
        self._readiness_checked = True
        self._readiness_reason = None
        return self._readiness_reason

    async def start(self) -> dict[str, Any]:
        reason = await asyncio.to_thread(self.unavailable_reason)
        if reason:
            raise SokujiRuntimeUnavailable(reason)
        await asyncio.to_thread(self._start_sync)
        try:
            health = await self.health()
        except SokujiBridgeError:
            self.stop()
            raise
        return {**self.status(), "health": health}

    def _start_sync(self) -> None:
        with self._lock:
            if self.running:
                return
            if self._process is not None:
                self._stop_sync()

            env = os.environ.copy()
            env["PYTHONPATH"] = str(self.sidecar)
            stdout_queue: queue.Queue[str | None] = queue.Queue()
            self._stdout_queue = stdout_queue
            kwargs: dict[str, Any] = {}
            if os.name == "nt":
                kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            process = subprocess.Popen(
                [str(self.python), "-m", "sokuji_sidecar"],
                cwd=self.sidecar,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                **kwargs,
            )
            self._process = process
            threading.Thread(target=self._read_stdout, args=(process, stdout_queue), daemon=True).start()
            threading.Thread(target=self._read_stderr, args=(process,), daemon=True).start()

            deadline = time.monotonic() + self.startup_timeout
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self._stop_sync()
                    raise SokujiBridgeError(f"Sokuji sidecar handshake timed out after {self.startup_timeout:g}s.")
                try:
                    line = stdout_queue.get(timeout=min(0.1, remaining))
                except queue.Empty:
                    if process.poll() is not None:
                        detail = self._stderr_detail()
                        self._stop_sync()
                        raise SokujiBridgeError("Sokuji sidecar exited before handshake" + detail)
                    continue
                if line is None:
                    detail = self._stderr_detail()
                    self._stop_sync()
                    raise SokujiBridgeError("Sokuji sidecar closed stdout before handshake" + detail)
                try:
                    message = json.loads(line)
                    port = int(message["port"])
                except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
                    self._stop_sync()
                    raise SokujiBridgeError(f"Invalid Sokuji sidecar handshake: {line.strip()!r}") from exc
                if not 1 <= port <= 65535:
                    self._stop_sync()
                    raise SokujiBridgeError(f"Invalid Sokuji sidecar port: {port}")
                self._port = port
                return

    @staticmethod
    def _read_stdout(process: subprocess.Popen[str], output: queue.Queue[str | None]) -> None:
        assert process.stdout is not None
        try:
            for line in process.stdout:
                output.put(line)
        finally:
            output.put(None)

    def _read_stderr(self, process: subprocess.Popen[str]) -> None:
        assert process.stderr is not None
        for line in process.stderr:
            self._stderr.append(line.rstrip())

    def _stderr_detail(self) -> str:
        lines = list(self._stderr)[-8:]
        return ": " + " | ".join(lines) if lines else "."

    def stop(self) -> None:
        with self._lock:
            self._stop_sync()

    def _stop_sync(self) -> None:
        process, self._process = self._process, None
        self._port = None
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=self.stop_timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=self.stop_timeout)

    async def health(self) -> dict[str, Any]:
        reply = await self._rpc("ping", "pong")
        return {"ok": True, "type": reply["type"], "running": self.running}

    async def hardware_info(self) -> dict[str, Any]:
        return await self._rpc("hardware_info", "hardware_info_result")

    async def catalog(self, kind: str) -> dict[str, Any]:
        if kind not in {"asr", "translate", "tts"}:
            raise ValueError("Sokuji catalog kind must be one of: asr, translate, tts.")
        return await self._rpc("models_catalog", "models_catalog_result", kind=kind)

    async def list_tts_voices(self, model: str | None = None) -> dict[str, Any]:
        message: dict[str, Any] = {}
        if model:
            message["model"] = model
        return await self._rpc("list_tts_voices", "list_tts_voices_result", **message)

    async def _rpc(self, message_type: str, expected_type: str, **fields: Any) -> dict[str, Any]:
        if self._port is None or not self.running:
            raise SokujiBridgeError("Sokuji sidecar is not running; start it explicitly first.")
        if self._EXPECTED_TYPES.get(message_type) != expected_type:
            raise SokujiBridgeError("Unsupported Sokuji bridge operation.")
        try:
            import websockets
        except ImportError as exc:
            raise SokujiBridgeError("The API Python environment is missing the websockets client.") from exc

        request_id = uuid4().hex
        request = {"type": message_type, "id": request_id, **fields}
        url = f"ws://127.0.0.1:{self._port}"

        async def exchange() -> dict[str, Any]:
            async with websockets.connect(
                url,
                open_timeout=self.request_timeout,
                close_timeout=1.0,
                proxy=None,
            ) as connection:
                await connection.send(json.dumps(request))
                raw = await connection.recv()
            if not isinstance(raw, str):
                raise SokujiBridgeError("Sokuji returned a binary frame for a JSON inspection request.")
            try:
                reply = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise SokujiBridgeError("Sokuji returned invalid JSON.") from exc
            if not isinstance(reply, dict) or reply.get("id") != request_id:
                raise SokujiBridgeError("Sokuji response did not match the request id.")
            if reply.get("type") == "error":
                raise SokujiBridgeError(str(reply.get("message") or "Sokuji rejected the request."))
            if reply.get("type") != expected_type:
                raise SokujiBridgeError(f"Unexpected Sokuji response type: {reply.get('type')!r}")
            return reply

        try:
            return await asyncio.wait_for(exchange(), timeout=self.request_timeout)
        except asyncio.TimeoutError as exc:
            raise SokujiBridgeError(f"Sokuji {message_type} request timed out.") from exc
        except SokujiBridgeError:
            raise
        except Exception as exc:
            raise SokujiBridgeError(f"Sokuji {message_type} request failed: {exc}") from exc


def make_sokuji_router(bridge: SokujiBridge) -> APIRouter:
    router = APIRouter()

    @router.get("/api/open-engines/sokuji/health")
    async def health() -> dict[str, Any]:
        status = bridge.status()
        if status["reason"] or not status["running"]:
            return {**status, "health": None}
        try:
            return {**status, "health": await bridge.health()}
        except SokujiBridgeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @router.get("/api/open-engines/sokuji/catalog")
    async def catalog(kind: str = Query("asr", pattern="^(asr|translate|tts)$")) -> dict[str, Any]:
        status = bridge.status()
        if status["reason"] or not status["running"]:
            raise HTTPException(status_code=409, detail=status["reason"] or "Sokuji sidecar is not running.")
        try:
            reply = await bridge.catalog(kind)
            return {**status, "kind": kind, "models": reply.get("models", [])}
        except SokujiBridgeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @router.post("/api/open-engines/sokuji/start")
    async def start() -> dict[str, Any]:
        try:
            return await bridge.start()
        except SokujiRuntimeUnavailable as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except SokujiBridgeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @router.post("/api/open-engines/sokuji/stop")
    async def stop() -> dict[str, Any]:
        bridge.stop()
        return bridge.status()

    return router
