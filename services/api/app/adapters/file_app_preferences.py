from __future__ import annotations

import json
from pathlib import Path

from app.domain.models import (
    AIReviewPreferences,
    AppPreferences,
    DiarizationPreferences,
    EmotionStylePreferences,
    SpeakerSimilarityPreferences,
    TimelinePreferences,
)


class FileAppPreferences:
    """Machine-local preferences kept outside portable project folders."""

    def __init__(self, data_root: Path) -> None:
        self.path = data_root / "preferences.json"

    def get(self) -> AppPreferences:
        private = self.private_ai_review()
        public = private.model_copy(
            update={"api_key": None, "api_key_configured": bool(private.api_key)}
        )
        private_diarization = self.private_diarization()
        public_diarization = private_diarization.model_copy(
            update={"huggingface_token": None, "huggingface_token_configured": bool(private_diarization.huggingface_token)}
        )
        return AppPreferences(
            ai_review=public,
            diarization=public_diarization,
            speaker_similarity=self.speaker_similarity(),
            emotion_style=self.emotion_style(),
            timeline=self.timeline(),
        )

    def save(self, incoming: AppPreferences) -> AppPreferences:
        previous = self.private_ai_review()
        requested = incoming.ai_review
        private = requested.model_copy(
            update={
                "api_key": previous.api_key if requested.api_key is None else requested.api_key,
                "api_key_configured": False,
            }
        )
        previous_diarization = self.private_diarization()
        requested_diarization = incoming.diarization
        private_diarization = requested_diarization.model_copy(
            update={
                "huggingface_token": previous_diarization.huggingface_token if requested_diarization.huggingface_token is None else requested_diarization.huggingface_token,
                "huggingface_token_configured": False,
            }
        )
        existing = self._read()
        stored = {
            **existing,
            "aiReview": {**self._section(existing, "aiReview"), **private.model_dump(by_alias=True)},
            "diarization": {**self._section(existing, "diarization"), **private_diarization.model_dump(by_alias=True)},
            "speakerSimilarity": {**self._section(existing, "speakerSimilarity"), **incoming.speaker_similarity.model_dump(by_alias=True)},
            "emotionStyle": {**self._section(existing, "emotionStyle"), **incoming.emotion_style.model_dump(by_alias=True)},
            "timeline": {**self._section(existing, "timeline"), **incoming.timeline.model_dump(by_alias=True)},
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(
                stored,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        temporary.replace(self.path)
        return self.get()

    def private_ai_review(self) -> AIReviewPreferences:
        raw = self._read()
        try:
            return AIReviewPreferences.model_validate(raw.get("aiReview", {}))
        except (TypeError, ValueError):
            return AIReviewPreferences()

    def emotion_style(self) -> EmotionStylePreferences:
        raw = self._read()
        try:
            return EmotionStylePreferences.model_validate(raw.get("emotionStyle", {}))
        except (TypeError, ValueError):
            return EmotionStylePreferences()

    def private_diarization(self) -> DiarizationPreferences:
        raw = self._read()
        try:
            return DiarizationPreferences.model_validate(raw.get("diarization", {}))
        except (TypeError, ValueError):
            return DiarizationPreferences()

    def speaker_similarity(self) -> SpeakerSimilarityPreferences:
        raw = self._read()
        try:
            return SpeakerSimilarityPreferences.model_validate(raw.get("speakerSimilarity", {}))
        except (TypeError, ValueError):
            return SpeakerSimilarityPreferences()

    def timeline(self) -> TimelinePreferences:
        raw = self._read()
        try:
            return TimelinePreferences.model_validate(raw.get("timeline", {}))
        except (TypeError, ValueError):
            return TimelinePreferences()

    @staticmethod
    def _section(raw: dict[str, object], key: str) -> dict[str, object]:
        value = raw.get(key)
        return value if isinstance(value, dict) else {}

    def _read(self) -> dict[str, object]:
        if not self.path.is_file():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, TypeError, ValueError):
            return {}
