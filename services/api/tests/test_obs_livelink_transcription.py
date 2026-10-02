import asyncio
import json
import struct
from uuid import uuid4

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.obs_livelink_transcription import ObsLiveLinkTranscription
from app.domain.models import ProjectCreate


def test_two_channels_partial_revision_alias_and_restart(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Live STT"))
    recording_id, channels = str(uuid4()), [str(uuid4()), str(uuid4())]
    sources = [str(uuid4()), str(uuid4())]
    from pathlib import Path
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text("{}", encoding="utf-8")
    calls = {}

    async def recognize(session, wav, _language):
        if wav is None:
            return {"text": calls[session][-1], "pending": ""}
        calls.setdefault(session, []).append("xin" if len(calls.get(session, [])) == 0 else "xin chào")
        return {"text": calls[session][-1], "pending": "đang" if len(calls[session]) == 1 else ""}

    async def run():
        stt = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                       recognize, window_seconds=0.01, silence_seconds=0.01)
        voiced = struct.pack("<" + "h" * 480, *([2000] * 480))
        silent = b"\0" * 960
        for index, channel_id in enumerate(channels):
            for sequence in range(2):
                stt.offer(project_id=project.id, recording_id=recording_id,
                          channel_id=channel_id, source_uuid=sources[index],
                          alias="Old" if sequence == 0 else "New",
                          sequence=sequence, first_sample=sequence * 480,
                          sample_rate=48000, channels=1,
                          plugin_monotonic_ns=1_000_000_000 + sequence * 10_000_000,
                          recording_started_ns=1_000_000_000, pcm=voiced)
            stt.offer(project_id=project.id, recording_id=recording_id,
                      channel_id=channel_id, source_uuid=sources[index], alias="New",
                      sequence=2, first_sample=960, sample_rate=48000, channels=1,
                      plugin_monotonic_ns=1_020_000_000,
                      recording_started_ns=1_000_000_000, pcm=silent)
        await asyncio.gather(*(queue.join() for queue in list(stt._queues.values())))
        events = stt.snapshot(project.id, recording_id)["events"]
        assert len(events) == 8
        for channel_id in channels:
            own = [event for event in events if event["channelId"] == channel_id]
            assert [event["status"] for event in own] == ["listening", "partial", "partial", "final"]
            assert [event["revision"] for event in own] == [1, 2, 3, 4]
            assert len({event["utteranceId"] for event in own}) == 1
            assert own[-1]["text"] == "xin chào"
            assert own[-1]["firstSampleIndex"] == 0
            assert own[-1]["lastSampleIndexExclusive"] == 960
            assert (own[-1]["startSeconds"], own[-1]["endSeconds"]) == (0, 0.02)
            assert own[-1]["alias"] == "New"
            assert own[-1]["timingTrust"] == "segment"
        reopened = ObsLiveLinkTranscription(projects, "http://unused", lambda: False, recognize)
        assert reopened.snapshot(project.id, recording_id, after_revision=8)["events"] == []
        assert len(reopened.snapshot(project.id, recording_id)["events"]) == 8
        # A torn final line after process loss is ignored, then removed on the next append.
        with (folder / "transcript-events.jsonl").open("ab") as output:
            output.write(b'{"eventRevision":9')
        recovered = ObsLiveLinkTranscription(projects, "http://unused", lambda: False, recognize,
                                             window_seconds=0.01)
        assert len(recovered.snapshot(project.id, recording_id)["events"]) == 8
        recovered.offer(project_id=project.id, recording_id=recording_id,
                        channel_id=channels[0], source_uuid=sources[0], alias="New",
                        sequence=3, first_sample=1440, sample_rate=48000, channels=1,
                        plugin_monotonic_ns=1_030_000_000,
                        recording_started_ns=1_000_000_000, pcm=voiced)
        await next(iter(recovered._queues.values())).join()
        resumed = recovered.snapshot(project.id, recording_id, after_revision=8)["events"][0]
        assert resumed["eventRevision"] == 9
        assert resumed["firstSampleIndex"] == 1440
        assert (resumed["startSeconds"], resumed["endSeconds"]) == (0.03, 0.03)
        assert recovered.snapshot(project.id, recording_id, after_revision=9)["events"][0]["endSeconds"] == 0.04

    asyncio.run(run())


def test_slow_or_failed_model_does_not_hold_audio_offer(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Live STT errors"))
    recording_id, channel_id = str(uuid4()), str(uuid4())
    from pathlib import Path
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text(json.dumps({}), encoding="utf-8")

    async def fail(_session, _wav, _language):
        await asyncio.sleep(0.05)
        raise RuntimeError("recognizer failed")

    async def run():
        stt = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                       fail, window_seconds=0.01, max_queue_chunks=16)
        pcm = struct.pack("<" + "h" * 480, *([2000] * 480))
        loop = asyncio.get_running_loop()
        started = loop.time()
        stt.offer(project_id=project.id, recording_id=recording_id,
                  channel_id=channel_id, source_uuid=str(uuid4()), alias="Mic",
                  sequence=0, first_sample=0, sample_rate=48000, channels=1,
                  plugin_monotonic_ns=1_000_000_000,
                  recording_started_ns=1_000_000_000, pcm=pcm)
        assert loop.time() - started < 0.02
        await next(iter(stt._queues.values())).join()
        event = stt.snapshot(project.id, recording_id)["events"][-1]
        assert event["status"] == "error" and "recognizer failed" in event["error"]
        assert event["channelId"] == channel_id

        # A blocked recognizer cannot grow the in-memory capture queue without bound.
        for sequence in range(1, 25):
            stt.offer(project_id=project.id, recording_id=recording_id,
                      channel_id=channel_id, source_uuid=str(uuid4()), alias="Mic",
                      sequence=sequence, first_sample=sequence * 480,
                      sample_rate=48000, channels=1,
                      plugin_monotonic_ns=1_000_000_000 + sequence * 10_000_000,
                      recording_started_ns=1_000_000_000, pcm=pcm)
        await next(iter(stt._queues.values())).join()
        assert any("queue is full" in (item["error"] or "") for item in
                   stt.snapshot(project.id, recording_id)["events"])

    asyncio.run(run())


def test_stop_drains_recorded_audio_once_and_rejects_late_live_stt(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Stopped Live STT"))
    recording_id, channel_id = str(uuid4()), str(uuid4())
    from pathlib import Path
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text("{}", encoding="utf-8")
    calls = []

    async def recognize(session, wav, _language):
        calls.append((session, wav is None))
        return {"text": "đã ghi", "pending": ""}

    async def run():
        stt = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                       recognize, window_seconds=1)
        pcm = struct.pack("<" + "h" * 480, *([2000] * 480))
        common = dict(project_id=project.id, recording_id=recording_id,
                      channel_id=channel_id, source_uuid=str(uuid4()), alias="Mic",
                      sample_rate=48000, channels=1,
                      recording_started_ns=1_000_000_000, pcm=pcm)
        stt.offer(**common, sequence=0, first_sample=0,
                  plugin_monotonic_ns=1_000_000_000)
        stt.finish(recording_id)
        stt.finish(recording_id)
        stt.offer(**common, sequence=1, first_sample=480,
                  plugin_monotonic_ns=1_010_000_000)
        await asyncio.wait_for(next(iter(stt._tasks.values())), timeout=2)
        events = stt.snapshot(project.id, recording_id)["events"]
        assert [item["status"] for item in events] == ["listening", "partial", "final"]
        assert events[-1]["lastSampleIndexExclusive"] == 480
        assert len(calls) == 2
        assert not stt._queues

    asyncio.run(run())


@pytest.mark.parametrize(("project_language", "expected_language"), [("vi", "vi"), (None, "")])
def test_live_stt_uses_project_language_and_quality_model(tmp_path, monkeypatch,
                                                          project_language, expected_language):
    from pathlib import Path

    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Lesson", language=project_language))
    recording_id, channel_id = str(uuid4()), str(uuid4())
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text("{}", encoding="utf-8")
    posted = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"text": "xin chào", "pending": ""}

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            pass

        async def post(self, url, **kwargs):
            posted.append((url, kwargs))
            return Response()

    monkeypatch.setattr("app.adapters.obs_livelink_transcription.httpx.AsyncClient", Client)

    async def run():
        stt = ObsLiveLinkTranscription(projects, "http://studio", lambda: False,
                                       window_seconds=0.01)
        stt.offer(project_id=project.id, recording_id=recording_id,
                  channel_id=channel_id, source_uuid=str(uuid4()), alias="Track 1",
                  sequence=0, first_sample=0, sample_rate=48000, channels=1,
                  plugin_monotonic_ns=1_000_000_000,
                  recording_started_ns=1_000_000_000,
                  pcm=struct.pack("<" + "h" * 480, *([2000] * 480)))
        stt.finish(recording_id)
        await asyncio.wait_for(next(iter(stt._tasks.values())), timeout=2)

    asyncio.run(run())
    chunks = [args["data"] for url, args in posted if url.endswith("/chunk")]
    assert len(chunks) == 1
    assert chunks[0]["session"].startswith(f"obs-v3-{recording_id}-{channel_id}-")
    assert chunks[0]["model"] == "medium"
    assert chunks[0]["language"] == expected_language
    assert posted[-1][0].endswith("/end")


def test_transcript_event_api_returns_cursor_delta(tmp_path):
    from dataclasses import replace
    from pathlib import Path
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.settings import Settings

    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Live transcript API"))
    recording_id = str(uuid4())
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text("{}", encoding="utf-8")
    event = {"schemaVersion": 1, "eventRevision": 1, "recordingId": recording_id,
             "channelId": str(uuid4()), "utteranceId": "utterance-1", "revision": 1,
             "status": "partial", "text": "hello", "pending": "", "timingTrust": "segment"}
    (folder / "transcript-events.jsonl").write_text(json.dumps(event) + "\n", encoding="utf-8")
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    client = TestClient(create_app(project_repository=projects, settings=settings))
    route = f"/api/projects/{project.id}/obs-livelink/recordings/{recording_id}/transcript-events"
    assert client.get(route).json()["events"] == [event]
    assert client.get(route, params={"afterRevision": 1}).json()["events"] == []
    assert client.get(route.replace(recording_id, str(uuid4()))).status_code == 404
