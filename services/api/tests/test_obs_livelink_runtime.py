import json
import hashlib
import os
import struct
import wave
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from app.adapters import obs_livelink_archive
from app.adapters.obs_livelink_connection import ObsLiveLinkConnection
from app.adapters.obs_livelink_connection import LiveLinkError
from app.adapters.obs_livelink_runtime import ObsLiveLinkRuntime
from app.adapters.obs_livelink_waveform import ObsLiveLinkWaveform
from app.domain.models import ProjectCreate
from app.domain.models import MediaAssetCreate
from app.adapters.obs_livelink_deletions import deleted_recording_ids, mark_recording_deleted
from app.domain.obs_livelink_state import ObsTimeInterval, ObsTriggerPolicy


def setup(tmp_path):
    pairing = tmp_path / "pairing.json"
    install_id, process_id = str(uuid4()), str(uuid4())
    pairing.write_text(json.dumps({"installId": install_id, "token": "x" * 40}))
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="OBS runtime"))
    link = ObsLiveLinkConnection(pairing)
    runtime = ObsLiveLinkRuntime(link, projects, tmp_path / "machine")
    hello = {"installId": install_id, "processInstanceId": process_id,
             "pluginVersion": "0.4.0", "obsVersion": "32.2.2",
             "protocolMin": 3, "protocolMax": 3, "channels": []}
    token = "Bearer " + "x" * 40
    snapshot = runtime.sync(hello, link.hello(token, hello))
    runtime.sync_current(link.claim(project_id=project.id, project_name=project.name, owner_id="owner"))
    return link, runtime, project, token, hello, snapshot


def lifecycle(runtime, token, hello, snapshot, sequence, kind, ns, span):
    return runtime.event(token, {
        "installId": hello["installId"], "processInstanceId": hello["processInstanceId"],
        "connectionId": snapshot["connectionId"], "connectionEpoch": snapshot["connectionEpoch"],
        "eventId": f"event-{sequence}", "sequence": sequence, "kind": kind,
        "monotonicNs": ns, "spanId": span,
    })


def advertise(runtime, link, token, hello, snapshot, channels, *, recording=False, paused=False):
    payload = {"installId": hello["installId"], "connectionId": snapshot["connectionId"],
               "connectionEpoch": snapshot["connectionEpoch"], "channels": channels,
               "recordingActive": recording, "recordingPaused": paused}
    return runtime.sync(payload, link.heartbeat(token, payload))


def source(channel_id, source_id, *, slot=1, forward=True, missing=False):
    return {"channelId": channel_id, "sourceUuid": source_id, "nativeName": f"Mic {slot}",
            "alias": f"Channel {slot}", "aliasRevision": 0, "slot": slot,
            "forward": forward, "missing": missing, "meterPeak": 0,
            "sampleRate": 48000, "audioChannels": 1, "muted": False}


def test_new_obs_process_retains_stopped_recording_for_pcm_outbox_replay(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    channel_id, source_id = str(uuid4()), str(uuid4())
    advertise(runtime, link, token, hello, snapshot, [source(channel_id, source_id)])
    started = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")
    recording_id = started["appRecording"]["recordingId"]
    stopped = lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "span-1")
    assert stopped["recentRecordings"][-1]["recordingId"] == recording_id

    new_hello = {**hello, "processInstanceId": str(uuid4())}
    restarted = ObsLiveLinkRuntime(link, runtime.projects, tmp_path / "machine")
    replacement = restarted.sync(new_hello, link.hello(token, new_hello), for_obs=True)
    assert replacement["appRecording"] is None
    assert replacement["recentRecordings"][-1]["recordingId"] == recording_id
    assert replacement["recentRecordings"][-1]["endedMonotonicNs"] == 2_000_000_000

    # 0.6.4 could overwrite machine state before its last SQLite row was ACKed.
    restarted._state = restarted._state.model_copy(update={"completed_recordings": []})
    restarted._persist()
    recovered = restarted.recover_recording(
        token, install_id=hello["installId"], connection_id=replacement["connectionId"],
        epoch=replacement["connectionEpoch"], recording_id=recording_id,
    )
    assert recovered["endedMonotonicNs"] == 2_000_000_000
    assert recovered["archiveStatus"] == "pending"
    assert restarted.status()["recentRecordings"][-1]["recordingId"] == recording_id
    pcm = struct.pack("<" + "h" * 480, *([1200] * 480))
    audio = FileObsLiveLinkAudio(link, restarted, restarted.projects,
                                 FileMediaLibrary(restarted.projects), None)
    replayed = audio.chunk(
        token, install_id=hello["installId"], connection_id=replacement["connectionId"],
        epoch=replacement["connectionEpoch"], recording_id=recording_id,
        channel_id=channel_id, source_uuid=source_id, sequence=0, first_sample_index=0,
        frame_count=480, sample_rate=48000, channels=1,
        obs_audio_timestamp_ns=1_100_000_000, plugin_monotonic_ns=1_100_000_000,
        sha256=hashlib.sha256(pcm).hexdigest(), pcm=pcm,
    )
    assert replayed["durable"]


def test_pcm_ingest_checks_immediate_predecessor_without_scanning_take(tmp_path, monkeypatch):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    channel_id, source_id = str(uuid4()), str(uuid4())
    advertise(runtime, link, token, hello, snapshot, [source(channel_id, source_id)])
    recording_id = lifecycle(runtime, token, hello, snapshot, 0, "obs-start",
                             1_000_000_000, "span-1")["appRecording"]["recordingId"]
    audio = FileObsLiveLinkAudio(link, runtime, runtime.projects,
                                 FileMediaLibrary(runtime.projects), None)
    pcm = struct.pack("<" + "h" * 480, *([1200] * 480))
    kwargs = dict(install_id=hello["installId"], connection_id=snapshot["connectionId"],
                  epoch=snapshot["connectionEpoch"], recording_id=recording_id,
                  channel_id=channel_id, source_uuid=source_id, frame_count=480,
                  sample_rate=48000, channels=1, sha256=hashlib.sha256(pcm).hexdigest(),
                  pcm=pcm)

    def ingest(sequence):
        ns = 1_100_000_000 + sequence * 10_000_000
        return audio.chunk(token, **kwargs, sequence=sequence,
                           first_sample_index=sequence * 480,
                           obs_audio_timestamp_ns=ns, plugin_monotonic_ns=ns)

    assert ingest(0)["durable"]
    chunks = (Path(project.project_path) / "assets" / "obs-livelink" /
              recording_id / "channels" / channel_id / "chunks")
    original_glob = Path.glob

    def reject_full_scan(path, pattern):
        if path == chunks and pattern == "*.json":
            raise AssertionError("PCM ingress scanned all prior chunk metadata")
        return original_glob(path, pattern)

    monkeypatch.setattr(Path, "glob", reject_full_scan)
    assert ingest(1)["durable"]
    with pytest.raises(LiveLinkError, match="sequence, sample index or format discontinuity"):
        ingest(3)


def test_pcm_pair_commit_publishes_metadata_only_after_durable_pcm(tmp_path, monkeypatch):
    pcm_path = tmp_path / "chunks" / "000000000000.pcm"
    metadata_path = pcm_path.with_suffix(".json")
    original_replace = os.replace
    commits = []

    def fail_pcm_commit(source, target):
        commits.append(Path(target))
        if Path(target) == pcm_path:
            raise OSError("simulated PCM commit failure")
        return original_replace(source, target)

    monkeypatch.setattr(os, "replace", fail_pcm_commit)
    with pytest.raises(OSError, match="PCM commit failure"):
        FileObsLiveLinkAudio._write_chunk_pair(pcm_path, b"pcm", metadata_path, b"metadata")
    assert commits == [pcm_path]
    assert not metadata_path.exists(), "A retry must not find metadata without PCM"

    monkeypatch.setattr(os, "replace", original_replace)
    FileObsLiveLinkAudio._write_chunk_pair(pcm_path, b"pcm", metadata_path, b"metadata")
    assert pcm_path.read_bytes() == b"pcm"
    assert metadata_path.read_bytes() == b"metadata"


def test_permanent_obs_media_delete_cannot_be_recreated_from_machine_state(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    recording_id = lifecycle(runtime, token, hello, snapshot, 0, "obs-start",
                             1_000_000_000, "span-1")["appRecording"]["recordingId"]
    lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "span-1")
    root = Path(project.project_path)
    folder = root / "assets" / "obs-livelink" / recording_id
    (folder / "source.mka").write_bytes(b"archive")
    library = FileMediaLibrary(runtime.projects)
    parent = library.create(project.id, MediaAssetCreate(
        name="OBS take", source_extension=".mka", media_kind="audio",
        source_path=f"assets/obs-livelink/{recording_id}/source.mka",
        obs_recording_id=recording_id, origin="record",
    ))
    stale_machine_state = runtime._state_path(hello["installId"]).read_bytes()
    stale_journal = (folder / "recording.json").read_bytes()

    library.remove(project.id, parent.id)
    assert not folder.exists()
    assert recording_id in deleted_recording_ids(root)
    runtime.discard_deleted_recordings()
    assert runtime.status()["recentRecordings"] == []
    folder.mkdir()
    (folder / "recording.json").write_bytes(stale_journal)
    with pytest.raises(LiveLinkError, match="permanently deleted"):
        runtime.recover_recording(
            token, install_id=hello["installId"], connection_id=snapshot["connectionId"],
            epoch=snapshot["connectionEpoch"], recording_id=recording_id,
        )
    shutil.rmtree(folder)
    runtime._persist()
    assert not folder.exists()

    # A copied or stale machine snapshot must not recreate a deleted journal.
    runtime._state_path(hello["installId"]).write_bytes(stale_machine_state)
    restarted = ObsLiveLinkRuntime(link, runtime.projects, tmp_path / "machine")
    new_hello = {**hello, "processInstanceId": str(uuid4())}
    assert restarted.sync(new_hello, link.hello(token, new_hello))["recentRecordings"] == []
    restarted._persist()
    assert not folder.exists()


def test_legacy_ready_journal_without_archive_or_chunks_is_not_pending_footage(tmp_path):
    from dataclasses import replace
    from fastapi.testclient import TestClient
    import app.main as main
    from app.settings import Settings

    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Old OBS take"))
    recording_id = str(uuid4())
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text(json.dumps({"recording": {
        "recordingId": recording_id, "archiveStatus": "ready"}, "channels": []}), encoding="utf-8")
    client = TestClient(main.create_app(project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    url = f"/api/projects/{project.id}/obs-livelink/recordings"
    assert client.get(url).json() == []
    (folder / "channels" / "track-1" / "chunks").mkdir(parents=True)
    (folder / "channels" / "track-1" / "chunks" / "0.json").write_text("{}", encoding="utf-8")
    assert len(client.get(url).json()) == 1
    (folder / "source.mka").write_bytes(b"orphan archive")
    (folder / "recording.json").write_text(json.dumps({"recording": {
        "recordingId": recording_id, "archiveStatus": "ready",
        "sourceArchive": {"parentAssetId": "deleted-parent"}}, "channels": []}), encoding="utf-8")
    assert client.get(url).json() == []
    mark_recording_deleted(Path(project.project_path), recording_id)
    assert client.get(url).json() == []
    assert client.post(f"{url}/{recording_id}/archive/retry").status_code == 404


def test_obs_restart_retains_all_unfinalized_recordings_beyond_recent_list(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    recording_ids = []
    for index in range(7):
        span = f"span-{index}"
        started = lifecycle(runtime, token, hello, snapshot, index * 2,
                            "obs-start", (index * 2 + 1) * 1_000_000_000, span)
        recording_ids.append(started["appRecording"]["recordingId"])
        lifecycle(runtime, token, hello, snapshot, index * 2 + 1,
                  "obs-stop", (index * 2 + 2) * 1_000_000_000, span)
    new_hello = {**hello, "processInstanceId": str(uuid4())}
    restarted = ObsLiveLinkRuntime(link, runtime.projects, tmp_path / "machine")
    replacement = restarted.sync(new_hello, link.hello(token, new_hello), for_obs=True)
    assert {item["recordingId"] for item in replacement["recentRecordings"]} == set(recording_ids)
    assert len(restarted.status()["recentRecordings"]) == 5


def test_waveform_separates_channels_and_preserves_silence_gap_and_restart(tmp_path, monkeypatch):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    identities = [(str(uuid4()), str(uuid4())) for _ in range(3)]
    advertise(runtime, link, token, hello, snapshot, [
        source(*identities[0]), source(*identities[1], slot=2),
        source(*identities[2], slot=3, forward=False),
    ])
    recording_id = lifecycle(runtime, token, hello, snapshot, 0, "obs-start",
                             1_000_000_000, "span-1")["appRecording"]["recordingId"]
    audio = FileObsLiveLinkAudio(link, runtime, runtime.projects,
                                 FileMediaLibrary(runtime.projects), None)

    def send(index, sequence, first_sample, at, samples):
        channel_id, source_id = identities[index]
        pcm = struct.pack("<" + "h" * len(samples), *samples)
        return audio.chunk(token, install_id=hello["installId"],
                           connection_id=snapshot["connectionId"],
                           epoch=snapshot["connectionEpoch"], recording_id=recording_id,
                           channel_id=channel_id, source_uuid=source_id, sequence=sequence,
                           first_sample_index=first_sample, frame_count=len(samples),
                           sample_rate=48000, channels=1, obs_audio_timestamp_ns=at,
                           plugin_monotonic_ns=at, sha256=hashlib.sha256(pcm).hexdigest(), pcm=pcm)

    assert send(0, 0, 4800, 1_100_000_000, [-16000, 8000] * 240)["durable"]
    send(1, 0, 4800, 1_100_000_000, [4000] * 480)
    send(0, 1, 14400, 1_300_000_000, [0] * 480)
    lifecycle(runtime, token, hello, snapshot, 1, "obs-pause", 1_400_000_000, "span-1")
    lifecycle(runtime, token, hello, snapshot, 2, "obs-resume", 1_500_000_000, "span-1")
    restarted = ObsLiveLinkWaveform(runtime.projects, None)
    a = restarted.snapshot(project.id, recording_id, identities[0][0],
                           start_seconds=0.1, end_seconds=0.31, max_points=21)
    b = restarted.snapshot(project.id, recording_id, identities[1][0],
                           start_seconds=0.1, end_seconds=0.31, max_points=21)
    disabled = restarted.snapshot(project.id, recording_id, identities[2][0],
                                  start_seconds=0.1, end_seconds=0.31, max_points=21)
    assert (a["recordingId"], a["channelId"], a["lastDurableSequence"]) == (
        recording_id, identities[0][0], 1)
    assert (a["points"][0]["min"], a["points"][0]["max"], a["points"][0]["peak"]) == (
        -16000, 8000, 16000)
    assert (a["points"][0]["firstSampleIndex"], a["points"][0]["lastSampleIndexExclusive"]) == (
        4800, 5280)
    assert a["points"][1]["peak"] is None  # No PCM; distinct from received silence.
    assert a["points"][-1]["peak"] == 0
    assert b["points"][0]["peak"] == 4000
    assert disabled["sampleRate"] is None and disabled["points"] == []
    paused = restarted.snapshot(project.id, recording_id, identities[0][0],
                                 start_seconds=0.4, end_seconds=0.5, max_points=10)
    assert all(point["peak"] is None for point in paused["points"])
    assert len(a["points"]) <= 21
    delta = restarted.snapshot(project.id, recording_id, identities[0][0],
                               start_seconds=0.1, end_seconds=0.31, max_points=21,
                               after_sequence=0)
    assert delta["lastIncludedSequence"] == 1 and delta["hasMore"] is False
    assert len(delta["points"]) == 1 and delta["points"][0]["peak"] == 0
    for sequence in range(2, 36):
        send(0, sequence, 14400 + (sequence - 1) * 480,
             1_600_000_000 + (sequence - 2) * 10_000_000, [250] * 480)
    page_one = restarted.snapshot(project.id, recording_id, identities[0][0],
                                  start_seconds=0, end_seconds=2, max_points=40,
                                  after_sequence=0)
    page_two = restarted.snapshot(project.id, recording_id, identities[0][0],
                                  start_seconds=0, end_seconds=2, max_points=40,
                                  after_sequence=page_one["lastIncludedSequence"])
    assert (page_one["lastIncludedSequence"], page_one["hasMore"]) == (32, True)
    assert (page_two["lastIncludedSequence"], page_two["hasMore"]) == (35, False)
    assert len(page_one["points"]) <= 40 and len(page_two["points"]) <= 40
    with pytest.raises(LiveLinkError, match="window"):
        restarted.snapshot(project.id, recording_id, identities[0][0], end_seconds=121)
    with pytest.raises(LiveLinkError, match="resolution"):
        restarted.snapshot(project.id, recording_id, identities[0][0], max_points=601)
    with pytest.raises(LiveLinkError, match="unknown"):
        restarted.snapshot(project.id, recording_id, str(uuid4()))
    from dataclasses import replace
    from types import SimpleNamespace
    from fastapi.testclient import TestClient
    import app.main as main
    from app.settings import Settings
    monkeypatch.setattr(main, "ObsPluginInstallation",
                        lambda *_: SimpleNamespace(user_config=tmp_path / "pairing.json"))
    client = TestClient(main.create_app(project_repository=runtime.projects,
                                        settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    route = f"/api/projects/{project.id}/obs-livelink/recordings/{recording_id}/waveform"
    response = client.get(route, params={"channelId": identities[0][0],
                                         "startSeconds": 0.1, "endSeconds": 0.31,
                                         "maxPoints": 21, "afterSequence": 0})
    assert response.status_code == 200
    assert response.json()["points"][-1]["peak"] == 0
    assert client.get(route, params={"channelId": identities[0][0],
                                     "startSeconds": 0, "endSeconds": 121}).status_code == 422


def test_waveform_rebuilds_from_correct_mka_track_after_stop(tmp_path):
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        pytest.skip("FFmpeg and FFprobe are required for MKA rebuild")
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    identities = [(str(uuid4()), str(uuid4())) for _ in range(2)]
    advertise(runtime, link, token, hello, snapshot, [
        source(*identities[0]), source(*identities[1], slot=2),
    ])
    recording_id = lifecycle(runtime, token, hello, snapshot, 0, "obs-start",
                             1_000_000_000, "span-1")["appRecording"]["recordingId"]
    audio = FileObsLiveLinkAudio(link, runtime, runtime.projects,
                                 FileMediaLibrary(runtime.projects), ffmpeg, ffprobe)
    for index, (channel_id, source_id) in enumerate(identities):
        amplitude = 12000 if index == 0 else 3000
        pcm = struct.pack("<" + "h" * 480, *([amplitude] * 480))
        audio.chunk(token, install_id=hello["installId"], connection_id=snapshot["connectionId"],
                    epoch=snapshot["connectionEpoch"], recording_id=recording_id,
                    channel_id=channel_id, source_uuid=source_id, sequence=0,
                    first_sample_index=4800, frame_count=480, sample_rate=48000,
                    channels=1, obs_audio_timestamp_ns=1_100_000_000,
                    plugin_monotonic_ns=1_100_000_000,
                    sha256=hashlib.sha256(pcm).hexdigest(), pcm=pcm)
    extra = struct.pack("<" + "h" * 480, *([5000] * 480))
    audio.chunk(token, install_id=hello["installId"], connection_id=snapshot["connectionId"],
                epoch=snapshot["connectionEpoch"], recording_id=recording_id,
                channel_id=identities[0][0], source_uuid=identities[0][1], sequence=1,
                first_sample_index=10080, frame_count=480, sample_rate=48000,
                channels=1, obs_audio_timestamp_ns=1_180_000_000,
                plugin_monotonic_ns=1_180_000_000,
                sha256=hashlib.sha256(extra).hexdigest(), pcm=extra)
    lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 1_300_000_000, "span-1")
    finalized = audio.finalize(token, install_id=hello["installId"],
                               connection_id=snapshot["connectionId"],
                               epoch=snapshot["connectionEpoch"], recording_id=recording_id)
    assert finalized["artifactReady"]
    waveform = ObsLiveLinkWaveform(runtime.projects, ffmpeg)
    for index, (channel_id, _) in enumerate(identities):
        result = waveform.snapshot(project.id, recording_id, channel_id,
                                   start_seconds=0, end_seconds=0.2, max_points=20)
        assert result["source"] == "mka"
        assert result["sampleAxis"] == "recording"
        assert result["points"][0]["peak"] == 0  # Initial archive padding.
        assert result["points"][2]["peak"] == (12000 if index == 0 else 3000)
        if index == 0:
            assert result["gaps"] == [{"startFrame": 5280, "endFrame": 10080,
                                       "classification": "transport-gap"}]
        block = (Path(project.project_path) / "assets" / "obs-livelink" / recording_id /
                 "channels" / channel_id / "archive-envelope-v1" / "000000.json")
        assert block.is_file()
        assert len(result["points"]) <= 20
        assert waveform.snapshot(project.id, recording_id, channel_id,
                                 start_seconds=0.1, end_seconds=0.2, max_points=10)["points"][0]["peak"] == (
                                     12000 if index == 0 else 3000)
    relocated = tmp_path / "relocated"
    shutil.copytree(Path(project.project_path), relocated)
    reopened_projects = FileProjectRepository(tmp_path / "new-project-registry")
    assert reopened_projects.open(relocated).id == project.id
    reopened_waveform = ObsLiveLinkWaveform(reopened_projects, ffmpeg)
    assert reopened_waveform.snapshot(project.id, recording_id, identities[1][0],
                                     start_seconds=0.1, end_seconds=0.2,
                                     max_points=10)["points"][0]["peak"] == 3000


def test_ignore_stop_keeps_recording_across_two_video_spans(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    runtime.set_policy(project.id, ObsTriggerPolicy(ignore_stop=True))
    first = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")
    assert first["appRecording"]["status"] == "recording"
    recording_id = first["appRecording"]["recordingId"]
    assert lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")["appRecording"]["recordingId"] == recording_id
    stopped = lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "span-1")
    assert stopped["appRecording"]["recordingId"] == recording_id
    second = lifecycle(runtime, token, hello, snapshot, 2, "obs-start", 3_000_000_000, "span-2")
    assert second["appRecording"]["videoSpanIds"] == ["span-1", "span-2"]
    runtime.set_policy(project.id, ObsTriggerPolicy())
    final = lifecycle(runtime, token, hello, snapshot, 3, "obs-stop", 4_000_000_000, "span-2")
    assert final["appRecording"] is None
    assert final["recentRecordings"][0]["status"] == "stopped"
    project_root = Path(project.project_path)
    record = json.loads((project_root / "assets" / "obs-livelink" / recording_id / "recording.json").read_text())
    assert record["liveSttRecoveryVersion"] == 1
    assert [span["spanId"] for span in record["videoSpans"]] == ["span-1", "span-2"]


def test_plugin_heartbeat_remains_parseable_after_archive_with_uint64_track_uid(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    first = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")
    first_id = first["appRecording"]["recordingId"]
    lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "span-1")
    large_uid = 12_738_617_874_486_415_437  # The UID that broke the physical OBS run.
    runtime.archive_ready(first_id, {
        "parentAssetId": "archive-1",
        "sourcePath": f"assets/obs-livelink/{first_id}/source.mka",
        "tracks": [{
            "channelId": "channel-1", "sourceUuid": "source-1", "streamIndex": 0,
            "trackUid": large_uid, "relayLabel": "Mic", "aliasRevision": 0,
        }],
    })
    assert runtime.status()["recentRecordings"][0]["sourceArchive"]["tracks"][0]["trackUid"] == large_uid

    heartbeat = {"installId": hello["installId"], "connectionId": snapshot["connectionId"],
                 "connectionEpoch": snapshot["connectionEpoch"], "channels": []}
    plugin_status = runtime.sync(heartbeat, link.heartbeat(token, heartbeat), for_obs=True)
    assert plugin_status["recentRecordings"][0]["recordingId"] == first_id
    assert "sourceArchive" not in plugin_status["recentRecordings"][0]
    assert str(large_uid) not in json.dumps(plugin_status)

    restarted = ObsLiveLinkRuntime(link, runtime.projects, tmp_path / "machine")
    plugin_status_after_restart = restarted.sync(heartbeat, link.heartbeat(token, heartbeat), for_obs=True)
    assert plugin_status_after_restart["recentRecordings"][0]["recordingId"] == first_id
    assert str(large_uid) not in json.dumps(plugin_status_after_restart)

    second = lifecycle(runtime, token, hello, snapshot, 2, "obs-start", 3_000_000_000, "span-2")
    plugin_status = runtime.sync(heartbeat, link.heartbeat(token, heartbeat), for_obs=True)
    assert plugin_status["appRecording"]["recordingId"] == second["appRecording"]["recordingId"]
    assert plugin_status["appRecording"]["recordingId"] != first_id


def test_recording_folder_locators_are_machine_local_and_per_span(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    runtime.set_recording_folder_connected(True)
    runtime.set_policy(project.id, ObsTriggerPolicy(ignore_stop=True))
    folder = tmp_path / "OBS recordings"
    folder.mkdir()
    for sequence, span_id in ((0, "span-one"), (2, "span-two")):
        started = lifecycle(runtime, token, hello, snapshot, sequence, "obs-start", sequence + 10, span_id)
        path = folder / f"same-name-{sequence}.mkv"
        path.write_bytes(b"completed mkv fixture")
        stop_payload = {
            "installId": hello["installId"], "processInstanceId": hello["processInstanceId"],
            "connectionId": snapshot["connectionId"], "connectionEpoch": snapshot["connectionEpoch"],
            "eventId": f"event-{sequence + 1}", "sequence": sequence + 1,
            "kind": "obs-stop", "monotonicNs": sequence + 11, "spanId": span_id,
            "recordingFolder": str(folder), "lastRecordingPath": str(path),
        }
        stopped = runtime.event(token, stop_payload)
        span = next(item for item in stopped["videoSpans"] if item["spanId"] == span_id)
        assert span["recordingFileName"] == path.name
        assert span["recordingFileAvailable"] is True
        assert started["appRecording"]["recordingId"] == stopped["appRecording"]["recordingId"]
    runtime.link_video_asset("span-one", "asset-video-1", "abc123")
    runtime.link_video_asset("span-one", "asset-video-1", "abc123")
    with pytest.raises(LiveLinkError, match="already linked"):
        runtime.link_video_asset("span-one", "asset-video-2", "different")
    journal = Path(project.project_path) / "assets" / "obs-livelink" / started["appRecording"]["recordingId"] / "recording.json"
    journal_text = journal.read_text(encoding="utf-8")
    assert str(folder) not in journal_text
    assert "recordingFileName" not in journal_text
    assert [item["spanId"] for item in json.loads(journal_text)["videoSpans"]] == ["span-one", "span-two"]
    assert json.loads(journal_text)["videoSpans"][0]["importedVideoAssetId"] == "asset-video-1"


def test_manual_command_ack_changes_app_without_stopping_obs(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    runtime.set_policy(project.id, ObsTriggerPolicy(ignore_start=True))
    lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000, "span-1")
    assert runtime.status()["appRecording"] is None
    queued = runtime.action("start")
    command = link.pending_command(queued["commandId"])
    ack = {"installId": hello["installId"], "connectionId": snapshot["connectionId"],
           "connectionEpoch": snapshot["connectionEpoch"], "commandId": command["commandId"],
           "revision": command["revision"], "appliedState": "start",
           "appliedMonotonicNs": 2_000, "sampleIndex": None, "error": None}
    link.acknowledge(token, ack)
    started = runtime.applied_ack(command, ack)
    assert started["appRecording"]["videoSpanIds"] == ["span-1"]
    queued = runtime.action("stop")
    command = link.pending_command(queued["commandId"])
    ack.update({"commandId": command["commandId"], "revision": command["revision"],
                "appliedState": "stop", "appliedMonotonicNs": 3_000})
    link.acknowledge(token, ack)
    stopped = runtime.applied_ack(command, ack)
    assert stopped["appRecording"] is None
    assert stopped["videoSpans"][0]["endedMonotonicNs"] is None


def test_channel_capture_evidence_tracks_silent_durable_pcm_and_api_restart(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    channel_id, source_id = str(uuid4()), str(uuid4())
    disabled_id, disabled_source = str(uuid4()), str(uuid4())
    channels = [source(channel_id, source_id),
                source(disabled_id, disabled_source, slot=2, forward=False)]
    idle = advertise(runtime, link, token, hello, snapshot, channels)
    assert all(item["capture"]["state"] == "idle" for item in idle["channels"])
    started = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")
    recording_id = started["appRecording"]["recordingId"]
    assert started["channels"][0]["capture"]["state"] == "pending"
    assert started["channels"][0]["capture"]["durableChunkCount"] == 0
    assert started["channels"][1]["capture"]["state"] == "disabled"
    assert started["channels"][0]["capture"]["projectId"] == project.id

    audio = FileObsLiveLinkAudio(link, runtime, runtime.projects,
                                 FileMediaLibrary(runtime.projects), None)
    pcm = b"\0" * 960  # Silent audio still proves 480 mono PCM frames were stored.
    kwargs = dict(install_id=hello["installId"], connection_id=snapshot["connectionId"],
                  epoch=snapshot["connectionEpoch"], recording_id=recording_id,
                  channel_id=channel_id, source_uuid=source_id, sequence=0,
                  first_sample_index=1000, frame_count=480, sample_rate=48000,
                  channels=1, obs_audio_timestamp_ns=1_100_000_000,
                  plugin_monotonic_ns=1_100_000_000,
                  sha256=hashlib.sha256(pcm).hexdigest(), pcm=pcm)
    assert audio.chunk(token, **kwargs) == {"sequence": 0, "durable": True, "duplicate": False}
    assert audio.chunk(token, **kwargs)["duplicate"] is True
    evidence = runtime.status()["channels"][0]["capture"]
    assert (evidence["state"], evidence["durableChunkCount"],
            evidence["lastDurableSequence"], evidence["lastDurableSampleIndexExclusive"]) == (
                "receiving", 1, 0, 1480)
    assert evidence["lastDurableAtUtc"]
    assert (evidence["sampleGapCount"], evidence["sampleGapFrames"]) == (0, 0)

    audio.chunk(token, **{**kwargs, "sequence": 1, "first_sample_index": 2000,
                        "plugin_monotonic_ns": 1_200_000_000})
    evidence = runtime.status()["channels"][0]["capture"]
    assert (evidence["durableChunkCount"], evidence["lastDurableSequence"],
            evidence["sampleGapCount"], evidence["sampleGapFrames"]) == (2, 1, 1, 520)
    for sequence in range(2, 17):
        audio.chunk(token, **{**kwargs, "sequence": sequence,
                            "first_sample_index": 2000 + (sequence - 1) * 480,
                            "plugin_monotonic_ns": 1_200_000_000 + sequence * 10_000_000})
    evidence = runtime.status()["channels"][0]["capture"]
    checkpoint = (Path(project.project_path) / "assets" / "obs-livelink" /
                  recording_id / "channels" / channel_id / "capture-evidence.json")
    assert json.loads(checkpoint.read_text())["lastDurableSequence"] == 15
    assert (evidence["durableChunkCount"], evidence["lastDurableSequence"],
            evidence["sampleGapCount"], evidence["sampleGapFrames"]) == (17, 16, 1, 520)
    fresh_link = ObsLiveLinkConnection(link.pairing_file)
    fresh_hello = {**hello, "channels": channels, "recordingActive": True}
    fresh_snapshot = fresh_link.hello(token, fresh_hello)
    restarted = ObsLiveLinkRuntime(fresh_link, runtime.projects, tmp_path / "machine")
    rebuilt_status = restarted.sync(fresh_hello, fresh_snapshot)
    assert rebuilt_status["appRecording"]["recordingId"] == recording_id
    rebuilt = rebuilt_status["channels"][0]["capture"]
    assert rebuilt == evidence
    restarted.CAPTURE_STALL_SECONDS = -1
    assert restarted.status()["channels"][0]["capture"]["state"] == "stalled"
    paused = lifecycle(restarted, token, hello, fresh_snapshot, 1, "obs-pause", 1_500_000_000, "span-1")
    assert paused["channels"][0]["capture"]["state"] == "paused"
    missing = advertise(restarted, fresh_link, token, hello, fresh_snapshot,
                        [source(channel_id, source_id, missing=True), channels[1]],
                        recording=True, paused=True)
    assert missing["channels"][0]["capture"]["state"] == "missing"
    stopped = lifecycle(restarted, token, hello, fresh_snapshot, 2, "obs-stop", 2_000_000_000, "span-1")
    assert stopped["channels"][0]["capture"]["state"] == "idle"
    assert stopped["appRecording"] is None
    restarted.sync_current(fresh_link.claim(
        project_id=project.id, project_name=project.name, owner_id="owner"))
    next_recording = lifecycle(restarted, token, hello, fresh_snapshot, 3, "obs-start", 3_000_000_000, "span-2")
    assert next_recording["appRecording"]["recordingId"] != recording_id
    assert next_recording["channels"][0]["capture"]["durableChunkCount"] == 0
    assert next_recording["channels"][0]["capture"]["lastDurableSequence"] is None


def test_ignored_obs_start_needs_manual_record_ack_before_channel_capture(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    channel_id, source_id = str(uuid4()), str(uuid4())
    advertise(runtime, link, token, hello, snapshot, [source(channel_id, source_id)])
    runtime.set_policy(project.id, ObsTriggerPolicy(ignore_start=True))
    ignored = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000, "span-1")
    assert ignored["obsRecording"] == "recording"
    assert ignored["appRecording"] is None
    assert ignored["channels"][0]["capture"]["state"] == "idle"
    queued = runtime.action("start")
    assert queued["channels"][0]["capture"]["state"] == "idle"
    command = link.pending_command(queued["commandId"])
    ack = {"installId": hello["installId"], "connectionId": snapshot["connectionId"],
           "connectionEpoch": snapshot["connectionEpoch"], "commandId": command["commandId"],
           "revision": command["revision"], "appliedState": "start",
           "appliedMonotonicNs": 2_000, "sampleIndex": None, "error": None}
    link.acknowledge(token, ack)
    started = runtime.applied_ack(command, ack)
    assert started["channels"][0]["capture"]["state"] == "pending"
    offline = runtime.status({**link.status(), "connectionState": "disconnected"})
    assert offline["channels"][0]["capture"]["state"] == "disconnected"


def test_forward_ack_alone_never_claims_pcm_receipt(tmp_path):
    link, runtime, _, token, hello, snapshot = setup(tmp_path)
    channel_id, source_id = str(uuid4()), str(uuid4())
    advertise(runtime, link, token, hello, snapshot,
              [source(channel_id, source_id, forward=False)])
    started = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")
    assert started["channels"][0]["capture"]["state"] == "disabled"
    pending = runtime.sync_current(link.set_forward(channel_id, True))
    assert pending["channels"][0]["capture"]["state"] == "forward-pending"
    command = link.pending_command(pending["channels"][0]["pendingCommandId"])
    ack = {"installId": hello["installId"], "connectionId": snapshot["connectionId"],
           "connectionEpoch": snapshot["connectionEpoch"], "commandId": command["commandId"],
           "revision": command["revision"], "appliedState": True,
           "appliedMonotonicNs": 1_100_000_000, "sampleIndex": 4800, "error": None}
    link.acknowledge(token, ack)
    applied = runtime.applied_ack(command, ack)["channels"][0]
    assert applied["appliedForward"] is True
    assert applied["capture"]["state"] == "pending"
    assert applied["capture"]["durableChunkCount"] == 0
    assert applied["capture"]["lastDurableSequence"] is None


def test_durable_pcm_chunk_and_verified_transitional_stem(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    channel_id, source_id = str(uuid4()), str(uuid4())
    source = {"channelId": channel_id, "sourceUuid": source_id,
              "nativeName": "Mic", "alias": "Channel 1", "aliasRevision": 0,
              "slot": 1, "forward": True, "missing": False, "meterPeak": 0,
              "sampleRate": 48000, "audioChannels": 1, "muted": False}
    heartbeat = {"installId": hello["installId"], "connectionId": snapshot["connectionId"],
                 "connectionEpoch": snapshot["connectionEpoch"], "channels": [source]}
    runtime.sync(heartbeat, link.heartbeat(token, heartbeat))
    started = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")
    recording_id = started["appRecording"]["recordingId"]
    audio = FileObsLiveLinkAudio(link, runtime, FileProjectRepository(tmp_path / "projects"),
                                 FileMediaLibrary(FileProjectRepository(tmp_path / "projects")), None)
    pcm = struct.pack("<" + "h" * 480, *([1200] * 480))
    kwargs = dict(install_id=hello["installId"], connection_id=snapshot["connectionId"],
                  epoch=snapshot["connectionEpoch"], recording_id=recording_id,
                  channel_id=channel_id, source_uuid=source_id, sequence=0,
                  first_sample_index=4800, frame_count=480, sample_rate=48000,
                  channels=1, obs_audio_timestamp_ns=1_100_000_000,
                  plugin_monotonic_ns=1_100_000_000,
                  sha256=hashlib.sha256(pcm).hexdigest(), pcm=pcm)
    assert audio.chunk(token, **kwargs)["durable"]
    assert audio.chunk(token, **kwargs)["duplicate"]
    # A packet may reach the API before Stop ACK even when its callback clock
    # is after the applied Stop boundary. It must not enter the WAV artifact.
    assert audio.chunk(token, **{**kwargs, "sequence": 1,
                                "first_sample_index": 5280,
                                "plugin_monotonic_ns": 2_100_000_000})["durable"]
    runtime._state = runtime._state.model_copy(update={
        "recording": runtime._state.recording.model_copy(update={
            "capture_pause_intervals": [ObsTimeInterval(
                start_monotonic_ns=1_103_000_000, end_monotonic_ns=1_105_000_000)],
        }),
    })
    lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "span-1")
    with pytest.raises(LiveLinkError, match="after the recording boundary"):
        audio.chunk(token, **{**kwargs, "sequence": 2,
                            "first_sample_index": 5760,
                            "plugin_monotonic_ns": 1_999_000_000})
    arguments = dict(install_id=hello["installId"], connection_id=snapshot["connectionId"],
                     epoch=snapshot["connectionEpoch"], recording_id=recording_id)
    with pytest.raises(LiveLinkError, match="FFmpeg"):
        audio.finalize(token, **arguments)
    failure_journal = (Path(project.project_path) / "assets" / "obs-livelink" /
                       recording_id / "recording.json")
    assert json.loads(failure_journal.read_text())["recording"]["archiveStatus"] == "error"
    stem = Path(project.project_path) / "assets" / "media" / (
        "asset-live-" + hashlib.sha256(f"{recording_id}:{channel_id}".encode()).hexdigest()[:12]) / "source.wav"
    with wave.open(str(stem), "rb") as output:
        assert (output.getframerate(), output.getnchannels(), output.getnframes()) == (48000, 1, 5280)
        assert output.readframes(4800) == b"\0" * 9600
        captured = output.readframes(480)
        assert captured[:144 * 2] == pcm[:144 * 2]
        assert captured[144 * 2:240 * 2] == b"\0" * (96 * 2)
        assert captured[240 * 2:] == pcm[240 * 2:]
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg and ffprobe:
        retry = FileObsLiveLinkAudio(link, runtime, FileProjectRepository(tmp_path / "projects"),
                                     FileMediaLibrary(FileProjectRepository(tmp_path / "projects")),
                                     ffmpeg, ffprobe)
        retained_chunk = (Path(project.project_path) / "assets" / "obs-livelink" /
                          recording_id / "channels" / channel_id / "chunks" / "000000000000.pcm")
        retained_chunk.write_bytes(b"damaged")
        with pytest.raises(LiveLinkError, match="hash changed"):
            retry.retry(project.id, recording_id)
        retained_chunk.write_bytes(pcm)
        finalized = retry.retry(project.id, recording_id)
        assert finalized["artifactReady"]
        assert json.loads(failure_journal.read_text())["recording"]["archiveStatus"] == "ready"
        assert retry.retry(project.id, recording_id)["sourceArchive"] == finalized["sourceArchive"]
        assert len(finalized["sourceArchive"]["tracks"]) == 1
        assert not stem.exists()
        assert (Path(project.project_path) / finalized["sourceArchive"]["sourcePath"]).is_file()
        assert (Path(project.project_path) / "assets" / "obs-livelink" / recording_id /
                "channels" / channel_id / "chunks" / "000000000000.pcm").is_file()


@pytest.mark.parametrize("source_count,force_pcm", [(1, False), (1, True), (2, False), (5, False)])
def test_mka_has_one_verified_track_per_source_and_portable_children(tmp_path, monkeypatch,
                                                                       source_count, force_pcm):
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        pytest.skip("FFmpeg and FFprobe are required for real archive verification")
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    root = Path(project.project_path)
    identities = [(str(uuid4()), str(uuid4())) for _ in range(source_count)]
    def advertise(count):
        payload = {"installId": hello["installId"], "connectionId": snapshot["connectionId"],
                   "connectionEpoch": snapshot["connectionEpoch"], "channels": [
                       {"channelId": channel, "sourceUuid": source,
                        "nativeName": f"Mic {index}", "alias": f"Channel {index + 1}",
                        "aliasRevision": 0, "slot": index + 1, "forward": True,
                        "missing": False, "meterPeak": 0, "sampleRate": 48000,
                        "audioChannels": 1, "muted": False}
                       for index, (channel, source) in enumerate(identities[:count])],
                   }
        runtime.sync(payload, link.heartbeat(token, payload))
    advertise(1)
    started = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "span-1")
    recording_id = started["appRecording"]["recordingId"]
    if source_count > 1:
        advertise(source_count)  # Sources added while capture is active.
    media = FileMediaLibrary(FileProjectRepository(tmp_path / "projects"))
    audio = FileObsLiveLinkAudio(link, runtime, FileProjectRepository(tmp_path / "projects"),
                                 media, ffmpeg, ffprobe)
    for index, (channel, source) in enumerate(identities):
        pcm = struct.pack("<" + "h" * 480, *([index + 1] * 480))
        at = 1_100_000_000 + index * 10_000_000
        audio.chunk(token, install_id=hello["installId"],
                    connection_id=snapshot["connectionId"], epoch=snapshot["connectionEpoch"],
                    recording_id=recording_id, channel_id=channel, source_uuid=source,
                    sequence=0, first_sample_index=4800 + index * 480,
                    frame_count=480, sample_rate=48000, channels=1,
                    obs_audio_timestamp_ns=at, plugin_monotonic_ns=at,
                    sha256=hashlib.sha256(pcm).hexdigest(), pcm=pcm)
    if source_count == 2:
        advertise(1)  # The second OBS source disappears before app Stop.
    lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "span-1")
    if force_pcm:
        actual_run = obs_livelink_archive._run
        def reject_flac(args):
            if "flac" in args:
                raise LiveLinkError("FLAC encoder unavailable", 503)
            return actual_run(args)
        monkeypatch.setattr(obs_livelink_archive, "_run", reject_flac)
    finalized = audio.finalize(token, install_id=hello["installId"],
                               connection_id=snapshot["connectionId"],
                               epoch=snapshot["connectionEpoch"], recording_id=recording_id)
    archive = finalized["sourceArchive"]
    assert finalized["artifactReady"]
    assert len(archive["tracks"]) == source_count
    assert [track["streamIndex"] for track in archive["tracks"]] == list(range(source_count))
    assert len({track["trackUid"] for track in archive["tracks"]}) == source_count
    assert all(track["trackUid"] > 0 for track in archive["tracks"])
    assert (root / archive["sourcePath"]).is_file()
    assert media.get(project.id, archive["parentAssetId"]).obs_recording_id == recording_id
    assert media.get(project.id, archive["parentAssetId"]).name == started["appRecording"]["displayName"]
    assert started["appRecording"]["displayName"].endswith(f"_OBS-runtime_LIV_{recording_id[:8]}")
    assert media.get(project.id, archive["parentAssetId"]).audio_codec == (
        "pcm_s16le" if force_pcm else "flac")
    journal = json.loads((root / "assets" / "obs-livelink" / recording_id / "recording.json").read_text())
    assert journal["recording"]["archiveStatus"] == "ready"
    assert journal["recording"]["sourceArchive"] == archive
    manifest = json.loads((root / "assets" / "obs-livelink" / recording_id /
                           "pro4bro-session.json").read_text(encoding="utf-8"))
    assert len(manifest["tracks"]) == source_count
    assert [item["trackUid"] for item in manifest["tracks"]] == [
        item["trackUid"] for item in archive["tracks"]]
    assert "token" not in json.dumps(manifest).lower()
    for track, stem in zip(archive["tracks"], finalized["sourceStems"]):
        child = media.get(project.id, stem["assetId"])
        assert child.source_archive_asset_id == archive["parentAssetId"]
        assert child.source_archive_stream_index == track["streamIndex"]
        assert child.source_archive_track_uid == track["trackUid"]
        assert child.source_path == child.analysis_path == track["analysisPath"]
        with wave.open(str(root / child.analysis_path), "rb") as wav:
            assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (24000, 1, 2)
    assert len([item for item in media.list(project.id) if item.source_path.endswith(".mka")]) == 1
    def must_not_reencode(*args, **kwargs):
        raise AssertionError("A retried finalize must reuse the verified archive")
    monkeypatch.setattr(audio.archiver, "finalize", must_not_reencode)
    repeated = audio.finalize(token, install_id=hello["installId"],
                              connection_id=snapshot["connectionId"],
                              epoch=snapshot["connectionEpoch"], recording_id=recording_id)
    assert repeated["sourceArchive"] == archive
    if source_count == 2:
        relocated = tmp_path / "relocated-project"
        shutil.copytree(root, relocated)
        reopened_projects = FileProjectRepository(tmp_path / "other-registry")
        reopened = reopened_projects.open(relocated)
        reopened_media = FileMediaLibrary(reopened_projects)
        assert reopened.id == project.id
        assert (relocated / archive["sourcePath"]).is_file()
        assert reopened_media.get(reopened.id, archive["parentAssetId"]).obs_recording_id == recording_id
        for stem in finalized["sourceStems"]:
            assert reopened_media.resolve_audio_path(reopened.id, stem["assetId"]).is_file()
            assert reopened_media.get(reopened.id, stem["assetId"]).source_archive_asset_id == archive["parentAssetId"]


def test_archiving_old_take_does_not_block_pcm_for_next_take(tmp_path, monkeypatch):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    channel_id, source_id = str(uuid4()), str(uuid4())
    advertise(runtime, link, token, hello, snapshot, [source(channel_id, source_id)])
    audio = FileObsLiveLinkAudio(link, runtime, runtime.projects, FileMediaLibrary(runtime.projects), None)
    pcm = struct.pack("<480h", *([1200] * 480))
    def send(recording_id, at):
        return audio.chunk(token, install_id=hello["installId"], connection_id=snapshot["connectionId"],
                           epoch=snapshot["connectionEpoch"], recording_id=recording_id,
                           channel_id=channel_id, source_uuid=source_id, sequence=0,
                           first_sample_index=0, frame_count=480, sample_rate=48000, channels=1,
                           obs_audio_timestamp_ns=at, plugin_monotonic_ns=at,
                           sha256=hashlib.sha256(pcm).hexdigest(), pcm=pcm)
    old_id = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000, "old")["appRecording"]["recordingId"]
    send(old_id, 1_100_000_000)
    lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "old")
    new_id = lifecycle(runtime, token, hello, snapshot, 2, "obs-start", 3_000_000_000, "new")["appRecording"]["recordingId"]
    entered, release, received = threading.Event(), threading.Event(), threading.Event()
    def slow_archive(*args):
        entered.set()
        release.wait(3)
        raise LiveLinkError("test archive stopped", 503)
    monkeypatch.setattr(audio.archiver, "finalize", slow_archive)
    with ThreadPoolExecutor(max_workers=2) as pool:
        old = pool.submit(audio.finalize, token, install_id=hello["installId"],
                          connection_id=snapshot["connectionId"], epoch=snapshot["connectionEpoch"], recording_id=old_id)
        assert entered.wait(1)
        def receive():
            result = send(new_id, 3_100_000_000)
            received.set()
            return result
        new = pool.submit(receive)
        try:
            assert received.wait(.5), "Old archive blocked durable PCM receipt for the active take"
        finally:
            release.set()
        assert new.result()["durable"]
        with pytest.raises(LiveLinkError):
            old.result()
