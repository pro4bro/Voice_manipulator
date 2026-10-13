from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import socket
import time
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


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def make_apply_fixture(tmp_path: Path, *, fail_gate: bool = False) -> tuple[Path, Path, dict[str, bytes]]:
    bundle = tmp_path / "Installed Portable"
    legacy = {
        "start-pro4bro.bat": b"old app launcher start\r\n",
        "restart-pro4bro.bat": b"old app launcher restart\r\n",
    }
    old_entries = []
    for name, content in legacy.items():
        write_bytes(bundle / name, content)
        old_entries.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest().upper()})
    (bundle / "scripts").mkdir(parents=True)
    write_bytes(bundle / ".runtime/python/runtime-manifest.json", b"runtime-manifest\n")
    write_bytes(bundle / "services/api/requirements.txt", b"requirements\n")
    write_json(bundle / ".portable-bundle.json", {
        "schemaVersion": 1, "profile": "NoVibeVoice", "releaseVersion": "0.5.0",
        "releaseChannel": "alpha", "files": 20, "bytes": 2048,
        "sourceRevision": "old", "sourceWorkingTreeDirty": False,
        "components": [], "criticalFiles": [
            {"path": "start-pro4bro.bat", "sha256": old_entries[0]["sha256"]},
        ],
    })
    write_json(bundle / ".portable-app-layer.json", {
        "schemaVersion": 1, "kind": "app", "releaseVersion": "0.5.0",
        "releaseChannel": "alpha", "entries": old_entries,
    })
    write_json(bundle / ".portable-model-layer.json", {
        "schemaVersion": 1, "kind": "base-runtime-and-models", "profile": "NoVibeVoice",
        "components": [], "createdAt": "2026-01-01T00:00:00Z",
    })
    shutil.copy2(ROOT / "scripts/update-portable.ps1", bundle / "scripts/update-portable.ps1")
    shutil.copy2(ROOT / "UPDATE-PORTABLE.bat", bundle / "UPDATE-PORTABLE.bat")
    # A similarly named but unowned root BAT is user data and must survive.
    write_bytes(bundle / "user-notes.txt", b"keep me\r\n")

    package = bundle / "updates/App-alpha-0.5.1-NoVibeVoice"
    payload = package / "payload"
    entries: list[dict] = []
    update_files: list[str] = []

    def add(relative: str, content: bytes) -> None:
        path = payload / Path(relative)
        write_bytes(path, content)
        entries.append({
            "path": relative, "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest().upper(),
        })
        update_files.append(relative)

    tree_files = {
        "services/api": ("requirements.txt", b"requirements\n"),
        "apps/web/dist": ("index.html", b"<html>new</html>"),
        ".runtime/omnivoice-studio/studio_app": ("main.py", b"# studio"),
        "obs-plugin-package": ("manifest.json", b"{}"),
        "scripts": ("pro4bro-console.ps1", b"# console"),
    }
    for tree, (name, content) in tree_files.items():
        add(f"{tree}/{name}", content)
    for name in [
        "pro4bro-process-tree.ps1", "pro4bro-readiness.ps1", "pro4bro-workloads.ps1",
        "test-portable-runtime.ps1", "install-obs-plugin.ps1", "update-portable.ps1",
    ]:
        if name == "test-portable-runtime.ps1":
            report = '{"portable":true,"passed":1,"failed":0}'
            if fail_gate:
                report = '{"portable":false,"passed":0,"failed":1}'
            content = f"'{report}'\n".encode()
        elif name == "pro4bro-workloads.ps1":
            content = "param($Action, [switch]$SkipWebBuild)\n'{\"overall\":\"stopped\"}'\n".encode()
        else:
            content = f"# {name}\n".encode()
        add(f"scripts/{name}", content)
    app_files = [
        "build/obs-plugin/RelWithDebInfo/pro4bro-obs-bridge.dll",
        "plugins/obs-pro4bro-bridge/config.example.json",
        "start-pro4bro.bat", "restart-pro4bro.bat",
        "open-pro4bro-console.bat", "VERIFY-PORTABLE.bat", "INSTALL-OBS-PLUGIN.bat",
        "UPDATE-PORTABLE.bat", "PORTABLE-README.md",
    ]
    for name in app_files:
        add(name, ("new " + name).encode())
    manifest = {
        "schemaVersion": 1, "kind": "Pro4BroAppUpdate", "profile": "NoVibeVoice",
        "releaseVersion": "0.5.1", "releaseChannel": "alpha",
        "runtimeManifestSha256": hashlib.sha256(b"runtime-manifest\n").hexdigest().upper(),
        "apiRequirementsSha256": hashlib.sha256(b"requirements\n").hexdigest().upper(),
        "trees": list(tree_files),
        "files": [f"scripts/{name}" for name in [
            "pro4bro-console.ps1", "pro4bro-process-tree.ps1", "pro4bro-readiness.ps1",
            "pro4bro-workloads.ps1", "test-portable-runtime.ps1", "install-obs-plugin.ps1",
            "update-portable.ps1",
        ]] + app_files,
        "entries": entries,
        "sourceRevision": "fixture", "sourceWorkingTreeDirty": False,
    }
    write_json(package / "app-update.json", manifest)
    return bundle, package, legacy


def apply_fixture(bundle: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PSModulePath"] = ";".join([
        str(Path(env["WINDIR"]) / "System32/WindowsPowerShell/v1.0/Modules"),
        str(Path(env["PROGRAMFILES"]) / "WindowsPowerShell/Modules"),
        str(Path(env["USERPROFILE"]) / "Documents/WindowsPowerShell/Modules"),
    ])
    return subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         str(bundle / "scripts/update-portable.ps1"), "-BundleRoot", str(bundle),
         "-ApplyOnly", "-NoRestart"],
        capture_output=True, encoding="utf-8", errors="replace", timeout=30, env=env,
    )


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
        update = json.loads((pack / "app-update.json").read_text(encoding="utf-8-sig"))
        assert update["releaseVersion"] == expected
        assert {Path(item).name for item in update["files"] if item.lower().endswith(".bat")} == {
            "open-pro4bro-console.bat", "VERIFY-PORTABLE.bat", "INSTALL-OBS-PLUGIN.bat", "UPDATE-PORTABLE.bat",
        }
        pack_readme = (pack / "README-UPDATE.txt").read_text(encoding="utf-8-sig")
        assert "alpha 0.5.5 or earlier" in pack_readme
        assert "alpha 0.5.7 or earlier" in pack_readme
        assert "stops the controller" in pack_readme
        assert "APPLY-UPDATE.bat" in pack_readme
        assert "new four-BAT inventory" in pack_readme
        assert "later updates" in pack_readme
        assert "Alpha 0.5.8 and newer" in pack_readme
    state = json.loads((source / "APP-VERSION.json").read_text(encoding="utf-8-sig"))
    assert state["version"] == state["lastIssuedVersion"] == "0.5.2"


def test_failed_creation_keeps_counter_and_publishes_no_pack(tmp_path: Path) -> None:
    source = make_source(tmp_path)
    (source / "open-pro4bro-console.bat").unlink()
    result = create_pack(source)
    assert result.returncode != 0
    state = json.loads((source / "APP-VERSION.json").read_text(encoding="utf-8-sig"))
    assert state["version"] == "0.5.0"
    updates = source / ".scratch/portable-updates"
    assert not list(updates.glob("*/app-update.json"))
    assert not list(updates.glob(".creating-*"))


def test_update_removes_only_verified_legacy_launchers(tmp_path: Path) -> None:
    bundle, _package, legacy = make_apply_fixture(tmp_path)
    result = apply_fixture(bundle)
    assert result.returncode == 0, result.stdout + result.stderr
    for name in legacy:
        assert not (bundle / name).exists()
    assert (bundle / "user-notes.txt").read_bytes() == b"keep me\r\n"
    critical_files = json.loads((bundle / ".portable-bundle.json").read_text(encoding="utf-8-sig"))["criticalFiles"]
    assert all(item["path"] != "start-pro4bro.bat" for item in critical_files)
    app_layer = json.loads((bundle / ".portable-app-layer.json").read_text(encoding="utf-8-sig"))
    assert all(item["path"] not in legacy for item in app_layer["entries"])


def test_update_restores_legacy_launchers_and_manifests_when_gate_fails(tmp_path: Path) -> None:
    bundle, _package, legacy = make_apply_fixture(tmp_path, fail_gate=True)
    old_bundle_manifest = (bundle / ".portable-bundle.json").read_bytes()
    old_app_layer = (bundle / ".portable-app-layer.json").read_bytes()
    result = apply_fixture(bundle)
    assert result.returncode != 0
    assert "Portable verification failed" in result.stdout + result.stderr
    for name, content in legacy.items():
        assert (bundle / name).read_bytes() == content
    assert (bundle / ".portable-bundle.json").read_bytes() == old_bundle_manifest
    assert (bundle / ".portable-app-layer.json").read_bytes() == old_app_layer


@pytest.mark.parametrize("full_stack,fail_gate,restart,foreign_controller", [
    (False, False, False, False),
    (True, False, False, False),
    (True, False, True, False),
    (True, True, True, False),
    (True, False, False, True),
])
def test_update_stops_controller_holding_api_directory(
    tmp_path: Path, full_stack: bool, fail_gate: bool, restart: bool, foreign_controller: bool,
) -> None:
    """A real Windows process CWD locks services/api even with workloads stopped."""
    bundle, package, legacy = make_apply_fixture(tmp_path, fail_gate=fail_gate)
    old_manifest = (bundle / ".portable-bundle.json").read_bytes()
    for name in [
        "pro4bro-console.ps1", "pro4bro-process-tree.ps1", "pro4bro-readiness.ps1",
        "pro4bro-workloads.ps1",
    ]:
        shutil.copy2(ROOT / "scripts" / name, bundle / "scripts" / name)
    modules = tmp_path / "controller-modules"
    write_bytes(modules / "app/__init__.py", b"")
    server = b"""
import json, os, socket, time
from pathlib import Path
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    listener.listen()
    ready = Path(os.environ['UPDATE_TEST_READY'])
    temporary = ready.with_suffix('.tmp')
    temporary.write_text(json.dumps({'port': listener.getsockname()[1], 'pid': os.getpid()}))
    temporary.replace(ready)
    while True:
        time.sleep(0.1)
"""
    write_bytes(modules / "app/runtime_controller.py", server)
    write_bytes(modules / "app/__main__.py", server)
    write_bytes(modules / "studio_app/__init__.py", b"")
    write_bytes(modules / "studio_app/server.py", server)
    env = os.environ.copy()
    env.update(PYTHONPATH=str(modules))
    env["PSModulePath"] = ";".join([
        str(Path(env["WINDIR"]) / "System32/WindowsPowerShell/v1.0/Modules"),
        str(Path(env["PROGRAMFILES"]) / "WindowsPowerShell/Modules"),
        str(Path(env["USERPROFILE"]) / "Documents/WindowsPowerShell/Modules"),
    ])
    processes: list[subprocess.Popen] = []
    try:
        roles = [(18119, "app.runtime_controller", bundle / "services/api")]
        if full_stack:
            roles += [(18120, "app", bundle / "services/api"),
                      (18081, "studio_app.server", bundle / ".runtime/omnivoice-studio")]
        listener_maps, identity_maps = [], []
        for standard_port, module, cwd in roles:
            cwd.mkdir(parents=True, exist_ok=True)
            ready = tmp_path / f"ready-{standard_port}.json"
            child_env = env | {"UPDATE_TEST_READY": str(ready)}
            process = subprocess.Popen(
                [sys.executable, "-m", module], cwd=cwd, env=child_env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            processes.append(process)
            deadline = time.monotonic() + 10
            while not ready.exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            assert ready.exists(), f"{module} fixture did not bind its isolated port"
            ready_state = json.loads(ready.read_text())
            with socket.create_connection(("127.0.0.1", ready_state["port"]), timeout=2):
                pass
            listener_maps.append({"standard": standard_port, "actual": ready_state["port"]})
            if not (foreign_controller and standard_port == 18119):
                identity_maps.extend({"pid": pid, "module": module} for pid in {process.pid, ready_state["pid"]})
        # Remap only this isolated process/port to the portable controller's
        # identity. Production stop functions and the actual CWD lock are real;
        # the source stack on the standard ports is never touched.
        def ps_quote(value: Path) -> str:
            return "'" + str(value).replace("'", "''") + "'"

        launch_marker = tmp_path / "reopened.txt"
        write_bytes(bundle / "open-pro4bro-console.bat", f'@echo off\r\necho restored>"{launch_marker}"\r\n'.encode())
        new_launcher = f'@echo off\r\necho updated>"{launch_marker}"\r\n'.encode()
        write_bytes(package / "payload/open-pro4bro-console.bat", new_launcher)
        manifest = json.loads((package / "app-update.json").read_text())
        entry = next(item for item in manifest["entries"] if item["path"] == "open-pro4bro-console.bat")
        entry.update(bytes=len(new_launcher), sha256=hashlib.sha256(new_launcher).hexdigest().upper())
        write_json(package / "app-update.json", manifest)
        write_json(bundle / "data/runtime/pro4bro-console.json", {"consolePid": -1})
        wrapper = tmp_path / "apply-running.ps1"
        wrapper.write_text(f"""
$ErrorActionPreference = 'Stop'
# NetTCPIP exports CDXML functions. Import before defining the isolated
# lookups, otherwise lazy import can overwrite the test's function override.
Import-Module NetTCPIP, CimCmdlets
$protectedProcessIds = @(NetTCPIP\\Get-NetTCPConnection -LocalPort 18119,18120,18081 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
$listenerMaps = '{json.dumps(listener_maps)}' | ConvertFrom-Json
$identityMaps = '{json.dumps(identity_maps)}' | ConvertFrom-Json
function Get-NetTCPConnection {{
    [CmdletBinding()] param([int[]]$LocalPort, [string]$State)
    foreach ($mapping in $listenerMaps) {{
        if ($LocalPort -notcontains $mapping.standard) {{ continue }}
        foreach ($listener in @(NetTCPIP\\Get-NetTCPConnection -LocalPort $mapping.actual -State Listen -ErrorAction SilentlyContinue)) {{
            [pscustomobject]@{{ LocalPort = $mapping.standard; OwningProcess = $listener.OwningProcess }}
        }}
    }}
}}
function Get-CimInstance {{
    [CmdletBinding()] param([string]$ClassName, [string]$Filter)
    $options = @{{ ClassName = $ClassName }}
    if ($Filter) {{ $options.Filter = $Filter }}
    foreach ($item in @(CimCmdlets\\Get-CimInstance @options)) {{
        $identity = $identityMaps | Where-Object {{ $_.pid -eq $item.ProcessId }} | Select-Object -First 1
        if ($ClassName -eq 'Win32_Process' -and $identity) {{
            [pscustomobject]@{{
                ProcessId = $item.ProcessId; ParentProcessId = $item.ParentProcessId
                Name = 'python.exe'
                ExecutablePath = {ps_quote(bundle / '.runtime/python/core/python.exe')}
                CommandLine = '"' + {ps_quote(bundle / '.runtime/python/core/python.exe')} + '" -m ' + $identity.module
            }}
        }} else {{ $item }}
    }}
}}
try {{
    & {ps_quote(bundle / 'scripts/update-portable.ps1')} -BundleRoot {ps_quote(bundle)} -ApplyOnly {' ' if restart else '-NoRestart'}
}} finally {{
    foreach ($protectedId in $protectedProcessIds) {{
        if (-not (Get-Process -Id $protectedId -ErrorAction SilentlyContinue)) {{
            throw "Protected source process $protectedId was stopped by the isolated test."
        }}
    }}
}}
""", encoding="utf-8")
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(wrapper)],
            capture_output=True, encoding="utf-8", errors="replace", timeout=90, env=env,
        )
        if foreign_controller:
            assert result.returncode != 0
            assert "sharing ports with another program" in result.stdout + result.stderr
            assert all(process.poll() is None for process in processes)
            assert (bundle / ".portable-bundle.json").read_bytes() == old_manifest
            return
        for process in processes:
            process.wait(timeout=5)
        assert not (bundle / "data/runtime/pro4bro-console.json").exists()
        if restart:
            deadline = time.monotonic() + 5
            while not launch_marker.exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            assert launch_marker.read_text().strip() == ("restored" if fail_gate else "updated")
        else:
            assert not launch_marker.exists()
        if fail_gate:
            assert result.returncode != 0
            assert "Portable verification failed" in result.stdout + result.stderr
            assert (bundle / ".portable-bundle.json").read_bytes() == old_manifest
            for name, data in legacy.items():
                assert (bundle / name).read_bytes() == data
            return
        assert result.returncode == 0, result.stdout + result.stderr
        assert json.loads((bundle / ".portable-bundle.json").read_text(encoding="utf-8-sig"))["releaseVersion"] == "0.5.1"
        assert (bundle / "services/api/requirements.txt").read_bytes() == b"requirements\n"
    finally:
        for process in processes:
            if process.poll() is None:
                # The venv launcher has an interpreter child: reclaim that whole
                # owned test tree even when a preflight deliberately refused it.
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
            process.wait(timeout=5)


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
