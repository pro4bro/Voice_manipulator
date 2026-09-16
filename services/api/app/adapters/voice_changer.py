from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.adapters.engine_worker import EngineWorkerError, EngineWorkerProcess
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_model_catalog import FileTrainingModelCatalog, TrainingModelUnavailable
from app.domain.models import (
    AudioDeviceInfo,
    VoiceChangerPreflight,
    VoiceChangerRecording,
    VoiceChangerStartRequest,
    VoiceChangerStatus,
)
from app.domain.ports import ProjectRepository
from app.domain.training_parameters import resolve_parameters

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "voice_changer_worker.py"
RUNTIME_PACKAGES = ("numpy", "sounddevice")
VIRTUAL_CABLE_MARKERS = ("vb-audio", "cable input", "cable in ", "voicemeeter", "virtual cable")


class VoiceChangerError(RuntimeError):
    """Live conversion could not start or answer."""


class VoiceConsentRequired(ValueError):
    """The target voice's owner has not been recorded as agreeing to its use."""


def is_virtual_cable(name: str) -> bool:
    lowered = name.lower()
    return any(marker in lowered for marker in VIRTUAL_CABLE_MARKERS)


def preferred_cable(devices: list[AudioDeviceInfo]) -> AudioDeviceInfo | None:
    """The playback side of a virtual cable to send the converted voice into.

    WASAPI first, for its latency; the 16-channel variant last, since a mono
    voice sent there reaches only the cable's first pair of channels.
    """
    cables = [device for device in devices if device.virtual_cable and device.max_output_channels]
    return min(cables, key=lambda device: (device.host_api != "Windows WASAPI", "16 ch" in device.name.lower(), device.index), default=None)


class VoiceChangerRuntime:
    """Whether the Voice Changer Python can open audio devices.

    Asked of the interpreter itself and cached for a minute, like the VibeVoice
    runtime: the page polls, and a subprocess per poll is waste.
    """

    def __init__(self, root: Path, ttl_seconds: float = 60.0) -> None:
        self.root = root
        self.ttl_seconds = ttl_seconds
        self._cache: tuple[float, list[str]] | None = None

    @property
    def python(self) -> Path:
        return self.root / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

    def missing(self) -> list[str]:
        if not self.python.is_file():
            return [f"Python của runtime Voice Changer ({self.root})"]
        if self._cache and time.monotonic() - self._cache[0] < self.ttl_seconds:
            return self._cache[1]
        probe = "import importlib.util, json; print(json.dumps([n for n in %r if importlib.util.find_spec(n) is None]))" % (list(RUNTIME_PACKAGES),)
        try:
            result = subprocess.run([str(self.python), "-c", probe], capture_output=True, text=True, timeout=60)
            missing = json.loads(result.stdout.strip().splitlines()[-1]) if result.returncode == 0 else ["Python của runtime Voice Changer không chạy được"]
        except (OSError, subprocess.TimeoutExpired, ValueError, IndexError):
            missing = ["Python của runtime Voice Changer không chạy được"]
        self._cache = (time.monotonic(), missing)
        return missing


_ENDPOINTS: tuple[float, list[str]] | None = None


def windows_audio_endpoints() -> list[str]:
    """Audio endpoint names Windows reports, cached for 30 seconds."""
    global _ENDPOINTS
    if os.name != "nt":
        return []
    if _ENDPOINTS and time.monotonic() - _ENDPOINTS[0] < 30:
        return _ENDPOINTS[1]
    command = "Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FriendlyName"
    try:
        result = subprocess.run(["powershell", "-NoProfile", "-Command", command], capture_output=True, text=True, timeout=20, encoding="utf-8", errors="replace")
        names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except (OSError, subprocess.TimeoutExpired):
        names = []
    _ENDPOINTS = (time.monotonic(), names)
    return names


class FileChangerRecordings:
    """Two-channel recordings of live sessions.

    ```
    <project>/assets/voice-changer/<recording-id>/
      recording.json   engine, voice, settings and the delay that was removed
      recording.wav    left: the spoken voice, right: the converted voice
    ```
    """

    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects

    def root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "assets" / "voice-changer"

    def reserve(self, project_id: str) -> tuple[str, Path]:
        recording_id = f"changer-{uuid4().hex[:12]}"
        folder = self.root(project_id) / recording_id
        folder.mkdir(parents=True, exist_ok=False)
        return recording_id, folder / "recording.wav"

    def discard(self, project_id: str, recording_id: str) -> None:
        shutil.rmtree(self.root(project_id) / recording_id, ignore_errors=True)

    def save(self, project_id: str, recording: VoiceChangerRecording) -> VoiceChangerRecording:
        folder = self.root(project_id) / recording.id
        temporary = folder / "recording.json.tmp"
        temporary.write_text(recording.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(folder / "recording.json")
        return recording

    def list(self, project_id: str) -> list[VoiceChangerRecording]:
        root = self.root(project_id)
        if not root.is_dir():
            return []
        found = []
        for record in root.glob("*/recording.json"):
            try:
                found.append(VoiceChangerRecording.model_validate_json(record.read_text(encoding="utf-8")))
            except ValueError:
                continue
        return sorted(found, key=lambda item: item.created_at, reverse=True)

    def get(self, project_id: str, recording_id: str) -> VoiceChangerRecording:
        record = self.root(project_id) / recording_id / "recording.json"
        if not record.is_file():
            raise KeyError(recording_id)
        return VoiceChangerRecording.model_validate_json(record.read_text(encoding="utf-8"))

    def audio_path(self, project_id: str, recording_id: str) -> Path:
        self.get(project_id, recording_id)
        return self.root(project_id) / recording_id / "recording.wav"

    def delete(self, project_id: str, recording_id: str) -> None:
        self.get(project_id, recording_id)
        self.discard(project_id, recording_id)


class VoiceChanger:
    """One live conversion session at a time, run by a worker on the machine's devices.

    The API keeps what the session is for - project, engine, voice, settings,
    the GPU lease - and asks the worker for meters and spectra when the page
    polls. Recording asks the worker for two aligned channels and files them.
    """

    def __init__(
        self,
        projects: ProjectRepository,
        runtime: VoiceChangerRuntime,
        engines: FileTrainingModelCatalog,
        voices: FileProjectVoices,
        recordings: FileChangerRecordings,
        gpu_lease: GpuLease,
        worker: EngineWorkerProcess | None = None,
        endpoints: Callable[[], list[str]] = windows_audio_endpoints,
        before_gpu_work: Callable[[], None] | None = None,
        catalogs: Any = None,
        engine_runtimes: dict[str, tuple[VoiceChangerRuntime, dict[str, str]]] | None = None,
    ) -> None:
        self.catalogs = catalogs
        # An engine that needs its own Python (RVC, with torch) runs the same
        # worker under that runtime; the flow check uses the light default one.
        self.engine_runtimes = engine_runtimes or {}
        self._engine_workers: dict[str, EngineWorkerProcess] = {}
        self.projects = projects
        self.runtime = runtime
        self.engines = engines
        self.voices = voices
        self.recordings = recordings
        self.gpu_lease = gpu_lease
        self.endpoints = endpoints
        self.before_gpu_work = before_gpu_work
        self.worker = worker or EngineWorkerProcess(runtime.python, WORKER_SCRIPT, label="Voice Changer", idle_seconds=120.0, request_timeout=30.0)
        self._lock = threading.RLock()
        self._session: dict[str, Any] | None = None

    # ---------- what the machine has ----------

    def preflight(self) -> VoiceChangerPreflight:
        missing = self.runtime.missing()
        endpoints = self.endpoints()
        devices: list[AudioDeviceInfo] = []
        device_error = None
        if not missing:
            try:
                reply = self.worker.request({"command": "devices"})
                if reply.get("ok"):
                    devices = [AudioDeviceInfo(**device, virtual_cable=is_virtual_cable(device["name"])) for device in reply.get("devices") or []]
                else:
                    device_error = reply.get("error")
            except EngineWorkerError as exc:
                device_error = str(exc)
        chosen = preferred_cable(devices)
        cable = chosen.name if chosen else next((name for name in endpoints if is_virtual_cable(name)), None)
        holder = self.gpu_lease.holder()
        return VoiceChangerPreflight(
            runtime_ready=not missing,
            runtime_python=str(self.runtime.python) if self.runtime.python.is_file() else None,
            missing=missing,
            devices=devices,
            device_error=device_error,
            endpoints=endpoints,
            virtual_cable=cable,
            gpu_holder=holder.label if holder else None,
        )

    # ---------- the session ----------

    def start(self, project_id: str, request: VoiceChangerStartRequest) -> VoiceChangerStatus:
        self.projects.get(project_id)
        try:
            option = self.engines.get(request.engine_id)
        except KeyError as exc:
            raise ValueError(f"Không có engine đổi giọng '{request.engine_id}'.") from exc
        if not option.available:
            raise TrainingModelUnavailable(f"{option.label}: {option.status}")
        runtime = self.engine_runtimes.get(option.engine, (self.runtime, {}))[0]
        missing = runtime.missing()
        if missing:
            raise VoiceChangerError("Runtime Voice Changer còn thiếu: " + ", ".join(missing) + ".")
        parameters = resolve_parameters(option, request.parameters)
        target: dict[str, Any] | None = None
        voice = None
        converts = option.engine != "passthrough"
        if converts and not request.voice_id:
            raise ValueError("Chọn giọng giả trong Sound Library trước khi đổi giọng.")
        if request.voice_id:
            try:
                voice = self.voices.get(project_id, request.voice_id)
            except KeyError as exc:
                raise ValueError("Voice được chọn không còn trong project.") from exc
            if converts:
                self._require_consent(project_id, voice.speaker_profile_id)
            if option.engine == "rvc" and (voice.engine != "rvc" or not voice.model_path):
                raise ValueError(f"{voice.name} không phải model RVC. Train “RVC · model đổi giọng” cho Speaker Profile này ở Voice Training.")
            target = {
                "referenceAudio": str(self.voices.absolute(project_id, voice.reference_audio)),
                "referenceText": voice.reference_text,
                "adapter": str(self.voices.absolute(project_id, voice.adapter_path)) if voice.adapter_path else None,
                "model": str(self.voices.absolute(project_id, voice.model_path)) if voice.model_path else None,
                "index": str(self.voices.absolute(project_id, voice.adapter_path)) if voice.adapter_path else None,
                "language": voice.language,
            }
        outputs = []
        if request.virtual_device is not None:
            outputs.append({"role": "virtual", "device": request.virtual_device, "name": request.virtual_device_name, "hostApi": request.host_api})
        if request.monitor and request.speaker_device is not None:
            outputs.append({"role": "speaker", "device": request.speaker_device, "name": request.speaker_device_name, "hostApi": request.host_api})
        if not outputs:
            raise ValueError("Chọn ít nhất một đầu ra: micro ảo, hoặc bật nghe lại qua loa.")

        with self._lock:
            self._stop_locked(project_id=None)
            worker = self._worker_for(option.engine)
            lease_token = None
            if option.engine != "passthrough":
                # A converter model wants the card for as long as the session runs.
                lease_token = self.gpu_lease.acquire(f"voice-changer:{option.id}").token
                if self.before_gpu_work is not None:
                    self.before_gpu_work()
            try:
                reply = worker.request({
                    "command": "start",
                    "engine": option.engine,
                    "inputDevice": request.input_device,
                    "inputDeviceName": request.input_device_name,
                    "hostApi": request.host_api,
                    "outputs": outputs,
                    "parameters": parameters,
                    "target": target,
                })
            except EngineWorkerError as exc:
                self._release(lease_token)
                raise VoiceChangerError(str(exc)) from exc
            if not reply.get("ok"):
                self._release(lease_token)
                raise VoiceChangerError(reply.get("error") or "Không mở được thiết bị âm thanh.")
            self._session = {
                "worker": worker,
                "project_id": project_id,
                "engine_id": option.id,
                "voice": voice,
                "parameters": parameters,
                "lease_token": lease_token,
                "started_at": datetime.now(timezone.utc),
            }
            return self._status(reply.get("status") or {})

    def uses_voice(self, project_id: str, voice_id: str) -> bool:
        """True while a live session converts toward this voice."""
        with self._lock:
            session = self._session
            voice = session.get("voice") if session else None
            return bool(session and session["project_id"] == project_id and voice is not None and voice.id == voice_id)

    def status(self) -> VoiceChangerStatus:
        with self._lock:
            if self._session is None:
                return VoiceChangerStatus()
            try:
                reply = self._session["worker"].request({"command": "status"})
            except EngineWorkerError as exc:
                self._release(self._session.get("lease_token"))
                session, self._session = self._session, None
                return VoiceChangerStatus(state="error", project_id=session["project_id"], engine_id=session["engine_id"], error=str(exc))
            return self._status(reply.get("status") or {"state": "error", "error": reply.get("error")})

    def stop(self) -> tuple[VoiceChangerStatus, VoiceChangerRecording | None]:
        with self._lock:
            recording = self._stop_locked(project_id=None)
            return VoiceChangerStatus(), recording

    def record_start(self, project_id: str) -> VoiceChangerStatus:
        with self._lock:
            self._require(project_id)
            reply = self._request({"command": "record_start"})
            return self._status(reply.get("status") or {})

    def record_stop(self, project_id: str) -> VoiceChangerRecording:
        with self._lock:
            self._require(project_id)
            return self._finish_recording(project_id, stop_session=False)

    def shutdown(self) -> None:
        with self._lock:
            try:
                self._stop_locked(project_id=None)
            finally:
                self.worker.shutdown()
                for worker in self._engine_workers.values():
                    worker.shutdown()

    # ---------- inside ----------

    def _require_consent(self, project_id: str, speaker_profile_id: str) -> None:
        speakers = self.catalogs.get(project_id).speakers if self.catalogs is not None else []
        speaker = next((item for item in speakers if item.id == speaker_profile_id), None)
        if speaker is None:
            raise VoiceConsentRequired("Giọng giả phải thuộc một Speaker Profile của project.")
        if speaker.voice_consent is None:
            raise VoiceConsentRequired(
                f"Speaker Profile {speaker.name} chưa có xác nhận đồng ý của chủ giọng. "
                "Mở Properties của profile trong Sound Library để ghi nhận trước khi đổi giọng."
            )

    def _require(self, project_id: str) -> None:
        if self._session is None:
            raise VoiceChangerError("Voice Changer chưa chạy.")
        if self._session["project_id"] != project_id:
            raise VoiceChangerError("Voice Changer đang chạy cho project khác.")

    def _worker_for(self, engine: str) -> EngineWorkerProcess:
        if engine not in self.engine_runtimes:
            return self.worker
        if engine not in self._engine_workers:
            runtime, env = self.engine_runtimes[engine]
            self._engine_workers[engine] = EngineWorkerProcess(runtime.python, WORKER_SCRIPT, env, label=f"Voice Changer {engine}", idle_seconds=120.0, request_timeout=180.0)
        return self._engine_workers[engine]

    def _request(self, payload: dict) -> dict:
        worker = self._session["worker"] if self._session else self.worker
        try:
            reply = worker.request(payload)
        except EngineWorkerError as exc:
            raise VoiceChangerError(str(exc)) from exc
        if not reply.get("ok"):
            raise VoiceChangerError(reply.get("error") or "Voice Changer không trả lời.")
        return reply

    def _finish_recording(self, project_id: str, stop_session: bool) -> VoiceChangerRecording:
        session = self._session
        assert session is not None
        recording_id, audio = self.recordings.reserve(project_id)
        try:
            reply = self._request({"command": "stop" if stop_session else "record_stop", "path": str(audio)})
            result = reply.get("recording")
            if not result or not audio.is_file():
                raise VoiceChangerError("Không có gì được ghi.")
        except Exception:
            self.recordings.discard(project_id, recording_id)
            raise
        voice = session.get("voice")
        stamp = datetime.now().strftime("%H:%M:%S")
        return self.recordings.save(project_id, VoiceChangerRecording(
            id=recording_id,
            name=f"{voice.name if voice else 'Giọng gốc'} · {stamp}",
            engine_id=session["engine_id"],
            voice_id=voice.id if voice else None,
            voice_name=voice.name if voice else None,
            speaker_profile_id=voice.speaker_profile_id if voice else None,
            duration=float(result.get("seconds") or 0),
            sample_rate=int(result.get("sampleRate") or 48000),
            delay_ms=float(result.get("delayMs") or 0),
            refined_delay_ms=result.get("refinedMs"),
            audio_path=audio.relative_to(Path(self.projects.get(project_id).project_path)).as_posix(),
            parameters=session.get("parameters") or {},
        ))

    def _stop_locked(self, project_id: str | None) -> VoiceChangerRecording | None:
        session = self._session
        if session is None:
            return None
        recording = None
        worker = session.get("worker") or self.worker
        try:
            status = worker.request({"command": "status"}).get("status") or {}
            if status.get("recording"):
                recording = self._finish_recording(session["project_id"], stop_session=True)
            else:
                worker.request({"command": "stop"})
        except (EngineWorkerError, VoiceChangerError):
            pass
        finally:
            self._release(session.get("lease_token"))
            self._session = None
        return recording

    def _release(self, token: str | None) -> None:
        if token:
            self.gpu_lease.release(token)

    def _status(self, raw: dict) -> VoiceChangerStatus:
        session = self._session or {}
        voice = session.get("voice")
        # The worker speaks the same camelCase names; anything else it adds is ignored.
        status = VoiceChangerStatus.model_validate({**raw, "state": raw.get("state") or "idle"})
        return status.model_copy(update={
            "project_id": session.get("project_id"),
            "engine_id": session.get("engine_id"),
            "voice_id": voice.id if voice else None,
            "started_at": session.get("started_at"),
        })
