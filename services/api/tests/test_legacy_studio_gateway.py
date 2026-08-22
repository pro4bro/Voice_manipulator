from __future__ import annotations

from fastapi import FastAPI, Request, Response
from fastapi.testclient import TestClient

from app.adapters.legacy_studio_gateway import LegacyStudioGateway


def test_studio_gateway_reports_an_offline_runtime() -> None:
    gateway = LegacyStudioGateway("http://127.0.0.1:1")
    app = FastAPI()

    @app.api_route("/studio/{path:path}", methods=["GET", "POST"])
    async def proxy(path: str, request: Request) -> Response:
        return await gateway.proxy(path, request)

    response = TestClient(app).get("/studio/status")

    assert response.status_code == 503
    assert "start-pro4bro.bat" in response.json()["detail"]

