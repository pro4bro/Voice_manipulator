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
