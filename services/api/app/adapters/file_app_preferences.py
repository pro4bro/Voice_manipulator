from __future__ import annotations

import json
from pathlib import Path

from app.domain.models import AIReviewPreferences, AppPreferences, EmotionStylePreferences


class FileAppPreferences:
    """Machine-local preferences kept outside portable project folders."""

    def __init__(self, data_root: Path) -> None:
        self.path = data_root / "preferences.json"

    def get(self) -> AppPreferences:
        private = self.private_ai_review()
        public = private.model_copy(
            update={"api_key": None, "api_key_configured": bool(private.api_key)}
        )
        return AppPreferences(ai_review=public, emotion_style=self.emotion_style())

    def save(self, incoming: AppPreferences) -> AppPreferences:
        previous = self.private_ai_review()
        requested = incoming.ai_review
        private = requested.model_copy(
            update={
                "api_key": previous.api_key if requested.api_key is None else requested.api_key,
                "api_key_configured": False,
            }
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(
                {
                    "aiReview": private.model_dump(by_alias=True),
                    "emotionStyle": incoming.emotion_style.model_dump(by_alias=True),
                },
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

    def _read(self) -> dict[str, object]:
        if not self.path.is_file():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, TypeError, ValueError):
            return {}