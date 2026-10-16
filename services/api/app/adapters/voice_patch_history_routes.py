from fastapi import APIRouter, HTTPException, Query

from app.adapters.voice_patch_history import VoicePatchHistory


def make_voice_patch_history_router(history: VoicePatchHistory) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-patch")

    @router.get("/history")
    def revisions(project_id: str, sourceId: str | None = Query(default=None, max_length=100)):
        try:
            return history.list(project_id, sourceId)
        except KeyError as exc:
            raise HTTPException(404, "Project does not exist") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    return router
