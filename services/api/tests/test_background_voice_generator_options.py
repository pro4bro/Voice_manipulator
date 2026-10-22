from __future__ import annotations

import json
import threading
import time
from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from app.adapters.training_model_catalog import (
    BackgroundTrainingModelOptions,
    FileTrainingModelCatalog,
    READINESS_PENDING_PREFIX,
)
from app.main import create_app
from app.settings import Settings


def make_catalog(tmp_path: Path, readiness, *, readiness_required: bool = True):
    shipped = tmp_path / "shipped"
    repo = tmp_path / "fixture-engine"
    (repo / "engine.py").parent.mkdir(parents=True)
    (repo / "engine.py").write_text("# fixture entrypoint", encoding="utf-8")
    descriptor = {
        "schemaVersion": 1,
        "id": "fixture-generator",
        "label": "Fixture Generator",
        "family": "Fixture",
        "engine": "fixture-engine",
        "mode": "generate",
        "category": "clone",
        "runnable": True,
        "readinessRequired": readiness_required,
        "blockedReason": "Keep this descriptor note while checking readiness.",
        "repository": {
            "root": "fixture-engine",
            "path": ".",
            "entrypoint": "engine.py",
        },
        "parameters": [{
            "key": "temperature",
            "label": "Temperature",
            "kind": "float",
            "default": 0.7,
            "min": 0.1,
            "max": 1.0,
        }],
    }
    shipped.mkdir()
    (shipped / "fixture-generator.json").write_text(json.dumps(descriptor), encoding="utf-8")
    catalog = FileTrainingModelCatalog(
        shipped,
        {"fixture-engine": repo},
        readiness={"fixture-engine": readiness},
    )
    return catalog


def wait_for_status(options: BackgroundTrainingModelOptions, prefix: str | None = None):
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        option = options.options()[0]
        if not option.status.startswith(READINESS_PENDING_PREFIX) and (
            prefix is None or option.status.startswith(prefix)
        ):
            return option
        time.sleep(0.01)
    raise AssertionError("Background readiness did not finish within two seconds")


def test_background_options_return_pending_then_ready_and_refresh_after_ttl(tmp_path):
    started = threading.Event()
    refreshed = threading.Event()
    release = threading.Event()
    calls = 0

    def readiness(_descriptor):
        nonlocal calls
        calls += 1
        if calls == 1:
            started.set()
            assert release.wait(2)
        else:
            refreshed.set()
        return None

    clock = [100.0]
    catalog = make_catalog(tmp_path, readiness)
    options = BackgroundTrainingModelOptions(catalog, ttl_seconds=60, monotonic=lambda: clock[0])
    try:
        pending = options.options()[0]
        assert pending.available is False
        assert pending.status.startswith(READINESS_PENDING_PREFIX)
        assert pending.blocked_reason == "Keep this descriptor note while checking readiness."
        assert pending.parameters[0].key == "temperature"
        assert started.wait(1)

        still_pending = options.options()[0]
        assert still_pending.status.startswith(READINESS_PENDING_PREFIX)
        assert calls == 1

        release.set()
        ready = wait_for_status(options)
        assert ready.available is True
        assert ready.status == "Sẵn sàng."
        assert ready.blocked_reason == "Keep this descriptor note while checking readiness."
        assert calls == 1

        clock[0] += 60.1
        release.clear()
        refreshed_pending = options.options()[0]
        assert refreshed_pending.available is False
        assert refreshed_pending.status.startswith(READINESS_PENDING_PREFIX)
        assert refreshed.wait(1)
        assert calls == 2
    finally:
        release.set()


def test_registered_readiness_is_deferred_even_without_descriptor_flag(tmp_path):
    started = threading.Event()
    release = threading.Event()

    def readiness(_descriptor):
        started.set()
        assert release.wait(2)
        return "Weights are not installed."

    catalog = make_catalog(tmp_path, readiness, readiness_required=False)
    options = BackgroundTrainingModelOptions(catalog)
    try:
        pending = options.options()[0]
        assert pending.available is False
        assert pending.status.startswith(READINESS_PENDING_PREFIX)
        assert pending.parameters[0].key == "temperature"
        assert started.wait(1)
        release.set()
        blocked = wait_for_status(options, prefix="Weights are not installed.")
        assert blocked.available is False
        assert blocked.blocked_reason == "Keep this descriptor note while checking readiness."
    finally:
        release.set()


def test_probe_failure_is_returned_as_unavailable_not_ready(tmp_path):
    def readiness(_descriptor):
        raise RuntimeError("model probe failed")

    catalog = make_catalog(tmp_path, readiness)
    options = BackgroundTrainingModelOptions(catalog)
    pending = options.options()[0]
    assert pending.status.startswith(READINESS_PENDING_PREFIX)

    failed = wait_for_status(options, prefix="Không kiểm tra được runtime/model:")
    assert failed.available is False
    assert "model probe failed" in failed.status
    assert failed.blocked_reason == "Keep this descriptor note while checking readiness."


def test_direct_get_still_runs_readiness_synchronously(tmp_path):
    calls = 0

    def readiness(_descriptor):
        nonlocal calls
        calls += 1
        return "Weights are not installed."

    catalog = make_catalog(tmp_path, readiness)
    option = catalog.get("fixture-generator")

    assert calls == 1
    assert option.available is False
    assert option.status == "Weights are not installed."


def test_voice_generator_endpoint_keeps_sync_default_and_exposes_background_query(tmp_path):
    shipped = tmp_path / "shipped"
    local = tmp_path / "local"
    repo = tmp_path / "vibevoice"
    shipped.mkdir()
    repo.mkdir()
    (repo / "entry.py").write_text("# fixture entrypoint", encoding="utf-8")
    local.mkdir()
    (local / "fixture-generator.json").write_text(json.dumps({
        "schemaVersion": 1,
        "id": "fixture-generator",
        "label": "Fixture Generator",
        "family": "Fixture",
        "engine": "vibevoice",
        "mode": "generate",
        "category": "clone",
        "runnable": True,
        "readinessRequired": True,
        "blockedReason": "Preserved descriptor text.",
        "repository": {"root": "vibevoice", "path": ".", "entrypoint": "entry.py"},
    }), encoding="utf-8")
    settings = replace(
        Settings.from_env(),
        project_root=tmp_path,
        data_root=tmp_path / "data",
        omnivoice_root=tmp_path / "omnivoice",
        training_models_root=tmp_path / "training-models",
        local_training_models_root=tmp_path / "data" / "training-models",
        voice_generators_root=shipped,
        local_voice_generators_root=local,
        vibevoice_root=repo,
        vibevoice_runtime_root=tmp_path / "runtime" / "vibevoice",
        research_engines_root=tmp_path / "research",
        cosyvoice_root=tmp_path / "research" / "CosyVoice",
        cosyvoice_runtime_root=tmp_path / "runtime" / "cosyvoice",
        voice_changer_runtime_root=tmp_path / "runtime" / "voice-changer",
        applio_root=tmp_path / "research" / "Applio",
        rvc_runtime_root=tmp_path / "runtime" / "rvc",
        stt_engines_root=tmp_path / "stt-engines",
        model_hub_cache=tmp_path / "cache" / "huggingface",
        training_runtime_root=tmp_path / "training" / ".venv",
        training_wheel_cache=tmp_path / "wheels",
    )

    with TestClient(create_app(settings=settings)) as client:
        synchronous = client.get("/api/voice-generators")
        background = client.get("/api/voice-generators?background=true")

    assert synchronous.status_code == 200
    sync_option = next(item for item in synchronous.json() if item["id"] == "fixture-generator")
    assert not sync_option["status"].startswith(READINESS_PENDING_PREFIX)
    assert sync_option["available"] is False

    assert background.status_code == 200
    background_option = next(item for item in background.json() if item["id"] == "fixture-generator")
    assert background_option["status"].startswith(READINESS_PENDING_PREFIX)
    assert background_option["available"] is False
    assert background_option["blockedReason"] == "Preserved descriptor text."
