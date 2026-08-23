from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.native_folder_picker import NativeFolderPicker
from app.adapters.legacy_studio_gateway import LegacyStudioGateway
from app.adapters.omnivoice_engine import OmniVoiceEngine
from app.domain.models import (
    EngineStatus,
    FolderPickRequest,
    FolderPickResult,
    HealthStatus,
    MediaImportResult,
    MediaAnnotationUpdate,
    MediaScriptUpdate,
    MediaTrainingSelection,
    ProjectCreate,
    ProjectOpen,
    ProjectMediaAsset,
    ProjectRecord,
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
    training_catalogs = FileTrainingCatalog(projects)
    media_importer = MediaImportProcessor(
        settings.legacy_studio_url, media, settings.ffmpeg_path
    )
    engine = voice_engine or OmniVoiceEngine(settings.omnivoice_root)
    folders = folder_picker or NativeFolderPicker()
    studio = LegacyStudioGateway(settings.legacy_studio_url)
    app = FastAPI(title="Pro4Bro Voice Manipulator", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:18121", "http://localhost:18121"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", response_model=HealthStatus)
    def health() -> HealthStatus:
        return HealthStatus()

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
    ) -> MediaImportResult:
        try:
            project = projects.get(project_id)
            return await media_importer.process(project, file, origin, realtime_text, transcribe)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

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

    @app.get("/api/system/paths", response_model=SystemPaths)
    def system_paths() -> SystemPaths:
        return SystemPaths(default_project_location=str(settings.data_root / "projects"))

    @app.post("/api/system/pick-folder", response_model=FolderPickResult)
    def pick_folder(payload: FolderPickRequest) -> FolderPickResult:
        try:
            return FolderPickResult(path=folders.pick(payload.initial_path))
        except (OSError, RuntimeError, ImportError) as exc:
            raise HTTPException(status_code=503, detail=f"Không mở được trình chọn thư mục: {exc}") from exc

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
