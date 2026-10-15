from __future__ import annotations

from typing import Literal

from app.domain.models import DomainModel
from app.domain.voice_script_document import VoiceScriptDocument, effective_settings


DeliveryCapabilityState = Literal["not-requested", "supported", "unsupported", "blocked", "separate", "informational"]


def unsupported_synthesis_settings(settings: dict) -> dict:
    """Baseline selections do not add conditioning or change voice identity."""
    return {key: value for key, value in settings.items()
            if key not in {"note", "locked", "duration", "gainDb"} and value is not None
            and (key, value) not in [("delivery", "neutral"), ("emotion", "normal")]}


class VoiceDeliveryDecision(DomainModel):
    state: DeliveryCapabilityState
    requested: str | float | None = None
    effective: str | float | None = None
    method: str | None = None
    reason: str


class VoiceDeliveryRowReport(DomainModel):
    row_id: str
    voice_id: str | None = None
    state: Literal["ready", "blocked"]
    synthesis_ready: bool
    settings: dict[str, VoiceDeliveryDecision]
    blockers: list[str]


class VoiceDeliveryReport(DomainModel):
    version: Literal[1] = 1
    script_revision: int
    rows: list[VoiceDeliveryRowReport]


_KNOWN_EMOTIONS = {
    "exciting", "funny", "good", "normal", "low-energy", "sad", "cry", "angry", "critical", "mix",
}


def _delivery_decision(value: str | None, voice_id: str | None) -> VoiceDeliveryDecision:
    if not value:
        return VoiceDeliveryDecision(state="not-requested", reason="Không có yêu cầu cách phát giọng riêng.")
    if value == "neutral":
        if not voice_id:
            return VoiceDeliveryDecision(
                state="blocked", requested=value,
                reason="Cần chọn voice của project để xác định giọng mặc định giữ danh tính.",
            )
        return VoiceDeliveryDecision(
            state="supported", requested=value, effective="neutral", method="selected-project-voice-default",
            reason="Dùng giọng mặc định của voice đã chọn; không thêm conditioning cách phát giọng.",
        )
    return VoiceDeliveryDecision(
        state="unsupported", requested=value,
        reason="Worker hiện chưa có conditioning delivery đã kiểm chứng cho voice clone/train này; yêu cầu chưa được áp dụng.",
    )


def _mood_decision(value: str | None) -> VoiceDeliveryDecision:
    if not value or not value.strip():
        return VoiceDeliveryDecision(state="not-requested", reason="Không có yêu cầu mood.")
    return VoiceDeliveryDecision(
        state="unsupported", requested=value,
        reason="Mood được lưu như ý định Script nhưng chưa có mapping conditioning đã kiểm chứng.",
    )


def _emotion_decision(value: str | None, voice_id: str | None) -> VoiceDeliveryDecision:
    if not value or not value.strip():
        return VoiceDeliveryDecision(state="not-requested", reason="Không có yêu cầu emotion.")
    if value == "normal":
        if not voice_id:
            return VoiceDeliveryDecision(
                state="blocked", requested=value,
                reason="Cần chọn voice của project để xác định baseline neutral giữ danh tính.",
            )
        return VoiceDeliveryDecision(
            state="supported", requested=value, effective="normal", method="selected-project-voice-default",
            reason="Normal dùng baseline của voice đã chọn; không thêm emotion conditioning.",
        )
    if value in _KNOWN_EMOTIONS:
        reason = "Emotion này chưa có processor conditioning đã kiểm chứng cho voice identity đã chọn."
    else:
        reason = "Emotion label chưa được nhận diện và không có mapping conditioning đã kiểm chứng."
    return VoiceDeliveryDecision(state="unsupported", requested=value, reason=reason)


def _intensity_decision(value: float | None) -> VoiceDeliveryDecision:
    if value is None:
        return VoiceDeliveryDecision(state="not-requested", reason="Không có yêu cầu intensity.")
    return VoiceDeliveryDecision(
        state="unsupported", requested=value,
        reason="Intensity chưa có conditioning engine; không được chuyển thành gain âm lượng.",
    )


def _gain_decision(value: float | None) -> VoiceDeliveryDecision:
    if value is None:
        return VoiceDeliveryDecision(state="not-requested", reason="Không có gain yêu cầu.")
    return VoiceDeliveryDecision(
        state="separate", requested=value,
        reason="Gain áp dụng bằng nút Áp dụng âm lượng sau khi tạo voice; không phải delivery conditioning.",
    )


def _note_decision(value: str | None) -> VoiceDeliveryDecision:
    if not value or not value.strip():
        return VoiceDeliveryDecision(state="not-requested", reason="Không có note.")
    return VoiceDeliveryDecision(
        state="informational", requested=value,
        reason="Note được giữ trong Script nhưng không gửi tới engine và không chặn generation.",
    )


def inspect_voice_delivery(document: VoiceScriptDocument) -> VoiceDeliveryReport:
    """Report which Script delivery requests the current product can honor.

    This is a read-only preflight: it does not contact an engine, alter Script
    data, or claim that audio has been conditioned.
    """
    rows: list[VoiceDeliveryRowReport] = []
    for row in document.rows:
        settings = effective_settings(document, row)
        decisions = {
            "delivery": _delivery_decision(settings.get("delivery"), row.voice_id),
            "mood": _mood_decision(settings.get("mood")),
            "emotion": _emotion_decision(settings.get("emotion"), row.voice_id),
            "intensity": _intensity_decision(settings.get("intensity")),
            "gainDb": _gain_decision(settings.get("gainDb")),
            "note": _note_decision(settings.get("note")),
        }
        blockers = []
        if not row.voice_id:
            blockers.append("Câu chưa có voice được chọn.")
        blockers.extend(
            f"{name}: {decision.reason}"
            for name, decision in decisions.items()
            if decision.state == "unsupported"
        )
        blockers.extend(
            f"{name}: {decision.reason}"
            for name, decision in decisions.items()
            if decision.state == "blocked"
        )
        rows.append(VoiceDeliveryRowReport(
            row_id=row.id,
            voice_id=row.voice_id,
            state="blocked" if blockers else "ready",
            synthesis_ready=not blockers,
            settings=decisions,
            blockers=blockers,
        ))
    return VoiceDeliveryReport(script_revision=document.revision, rows=rows)
