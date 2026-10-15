from __future__ import annotations

import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import Field

from app.adapters.file_voice_edits import FileVoiceEdits
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.adapters.voice_render import VoiceRenderService
from app.domain.models import DomainModel


class VoiceRenderRequest(DomainModel):
    expected_script_revision: int = Field(alias="expectedScriptRevision", ge=0)
    expected_edit_revision: int = Field(alias="expectedEditRevision", ge=0)


def make_voice_render_router(edits: FileVoiceEdits, scripts: FileVoiceScript) -> APIRouter:
    router = APIRouter()
    service = VoiceRenderService(edits, scripts)
    prefix = "/api/projects/{project_id}/voice-outputs/{output_id}"

    @router.get(prefix + "/render")
    def latest(project_id: str, output_id: str):
        try:
            return service.latest(project_id, output_id)
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(404, "Chưa có render hiện tại") from exc
        except (ValueError, OSError, TypeError) as exc:
            raise HTTPException(404, "Render không còn hợp lệ") from exc

    @router.post(prefix + "/render")
    def render(project_id: str, output_id: str, request: VoiceRenderRequest):
        try:
            return service.render(project_id, output_id, request.expected_script_revision, request.expected_edit_revision)
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(404, "Output không tồn tại") from exc
        except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get(prefix + "/rendered/{key}/audio")
    def audio(project_id: str, output_id: str, key: str):
        try:
            return FileResponse(service.audio_path(project_id, output_id, key), media_type="audio/wav", filename="voice-render.wav")
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(404, "Render audio không tồn tại") from exc
        except (ValueError, OSError, TypeError) as exc:
            raise HTTPException(404, "Render audio không hợp lệ") from exc

    @router.get(prefix + "/rendered/{key}/waveform")
    async def waveform(project_id: str, output_id: str, key: str, start: float | None = None, end: float | None = None, points: int | None = None):
        try:
            return await asyncio.to_thread(service.waveform, project_id, output_id, key, start, end, points)
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(404, "Render waveform không tồn tại") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    return router
