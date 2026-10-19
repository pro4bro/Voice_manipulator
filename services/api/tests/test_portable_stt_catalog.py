from dataclasses import replace
import os
import re
import subprocess
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


def test_whisper_choices_reflect_each_installed_weight_snapshot(tmp_path):
    root = tmp_path / "portable"
    entry = root / ".runtime" / "omnivoice-studio" / "studio_app" / "server.py"
    entry.parent.mkdir(parents=True)
    entry.write_text("# sidecar", encoding="utf-8")
    snapshot = root / ".runtime" / "omnivoice-studio" / "models" / "models--Systran--faster-whisper-medium" / "snapshots" / "revision"
    snapshot.mkdir(parents=True)
    (snapshot / "config.json").write_text("{}", encoding="utf-8")
    (snapshot / "model.bin").write_bytes(b"weights")
    settings = replace(Settings.from_env(), project_root=root, data_root=tmp_path / "data", vibevoice_root=tmp_path / "no-vibevoice")

    response = TestClient(create_app(settings=settings)).get("/api/stt-engines")
    whisper = next(option for option in response.json() if option["id"] == "faster-whisper")
    assert whisper["modelStatus"]["medium"] == "Sẵn sàng."
    assert "Chưa có weights" in whisper["modelStatus"]["large-v3"]


@pytest.mark.skipif(os.name != "nt", reason="Windows portable entrypoint")
def test_catalog_gate_probe_runs_in_windows_powershell(tmp_path):
    root = Settings.from_env().project_root
    python = root / ".runtime" / "python" / "core" / "python.exe"
    if not python.is_file():
        pytest.skip("Embedded core runtime is not prepared")
    script = (root / "scripts" / "test-portable-runtime.ps1").read_text(encoding="utf-8-sig")
    probe = re.search(r"\$catalogProbe = @'\r?\n(.*?)\r?\n'@", script, re.S)
    assert probe is not None
    entry = tmp_path / "catalog-probe.ps1"
    quoted_python = str(python).replace("'", "''")
    entry.write_text(
        "$ErrorActionPreference = 'Stop'\n"
        f"$corePython = '{quoted_python}'\n"
        "$catalogProbe = @'\n" + probe.group(1) + "\n'@\n"
        "& $corePython -c $catalogProbe 2>&1 | Out-String\nexit $LASTEXITCODE\n",
        encoding="utf-8-sig",
    )
    environment = dict(os.environ, PRO4BRO_DATA_ROOT=str(tmp_path / "data"))
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(entry)],
        capture_output=True, text=True, env=environment, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "exposes faster-whisper as available" in result.stdout
