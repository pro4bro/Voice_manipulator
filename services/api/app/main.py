from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Literal
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.adapters import activity_center
from app.adapters.audio_waveform_envelope import AudioWaveformEnvelope
from app.adapters.file_app_preferences import FileAppPreferences
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_growing_mkv_follower import FileGrowingMkvFollower
from app.adapters.growing_mkv_transcription import GrowingMkvTranscription
from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt, _available_frames
from app.adapters.obs_livelink_outbox import ObsLiveLinkOutbox
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_reading_packs import FileReadingPacks, ReadingPackError
from app.adapters.file_reading_sessions import FileReadingSessions
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.file_asr_adapters import FileAsrAdapters
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_voice_collections import FileVoiceCollections
from app.adapters.voice_collection_transfer_routes import make_voice_collection_transfer_router
from app.adapters.collection_voice_preview import CollectionVoicePreviews, make_collection_preview_router
from app.adapters.file_voice_model_sets import FileVoiceModelSets
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_edits import FileVoiceEdits
from app.adapters.voice_edit_routes import make_voice_edit_router
from app.adapters.voice_delivery_routes import make_voice_delivery_router
from app.adapters.voice_render_routes import make_voice_render_router
from app.adapters.reference_schedule_routes import make_reference_schedule_router
from app.adapters.file_reference_schedules import FileReferenceSchedules
from app.adapters.voice_fix import VoiceFixService
from app.adapters.voice_fix_routes import make_voice_fix_router
from app.adapters.voice_fix_apply import VoiceFixApply
from app.adapters.voice_fix_apply_routes import make_voice_fix_apply_router
from app.adapters.file_voice_patch import FileVoicePatch
from app.adapters.voice_patch_routes import make_voice_patch_router
from app.adapters.voice_patch_processor import VoicePatchProcessor
from app.adapters.voice_patch_job_routes import make_voice_patch_job_router
from app.adapters.context_patch_source import FileContextPatchSource
from app.adapters.context_patch_source_routes import make_context_patch_source_router
from app.adapters.context_patch_processor import ContextVoicePatchProcessor
from app.adapters.hybrid_patch_processor import HybridVoicePatchProcessor
from app.adapters.trained_media_patch_processor import TrainedMediaPatchProcessor
from app.adapters.voice_patch_history_routes import make_voice_patch_history_router
from app.adapters.voice_patch_audition import VoicePatchAudition
from app.adapters.voice_patch_audition_routes import make_voice_patch_audition_router
from app.adapters.voice_patch_reviews import VoicePatchReviews
from app.adapters.voice_patch_review_routes import make_voice_patch_review_router
from app.adapters.output_timing_repair import OutputTimingRepair
from app.adapters.output_timing_repair_routes import make_output_timing_repair_router
from app.adapters.output_word_review import OutputWordReview
from app.adapters.output_word_review_routes import make_output_word_review_router
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.adapters.file_reference_bindings import FileReferenceBindings
from app.adapters.reference_resolver import ReferenceResolver
from app.adapters.file_timing_plans import FileTimingPlans
from app.domain.timing_plan import TimingPlanRequest
from app.domain.reference_bindings import ReferenceAssignment, ReferenceBindingDocument
from app.domain.voice_script_document import VoiceScriptDocument
from app.domain.models import MediaReferenceSelection
from app.adapters.speaker_embedders import default_speaker_embedders
from app.adapters.speaker_similarity_gate import SpeakerSimilarityGate
from app.adapters.gpu_lease import GpuBusy, GpuLease
from app.adapters.project_dataset_compiler import DatasetCompilationError, ProjectDatasetCompiler
from app.adapters.reading_audience import audience_vocabulary
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.legacy_studio_gateway import LegacyStudioGateway
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.obs_capture_sessions import FileObsCaptureSessions
from app.adapters.obs_live_sessions import FileObsLiveSessions, ObsLiveConflict
from app.adapters.obs_live_transcription import ObsLiveTranscriber
from app.adapters.obs_livelink_transcription import ObsLiveLinkTranscription
from app.adapters.obs_plugin_installation import ObsPluginInstallation, ObsPluginInstallError
from app.adapters.obs_livelink_connection import ObsLiveLinkConnection, LiveLinkError
from app.adapters.obs_livelink_runtime import ObsLiveLinkRuntime
from app.adapters.obs_livelink_deletions import deleted_recording_ids
from app.adapters.obs_recording_management import make_obs_recording_management_router
from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio, MAX_CHUNK_BYTES
from app.adapters.obs_session_subtitles import ObsSessionSubtitles
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.native_folder_picker import NativeFolderPicker
from app.adapters.native_media_file_picker import NativeMediaFilePicker
from app.adapters.omnivoice_dataset_export import OmniVoiceDatasetExporter
from app.adapters.omnivoice_engine import OmniVoiceEngine
from app.adapters.rvc_training import RvcPaths
from app.adapters.voice_changer import FileChangerRecordings, VoiceChanger, VoiceChangerError, VoiceChangerRuntime, VoiceConsentRequired
from app.adapters.voice_script_speaker import StudioWordRecognizer, VoiceScriptBusy, VoiceScriptSpeaker
from app.adapters.omnivoice_generator import (
    VibeVoiceSpeech,
    VoiceGenerationCancelled,
    VoiceGenerationError,
    VoiceGenerator,
    omnivoice_worker,
    vibevoice_worker,
)
from app.adapters.vibevoice_training import ASR_PACKAGES, TTS_PACKAGES, VibeVoicePaths, VibeVoiceRuntime
from app.adapters.openai_compatible_transcript_reviewer import OpenAICompatibleTranscriptReviewer
from app.adapters.sequential_transcription_queue import SequentialTranscriptionQueue
from app.adapters.sequential_diarization_queue import SequentialDiarizationQueue
from app.adapters.studio_diarization_gateway import StudioDiarizationGateway
from app.adapters.processing_cancellation import ProcessingStopError
from app.adapters.runtime_status import RuntimeStatus
from app.adapters.training_runtime import TrainingRuntime
from app.adapters.training_model_catalog import (
    FileTrainingModelCatalog,
    TrainingModelUnavailable,
)
from app.adapters.training_runner import RunHasOutputs, TrainingBusyError, TrainingNotReady, TrainingRunner
from app.adapters.vibevoice_asr_transcriber import VibeVoiceAsrTranscriber
from app.adapters.subtitle_exporter import SubtitleExporter
from app.adapters.desktop_reveal import reveal
from app.domain.models import (
    ActivitySnapshot,
    AppPreferences,
    DatasetManifest,
    DatasetReadiness,
    GpuLeaseHolder,
    EngineProfileSchema,
    EngineStatus,
    FolderPickRequest,
    FolderPickResult,
    LocalMediaCacheUpdate,
    LocalMediaImport,
    LocalMediaInspect,
    GrowingMkvFollowCreate,
    GrowingMkvDetailedSttStart,
    MediaFilePickRequest,
    MediaFilePickResult,
    MediaFilesPickResult,
    MediaDiarizationAssignmentsUpdate,
    MediaDiarizationEnqueue,
    MediaDiarizationSelection,
    MediaDiarizationProgress,
    HealthStatus,
    MediaAnnotationUpdate,
    MediaImportResult,
    MediaImportSelection,
    ObsCaptureSession,
    ObsLiveLinkVideoImport,
    ObsRecordingInspect,
    ObsRecordingInspection,
    ObsLiveEvent,
    ObsLiveOpen,
    ObsLiveSession,
    ObsSessionCreate,
    MediaScriptUpdate,
    MediaTranscriptReviewResult,
    MediaTimelineEditsUpdate,
    MediaTimelineCutsBatch,
    MediaTrainingSelection,
    MediaTranscriptionControl,
    MediaTranscriptionEnqueue,
    MediaTranscriptionProgress,
    MediaTranscriptionSelection,
    TaskStopRequest,
    ProjectCreate,
    ProjectMediaAsset,
    ProjectAsrAdapter,
    ProjectVoice,
    SpeakerEmbedderInfo,
    VoiceModelSet,
    VoiceModelSetGateRequest,
    VoiceGenerateRequest,
    VoiceOutput,
    VoiceScriptJob,
    VoiceScriptRequest,
    VoiceChangerPreflight,
    VoiceChangerRecording,
    VoiceChangerStartRequest,
    VoiceChangerStatus,
    ProjectOpen,
    ProjectRecord,
    ReadingAudienceVocabulary,
    ReadingPack,
    ReadingPackSummary,
    ReadingSession,
    ReadingSessionCreate,
    ReadingSessionEnd,
    ReadingSessionPage,
    ReadingSessionSkip,
    ReadingSessionTakeResult,
    ReadingCaptureIntent,
    ReadingTake,
    ReadingPassageDraft,
    SystemLog,
    TrainingProgressLine,
    TrainingRuntimeReport,
    TrainingModelOption,
    TrainingRun,
    TrainingRunFootprint,
    TrainingRunLog,
    TrainingRunStart,
    SystemMetrics,
    SystemPaths,
    TrainingCatalog,
    ConsentEvidence,
    VoiceCollection,
    VoiceCollectionCreate,
    VoiceCollectionEntry,
    VoiceCollectionEntryCreate,
    VoiceCollectionImport,
    VoiceCollectionImportResult,
    WorkspacePage,
)
from app.domain.media_organization import MediaPoolOrganization
from app.domain.ports import FolderPicker, ProjectRepository, SpeakerEmbedder, VoiceEngine
from app.settings import Settings
from app.runtime_layout import python_executable
from app.domain.obs_livelink_state import ObsTriggerPolicy
from pydantic import BaseModel


class ObsPluginActionRequest(BaseModel):
    action: Literal["install", "repair", "remove", "open-obs", "reset-pairing"]
    obsRoot: str | None = None
    removePairing: bool = False


class ObsLiveLinkHello(BaseModel):
    outbox: dict | None = None
    installId: str
    processInstanceId: str
    pluginVersion: str
    obsVersion: str
    protocolMin: int
    protocolMax: int
    recordingActive: bool = False
    recordingPaused: bool = False
    sceneCollection: str | None = None
    channels: list[dict] | None = None


class ObsLiveLinkHeartbeat(BaseModel):
    outbox: dict | None = None
    installId: str
    connectionId: str
    connectionEpoch: str
    recordingActive: bool = False
    recordingPaused: bool = False
    sceneCollection: str | None = None
    channels: list[dict] | None = None


class ObsLiveLinkForward(BaseModel):
    enabled: bool


class ObsLiveLinkAck(BaseModel):
    installId: str
    connectionId: str
    connectionEpoch: str
    commandId: str
    revision: int
    appliedState: bool | str | None = None
    appliedMonotonicNs: int
    sampleIndex: int | None = None
    error: str | None = None


class ObsLiveLinkLease(BaseModel):
    projectId: str
    ownerId: str


class ObsLiveLinkRelease(BaseModel):
    ownerId: str


class ObsLiveLinkAction(BaseModel):
    action: Literal["start", "pause", "resume", "stop"]


class ObsLiveLinkDetailedSttStart(BaseModel):
    segmentSeconds: int = 60
    channelIds: list[str] | None = None
    model: str = "large-v3"


def create_app(
    project_repository: ProjectRepository | None = None,
    voice_engine: VoiceEngine | None = None,
    folder_picker: FolderPicker | None = None,
    settings: Settings | None = None,
    speaker_embedders: dict[str, SpeakerEmbedder] | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    projects = project_repository or FileProjectRepository(settings.data_root / "projects")
    media = FileMediaLibrary(projects)
    local_media_sources = LocalMediaSourceRegistry(settings.data_root)
    subtitle_exporter = SubtitleExporter()
    waveform_envelopes = AudioWaveformEnvelope()
    training_catalogs = FileTrainingCatalog(projects)
    dataset_compiler = ProjectDatasetCompiler(projects, media, training_catalogs)
    training_runs = FileTrainingRuns(projects)
    training_runtime = TrainingRuntime(
        settings.training_runtime_root,
        settings.training_wheel_cache,
        settings.omnivoice_root,
    )
    vibevoice_python = python_executable(settings.vibevoice_runtime_root)
    vibevoice_paths = VibeVoicePaths(settings.vibevoice_root, runtime_python=vibevoice_python) if settings.vibevoice_root else None
    vibevoice_runtime = VibeVoiceRuntime(vibevoice_paths) if vibevoice_paths else None
    asr_adapters = FileAsrAdapters(projects)
    engine_roots = {
        "omnivoice": settings.omnivoice_root,
        "vibevoice": settings.vibevoice_root,
        "vibevoice-models": vibevoice_paths.models if vibevoice_paths else None,
        "hub": settings.model_hub_cache,
        "research": settings.research_engines_root,
    }
    rvc_paths = RvcPaths(settings.applio_root, settings.rvc_runtime_root)

    def rvc_readiness(descriptor) -> str | None:
        missing = rvc_paths.missing()
        return ("RVC còn thiếu: " + ", ".join(missing) + ".") if missing else None

    def vibevoice_readiness(descriptor) -> str | None:
        """Why the VibeVoice Python cannot run this option yet, or None."""
        if vibevoice_paths is None or vibevoice_runtime is None:
            return "Chưa cấu hình thư mục VibeVoice."
        if descriptor.mode == "zero-shot-clone":
            return None
        if descriptor.mode == "tts-lora":
            missing = vibevoice_runtime.missing(TTS_PACKAGES, vibevoice_paths.community)
        elif descriptor.mode == "asr-lora":
            missing = vibevoice_runtime.missing(ASR_PACKAGES, vibevoice_paths.microsoft)
        else:
            missing = vibevoice_runtime.missing(("diffusers", "transformers"), vibevoice_paths.community)
        return f"Python của VibeVoice còn thiếu: {', '.join(missing)}." if missing else None

    training_models = FileTrainingModelCatalog(
        settings.training_models_root,
        engine_roots,
        settings.local_training_models_root,
        readiness={"vibevoice": vibevoice_readiness, "rvc": rvc_readiness},
    )
    activity_center.install()
    studio_logs = [settings.data_root / "logs" / name for name in ("omnivoice-studio.out.log", "omnivoice-studio.err.log")]
    if any(path.is_file() for path in studio_logs):
        # The sidecar is its own process; this is how its model loading and
        # recognition lines reach the app's log.
        activity_center.LogFileTail(studio_logs).start()
    gpu_lease = GpuLease(settings.data_root / "runtime" / "gpu-lease.json")
    engine_env = (
        {
            "HF_HUB_CACHE": str(settings.model_hub_cache),
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
        }
        if settings.model_hub_cache
        else {}
    )
    project_voices = FileProjectVoices(projects, OmniVoiceDatasetExporter(settings.ffmpeg_path)._slice)
    voice_model_sets = FileVoiceModelSets(projects)
    voice_collections = FileVoiceCollections(
        settings.data_root, projects, project_voices, training_catalogs, voice_model_sets, training_runs,
    )
    voice_generators = FileTrainingModelCatalog(
        settings.voice_generators_root,
        engine_roots,
        settings.local_voice_generators_root,
        readiness={"vibevoice": vibevoice_readiness},
    )
    generation_worker = omnivoice_worker(training_runtime.python, engine_env)
    vibevoice_speech_worker = vibevoice_worker(vibevoice_paths) if vibevoice_paths else None

    def free_gpu() -> None:
        """Stop every warm speech worker before something needs the whole GPU."""
        generation_worker.shutdown()
        if vibevoice_speech_worker is not None:
            vibevoice_speech_worker.shutdown()
        # Studio owns warm inference children. Release only idle children; a
        # running recognizer must not lose its model to a training request.
        try:
            with httpx.Client(timeout=httpx.Timeout(3.0, connect=0.5), trust_env=False) as client:
                response = client.post(f"{settings.legacy_studio_url.rstrip('/')}/api/runtime/release")
            if response.status_code == 409:
                raise GpuBusy(gpu_lease.holder() or GpuLeaseHolder(
                    token="studio-inference", label="Studio STT / Speaker Diarization", pid=os.getpid(),
                ))
            if response.status_code != 404:
                response.raise_for_status()
        except httpx.ConnectError:
            # An offline Studio holds no warm models.
            pass

    voice_outputs = FileVoiceOutputs(projects)
    voice_script_documents = FileVoiceScript(projects)
    voice_edits = FileVoiceEdits(voice_outputs, voice_script_documents)
    reference_bindings = FileReferenceBindings(projects, media, voice_outputs, voice_script_documents)
    reference_resolver = ReferenceResolver(reference_bindings, settings.ffmpeg_path)
    timing_plans = FileTimingPlans(reference_resolver)
    resolved_speaker_embedders = speaker_embedders or default_speaker_embedders(settings.project_root)
    speaker_similarity_gate = SpeakerSimilarityGate(
        projects,
        project_voices,
        voice_outputs,
        voice_model_sets,
        resolved_speaker_embedders,
        gpu_lease,
    )
    voice_generator = VoiceGenerator(
        projects,
        project_voices,
        voice_outputs,
        generation_worker,
        gpu_lease,
        voice_generators,
        engines={
            "vibevoice": VibeVoiceSpeech(vibevoice_speech_worker, vibevoice_paths, settings.data_root / "runtime" / "vibevoice-processors")
        }
        if vibevoice_paths and vibevoice_speech_worker
        else None,
    )
    voice_script_speaker = VoiceScriptSpeaker(
        projects,
        voice_outputs,
        voice_generator,
        gpu_lease,
        recognizer=StudioWordRecognizer(settings.legacy_studio_url),
        ffmpeg_path=settings.ffmpeg_path,
        scripts=voice_script_documents, timing_plans=timing_plans,
    )
    reference_schedules = FileReferenceSchedules(reference_bindings, voice_script_documents)
    voice_fixes = VoiceFixService(voice_script_speaker, voice_edits, reference_bindings, reference_schedules)
    voice_patch_source = FileVoicePatch(voice_edits)
    voice_patch_processor = VoicePatchProcessor(voice_patch_source, voice_script_speaker, reference_bindings, reference_schedules)
    context_patch_source = FileContextPatchSource(media, voice_script_documents, projects)
    context_patch_processor = ContextVoicePatchProcessor(context_patch_source, voice_script_speaker, reference_bindings, reference_schedules)
    hybrid_patch_processor = HybridVoicePatchProcessor(context_patch_source, voice_script_speaker, reference_bindings, reference_schedules)
    trained_media_patch_processor = TrainedMediaPatchProcessor(context_patch_source, voice_script_speaker, reference_bindings, reference_schedules)
    output_timing_repair = OutputTimingRepair(projects, voice_outputs, StudioWordRecognizer(settings.legacy_studio_url), gpu_lease)
    voice_changer_engines = FileTrainingModelCatalog(
        settings.voice_changers_root,
        {"pro4bro": Path(__file__).resolve().parent.parent, "research": settings.research_engines_root},
        readiness={"rvc": rvc_readiness},
    )
    changer_recordings = FileChangerRecordings(projects)
    voice_changer = VoiceChanger(
        projects,
        VoiceChangerRuntime(settings.voice_changer_runtime_root),
        voice_changer_engines,
        project_voices,
        changer_recordings,
        gpu_lease,
        before_gpu_work=free_gpu,
        catalogs=training_catalogs,
        engine_runtimes={"rvc": (VoiceChangerRuntime(settings.rvc_runtime_root), {"PRO4BRO_APPLIO_ROOT": str(settings.applio_root), **rvc_paths.environment()})},
    )
    training_runner = TrainingRunner(
        projects,
        dataset_compiler,
        training_catalogs,
        training_runs,
        training_runtime,
        gpu_lease,
        settings.omnivoice_root,
        settings.ffmpeg_path,
        voices=project_voices,
        model_sets=voice_model_sets,
        engine_env=engine_env,
        before_gpu_work=free_gpu,
        vibevoice_paths=vibevoice_paths,
        vibevoice_runtime=vibevoice_runtime,
        asr_adapters=asr_adapters,
        rvc_paths=rvc_paths,
    )
    reading_packs = FileReadingPacks(
        settings.reading_packs_root, settings.authored_reading_packs_root
    )
    reading_sessions = FileReadingSessions(projects)
    reading_session_locks: dict[str, asyncio.Lock] = {}
    runtime_status = RuntimeStatus(settings.data_root)
    vibevoice_asr = VibeVoiceAsrTranscriber(settings.vibevoice_root, gpu_lease, before_gpu_work=free_gpu, python=vibevoice_python)

    def vibevoice_stt(path: Path, duration: float, variant: str | None = None, project_id: str | None = None, *, cancellation_id: str | None = None) -> dict:
        adapter = asr_adapters.weights(project_id, variant) if variant and project_id else None
        return vibevoice_asr.transcribe(path, duration, adapter=adapter, cancellation_id=cancellation_id)

    vibevoice_stt.register_request = vibevoice_asr.register_request
    vibevoice_stt.cancel_request = vibevoice_asr.cancel_request
    vibevoice_stt.abandon_request = vibevoice_asr.abandon_request

    stt_engines = FileTrainingModelCatalog(
        settings.stt_engines_root,
        {
            "studio": settings.stt_studio_root,
            "vibevoice": settings.vibevoice_root,
        },
    )
    media_importer = MediaImportProcessor(
        settings.legacy_studio_url,
        media,
        settings.ffmpeg_path,
        local_sources=local_media_sources,
        other_stt={"vibevoice-asr": vibevoice_stt},
    )
    growing_mkv = FileGrowingMkvFollower(
        media, local_media_sources, media_importer.ffmpeg_path, media_importer.ffprobe_path
    )
    growing_mkv_stt = GrowingMkvTranscription(media, media_importer)
    obs_sessions = FileObsCaptureSessions(
        projects, media, media_importer.ffmpeg_path, media_importer.ffprobe_path
    )
    obs_session_subtitles = ObsSessionSubtitles(
        media, media_importer.ffmpeg_path, media_importer.ffprobe_path
    )
    obs_live = FileObsLiveSessions(projects, media, settings.data_root, media_importer.ffmpeg_path)
    engine = voice_engine or OmniVoiceEngine(settings.omnivoice_root)
    folders = folder_picker or NativeFolderPicker()
    media_files = NativeMediaFilePicker()
    studio = LegacyStudioGateway(settings.legacy_studio_url)
    preferences = FileAppPreferences(settings.data_root)
    obs_plugin_installation = ObsPluginInstallation(settings.project_root, settings.data_root)
    obs_livelink_connection = ObsLiveLinkConnection(obs_plugin_installation.user_config)
    obs_livelink_runtime = ObsLiveLinkRuntime(obs_livelink_connection, projects, settings.data_root)
    obs_livelink_audio = FileObsLiveLinkAudio(
        obs_livelink_connection, obs_livelink_runtime, projects, media,
        media_importer.ffmpeg_path, media_importer.ffprobe_path,
    )
    transcript_reviewer = OpenAICompatibleTranscriptReviewer(preferences)
    transcription_queue = SequentialTranscriptionQueue(
        projects,
        media,
        media_importer,
        transcript_reviewer,
    )
    obs_live_stt = ObsLiveTranscriber(
        obs_live, settings.legacy_studio_url, transcription_queue.status_any_running,
    )
    obs_livelink_stt = ObsLiveLinkTranscription(
        projects, settings.legacy_studio_url, transcription_queue.status_any_running,
    )
    obs_livelink_detailed_stt = ObsLiveLinkDetailedStt(media, media_importer)
    diarization_queue = SequentialDiarizationQueue(
        projects,
        media,
        preferences,
        StudioDiarizationGateway(settings.legacy_studio_url),
    )
    mkv_watchers: dict[tuple[str, str], asyncio.Task[None]] = {}
    mkv_watch_errors: dict[tuple[str, str], str] = {}
    mkv_stt_workers: dict[tuple[str, str], asyncio.Task[None]] = {}
    mkv_stt_errors: dict[tuple[str, str], str] = {}
    obs_finalizers: dict[str, asyncio.Task[dict]] = {}
    obs_detailed_workers: dict[tuple[str, str], asyncio.Task[None]] = {}
    obs_detailed_errors: dict[tuple[str, str], str] = {}

    async def transcribe_obs_detail(project_id: str, recording_id: str) -> None:
        key = (project_id, recording_id)
        while True:
            try:
                project = await asyncio.to_thread(projects.get, project_id)
                progress = await obs_livelink_detailed_stt.process_once(project, recording_id)
                obs_detailed_errors.pop(key, None)
                if progress["done"]:
                    return
                await asyncio.sleep(0.75)
            except asyncio.CancelledError:
                raise
            except ValueError as exc:
                obs_detailed_errors[key] = str(exc)
                logging.getLogger(__name__).error("OBS detailed STT stopped for %s: %s", recording_id, exc)
                return
            except Exception as exc:
                obs_detailed_errors[key] = str(exc)
                logging.getLogger(__name__).exception("OBS detailed STT retry for %s", recording_id)
                await asyncio.sleep(5)

    def ensure_obs_detail_worker(project_id: str, recording_id: str) -> None:
        key = (project_id, recording_id)
        existing = obs_detailed_workers.get(key)
        if existing is None or existing.done():
            obs_detailed_workers[key] = asyncio.create_task(transcribe_obs_detail(project_id, recording_id))

    async def watch_growing_mkv(project_id: str, asset_id: str) -> None:
        key = (project_id, asset_id)
        while True:
            try:
                # Argument evaluation happens before to_thread: resolve the
                # project separately so a repository lock cannot stall startup.
                project = await asyncio.to_thread(projects.get, project_id)
                result = await asyncio.to_thread(growing_mkv.poll, project, asset_id,
                                                 max_clusters=8)
            except (FileNotFoundError, KeyError, ValueError, RuntimeError, OSError) as exc:
                mkv_watch_errors[key] = str(exc)
                logging.getLogger(__name__).warning("Growing MKV follow stopped for %s: %s", asset_id, exc)
                return
            mkv_watch_errors.pop(key, None)
            if result["finished"]:
                return
            await asyncio.sleep(0.75)

    def ensure_mkv_watcher(project_id: str, asset_id: str) -> None:
        key = (project_id, asset_id)
        existing = mkv_watchers.get(key)
        if existing is None or existing.done():
            mkv_watchers[key] = asyncio.create_task(watch_growing_mkv(project_id, asset_id))

    async def transcribe_growing_mkv(project_id: str, asset_id: str) -> None:
        key = (project_id, asset_id)
        while True:
            try:
                project = await asyncio.to_thread(projects.get, project_id)
                progress = await growing_mkv_stt.process_once(project, asset_id, wait_for_detail=False)
                mkv_stt_errors.pop(key, None)
                if progress["done"]:
                    return
                await asyncio.sleep(0.75)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                mkv_stt_errors[key] = str(exc)
                logging.getLogger(__name__).exception("Growing MKV STT retry for %s", asset_id)
                await asyncio.sleep(5)

    def ensure_mkv_stt_worker(project_id: str, asset_id: str) -> None:
        key = (project_id, asset_id)
        existing = mkv_stt_workers.get(key)
        if existing is None or existing.done():
            mkv_stt_workers[key] = asyncio.create_task(transcribe_growing_mkv(project_id, asset_id))

    def discover_project_processing(project):
        """Read validated durable checkpoints without blocking the API event loop."""
        media_root = Path(project.project_path) / "assets" / "media"
        resumable_asset_ids: set[str] = set()
        mkv_watch_ids: list[str] = []
        mkv_stt_ids: list[str] = []
        detailed_ids: list[str] = []

        for checkpoint in media_root.glob("asset-*/follow-state.json"):
            parent_id = checkpoint.parent.name
            try:
                follow = json.loads(checkpoint.read_text(encoding="utf-8"))
                if follow.get("parentId") != parent_id:
                    continue
                # A stale checkpoint is not ownership. The manifest flag is
                # written by the growing-MKV workflow and gates its resumer.
                parent = media.get(project.id, parent_id)
                if (
                    not parent.growing_mkv_follow
                    or parent.deleted_at is not None
                    or parent.disabled
                ):
                    continue
                stt_path = checkpoint.parent / "stt-state.json"
                if stt_path.is_file():
                    stt_state = json.loads(stt_path.read_text(encoding="utf-8"))
                    if (stt_state.get("parentId") != parent_id or stt_state.get("version") != 1
                            or not isinstance(stt_state.get("tracks", {}), dict)):
                        continue
                else:
                    stt_state = {"tracks": {}}
                follow_tracks = follow.get("tracks", [])
                if not isinstance(follow_tracks, list):
                    continue
                if not follow.get("finished"):
                    mkv_watch_ids.append(parent_id)
                has_selected_track = False
                for track in follow_tracks:
                    if not isinstance(track, dict):
                        continue
                    asset_id = track.get("assetId")
                    if not isinstance(asset_id, str) or not asset_id:
                        continue
                    asset = media.get(project.id, asset_id)
                    progress = stt_state.get("tracks", {}).get(asset_id, {})
                    if (
                        not asset.transcription_selected
                        or not asset.import_selected
                        or asset.deleted_at is not None
                        or asset.disabled
                        or progress.get("stopMode") == "all"
                    ):
                        continue
                    has_selected_track = True
                    if asset.transcription_status not in {"queued", "processing", "reviewing"}:
                        continue
                    if not follow.get("finished"):
                        resumable_asset_ids.add(asset_id)
                        continue
                    total = int(track.get("finalFrames", track.get("frames", 0)) or 0)
                    cursor = int(progress.get("finalFrame", 0) or 0)
                    published = int(progress.get("publishedFinalFrame", -1))
                    if cursor < total or published != cursor:
                        resumable_asset_ids.add(asset_id)
                if has_selected_track:
                    mkv_stt_ids.append(parent_id)
            except (OSError, ValueError, TypeError, KeyError, AttributeError):
                continue

        for checkpoint in (Path(project.project_path) / "assets" / "obs-livelink").glob(
            "*/detailed-stt-state.json"
        ):
            recording_id = checkpoint.parent.name
            try:
                progress = obs_livelink_detailed_stt.status(project, recording_id)
                if not progress["tracks"]:
                    continue
                journal = json.loads((checkpoint.parent / "recording.json").read_text(encoding="utf-8"))
                recording = journal["recording"]
                stem_by_channel = {
                    stem["channelId"]: stem.get("assetId")
                    for stem in journal.get("sourceStems", [])
                }
                needs_work = recording.get("status") != "stopped" or recording.get("archiveStatus") != "ready"
                has_eligible_track = False
                for channel_id, track_progress in progress["tracks"].items():
                    asset_id = stem_by_channel.get(channel_id)
                    if not asset_id or track_progress.get("stopMode") == "all":
                        continue
                    asset = media.get(project.id, asset_id)
                    if asset.deleted_at is not None or asset.disabled:
                        continue
                    has_eligible_track = True
                    if asset.transcription_status not in {"queued", "processing", "reviewing"}:
                        continue
                    if needs_work:
                        resumable_asset_ids.add(asset_id)
                        continue
                    chunks = obs_livelink_detailed_stt._read_chunks(checkpoint.parent, channel_id)
                    total = _available_frames(recording, chunks)
                    cursor = int(track_progress.get("cursor", 0) or 0)
                    published = int(track_progress.get("publishedCursor", -1))
                    if (
                        cursor < total
                        or published != cursor
                        or not track_progress.get("publishedAsset")
                    ):
                        resumable_asset_ids.add(asset_id)
                if has_eligible_track:
                    detailed_ids.append(recording_id)
            except (OSError, ValueError, TypeError, KeyError, AttributeError):
                continue

        return resumable_asset_ids, mkv_watch_ids, mkv_stt_ids, detailed_ids

    async def restore_project_processing(project) -> set[str]:
        """Resume validated durable STT checkpoints and release other queue flags."""
        (resumable_asset_ids, mkv_watch_ids, mkv_stt_ids,
         detailed_ids) = await asyncio.to_thread(discover_project_processing, project)

        # Reconcile before starting workers so a checkpoint-owned asset cannot
        # race startup recovery. Diarization has no checkpoint resumer.
        await transcription_queue.recover_interrupted(
            project.id, resume_owned_asset_ids=resumable_asset_ids,
        )
        await diarization_queue.recover_interrupted(project.id)
        for parent_id in mkv_watch_ids:
            ensure_mkv_watcher(project.id, parent_id)
        for parent_id in mkv_stt_ids:
            ensure_mkv_stt_worker(project.id, parent_id)
        for recording_id in detailed_ids:
            ensure_obs_detail_worker(project.id, recording_id)
        return resumable_asset_ids

    async def resume_mkv_watchers() -> None:
        recovery_log = logging.getLogger("pro4bro.activity")
        started = time.perf_counter()
        recovery_log.info("Runtime recovery scan started; pid=%s", os.getpid())
        recovery_projects = await asyncio.to_thread(projects.list)
        live_tracks = 0
        for project in recovery_projects:
            await restore_project_processing(project)
            livelink_root = Path(project.project_path) / "assets" / "obs-livelink"
            deleted_ids, journal_paths = await asyncio.to_thread(
                lambda: (
                    deleted_recording_ids(Path(project.project_path)),
                    list(livelink_root.glob("*/recording.json")),
                )
            )
            for journal in journal_paths:
                if journal.parent.name in deleted_ids:
                    continue
                try:
                    record = json.loads(await asyncio.to_thread(journal.read_text, encoding="utf-8"))
                    if record.get("deletedAt"):
                        continue
                    # This method schedules asyncio workers as well as reading
                    # their journal; it must retain event-loop ownership.
                    live_tracks += obs_livelink_stt.resume_recording(project.id, journal.parent.name)
                except (OSError, ValueError, KeyError) as exc:
                    logging.getLogger(__name__).warning(
                        "LiveLink STT could not resume %s: %s", journal.parent.name, exc)
        recovery_log.info(
            "Runtime recovery scan finished; pid=%s elapsedSeconds=%.3f projects=%s "
            "liveTracksQueued=%s mkvWatchersQueued=%s mkvSttWorkersQueued=%s obsDetailedWorkersQueued=%s",
            os.getpid(), time.perf_counter() - started, len(recovery_projects),
            live_tracks, len(mkv_watchers), len(mkv_stt_workers), len(obs_detailed_workers),
        )

    async def stop_mkv_watchers() -> None:
        tasks = list(mkv_watchers.values()) + list(mkv_stt_workers.values()) + list(obs_detailed_workers.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await growing_mkv_stt.close()

    collection_previews = CollectionVoicePreviews(voice_collections, voice_generator)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Project manifests and OBS journals can live on slow/removable storage.
        # The API listener must be available while their durable state is read.
        recovery_task = asyncio.create_task(
            resume_mkv_watchers(), name="pro4bro-startup-recovery"
        )
        _app.state.recovery_task = recovery_task

        def report_recovery_result(task: asyncio.Task) -> None:
            if task.cancelled():
                return
            error = task.exception()
            if error is not None:
                logging.getLogger(__name__).error(
                    "Runtime recovery scan failed",
                    exc_info=(type(error), error, error.__traceback__),
                )

        recovery_task.add_done_callback(report_recovery_result)
        try:
            # Preserve fully reconciled state on the common fast path. Slow
            # storage must not hold listener readiness for the whole scan.
            try:
                await asyncio.wait_for(asyncio.shield(recovery_task), timeout=1.0)
            except asyncio.TimeoutError:
                pass
            yield
        finally:
            if not recovery_task.done():
                recovery_task.cancel()
            await asyncio.gather(recovery_task, return_exceptions=True)
            await stop_mkv_watchers()
            if obs_finalizers:
                await asyncio.gather(*obs_finalizers.values(), return_exceptions=True)
            await obs_livelink_stt.close()
            await asyncio.to_thread(collection_previews.close)
            await asyncio.to_thread(voice_fixes.close)
            await asyncio.to_thread(voice_patch_processor.close)
            await asyncio.to_thread(context_patch_processor.close)
            await asyncio.to_thread(hybrid_patch_processor.close)
            await asyncio.to_thread(trained_media_patch_processor.close)
            await asyncio.to_thread(output_timing_repair.close)

    app = FastAPI(title="Pro4Bro Voice Manipulator", version="0.2.0", lifespan=lifespan)
    app.include_router(make_voice_collection_transfer_router(voice_collections))
    app.include_router(make_voice_edit_router(voice_edits))
    app.include_router(make_voice_delivery_router())
    app.include_router(make_voice_render_router(voice_edits, voice_script_documents))
    app.include_router(make_reference_schedule_router(reference_bindings, voice_script_documents))
    app.include_router(make_voice_fix_router(voice_fixes))
    app.include_router(make_voice_fix_apply_router(VoiceFixApply(voice_fixes)))
    app.include_router(make_voice_patch_router(voice_patch_source))
    app.include_router(make_voice_patch_job_router(voice_patch_processor))
    app.include_router(make_context_patch_source_router(context_patch_source))
    app.include_router(make_voice_patch_job_router(context_patch_processor))
    app.include_router(make_voice_patch_job_router(hybrid_patch_processor))
    app.include_router(make_voice_patch_job_router(trained_media_patch_processor))
    app.include_router(make_voice_patch_history_router(voice_patch_processor.history))
    app.include_router(make_voice_patch_audition_router(VoicePatchAudition(voice_patch_processor.history, voice_outputs, media)))
    app.include_router(make_voice_patch_review_router(VoicePatchReviews(voice_patch_processor.history)))
    app.include_router(make_output_timing_repair_router(output_timing_repair))
    app.include_router(make_output_word_review_router(OutputWordReview(projects, voice_outputs)))
    app.include_router(make_collection_preview_router(collection_previews))
    app.include_router(make_obs_recording_management_router(
        projects, obs_livelink_runtime, media, obs_livelink_detailed_stt, obs_livelink_audio,
    ))
    app.state.reading_sessions = reading_sessions
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:18119",
            "http://localhost:18119",
            "http://127.0.0.1:18121",
            "http://localhost:18121",
        ],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Preview-Start-Seconds", "X-Preview-End-Seconds"],
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
    async def open_project(payload: ProjectOpen) -> ProjectRecord:
        try:
            project = await asyncio.to_thread(projects.open, payload.path)
            await restore_project_processing(project)
            return project
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    async def stop_removed_footage_jobs(project_id: str, asset_id: str) -> None:
        """Fence sequential STT/diarization before footage leaves the Media Pool."""
        assets = await asyncio.to_thread(media.list, project_id)
        removed_ids = [asset_id]
        removed_ids.extend(
            asset.id for asset in assets if asset.source_archive_asset_id == asset_id
        )
        project = await asyncio.to_thread(projects.get, project_id)
        results = await asyncio.gather(
            transcription_queue.stop(project_id, removed_ids, include_active=True),
            diarization_queue.stop(project_id, removed_ids, include_active=True),
            growing_mkv_stt.stop(project, asset_ids=removed_ids, include_active=True),
            obs_livelink_detailed_stt.stop(project, asset_ids=removed_ids, include_active=True),
            return_exceptions=True,
        )
        failures = [result for result in results if isinstance(result, Exception)]
        if failures:
            raise ProcessingStopError("; ".join(str(error) for error in failures))

    @app.get(
        "/api/projects/{project_id}/media", response_model=list[ProjectMediaAsset]
    )
    def list_project_media(project_id: str) -> list[ProjectMediaAsset]:
        try:
            return media.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get(
        "/api/projects/{project_id}/media/organization",
        response_model=MediaPoolOrganization,
    )
    def get_media_organization(project_id: str) -> MediaPoolOrganization:
        try:
            return media.organization(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/organization",
        response_model=MediaPoolOrganization,
    )
    def update_media_organization(
        project_id: str, payload: MediaPoolOrganization
    ) -> MediaPoolOrganization:
        try:
            return media.update_organization(project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/obs-sessions/inspect",
        response_model=ObsRecordingInspection,
    )
    def inspect_obs_recording(project_id: str, payload: ObsRecordingInspect) -> ObsRecordingInspection:
        try:
            return obs_sessions.inspect(project_id, payload.source_path)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/obs-sessions",
        response_model=ObsCaptureSession,
        status_code=status.HTTP_202_ACCEPTED,
    )
    def create_obs_session(
        project_id: str, payload: ObsSessionCreate, background_tasks: BackgroundTasks
    ) -> ObsCaptureSession:
        try:
            session = obs_sessions.start(project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        background_tasks.add_task(obs_sessions.ingest, project_id, session.id, payload)
        return session

    @app.get(
        "/api/projects/{project_id}/obs-sessions",
        response_model=list[ObsCaptureSession],
    )
    def list_obs_sessions(project_id: str) -> list[ObsCaptureSession]:
        try:
            return obs_sessions.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get(
        "/api/projects/{project_id}/obs-sessions/{session_id}",
        response_model=ObsCaptureSession,
    )
    def get_obs_session(project_id: str, session_id: str) -> ObsCaptureSession:
        try:
            return obs_sessions.get(project_id, session_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS session not found") from exc

    @app.get("/api/projects/{project_id}/obs-sessions/{session_id}/recording")
    def get_obs_recording(project_id: str, session_id: str) -> Response:
        try:
            path = obs_sessions.recording_path(project_id, session_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS recording not found") from exc
        return FileResponse(path, media_type="video/x-matroska", filename=path.name)

    @app.get("/api/projects/{project_id}/obs-sessions/{session_id}/subtitles/status")
    def obs_session_subtitle_status(project_id: str, session_id: str) -> dict:
        try:
            session = obs_sessions.get(project_id, session_id)
            return obs_session_subtitles.status(project_id, session)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS session not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/obs-sessions/{session_id}/subtitles")
    def export_obs_session_subtitles(
        project_id: str, session_id: str, assetIds: list[str] | None = Query(default=None),
    ) -> FileResponse:
        try:
            project = projects.get(project_id)
            session = obs_sessions.get(project_id, session_id)
            path = obs_session_subtitles.export(project, session, set(assetIds) if assetIds is not None else None)
            return FileResponse(path, media_type="application/x-subrip", filename=path.name)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS session not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/obs-sessions/{session_id}/hard-subtitle")
    def render_obs_session_hard_subtitle(
        project_id: str, session_id: str, assetIds: list[str] | None = Query(default=None),
    ) -> FileResponse:
        try:
            project = projects.get(project_id)
            session = obs_sessions.get(project_id, session_id)
            path = obs_session_subtitles.render(
                project, session, set(assetIds) if assetIds is not None else None
            )
            return FileResponse(path, media_type="video/mp4", filename=path.name)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS session not found") from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/obs-live/pairing")
    def obs_live_pairing(project_id: str) -> dict[str, str]:
        try:
            return {"protocolVersion": "2", "token": obs_live.pairing_token(project_id),
                    "overlayPath": obs_live.overlay_path(project_id).as_posix()}
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.post(
        "/api/projects/{project_id}/obs-live/sessions",
        response_model=ObsLiveSession,
        status_code=status.HTTP_201_CREATED,
    )
    def open_obs_live(project_id: str, payload: ObsLiveOpen, request: Request) -> ObsLiveSession:
        try:
            obs_live.authorize(project_id, request.headers.get("x-pro4bro-obs-token"))
            return obs_live.open(project_id, payload)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ObsLiveConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.put(
        "/api/projects/{project_id}/obs-live/sessions/{session_id}/chunks/{sequence}",
        response_model=ObsLiveSession,
    )
    async def put_obs_live_chunk(
        project_id: str, session_id: str, sequence: int, request: Request,
        timestampNs: int, frames: int, sha256: str,
    ) -> ObsLiveSession:
        try:
            obs_live.authorize(project_id, request.headers.get("x-pro4bro-obs-token"))
            declared = int(request.headers.get("content-length", "0"))
            if declared > 768_000:
                raise HTTPException(status_code=413, detail="OBS PCM chunk quá lớn.")
            data = bytearray()
            async for part in request.stream():
                data.extend(part)
                if len(data) > 768_000:
                    raise HTTPException(status_code=413, detail="OBS PCM chunk quá lớn.")
            before = await asyncio.to_thread(obs_live.get, project_id, session_id)
            accepted = await asyncio.to_thread(
                obs_live.chunk, project_id, session_id, sequence, timestampNs,
                frames, sha256, bytes(data),
            )
            if sequence > before.last_sequence:
                obs_live_stt.offer(project_id, accepted, bytes(data))
            return accepted
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ObsLiveConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS live session not found") from exc

    @app.post(
        "/api/projects/{project_id}/obs-live/sessions/{session_id}/events",
        response_model=ObsLiveSession,
    )
    async def post_obs_live_event(
        project_id: str, session_id: str, payload: ObsLiveEvent, request: Request,
    ) -> ObsLiveSession:
        try:
            obs_live.authorize(project_id, request.headers.get("x-pro4bro-obs-token"))
            updated = await asyncio.to_thread(obs_live.event, project_id, session_id, payload)
            if payload.kind == "stopped":
                obs_live_stt.finish(project_id, session_id)
            return updated
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ObsLiveConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS live session not found") from exc

    @app.get(
        "/api/projects/{project_id}/obs-live/sessions",
        response_model=list[ObsLiveSession],
    )
    def list_obs_live_sessions(project_id: str) -> list[ObsLiveSession]:
        try:
            return obs_live.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get(
        "/api/projects/{project_id}/obs-live/sessions/{session_id}",
        response_model=ObsLiveSession,
    )
    def get_obs_live_session(project_id: str, session_id: str) -> ObsLiveSession:
        try:
            return obs_live.get(project_id, session_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS live session not found") from exc

    @app.get("/api/projects/{project_id}/obs-live/sessions/{session_id}/caption-quality")
    def get_obs_live_caption_quality(project_id: str, session_id: str) -> dict:
        try:
            return obs_live.caption_quality(project_id, session_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="OBS live session or stem not found") from exc

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
        capture_tier: str = Form(default=""),
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
                capture_tier or None,
            )
            queued_ids = result.track_asset_ids or ([result.asset.id] if result.asset.analysis_path else [])
            if queue_for_transcription and queued_ids:
                await transcription_queue.enqueue(
                    project_id,
                    queued_ids,
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

    @app.post("/api/projects/{project_id}/media/inspect-local")
    async def inspect_local_media_tracks(project_id: str, payload: LocalMediaInspect) -> dict:
        try:
            projects.get(project_id)
            source = Path(payload.source_path).expanduser().resolve()
            if not source.is_file():
                raise FileNotFoundError("Không tìm thấy file media nguồn")
            probe = await asyncio.to_thread(
                growing_mkv.inspect if source.suffix.lower() == ".mkv" else media_importer._probe,
                str(source) if source.suffix.lower() == ".mkv" else source,
            )
            audio = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"]
            return {"tracks": [{
                "streamIndex": stream["index"],
                "title": str((stream.get("tags") or {}).get("title") or f"Track {ordinal}"),
                "codec": str(stream.get("codec_name") or "unknown"),
                "channels": stream.get("channels"),
            } for ordinal, stream in enumerate(audio, 1)]}
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except (ValueError, FileNotFoundError) as exc:
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
                stream_indexes=payload.stream_indexes,
                transcribe_stream_indexes=payload.transcribe_stream_indexes,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/media/follow-mkv",
        response_model=MediaImportResult,
        status_code=status.HTTP_201_CREATED,
    )
    async def start_growing_mkv_follow(project_id: str, payload: GrowingMkvFollowCreate) -> MediaImportResult:
        try:
            project = projects.get(project_id)
            result = await asyncio.to_thread(
                growing_mkv.start, project, payload.source_path, payload.stream_indexes,
                payload.transcribe_stream_indexes, payload.stt_segment_seconds,
            )
            ensure_mkv_watcher(project_id, result.asset.id)
            if payload.transcribe_stream_indexes:
                ensure_mkv_stt_worker(project_id, result.asset.id)
            return result
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/media/{asset_id}/follow/status")
    async def growing_mkv_status(project_id: str, asset_id: str) -> dict:
        try:
            result = await asyncio.to_thread(growing_mkv.status, projects.get(project_id), asset_id)
            error = mkv_watch_errors.get((project_id, asset_id))
            stt = growing_mkv_stt.status(projects.get(project_id), asset_id)
            return {**result, "stt": stt, "followError": error,
                    "sttError": mkv_stt_errors.get((project_id, asset_id))}
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="MKV follow not found") from exc

    @app.post("/api/projects/{project_id}/media/{asset_id}/follow/detailed-stt")
    async def start_growing_mkv_detailed_stt(
        project_id: str, asset_id: str, payload: GrowingMkvDetailedSttStart
    ) -> dict:
        try:
            result = await asyncio.to_thread(
                growing_mkv.configure_detailed_stt, projects.get(project_id),
                asset_id, payload.segment_seconds,
            )
            await growing_mkv_stt.resume_parent(projects.get(project_id), asset_id)
            ensure_mkv_stt_worker(project_id, asset_id)
            return result
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="MKV follow not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/media/{asset_id}/follow/assets",
             response_model=list[ProjectMediaAsset])
    def growing_mkv_assets(project_id: str, asset_id: str) -> list[ProjectMediaAsset]:
        try:
            parent = media.get(project_id, asset_id)
            if not parent.growing_mkv_follow:
                raise KeyError(asset_id)
            return [parent, *(asset for asset in media.list(project_id)
                              if asset.source_archive_asset_id == asset_id)]
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="MKV follow not found") from exc

    @app.post("/api/projects/{project_id}/media/{asset_id}/follow/poll")
    async def poll_growing_mkv(project_id: str, asset_id: str) -> dict:
        try:
            result = await asyncio.to_thread(growing_mkv.poll, projects.get(project_id), asset_id)
            mkv_watch_errors.pop((project_id, asset_id), None)
            if not result["finished"]:
                ensure_mkv_watcher(project_id, asset_id)
            return result
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="MKV follow not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/media/{asset_id}/follow/finish")
    async def finish_growing_mkv(project_id: str, asset_id: str) -> dict:
        try:
            result = await asyncio.to_thread(growing_mkv.finish, projects.get(project_id), asset_id)
            mkv_watch_errors.pop((project_id, asset_id), None)
            ensure_mkv_stt_worker(project_id, asset_id)
            return result
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="MKV follow not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

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
            return media.update_timeline_edits(project_id, asset_id, payload.removed_ranges, payload.gain_keyframes, payload.working_range, payload.cut_points)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/timeline-cuts-batch",
        response_model=list[ProjectMediaAsset],
    )
    def update_media_timeline_cuts_batch(
        project_id: str, payload: MediaTimelineCutsBatch
    ) -> list[ProjectMediaAsset]:
        try:
            return media.update_timeline_cuts_many(project_id, payload.asset_ids, payload.removed_ranges)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.patch("/api/projects/{project_id}/media/reference-selection", response_model=list[ProjectMediaAsset])
    def set_media_reference_selection(project_id: str, payload: MediaReferenceSelection) -> list[ProjectMediaAsset]:
        try:
            return media.set_reference_selected_many(project_id, payload.asset_ids, payload.selected)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
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
        "/api/projects/{project_id}/media/{asset_id}/import-selection",
        response_model=ProjectMediaAsset,
    )
    def update_media_import_selection(
        project_id: str, asset_id: str, payload: MediaImportSelection
    ) -> ProjectMediaAsset:
        try:
            return media.set_import_selected(project_id, asset_id, payload.selected)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.post("/api/projects/{project_id}/media/{asset_id}/audio-tracks/{stream_index}/import",
              response_model=ProjectMediaAsset)
    async def import_existing_audio_track(project_id: str, asset_id: str,
                                          stream_index: int) -> ProjectMediaAsset:
        try:
            return await media_importer.materialize_audio_track(
                projects.get(project_id), asset_id, stream_index)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/diarization-selection",
        response_model=ProjectMediaAsset,
    )
    def update_media_diarization_selection(
        project_id: str, asset_id: str, payload: MediaDiarizationSelection
    ) -> ProjectMediaAsset:
        try:
            return media.set_diarization_selected(project_id, asset_id, payload.selected)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.patch(
        "/api/projects/{project_id}/media/{asset_id}/transcription-selection",
        response_model=ProjectMediaAsset,
    )
    async def update_media_transcription_selection(
        project_id: str, asset_id: str, payload: MediaTranscriptionSelection
    ) -> ProjectMediaAsset:
        try:
            updated = media.set_transcription_selected(project_id, asset_id, payload.selected)
            if payload.selected and updated.source_archive_asset_id:
                parent = media.get(project_id, updated.source_archive_asset_id)
                if parent.growing_mkv_follow:
                    ensure_mkv_stt_worker(project_id, parent.id)
            return updated
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

    @app.post(
        "/api/projects/{project_id}/media/transcriptions/control",
        response_model=list[ProjectMediaAsset],
    )
    async def control_media_transcriptions(
        project_id: str, payload: MediaTranscriptionControl
    ) -> list[ProjectMediaAsset]:
        try:
            projects.get(project_id)
            if payload.action == "pause":
                touched = await transcription_queue.pause(project_id, payload.asset_ids)
            elif payload.action == "resume":
                touched = await transcription_queue.resume(project_id, payload.asset_ids)
            else:
                results = await asyncio.gather(
                    transcription_queue.stop(project_id, payload.asset_ids, include_active=payload.action == "stop-all"),
                    growing_mkv_stt.stop(projects.get(project_id), asset_ids=payload.asset_ids, include_active=payload.action == "stop-all"),
                    obs_livelink_detailed_stt.stop(projects.get(project_id), asset_ids=payload.asset_ids, include_active=payload.action == "stop-all"),
                    return_exceptions=True,
                )
                failures = [result for result in results if isinstance(result, Exception)]
                if failures:
                    raise ProcessingStopError("; ".join(str(error) for error in failures))
                touched = list(dict.fromkeys(asset_id for result in results for asset_id in result))
            assets = []
            for asset_id in touched:
                try:
                    assets.append(media.get(project_id, asset_id))
                except KeyError:
                    continue
            return assets
        except ProcessingStopError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get("/api/projects/{project_id}/media/transcription-queue")
    async def read_transcription_queue(project_id: str) -> dict:
        return transcription_queue.status(project_id)

    @app.post("/api/projects/{project_id}/media/diarizations/control", response_model=list[ProjectMediaAsset])
    async def control_media_diarizations(project_id: str, payload: TaskStopRequest) -> list[ProjectMediaAsset]:
        try:
            projects.get(project_id)
            touched = await diarization_queue.stop(project_id, include_active=payload.mode == "all")
            return [media.get(project_id, asset_id) for asset_id in touched]
        except ProcessingStopError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or media asset not found") from exc

    @app.get(
        "/api/projects/{project_id}/media/diarization-status",
        response_model=list[MediaDiarizationProgress],
    )
    def list_project_media_diarization_status(
        project_id: str,
    ) -> list[MediaDiarizationProgress]:
        try:
            return media.diarization_progresses(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

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

    # The two outcomes have different shapes, so the model is built per branch.
    @app.delete("/api/projects/{project_id}/media/{asset_id}", response_model=None)
    async def remove_project_media(
        project_id: str, asset_id: str, permanent: bool = False
    ) -> Response | ProjectMediaAsset:
        """Recycle by default; erase only when the caller says so outright."""
        def remove_after_stop() -> Response | ProjectMediaAsset:
            if not permanent:
                return media.send_to_recycle_bin(project_id, asset_id)
            asset = media.get(project_id, asset_id)
            if asset.obs_recording_id and asset.source_extension == ".mka":
                # Serialize with archive finalization and journal persistence.
                with obs_livelink_audio._recording_lock(asset.obs_recording_id), obs_livelink_runtime._lock:
                    media.remove(project_id, asset_id)
                    obs_livelink_runtime.discard_deleted_recordings()
            else:
                media.remove(project_id, asset_id)
            return Response(status_code=status.HTTP_204_NO_CONTENT)

        try:
            await stop_removed_footage_jobs(project_id, asset_id)
            return await asyncio.to_thread(remove_after_stop)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc
        except ProcessingStopError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/media/{asset_id}/disabled",
        response_model=ProjectMediaAsset,
    )
    def set_media_disabled(project_id: str, asset_id: str, disabled: bool = True) -> ProjectMediaAsset:
        try:
            return media.set_disabled(project_id, asset_id, disabled)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.post("/api/live-transcribe")
    async def live_transcribe(
        file: UploadFile = File(...),
        session: str = Form(...),
        model: str = Form("tiny"),
        language: str = Form(""),
    ) -> dict:
        """Transcribe one short chunk of whatever is being captured right now.

        The browser's speech recognition cannot be pointed at a captured stream -
        it only ever hears the default microphone - so recording a tab used to
        produce a transcript of the room. Sending the captured audio here instead
        means the live transcript comes from the source actually being recorded,
        whichever source that is.

        Measured on this machine: a 3 s chunk takes about 1.3 s with `tiny` once
        the model is warm, which keeps up with speech comfortably.
        """
        # The studio holds one model at a time, so a live chunk asking for `tiny`
        # while a batch runs `large-v3` would unload the batch's model between
        # files. The batch is the more expensive work; live transcript waits.
        if transcription_queue.status_any_running():
            raise HTTPException(status_code=409, detail="Đang chạy Speech to text hàng loạt; live transcript tạm nghỉ.")
        payload = await file.read()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=3.0)) as client:
                response = await client.post(
                    f"{settings.legacy_studio_url.rstrip('/')}/api/audio/live/chunk",
                    files={"file": ("chunk.wav", payload, "audio/wav")},
                    data={"session": session, "model": model, "language": language},
                )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail="OmniVoice Studio chưa chạy.") from exc
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail="Studio không nhận dạng được đoạn này.")
        return response.json()

    @app.post("/api/live-transcribe/end")
    async def live_transcribe_end(session: str = Form(...)) -> dict:
        """Recording stopped: take the last, unconfirmed words and close the session."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=3.0)) as client:
                response = await client.post(
                    f"{settings.legacy_studio_url.rstrip('/')}/api/audio/live/end",
                    data={"session": session},
                )
        except httpx.RequestError:
            return {"text": "", "committed": ""}
        return response.json() if response.status_code < 400 else {"text": "", "committed": ""}

    @app.post("/api/projects/{project_id}/reveal", status_code=status.HTTP_204_NO_CONTENT)
    def reveal_project_folder(project_id: str) -> Response:
        try:
            reveal(Path(projects.get(project_id).project_path))
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/media/{asset_id}/reveal", status_code=status.HTTP_204_NO_CONTENT)
    def reveal_media_file(project_id: str, asset_id: str, location: Literal["original", "project"] = "original") -> Response:
        try:
            project = projects.get(project_id)
            asset = media.get(project_id, asset_id)
            source = media.get(project_id, asset.source_archive_asset_id) if asset.source_archive_asset_id else asset
            root = Path(project.project_path).resolve()
            if location == "original" and source.has_external_source:
                original = local_media_sources.get(project_id, source.id)
                if not original:
                    raise FileNotFoundError("Không còn đường dẫn file gốc trên máy này. Hãy chọn lại file nguồn.")
                target = Path(original)
            else:
                if location == "project" and source.has_external_source and not source.local_cache_enabled:
                    raise FileNotFoundError("Footage chưa được cache trong project.")
                target = (root / source.source_path).resolve()
                if not target.is_relative_to(root):
                    raise ValueError("Đường dẫn media nằm ngoài project.")
            reveal(target)
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or media asset not found") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
    def remove_project(project_id: str, permanent: bool = False) -> Response:
        """Forget a project, or erase it outright when asked."""
        try:
            if permanent:
                projects.destroy(project_id)
            else:
                projects.forget(project_id)
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/media/{asset_id}/restore",
        response_model=ProjectMediaAsset,
    )
    def restore_project_media(project_id: str, asset_id: str) -> ProjectMediaAsset:
        try:
            return media.restore_from_recycle_bin(project_id, asset_id)
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
                payload.environment_profile_ids,
                payload.emotion,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Media asset not found") from exc

    @app.get(
        "/api/projects/{project_id}/dataset/readiness", response_model=DatasetReadiness
    )
    def dataset_readiness(project_id: str) -> DatasetReadiness:
        try:
            return dataset_compiler.readiness(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.post(
        "/api/projects/{project_id}/dataset/compile",
        response_model=DatasetManifest,
        status_code=status.HTTP_201_CREATED,
    )
    def compile_dataset(project_id: str) -> DatasetManifest:
        try:
            manifest = dataset_compiler.compile(project_id)
            # Older manifests no run trained on are replaced by this one.
            training_runner.prune_manifests(project_id, keep=manifest.id)
            return manifest
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except DatasetCompilationError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/training-runs",
        response_model=TrainingRun,
        status_code=status.HTTP_202_ACCEPTED,
    )
    def start_training_run(project_id: str, payload: TrainingRunStart) -> TrainingRun:
        try:
            return training_runner.start(
                project_id,
                payload.manifest_id,
                training_models.resolve(payload.config),
                payload.resume_run_id,
                payload.speaker_profile_ids,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Dataset manifest hoặc project không tồn tại") from exc
        except TrainingNotReady as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (TrainingBusyError, TrainingModelUnavailable) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get(
        "/api/projects/{project_id}/training-runs", response_model=list[TrainingRun]
    )
    def list_training_runs(project_id: str) -> list[TrainingRun]:
        try:
            # Reconcile first: a run whose process died while the app was closed
            # would otherwise be listed as still running.
            training_runs.reconcile(project_id)
            return training_runs.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get(
        "/api/projects/{project_id}/training-runs/{run_id}", response_model=TrainingRun
    )
    def get_training_run(project_id: str, run_id: str) -> TrainingRun:
        try:
            return training_runs.get(project_id, run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Training run not found") from exc

    @app.get(
        "/api/projects/{project_id}/training-runs/{run_id}/progress",
        response_model=list[TrainingProgressLine],
    )
    def training_run_progress(
        project_id: str, run_id: str, limit: int = 400
    ) -> list[TrainingProgressLine]:
        try:
            return training_runs.progress(project_id, run_id, limit=max(1, min(limit, 5000)))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Training run not found") from exc

    @app.get(
        "/api/projects/{project_id}/training-runs/{run_id}/log",
        response_model=TrainingRunLog,
    )
    def training_run_log(project_id: str, run_id: str, tail_bytes: int = 2_000_000) -> TrainingRunLog:
        """Everything a run wrote: the journal in full and the engine output file."""
        try:
            journal = training_runs.progress(project_id, run_id)
            path = training_runs.run_dir(project_id, run_id) / "process.log"
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Training run not found") from exc
        text, size = "", 0
        if path.is_file():
            size = path.stat().st_size
            limit = max(10_000, min(tail_bytes, 20_000_000))
            with path.open("rb") as handle:
                if size > limit:
                    handle.seek(size - limit)
                text = handle.read().decode("utf-8", errors="replace")
        return TrainingRunLog(
            run_id=run_id,
            journal=journal,
            process_log=text,
            process_log_bytes=size,
            truncated=size > len(text.encode("utf-8")),
        )

    @app.get(
        "/api/projects/{project_id}/training-runs/{run_id}/footprint",
        response_model=TrainingRunFootprint,
    )
    def training_run_footprint(project_id: str, run_id: str) -> TrainingRunFootprint:
        try:
            return training_runner.footprint(project_id, run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Training run not found") from exc

    @app.delete(
        "/api/projects/{project_id}/training-runs/{run_id}",
        response_model=TrainingRunFootprint,
    )
    def delete_training_run(project_id: str, run_id: str, with_outputs: bool = Query(False, alias="withOutputs")) -> TrainingRunFootprint:
        try:
            return training_runner.delete_run(project_id, run_id, with_outputs)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Training run not found") from exc
        except RunHasOutputs as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Không xoá hết được thư mục run: {exc}") from exc

    @app.delete("/api/projects/{project_id}/voices/{voice_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_project_voice(project_id: str, voice_id: str) -> Response:
        if voice_changer.uses_voice(project_id, voice_id):
            raise HTTPException(status_code=409, detail="Voice Changer đang đổi sang giọng này. Dừng Voice Changer trước khi xoá.")
        try:
            voice_model_sets.remove_voice(project_id, voice_id)
            project_voices.delete(project_id, voice_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice không tồn tại") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.delete("/api/projects/{project_id}/asr-adapters/{adapter_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_asr_adapter(project_id: str, adapter_id: str) -> Response:
        try:
            asr_adapters.delete(project_id, adapter_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="ASR adapter không tồn tại") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/projects/{project_id}/training-runs/control", response_model=list[TrainingRun])
    def control_training_runs(project_id: str, payload: TaskStopRequest) -> list[TrainingRun]:
        try:
            projects.get(project_id)
            return training_runner.stop(project_id, include_active=payload.mode == "all")
        except ProcessingStopError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.post(
        "/api/projects/{project_id}/training-runs/{run_id}/cancel", response_model=TrainingRun
    )
    def cancel_training_run(project_id: str, run_id: str) -> TrainingRun:
        try:
            return training_runner.cancel(project_id, run_id)
        except ProcessingStopError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Training run not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/gpu-lease", response_model=GpuLeaseHolder | None)
    def gpu_lease_holder() -> GpuLeaseHolder | None:
        return gpu_lease.holder()

    @app.get("/api/training-runtime", response_model=TrainingRuntimeReport)
    def training_runtime_report() -> TrainingRuntimeReport:
        return training_runtime.report()

    @app.get("/api/stt-engines", response_model=list[TrainingModelOption])
    def stt_engine_options() -> list[TrainingModelOption]:
        options = stt_engines.options()
        reason = vibevoice_asr.unavailable_reason()
        # The entrypoint check cannot see weights or the engine's Python; the
        # transcriber can, and says exactly which is missing.
        return [
            option.model_copy(update={"available": False, "status": reason})
            if option.engine == "vibevoice-asr" and reason and option.available
            else option
            for option in options
        ]

    @app.get("/api/projects/{project_id}/asr-adapters", response_model=list[ProjectAsrAdapter])
    def list_asr_adapters(project_id: str) -> list[ProjectAsrAdapter]:
        try:
            return asr_adapters.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get("/api/voice-generators", response_model=list[TrainingModelOption])
    def voice_generator_options() -> list[TrainingModelOption]:
        return voice_generators.options()

    @app.get("/api/projects/{project_id}/voices", response_model=list[ProjectVoice])
    def list_project_voices(project_id: str) -> list[ProjectVoice]:
        try:
            return project_voices.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get("/api/projects/{project_id}/voice-model-sets", response_model=list[VoiceModelSet])
    def list_voice_model_sets(project_id: str) -> list[VoiceModelSet]:
        try:
            return voice_model_sets.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get("/api/projects/{project_id}/voice-model-sets/{set_id}", response_model=VoiceModelSet)
    def get_voice_model_set(project_id: str, set_id: str) -> VoiceModelSet:
        try:
            return voice_model_sets.get(project_id, set_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice Model Set not found") from exc

    @app.get("/api/speaker-embedders", response_model=list[SpeakerEmbedderInfo])
    def list_speaker_embedders() -> list[SpeakerEmbedderInfo]:
        return [embedder.info for embedder in resolved_speaker_embedders.values()]

    @app.post(
        "/api/projects/{project_id}/voice-model-sets/{set_id}/gate",
        response_model=VoiceModelSet,
    )
    def evaluate_voice_model_set(
        project_id: str,
        set_id: str,
        payload: VoiceModelSetGateRequest,
    ) -> VoiceModelSet:
        try:
            if payload.embedder_id is None:
                payload = payload.model_copy(update={
                    "embedder_id": preferences.speaker_similarity().embedder_id,
                })
            return speaker_similarity_gate.evaluate(project_id, set_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice Model Set, embedder, voice, or output not found") from exc
        except GpuBusy as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/voice-outputs", response_model=list[VoiceOutput])
    def list_voice_outputs(project_id: str) -> list[VoiceOutput]:
        try:
            return voice_outputs.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.get("/api/projects/{project_id}/voice-outputs/{output_id}/audio")
    def voice_output_audio(project_id: str, output_id: str) -> Response:
        try:
            path = voice_outputs.audio_path(project_id, output_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice Output không tồn tại") from exc
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Thiếu file audio")
        return FileResponse(path, media_type="audio/wav")

    @app.get("/api/projects/{project_id}/voice-outputs/{output_id}/waveform")
    async def voice_output_waveform(
        project_id: str,
        output_id: str,
        start: float | None = None,
        end: float | None = None,
        points: int | None = None,
    ) -> dict:
        # The Timeline asks every take for its envelope next to its audio URL.
        try:
            project = projects.get(project_id)
            audio_path = voice_outputs.audio_path(project_id, output_id)
            cache_path = Path(project.project_path) / "cache" / "waveforms" / f"{output_id}.json"
            if start is None and end is None and points is None:
                return await asyncio.to_thread(waveform_envelopes.read, audio_path, cache_path)
            if start is None or end is None or points is None:
                raise ValueError("Waveform chi tiết cần start, end và points.")
            return await asyncio.to_thread(waveform_envelopes.read_detail, audio_path, cache_path, start, end, points)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc) or "Invalid waveform range") from exc
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="Voice Output không tồn tại") from exc

    @app.get("/api/projects/{project_id}/voice-outputs/{output_id}/subtitles")
    def export_voice_output_subtitles(
        project_id: str,
        output_id: str,
        mode: Literal["sentence", "word", "table", "line"] = "sentence",
    ) -> FileResponse:
        try:
            project = projects.get(project_id)
            output = voice_outputs.get(project_id, output_id)
            speakers = training_catalogs.get(project_id).speakers
            skipped_cues = 0
            if mode == "line":
                subtitle_path = subtitle_exporter.export_voice_output_lines(project, output, speakers)
            else:
                if not output.words:
                    raise ValueError("Voice Output này chưa có word timing; đọc Script lại để có subtitle.")
                # The exporter reads footage; generated speech has the same words,
                # duration and name, and nothing cut from its timeline.
                speech = SimpleNamespace(id=output.id, name=output.id, words=output.words, duration=output.duration, removed_ranges=[])
                skipped_cues = subtitle_exporter.skipped_cue_count(speech, mode)  # type: ignore[arg-type]
                subtitle_path = subtitle_exporter.export(project, speech, mode, speakers)  # type: ignore[arg-type]
            return FileResponse(
                subtitle_path,
                media_type="text/csv; charset=utf-8" if mode == "table" else "application/x-subrip",
                filename=subtitle_path.name,
                headers={"X-Pro4Bro-Skipped-Cues": str(skipped_cues)},
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice Output không tồn tại") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.delete("/api/projects/{project_id}/voice-outputs/{output_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_voice_output(project_id: str, output_id: str) -> Response:
        try:
            voice_outputs.delete(project_id, output_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice Output không tồn tại") from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/projects/{project_id}/voices/{voice_id}/reference")
    def project_voice_reference(project_id: str, voice_id: str) -> Response:
        try:
            voice = project_voices.get(project_id, voice_id)
            path = project_voices.absolute(project_id, voice.reference_audio)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice không tồn tại") from exc
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Thiếu file giọng mẫu")
        return FileResponse(path, media_type="audio/wav")

    @app.post("/api/projects/{project_id}/generation/control", response_model=VoiceScriptJob | None)
    def control_generation(project_id: str, payload: TaskStopRequest) -> VoiceScriptJob | None:
        try:
            projects.get(project_id)
            job = voice_script_speaker.stop(project_id, include_active=payload.mode == "all")
            voice_generator.stop(project_id, include_active=payload.mode == "all")
            return job
        except ProcessingStopError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

    @app.post(
        "/api/projects/{project_id}/voices/{voice_id}/generate",
        response_model=VoiceOutput,
        status_code=status.HTTP_201_CREATED,
    )
    async def generate_with_voice(project_id: str, voice_id: str, payload: VoiceGenerateRequest) -> VoiceOutput:
        try:
            # The engine call blocks for seconds, or a minute on a cold start;
            # it must not hold the event loop every other request runs on.
            cancellation_id = voice_generator.reserve(project_id)
            return await asyncio.to_thread(voice_generator.generate, project_id, voice_id, payload, cancellation_id=cancellation_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Voice hoặc project không tồn tại") from exc
        except (GpuBusy, TrainingModelUnavailable) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except VoiceGenerationCancelled as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except VoiceGenerationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/voice-script", response_model=VoiceScriptDocument)
    def get_voice_script_document(project_id: str) -> VoiceScriptDocument:
        try:
            return voice_script_documents.get(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc

    @app.get("/api/projects/{project_id}/timing-plans")
    def get_timing_plans(project_id: str) -> dict:
        try:
            return timing_plans.get(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc

    @app.delete("/api/projects/{project_id}/timing-plans/{row_id}")
    def delete_timing_plan(project_id: str, row_id: str, expected_revision: int) -> dict:
        try:
            return timing_plans.delete(project_id, row_id, expected_revision)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/timing-plans")
    async def create_timing_plan(project_id: str, payload: TimingPlanRequest) -> dict:
        try:
            return await asyncio.to_thread(timing_plans.save, project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Câu/source không tồn tại") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/reference-bindings", response_model=ReferenceBindingDocument)
    def get_reference_bindings(project_id: str) -> ReferenceBindingDocument:
        try:
            return reference_bindings.get(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc

    @app.post("/api/projects/{project_id}/reference-bindings/{binding_id}/resolve")
    async def resolve_reference_binding(project_id: str, binding_id: str, expected_revision: int) -> dict:
        try:
            return await asyncio.to_thread(reference_resolver.resolve, project_id, binding_id, expected_revision)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Reference không tồn tại") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.delete("/api/projects/{project_id}/reference-bindings/{binding_id}", response_model=ReferenceBindingDocument)
    def delete_reference_binding(project_id: str, binding_id: str, expected_revision: int) -> ReferenceBindingDocument:
        try:
            return reference_bindings.delete(project_id, binding_id, expected_revision)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Vùng gán không tồn tại") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/reference-bindings", response_model=ReferenceBindingDocument)
    def assign_reference_bindings(project_id: str, payload: ReferenceAssignment) -> ReferenceBindingDocument:
        try:
            return reference_bindings.assign(project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Footage hoặc vùng đích không tồn tại") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.put("/api/projects/{project_id}/voice-script", response_model=VoiceScriptDocument)
    def save_voice_script_document(project_id: str, payload: VoiceScriptDocument) -> VoiceScriptDocument:
        try:
            return voice_script_documents.save(project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/voice-script/read",
        response_model=VoiceScriptJob,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def read_voice_script(project_id: str, payload: VoiceScriptRequest) -> VoiceScriptJob:
        try:
            # Planning checks every row's voice and generator before the GPU is
            # taken; the rows are then read in the background and polled.
            reserved_job_id = voice_script_speaker.reserve(project_id, payload)
            return await asyncio.to_thread(voice_script_speaker.start, project_id, payload, reserved_job_id=reserved_job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (GpuBusy, TrainingModelUnavailable, VoiceScriptBusy) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/voice-script/duration-plan")
    async def preview_script_duration(project_id: str, payload: VoiceScriptRequest) -> dict:
        try:
            return await asyncio.to_thread(voice_script_speaker.duration_preview, project_id, payload)
        except ScriptRevisionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project/source không tồn tại") from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/voice-script/jobs/{job_id}", response_model=VoiceScriptJob)
    def voice_script_job(project_id: str, job_id: str) -> VoiceScriptJob:
        try:
            return voice_script_speaker.job(project_id, job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Không có lượt đọc Script này") from exc

    @app.get("/api/voice-changers", response_model=list[TrainingModelOption])
    def voice_changer_options() -> list[TrainingModelOption]:
        return voice_changer_engines.options()

    @app.get("/api/voice-changer/preflight", response_model=VoiceChangerPreflight)
    async def voice_changer_preflight() -> VoiceChangerPreflight:
        return await asyncio.to_thread(voice_changer.preflight)

    @app.post("/api/projects/{project_id}/voice-changer/start", response_model=VoiceChangerStatus)
    async def voice_changer_start(project_id: str, payload: VoiceChangerStartRequest) -> VoiceChangerStatus:
        try:
            return await asyncio.to_thread(voice_changer.start, project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc
        except VoiceConsentRequired as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except (GpuBusy, TrainingModelUnavailable) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except VoiceChangerError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/voice-changer/status", response_model=VoiceChangerStatus)
    async def voice_changer_status() -> VoiceChangerStatus:
        return await asyncio.to_thread(voice_changer.status)

    @app.post("/api/voice-changer/stop")
    async def voice_changer_stop() -> dict:
        status_now, recording = await asyncio.to_thread(voice_changer.stop)
        return {
            "status": status_now.model_dump(mode="json", by_alias=True),
            "recording": recording.model_dump(mode="json", by_alias=True) if recording else None,
        }

    @app.post("/api/projects/{project_id}/voice-changer/record/start", response_model=VoiceChangerStatus)
    async def voice_changer_record_start(project_id: str) -> VoiceChangerStatus:
        try:
            return await asyncio.to_thread(voice_changer.record_start, project_id)
        except VoiceChangerError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/voice-changer/record/stop", response_model=VoiceChangerRecording)
    async def voice_changer_record_stop(project_id: str) -> VoiceChangerRecording:
        try:
            return await asyncio.to_thread(voice_changer.record_stop, project_id)
        except VoiceChangerError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/voice-changer/recordings", response_model=list[VoiceChangerRecording])
    def voice_changer_recordings(project_id: str) -> list[VoiceChangerRecording]:
        try:
            return changer_recordings.list(project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project không tồn tại") from exc

    @app.get("/api/projects/{project_id}/voice-changer/recordings/{recording_id}/audio")
    def voice_changer_recording_audio(project_id: str, recording_id: str) -> Response:
        try:
            path = changer_recordings.audio_path(project_id, recording_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Bản ghi không tồn tại") from exc
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Thiếu file audio")
        return FileResponse(path, media_type="audio/wav")

    @app.get("/api/projects/{project_id}/voice-changer/recordings/{recording_id}/waveform")
    async def voice_changer_recording_waveform(project_id: str, recording_id: str, start: float | None = None, end: float | None = None, points: int | None = None) -> dict:
        try:
            project = projects.get(project_id)
            audio_path = changer_recordings.audio_path(project_id, recording_id)
            cache_path = Path(project.project_path) / "cache" / "waveforms" / f"{recording_id}.json"
            if start is None and end is None and points is None:
                return await asyncio.to_thread(waveform_envelopes.read, audio_path, cache_path)
            if start is None or end is None or points is None:
                raise ValueError("Waveform chi tiết cần start, end và points.")
            return await asyncio.to_thread(waveform_envelopes.read_detail, audio_path, cache_path, start, end, points)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc) or "Invalid waveform range") from exc
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="Bản ghi không tồn tại") from exc

    @app.delete("/api/projects/{project_id}/voice-changer/recordings/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_voice_changer_recording(project_id: str, recording_id: str) -> Response:
        try:
            changer_recordings.delete(project_id, recording_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Bản ghi không tồn tại") from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/training-models", response_model=list[TrainingModelOption])
    def training_model_options() -> list[TrainingModelOption]:
        return training_models.options()

    @app.get("/api/voice-collections", response_model=list[VoiceCollection])
    def list_voice_collections() -> list[VoiceCollection]:
        return voice_collections.list()

    @app.post(
        "/api/voice-collections",
        response_model=VoiceCollection,
        status_code=status.HTTP_201_CREATED,
    )
    def create_voice_collection(payload: VoiceCollectionCreate) -> VoiceCollection:
        try:
            return voice_collections.create(payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post(
        "/api/voice-collections/{collection_id}/entries",
        response_model=VoiceCollectionEntry,
        status_code=status.HTTP_201_CREATED,
    )
    def add_voice_collection_entry(
        collection_id: str, payload: VoiceCollectionEntryCreate
    ) -> VoiceCollectionEntry:
        try:
            return voice_collections.add_entry(collection_id, payload.project_id, payload.voice_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Collection, project, or voice not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=400, detail="Required voice artifact could not be copied") from exc

    @app.post(
        "/api/voice-collections/{collection_id}/entries/{entry_id}/import",
        response_model=VoiceCollectionImportResult,
    )
    def import_voice_collection_entry(
        collection_id: str, entry_id: str, payload: VoiceCollectionImport
    ) -> VoiceCollectionImportResult:
        try:
            return voice_collections.import_entry(collection_id, entry_id, payload.project_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Collection entry or project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=400, detail="Required voice artifact could not be copied") from exc

    @app.post(
        "/api/projects/{project_id}/consent-evidence",
        response_model=ConsentEvidence,
        status_code=status.HTTP_201_CREATED,
    )
    async def upload_consent_evidence(project_id: str, file: UploadFile = File(...)) -> ConsentEvidence:
        try:
            pieces: list[bytes] = []
            total = 0
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > 10 * 1024 * 1024:
                    raise ValueError("Consent evidence must be at most 10 MiB.")
                pieces.append(chunk)
            return voice_collections.store_consent_evidence(project_id, file.filename or "evidence", b"".join(pieces))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            await file.close()

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

    @app.get("/api/reading-packs", response_model=list[ReadingPackSummary])
    def list_reading_packs() -> list[ReadingPackSummary]:
        return reading_packs.list()

    @app.get("/api/reading-packs/audience", response_model=ReadingAudienceVocabulary)
    def reading_audience_vocabulary() -> ReadingAudienceVocabulary:
        return audience_vocabulary(engine.profile_schema())

    @app.post(
        "/api/reading-packs/passages",
        response_model=ReadingPack,
        status_code=status.HTTP_201_CREATED,
    )
    def add_reading_passage(payload: ReadingPassageDraft) -> ReadingPack:
        # Deliberately unauthenticated: the password prompt in front of the
        # authoring dialog is a mis-click guard in the UI, not a check anyone
        # has to pass to reach this route. See docs/READING-LIBRARY.md.
        try:
            return reading_packs.add_passage(payload)
        except ReadingPackError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.delete("/api/reading-packs/passages/{passage_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_reading_passage(passage_id: str) -> Response:
        try:
            reading_packs.delete_passage(passage_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Bài đọc không tồn tại") from exc
        except ReadingPackError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/reading-packs/{pack_id}", response_model=ReadingPack)
    def get_reading_pack(pack_id: str) -> ReadingPack:
        try:
            return reading_packs.get(pack_id)
        except ReadingPackError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    def reading_lock(project_id: str) -> asyncio.Lock:
        return reading_session_locks.setdefault(project_id, asyncio.Lock())

    def reading_card(session: ReadingSession, card_id: str):
        return next((card for card in session.plan.cards if card.card_id == card_id), None)

    async def capture_asset(project_id: str, capture_id: str) -> ProjectMediaAsset | None:
        indexed = await asyncio.to_thread(media.list, project_id)
        matches = [asset for asset in indexed if asset.capture_id == capture_id]
        if len(matches) > 1:
            raise ValueError("More than one media asset uses this capture ID.")
        return matches[0] if matches else None

    async def session_get(project_id: str, session_id: str) -> ReadingSession:
        return await asyncio.to_thread(reading_sessions.get, project_id, session_id)

    async def session_list(project_id: str, status_filter: str | None = None) -> list[ReadingSession]:
        return await asyncio.to_thread(reading_sessions.list, project_id, status_filter)

    async def session_save(project_id: str, session: ReadingSession) -> ReadingSession:
        return await asyncio.to_thread(reading_sessions.save, project_id, session)

    async def verify_reading_asset(
        project_id: str, session: ReadingSession, intent: ReadingCaptureIntent,
        asset: ProjectMediaAsset,
    ) -> float:
        if (asset.reading_session_id != session.id or asset.reading_card_id != intent.card_id
                or asset.capture_id != intent.capture_id
                or asset.source_content_hash != intent.source_content_hash
                or asset.capture_tier != "guided" or asset.origin != "record"):
            raise ValueError("Indexed guided capture metadata does not match its durable intent.")
        card = reading_card(session, intent.card_id)
        if card is None or asset.text != card.text:
            raise ValueError("Indexed guided capture text does not match the snapshotted Reading Card.")
        if asset.speaker_profile_ids != [session.speaker_profile_id] or asset.emotion != card.emotion:
            raise ValueError("Indexed guided capture speaker or emotion does not match the session snapshot.")
        project = await asyncio.to_thread(projects.get, project_id)
        root = Path(project.project_path).resolve()
        source_path = (root / asset.source_path).resolve()
        audio_path = (root / str(asset.analysis_path or "")).resolve()
        if not source_path.is_relative_to(root) or not audio_path.is_relative_to(root):
            raise ValueError("Guided capture artifact path escapes its project folder.")
        if not source_path.is_file() or not audio_path.is_file():
            raise ValueError("Guided capture audio artifact is missing.")
        actual_hash = await asyncio.to_thread(MediaImportProcessor._sha256_file, source_path)
        if actual_hash != intent.source_content_hash:
            raise ValueError("Guided capture source bytes do not match its durable intent.")
        probe = await asyncio.to_thread(media_importer._probe, audio_path)
        audio_streams = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"]
        if len(audio_streams) != 1 or audio_streams[0].get("channels") != 1:
            raise ValueError("Guided capture analysis artifact must be mono audio.")
        duration = await asyncio.to_thread(media_importer._audio_duration, audio_path)
        if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
            raise ValueError("Guided capture audio duration is not finite and positive.")
        return float(duration)

    async def reconcile_reading_session(project_id: str, session: ReadingSession) -> ReadingSession:
        changed = False
        linked = {take.capture_id for take in session.takes}
        remaining: list[ReadingCaptureIntent] = []
        retired = list(session.retired_captures)
        for intent in session.pending_captures:
            asset = await capture_asset(project_id, intent.capture_id)
            if asset is None:
                # The project lock proves no upload from this API process is
                # currently publishing. The client may have disappeared with
                # its volatile File, so reopen releases the card while keeping
                # a tombstone that protects the capture ID from payload reuse.
                if not any(item.capture_id == intent.capture_id for item in retired):
                    retired.append(intent)
                changed = True
                continue
            duration = await verify_reading_asset(project_id, session, intent, asset)
            if intent.capture_id not in linked:
                session = _append_reading_session_take(session, intent, asset.id, duration)
                linked.add(intent.capture_id)
                changed = True
            changed = True
        if changed:
            session = session.model_copy(update={
                "pending_captures": remaining,
                "retired_captures": retired,
                "revision": session.revision + 1,
                "updated_at": datetime.now(timezone.utc),
            })
            await session_save(project_id, session)
        return session

    def _append_reading_session_take(
        session: ReadingSession, intent: ReadingCaptureIntent, asset_id: str, duration: float,
    ) -> ReadingSession:
        recorded = dict(session.recorded_seconds_by_card)
        recorded[intent.card_id] = round(recorded.get(intent.card_id, 0.0) + duration, 6)
        next_index = min(len(session.plan.cards), max(session.card_index, session.plan.cards.index(reading_card(session, intent.card_id)) + 1))
        completed = next_index >= len(session.plan.cards)
        return session.model_copy(update={
            "status": "completed" if completed else session.status,
            "card_index": next_index,
            "recorded_seconds_by_card": recorded,
            "seconds_since_break": round(session.seconds_since_break + duration, 6),
            "takes": [*session.takes, ReadingTake(
                capture_id=intent.capture_id,
                card_id=intent.card_id,
                asset_id=asset_id,
                duration_seconds=duration,
            )],
        })

    def check_canonical_uuid(value: str, label: str) -> str:
        try:
            canonical = str(UUID(value))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError(f"{label} must be a UUID.") from exc
        if canonical != value:
            raise ValueError(f"{label} must be a canonical UUID.")
        return canonical

    @app.get(
        "/api/projects/{project_id}/reading-sessions",
        response_model=ReadingSessionPage,
    )
    async def list_reading_sessions(
        project_id: str,
        status_filter: Literal["in_progress", "completed", "ended"] | None = Query(default=None, alias="status"),
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=50, ge=1, le=100),
    ) -> ReadingSessionPage:
        try:
            await asyncio.to_thread(projects.get, project_id)
            async with reading_lock(project_id):
                sessions = await session_list(project_id)
                sessions = [await reconcile_reading_session(project_id, item) for item in sessions]
                if status_filter:
                    sessions = [item for item in sessions if item.status == status_filter]
                return ReadingSessionPage(items=sessions[offset:offset + limit], total=len(sessions))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or Reading Session not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/reading-sessions",
        response_model=ReadingSession,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_reading_session(project_id: str, payload: ReadingSessionCreate) -> ReadingSession:
        try:
            check_canonical_uuid(payload.session_id, "sessionId")
            async with reading_lock(project_id):
                await asyncio.to_thread(projects.get, project_id)
                try:
                    existing = await session_get(project_id, payload.session_id)
                except KeyError:
                    existing = None
                if existing is not None:
                    same_request = (
                        existing.plan.pack_id == payload.pack_id
                        and existing.speaker_profile_id == payload.speaker_profile_id
                        and existing.plan.emotions == payload.emotions
                        and existing.plan.mode == payload.mode
                    )
                    if not same_request:
                        raise HTTPException(status_code=409, detail="Session ID already belongs to a different request.")
                    return await reconcile_reading_session(project_id, existing)
                if await session_list(project_id, "in_progress"):
                    raise HTTPException(status_code=409, detail="This project already has an active Reading Session.")
                catalog = await asyncio.to_thread(training_catalogs.get, project_id)
                speaker = next((item for item in catalog.speakers if item.id == payload.speaker_profile_id), None)
                if speaker is None:
                    raise HTTPException(status_code=400, detail="Choose a Speaker Profile from this project.")
                pack = await asyncio.to_thread(reading_packs.get, payload.pack_id)
                if len(set(payload.emotions)) != len(payload.emotions) or "mix" in payload.emotions:
                    raise HTTPException(status_code=400, detail="Select each performable emotion only once.")
                if any(emotion not in pack.emotions for emotion in payload.emotions):
                    raise HTTPException(status_code=400, detail="The selected emotion is not available in this Reading Pack.")
                cards = []
                for emotion in payload.emotions:
                    for passage in pack.passages:
                        if passage.emotion != emotion:
                            continue
                        cards.extend({
                            "card_id": card.id,
                            "passage_id": passage.id,
                            "passage_title": passage.title,
                            "direction": passage.direction,
                            "emotion": passage.emotion,
                            "text": card.text,
                            "estimated_seconds": card.estimated_seconds,
                        } for card in passage.cards)
                if not cards:
                    raise HTTPException(status_code=400, detail="The selected Reading Pack has no cards for these emotions.")
                now = datetime.now(timezone.utc)
                session = ReadingSession(
                    id=payload.session_id,
                    speaker_profile_id=speaker.id,
                    speaker_name=speaker.name,
                    pack_title=pack.title,
                    pack_version=pack.version,
                    plan={
                        "pack_id": pack.pack_id,
                        "language": pack.language,
                        "mode": payload.mode,
                        "emotions": payload.emotions,
                        "cards": cards,
                    },
                    created_at=now,
                    updated_at=now,
                )
                return await asyncio.to_thread(reading_sessions.create, project_id, session)
        except ReadingPackError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail="Session ID already exists.") from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc

        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get(
        "/api/projects/{project_id}/reading-sessions/{session_id}",
        response_model=ReadingSession,
    )
    async def get_reading_session(project_id: str, session_id: str) -> ReadingSession:
        try:
            async with reading_lock(project_id):
                session = await session_get(project_id, session_id)
                return await reconcile_reading_session(project_id, session)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or Reading Session not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/reading-sessions/{session_id}/skip",
        response_model=ReadingSession,
    )
    async def skip_reading_card(project_id: str, session_id: str, payload: ReadingSessionSkip) -> ReadingSession:
        try:
            async with reading_lock(project_id):
                session = await session_get(project_id, session_id)
                if payload.expected_revision != session.revision:
                    raise HTTPException(status_code=409, detail="Reading Session revision changed; reload before continuing.")
                if session.status != "in_progress" or session.card_index >= len(session.plan.cards):
                    raise HTTPException(status_code=409, detail="This Reading Session has no active card.")
                card = session.plan.cards[session.card_index]
                if payload.card_id != card.card_id:
                    raise HTTPException(status_code=409, detail="Only the current Reading Card can be skipped.")
                if any(item.card_id == card.card_id for item in session.pending_captures):
                    raise HTTPException(status_code=409, detail="Resolve the current recording upload before skipping its card.")
                index = session.card_index + 1
                updated = session.model_copy(update={
                    "card_index": index,
                    "status": "completed" if index >= len(session.plan.cards) else "in_progress",
                    "skipped_card_ids": [*session.skipped_card_ids, card.card_id],
                    "revision": session.revision + 1,
                    "updated_at": datetime.now(timezone.utc),
                })
                return await session_save(project_id, updated)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or Reading Session not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/reading-sessions/{session_id}/end",
        response_model=ReadingSession,
    )
    async def end_reading_session(project_id: str, session_id: str, payload: ReadingSessionEnd) -> ReadingSession:
        try:
            async with reading_lock(project_id):
                session = await session_get(project_id, session_id)
                if payload.expected_revision != session.revision:
                    raise HTTPException(status_code=409, detail="Reading Session revision changed; reload before continuing.")
                if session.status != "in_progress":
                    return session
                if session.pending_captures:
                    raise HTTPException(status_code=409, detail="Resolve pending capture uploads before ending this session.")
                updated = session.model_copy(update={
                    "status": "ended",
                    "revision": session.revision + 1,
                    "updated_at": datetime.now(timezone.utc),
                })
                return await session_save(project_id, updated)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or Reading Session not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post(
        "/api/projects/{project_id}/reading-sessions/{session_id}/takes",
        response_model=ReadingSessionTakeResult,
    )
    async def upload_reading_take(
        project_id: str,
        session_id: str,
        file: UploadFile = File(...),
        capture_id: str = Form(...),
        card_id: str = Form(...),
        expected_revision: int = Form(...),
    ) -> ReadingSessionTakeResult:
        try:
            check_canonical_uuid(session_id, "sessionId")
            check_canonical_uuid(capture_id, "captureId")
            digest = hashlib.sha256()
            total_bytes = 0
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > 1_500_000_000:
                    raise HTTPException(status_code=413, detail="Recording exceeds the 1.5 GB media limit.")
                digest.update(chunk)
            await file.seek(0)
            source_hash = digest.hexdigest()
            async with reading_lock(project_id):
                session = await session_get(project_id, session_id)
                existing_intent = next((item for item in session.pending_captures if item.capture_id == capture_id), None)
                retired_intent = next((item for item in session.retired_captures if item.capture_id == capture_id), None)
                existing_asset = await capture_asset(project_id, capture_id)
                if retired_intent is not None:
                    if retired_intent.card_id != card_id or retired_intent.source_content_hash != source_hash:
                        raise HTTPException(status_code=409, detail="Capture ID already belongs to different audio or a different card.")
                    if existing_intent is None:
                        existing_intent = retired_intent
                if existing_intent is not None and (existing_intent.card_id != card_id or existing_intent.source_content_hash != source_hash):
                    raise HTTPException(status_code=409, detail="Capture ID already belongs to different audio or a different card.")
                if existing_asset is not None:
                    if (existing_asset.reading_session_id != session_id
                            or existing_asset.reading_card_id != card_id
                            or existing_asset.source_content_hash != source_hash):
                        raise HTTPException(status_code=409, detail="Capture ID already belongs to different audio or a different card.")
                    intent = existing_intent or ReadingCaptureIntent(
                        capture_id=capture_id, card_id=card_id, source_content_hash=source_hash,
                        expected_revision=expected_revision,
                    )
                    duration = await verify_reading_asset(project_id, session, intent, existing_asset)
                    if intent.card_id != card_id or intent.source_content_hash != source_hash:
                        raise HTTPException(status_code=409, detail="Capture ID already belongs to different audio or a different card.")
                    if any(take.capture_id == capture_id for take in session.takes):
                        return ReadingSessionTakeResult(session=session, asset=existing_asset)
                    if existing_intent is None:
                        session = session.model_copy(update={
                            "pending_captures": [*session.pending_captures, intent],
                        })
                    elif existing_intent not in session.pending_captures:
                        session = session.model_copy(update={"pending_captures": [*session.pending_captures, intent]})
                    session = _append_reading_session_take(session, intent, existing_asset.id, duration)
                    session = session.model_copy(update={
                        "pending_captures": [item for item in session.pending_captures if item.capture_id != capture_id],
                        "revision": session.revision + 1,
                        "updated_at": datetime.now(timezone.utc),
                    })
                    await session_save(project_id, session)
                    return ReadingSessionTakeResult(session=session, asset=existing_asset)
                retry_intent = retired_intent or existing_intent
                retired_retry_matches_original_revision = (
                    retry_intent is not None
                    and expected_revision == retry_intent.expected_revision
                    and session.status == "in_progress"
                    and session.card_index < len(session.plan.cards)
                    and session.plan.cards[session.card_index].card_id == card_id
                )
                if expected_revision != session.revision and not retired_retry_matches_original_revision:
                    raise HTTPException(status_code=409, detail="Reading Session revision changed; reload before recording.")
                if session.status != "in_progress" or session.card_index >= len(session.plan.cards):
                    raise HTTPException(status_code=409, detail="This Reading Session has no active card.")
                card = session.plan.cards[session.card_index]
                if card.card_id != card_id:
                    raise HTTPException(status_code=409, detail="Recording must match the current Reading Card.")
                if existing_intent is None:
                    intent = ReadingCaptureIntent(
                        capture_id=capture_id, card_id=card_id, source_content_hash=source_hash,
                        expected_revision=expected_revision,
                    )
                    session = session.model_copy(update={"pending_captures": [*session.pending_captures, intent]})
                    await session_save(project_id, session)
                elif retired_intent is not None:
                    intent = existing_intent
                    session = session.model_copy(update={
                        "retired_captures": [item for item in session.retired_captures if item.capture_id != capture_id],
                        "pending_captures": [*session.pending_captures, intent],
                    })
                    await session_save(project_id, session)
                else:
                    intent = existing_intent
                result = await media_importer.process(
                    await asyncio.to_thread(projects.get, project_id), file, "record", card.text,
                    transcribe=False, queue_for_transcription=False, capture_tier="guided",
                    reading_session_id=session_id, reading_card_id=card_id,
                    capture_id=capture_id, source_content_hash=source_hash,
                    reading_speaker_profile_id=session.speaker_profile_id,
                    reading_emotion=card.emotion,
                )
                duration = await verify_reading_asset(project_id, session, intent, result.asset)
                session = _append_reading_session_take(session, intent, result.asset.id, duration)
                session = session.model_copy(update={
                    "pending_captures": [item for item in session.pending_captures if item.capture_id != capture_id],
                    "revision": session.revision + 1,
                    "updated_at": datetime.now(timezone.utc),
                })
                await session_save(project_id, session)
                return ReadingSessionTakeResult(session=session, asset=result.asset)
        except HTTPException:
            raise
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or Reading Session not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

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

    @app.get("/api/obs-plugin/installation")
    def obs_plugin_status(obsRoot: str | None = None) -> dict:
        return obs_plugin_installation.status(obsRoot)

    @app.get("/api/obs-livelink/v3/status")
    def obs_livelink_status() -> dict:
        return obs_livelink_runtime.status()

    @app.get("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/outbox")
    def obs_outbox_snapshot(project_id: str, recording_id: str):
        return recover_obs_outbox("snapshot", project_id, recording_id)

    @app.post("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/outbox/retry")
    def obs_outbox_retry(project_id: str, recording_id: str, payload: dict):
        return recover_obs_outbox("retry", project_id, recording_id, payload.get("rejectedDigest"))

    @app.post("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/outbox/export")
    def obs_outbox_export(project_id: str, recording_id: str):
        path = recover_obs_outbox("export", project_id, recording_id)
        return FileResponse(path, media_type="application/zip", filename=path.name)

    outbox_recovery = ObsLiveLinkOutbox(obs_livelink_audio)

    def recover_obs_outbox(action, project_id, recording_id, digest=None):
        try:
            if action == "retry":
                return outbox_recovery.retry(project_id, recording_id, digest)
            return getattr(outbox_recovery, action)(project_id, recording_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=503, detail="Outbox export failed; original PCM is retained.") from exc

    @app.get("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/waveform")
    def obs_livelink_waveform(project_id: str, recording_id: str, channelId: str,
                              startSeconds: float = 0, endSeconds: float = 120,
                              maxPoints: int = 600, afterSequence: int | None = None) -> dict:
        try:
            return obs_livelink_audio.waveform.snapshot(
                project_id, recording_id, channelId, start_seconds=startSeconds,
                end_seconds=endSeconds, max_points=maxPoints, after_sequence=afterSequence,
            )
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/channels/{channel_id}/preview")
    async def obs_livelink_pcm_preview(project_id: str, recording_id: str, channel_id: str,
                                       startSeconds: float | None = None,
                                       durationSeconds: float = 30) -> Response:
        try:
            audio, start, end = await asyncio.to_thread(
                obs_livelink_detailed_stt.preview_audio, projects.get(project_id),
                recording_id, channel_id, startSeconds, durationSeconds,
            )
            return Response(audio, media_type="audio/wav", headers={
                "Cache-Control": "no-store", "X-Preview-Start-Seconds": str(start),
                "X-Preview-End-Seconds": str(end),
            })
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/transcript-events")
    def obs_livelink_transcript_events(project_id: str, recording_id: str,
                                       afterRevision: int = 0) -> dict:
        try:
            return obs_livelink_stt.snapshot(project_id, recording_id, afterRevision)
        except (LiveLinkError, KeyError) as exc:
            raise HTTPException(status_code=exc.status if isinstance(exc, LiveLinkError) else 404,
                                detail=str(exc)) from exc

    @app.put("/api/obs-livelink/v3/recording-folder")
    def obs_livelink_recording_folder(payload: dict) -> dict:
        return obs_livelink_runtime.set_recording_folder_connected(bool(payload.get("enabled")))

    @app.post("/api/projects/{project_id}/obs-livelink/video-spans/import")
    async def import_obs_video_span(project_id: str, payload: ObsLiveLinkVideoImport) -> dict:
        try:
            project = projects.get(project_id)
            span, locator = obs_livelink_runtime.video_span(payload.span_id)
            if span.ended_monotonic_ns is None:
                raise LiveLinkError("OBS video span is still recording.", 409)
            if obs_livelink_runtime.status().get("obsRecording") in {"recording", "paused"}:
                raise LiveLinkError("OBS is still recording; wait for Stop before importing an MKV.", 409)
            if span.imported_video_asset_id:
                return media.get(project_id, span.imported_video_asset_id).model_dump(mode="json", by_alias=True)
            source = Path(payload.source_path).expanduser().resolve(strict=True) if payload.source_path else (
                Path(locator["path"]).resolve(strict=True) if locator else None)
            if source is None or not source.is_file() or source.suffix.lower() != ".mkv":
                raise LiveLinkError("Choose a completed MKV recording for this OBS video span.", 400)
            before = source.stat()
            if before.st_size <= 0:
                raise LiveLinkError("OBS MKV is empty or still being written.", 409)
            await asyncio.sleep(0.3)
            settled = source.stat()
            if (before.st_size, before.st_mtime_ns) != (settled.st_size, settled.st_mtime_ns):
                raise LiveLinkError("OBS MKV is still being written; wait for recording finalization and retry.", 409)
            digest = hashlib.sha256()
            with source.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            sha256 = digest.hexdigest()
            if span.video_sha256 == sha256 and span.imported_video_asset_id:
                return media.get(project_id, span.imported_video_asset_id).model_dump(mode="json", by_alias=True)
            for existing in obs_livelink_runtime.status().get("videoSpans", []):
                if existing.get("videoSha256") == sha256 and existing.get("importedVideoAssetId"):
                    asset = media.get(project_id, existing["importedVideoAssetId"])
                    obs_livelink_runtime.link_video_asset(payload.span_id, asset.id, sha256)
                    return asset.model_dump(mode="json", by_alias=True)
            result = await media_importer.process_local_path(project, str(source), cache_local=True)
            after = source.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise LiveLinkError("OBS MKV changed during import; wait for recording finalization and retry.", 409)
            if result.asset.media_kind != "video":
                raise LiveLinkError("Selected MKV does not contain a video stream.", 400)
            obs_livelink_runtime.link_video_asset(payload.span_id, result.asset.id, sha256)
            return result.asset.model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project or media asset not found") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=400, detail="Selected MKV no longer exists") from exc
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/obs-livelink/v3/events")
    async def obs_livelink_events(request: Request):
        async def stream():
            previous = None
            while not await request.is_disconnected():
                snapshot = obs_livelink_runtime.status()
                serialized = json.dumps(snapshot, ensure_ascii=False)
                if serialized != previous:
                    yield f"data: {serialized}\n\n"
                    previous = serialized
                await asyncio.sleep(0.25)
        return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    @app.post("/api/obs-livelink/v3/hello")
    def obs_livelink_hello(payload: ObsLiveLinkHello, request: Request) -> dict:
        try:
            data = payload.model_dump(exclude_none=True)
            return obs_livelink_runtime.sync(data, obs_livelink_connection.hello(request.headers.get("authorization", ""), data), for_obs=True)
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/heartbeat")
    def obs_livelink_heartbeat(payload: ObsLiveLinkHeartbeat, request: Request) -> dict:
        try:
            data = payload.model_dump(exclude_none=True)
            return obs_livelink_runtime.sync(data, obs_livelink_connection.heartbeat(request.headers.get("authorization", ""), data), for_obs=True)
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/channels/{channel_id}/forward")
    def obs_livelink_forward(channel_id: str, payload: ObsLiveLinkForward) -> dict:
        try:
            return obs_livelink_runtime.status(obs_livelink_connection.set_forward(channel_id, payload.enabled))
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.get("/api/obs-livelink/v3/connections/{connection_id}/commands")
    def obs_livelink_commands(connection_id: str, request: Request, installId: str,
                              epoch: str, after: int = 0, waitSeconds: float = 20) -> dict:
        try:
            return obs_livelink_connection.commands(request.headers.get("authorization", ""),
                installId, connection_id, epoch, after, waitSeconds)
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/commands/ack")
    def obs_livelink_ack(payload: ObsLiveLinkAck, request: Request) -> dict:
        try:
            data = payload.model_dump()
            command = obs_livelink_connection.pending_command(data["commandId"])
            snapshot = obs_livelink_connection.acknowledge(request.headers.get("authorization", ""), data)
            if command:
                return obs_livelink_runtime.applied_ack(command, data)
            return obs_livelink_runtime.status(snapshot)
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/lifecycle")
    def obs_livelink_lifecycle(payload: dict, request: Request) -> dict:
        try:
            return obs_livelink_runtime.event(request.headers.get("authorization", ""), payload)
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/recording/actions")
    def obs_livelink_action(payload: ObsLiveLinkAction) -> dict:
        try:
            return obs_livelink_runtime.action(payload.action)
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/recordings/{recording_id}/recover")
    def obs_livelink_recover(recording_id: str, payload: dict, request: Request) -> dict:
        try:
            return obs_livelink_runtime.recover_recording(
                request.headers.get("authorization", ""), install_id=payload.get("installId", ""),
                connection_id=payload.get("connectionId", ""),
                epoch=payload.get("connectionEpoch", ""), recording_id=recording_id,
            )
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.put("/api/obs-livelink/v3/recordings/{recording_id}/channels/{channel_id}/chunks/{sequence}")
    async def obs_livelink_chunk(recording_id: str, channel_id: str, sequence: int,
                                 request: Request, installId: str, connectionId: str,
                                 epoch: str, sourceUuid: str, firstSampleIndex: int,
                                 frameCount: int, sampleRate: int, channels: int,
                                 obsAudioTimestampNs: int, pluginMonotonicNs: int,
                                 sha256: str) -> dict:
        try:
            obs_livelink_connection.require_connection(
                request.headers.get("authorization", ""), installId, connectionId, epoch,
            )
            pcm = bytearray()
            async for part in request.stream():
                pcm.extend(part)
                if len(pcm) > MAX_CHUNK_BYTES:
                    raise HTTPException(status_code=413, detail="OBS PCM chunk exceeds the upload limit")
            result = await asyncio.to_thread(
                obs_livelink_audio.chunk,
                request.headers.get("authorization", ""), install_id=installId,
                connection_id=connectionId, epoch=epoch, recording_id=recording_id,
                channel_id=channel_id, source_uuid=sourceUuid, sequence=sequence,
                first_sample_index=firstSampleIndex, frame_count=frameCount,
                sample_rate=sampleRate, channels=channels,
                obs_audio_timestamp_ns=obsAudioTimestampNs,
                plugin_monotonic_ns=pluginMonotonicNs, sha256=sha256,
                pcm=bytes(pcm),
            )
            if not result["duplicate"]:
                try:
                    state = obs_livelink_runtime._require_state()
                    recording = state.recording if state.recording and state.recording.recording_id == recording_id else next(
                        item for item in state.completed_recordings if item.recording_id == recording_id)
                    channel = next(item for item in state.channels if item.channel_id == channel_id)
                    obs_livelink_stt.offer(
                        project_id=recording.project_id, recording_id=recording_id,
                        channel_id=channel_id, source_uuid=sourceUuid, alias=channel.relay_label,
                        sequence=sequence, first_sample=firstSampleIndex,
                        sample_rate=sampleRate, channels=channels,
                        plugin_monotonic_ns=pluginMonotonicNs,
                        recording_started_ns=recording.started_monotonic_ns,
                        pcm=bytes(pcm),
                    )
                except Exception as exc:
                    # The durable PCM ACK must never depend on provisional STT.
                    logging.getLogger(__name__).warning(
                        "LiveLink STT could not accept durable chunk %s/%s/%s: %s",
                        recording_id, channel_id, sequence, exc,
                    )
            return result
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/recordings/{recording_id}/finalize")
    async def obs_livelink_finalize(recording_id: str, payload: dict, request: Request) -> dict:
        authorization = request.headers.get("authorization", "")
        try:
            obs_livelink_connection.require_connection(
                authorization, payload.get("installId", ""), payload.get("connectionId", ""),
                payload.get("connectionEpoch", ""))
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
        task = obs_finalizers.get(recording_id)
        if task is None:
            task = asyncio.create_task(finalize_obs_recording(recording_id, payload, authorization))
            obs_finalizers[recording_id] = task
        if task.done():
            result = task.result()
            if result.get("error"):
                raise HTTPException(status_code=503, detail=result["error"])
            return result
        # OBS has a short HTTP deadline. Keep its PCM/control loop running while
        # exactly one job verifies and publishes this stopped recording.
        return {"recordingId": recording_id, "artifactReady": False, "status": "finalizing"}

    async def finalize_obs_recording(recording_id: str, payload: dict, authorization: str) -> dict:
        try:
            result = await asyncio.to_thread(
                obs_livelink_audio.finalize,
                authorization,
                install_id=payload.get("installId", ""),
                connection_id=payload.get("connectionId", ""),
                epoch=payload.get("connectionEpoch", ""), recording_id=recording_id)
            return result
        except Exception as exc:
            logging.getLogger(__name__).exception("OBS archive failed for %s", recording_id)
            return {"recordingId": recording_id, "artifactReady": False, "error": str(exc)}
        finally:
            # Archive creation can fail after capture stopped. Its result must
            # not keep the provisional STT worker open past the recorded tail.
            state = obs_livelink_runtime._state
            if state and any(item.recording_id == recording_id and item.status == "stopped"
                             for item in state.completed_recordings):
                try:
                    obs_livelink_stt.finish(recording_id)
                except Exception as exc:
                    logging.getLogger(__name__).warning(
                        "LiveLink STT could not finalize recording %s: %s", recording_id, exc,
                    )

    @app.get("/api/projects/{project_id}/obs-livelink/recordings")
    def obs_livelink_recordings(project_id: str, includeDeleted: bool = False) -> list[dict]:
        try:
            root = Path(projects.get(project_id).project_path).resolve() / "assets" / "obs-livelink"
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        locator_status = {item["spanId"]: item for item in obs_livelink_runtime.status().get("videoSpans", [])}
        deleted_ids = deleted_recording_ids(root.parent.parent)
        asset_ids = {asset.id for asset in media.list_metadata(project_id)}
        records = [(path.parent, json.loads(path.read_text(encoding="utf-8")))
                   for path in sorted(root.glob("*/recording.json"),
                                      key=lambda item: item.stat().st_mtime, reverse=True)
                   if path.parent.name not in deleted_ids]
        records = [(folder, record) for folder, record in records
                   if includeDeleted or not record.get("deletedAt")]
        # Older deletes could leave a ready journal after its archive and PCM
        # disappeared. It is not a pending recording to offer in Media Pool.
        def orphan_ready(folder: Path, record: dict) -> bool:
            if record.get("deletedAt"):
                return False
            recording = record.get("recording", {})
            if recording.get("archiveStatus") != "ready":
                return False
            archive_id = (recording.get("sourceArchive") or {}).get("parentAssetId")
            if archive_id:
                return archive_id not in asset_ids
            return (not (folder / "source.mka").is_file()
                    and not any((folder / "channels").glob("*/chunks/*.json")))

        records = [(folder, record) for folder, record in records if not orphan_ready(folder, record)]
        for recording_folder, record in records:
            record["durableChannelIds"] = [
                channel_folder.name for channel_folder in (recording_folder / "channels").glob("*")
                if any((channel_folder / "chunks").glob("*.json"))
            ]
            if not record.get("deletedAt") and (recording_folder / "detailed-stt-state.json").is_file():
                try:
                    record["detailedStt"] = {
                        **obs_livelink_detailed_stt.status(projects.get(project_id),
                                                           record["recording"]["recordingId"]),
                        "error": obs_detailed_errors.get((project_id, record["recording"]["recordingId"])),
                    }
                except (OSError, ValueError, KeyError):
                    record["detailedStt"] = {"error": "Không đọc được checkpoint STT kỹ"}
            record["videoSpans"] = [{
                **span,
                **{key: locator_status[span["spanId"]][key]
                   for key in ("recordingFileName", "recordingFolder", "recordingFileAvailable")
                   if span.get("spanId") in locator_status},
            } for span in record.get("videoSpans", [])]
        return [record for _, record in records]

    @app.post("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/detailed-stt")
    async def start_obs_livelink_detailed_stt(
        project_id: str, recording_id: str, payload: ObsLiveLinkDetailedSttStart
    ) -> dict:
        try:
            configured = await asyncio.to_thread(
                obs_livelink_detailed_stt.configure, projects.get(project_id), recording_id,
                payload.segmentSeconds, payload.channelIds, payload.model,
            )
            ensure_obs_detail_worker(project_id, recording_id)
            return configured
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="OBS recording not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/detailed-stt/control")
    async def control_obs_livelink_detailed_stt(project_id: str, recording_id: str, payload: TaskStopRequest) -> dict:
        try:
            project = projects.get(project_id)
            await obs_livelink_detailed_stt.stop_recording(project, recording_id, include_active=payload.mode == "all")
            return obs_livelink_detailed_stt.status(project, recording_id)
        except ProcessingStopError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="OBS detailed STT not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/detailed-stt")
    def obs_livelink_detailed_stt_status(project_id: str, recording_id: str) -> dict:
        try:
            state = obs_livelink_detailed_stt.status(projects.get(project_id), recording_id)
            return {**state, "error": obs_detailed_errors.get((project_id, recording_id))}
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(status_code=404, detail="OBS detailed STT not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/obs-livelink/recordings/{recording_id}/archive/retry")
    def obs_livelink_archive_retry(project_id: str, recording_id: str) -> dict:
        try:
            projects.get(project_id)
            return obs_livelink_audio.retry(project_id, recording_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.put("/api/obs-livelink/v3/projects/{project_id}/trigger-policy")
    def obs_livelink_policy(project_id: str, payload: ObsTriggerPolicy) -> dict:
        try:
            return obs_livelink_runtime.set_policy(project_id, payload)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.put("/api/obs-livelink/v3/lease")
    def obs_livelink_lease(payload: ObsLiveLinkLease) -> dict:
        try:
            project = projects.get(payload.projectId)
            snapshot = obs_livelink_connection.claim(
                project_id=project.id, project_name=project.name, owner_id=payload.ownerId,
            )
            return obs_livelink_runtime.sync_current(snapshot)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Project not found") from exc
        except LiveLinkError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    @app.post("/api/obs-livelink/v3/lease/release")
    def obs_livelink_release(payload: ObsLiveLinkRelease) -> dict:
        return obs_livelink_runtime.sync_current(obs_livelink_connection.release(payload.ownerId))

    @app.post("/api/obs-plugin/installation")
    def obs_plugin_action(payload: ObsPluginActionRequest) -> dict:
        try:
            if payload.action == "open-obs":
                return obs_plugin_installation.open_obs(payload.obsRoot)
            if payload.action == "reset-pairing":
                return obs_plugin_installation.reset_pairing(payload.obsRoot)
            return obs_plugin_installation.apply(
                payload.action, payload.obsRoot, remove_pairing=payload.removePairing,
            )
        except ObsPluginInstallError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail="Windows từ chối ghi thư mục OBS. Hãy chạy app bằng quyền Administrator để cài plugin.") from exc
        except OSError as exc:
            raise HTTPException(status_code=503, detail=f"Không thể thay đổi OBS plugin: {exc}") from exc

    @app.get("/api/system/status", response_model=SystemMetrics)
    def system_status() -> SystemMetrics:
        return runtime_status.snapshot()

    @app.get("/api/activity", response_model=ActivitySnapshot)
    def activity(after: int = 0, limit: int = 400) -> ActivitySnapshot:
        """What the app is doing now, and the log lines since `after`."""
        return activity_center.CENTER.snapshot(after=max(0, after), limit=max(1, min(limit, 2000)))

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

    @app.post("/api/system/pick-media-files", response_model=MediaFilesPickResult)
    def pick_media_files(payload: MediaFilePickRequest) -> MediaFilesPickResult:
        try:
            return MediaFilesPickResult(paths=media_files.pick_many(payload.initial_path))
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

        # index.html is the only unfingerprinted file in a Vite bundle. Caching it
        # keeps serving the previous application after a rebuild.
        no_store = {"cache-control": "no-store, must-revalidate", "pragma": "no-cache"}

        @app.get("/{full_path:path}", include_in_schema=False)
        def frontend(full_path: str) -> Response:
            candidate = (settings.web_dist / full_path).resolve()
            if settings.web_dist.resolve() in candidate.parents and candidate.is_file():
                headers = no_store if candidate.name == "index.html" else None
                return FileResponse(candidate, headers=headers)
            return FileResponse(settings.web_dist / "index.html", headers=no_store)

    return app


app = create_app()
