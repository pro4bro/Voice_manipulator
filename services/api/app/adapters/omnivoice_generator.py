from __future__ import annotations

from pathlib import Path

from app.adapters.engine_worker import EngineWorkerError, EngineWorkerProcess
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_model_catalog import FileTrainingModelCatalog, TrainingModelUnavailable
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.domain.models import VoiceGenerateRequest, VoiceOutput
from app.domain.ports import ProjectRepository
from app.domain.training_parameters import resolve_parameters

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "omnivoice_worker.py"


class VoiceGenerationError(RuntimeError):
    """The engine could not produce audio for this request."""


def omnivoice_worker(python: Path, env: dict[str, str] | None = None, idle_seconds: float = 300.0) -> EngineWorkerProcess:
    return EngineWorkerProcess(python, WORKER_SCRIPT, env, label="OmniVoice", idle_seconds=idle_seconds)


class VoiceGenerator:
    """Speaks text with a project voice and files the result in Voice Output."""

    def __init__(
        self,
        projects: ProjectRepository,
        voices: FileProjectVoices,
        outputs: FileVoiceOutputs,
        worker: EngineWorkerProcess,
        gpu_lease: GpuLease,
        generators: FileTrainingModelCatalog,
    ) -> None:
        self.projects = projects
        self.voices = voices
        self.outputs = outputs
        self.worker = worker
        self.gpu_lease = gpu_lease
        self.generators = generators

    def generate(self, project_id: str, voice_id: str, request: VoiceGenerateRequest) -> VoiceOutput:
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

        # The lease first: a busy GPU must not leave an empty output folder behind.
        lease = self.gpu_lease.acquire(f"voice-generate:{voice.id}")
        output_id: str | None = None
        try:
            output_id, audio = self.outputs.reserve(project_id)
            reply = self._request(
                {
                    "model": str(self.voices.absolute(project_id, voice.model_path)) if voice.model_path else voice.base_model,
                    "lora_adapter": str(adapter) if adapter else None,
                    "ref_audio": str(reference),
                    "ref_text": voice.reference_text,
                    "text": request.text,
                    "language": language,
                    "duration": request.duration,
                    "speed": speed,
                    "generation": generation,
                    "output": str(audio),
                }
            )
        except Exception:
            if output_id:
                self.outputs.discard(project_id, output_id)
            raise
        finally:
            self.gpu_lease.release(lease.token)
        if not reply.get("ok") or not audio.is_file():
            self.outputs.discard(project_id, output_id)
            raise VoiceGenerationError(reply.get("error") or "OmniVoice không tạo được audio.")

        preview = " ".join(request.text.split()[:6])
        return self.outputs.save(
            project_id,
            VoiceOutput(
                id=output_id,
                name=f"{voice.name} · {preview}",
                text=request.text,
                voice_id=voice.id,
                voice_name=voice.name,
                speaker_profile_id=voice.speaker_profile_id,
                engine=option.engine,
                generator_id=option.id,
                parameters={**generation, "language": language, "speed": speed, "duration": request.duration},
                duration=float(reply.get("seconds") or 0),
                audio_path=audio.relative_to(project_root).as_posix(),
            ),
        )

    def _request(self, payload: dict) -> dict:
        try:
            return self.worker.request(payload)
        except EngineWorkerError as exc:
            raise VoiceGenerationError(str(exc)) from exc
