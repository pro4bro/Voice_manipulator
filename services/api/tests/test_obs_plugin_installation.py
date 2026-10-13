import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from app.adapters.obs_plugin_installation import ObsPluginInstallation, ObsPluginInstallError


def installation(tmp_path: Path, *, running=lambda: False) -> tuple[ObsPluginInstallation, Path]:
    app = tmp_path / "app"
    package = app / "obs-plugin-package"
    files = [
        ("bin/64bit/pro4bro-obs-bridge.dll", "bin/64bit/pro4bro-obs-bridge.dll", "obs-plugins/64bit/pro4bro-obs-bridge.dll", b"plugin-v1"),
        ("data/locale/en-US.ini", "data/locale/en-US.ini", "data/obs-plugins/pro4bro-obs-bridge/locale/en-US.ini", b"locale"),
        ("data/brand/pro4bro-livelink.svg", "data/brand/pro4bro-livelink.svg", "data/obs-plugins/pro4bro-obs-bridge/brand/pro4bro-livelink.svg", b"<svg>brand</svg>"),
    ]
    entries = []
    for source, standard, portable, content in files:
        target = package / source
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        entries.append({"source": source, "standard": standard, "portable": portable, "sha256": hashlib.sha256(content).hexdigest()})
    (package / "manifest.json").write_text(json.dumps({"schemaVersion": 1, "pluginId": "pro4bro-obs-bridge", "pluginVersion": "0.1.0", "obsBuildVersion": "32.2.2", "architecture": "x64", "files": entries}), encoding="utf-8")
    obs = tmp_path / "program-files" / "obs-studio"
    exe = obs / "bin" / "64bit" / "obs64.exe"
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"obs")
    manager = ObsPluginInstallation(app, tmp_path / "data", program_files=tmp_path / "program-files", program_data=tmp_path / "program-data", app_data=tmp_path / "app-data", running=running)
    return manager, obs


def test_standard_install_repair_remove_preserves_pairing(tmp_path: Path) -> None:
    manager, obs = installation(tmp_path)
    assert manager.status()["state"] == "not-installed"
    assert manager.apply("install")["state"] == "installed"
    token = json.loads(manager.user_config.read_text())["token"]
    target = manager.program_data / "obs-studio/plugins/pro4bro-obs-bridge/bin/64bit/pro4bro-obs-bridge.dll"
    assert target.read_bytes() == b"plugin-v1"
    assert (manager.program_data / "obs-studio/plugins/pro4bro-obs-bridge/data/locale/en-US.ini").read_bytes() == b"locale"
    brand = manager.program_data / "obs-studio/plugins/pro4bro-obs-bridge/data/brand/pro4bro-livelink.svg"
    assert brand.read_bytes() == b"<svg>brand</svg>"
    target.write_bytes(b"tampered")
    assert manager.status()["state"] == "damaged"
    assert manager.apply("repair")["state"] == "installed"
    assert brand.read_bytes() == b"<svg>brand</svg>"
    assert json.loads(manager.user_config.read_text())["token"] == token
    assert manager.reset_pairing()["pairingReady"] is True
    assert json.loads(manager.user_config.read_text())["token"] != token
    assert manager.apply("remove")["state"] == "not-installed"
    assert not target.exists()
    assert manager.user_config.exists()
    assert manager.apply("remove", remove_pairing=True)["pairingReady"] is False


def test_portable_root_must_be_real_obs_portable(tmp_path: Path) -> None:
    manager, _ = installation(tmp_path)
    fake = tmp_path / "fake"
    (fake / "bin/64bit").mkdir(parents=True)
    (fake / "bin/64bit/obs64.exe").write_bytes(b"obs")
    with pytest.raises(ObsPluginInstallError, match="portable mode"):
        manager.apply("install", str(fake))
    (fake / "portable_mode.txt").write_text("")
    (fake / "obs-plugins").mkdir()
    (fake / "data").mkdir()
    assert manager.apply("install", str(fake))["layout"] == "portable"
    assert (fake / "obs-plugins/64bit/pro4bro-obs-bridge.dll").read_bytes() == b"plugin-v1"
    assert (fake / "data/obs-plugins/pro4bro-obs-bridge/locale/en-US.ini").read_bytes() == b"locale"
    assert (fake / "data/obs-plugins/pro4bro-obs-bridge/brand/pro4bro-livelink.svg").read_bytes() == b"<svg>brand</svg>"


def test_tampered_package_fails_before_writing(tmp_path: Path) -> None:
    manager, _ = installation(tmp_path)
    (manager.package / "bin/64bit/pro4bro-obs-bridge.dll").write_bytes(b"different")
    assert manager.status()["state"] == "package-unavailable"
    with pytest.raises(ObsPluginInstallError, match="package"):
        manager.apply("install")
    assert not (manager.program_data / "obs-studio/plugins/pro4bro-obs-bridge").exists()


def test_running_obs_only_allows_fresh_install(tmp_path: Path) -> None:
    active = True
    manager, _ = installation(tmp_path, running=lambda: active)
    first = manager.apply("install")
    assert first["state"] == "installed"
    assert first["restartObsRequired"] is True
    with pytest.raises(ObsPluginInstallError, match="Đóng OBS"):
        manager.apply("repair")
    with pytest.raises(ObsPluginInstallError, match="Đóng OBS"):
        manager.apply("remove")
    active = False
    assert manager.status()["restartObsRequired"] is False


def test_matching_previous_hash_is_update_available(tmp_path: Path) -> None:
    manager, _ = installation(tmp_path)
    manager.apply("install")
    new_content = b"plugin-v2"
    (manager.package / "bin/64bit/pro4bro-obs-bridge.dll").write_bytes(new_content)
    manifest_path = manager.package / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"][0]["sha256"] = hashlib.sha256(new_content).hexdigest()
    manifest["pluginVersion"] = "0.2.0"
    manifest_path.write_text(json.dumps(manifest))
    assert manager.status()["state"] == "update-available"
    assert manager.apply("install")["state"] == "installed"


def test_new_brand_asset_is_update_from_older_two_file_install(tmp_path: Path) -> None:
    manager, _ = installation(tmp_path)
    assert manager.apply("install")["state"] == "installed"
    brand_source = "data/brand/pro4bro-livelink.svg"
    installed_brand = manager.program_data / "obs-studio/plugins/pro4bro-obs-bridge" / brand_source
    installed_brand.unlink()
    record = installed_brand.parents[2] / "install-manifest.json"
    previous = json.loads(record.read_text())
    previous["hashes"].pop(brand_source)
    record.write_text(json.dumps(previous))
    assert manager.status()["state"] == "update-available"
    assert manager.apply("install")["state"] == "installed"
    installed_brand.unlink()
    assert manager.status()["state"] == "damaged"


def test_installation_api_status_and_action(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from dataclasses import replace
    from fastapi.testclient import TestClient
    import app.main as main
    from app.settings import Settings

    manager, _ = installation(tmp_path)
    monkeypatch.setattr(main, "ObsPluginInstallation", lambda _app_root, _data_root: manager)
    settings = replace(Settings.from_env(), data_root=tmp_path / "api-data")
    client = TestClient(main.create_app(settings=settings))
    assert client.get("/api/obs-plugin/installation").json()["state"] == "not-installed"
    response = client.post("/api/obs-plugin/installation", json={"action": "install"})
    assert response.status_code == 200
    assert response.json()["state"] == "installed"
    assert "token" not in response.text


def test_failed_second_write_rolls_back(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manager, _ = installation(tmp_path)
    original = manager._atomic_write
    calls = 0

    def fail_second(target: Path, content: bytes) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("disk failure")
        original(target, content)

    monkeypatch.setattr(manager, "_atomic_write", fail_second)
    with pytest.raises(OSError, match="disk failure"):
        manager.apply("install")
    assert manager.status()["state"] == "not-installed"


def test_cli_uses_same_portable_installer(tmp_path: Path) -> None:
    manager, _ = installation(tmp_path)
    portable = tmp_path / "portable-obs"
    (portable / "bin/64bit").mkdir(parents=True)
    (portable / "bin/64bit/obs64.exe").write_bytes(b"obs")
    (portable / "portable_mode.txt").write_text("")
    (portable / "obs-plugins").mkdir()
    (portable / "data").mkdir()
    env = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1]), "APPDATA": str(tmp_path / "cli-appdata")}
    result = subprocess.run([
        sys.executable, "-m", "app.adapters.obs_plugin_installation", "--cli",
        str(manager.app_root), str(manager.data_root), "install", str(portable), "false",
    ], env=env, capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)["state"] == "installed"
    assert (portable / "obs-plugins/64bit/pro4bro-obs-bridge.dll").read_bytes() == b"plugin-v1"


def test_cli_rejects_malformed_argument_count(tmp_path: Path) -> None:
    manager, _ = installation(tmp_path)
    env = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
    result = subprocess.run(
        [
            sys.executable, "-m", "app.adapters.obs_plugin_installation", "--cli",
            str(manager.app_root), str(manager.data_root), "install", "not-a-boolean",
        ],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 2
    assert "Usage:" in result.stderr


def _stage_native_installer(tmp_path: Path) -> tuple[ObsPluginInstallation, Path, dict[str, str]]:
    manager, _ = installation(tmp_path)
    project_root = Path(__file__).resolve().parents[3]
    (manager.app_root / "services/api/app/adapters").mkdir(parents=True)
    shutil.copy2(
        project_root / "services/api/app/adapters/obs_plugin_installation.py",
        manager.app_root / "services/api/app/adapters/obs_plugin_installation.py",
    )
    scripts = manager.app_root / "scripts"
    scripts.mkdir()
    shutil.copy2(project_root / "scripts/install-obs-plugin.ps1", scripts)
    shutil.copy2(project_root / "INSTALL-OBS-PLUGIN.bat", manager.app_root)
    # A junction gives the fixture the repository interpreter without copying its runtime.
    junction = subprocess.run(
        [
            "powershell.exe", "-NoProfile", "-Command",
            f"New-Item -ItemType Junction -Path '{manager.app_root / '.venv'}' -Target '{project_root / '.venv'}' | Out-Null",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if junction.returncode:
        pytest.skip(f"could not create runtime junction: {junction.stderr}")
    env = {
        **os.environ,
        "ProgramFiles": str(manager.program_files),
        "ProgramData": str(manager.program_data),
        "APPDATA": str(manager.app_data),
    }
    return manager, scripts / "install-obs-plugin.ps1", env


def test_native_powershell_default_root_reports_actionable_failure(tmp_path: Path) -> None:
    powershell = shutil.which("powershell.exe")
    if not powershell:
        pytest.skip("native Windows PowerShell is required")
    manager, script, env = _stage_native_installer(tmp_path)
    # Missing package guarantees this real entrypoint cannot write into a user's OBS installation.
    (manager.package / "manifest.json").unlink()

    result = subprocess.run(
        [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    assert result.returncode != 0
    assert "OBS plugin install failed:" in result.stdout + result.stderr
    assert not manager.program_data.exists()


def test_native_bat_forwards_obs_root_with_spaces(tmp_path: Path) -> None:
    powershell = shutil.which("powershell.exe")
    command = shutil.which("cmd.exe")
    if not powershell or not command:
        pytest.skip("native Windows command processors are required")
    manager, _, env = _stage_native_installer(tmp_path)
    portable = tmp_path / "OBS Portable With Spaces"
    (portable / "bin/64bit").mkdir(parents=True)
    (portable / "bin/64bit/obs64.exe").write_bytes(b"fake OBS executable")
    (portable / "portable_mode.txt").write_text("", encoding="utf-8")
    (portable / "obs-plugins").mkdir()
    (portable / "data").mkdir()
    bat = manager.app_root / "INSTALL-OBS-PLUGIN.bat"
    runner = manager.app_root / "run-installer.cmd"
    cmdline = f'@call "{bat}" -Action install -ObsRoot "{portable}"\r\n'
    runner.write_text(cmdline, encoding="cp850")
    env["PYTHONIOENCODING"] = "ascii"

    result = subprocess.run(
        [command, "/d", "/c", "run-installer.cmd"],
        cwd=manager.app_root,
        env=env,
        input="\r\n",
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, f"{cmdline}\n{result.stdout}{result.stderr}"
    assert (portable / "obs-plugins/64bit/pro4bro-obs-bridge.dll").read_bytes() == b"plugin-v1"
    assert not (manager.program_data / "obs-studio/plugins/pro4bro-obs-bridge").exists()
    status_line = next(line for line in result.stdout.splitlines() if line.startswith("{"))
    assert json.loads(status_line)["obsRoot"] == str(portable)


def test_native_powershell_installer_emits_unicode_status_with_ascii_pythonioencoding(tmp_path: Path) -> None:
    powershell = shutil.which("powershell.exe")
    if not powershell:
        pytest.skip("native Windows PowerShell is required")
    manager, script, env = _stage_native_installer(tmp_path)
    portable = tmp_path / "OBS café Portable"
    (portable / "bin/64bit").mkdir(parents=True)
    (portable / "bin/64bit/obs64.exe").write_bytes(b"fake OBS executable")
    (portable / "portable_mode.txt").write_text("", encoding="utf-8")
    (portable / "obs-plugins").mkdir()
    (portable / "data").mkdir()
    env["PYTHONIOENCODING"] = "ascii"

    result = subprocess.run(
        [
            powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script),
            "-ObsRoot", str(portable),
        ],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    status = json.loads(result.stdout)
    assert status["obsRoot"] == str(portable)
    assert status["state"] == "installed"
    assert (portable / "obs-plugins/64bit/pro4bro-obs-bridge.dll").read_bytes() == b"plugin-v1"
