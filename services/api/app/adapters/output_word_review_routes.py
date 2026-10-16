from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.adapters.output_word_review import OutputWordReview


def make_output_word_review_router(service: OutputWordReview) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-outputs/{output_id}/word-review")

    @router.get("")
    def plan(project_id: str, output_id: str):
        try:
            return service.plan(project_id, output_id)
        except KeyError as exc:
            raise HTTPException(404, "Project or Voice Output does not exist") from exc
        except (OSError, ValueError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.get("/audio")
    def audio(project_id: str, output_id: str, index: int = Query(ge=0), key: str = Query(min_length=64, max_length=64)):
        try:
            path, provenance = service.audio(project_id, output_id, index, key)
            headers = {
                "X-Word-Review-Output-ID": provenance["outputId"],
                "X-Word-Review-Index": str(provenance["wordIndex"]),
                "X-Word-Review-Key": provenance["key"],
                "X-Word-Review-Audio-SHA256": provenance["audioSha256"],
                "X-Word-Review-Sample-Rate": str(provenance["sampleRate"]),
                "X-Word-Review-Start-Frame": str(provenance["startFrame"]),
                "X-Word-Review-End-Frame": str(provenance["endFrame"]),
            }
            return FileResponse(path, media_type="audio/wav", filename=f"word-{index}.wav", headers=headers)
        except KeyError as exc:
            raise HTTPException(404, "Voice Output or word does not exist") from exc
        except (OSError, ValueError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return router
