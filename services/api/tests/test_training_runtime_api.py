from __future__ import annotations

from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


def test_training_runtime_endpoint_reports_missing_packages_without_installing(tmp_path):
    settings = replace(
        Settings.from_env(),
        data_root=tmp_path / "data",
        training_runtime_root=tmp_path / "training" / ".venv",
        training_wheel_cache=tmp_path / "wheels",
        omnivoice_root=tmp_path / "engine",
    )

    with TestClient(create_app(settings=settings)) as client:
        response = client.get("/api/training-runtime")

    assert response.status_code == 200
    report = response.json()
    assert report["ready"] is False
    assert report["exists"] is False
    assert {package["name"] for package in report["packages"]} >= {
        "omnivoice",
        "accelerate",
        "peft",
        "webdataset",
    }
    assert not (tmp_path / "training").exists()


def test_start_training_returns_a_clear_conflict_until_runtime_is_ready(tmp_path):
    settings = replace(
        Settings.from_env(),
        data_root=tmp_path / "data",
        training_runtime_root=tmp_path / "training" / ".venv",
        training_wheel_cache=tmp_path / "wheels",
        omnivoice_root=tmp_path / "engine",
    )

    with TestClient(create_app(settings=settings)) as client:
        response = client.post(
            "/api/projects/missing/training-runs",
            json={"manifestId": "dataset-1"},
        )

    assert response.status_code == 409
    assert "training runtime" in response.json()["detail"].lower()


def test_training_models_lists_every_descriptor_with_its_own_parameters(tmp_path):
    settings = replace(
        Settings.from_env(),
        data_root=tmp_path / "data",
        training_runtime_root=tmp_path / "training" / ".venv",
        training_wheel_cache=tmp_path / "wheels",
        omnivoice_root=tmp_path / "engine",
        vibevoice_root=tmp_path / "vibevoice",
        research_engines_root=tmp_path / "research",
        applio_root=tmp_path / "research" / "Applio",
        local_training_models_root=tmp_path / "data" / "training-models",
    )

    with TestClient(create_app(settings=settings)) as client:
        response = client.get("/api/training-models")

    assert response.status_code == 200
    options = {item["id"]: item for item in response.json()}
    assert {"omnivoice-lora", "vibevoice-1.5b-tts-lora", "vibevoice-asr-lora"} <= set(options)
    assert not any(option["available"] for option in options.values())
    omni = {spec["key"] for spec in options["omnivoice-lora"]["parameters"]}
    vibe = {spec["key"] for spec in options["vibevoice-1.5b-tts-lora"]["parameters"]}
    assert "batch_tokens" in omni and "batch_tokens" not in vibe
    assert "ddpm_batch_mul" in vibe and "ddpm_batch_mul" not in omni


def test_starting_a_model_that_cannot_run_here_is_a_conflict(tmp_path):
    settings = replace(
        Settings.from_env(),
        data_root=tmp_path / "data",
        training_runtime_root=tmp_path / "training" / ".venv",
        training_wheel_cache=tmp_path / "wheels",
        omnivoice_root=tmp_path / "engine",
        vibevoice_root=tmp_path / "vibevoice",
        local_training_models_root=tmp_path / "data" / "training-models",
    )

    with TestClient(create_app(settings=settings)) as client:
        response = client.post(
            "/api/projects/missing/training-runs",
            json={"manifestId": "dataset-1", "config": {"modelId": "vibevoice-asr-lora"}},
        )

    assert response.status_code == 409
    assert "VibeVoice ASR" in response.json()["detail"]


def test_voice_generators_are_listed_from_their_own_descriptors(tmp_path):
    settings = replace(
        Settings.from_env(),
        data_root=tmp_path / "data",
        training_runtime_root=tmp_path / "training" / ".venv",
        training_wheel_cache=tmp_path / "wheels",
        local_voice_generators_root=tmp_path / "data" / "voice-generators",
    )

    with TestClient(create_app(settings=settings)) as client:
        generators = client.get("/api/voice-generators").json()
        models = {item["id"]: item for item in client.get("/api/training-models").json()}

    assert "omnivoice-generate" in {item["id"] for item in generators}
    assert models["omnivoice-zero-shot-clone"]["mode"] == "zero-shot-clone"

