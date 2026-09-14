from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.adapters.engine_worker import EngineWorkerError, EngineWorkerProcess
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_model_catalog import FileTrainingModelCatalog, TrainingModelUnavailable
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.vibevoice_training import VibeVoicePaths, write_processor_dir
from app.domain.models import ProjectVoice, VoiceGenerateRequest, VoiceOutput
from app.domain.ports import ProjectRepository
from app.domain.training_parameters import resolve_parameters

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "omnivoice_worker.py"
VIBEVOICE_WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "vibevoice_tts_worker.py"


class VoiceGenerationError(RuntimeError):
    """The engine could not produce audio for this request."""


def omnivoice_worker(python: Path, env: dict[str, str] | None = None, idle_seconds: float = 300.0) -> EngineWorkerProcess:
    return EngineWorkerProcess(python, WORKER_SCRIPT, env, label="OmniVoice", idle_seconds=idle_seconds)


@dataclass
class SpeechRequest:
    """What every engine gets to build its worker request from."""

    voice: ProjectVoice
    reference: Path
    adapter: Path | None
    model_dir: Path | None
    text: str
    generation: dict[str, Any]
    language: str | None
    speed: float | None
    duration: float | None
    output: Path


class OmniVoiceSpeech:
    def __init__(self, worker: EngineWorkerProcess) -> None:
        self.worker = worker

    def payload(self, request: SpeechRequest) -> dict[str, Any]:
        return {
            "model": str(request.model_dir) if request.model_dir else request.voice.base_model,
            "lora_adapter": str(request.adapter) if request.adapter else None,
            "ref_audio": str(request.reference),
            "ref_text": request.voice.reference_text,
            "text": request.text,
            "language": request.language,
            "duration": request.duration,
            "speed": request.speed,
            "generation": request.generation,
            "output": str(request.output),
        }


class VibeVoiceSpeech:
    """VibeVoice TTS: the community fork's inference, with a trained adapter when the voice has one."""

    def __init__(self, worker: EngineWorkerProcess, paths: VibeVoicePaths, processor_cache: Path) -> None:
        self.worker = worker
        self.paths = paths
        self.processor_cache = processor_cache

    def payload(self, request: SpeechRequest) -> dict[str, Any]:
        model_dir = request.model_dir or self.paths.resolve_model(request.voice.base_model)
        tokenizer = self.paths.tokenizer_for(model_dir, "Qwen/Qwen2.5-1.5B")
        processor = write_processor_dir(model_dir, tokenizer, self.processor_cache / model_dir.name)
        return {
            "model": str(model_dir),
            "processor": str(processor),
            "lora_adapter": str(request.adapter) if request.adapter else None,
            "ref_audio": str(request.reference),
            "text": request.text,
            "cfg_scale": request.generation.get("cfg_scale"),
            "ddpm_steps": request.generation.get("ddpm_steps"),
            "output": str(request.output),
        }


@dataclass
class SpeechPlan:
    """A voice, the generator that speaks it and its resolved settings."""

    voice: ProjectVoice
    generator_id: str
    generator_label: str
    engine: str
    generation: dict[str, Any]
    language: str | None
    speed: float | None
    reference: Path
    adapter: Path | None
    model_dir: Path | None
    engine_speech: "OmniVoiceSpeech | VibeVoiceSpeech"


def vibevoice_worker(paths: VibeVoicePaths, idle_seconds: float = 300.0) -> EngineWorkerProcess:
    return EngineWorkerProcess(
        paths.python, VIBEVOICE_WORKER_SCRIPT, paths.environment(paths.community), label="VibeVoice-TTS", idle_seconds=idle_seconds
    )


class VoiceGenerator:
    """Speaks text with a project voice and files the result in Voice Output.

    Each engine brings its own worker and request shape; everything around the
    call - parameter checks, the GPU lease, the output record - is shared.
    """

    def __init__(
        self,
        projects: ProjectRepository,
        voices: FileProjectVoices,
        outputs: FileVoiceOutputs,
        worker: EngineWorkerProcess,
        gpu_lease: GpuLease,
        generators: FileTrainingModelCatalog,
        engines: dict[str, OmniVoiceSpeech | VibeVoiceSpeech] | None = None,
    ) -> None:
        self.projects = projects
        self.voices = voices
        self.outputs = outputs
        self.gpu_lease = gpu_lease
        self.generators = generators
        self.engines: dict[str, OmniVoiceSpeech | VibeVoiceSpeech] = {"omnivoice": OmniVoiceSpeech(worker), **(engines or {})}

    def prepare(self, project_id: str, voice_id: str, generator_id: str, parameters: dict[str, Any]) -> SpeechPlan:
        """Everything about speaking with a voice except the text: checked once, used per request."""
        voice = self.voices.get(project_id, voice_id)
        try:
            option = self.generators.get(generator_id)
        except KeyError as exc:
            raise ValueError(f"Không có công cụ tạo giọng '{generator_id}'.") from exc
        if not option.available:
            raise TrainingModelUnavailable(f"{option.label}: {option.status}")
        if voice.engine != option.engine:
            raise ValueError(f"{option.label} không dùng được voice của engine {voice.engine}.")
        generation = resolve_parameters(option, parameters)
        language = generation.pop("language", None) or voice.language
        speed = generation.pop("speed", None)

        reference = self.voices.absolute(project_id, voice.reference_audio)
        if not reference.is_file():
            raise ValueError(f"Thiếu file giọng mẫu của voice {voice.name}.")
        adapter = self.voices.absolute(project_id, voice.adapter_path) if voice.adapter_path else None
        if adapter is not None and not adapter.is_dir():
            raise ValueError(f"Thiếu adapter LoRA của voice {voice.name}.")
        model_dir = self.voices.absolute(project_id, voice.model_path) if voice.model_path else None
        engine = self.engines.get(voice.engine)
        if engine is None:
            raise ValueError(f"Chưa có bộ tạo giọng cho engine {voice.engine}.")
        return SpeechPlan(voice, option.id, option.label, option.engine, generation, language, speed, reference, adapter, model_dir, engine)

    def generator_for(self, engine: str) -> str | None:
        """The generator that speaks a voice of this engine, preferring one that can run."""
        options = [option for option in self.generators.options() if option.engine == engine]
        chosen = next((option for option in options if option.available), options[0] if options else None)
        return chosen.id if chosen else None

    def speak(self, plan: SpeechPlan, text: str, output: Path, duration: float | None = None) -> float:
        """Speak text into `output` and return its length. The caller holds the GPU lease."""
        reply = self._request(
            plan.engine_speech.worker,
            plan.engine_speech.payload(
                SpeechRequest(
                    voice=plan.voice, reference=plan.reference, adapter=plan.adapter, model_dir=plan.model_dir, text=text,
                    generation=plan.generation, language=plan.language, speed=plan.speed, duration=duration, output=output,
                )
            ),
        )
        if not reply.get("ok") or not output.is_file():
            raise VoiceGenerationError(reply.get("error") or f"{plan.generator_label} không tạo được audio.")
        return float(reply.get("seconds") or 0)

    def generate(self, project_id: str, voice_id: str, request: VoiceGenerateRequest) -> VoiceOutput:
        plan = self.prepare(project_id, voice_id, request.generator_id, request.parameters)
        voice = plan.voice
        project_root = Path(self.projects.get(project_id).project_path)

        # The lease first: a busy GPU must not leave an empty output folder behind.
        lease = self.gpu_lease.acquire(f"voice-generate:{voice.id}")
        output_id: str | None = None
        try:
            output_id, audio = self.outputs.reserve(project_id)
            seconds = self.speak(plan, request.text, audio, request.duration)
        except Exception:
            if output_id:
                self.outputs.discard(project_id, output_id)
            raise
        finally:
            self.gpu_lease.release(lease.token)

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
                engine=plan.engine,
                generator_id=plan.generator_id,
                parameters={**plan.generation, "language": plan.language, "speed": plan.speed, "duration": request.duration},
                duration=seconds,
                audio_path=audio.relative_to(project_root).as_posix(),
            ),
        )

    @staticmethod
    def _request(worker: EngineWorkerProcess, payload: dict) -> dict:
        try:
            return worker.request(payload)
        except EngineWorkerError as exc:
            raise VoiceGenerationError(str(exc)) from exc
