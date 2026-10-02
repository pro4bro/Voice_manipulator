import asyncio
import hashlib
import time
from dataclasses import replace
from uuid import uuid4

import httpx

from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from app.adapters.obs_livelink_connection import ObsLiveLinkConnection
from app.main import create_app
from app.settings import Settings


def test_slow_pcm_persistence_does_not_block_other_requests(tmp_path, monkeypatch):
    def slow_chunk(self, *args, **kwargs):
        time.sleep(0.5)
        return {"sequence": 0, "durable": True, "duplicate": True}

    monkeypatch.setattr(FileObsLiveLinkAudio, "chunk", slow_chunk)
    monkeypatch.setattr(ObsLiveLinkConnection, "require_connection", lambda *args: None)
    app = create_app(settings=replace(Settings.from_env(), data_root=tmp_path / "data"))
    pcm = b"\0\0"
    route = (f"/api/obs-livelink/v3/recordings/{uuid4()}/channels/{uuid4()}/chunks/0")
    params = {
        "installId": str(uuid4()), "connectionId": str(uuid4()), "epoch": "test",
        "sourceUuid": str(uuid4()), "firstSampleIndex": 0, "frameCount": 1,
        "sampleRate": 48000, "channels": 1, "obsAudioTimestampNs": 1,
        "pluginMonotonicNs": 1, "sha256": hashlib.sha256(pcm).hexdigest(),
    }

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                    base_url="http://test") as client:
            started = time.monotonic()
            upload = asyncio.create_task(client.put(route, params=params, content=pcm))
            health = asyncio.create_task(client.get("/api/health"))
            health_response = await health
            health_elapsed = time.monotonic() - started
            upload_response = await upload
            return health_response, health_elapsed, upload_response

    health, elapsed, upload = asyncio.run(run())
    assert upload.status_code == 200
    assert health.status_code == 200
    assert elapsed < 0.35, f"Slow PCM persistence blocked the API for {elapsed:.2f}s"


def test_finalize_acknowledges_without_waiting_and_deduplicates_retries(tmp_path, monkeypatch):
    calls = []
    def slow_finalize(self, *args, **kwargs):
        calls.append(kwargs["recording_id"])
        time.sleep(.5)
        return {"artifactReady": True}
    monkeypatch.setattr(FileObsLiveLinkAudio, "finalize", slow_finalize)
    monkeypatch.setattr(ObsLiveLinkConnection, "require_connection", lambda *args: None)
    app = create_app(settings=replace(Settings.from_env(), data_root=tmp_path / "data"))
    route = f"/api/obs-livelink/v3/recordings/{uuid4()}/finalize"
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            started = time.monotonic()
            first = await client.post(route, json={})
            elapsed = time.monotonic() - started
            second = await client.post(route, json={})
            await asyncio.sleep(.65)
            third = await client.post(route, json={})
            return elapsed, first, second, third
    elapsed, first, second, third = asyncio.run(run())
    assert elapsed < .3, "Finalize held the OBS transport while encoding the archive"
    assert first.status_code == second.status_code == third.status_code == 200
    assert not first.json()["artifactReady"]
    assert third.json()["artifactReady"]
    assert len(calls) == 1
