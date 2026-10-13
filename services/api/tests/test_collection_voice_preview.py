from __future__ import annotations

import hashlib
import json
import threading
import time
import wave
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.collection_voice_preview import CollectionVoicePreviews, make_collection_preview_router
from app.adapters.gpu_lease import GpuLease
from app.adapters.voice_collection_transfer import FileVoiceCollectionTransfer
from app.domain.models import VoiceCollectionCreate
from test_voice_collections import fixture


class Renderer:
    def __init__(self, root, seconds=16, write=True):
        self.gpu_lease = GpuLease(root / "gpu.json")
        self.seconds, self.write = seconds, write
        self.entered, self.release = threading.Event(), threading.Event()
        self.release.set()
        self.calls = []

    def generator_for(self, engine):
        return "test" if engine == "omnivoice" else None

    def prepare_archived(self, voice, root, generator, parameters):
        assert root.is_dir()
        return voice

    def speak(self, plan, text, output, duration=None, cancellation_id=None):
        assert self.gpu_lease.holder() is not None
        self.calls.append((plan.id, text))
        self.entered.set()
        assert self.release.wait(10)
        if self.write:
            frames = np.arange(int(24000 * self.seconds))
            pcm = (3276 * np.sin(frames * 2 * np.pi * 220 / 24000)).astype("<i2")
            with wave.open(str(output), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(24000)
                wav.writeframes(pcm.tobytes())
        return 999  # A worker's claim cannot substitute for probing actual audio.


def setup(tmp_path, **kwargs):
    values = fixture(tmp_path)
    store = values[-1]
    collection = store.create(VoiceCollectionCreate(name="Samples"))
    entry = store.add_entry(collection.id, values[1].id, values[5].id)
    renderer = Renderer(tmp_path, **kwargs)
    manager = CollectionVoicePreviews(store, renderer)
    return values, collection, entry, renderer, manager


def finished(manager, cid, eid):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        state = manager.get(cid, eid)
        if state.status not in {"queued", "running"}:
            return state
        time.sleep(.01)
    pytest.fail("Preview job did not finish")


def test_preview_receipt_precedes_work_and_only_measured_audio_becomes_ready(tmp_path):
    values, collection, entry, renderer, manager = setup(tmp_path)
    renderer.release.clear()
    source = values[3] / values[5].reference_audio
    before = (hashlib.sha256(source.read_bytes()).hexdigest(), source.stat().st_mtime_ns)
    try:
        receipt = manager.start(collection.id, entry.id)
        assert receipt.status == "queued"
        assert renderer.entered.wait(5)
        assert manager.get(collection.id, entry.id).status == "running"
        assert manager.start(collection.id, entry.id).status in {"queued", "running"}
        renderer.release.set()
        ready = finished(manager, collection.id, entry.id)
        assert ready.status == "ready" and ready.duration == 16
        assert ready.audio_url.endswith("/preview/audio")
        assert ready.training_seconds is None
        for fragment in ("An", "nữ", "Hà Nội", "LoRA", "OmniVoice", "chưa có thông tin"):
            assert fragment in ready.script
        assert len(renderer.calls) == 1
        assert before == (hashlib.sha256(source.read_bytes()).hexdigest(), source.stat().st_mtime_ns)
        assert renderer.gpu_lease.holder() is None
    finally:
        renderer.release.set()
        manager.close()


@pytest.mark.parametrize("seconds,write", [(14, True), (16, False), (0, True)])
def test_short_missing_and_empty_outputs_never_publish(tmp_path, seconds, write):
    _, collection, entry, _, manager = setup(tmp_path, seconds=seconds, write=write)
    try:
        manager.start(collection.id, entry.id)
        state = finished(manager, collection.id, entry.id)
        assert state.status == "error" and state.audio_url is None
        assert state.error
        assert not (manager.collections._entry_folder(collection.id, entry.id) / "preview/sample.wav").exists()
    finally:
        manager.close()


def test_tampered_archived_weights_fail_before_renderer(tmp_path):
    _, collection, entry, renderer, manager = setup(tmp_path)
    root = manager.collections._entry_folder(collection.id, entry.id)
    (root / "payload" / entry.voice.adapter_path / "adapter.bin").write_bytes(b"tampered")
    try:
        manager.start(collection.id, entry.id)
        assert finished(manager, collection.id, entry.id).status == "error"
        assert not renderer.calls
    finally:
        manager.close()


def test_cached_sample_survives_package_import_and_corruption_is_not_served(tmp_path):
    _, collection, entry, _, manager = setup(tmp_path)
    store = manager.collections
    try:
        manager.start(collection.id, entry.id)
        assert finished(manager, collection.id, entry.id).status == "ready"
        audio = manager.audio(collection.id, entry.id)
        original = hashlib.sha256(audio.read_bytes()).hexdigest()
        transfer = FileVoiceCollectionTransfer(store)
        package = tmp_path / "voice.zip"
        transfer.export_entry(collection.id, entry.id, package)
        destination = store.create(VoiceCollectionCreate(name="Imported"))
        imported = transfer.import_package(destination.id, package)
        assert manager.get(destination.id, imported.id).status == "ready"
        assert hashlib.sha256(manager.audio(destination.id, imported.id).read_bytes()).hexdigest() == original
        assert manager.get(destination.id, imported.id).script == manager.get(collection.id, entry.id).script
        audio.write_bytes(b"corrupted")
        assert manager.get(collection.id, entry.id).status == "missing"
        with pytest.raises(ValueError):
            manager.audio(collection.id, entry.id)
    finally:
        manager.close()


def test_preview_routes_only_serve_ready_audio(tmp_path):
    _, collection, entry, _, manager = setup(tmp_path)
    app = FastAPI()
    app.include_router(make_collection_preview_router(manager))
    prefix = f"/api/voice-collections/{collection.id}/entries/{entry.id}/preview"
    try:
        with TestClient(app) as client:
            assert client.get(prefix).json()["status"] == "missing"
            assert client.get(prefix + "/audio").status_code == 409
            assert client.post(prefix).json()["status"] == "queued"
            assert finished(manager, collection.id, entry.id).status == "ready"
            response = client.get(prefix + "/audio")
            assert response.status_code == 200 and response.content.startswith(b"RIFF")
            assert client.get(prefix.replace(entry.id, "missing")).status_code == 404
    finally:
        manager.close()


def test_cached_preview_stops_being_ready_after_weights_change(tmp_path):
    _, collection, entry, _, manager = setup(tmp_path)
    try:
        manager.start(collection.id, entry.id)
        assert finished(manager, collection.id, entry.id).status == "ready"
        root = manager.collections._entry_folder(collection.id, entry.id)
        (root / "payload" / entry.voice.adapter_path / "adapter.bin").write_bytes(b"tampered after preview")
        assert manager.get(collection.id, entry.id).status == "error"
        with pytest.raises(ValueError):
            manager.audio(collection.id, entry.id)
    finally:
        manager.close()


@pytest.mark.parametrize("field", ["schemaVersion", "channels"])
def test_preview_metadata_never_accepts_boolean_integers(tmp_path, field):
    _, collection, entry, _, manager = setup(tmp_path)
    try:
        manager.start(collection.id, entry.id)
        assert finished(manager, collection.id, entry.id).status == "ready"
        path = manager.collections._entry_folder(collection.id, entry.id) / "preview/preview.json"
        record = json.loads(path.read_text(encoding="utf-8"))
        if field == "schemaVersion":
            record[field] = True
        else:
            record["audio"][field] = True
        path.write_text(json.dumps(record), encoding="utf-8")
        assert manager.get(collection.id, entry.id).status == "missing"
        with pytest.raises(ValueError):
            FileVoiceCollectionTransfer(manager.collections).export_entry(collection.id, entry.id, tmp_path / "bad.zip")
    finally:
        manager.close()


def test_close_waits_for_cleanup_and_does_not_publish_late_output(tmp_path):
    _, collection, entry, renderer, manager = setup(tmp_path)
    renderer.release.clear()
    manager.start(collection.id, entry.id)
    assert renderer.entered.wait(5)
    closer = threading.Thread(target=manager.close)
    closer.start()
    time.sleep(.02)
    assert closer.is_alive()
    renderer.release.set()
    closer.join(5)
    assert not closer.is_alive()
    assert renderer.gpu_lease.holder() is None
    assert manager.get(collection.id, entry.id).status == "error"
    assert not (manager.collections._entry_folder(collection.id, entry.id) / "preview").exists()


def test_unavailable_generator_and_busy_gpu_do_not_publish_fake_samples(tmp_path):
    _, collection, entry, renderer, manager = setup(tmp_path)
    original = renderer.generator_for
    try:
        renderer.generator_for = lambda _engine: None
        assert manager.start(collection.id, entry.id).status == "unsupported"
        assert not renderer.calls
        renderer.generator_for = original
        lease = renderer.gpu_lease.acquire("owner-training")
        manager.start(collection.id, entry.id)
        state = finished(manager, collection.id, entry.id)
        assert state.status == "error" and "owner-training" in state.error
        assert not renderer.calls
        assert renderer.gpu_lease.holder().token == lease.token
        renderer.gpu_lease.release(lease.token)
    finally:
        manager.close()


@pytest.mark.parametrize("bad", [{"members": [False]}, ["invalid"], 42])
def test_malformed_model_set_metadata_is_a_client_error_not_a_server_crash(tmp_path, bad):
    _, collection, entry, _, manager = setup(tmp_path)
    root = manager.collections._entry_folder(collection.id, entry.id)
    path = root / "lineage.json"
    lineage = json.loads(path.read_text(encoding="utf-8"))
    lineage["provenance"]["sourceModelSet"] = bad
    path.write_text(json.dumps(lineage), encoding="utf-8")
    app = FastAPI()
    app.include_router(make_collection_preview_router(manager))
    try:
        with TestClient(app) as client:
            assert client.get(f"/api/voice-collections/{collection.id}/entries/{entry.id}/preview").status_code == 400
    finally:
        manager.close()


@pytest.mark.parametrize("start,end", [(4, 3), (0, float("inf"))])
def test_training_seconds_rejects_invalid_ranges_even_with_matching_manifest_hash(start, end):
    from app.adapters.file_voice_collections import FileVoiceCollections

    raw = json.dumps({"id": "manifest", "segments": [{"id": "s", "assetId": "a", "audioPath": "assets/source.wav",
                     "start": start, "end": end, "text": "hello", "speakerProfileId": "speaker"}]})
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    lineage = {"provenance": {"sourceRun": {"manifestId": "manifest", "manifestHash": digest, "speakerProfileId": "speaker"},
                             "sourceDataset": {"json": raw, "sha256": digest}}}
    with pytest.raises(ValueError, match="finite positive duration"):
        FileVoiceCollections.training_seconds(lineage)
