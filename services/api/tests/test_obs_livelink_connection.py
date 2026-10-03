import json
import uuid
from dataclasses import replace
from types import SimpleNamespace

import pytest

from app.adapters.obs_livelink_connection import LiveLinkError, ObsLiveLinkConnection


def connection(tmp_path):
    path = tmp_path / "livelink-install.json"
    path.write_text(json.dumps({"installId": str(uuid.uuid4()), "token": "s" * 40}))
    return ObsLiveLinkConnection(path), json.loads(path.read_text())


def hello(identity):
    return {
        "installId": identity["installId"], "processInstanceId": str(uuid.uuid4()),
        "protocolMin": 3, "protocolMax": 3,
    }


def channel(channel_id=None, source_uuid=None):
    return {
        "channelId": channel_id or str(uuid.uuid4()), "sourceUuid": source_uuid or str(uuid.uuid4()),
        "nativeName": "Mic", "alias": "Channel 1", "aliasRevision": 0, "slot": 1,
        "forward": False, "missing": False, "meterPeak": 12,
        "sampleRate": 48000, "audioChannels": 2, "muted": False,
    }


def outbox_health(**changes):
    return {"readable": True, "retainedChunks": 12, "rejectedChunks": 2,
            "oldestRetainedAgeMs": 30000, "memoryFrames": 480, "unspooledChunks": 1,
            "overflowFrames": 8192, "lastSpoolError": "append: disk full", **changes}


def test_outbox_health_legacy_disconnect_and_new_process(tmp_path):
    link, identity = connection(tmp_path)
    token = "Bearer " + identity["token"]
    first = link.hello(token, {**hello(identity), "outbox": outbox_health()})
    health = first["outbox"]
    assert health["retainedChunks"] == 12 and health["rejectedChunks"] == 2
    assert health["oldestRetainedAgeMs"] == 30000
    assert health["lastSpoolError"] == "append: disk full"
    assert health["reportAgeSeconds"] >= 0 and not health["stale"]
    health["retainedChunks"] = 999  # returned dictionaries cannot mutate server state
    assert link.status()["outbox"]["retainedChunks"] == 12
    link._connection["deadline"] = 0
    assert link.status()["outbox"]["stale"]
    assert link.hello(token, hello(identity))["outbox"] is None


def test_outbox_unreadable_counts_unknown_and_heartbeat_legacy(tmp_path):
    link, identity = connection(tmp_path)
    token = "Bearer " + identity["token"]
    first = link.hello(token, {**hello(identity), "outbox": outbox_health(
        readable=False, retainedChunks=None, rejectedChunks=None, oldestRetainedAgeMs=None)})
    assert first["outbox"]["retainedChunks"] is None
    payload = {"installId": identity["installId"], "connectionId": first["connectionId"],
               "connectionEpoch": first["connectionEpoch"]}
    assert link.heartbeat(token, {**payload, "outbox": outbox_health(oldestRetainedAgeMs=None)})[
        "outbox"]["oldestRetainedAgeMs"] is None
    assert link.heartbeat(token, payload)["outbox"] is None


@pytest.mark.parametrize("changes", [
    {"retainedChunks": True}, {"rejectedChunks": 13}, {"memoryFrames": -1},
    {"unspooledChunks": 2**53}, {"oldestRetainedAgeMs": float("nan")},
    {"retainedChunks": 0, "rejectedChunks": 0}, {"lastSpoolError": "x" * 2049},
    {"readable": "yes"},
])
def test_invalid_outbox_does_not_replace_last_report(tmp_path, changes):
    link, identity = connection(tmp_path)
    token = "Bearer " + identity["token"]
    first = link.hello(token, {**hello(identity), "outbox": outbox_health()})
    with pytest.raises(LiveLinkError) as error:
        link.heartbeat(token, {"installId": identity["installId"],
            "connectionId": first["connectionId"], "connectionEpoch": first["connectionEpoch"],
            "outbox": outbox_health(**changes)})
    assert error.value.status == 422
    assert link.status()["outbox"]["retainedChunks"] == 12


def test_inventory_command_ack_and_epoch_recovery(tmp_path):
    link, identity = connection(tmp_path)
    token = "Bearer " + identity["token"]
    first_channel = channel()
    payload = {**hello(identity), "sceneCollection": "Main", "channels": [first_channel]}
    first = link.hello(token, payload)
    assert first["channels"][0]["appliedForward"] is False
    assert first["channels"][0]["sampleRate"] == 48000
    assert first["channels"][0]["audioChannels"] == 2
    desired = link.set_forward(first_channel["channelId"], True)
    assert desired["channels"][0]["desiredForward"] is True
    assert desired["channels"][0]["appliedForward"] is False
    polled = link.commands(token, identity["installId"], first["connectionId"], first["connectionEpoch"], 0, 0)
    command = polled["commands"][0]
    assert command["sourceUuid"] == first_channel["sourceUuid"]
    assert link.commands(token, identity["installId"], first["connectionId"], first["connectionEpoch"], 0, 0)["commands"] == [command]
    ack = {"installId": identity["installId"], "connectionId": first["connectionId"],
           "connectionEpoch": first["connectionEpoch"], "commandId": command["commandId"],
           "revision": command["revision"], "appliedState": True, "appliedMonotonicNs": 123456, "sampleIndex": None}
    with pytest.raises(LiveLinkError):
        link.acknowledge(token, {**ack, "connectionEpoch": "stale"})
    assert link.acknowledge(token, ack)["channels"][0]["appliedForward"] is True
    assert link.acknowledge(token, ack)["channels"][0]["appliedMonotonicNs"] == 123456
    with pytest.raises(LiveLinkError):
        link.acknowledge(token, {**ack, "appliedMonotonicNs": 1})
    link.heartbeat(token, {"installId": identity["installId"], "connectionId": first["connectionId"],
        "connectionEpoch": first["connectionEpoch"], "sceneCollection": "Main",
        "channels": [{**first_channel, "forward": True, "meterPeak": 20}]})
    assert link.status()["channels"][0]["appliedMonotonicNs"] == 123456
    link._connection["deadline"] = 0
    second = link.hello(token, {**payload, "channels": [{**first_channel, "forward": True}]})
    assert second["connectionEpoch"] != first["connectionEpoch"]
    assert second["channels"][0]["appliedForward"] is True
    assert second["commandRevision"] == 0
    assert link.commands(token, identity["installId"], second["connectionId"], second["connectionEpoch"], 0, 0)["commands"] == []


def test_inventory_rejects_duplicate_uuid_and_missing_toggle(tmp_path):
    link, identity = connection(tmp_path)
    first_channel = channel()
    with pytest.raises(LiveLinkError):
        link.hello("Bearer " + identity["token"], {**hello(identity), "channels": [first_channel, first_channel]})
    with pytest.raises(LiveLinkError):
        link.hello("Bearer " + identity["token"], {**hello(identity), "channels": [{**first_channel, "audioChannels": 99}]})
    snapshot = link.hello("Bearer " + identity["token"], {**hello(identity), "channels": [{**first_channel, "missing": True}]})
    assert snapshot["channels"][0]["missing"] is True
    with pytest.raises(LiveLinkError):
        link.set_forward(first_channel["channelId"], True)


def test_app_action_command_has_epoch_scoped_applied_ack(tmp_path):
    link, identity = connection(tmp_path)
    token = "Bearer " + identity["token"]
    first = link.hello(token, hello(identity))
    command = link.queue_action("start", "recording-one")
    with pytest.raises(LiveLinkError):
        link.queue_action("stop")
    polled = link.commands(token, identity["installId"], first["connectionId"],
                           first["connectionEpoch"], 0, 0)
    assert polled["commands"] == [command]
    ack = {"installId": identity["installId"], "connectionId": first["connectionId"],
           "connectionEpoch": first["connectionEpoch"], "commandId": command["commandId"],
           "revision": command["revision"], "appliedState": "start",
           "appliedMonotonicNs": 1000, "sampleIndex": None}
    with pytest.raises(LiveLinkError):
        link.acknowledge(token, {**ack, "appliedState": "stop"})
    assert link.acknowledge(token, ack)["commandRevision"] == 1
    assert link.acknowledge(token, ack)["commandRevision"] == 1
    assert link.pending_command(command["commandId"]) is None


def test_hello_heartbeat_and_repair_token_rotation(tmp_path):
    link, identity = connection(tmp_path)
    payload = hello(identity)
    with pytest.raises(LiveLinkError) as wrong:
        link.hello("Bearer wrong", payload)
    assert wrong.value.status == 401
    first = link.hello("Bearer " + "s" * 40, payload)
    assert first["negotiatedVersion"] == 3
    assert link.hello("Bearer " + "s" * 40, payload)["connectionEpoch"] == first["connectionEpoch"]
    assert link.heartbeat("Bearer " + "s" * 40, {"installId": identity["installId"], "connectionId": first["connectionId"], "connectionEpoch": first["connectionEpoch"], "recordingActive": True, "recordingPaused": True})["obsRecording"] == "paused"
    with pytest.raises(LiveLinkError):
        link.heartbeat("Bearer " + "s" * 40, {"installId": identity["installId"], "connectionId": first["connectionId"], "connectionEpoch": "stale"})
    link.pairing_file.write_text(json.dumps({**identity, "token": "r" * 40}))
    with pytest.raises(LiveLinkError) as revoked:
        link.hello("Bearer " + "s" * 40, payload)
    assert revoked.value.status == 401


def test_single_owner_lease_expiry_and_release(tmp_path):
    link, _ = connection(tmp_path)
    assert link.claim(project_id="one", project_name="One", owner_id="tab-a")["activeProject"]["name"] == "One"
    with pytest.raises(LiveLinkError) as held:
        link.claim(project_id="two", project_name="Two", owner_id="tab-b")
    assert held.value.status == 409
    assert link.release("tab-b")["activeProject"]["id"] == "one"
    link._lease["deadline"] = 0
    assert link.status()["activeProject"] is None
    assert link.claim(project_id="two", project_name="Two", owner_id="tab-b")["activeProject"]["id"] == "two"
    assert link.release("tab-b")["activeProject"] is None


def test_protocol_mismatch_does_not_connect(tmp_path):
    link, identity = connection(tmp_path)
    with pytest.raises(LiveLinkError) as mismatch:
        link.hello("Bearer " + "s" * 40, {**hello(identity), "protocolMin": 4})
    assert mismatch.value.status == 426
    assert link.status()["connectionState"] == "disconnected"


def test_api_pairing_and_project_target(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import app.main as main
    from app.adapters.file_project_repository import FileProjectRepository
    from app.domain.models import ProjectCreate
    from app.settings import Settings

    link, identity = connection(tmp_path)
    monkeypatch.setattr(main, "ObsPluginInstallation", lambda *_: SimpleNamespace(user_config=link.pairing_file))
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="OBS target"))
    client = TestClient(main.create_app(project_repository=projects, settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    source = channel()
    payload = {**hello(identity), "pluginVersion": "0.4.0", "obsVersion": "32.2.2",
               "sceneCollection": "Main", "channels": [source]}
    route = "/api/obs-livelink/v3"
    assert client.post(route + "/hello", json=payload).status_code == 401
    first = client.post(route + "/hello", json=payload, headers={"Authorization": "Bearer " + "s" * 40})
    assert first.status_code == 200
    assert first.json()["negotiatedVersion"] == 3
    assert "capture" not in first.json()["channels"][0]
    assert client.get(route + "/status").json()["channels"][0]["capture"]["state"] == "idle"
    desired = client.post(route + f"/channels/{source['channelId']}/forward", json={"enabled": True})
    assert desired.status_code == 200
    assert desired.json()["channels"][0]["appliedForward"] is False
    assert desired.json()["channels"][0]["pendingCommandId"]
    command_reply = client.get(route + f"/connections/{first.json()['connectionId']}/commands", params={
        "installId": identity["installId"], "epoch": first.json()["connectionEpoch"], "waitSeconds": 0,
    }, headers={"Authorization": "Bearer " + "s" * 40})
    assert command_reply.status_code == 200
    command = command_reply.json()["commands"][0]
    ack = client.post(route + "/commands/ack", json={
        "installId": identity["installId"], "connectionId": first.json()["connectionId"],
        "connectionEpoch": first.json()["connectionEpoch"], "commandId": command["commandId"],
        "revision": command["revision"], "appliedState": True, "appliedMonotonicNs": 123456,
    }, headers={"Authorization": "Bearer " + "s" * 40})
    assert ack.status_code == 200
    assert ack.json()["channels"][0]["appliedForward"] is True
    assert client.get(route + "/status").json()["channels"][0]["pendingCommandId"] is None
    claim = client.put(route + "/lease", json={"projectId": project.id, "ownerId": "tab-a"})
    assert claim.json()["activeProject"]["name"] == "OBS target"
    assert client.put(route + "/lease", json={"projectId": project.id, "ownerId": "tab-b"}).status_code == 409
    heartbeat = client.post(route + "/heartbeat", json={
        "installId": identity["installId"], "connectionId": first.json()["connectionId"],
        "connectionEpoch": first.json()["connectionEpoch"],
        "outbox": outbox_health(),
    }, headers={"Authorization": "Bearer " + "s" * 40})
    assert heartbeat.json()["activeProject"]["id"] == project.id
    assert heartbeat.json()["outbox"]["retainedChunks"] == 12
    assert client.get(route + "/status").json()["outbox"]["rejectedChunks"] == 2
    assert client.post(route + "/lease/release", json={"ownerId": "tab-a"}).json()["activeProject"] is None


def test_plugin_http_snapshots_survive_large_archive_track_uid(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import app.main as main
    from app.adapters.file_project_repository import FileProjectRepository
    from app.domain.models import ProjectCreate
    from app.settings import Settings

    link, identity = connection(tmp_path)
    monkeypatch.setattr(main, "ObsPluginInstallation", lambda *_: SimpleNamespace(user_config=link.pairing_file))
    runtime_type = main.ObsLiveLinkRuntime
    runtimes = []

    def capture_runtime(*args, **kwargs):
        runtime = runtime_type(*args, **kwargs)
        runtimes.append(runtime)
        return runtime

    monkeypatch.setattr(main, "ObsLiveLinkRuntime", capture_runtime)
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="OBS large UID"))
    client = TestClient(main.create_app(
        project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data"),
    ))
    route = "/api/obs-livelink/v3"
    headers = {"Authorization": "Bearer " + identity["token"]}
    payload = {**hello(identity), "pluginVersion": "0.4.0", "obsVersion": "32.2.2",
               "sceneCollection": "Main", "channels": []}
    first = client.post(route + "/hello", json=payload, headers=headers)
    assert first.status_code == 200
    snapshot = first.json()
    assert client.put(route + "/lease", json={"projectId": project.id, "ownerId": "tab-a"}).status_code == 200

    def lifecycle(sequence, kind, span_id):
        response = client.post(route + "/lifecycle", json={
            "installId": identity["installId"], "processInstanceId": payload["processInstanceId"],
            "connectionId": snapshot["connectionId"], "connectionEpoch": snapshot["connectionEpoch"],
            "eventId": f"event-{sequence}", "sequence": sequence, "kind": kind,
            "monotonicNs": (sequence + 1) * 1_000_000_000, "spanId": span_id,
        }, headers=headers)
        assert response.status_code == 200
        return response.json()

    first_id = lifecycle(0, "obs-start", "span-1")["appRecording"]["recordingId"]
    lifecycle(1, "obs-stop", "span-1")
    large_uid = 12_738_617_874_486_415_437
    runtimes[0].archive_ready(first_id, {
        "parentAssetId": "archive-1",
        "sourcePath": f"assets/obs-livelink/{first_id}/source.mka",
        "tracks": [{
            "channelId": "channel-1", "sourceUuid": "source-1", "streamIndex": 0,
            "trackUid": large_uid, "relayLabel": "Mic", "aliasRevision": 0,
        }],
    })
    app_status = client.get(route + "/status")
    assert app_status.status_code == 200
    assert app_status.json()["recentRecordings"][0]["sourceArchive"]["tracks"][0]["trackUid"] == large_uid

    heartbeat = client.post(route + "/heartbeat", json={
        "installId": identity["installId"], "connectionId": snapshot["connectionId"],
        "connectionEpoch": snapshot["connectionEpoch"], "channels": [],
    }, headers=headers)
    assert heartbeat.status_code == 200
    assert heartbeat.json()["recentRecordings"][0]["recordingId"] == first_id
    assert str(large_uid) not in heartbeat.text

    rehello = client.post(route + "/hello", json=payload, headers=headers)
    assert rehello.status_code == 200
    assert str(large_uid) not in rehello.text
    second = lifecycle(2, "obs-start", "span-2")
    assert second["appRecording"]["recordingId"] != first_id
    resumed = client.post(route + "/heartbeat", json={
        "installId": identity["installId"], "connectionId": snapshot["connectionId"],
        "connectionEpoch": snapshot["connectionEpoch"], "channels": [],
    }, headers=headers)
    assert resumed.status_code == 200
    assert resumed.json()["appRecording"]["recordingId"] == second["appRecording"]["recordingId"]
