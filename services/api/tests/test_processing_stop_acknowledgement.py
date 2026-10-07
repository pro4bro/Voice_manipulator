from __future__ import annotations

import asyncio

import httpx
import pytest

from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.processing_cancellation import ProcessingCancellation, ProcessingStopError
from app.adapters.studio_diarization_gateway import StudioDiarizationGateway


class FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        self.request = httpx.Request("POST", "http://studio/cancel")
        self.response = httpx.Response(status_code, request=self.request)

    def raise_for_status(self) -> None:
        self.response.raise_for_status()


class FakeClient:
    def __init__(self, *, status_code: int | None = None, error: Exception | None = None, **_kwargs) -> None:
        self.status_code = status_code
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def post(self, _url: str):
        if self.error:
            raise self.error
        return FakeResponse(self.status_code or 200)


@pytest.mark.parametrize("status_code", [404, 503])
@pytest.mark.parametrize("gateway_kind", ["stt", "diarization"])
def test_cancel_acknowledgement_http_failures_are_reported(monkeypatch, status_code, gateway_kind) -> None:
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: FakeClient(status_code=status_code, **kwargs),
    )
    async def run() -> None:
        if gateway_kind == "stt":
            target = MediaImportProcessor("http://studio", None)._cancel_studio_job("job", "import")
        else:
            target = StudioDiarizationGateway("http://studio")._cancel("job", "diarize")
        with pytest.raises(ProcessingStopError):
            await target

    asyncio.run(run())


@pytest.mark.parametrize("gateway_kind", ["stt", "diarization"])
def test_cancel_acknowledgement_connection_failure_is_reported(monkeypatch, gateway_kind) -> None:
    request = httpx.Request("POST", "http://studio/cancel")
    error = httpx.ConnectError("offline", request=request)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: FakeClient(error=error, **kwargs))

    async def run() -> None:
        if gateway_kind == "stt":
            await MediaImportProcessor("http://studio", None)._cancel_studio_job("job", "import")
        else:
            await StudioDiarizationGateway("http://studio")._cancel("job", "diarize")

    with pytest.raises(ProcessingStopError):
        asyncio.run(run())


def test_successful_cancel_ack_marks_processing_stopped_as_confirmed(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: FakeClient(status_code=200, **kwargs))
    cancellation = ProcessingCancellation()

    async def run() -> None:
        await cancellation.install_cancel_handler(
            lambda: MediaImportProcessor("http://studio", None)._cancel_studio_job("job", "import")
        )
        await cancellation.cancel()

    asyncio.run(run())
    assert cancellation.cancelled is True
    assert cancellation.cancel_confirmed is True
    assert cancellation.cancel_error is None
