from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from app.adapters.engine_worker import EngineWorkerError, EngineWorkerProcess
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_model_catalog import FileTrainingModelCatalog, TrainingModelUnavailable
from app.domain.models import MediaAssetCreate, ProjectMediaAsset, VoiceGenerateRequest
from app.domain.ports import MediaLibrary, ProjectRepository
from app.domain.training_parameters import resolve_parameters

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "omnivoice_worker.py"


class VoiceGenerationError(RuntimeError):
    """The engine could not produce audio for this request."""


def omnivoice_worker(python: Path, env: dict[str, str] | None = None, idle_seconds: float = 300.0) -> EngineWorkerProcess:
    return EngineWorkerProcess(python, WORKER_SCRIPT, env, label="OmniVoice", idle_seconds=idle_seconds)


class VoiceGenerator:
    """Speaks text with a project voice and files the result in Media Pool."""

    def __init__(
        self,
        projects: ProjectRepository,
        voices: FileProjectVoices,
        media: MediaLibrary,
        worker: EngineWorkerProcess,
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
            reply = self._request(
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

    def _request(self, payload: dict) -> dict:
        try:
            return self.worker.request(payload)
        except EngineWorkerError as exc:
            raise VoiceGenerationError(str(exc)) from exc
