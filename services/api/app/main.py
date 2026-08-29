from __future__ import annotations

import asyncio

from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.adapters.audio_waveform_envelope import AudioWaveformEnvelope
from app.adapters.file_app_preferences import FileAppPreferences
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.legacy_studio_gateway import LegacyStudioGateway
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.native_folder_picker import NativeFolderPicker
from app.adapters.native_media_file_picker import NativeMediaFilePicker
from app.adapters.omnivoice_engine import OmniVoiceEngine
from app.adapters.openai_compatible_transcript_reviewer import OpenAICompatibleTranscriptReviewer
from app.adapters.sequential_transcription_queue import SequentialTranscriptionQueue
from app.adapters.sequential_diarization_queue import SequentialDiarizationQueue
from app.adapters.studio_diarization_gateway import StudioDiarizationGateway
from app.adapters.runtime_status import RuntimeStatus
from app.adapters.subtitle_exporter import SubtitleExporter
from app.domain.models import (
    AppPreferences,
    EngineProfileSchema,
    EngineStatus,
    FolderPickRequest,
    FolderPickResult,
    LocalMediaCacheUpdate,
    LocalMediaImport,
    MediaFilePickRequest,
    MediaFilePickResult,
    MediaDiarizationAssignmentsUpdate,
    MediaDiarizationEnqueue,
    MediaDiarizationProgress,
    HealthStatus,
    MediaAnnotationUpdate,
    MediaImportResult,
    MediaScriptUpdate,
    MediaTranscriptReviewResult,
    MediaTimelineEditsUpdate,
    MediaTrainingSelection,
    MediaTranscriptionEnqueue,
    MediaTranscriptionProgress,
    MediaTranscriptionSelection,
    ProjectCreate,
    ProjectMediaAsset,
    ProjectOpen,
    ProjectRecord,
    SystemLog,
    SystemMetrics,
    SystemPaths,
    TrainingCatalog,
    WorkspacePage,
)
from app.domain.ports import FolderPicker, ProjectRepository, VoiceEngine
from app.settings import Settings


def create_app(
    project_repository: ProjectRepository | None = None,
    voice_engine: VoiceEngine | None = None,
    folder_picker: FolderPicker | None = None,
    settings: Settings | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    projects = project_repository or FileProjectRepository(settings.data_root / "projects")
    media = FileMediaLibrary(projects)
    local_media_sources = LocalMediaSourceRegistry(settings.data_root)
    subtitle_exporter = SubtitleExporter()
    waveform_envelopes = AudioWaveformEnvelope()
    training_catalogs = FileTrainingCatalog(projects)
    runtime_status = RuntimeStatus(settings.data_root)
    media_importer = MediaImportProcessor(
        settings.legacy_studio_url, media, settings.ffmpeg_path
    )
    engine = voice_engine or OmniVoiceEngine(settings.omnivoice_root)
    folders = folder_picker or NativeFolderPicker()
    media_files = NativeMediaFilePicker()
    studio = LegacyStudioGateway(settings.legacy_studio_url)
    preferences = FileAppPreferences(settings.data_root)
    transcript_reviewer = OpenAICompatibleTranscriptReviewer(preferences)
    transcription_queue = SequentialTranscriptionQueue(
        projects,
        media,
        media_importer,
        transcript_reviewer,
    )
    diarization_queue = SequentialDiarizationQueue(
        projects,
        media,
        preferences,
        StudioDiarizationGateway(settings.legacy_studio_url),
    )
    app = FastAPI(title="Pro4Bro Voice Manipulator", version="0.2.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:18121", "http://localhost:18121"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", response_model=HealthStatus)
    def health() -> HealthStatus:
        return HealthStatus(version="0.2.0")

    @app.get("/api/projects", response_model=list[ProjectRecord])
    def list_projects() -> list[ProjectRecord]:
        return projects.list()

    @app.post(
        "/api/projects", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED
    )
    def create_project(payload: ProjectCreate) -> ProjectRecord:
        return projects.create(payload)

    @app.post("/api/projects/open", response_model=ProjectRecord)
    def open_project(payload: ProjectOpen) -> ProjectRecord:
        try:
            return projects.open(payload.path)
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get(
        "/api/projects/{project_id}/media", response_model=list[ProjectMediaAsset]
    )
    def list_project_media(project_id: str) -> list[ProjectMediaAsset]:
        try:
            return media.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get("/api/projects/{project_id}/media/{asset_id}/waveform")
    async def project_media_waveform(
        project_id: str,
        asset_id: str,
        start: float | None = None,
        end: float | None = None,
        points: int | None = None,
    ) -> dict:
        try:
            project = projects.get(project_id)
            audio_path = media.resolve_audio_path(project_id, asset_id)
            cache_path = (
                Path(project.project_path)
                / "cache"
                / "waveforms"
                / f"{asset_id}.json"
            )
            if start is None and end is None and points is None:
                return await asyncio.to_thread(
                    waveform_envelopes.read,
                    audio_path,
                    cache_path,
                )
            if start is None or end is None or points is None:
                raise ValueError("Waveform chi tiết cần start, end và points.")
            return await asyncio.to_thread(
                waveform_envelopes.read_detail,
                audio_path,
                cache_path,
                start,
                end,
                points,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc) or "Invalid waveform range") from exc
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail=str(exc) or "Project waveform not found") from exc
    @app.get("/api/projects/{project_id}/media/{asset_id}/audio")
    def project_media_audio(project_id: str, asset_id: str) -> Response:
        try:
            audio_path = media.resolve_audio_path(project_id, asset_id)
        except (KeyError, ValueError) as exc:
            raise HTTPException(status_code=404, detail="Project audio not found") from exc
        if not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Project audio not found")
        return FileResponse(audio_path, media_type="audio/wav")

    @app.post(
        "/api/projects/{project_id}/media/import",
        response_model=MediaImportResult,
        status_code=status.HTTP_201_CREATED,
    )
    async def import_project_media(
        project_id: str,
        file: UploadFile = File(...),
        origin: str = Form(default="import"),
        realtime_text: str = Form(default=""),
        transcribe: bool = Form(default=True),
        queue_for_transcription: bool = Form(default=False),
    ) -> MediaImportResult:
        try:
            project = projects.get(project_id)
            result = await media_importer.process(
                project,
                file,
                origin,
                realtime_text,
                transcribe,
                queue_for_transcription,
            )
            if queue_for_transcription and result.asset.analysis_path:
                await transcription_queue.enqueue(
                    project_id,
                    [result.asset.id],
                    realtime_text=realtime_text,
                )
                result = result.model_copy(update={"asset": media.get(project_id, result.asset.id)})
            return result
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/media/import-local",
        response_model=MediaImportResult,
        status_code=status.HTTP_201_CREATED,
    )
    async def import_local_project_media(
        project_id: str, payload: LocalMediaImport
    ) -> MediaImportResult:
        try:
            project = projects.get(project_id)
            return await media_importer.process_local_path(
                project,
                payload.source_path,
                cache_local=payload.cache_local,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/local-cache",
        response_model=ProjectMediaAsset,
    )
    async def update_project_media_local_cache(
        project_id: str, asset_id: str, payload: LocalMediaCacheUpdate
    ) -> ProjectMediaAsset:
        try:
            project = projects.get(project_id)
            asset = media.get(project_id, asset_id)
            return await media_importer.set_local_file_cache(project, asset, payload.enabled)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project hoặc media asset không tồn tại") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    @app.get("/api/projects/{project_id}/media/{asset_id}/subtitles")
    def export_project_media_subtitles(
        project_id: str,
        asset_id: str,
        mode: Literal["sentence", "word", "table"] = "sentence",
    ) -> FileResponse:
        try:
            project = projects.get(project_id)
            asset = media.get(project_id, asset_id)
            if mode != "table" and asset.word_timing_quality == "needs-alignment":
                raise ValueError(asset.word_timing_note or "Word timing chưa đáng tin; hãy căn chỉnh trước khi xuất SRT.")
            subtitle_path = subtitle_exporter.export(project, asset, mode, training_catalogs.get(project_id).speakers)
            return FileResponse(
                subtitle_path,
                media_type="text/csv; charset=utf-8" if mode == "table" else "application/x-subrip",
                filename=subtitle_path.name,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project hoặc media asset không tồn tại") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/script",
        response_model=ProjectMediaAsset,
    )
    def update_media_script(
        project_id: str, asset_id: str, payload: MediaScriptUpdate
    ) -> ProjectMediaAsset:
        try:
            return media.update_script(
                project_id, asset_id, payload.text, payload.source, payload.words
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.post(
        "/api/projects/{project_id}/media/{asset_id}/review",
        response_model=MediaTranscriptReviewResult,
    )
    async def review_media_transcript(
        project_id: str, asset_id: str
    ) -> MediaTranscriptReviewResult:
        try:
            asset = media.get(project_id, asset_id)
            if not asset.text.strip():
                raise ValueError("Chưa có transcript STT để AI kiểm tra.")
            outcome = await transcript_reviewer.review(asset.text)
            updated = media.append_ai_review(
                project_id, asset_id, outcome.text, outcome.status, outcome.error
            )
            return MediaTranscriptReviewResult(
                asset=updated,
                reviewed_text=outcome.text,
                status=outcome.status,
                error=outcome.error,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/timeline-edits",
        response_model=ProjectMediaAsset,
    )
    def update_media_timeline_edits(
        project_id: str, asset_id: str, payload: MediaTimelineEditsUpdate
    ) -> ProjectMediaAsset:
        try:
            return media.update_timeline_edits(project_id, asset_id, payload.removed_ranges, payload.gain_keyframes)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/training-selection",
        response_model=ProjectMediaAsset,
    )
    def update_media_training_selection(
        project_id: str, asset_id: str, payload: MediaTrainingSelection
    ) -> ProjectMediaAsset:
        try:
            return media.set_training_selected(project_id, asset_id, payload.selected)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/transcription-selection",
        response_model=ProjectMediaAsset,
    )
    def update_media_transcription_selection(
        project_id: str, asset_id: str, payload: MediaTranscriptionSelection
    ) -> ProjectMediaAsset:
        try:
            return media.set_transcription_selected(project_id, asset_id, payload.selected)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.get(
        "/api/projects/{project_id}/media/transcription-status",
        response_model=list[MediaTranscriptionProgress],
    )
    def list_project_media_transcription_status(
        project_id: str,
    ) -> list[MediaTranscriptionProgress]:
        try:
            return media.transcription_progresses(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
    @app.post(
        "/api/projects/{project_id}/media/transcriptions",
        response_model=list[ProjectMediaAsset],
    )
    async def enqueue_media_transcriptions(
        project_id: str, payload: MediaTranscriptionEnqueue
    ) -> list[ProjectMediaAsset]:
        try:
            queued = await transcription_queue.enqueue(project_id, payload.asset_ids, model=payload.model)
            return [media.get(project_id, asset_id) for asset_id in queued]
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or media asset not found") from exc

    @app.get(
        "/api/projects/{project_id}/media/{asset_id}/diarization-status",
        response_model=MediaDiarizationProgress,
    )
    def get_media_diarization_status(project_id: str, asset_id: str) -> MediaDiarizationProgress:
        try:
            asset = media.get(project_id, asset_id)
            return MediaDiarizationProgress(
                id=asset.id,
                diarization_status=asset.diarization_status,
                diarization_progress=asset.diarization_progress,
                diarization_error=asset.diarization_error,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.post(
        "/api/projects/{project_id}/media/{asset_id}/diarization",
        response_model=ProjectMediaAsset,
    )
    async def enqueue_media_diarization(project_id: str, asset_id: str, payload: MediaDiarizationEnqueue | None = None) -> ProjectMediaAsset:
        try:
            await diarization_queue.enqueue(project_id, asset_id, payload.expected_speakers if payload else None)
            return media.get(project_id, asset_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/diarization-assignments",
        response_model=ProjectMediaAsset,
    )
    def update_media_diarization_assignments(
        project_id: str,
        asset_id: str,
        payload: MediaDiarizationAssignmentsUpdate,
    ) -> ProjectMediaAsset:
        try:
            catalog = training_catalogs.get(project_id)
            profile_ids = {speaker.id for speaker in catalog.speakers}
            unknown = sorted({profile_id for profile_id in payload.assignments.values() if profile_id and profile_id not in profile_ids})
            if unknown:
                raise ValueError("Mapping Speaker Diarization chứa Speaker Profile không tồn tại.")
            return media.update_diarization_assignments(project_id, asset_id, payload.assignments)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset hoặc project không tồn tại") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.delete(
        "/api/projects/{project_id}/media/{asset_id}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def remove_project_media(project_id: str, asset_id: str) -> Response:
        try:
            media.remove(project_id, asset_id)
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/annotations",
        response_model=ProjectMediaAsset,
    )
    def update_media_annotations(
        project_id: str, asset_id: str, payload: MediaAnnotationUpdate
    ) -> ProjectMediaAsset:
        try:
            return media.update_annotations(
                project_id,
                asset_id,
                payload.speaker_profile_ids,
                payload.environment_profile_ids,
                payload.emotion,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.get(
        "/api/projects/{project_id}/training-catalog", response_model=TrainingCatalog
    )
    def get_training_catalog(project_id: str) -> TrainingCatalog:
        try:
            return training_catalogs.get(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.put(
        "/api/projects/{project_id}/training-catalog", response_model=TrainingCatalog
    )
    def save_training_catalog(
        project_id: str, payload: TrainingCatalog
    ) -> TrainingCatalog:
        try:
            return training_catalogs.save(project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}", response_model=ProjectRecord)
    def get_project(project_id: str) -> ProjectRecord:
        try:
            return projects.get(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.patch("/api/projects/{project_id}/last-page", response_model=ProjectRecord)
    def set_last_page(project_id: str, page: WorkspacePage) -> ProjectRecord:
        try:
            return projects.set_last_page(project_id, page)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get("/api/engines/omnivoice", response_model=EngineStatus)
    def omnivoice_status() -> EngineStatus:
        return engine.status()

    @app.get("/api/engines/omnivoice/profile-schema", response_model=EngineProfileSchema)
    def omnivoice_profile_schema() -> EngineProfileSchema:
        return engine.profile_schema()

    @app.get("/api/preferences", response_model=AppPreferences)
    def get_preferences() -> AppPreferences:
        return preferences.get()

    @app.put("/api/preferences", response_model=AppPreferences)
    def save_preferences(payload: AppPreferences) -> AppPreferences:
        return preferences.save(payload)

    @app.get("/api/system/status", response_model=SystemMetrics)
    def system_status() -> SystemMetrics:
        return runtime_status.snapshot()

    @app.get("/api/system/logs", response_model=SystemLog)
    def system_logs(lines: int = 240) -> SystemLog:
        return runtime_status.logs(lines=max(20, min(1000, lines)))

    @app.get("/api/system/paths", response_model=SystemPaths)
    def system_paths() -> SystemPaths:
        return SystemPaths(default_project_location=str(settings.data_root / "projects"))

    @app.post("/api/system/pick-folder", response_model=FolderPickResult)
    def pick_folder(payload: FolderPickRequest) -> FolderPickResult:
        try:
            return FolderPickResult(path=folders.pick(payload.initial_path))
        except (OSError, RuntimeError, ImportError) as exc:
            raise HTTPException(
                status_code=503, detail=f"Không mở được trình chọn thư mục: {exc}"
            ) from exc

    @app.post("/api/system/pick-media-file", response_model=MediaFilePickResult)
    def pick_media_file(payload: MediaFilePickRequest) -> MediaFilePickResult:
        try:
            return MediaFilePickResult(path=media_files.pick(payload.initial_path))
        except (OSError, RuntimeError, ImportError) as exc:
            raise HTTPException(
                status_code=503, detail=f"Không mở được trình chọn media: {exc}"
            ) from exc
    @app.api_route(
        "/api/studio/{studio_path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
    )
    async def studio_proxy(studio_path: str, request: Request) -> Response:
        return await studio.proxy(studio_path, request)

    if settings.web_dist.is_dir():
        assets = settings.web_dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def frontend(full_path: str) -> Response:
            candidate = (settings.web_dist / full_path).resolve()
            if settings.web_dist.resolve() in candidate.parents and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(settings.web_dist / "index.html")

    return app


app = create_app()
