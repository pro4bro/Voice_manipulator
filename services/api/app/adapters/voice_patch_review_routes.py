from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.adapters.voice_patch_reviews import VoicePatchReviewRequest, VoicePatchReviews


def make_voice_patch_review_router(reviews: VoicePatchReviews) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-patch/history")

    @router.get("/{output_id}/review")
    def get_review(project_id: str, output_id: str):
        try:
            return reviews.get(project_id, output_id)
        except KeyError as exc:
            raise HTTPException(404, "Accepted Voice Patch output does not exist") from exc
        except (OSError, ValueError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/{output_id}/review")
    def save_review(project_id: str, output_id: str, request: VoicePatchReviewRequest):
        try:
            return reviews.save(project_id, output_id, request)
        except KeyError as exc:
            raise HTTPException(404, "Accepted Voice Patch output does not exist") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return router
