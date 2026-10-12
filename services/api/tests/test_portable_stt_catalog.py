from dataclasses import replace
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


@pytest.mark.parametrize("layout", ["source", "portable", "both", "missing"])
def test_stt_api_uses_the_service_location_in_the_application(tmp_path, layout):
    # A portable ships the sidecar beside its models, without services/stt_studio.
    # Exercise the production API: testing only the descriptor misses its roots.
    root = tmp_path / "ổ D" / "Portable"
    source = root / "services" / "stt_studio"
    bundled = root / ".runtime" / "omnivoice-studio"
    for folder, present in ((source, layout in {"source", "both"}),
                            (bundled, layout in {"portable", "both"})):
        if present:
            entry = folder / "studio_app" / "server.py"
            entry.parent.mkdir(parents=True, exist_ok=True)
            entry.write_text("# Sidecar entrypoint", encoding="utf-8")
    settings = replace(Settings.from_env(), project_root=root, data_root=tmp_path / "data")
    client = TestClient(create_app(settings=settings))

    response = client.get("/api/stt-engines")
    assert response.status_code == 200
    whisper = next(option for option in response.json() if option["id"] == "faster-whisper")
    assert whisper["installed"] is (layout != "missing")
    assert whisper["available"] is (layout != "missing")
    if layout == "both":
        # Match the launcher, which runs the synchronized/bundled sidecar.
        assert settings.stt_studio_root == bundled
    if layout == "missing":
        assert "server.py" in whisper["status"]


def test_stt_api_stays_available_after_moving_the_portable(tmp_path):
    original = tmp_path / "old-drive" / "Portable"
    entry = original / ".runtime" / "omnivoice-studio" / "studio_app" / "server.py"
    entry.parent.mkdir(parents=True)
    entry.write_text("# Sidecar entrypoint", encoding="utf-8")
    moved = tmp_path / "máy khác" / "Portable"
    moved.parent.mkdir()
    original.rename(moved)
    settings = replace(Settings.from_env(), project_root=moved, data_root=tmp_path / "data")

    response = TestClient(create_app(settings=settings)).get("/api/stt-engines")
    whisper = next(option for option in response.json() if option["id"] == "faster-whisper")
    assert whisper["available"], whisper["status"]
