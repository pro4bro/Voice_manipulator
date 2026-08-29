from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any
from uuid import uuid4

import asyncio
import httpx

DiarizationProgressCallback = Callable[[float], Awaitable[None]]


class StudioDiarizationGateway:
    """Local-only adapter for the GPU diarization processor in the Studio runtime."""

    def __init__(self, studio_url: str) -> None:
        self.studio_url = studio_url.rstrip("/")

    async def diarize(
        self,
        analysis_path: Path,
        *,
        token: str | None,
        model: str,
        expected_speakers: int | None = None,
        on_progress: DiarizationProgressCallback | None = None,
    ) -> list[dict[str, Any]]:
        if not token:
            raise RuntimeError("Cần Hugging Face token cho Speaker Diarization. Mở Windows → Preferences, chấp nhận model community-1 rồi nhập token.")
        progress_id = uuid4().hex
        latest = -1.0

        async def publish(value: object) -> None:
            nonlocal latest
            try:
                numeric = round(max(0.0, min(100.0, float(value))), 1)
            except (TypeError, ValueError):
                return
            if on_progress and numeric > latest:
                latest = numeric
                await on_progress(numeric)

        timeout = httpx.Timeout(timeout=None, connect=5.0)
        try:
            with analysis_path.open("rb") as audio:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    task = asyncio.create_task(client.post(
                        f"{self.studio_url}/api/audio/diarize",
                        files={"file": (analysis_path.name, audio, "audio/wav")},
                        data={"progress_id": progress_id, "model": model, "expected_speakers": str(expected_speakers or 0)},
                        headers={"X-Pro4Bro-HuggingFace-Token": token},
                    ))
                    while not task.done():
                        await asyncio.sleep(0.2)
                        try:
                            status = await client.get(
                                f"{self.studio_url}/api/audio/diarize/{progress_id}/progress",
                                timeout=httpx.Timeout(1.5, connect=1.0),
                            )
                            if not status.is_error:
                                await publish(status.json().get("progress", 0))
                        except httpx.RequestError:
                            continue
                    response = await task
        except httpx.RequestError as exc:
            raise RuntimeError("OmniVoice Studio runtime chưa chạy.") from exc
        payload = response.json()
        if response.is_error:
            raise RuntimeError(str(payload.get("detail") or f"Speaker Diarization thất bại ({response.status_code})."))
        await publish(100)
        spans = payload.get("spans", [])
        return [dict(span) for span in spans if isinstance(span, dict)]