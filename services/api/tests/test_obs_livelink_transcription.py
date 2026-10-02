import asyncio
import hashlib
import json
import struct
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.obs_livelink_transcription import ObsLiveLinkTranscription
from app.domain.models import ProjectCreate


def test_full_live_queue_replays_committed_pcm_in_order_on_both_tracks(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Live STT catch-up"))
    recording_id = str(uuid4())
    root = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    root.mkdir(parents=True)
    (root / "recording.json").write_text("{}", encoding="utf-8")
    channels = [(str(uuid4()), str(uuid4())), (str(uuid4()), str(uuid4()))]
    recognized = []

    async def recognize(session, wav, _language):
        if wav is not None:
            await asyncio.sleep(0.005)
            recognized.append(session)
        return {"text": "đã nhận", "pending": ""}

    async def run():
        stt = ObsLiveLinkTranscription(
            projects, "http://unused", lambda: False, recognize,
            window_seconds=0.01, max_queue_chunks=1, max_queued_bytes=960,
        )
        for sequence in range(24):
            for channel_id, source_uuid in channels:
                pcm = struct.pack("<480h", *([2000 + sequence] * 480))
                folder = root / "channels" / channel_id / "chunks"
                folder.mkdir(parents=True, exist_ok=True)
                stem = f"{sequence:012d}"
                (folder / f"{stem}.pcm").write_bytes(pcm)
                (folder / f"{stem}.json").write_text(json.dumps({
                    "sequence": sequence, "firstSampleIndex": sequence * 480,
                    "frameCount": 480, "sampleRate": 48000, "channels": 1,
                    "pluginMonotonicNs": 1_000_000_000 + sequence * 10_000_000,
                    "sourceUuid": source_uuid, "sha256": hashlib.sha256(pcm).hexdigest(),
                    "receivedAtUtc": datetime.now(timezone.utc).isoformat(),
                }), encoding="utf-8")
                stt.offer(project_id=project.id, recording_id=recording_id,
                          channel_id=channel_id, source_uuid=source_uuid, alias="Mic",
                          sequence=sequence, first_sample=sequence * 480,
                          sample_rate=48000, channels=1,
                          plugin_monotonic_ns=1_000_000_000 + sequence * 10_000_000,
                          recording_started_ns=1_000_000_000, pcm=pcm)
        stt.finish(recording_id)
        await asyncio.wait_for(asyncio.gather(*list(stt._tasks.values())), timeout=10)
        events = stt.snapshot(project.id, recording_id)["events"]
        assert not any("queue is full" in (item.get("error") or "") for item in events)
        for channel_id, _ in channels:
            own = [item for item in events if item["channelId"] == channel_id]
            assert own[-1]["status"] == "final"
            assert own[-1]["lastSampleIndexExclusive"] == 24 * 480
            assert sum(item["status"] == "partial" for item in own) == 24
        assert len(recognized) == 48

    asyncio.run(run())


def test_deferred_live_stt_refuses_corrupt_committed_pcm(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Live STT corrupt chunk"))
    recording_id, channel_id, source_uuid = str(uuid4()), str(uuid4()), str(uuid4())
    root = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder = root / "channels" / channel_id / "chunks"
    folder.mkdir(parents=True)
    (root / "recording.json").write_text("{}", encoding="utf-8")
    pcm = struct.pack("<480h", *([2000] * 480))
    (folder / "000000000000.pcm").write_bytes(pcm)
    (folder / "000000000000.json").write_text(json.dumps({
        "sequence": 0, "firstSampleIndex": 0, "frameCount": 480,
        "sampleRate": 48000, "channels": 1,
        "pluginMonotonicNs": 1_000_000_000, "sourceUuid": source_uuid,
        "sha256": "0" * 64, "receivedAtUtc": datetime.now(timezone.utc).isoformat(),
    }), encoding="utf-8")

    async def run():
        stt = ObsLiveLinkTranscription(
            projects, "http://unused", lambda: False,
            max_queued_bytes=1,
        )
        stt.offer(project_id=project.id, recording_id=recording_id,
                  channel_id=channel_id, source_uuid=source_uuid, alias="Mic",
                  sequence=0, first_sample=0, sample_rate=48000, channels=1,
                  plugin_monotonic_ns=1_000_000_000,
                  recording_started_ns=1_000_000_000, pcm=pcm)
        stt.finish(recording_id)
        await asyncio.wait_for(asyncio.gather(*list(stt._tasks.values())), timeout=10)
        events = stt.snapshot(project.id, recording_id)["events"]
        assert len(events) == 1
        assert events[0]["status"] == "error"
        assert "failed verification" in events[0]["error"]

    asyncio.run(run())


def test_restart_replays_two_track_backlog_and_does_not_repeat_final_events(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Resumed Live STT"))
    recording_id = str(uuid4())
    started_ns = 1_000_000_000
    channels = [(str(uuid4()), str(uuid4())), (str(uuid4()), str(uuid4()))]
    root = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    root.mkdir(parents=True)
    (root / "recording.json").write_text(json.dumps({
        "recording": {"recordingId": recording_id, "projectId": project.id,
                      "startedMonotonicNs": started_ns, "status": "stopped",
                      "archiveStatus": "ready"},
        "channels": [{"channelId": channel_id, "sourceUuid": source_uuid,
                      "relayLabel": f"Track {index}"}
                     for index, (channel_id, source_uuid) in enumerate(channels, 1)],
    }), encoding="utf-8")
    async def recognize(session, wav, _language):
        if wav is not None:
            await asyncio.sleep(0.01)
        return {"text": "đủ âm thanh", "pending": ""}

    def commit(sequence, channel_id, source_uuid):
        pcm = struct.pack("<480h", *([2000 + sequence] * 480))
        folder = root / "channels" / channel_id / "chunks"
        folder.mkdir(parents=True, exist_ok=True)
        stem = f"{sequence:012d}"
        (folder / f"{stem}.pcm").write_bytes(pcm)
        (folder / f"{stem}.json").write_text(json.dumps({
            "sequence": sequence, "firstSampleIndex": sequence * 480,
            "frameCount": 480, "sampleRate": 48000, "channels": 1,
            "pluginMonotonicNs": started_ns + sequence * 10_000_000,
            "sourceUuid": source_uuid, "sha256": hashlib.sha256(pcm).hexdigest(),
            "receivedAtUtc": datetime.now(timezone.utc).isoformat(),
        }), encoding="utf-8")
        return pcm

    async def run():
        first = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                         recognize, window_seconds=0.01,
                                         max_queue_chunks=1, max_queued_bytes=960)
        for sequence in range(20):
            for channel_id, source_uuid in channels:
                first.offer(project_id=project.id, recording_id=recording_id,
                            channel_id=channel_id, source_uuid=source_uuid,
                            alias="Track", sequence=sequence,
                            first_sample=sequence * 480, sample_rate=48000,
                            channels=1, plugin_monotonic_ns=started_ns + sequence * 10_000_000,
                            recording_started_ns=started_ns,
                            pcm=commit(sequence, channel_id, source_uuid))
        for _ in range(200):
            if all((root / "channels" / channel_id / "live-stt-progress.json").is_file()
                   for channel_id, _ in channels):
                break
            await asyncio.sleep(0.005)
        assert all((root / "channels" / channel_id / "live-stt-progress.json").is_file()
                   for channel_id, _ in channels)
        for task in list(first._tasks.values()):
            task.cancel()
        await asyncio.gather(*list(first._tasks.values()), return_exceptions=True)
        assert any(first.snapshot(project.id, recording_id)["events"])

        second = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                          recognize, window_seconds=0.01,
                                          max_queue_chunks=1, max_queued_bytes=960)
        assert second.resume_recording(project.id, recording_id) == 2
        await asyncio.wait_for(asyncio.gather(*list(second._tasks.values())), timeout=10)
        events = second.snapshot(project.id, recording_id)["events"]
        assert [item["eventRevision"] for item in events] == list(range(1, len(events) + 1))
        for channel_id, _ in channels:
            own = [item for item in events if item["channelId"] == channel_id]
            finals = [item for item in own if item["status"] == "final"]
            assert len(finals) == 1
            assert finals[0]["lastSampleIndexExclusive"] == 20 * 480
            assert own[-1]["status"] == "final"

        # A crash after final event persistence but before checkpoint replacement
        # must not create another final event when that track is replayed.
        channel_id, _ = channels[0]
        checkpoint = root / "channels" / channel_id / "live-stt-progress.json"
        state = json.loads(checkpoint.read_text(encoding="utf-8"))
        state.update(nextSequence=0, activeStartSequence=None)
        checkpoint.write_text(json.dumps(state), encoding="utf-8")
        journal_before = (root / "transcript-events.jsonl").read_bytes()
        third = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                         recognize, window_seconds=0.01)
        assert third.resume_recording(project.id, recording_id) == 1
        await asyncio.wait_for(asyncio.gather(*list(third._tasks.values())), timeout=10)
        assert (root / "transcript-events.jsonl").read_bytes() == journal_before
        assert third.snapshot(project.id, recording_id)["events"] == events
        assert third.resume_recording(project.id, recording_id) == 0

    asyncio.run(run())


def test_restart_during_active_speech_keeps_one_utterance_when_new_pcm_arrives(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Active Live STT restart"))
    recording_id, channel_id, source_uuid = str(uuid4()), str(uuid4()), str(uuid4())
    started_ns = 1_000_000_000
    root = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder = root / "channels" / channel_id / "chunks"
    folder.mkdir(parents=True)
    (root / "recording.json").write_text(json.dumps({
        "recording": {"recordingId": recording_id, "projectId": project.id,
                      "startedMonotonicNs": started_ns, "status": "recording",
                      "archiveStatus": "pending"},
        "channels": [{"channelId": channel_id, "sourceUuid": source_uuid,
                      "relayLabel": "Track 1"}],
    }), encoding="utf-8")
    sessions = []

    async def recognize(session, _wav, _language):
        sessions.append(session)
        return {"text": "đang nói", "pending": ""}

    def commit(sequence):
        pcm = struct.pack("<480h", *([2000] * 480))
        stem = f"{sequence:012d}"
        (folder / f"{stem}.pcm").write_bytes(pcm)
        (folder / f"{stem}.json").write_text(json.dumps({
            "sequence": sequence, "firstSampleIndex": sequence * 480,
            "frameCount": 480, "sampleRate": 48000, "channels": 1,
            "pluginMonotonicNs": started_ns + sequence * 10_000_000,
            "sourceUuid": source_uuid, "sha256": hashlib.sha256(pcm).hexdigest(),
            "receivedAtUtc": datetime.now(timezone.utc).isoformat(),
        }), encoding="utf-8")
        return pcm

    def offer(stt, sequence):
        stt.offer(project_id=project.id, recording_id=recording_id,
                  channel_id=channel_id, source_uuid=source_uuid, alias="Track 1",
                  sequence=sequence, first_sample=sequence * 480,
                  sample_rate=48000, channels=1,
                  plugin_monotonic_ns=started_ns + sequence * 10_000_000,
                  recording_started_ns=started_ns, pcm=commit(sequence))

    async def run():
        first = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                         recognize, window_seconds=0.01)
        offer(first, 0)
        offer(first, 1)
        await asyncio.wait_for(next(iter(first._queues.values())).join(), timeout=3)
        await first.close()
        assert json.loads((folder.parent / "live-stt-progress.json").read_text(
            encoding="utf-8"))["activeStartSequence"] == 0

        second = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                          recognize, window_seconds=0.01)
        assert second.resume_recording(project.id, recording_id) == 1
        for _ in range(200):
            if json.loads((folder.parent / "live-stt-progress.json").read_text(
                encoding="utf-8"))["nextSequence"] == 2:
                break
            await asyncio.sleep(0.005)
        offer(second, 2)
        offer(second, 3)
        second.finish(recording_id)
        await asyncio.wait_for(asyncio.gather(*list(second._tasks.values())), timeout=5)
        events = second.snapshot(project.id, recording_id)["events"]
        assert [item["status"] for item in events] == [
            "listening", "partial", "partial", "partial", "partial", "final"]
        assert len({item["utteranceId"] for item in events}) == 1
        assert events[-1]["lastSampleIndexExclusive"] == 4 * 480
        assert len(set(sessions)) == 2

    asyncio.run(run())


def test_api_startup_resumes_stopped_livelink_pcm_without_new_upload(tmp_path, monkeypatch):
    from dataclasses import replace
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.settings import Settings

    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Startup Live STT recovery"))
    recording_id, channel_id, source_uuid = str(uuid4()), str(uuid4()), str(uuid4())
    started_ns = 1_000_000_000
    root = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder = root / "channels" / channel_id / "chunks"
    folder.mkdir(parents=True)
    (root / "recording.json").write_text(json.dumps({
        "liveSttRecoveryVersion": 1,
        "recording": {"recordingId": recording_id, "projectId": project.id,
                      "startedMonotonicNs": started_ns, "status": "stopped",
                      "archiveStatus": "ready"},
        "channels": [{"channelId": channel_id, "sourceUuid": source_uuid,
                      "relayLabel": "Track 1"}],
    }), encoding="utf-8")
    pcm = struct.pack("<480h", *([2000] * 480))
    (folder / "000000000000.pcm").write_bytes(pcm)
    (folder / "000000000000.json").write_text(json.dumps({
        "sequence": 0, "firstSampleIndex": 0, "frameCount": 480,
        "sampleRate": 48000, "channels": 1, "pluginMonotonicNs": started_ns,
        "sourceUuid": source_uuid, "sha256": hashlib.sha256(pcm).hexdigest(),
        "receivedAtUtc": datetime.now(timezone.utc).isoformat(),
    }), encoding="utf-8")

    async def recognize(_self, _session, _wav, _language):
        return {"text": "đã khôi phục", "pending": ""}

    monkeypatch.setattr(ObsLiveLinkTranscription, "_recognize", recognize)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    route = f"/api/projects/{project.id}/obs-livelink/recordings/{recording_id}/transcript-events"
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        for _ in range(100):
            response = client.get(route)
            if response.status_code == 200 and any(
                item["status"] == "final" for item in response.json()["events"]
            ):
                break
            time.sleep(0.01)
        assert response.status_code == 200
        events = response.json()["events"]
        assert events[-1]["status"] == "final"
        assert events[-1]["text"] == "đã khôi phục"
        assert events[-1]["lastSampleIndexExclusive"] == 480


def test_progress_write_retries_transient_windows_file_lock(tmp_path, monkeypatch):
    from app.adapters import obs_livelink_transcription as module

    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Live STT file lock"))
    stt = ObsLiveLinkTranscription(projects, "http://unused", lambda: False)
    key = project.id, str(uuid4()), str(uuid4())
    replace = module.os.replace
    calls = []

    def locked_once(source, target):
        calls.append((source, target))
        if len(calls) == 1:
            raise PermissionError("checkpoint is open for reading")
        replace(source, target)

    monkeypatch.setattr(module.os, "replace", locked_once)
    stt._save_progress(key, 3, 1)
    assert len(calls) == 2
    assert stt._read_progress(key)["nextSequence"] == 3
    assert stt._read_progress(key)["activeStartSequence"] == 1


def test_event_write_failure_does_not_advance_restart_checkpoint(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Live STT event write"))
    recording_id, channel_id, source_uuid = str(uuid4()), str(uuid4()), str(uuid4())
    root = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder = root / "channels" / channel_id / "chunks"
    folder.mkdir(parents=True)
    (root / "recording.json").write_text(json.dumps({
        "liveSttRecoveryVersion": 1,
        "recording": {"recordingId": recording_id, "projectId": project.id,
                      "startedMonotonicNs": 1_000_000_000, "status": "stopped",
                      "archiveStatus": "ready"},
        "channels": [{"channelId": channel_id, "sourceUuid": source_uuid,
                      "relayLabel": "Track 1"}],
    }), encoding="utf-8")
    pcm = struct.pack("<480h", *([2000] * 480))
    (folder / "000000000000.pcm").write_bytes(pcm)
    (folder / "000000000000.json").write_text(json.dumps({
        "sequence": 0, "firstSampleIndex": 0, "frameCount": 480,
        "sampleRate": 48000, "channels": 1,
        "pluginMonotonicNs": 1_000_000_000, "sourceUuid": source_uuid,
        "sha256": hashlib.sha256(pcm).hexdigest(),
        "receivedAtUtc": datetime.now(timezone.utc).isoformat(),
    }), encoding="utf-8")

    async def recognize(_session, _wav, _language):
        return {"text": "recovered", "pending": ""}

    async def run():
        first = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                         recognize, window_seconds=0.01)
        append = first._append
        failed = False

        async def fail_once(*args, **kwargs):
            nonlocal failed
            if not failed:
                failed = True
                raise OSError("event journal write failed")
            await append(*args, **kwargs)

        monkeypatch.setattr(first, "_append", fail_once)
        first.offer(project_id=project.id, recording_id=recording_id,
                    channel_id=channel_id, source_uuid=source_uuid, alias="Track 1",
                    sequence=0, first_sample=0, sample_rate=48000, channels=1,
                    plugin_monotonic_ns=1_000_000_000,
                    recording_started_ns=1_000_000_000, pcm=pcm)
        await asyncio.wait_for(asyncio.gather(*list(first._tasks.values())), timeout=3)
        assert not (folder.parent / "live-stt-progress.json").exists()
        (folder / "000000000001.pcm").write_bytes(pcm)
        (folder / "000000000001.json").write_text(json.dumps({
            "sequence": 1, "firstSampleIndex": 480, "frameCount": 480,
            "sampleRate": 48000, "channels": 1,
            "pluginMonotonicNs": 1_010_000_000, "sourceUuid": source_uuid,
            "sha256": hashlib.sha256(pcm).hexdigest(),
            "receivedAtUtc": datetime.now(timezone.utc).isoformat(),
        }), encoding="utf-8")
        first.offer(project_id=project.id, recording_id=recording_id,
                    channel_id=channel_id, source_uuid=source_uuid, alias="Track 1",
                    sequence=1, first_sample=480, sample_rate=48000, channels=1,
                    plugin_monotonic_ns=1_010_000_000,
                    recording_started_ns=1_000_000_000, pcm=pcm)
        assert not first._tasks
        assert not (folder.parent / "live-stt-progress.json").exists()

        second = ObsLiveLinkTranscription(projects, "http://unused", lambda: False,
                                          recognize, window_seconds=0.01)
        assert second.resume_recording(project.id, recording_id) == 1
        await asyncio.wait_for(asyncio.gather(*list(second._tasks.values())), timeout=3)
        events = second.snapshot(project.id, recording_id)["events"]
        assert events[-1]["status"] == "final"
        assert events[-1]["lastSampleIndexExclusive"] == 960
        assert second._read_progress((project.id, recording_id, channel_id))["nextSequence"] == 2

    asyncio.run(run())


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


def test_failed_model_does_not_hold_audio_offer(tmp_path):
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
