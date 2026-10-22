from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import hashlib

import pytest


SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "setup-expressive-runtime.py"
SPEC = importlib.util.spec_from_file_location("setup_expressive_runtime", SCRIPT)
setup_runtime = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(setup_runtime)


def test_f5_and_vivoice_share_the_same_private_runtime(tmp_path):
    f5_runtime, f5_source, _ = setup_runtime.runtime_layout(tmp_path, "f5-tts")
    vi_runtime, vi_source, _ = setup_runtime.runtime_layout(tmp_path, "vivoice")
    assert f5_runtime == vi_runtime
    assert f5_source == vi_source
    assert f5_runtime == tmp_path / ".runtime/python/f5-tts"


def test_transformer_major_versions_stay_isolated_by_requirements():
    scripts = SCRIPT.parent
    f5 = (scripts / "requirements-expressive-f5.txt").read_text(encoding="utf-8")
    index = (scripts / "requirements-expressive-index.txt").read_text(encoding="utf-8")
    fish = (scripts / "requirements-expressive-fish.txt").read_text(encoding="utf-8")
    assert "transformers==4.52.1" in f5 and "tokenizers==0.21.0" in f5
    assert "transformers==4.52.1" in index and "tokenizers==0.21.0" in index
    assert "transformers==5.19.0" in fish and "tokenizers==0.23.2" in fish
    for requirements in (f5, index, fish):
        assert "torch @ https://download-r2.pytorch.org/whl/cu128/torch-2.8.0%2Bcu128-cp311-cp311-win_amd64.whl#sha256=" in requirements
        assert "torchaudio @ https://download-r2.pytorch.org/whl/cu128/torchaudio-2.8.0%2Bcu128-cp311-cp311-win_amd64.whl#sha256=" in requirements
    f5_requirements = [line for line in f5.splitlines() if line and not line.startswith("#")]
    fish_requirements = [line for line in fish.splitlines() if line and not line.startswith("#")]
    assert not any(line.lower().startswith("gradio") for line in f5_requirements)
    assert not any(line.lower().startswith("pyaudio") for line in fish_requirements)


def test_success_receipt_records_requirements_hash_and_installed_versions(tmp_path):
    source = tmp_path / ".runtime/engines/research/F5-TTS"
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("torch==2.8.0\n", encoding="utf-8")
    site = tmp_path / "site-packages"
    info = site / "example_pkg-1.2.3.dist-info"
    info.mkdir(parents=True)
    (info / "METADATA").write_text("Metadata-Version: 2.1\nName: Example_Pkg\nVersion: 1.2.3\n\n", encoding="utf-8")
    receipt = setup_runtime.success_receipt("f5-tts", setup_runtime.ENGINES["f5-tts"], source, requirements, site)
    assert receipt["pythonVersion"] == "3.11.9"
    assert receipt["requirementsSha256"] == hashlib.sha256(requirements.read_bytes()).hexdigest()
    assert receipt["installedDistributions"] == [{"name": "Example_Pkg", "version": "1.2.3"}]
    assert "--extra-index-url" not in SCRIPT.read_text(encoding="utf-8")


def test_fish_uv_command_targets_private_embedded_python_and_uses_override(tmp_path):
    uv = tmp_path / "runtime/uv-bootstrap/bin/uv.exe"
    python = tmp_path / "runtime/python.exe"
    site = tmp_path / "runtime/site-packages"
    override = tmp_path / "scripts/requirements-expressive-fish-overrides.txt"
    requirements = tmp_path / "runtime/.requirements-fish-speech.txt"
    assert setup_runtime.uv_install_command(uv, python, site, requirements, override) == [
        str(uv), "pip", "install", "--python", str(python), "--target", str(site),
        "--no-config", "--no-python-downloads", "--native-tls", "--override", str(override),
        "--requirement", str(requirements),
    ]
    assert setup_runtime.uv_install_command(uv, python, site, requirements) == [
        str(uv), "pip", "install", "--python", str(python), "--target", str(site),
        "--no-config", "--no-python-downloads", "--native-tls", "--requirement", str(requirements),
    ]
    source_path = SCRIPT.parents[1] / ".runtime/engines/research/FishSpeech/pyproject.toml"
    assert source_path.is_file()
    assert "protobuf>=3.20.0,<6.0.0" in source_path.read_text(encoding="utf-8")
    assert "protobuf>=3.20.0,<6.0.0" in (SCRIPT.parent / "requirements-expressive-fish-overrides.txt").read_text(encoding="utf-8")


def test_uv_version_is_read_from_real_private_dist_info(tmp_path):
    target = tmp_path / "runtime/uv-bootstrap"
    info = target / f"uv-{setup_runtime.UV_VERSION}.dist-info"
    info.mkdir(parents=True)
    (info / "METADATA").write_text(
        f"Metadata-Version: 2.1\nName: uv\nVersion: {setup_runtime.UV_VERSION}\n\n", encoding="utf-8")

    assert setup_runtime.installed_uv_version(target) == setup_runtime.UV_VERSION

    missing = tmp_path / "runtime/empty-uv-bootstrap"
    missing.mkdir()
    with pytest.raises(setup_runtime.SetupError, match="distribution metadata is missing"):
        setup_runtime.installed_uv_version(missing)


def test_fish_uv_install_failure_keeps_ready_receipt_absent(tmp_path, monkeypatch):
    engine = "fish-s2-pro"
    runtime, source, receipt = setup_runtime.runtime_layout(tmp_path, engine)
    entrypoint = source / setup_runtime.ENGINES[engine]["entrypoint"]
    entrypoint.parent.mkdir(parents=True)
    entrypoint.touch()
    requirements = tmp_path / "scripts" / setup_runtime.ENGINES[engine]["requirements"]
    requirements.parent.mkdir(parents=True)
    requirements.write_text("fake==1\n", encoding="utf-8")
    override = tmp_path / "scripts/requirements-expressive-fish-overrides.txt"
    override.write_text("protobuf>=3.20.0,<6.0.0\n", encoding="utf-8")
    monkeypatch.setattr(setup_runtime.os, "name", "nt")
    monkeypatch.setattr(setup_runtime, "validate_source", lambda *_a, **_k: None)
    monkeypatch.setattr(setup_runtime.shutil, "disk_usage", lambda *_a: type("Usage", (), {"free": setup_runtime.DISK_BUDGET})())
    monkeypatch.setattr(setup_runtime, "download_python", lambda *_a, **_k: tmp_path / "python.zip")

    def bootstrap(_archive, destination):
        destination.mkdir(parents=True, exist_ok=True)
        python = destination / "python.exe"
        python.touch()
        return python

    monkeypatch.setattr(setup_runtime, "bootstrap_python", bootstrap)
    bootstrap_python = tmp_path / "dev-python.exe"
    bootstrap_python.touch()
    calls = []

    def run(args, **_kwargs):
        calls.append(args)
        if len(calls) == 1:
            uv = runtime / "uv-bootstrap/bin/uv.exe"
            uv.parent.mkdir(parents=True, exist_ok=True)
            uv.touch()
            info = runtime / "uv-bootstrap" / f"uv-{setup_runtime.UV_VERSION}.dist-info"
            info.mkdir()
            (info / "METADATA").write_text(
                f"Metadata-Version: 2.1\nName: uv\nVersion: {setup_runtime.UV_VERSION}\n\n", encoding="utf-8")
        elif len(calls) == 2:
            raise setup_runtime.SetupError("simulated uv dependency resolution failure")

    monkeypatch.setattr(setup_runtime, "run", run)
    with pytest.raises(setup_runtime.SetupError, match="simulated uv dependency resolution failure"):
        setup_runtime.setup(tmp_path, engine, bootstrap_python)

    assert not receipt.exists()
    fish_install = calls[1]
    assert fish_install[fish_install.index("--python") + 1] == str(runtime / "python.exe")
    assert fish_install[fish_install.index("--target") + 1] == str(runtime / "site-packages")
    assert fish_install[fish_install.index("--override") + 1] == str(override)


def test_invalid_uv_marker_is_not_reused(tmp_path):
    marker = tmp_path / "uv-bootstrap/.pro4bro-uv-bootstrap.json"
    marker.parent.mkdir()
    marker.write_text(json.dumps({"schema": 1, "runtime": "other", "uvVersion": setup_runtime.UV_VERSION}), encoding="utf-8")
    with pytest.raises(setup_runtime.SetupError, match="does not match this provisioner"):
        setup_runtime.validate_uv_marker(marker, "fish-speech")


def test_stage_requirements_uses_only_a_hash_verified_cached_wheel(tmp_path, monkeypatch):
    content = b"verified wheel bytes"
    digest = hashlib.sha256(content).hexdigest()
    wheel = {"filename": "torch-test.whl", "sha256": digest,
             "url": "https://download-r2.pytorch.org/torch-test.whl"}
    monkeypatch.setitem(setup_runtime.TORCH_WHEELS, "torch", wheel)
    source = tmp_path / "requirements.txt"
    original = "torch @ " + wheel["url"] + "#sha256=" + digest + "\nnumpy==2.2.6\n"
    source.write_text(original, encoding="utf-8")
    cache = tmp_path / "wheels"
    cache.mkdir()
    (cache / wheel["filename"]).write_bytes(content)
    staged_path = tmp_path / "runtime/staged-requirements.txt"
    staged = setup_runtime.stage_requirements(source, staged_path, cache).read_text(encoding="utf-8")
    assert (cache / wheel["filename"]).resolve().as_uri() in staged
    assert "numpy==2.2.6" in staged
    assert source.read_text(encoding="utf-8") == original


def test_stage_requirements_rejects_corrupt_cached_wheel_without_deleting_it(tmp_path, monkeypatch):
    wheel = {"filename": "torch-test.whl", "sha256": "a" * 64,
             "url": "https://download-r2.pytorch.org/torch-test.whl"}
    monkeypatch.setitem(setup_runtime.TORCH_WHEELS, "torch", wheel)
    source = tmp_path / "requirements.txt"
    source.write_text("torch @ " + wheel["url"] + "#sha256=" + wheel["sha256"] + "\n", encoding="utf-8")
    cache = tmp_path / "wheels"
    cache.mkdir()
    corrupt = cache / wheel["filename"]
    corrupt.write_bytes(b"not the official wheel")
    with pytest.raises(setup_runtime.SetupError, match="SHA256 mismatch"):
        setup_runtime.stage_requirements(source, tmp_path / "staged.txt", cache)
    assert corrupt.read_bytes() == b"not the official wheel"


def test_stage_requirements_falls_back_to_unchanged_official_url(tmp_path, monkeypatch):
    wheel = {"filename": "torch-test.whl", "sha256": "b" * 64,
             "url": "https://download-r2.pytorch.org/torch-test.whl"}
    monkeypatch.setitem(setup_runtime.TORCH_WHEELS, "torch", wheel)
    source = tmp_path / "requirements.txt"
    original = "torch @ " + wheel["url"] + "#sha256=" + wheel["sha256"] + "\n"
    source.write_text(original, encoding="utf-8")
    staged = setup_runtime.stage_requirements(source, tmp_path / "staged.txt", tmp_path / "empty-cache")
    assert staged.read_text(encoding="utf-8") == original


def test_pypi_artifact_cache_substitution_preserves_source_pin(tmp_path, monkeypatch):
    artifact = dict(setup_runtime.PINNED_PYPI_ARTIFACTS["unidic-lite"])
    content = b"same pinned artifact fixture"
    artifact["sha256"] = hashlib.sha256(content).hexdigest()
    monkeypatch.setitem(setup_runtime.PINNED_PYPI_ARTIFACTS, "unidic-lite", artifact)
    name = "unidic-lite"
    source = tmp_path / "requirements.txt"
    original = f"{name} @ {artifact['url']}#sha256={artifact['sha256']}\n"
    source.write_text(original, encoding="utf-8")
    cache = tmp_path / "wheels"
    cache.mkdir()
    cached = cache / artifact["filename"]
    cached.write_bytes(content)

    staged_path = setup_runtime.stage_requirements(source, tmp_path / "staged.txt", cache)

    assert cached.resolve().as_uri() in staged_path.read_text(encoding="utf-8")
    assert source.read_text(encoding="utf-8") == original


def test_uv_bootstrap_uses_approved_cached_file_or_hashed_official_url(tmp_path, monkeypatch):
    artifact = setup_runtime.PINNED_PYPI_ARTIFACTS["uv"]
    cache = tmp_path / "wheels"
    cache.mkdir()
    assert setup_runtime.uv_bootstrap_requirement(cache) == (
        f"uv @ {artifact['url']}#sha256={artifact['sha256']}"
    )

    cached = cache / artifact["filename"]
    content = b"pinned uv wheel fixture"
    cached.write_bytes(content)
    monkeypatch.setitem(setup_runtime.PINNED_PYPI_ARTIFACTS["uv"], "sha256", hashlib.sha256(content).hexdigest())
    assert setup_runtime.uv_bootstrap_requirement(cache) == (
        f"uv @ {cached.resolve().as_uri()}#sha256={hashlib.sha256(content).hexdigest()}"
    )


def test_pypi_cached_artifact_hash_mismatch_fails_without_mutating_file(tmp_path):
    artifact = setup_runtime.PINNED_PYPI_ARTIFACTS["uv"]
    cache = tmp_path / "wheels"
    cache.mkdir()
    cached = cache / artifact["filename"]
    cached.write_bytes(b"corrupt cached artifact")
    with pytest.raises(setup_runtime.SetupError, match="SHA256 mismatch"):
        setup_runtime.uv_bootstrap_requirement(cache)
    assert cached.read_bytes() == b"corrupt cached artifact"


def test_python_path_file_uses_relative_engine_and_api_paths(tmp_path):
    runtime = tmp_path / ".runtime/python/f5-tts"
    source = tmp_path / ".runtime/engines/research/F5-TTS"
    lines = setup_runtime.pth_contents(source, runtime, include_src=True).splitlines()
    assert lines == ["python311.zip", ".", "../../engines/research/F5-TTS", "../../engines/research/F5-TTS/src",
                     "../../../services/api", "site-packages"]


def test_source_validation_requires_exact_revision_and_clean_checkout(tmp_path):
    source = tmp_path / "checkout"
    entrypoint = source / "src/f5_tts/api.py"
    entrypoint.parent.mkdir(parents=True)
    entrypoint.write_text("# pinned source", encoding="utf-8")
    calls = iter([
        type("Result", (), {"returncode": 0, "stdout": setup_runtime.ENGINES["f5-tts"]["revision"] + "\n"})(),
        type("Result", (), {"returncode": 0, "stdout": ""})(),
    ])
    setup_runtime.validate_source(source, setup_runtime.ENGINES["f5-tts"], lambda *_a, **_k: next(calls))

    calls = iter([type("Result", (), {"returncode": 0, "stdout": "bad-revision"})()])
    with pytest.raises(setup_runtime.SetupError, match="supported revision"):
        setup_runtime.validate_source(source, setup_runtime.ENGINES["f5-tts"], lambda *_a, **_k: next(calls))

    calls = iter([
        type("Result", (), {"returncode": 0, "stdout": setup_runtime.ENGINES["f5-tts"]["revision"]})(),
        type("Result", (), {"returncode": 0, "stdout": "?? shadow-module.py"})(),
    ])
    with pytest.raises(setup_runtime.SetupError, match="uncommitted changes"):
        setup_runtime.validate_source(source, setup_runtime.ENGINES["f5-tts"], lambda *_a, **_k: next(calls))


def test_unowned_existing_runtime_is_preserved(tmp_path):
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    existing = runtime / "python.exe"
    existing.write_bytes(b"existing-owner")
    with pytest.raises(setup_runtime.SetupError, match="unowned"):
        setup_runtime.inspect_existing(runtime, runtime / ".pro4bro-expressive-runtime.json", setup_runtime.ENGINES["f5-tts"])
    assert existing.read_bytes() == b"existing-owner"


def test_existing_matching_runtime_receipt_is_recognized(tmp_path):
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    receipt = runtime / ".pro4bro-expressive-runtime.json"
    receipt.write_text(json.dumps(setup_runtime.expected_receipt(
        "f5-tts", setup_runtime.ENGINES["f5-tts"], tmp_path / ".runtime/engines/research/F5-TTS")), encoding="utf-8")
    (runtime / "python.exe").touch()
    setup_runtime.inspect_existing(runtime, receipt, setup_runtime.ENGINES["f5-tts"])


def test_invalid_partial_marker_is_not_trusted(tmp_path):
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    marker = runtime / ".pro4bro-expressive-managed.json"
    marker.write_text(json.dumps({"schema": 1, "runtime": "f5-tts"}), encoding="utf-8")
    with pytest.raises(setup_runtime.SetupError, match="partial setup marker"):
        setup_runtime.inspect_existing(runtime, runtime / ".pro4bro-expressive-runtime.json", setup_runtime.ENGINES["f5-tts"])


def test_process_failure_becomes_setup_error(monkeypatch):
    class Result:
        returncode = 17

    monkeypatch.setattr(setup_runtime.subprocess, "run", lambda *_a, **_k: Result())
    with pytest.raises(setup_runtime.SetupError, match="exit code 17"):
        setup_runtime.run(["fake-python.exe", "-m", "pip"])


def test_process_start_failure_is_reported(monkeypatch):
    def fail(*_args, **_kwargs):
        raise OSError("not found")

    monkeypatch.setattr(setup_runtime.subprocess, "run", fail)
    with pytest.raises(setup_runtime.SetupError, match="Could not start command"):
        setup_runtime.run(["missing-python.exe"])


def test_failed_import_probe_never_writes_success_receipt(tmp_path, monkeypatch):
    engine = "f5-tts"
    runtime, source, receipt = setup_runtime.runtime_layout(tmp_path, engine)
    source.mkdir(parents=True)
    (source / setup_runtime.ENGINES[engine]["entrypoint"]).parent.mkdir(parents=True, exist_ok=True)
    (source / setup_runtime.ENGINES[engine]["entrypoint"]).touch()
    requirements = tmp_path / "scripts" / setup_runtime.ENGINES[engine]["requirements"]
    requirements.parent.mkdir(parents=True)
    requirements.write_text("fake==1\n", encoding="utf-8")
    monkeypatch.setattr(setup_runtime, "validate_source", lambda *_a, **_k: None)
    monkeypatch.setattr(setup_runtime, "download_python", lambda *_a, **_k: tmp_path / "python.zip")

    def bootstrap(_archive, destination):
        destination.mkdir(parents=True, exist_ok=True)
        python = destination / "python.exe"
        python.touch()
        return python

    monkeypatch.setattr(setup_runtime, "bootstrap_python", bootstrap)
    bootstrap_python = tmp_path / "dev-python.exe"
    bootstrap_python.touch()
    runtime.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(setup_runtime.expected_receipt(engine, setup_runtime.ENGINES[engine], source)), encoding="utf-8")
    calls = []

    def fail_probe(args, **_kwargs):
        calls.append(args)
        if len(calls) == 1:
            uv = runtime / "uv-bootstrap/bin/uv.exe"
            uv.parent.mkdir(parents=True, exist_ok=True)
            uv.touch()
            info = runtime / "uv-bootstrap" / f"uv-{setup_runtime.UV_VERSION}.dist-info"
            info.mkdir()
            (info / "METADATA").write_text(
                f"Metadata-Version: 2.1\nName: uv\nVersion: {setup_runtime.UV_VERSION}\n\n", encoding="utf-8")
        if len(calls) == 3:
            raise setup_runtime.SetupError("probe failed")

    monkeypatch.setattr(setup_runtime, "run", fail_probe)
    with pytest.raises(setup_runtime.SetupError, match="probe failed"):
        setup_runtime.setup(tmp_path, engine, bootstrap_python)
    assert not receipt.exists()
    assert (runtime / ".pro4bro-expressive-managed.json").is_file()
    assert calls[0][calls[0].index("--target") + 1] == str(runtime / "uv-bootstrap")
    assert calls[1][0] == str(runtime / "uv-bootstrap/bin/uv.exe")
    assert calls[1][calls[1].index("--python") + 1] == str(runtime / "python.exe")
    assert "--override" not in calls[1]
