from __future__ import annotations

from fastapi import APIRouter

from app.domain.voice_delivery import VoiceDeliveryReport, inspect_voice_delivery
from app.domain.voice_script_document import VoiceScriptDocument


def make_voice_delivery_router() -> APIRouter:
    """Create a read-only Script delivery capability preflight route."""
    router = APIRouter(tags=["voice-delivery"])

    @router.post("/api/voice-script/delivery-capabilities", response_model=VoiceDeliveryReport)
    def check_delivery_capabilities(document: VoiceScriptDocument) -> VoiceDeliveryReport:
        return inspect_voice_delivery(document)

    return router
