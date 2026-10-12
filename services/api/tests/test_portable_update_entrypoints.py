from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows portable launchers")


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def invoke_bat(path: Path, *args: str) -> str:
    result = subprocess.run(
        f'"{path}" {" ".join(args)} -NoRestart',
        shell=True,
        input="\n",
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=20,
    )
    return result.stdout + result.stderr


def make_bundle(tmp_path: Path) -> Path:
    bundle = tmp_path / "Remote Machine" / "Portable With Spaces"
    write_json(bundle / ".portable-bundle.json", {
        "schemaVersion": 1, "profile": "NoVibeVoice",
        "releaseVersion": "0.5.0", "releaseChannel": "alpha",
    })
    (bundle / "scripts").mkdir()
    shutil.copy2(ROOT / "scripts/update-portable.ps1", bundle / "scripts")
    shutil.copy2(ROOT / "UPDATE-PORTABLE.bat", bundle)
    return bundle


def make_pack(bundle: Path, name: str, version: str, profile: str = "NoVibeVoice") -> Path:
    pack = bundle / "updates" / name
    write_json(pack / "app-update.json", {
        "schemaVersion": 1, "kind": "Pro4BroAppUpdate", "profile": profile,
        "releaseVersion": version, "releaseChannel": "alpha", "entries": [],
    })
    (pack / "payload/scripts").mkdir(parents=True)
    shutil.copy2(ROOT / "scripts/update-portable.ps1", pack / "payload/scripts")
    shutil.copy2(ROOT / "UPDATE-PORTABLE.bat", pack / "payload")
    return pack


def test_payload_bat_resolves_bundle_and_selects_newest(tmp_path: Path) -> None:
    bundle = make_bundle(tmp_path)
    clicked = make_pack(bundle, "old folder", "0.5.1")
    make_pack(bundle, "new folder", "0.5.2")
    output = invoke_bat(clicked / "payload/UPDATE-PORTABLE.bat")
    assert "Selected update: alpha 0.5.2" in output, output
    assert "Not a portable bundle" not in output, output
    assert json.loads((bundle / ".portable-bundle.json").read_text())["releaseVersion"] == "0.5.0"


def test_root_bat_uses_numeric_version_and_matching_profile(tmp_path: Path) -> None:
    bundle = make_bundle(tmp_path)
    installed = json.loads((bundle / ".portable-bundle.json").read_text())
    installed["sourceMachine"] = os.environ["COMPUTERNAME"]
    write_json(bundle / ".portable-bundle.json", installed)
    make_pack(bundle, "z-last-name", "0.5.9")
    make_pack(bundle, "a-first-name", "0.5.10")
    make_pack(bundle, "wrong-profile", "9.9.9", "All")
    # This marker proves that a copied newer pack wins over an ancestor source.
    source = bundle.parent
    (source / "scripts").mkdir()
    (source / "scripts/new-portable-app-update.ps1").write_text("throw 'WrongSourceUsed'", encoding="utf-8")
    write_json(source / "apps/web/package.json", {})
    output = invoke_bat(bundle / "UPDATE-PORTABLE.bat")
    assert "Selected update: alpha 0.5.10" in output, output
    assert "WrongSourceUsed" not in output, output


def test_root_bat_on_source_machine_creates_next_numbered_pack(tmp_path: Path) -> None:
    bundle = make_bundle(tmp_path)
    installed = json.loads((bundle / ".portable-bundle.json").read_text())
    installed["sourceMachine"] = os.environ["COMPUTERNAME"]
    write_json(bundle / ".portable-bundle.json", installed)
    make_pack(bundle, "old-pack", "0.5.0")
    source = bundle.parent
    (source / "scripts").mkdir()
    (source / "scripts/new-portable-app-update.ps1").write_text(
        "param($UpdatesRoot, $MinimumVersion, $Profile)\n"
        "$pack = Join-Path $UpdatesRoot 'App-alpha-0.5.1-NoVibeVoice'\n"
        "[IO.Directory]::CreateDirectory($pack) | Out-Null\n"
        "@{schemaVersion=1;kind='Pro4BroAppUpdate';profile=$Profile;releaseVersion='0.5.1';releaseChannel='alpha';entries=@()} | ConvertTo-Json | Set-Content (Join-Path $pack 'app-update.json')\n"
        "Set-Content (Join-Path $pack 'created-for-version.txt') $MinimumVersion\n",
        encoding="utf-8",
    )
    write_json(source / "apps/web/package.json", {})
    output = invoke_bat(bundle / "UPDATE-PORTABLE.bat")
    assert "Selected update: alpha 0.5.1" in output, output
    assert (bundle / "updates/App-alpha-0.5.1-NoVibeVoice/created-for-version.txt").read_text().strip() == "0.5.0"


def test_same_version_on_another_machine_does_not_generate_from_source(tmp_path: Path) -> None:
    bundle = make_bundle(tmp_path)
    installed = json.loads((bundle / ".portable-bundle.json").read_text())
    installed["sourceMachine"] = "A-DIFFERENT-SOURCE-MACHINE"
    write_json(bundle / ".portable-bundle.json", installed)
    make_pack(bundle, "copied-pack", "0.5.0")
    source = bundle.parent
    (source / "scripts").mkdir()
    (source / "scripts/new-portable-app-update.ps1").write_text("throw 'WrongSourceUsed'", encoding="utf-8")
    write_json(source / "apps/web/package.json", {})
    output = invoke_bat(bundle / "UPDATE-PORTABLE.bat")
    assert "Selected update: alpha 0.5.0" in output, output
    assert "WrongSourceUsed" not in output, output


def test_pack_launcher_uses_shipped_updater_for_old_portable(tmp_path: Path) -> None:
    bundle = make_bundle(tmp_path)
    (bundle / "scripts/update-portable.ps1").write_text("throw 'OldUpdaterUsed'", encoding="utf-8")
    pack = make_pack(bundle, "App-alpha-0.5.1-NoVibeVoice", "0.5.1")
    shutil.copy2(ROOT / "scripts/templates/APPLY-UPDATE.bat", pack)
    output = invoke_bat(pack / "APPLY-UPDATE.bat")
    assert "Selected update: alpha 0.5.1" in output, output
    assert "OldUpdaterUsed" not in output, output


def test_pack_alone_explains_where_full_portable_is_required(tmp_path: Path) -> None:
    pack = make_pack(tmp_path, "App-alpha-0.5.1-NoVibeVoice", "0.5.1")
    output = invoke_bat(pack / "payload/UPDATE-PORTABLE.bat")
    assert "Copy the complete portable folder first" in output, output
    assert "updates" in output, output


def make_source(tmp_path: Path) -> Path:
    source = tmp_path / "Source With Spaces"
    source.mkdir()
    write_json(source / "APP-VERSION.json", {"schemaVersion": 1, "channel": "alpha", "version": "0.5.0"})
    script_names = ["pro4bro-console.ps1", "pro4bro-process-tree.ps1", "pro4bro-readiness.ps1", "pro4bro-workloads.ps1", "install-obs-plugin.ps1", "update-portable.ps1"]
    (source / "scripts/templates").mkdir(parents=True)
    for name in script_names:
        (source / "scripts" / name).write_text("# fixture app file", encoding="utf-8")
    # Only the generator's unrelated OBS gate is stubbed; version allocation,
    # file copying, hashing, publication and Git-root checks use the real script.
    (source / "scripts/test-portable-runtime.ps1").write_text("'{\"portable\":true,\"failed\":0}'", encoding="utf-8")
    shutil.copy2(ROOT / "scripts/new-portable-app-update.ps1", source / "scripts")
    shutil.copy2(ROOT / "scripts/templates/APPLY-UPDATE.bat", source / "scripts/templates")
    paths = [
        "services/api/requirements.txt", "apps/web/dist/index.html",
        "services/stt_studio/studio_app/main.py", "build/obs-plugin-package/manifest.json",
        "plugins/obs-pro4bro-bridge/config.example.json", "docs/PORTABLE-NO-VIBEVOICE.md",
        "plugins/obs-pro4bro-bridge/src/bridge.cpp",
        "build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll",
    ]
    for relative in paths:
        path = source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture app file", encoding="utf-8")
    write_json(source / ".runtime/python/runtime-manifest.json", {})
    for name in ["start-pro4bro.bat", "open-pro4bro-console.bat", "restart-pro4bro.bat", "VERIFY-PORTABLE.bat", "INSTALL-OBS-PLUGIN.bat", "UPDATE-PORTABLE.bat"]:
        (source / name).write_text("@echo off", encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(source)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(source), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(source), "-c", "user.name=Portable Test", "-c", "user.email=portable-test@example.invalid", "commit", "-qm", "fixture"], check=True, capture_output=True)
    return source


def create_pack(source: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    # Match the Windows PowerShell module path set by MAKE-PORTABLE-UPDATE.bat.
    env["PSModulePath"] = ";".join([
        str(Path(env["WINDIR"]) / "System32/WindowsPowerShell/v1.0/Modules"),
        str(Path(env["PROGRAMFILES"]) / "WindowsPowerShell/Modules"),
        str(Path(env["USERPROFILE"]) / "Documents/WindowsPowerShell/Modules"),
    ])
    return subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(source / "scripts/new-portable-app-update.ps1"), "-SkipWebBuild"],
        capture_output=True, encoding="utf-8", errors="replace", timeout=20, env=env,
    )


def test_creation_increments_versions_and_names_folders_automatically(tmp_path: Path) -> None:
    source = make_source(tmp_path)
    for expected in ["0.5.1", "0.5.2"]:
        result = create_pack(source)
        assert result.returncode == 0, result.stdout + result.stderr
        created = json.loads(result.stdout)
        assert created["release"] == f"alpha {expected}"
        pack = Path(created["path"])
        assert pack.name == f"App-alpha-{expected}-NoVibeVoice"
        assert (pack / "APPLY-UPDATE.bat").exists()
        assert json.loads((pack / "app-update.json").read_text(encoding="utf-8-sig"))["releaseVersion"] == expected
    state = json.loads((source / "APP-VERSION.json").read_text(encoding="utf-8-sig"))
    assert state["version"] == state["lastIssuedVersion"] == "0.5.2"


def test_failed_creation_keeps_counter_and_publishes_no_pack(tmp_path: Path) -> None:
    source = make_source(tmp_path)
    (source / "start-pro4bro.bat").unlink()
    result = create_pack(source)
    assert result.returncode != 0
    state = json.loads((source / "APP-VERSION.json").read_text(encoding="utf-8-sig"))
    assert state["version"] == "0.5.0"
    updates = source / ".scratch/portable-updates"
    assert not list(updates.glob("*/app-update.json"))
    assert not list(updates.glob(".creating-*"))


def test_new_phase_and_stable_baseline_are_issued_before_patch_increment(tmp_path: Path) -> None:
    source = make_source(tmp_path)
    first = create_pack(source)
    assert first.returncode == 0, first.stderr
    version_path = source / "APP-VERSION.json"
    state = json.loads(version_path.read_text(encoding="utf-8-sig"))
    state["version"] = "0.6.0"
    write_json(version_path, state)
    phase = create_pack(source)
    assert phase.returncode == 0, phase.stderr
    assert json.loads(phase.stdout)["release"] == "alpha 0.6.0"
    patch = create_pack(source)
    assert patch.returncode == 0, patch.stderr
    assert json.loads(patch.stdout)["release"] == "alpha 0.6.1"
    state = json.loads(version_path.read_text(encoding="utf-8-sig"))
    state.update(version="1.0.0", channel="stable")
    write_json(version_path, state)
    stable = create_pack(source)
    assert stable.returncode == 0, stable.stderr
    assert json.loads(stable.stdout)["release"] == "stable 1.0.0"
