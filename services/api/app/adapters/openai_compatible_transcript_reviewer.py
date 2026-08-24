from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.adapters.file_app_preferences import FileAppPreferences


@dataclass(frozen=True)
class ReviewOutcome:
    text: str
    status: str
    error: str | None = None


class OpenAICompatibleTranscriptReviewer:
    """Review transcript text only when a local OpenAI-compatible provider is configured."""

    def __init__(self, preferences: FileAppPreferences) -> None:
        self.preferences = preferences

    async def review(self, text: str) -> ReviewOutcome:
        settings = self.preferences.private_ai_review()
        if not settings.enabled or not settings.api_key or not settings.base_url or not settings.model:
            return ReviewOutcome(text=text, status="skipped")
        request_body = {
            "model": settings.model,
            "temperature": 0,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a careful speech-transcript editor. Preserve the language, names, "
                        "meaning, punctuation, and line breaks. Correct only obvious recognition errors. "
                        "Return only the corrected transcript, with no explanation or markdown."
                    ),
                },
                {"role": "user", "content": text},
            ],
        }
        url = f"{settings.base_url.rstrip('/')}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
                response = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {settings.api_key}"},
                    json=request_body,
                )
            payload = response.json()
            if response.is_error:
                return ReviewOutcome(
                    text=text,
                    status="error",
                    error=str(payload.get("error", {}).get("message") or payload.get("detail") or f"HTTP {response.status_code}"),
                )
            corrected = str(
                payload.get("choices", [{}])[0].get("message", {}).get("content", "")
            ).strip()
            return ReviewOutcome(text=corrected or text, status="complete")
        except (httpx.HTTPError, IndexError, KeyError, TypeError, ValueError) as exc:
            return ReviewOutcome(text=text, status="error", error=str(exc))