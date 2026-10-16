from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.adapters.voice_patch_audition import VoicePatchAudition, VoicePatchSourceUnavailable


def make_voice_patch_audition_router(audition: VoicePatchAudition) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-patch/history")

    @router.get("/{output_id}/audition")
    def plan(project_id: str, output_id: str):
        try:
            return audition.plan(project_id, output_id)
        except KeyError as exc:
            raise HTTPException(404, "Accepted Voice Patch output does not exist") from exc
        except (OSError, ValueError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.get("/{output_id}/audition/audio")
    def audio(project_id: str, output_id: str, kind: Literal["source", "variant"] = Query(default="variant"),
        view: Literal["region", "head", "tail", "full"] = Query(default="full"), key: str | None = Query(default=None)):
        try:
            path, provenance = audition.audio(project_id, output_id, kind, view, key)
            headers = {
                "X-Audition-Source-SHA256": provenance["sourceSha256"],
                "X-Audition-Sample-Rate": str(provenance["sampleRate"]),
                "X-Audition-Start-Frame": str(provenance["startFrame"]),
                "X-Audition-End-Frame": str(provenance["endFrame"]),
                "X-Audition-Output-ID": provenance["acceptedOutputId"],
                "X-Audition-Key": provenance["key"],
            }
            return FileResponse(path, media_type="audio/wav", filename=f"patch-{kind}-{view}.wav", headers=headers)
        except VoicePatchSourceUnavailable as exc:
            raise HTTPException(409, str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(404, "Accepted Voice Patch output does not exist") from exc
        except (OSError, ValueError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return router
