from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
from fastapi import Request, Response


class LegacyStudioGateway:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    async def proxy(self, path: str, request: Request) -> Response:
        target_path = f"/media/{path.removeprefix('media/')}" if path.startswith("media/") else f"/api/{path}"
        headers = {
            key: value
            for key, value in request.headers.items()
            if key.lower() in {"content-type", "accept", "range"}
        }

        async def request_body() -> AsyncIterator[bytes]:
            async for chunk in request.stream():
                yield chunk

        timeout = httpx.Timeout(900.0, connect=3.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(
                    request.method,
                    f"{self.base_url}{target_path}",
                    params=request.query_params,
                    headers=headers,
                    content=request_body(),
                )
        except httpx.RequestError:
            return Response(
                content=(
                    '{"detail":"OmniVoice Studio runtime chưa chạy. '
                    'Hãy mở app bằng start-pro4bro.bat."}'
                ),
                status_code=503,
                media_type="application/json",
            )

        response_headers = {
            key: value
            for key, value in response.headers.items()
            if key.lower()
            in {"content-disposition", "accept-ranges", "content-range", "content-type"}
        }
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=response_headers,
        )
