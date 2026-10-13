from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
BUILDER = ROOT / "scripts" / "build-portable-bundle.ps1"
pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="PowerShell portable builder")


def write(path: Path, content: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, bytes):
        path.write_bytes(content)
    else:
        path.write_text(content, encoding="utf-8")


def make_builder_source(tmp_path: Path, *, profile: str = "NoVibeVoice") -> Path:
    source = tmp_path / "Source With Spaces"
    scripts = source / "scripts"
    scripts.mkdir(parents=True)
    builder_fixture = scripts / BUILDER.name
    builder_text = BUILDER.read_text(encoding="utf-8-sig")
    # This Windows host's Windows PowerShell omits Microsoft.PowerShell.Utility
    # from its system module tree; keep the builder's hash behavior available
    # in the fixture with the same SHA256 result shape.
    hash_helper = r'''
function Get-FileHash {
    param([string]$LiteralPath, [string]$Algorithm)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($LiteralPath)
        $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '')
        return [pscustomobject]@{ Algorithm = 'SHA256'; Hash = $hash; Path = $LiteralPath }
    } finally { $sha.Dispose() }
}
'''
    builder_fixture.write_text(
        builder_text.replace('$ErrorActionPreference = "Stop"', hash_helper + '\n$ErrorActionPreference = "Stop"', 1),
        encoding="utf-8-sig",
    )
    write(source / "APP-VERSION.json", '{"schemaVersion":1,"channel":"alpha","version":"0.5.9"}')
    write(scripts / "test-portable-runtime.ps1", "param($Profile, [switch]$Json)\n'{\"portable\":true,\"failed\":0}'\n")
    write(scripts / "package-obs-plugin.ps1", "Write-Output 'fixture package prepared'\n")

    trees = {
        ".runtime/python/core": {"python.exe": b"core python"},
        ".runtime/python/stt": {"python.exe": b"stt python"},
        ".runtime/python/omnivoice-training": {"python.exe": b"omnivoice python"},
        ".runtime/python/rvc": {"python.exe": b"rvc python"},
        ".runtime/python/voice-changer": {"python.exe": b"voice changer python"},
        ".runtime/engines/research/Applio": {"requirements.txt": b"applio requirements", "logs/omit.txt": b"log"},
        ".runtime/omnivoice-studio/models/whisper": {"model.bin": b"model"},
        ".runtime/omnivoice-studio/nltk_data/tokenizers": {"punkt.zip": b"punkt"},
        ".cache/huggingface/hub/models--k2-fsa--OmniVoice/refs": {"main": b"abc123\n"},
        ".cache/huggingface/hub/models--k2-fsa--OmniVoice/snapshots/abc123": {"model.safetensors": b"checkpoint"},
        ".cache/torch/hub": {"config.json": b"torch cache"},
        ".tools/ffmpeg": {"ffmpeg.exe": b"ffmpeg", "ffprobe.exe": b"ffprobe"},
        "engines/OmniVoice": {"pyproject.toml": b"upstream metadata", ".venv/omit.txt": b"venv", "__pycache__/omit.pyc": b"pyc"},
        "services/api": {
            "requirements.txt": b"api requirements", "app/main.py": b"api source",
            "tests/omit.py": b"test", ".env": b"fixture secret", "logs/private.log": b"private log",
        },
        "apps/web/dist": {"index.html": b"built web app"},
        "services/stt_studio/studio_app": {"server.py": b"canonical studio source", "__pycache__/omit.pyc": b"pyc"},
        ".runtime/omnivoice-studio/studio_app": {"server.py": b"stale cached studio source"},
        "build/obs-plugin-package": {
            "manifest.json": b'{"schemaVersion":1,"pluginId":"pro4bro-obs-bridge","files":[]}',
            "bin/64bit/pro4bro-obs-bridge.dll": b"bridge dll",
            "data/locale/en-US.ini": b"locale",
            "data/brand/pro4bro-livelink.svg": b"brand",
        },
        "build/obs-plugin/RelWithDebInfo": {"pro4bro-obs-bridge.dll": b"bridge dll"},
        "plugins/obs-pro4bro-bridge": {"config.example.json": b"{}"},
    }
    if profile == "All":
        trees[".runtime/python/vibevoice-training"] = {"python.exe": b"vibevoice python"}
        trees[".runtime/engines/vibevoice/VibeVoice"] = {"pyproject.toml": b"vibevoice source"}
        trees[".runtime/engines/vibevoice/VibeVoice_models"] = {"model.safetensors": b"vibevoice model"}
        trees[".runtime/engines/research/Applio"] = {"requirements.txt": b"applio requirements", "logs/omit.txt": b"log"}
    for tree, files in trees.items():
        for name, content in files.items():
            write(source / tree / name, content)
    write(source / ".runtime/python/runtime-manifest.json", b'{"schemaVersion":1}\n')

    script_names = (
        "pro4bro-console.ps1", "pro4bro-process-tree.ps1", "pro4bro-readiness.ps1",
        "pro4bro-workloads.ps1", "test-portable-runtime.ps1", "install-obs-plugin.ps1",
        "update-portable.ps1",
    )
    for name in script_names:
        if name != "test-portable-runtime.ps1":
            write(scripts / name, f"# {name}\n")
    for name in ("open-pro4bro-console.bat", "VERIFY-PORTABLE.bat", "INSTALL-OBS-PLUGIN.bat", "UPDATE-PORTABLE.bat"):
        write(source / name, f"@echo off\r\nrem {name}\r\n")
    write(source / "docs/PORTABLE-NO-VIBEVOICE.md", "NoVibeVoice guide\n")
    write(source / "docs/PORTABLE-QUICKSTART.md", "All guide\n")
    subprocess.run(["git", "init", "-q", str(source)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(source), "config", "user.email", "fixture@example.invalid"], check=True)
    subprocess.run(["git", "-C", str(source), "config", "user.name", "Portable Fixture"], check=True)
    subprocess.run(["git", "-C", str(source), "add", "."], check=True)
    subprocess.run(["git", "-C", str(source), "commit", "-q", "-m", "fixture source"], check=True)
    return source


def build(
    source: Path,
    destination: Path,
    *args: str,
    skip_web_build: bool = True,
    env: dict[str, str] | None = None,
) -> dict:
    command = [
        "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
        str(source / "scripts/build-portable-bundle.ps1"), "-OutputRoot", str(destination),
        "-Profile", "NoVibeVoice",
    ]
    if skip_web_build:
        command.append("-SkipWebBuild")
    command.extend(args)
    result = subprocess.run(
        command,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
        env=env,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout)


def test_deferred_base_bundle_copies_app_and_emits_precise_copy_plan(tmp_path: Path) -> None:
    source = make_builder_source(tmp_path)
    destination = tmp_path / "Deferred Bundle With Spaces"

    result = build(source, destination, "-DeferBaseLayer")

    assert result["ready"] is False
    assert result["appLayerReady"] is True
    assert result["pendingBaseComponents"]
    assert (destination / ".bundle-incomplete").is_file()
    assert (destination / "services/api/app/main.py").read_bytes() == b"api source"
    assert (destination / "apps/web/dist/index.html").read_bytes() == b"built web app"
    assert not (destination / "services/api/.env").exists()
    assert not (destination / "services/api/logs/private.log").exists()
    assert not (destination / ".runtime/python/core").exists()
    assert not (destination / ".runtime/python/vibevoice-training").exists()
    assert not (destination / ".runtime/engines/vibevoice").exists()
    assert not (destination / ".cache/huggingface").exists()
    assert not (destination / "engines/OmniVoice").exists()

    plan = json.loads((destination / ".portable-base-copy.json").read_text(encoding="utf-8-sig"))
    assert plan["schemaVersion"] == 1
    assert plan["kind"] == "Pro4BroBaseCopyPlan"
    by_destination = {component["destination"]: component for component in plan["components"]}
    assert by_destination[".runtime/python/core"]["source"] == str(source / ".runtime/python/core")
    assert by_destination["engines/OmniVoice"]["files"] == 1
    assert ".venv\\*" in by_destination["engines/OmniVoice"]["excludes"]
    assert "**\\__pycache__\\*" in by_destination["engines/OmniVoice"]["excludes"]
    assert (destination / "COPY-CORE-MODELS.md").is_file()
    instructions = (destination / "COPY-CORE-MODELS.md").read_text(encoding="utf-8-sig")
    assert instructions.startswith("# Pro4Bro Portable alpha 0.5.9")
    table_rows = [line for line in instructions.splitlines() if line.startswith("| `")]
    assert len(table_rows) == 12
    assert all(line.count("`") == 4 for line in table_rows)
    assert "cần sao chép đủ 12 thành phần" in instructions
    assert "Không sao chép `.runtime/python/vibevoice-training`" in instructions
    assert "hoặc `.runtime/engines/vibevoice`" in instructions
    assert "Chỉ khi báo cáo có **0 lỗi**" in instructions
    assert "`VERIFY-PORTABLE.bat`" in instructions
    assert "`open-pro4bro-console.bat`" in instructions
    assert "đóng OBS rồi bấm `INSTALL-OBS-PLUGIN.bat`" in instructions
    assert str(source / ".runtime/python/core") in instructions
    assert "VERIFY-PORTABLE.bat" in instructions

    manifest = json.loads((destination / ".portable-bundle.json").read_text(encoding="utf-8-sig"))
    assert manifest["deferredBaseLayer"] is True
    assert manifest["baseLayerReady"] is False
    assert manifest["files"] == result["files"]
    assert manifest["bytes"] == result["bytes"]
    assert manifest["logicalFiles"] > manifest["files"]
    assert manifest["logicalBytes"] > manifest["bytes"]


def test_hardlink_mode_keeps_app_files_independent_and_uses_canonical_studio_source(tmp_path: Path) -> None:
    source = make_builder_source(tmp_path)
    destination = tmp_path / "Full Bundle"

    result = build(source, destination)

    assert result["ready"] is True
    assert not (destination / ".bundle-incomplete").exists()
    assert (destination / ".runtime/omnivoice-studio/studio_app/server.py").read_bytes() == b"canonical studio source"
    assert (destination / ".runtime/python/core/python.exe").read_bytes() == b"core python"

    packaged_app = destination / "services/api/app/main.py"
    packaged_app.write_bytes(b"edited package app")
    assert (source / "services/api/app/main.py").read_bytes() == b"api source"
    packaged_runtime_manifest = destination / ".runtime/python/runtime-manifest.json"
    packaged_runtime_manifest.write_bytes(b"edited control file")
    assert (source / ".runtime/python/runtime-manifest.json").read_bytes() == b'{"schemaVersion":1}\n'

    plan = json.loads((destination / ".portable-base-copy.json").read_text(encoding="utf-8-sig")) if (destination / ".portable-base-copy.json").exists() else None
    assert plan is None


def test_builder_rebuilds_web_assets_by_default_before_packaging(tmp_path: Path) -> None:
    source = make_builder_source(tmp_path)
    npm_bin = tmp_path / "fake npm"
    write(
        npm_bin / "npm.cmd",
        "@echo off\r\nif not exist dist mkdir dist\r\necho fresh build>dist\\index.html\r\n",
    )
    env = os.environ.copy()
    env["PATH"] = str(npm_bin) + ";" + env["PATH"]
    destination = tmp_path / "Rebuilt Web Bundle"

    result = build(source, destination, skip_web_build=False, env=env)

    assert result["ready"] is True
    assert (destination / "apps/web/dist/index.html").read_text(encoding="utf-8").strip() == "fresh build"


def test_deferred_all_profile_keeps_vibevoice_in_expected_base_inventory(tmp_path: Path) -> None:
    source = make_builder_source(tmp_path, profile="All")
    destination = tmp_path / "Deferred All"
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         str(source / "scripts/build-portable-bundle.ps1"), "-OutputRoot", str(destination),
         "-Profile", "All", "-SkipWebBuild", "-DeferBaseLayer"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    summary = json.loads(result.stdout)
    assert summary["ready"] is False
    plan = json.loads((destination / ".portable-base-copy.json").read_text(encoding="utf-8-sig"))
    destinations = {component["destination"] for component in plan["components"]}
    assert ".runtime/python/vibevoice-training" in destinations
    assert ".runtime/engines" in destinations
    engine_component = next(component for component in plan["components"] if component["destination"] == ".runtime/engines")
    assert engine_component["files"] == 3
    assert not (destination / ".runtime/python/vibevoice-training").exists()
    guide = (destination / "COPY-CORE-MODELS.md").read_text(encoding="utf-8-sig")
    assert "Bản All cần sao chép mọi thành phần" in guide
