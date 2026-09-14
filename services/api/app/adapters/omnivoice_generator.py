from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import sys
import threading
from collections import deque
from pathlib import Path
from uuid import uuid4

from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_model_catalog import FileTrainingModelCatalog, TrainingModelUnavailable
from app.domain.models import MediaAssetCreate, ProjectMediaAsset, VoiceGenerateRequest
from app.domain.ports import MediaLibrary, ProjectRepository
from app.domain.training_parameters import resolve_parameters
from app.workers.omnivoice_worker import REPLY_PREFIX

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "omnivoice_worker.py"


class VoiceGenerationError(RuntimeError):
    """The engine could not produce audio for this request."""


class OmniVoiceWorkerProcess:
    """One warm OmniVoice process, started on first use and stopped when idle.

    Idle shutdown matters as much as warm starts: a model parked on the GPU is
    VRAM a training run or transcription cannot have.
    """

    def __init__(
        self,
        python: Path,
        env: dict[str, str] | None = None,
        script: Path = WORKER_SCRIPT,
        idle_seconds: float = 300.0,
        request_timeout: float = 900.0,
    ) -> None:
        self.python = python
        self.env = env or {}
        self.script = script
        self.idle_seconds = idle_seconds
        self.request_timeout = request_timeout
        self._process: subprocess.Popen[str] | None = None
        self._replies: queue.Queue[dict | None] = queue.Queue()
        self._stderr: deque[str] = deque(maxlen=40)
        self._lock = threading.Lock()
        self._idle: threading.Timer | None = None
        self._idle_token = 0

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def request(self, payload: dict) -> dict:
        with self._lock:
            self._cancel_idle()
            try:
                self._ensure_started()
                request_id = payload.setdefault("id", uuid4().hex)
                assert self._process is not None and self._process.stdin is not None
                self._process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
                self._process.stdin.flush()
                while True:
                    reply = self._next_reply()
                    if reply.get("id") == request_id:
                        return reply
            except (OSError, ValueError) as exc:
                self._stop_locked()
                raise VoiceGenerationError(f"Worker OmniVoice dừng giữa chừng: {exc}") from exc
            finally:
                self._schedule_idle()

    def shutdown(self) -> None:
        with self._lock:
            self._cancel_idle()
            self._stop_locked()

    # ---------- internals ----------

    def _ensure_started(self) -> None:
        if self.running:
            return
        if not self.python.is_file():
            raise VoiceGenerationError(f"Không thấy Python của runtime OmniVoice: {self.python}")
        self._replies = queue.Queue()
        self._stderr.clear()
        environment = {**os.environ, "PYTHONIOENCODING": "utf-8", **self.env}
        self._process = subprocess.Popen(
            [str(self.python), "-u", str(self.script)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=environment,
            creationflags=0x08000000 if sys.platform == "win32" else 0,  # no console window
        )
        threading.Thread(target=self._read_stdout, args=(self._process,), daemon=True).start()
        threading.Thread(target=self._read_stderr, args=(self._process,), daemon=True).start()
        ready = self._next_reply()
        if not ready.get("ready"):
            raise VoiceGenerationError("Worker OmniVoice không báo sẵn sàng.")

    def _next_reply(self) -> dict:
        try:
            reply = self._replies.get(timeout=self.request_timeout)
        except queue.Empty as exc:
            raise VoiceGenerationError("Worker OmniVoice không trả lời kịp.") from exc
        if reply is None:
            tail = " | ".join(list(self._stderr)[-5:])
            raise VoiceGenerationError(f"Worker OmniVoice đã thoát. {tail}".strip())
        return reply

    def _read_stdout(self, process: subprocess.Popen[str]) -> None:
        assert process.stdout is not None
        for line in process.stdout:
            if line.startswith(REPLY_PREFIX):
                try:
                    self._replies.put(json.loads(line[len(REPLY_PREFIX):]))
                except ValueError:
                    continue
        self._replies.put(None)

    def _read_stderr(self, process: subprocess.Popen[str]) -> None:
        assert process.stderr is not None
        for line in process.stderr:
            text = line.strip()
            if text:
                self._stderr.append(text)

    def _schedule_idle(self) -> None:
        if not self.running or self.idle_seconds <= 0:
            return
        self._idle_token += 1
        self._idle = threading.Timer(self.idle_seconds, self._idle_shutdown, args=(self._idle_token,))
        self._idle.daemon = True
        self._idle.start()

    def _idle_shutdown(self, token: int) -> None:
        with self._lock:
            # A request that started while this timer was waiting for the lock
            # scheduled a newer timer; this one is stale.
            if token == self._idle_token:
                self._stop_locked()

    def _cancel_idle(self) -> None:
        self._idle_token += 1
        if self._idle is not None:
            self._idle.cancel()
            self._idle = None

    def _stop_locked(self) -> None:
        process = self._process
        self._process = None
        if process is None or process.poll() is not None:
            return
        try:
            assert process.stdin is not None
            process.stdin.write(json.dumps({"command": "shutdown", "id": "shutdown"}) + "\n")
            process.stdin.flush()
            process.wait(timeout=10)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            process.kill()


class VoiceGenerator:
    """Speaks text with a project voice and files the result in Media Pool."""

    def __init__(
        self,
        projects: ProjectRepository,
        voices: FileProjectVoices,
        media: MediaLibrary,
        worker: OmniVoiceWorkerProcess,
        gpu_lease: GpuLease,
        generators: FileTrainingModelCatalog,
    ) -> None:
        self.projects = projects
        self.voices = voices
        self.media = media
        self.worker = worker
        self.gpu_lease = gpu_lease
        self.generators = generators

    def generate(self, project_id: str, voice_id: str, request: VoiceGenerateRequest) -> ProjectMediaAsset:
        voice = self.voices.get(project_id, voice_id)
        try:
            option = self.generators.get(request.generator_id)
        except KeyError as exc:
            raise ValueError(f"Không có công cụ tạo giọng '{request.generator_id}'.") from exc
        if not option.available:
            raise TrainingModelUnavailable(f"{option.label}: {option.status}")
        if voice.engine != option.engine:
            raise ValueError(f"{option.label} không dùng được voice của engine {voice.engine}.")
        generation = resolve_parameters(option, request.parameters)
        language = generation.pop("language", None) or voice.language
        speed = generation.pop("speed", None)

        project_root = Path(self.projects.get(project_id).project_path)
        reference = self.voices.absolute(project_id, voice.reference_audio)
        if not reference.is_file():
            raise ValueError(f"Thiếu file giọng mẫu của voice {voice.name}.")
        adapter = self.voices.absolute(project_id, voice.adapter_path) if voice.adapter_path else None
        if adapter is not None and not adapter.is_dir():
            raise ValueError(f"Thiếu adapter LoRA của voice {voice.name}.")

        asset_id = f"asset-{uuid4().hex[:12]}"
        asset_dir = project_root / "assets" / "media" / asset_id
        asset_dir.mkdir(parents=True, exist_ok=False)
        source = asset_dir / "source.wav"
        lease = self.gpu_lease.acquire(f"voice-generate:{asset_id}")
        try:
            reply = self.worker.request(
                {
                    "model": voice.base_model,
                    "lora_adapter": str(adapter) if adapter else None,
                    "ref_audio": str(reference),
                    "ref_text": voice.reference_text,
                    "text": request.text,
                    "language": language,
                    "duration": request.duration,
                    "speed": speed,
                    "generation": generation,
                    "output": str(source),
                }
            )
        except Exception:
            shutil.rmtree(asset_dir, ignore_errors=True)
            raise
        finally:
            self.gpu_lease.release(lease.token)
        if not reply.get("ok") or not source.is_file():
            shutil.rmtree(asset_dir, ignore_errors=True)
            raise VoiceGenerationError(reply.get("error") or "OmniVoice không tạo được audio.")

        analysis = asset_dir / "analysis.wav"
        shutil.copyfile(source, analysis)
        preview = " ".join(request.text.split()[:6])
        return self.media.create(
            project_id,
            MediaAssetCreate(
                name=f"{voice.name} · {preview}.wav",
                source_extension=".wav",
                media_kind="audio",
                source_path=source.relative_to(project_root).as_posix(),
                analysis_path=analysis.relative_to(project_root).as_posix(),
                url=f"/api/projects/{project_id}/media/{asset_id}/audio",
                duration=float(reply.get("seconds") or 0),
                sample_rate=24000,
                audio_codec="pcm_s16le",
                origin="generate",
                capture_tier="import",
                status="ready",
                text=request.text,
                transcription_status="skipped",
                speaker_profile_ids=[voice.speaker_profile_id],
            ),
            asset_id,
        )
