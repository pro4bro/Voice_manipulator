"""Provision one isolated, movable inference runtime for an expressive engine."""
from __future__ import annotations

import argparse
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile

PYTHON_VERSION = "3.11.9"
UV_VERSION = "0.8.14"
PYTHON_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embeddable-amd64.zip"
PYTHON_SHA256 = "33B448F95FECB7C6F802157DBD5E6B40A2AD9BFC8B95CA634A06BA4073AD1AC0"
RUNTIME_SCHEMA = 1
DISK_BUDGET = 12 * 1024**3
TORCH_WHEELS = {
    "torch": {
        "filename": "torch-2.8.0+cu128-cp311-cp311-win_amd64.whl",
        "sha256": "34c55443aafd31046a7963b63d30bc3b628ee4a704f826796c865fdfd05bb596",
        "url": "https://download-r2.pytorch.org/whl/cu128/torch-2.8.0%2Bcu128-cp311-cp311-win_amd64.whl",
    },
    "torchaudio": {
        "filename": "torchaudio-2.8.0+cu128-cp311-cp311-win_amd64.whl",
        "sha256": "7a1eb6154e05b8056b34c7a41495e09d57f79eb0180eb4e7f3bb2a61845ca8ea",
        "url": "https://download-r2.pytorch.org/whl/cu128/torchaudio-2.8.0%2Bcu128-cp311-cp311-win_amd64.whl",
    },
}
PINNED_PYPI_ARTIFACTS = {
    "uv": {
        "version": UV_VERSION,
        "filename": "uv-0.8.14-py3-none-win_amd64.whl",
        "sha256": "5091d588753bbbd1f120f13311ede2ae113d7ec2760e149fc502a237f2516075",
        "url": "https://files.pythonhosted.org/packages/45/5e/9bf7004bd53e9279265d73a131fe2a6c7d74c1125c53e805b5e9f4047f37/uv-0.8.14-py3-none-win_amd64.whl",
    },
    "unidic-lite": {
        "version": "1.0.8",
        "filename": "unidic-lite-1.0.8.tar.gz",
        "sha256": "db9d4572d9fdd4d00a97949d4b0741ec480ee05a7e7e2e32f547500dae27b245",
        "url": "https://files.pythonhosted.org/packages/55/2b/8cf7514cb57d028abcef625afa847d60ff1ffbf0049c36b78faa7c35046f/unidic-lite-1.0.8.tar.gz",
    },
}

ENGINES = {
    "f5-tts": {"runtime": "f5-tts", "repo": "F5-TTS", "revision": "2f866649b779881af8bd644e76b9a6d95053da29",
               "entrypoint": "src/f5_tts/api.py", "imports": ("f5_tts.api", "vocos"), "requirements": "requirements-expressive-f5.txt"},
    "vivoice": {"runtime": "f5-tts", "repo": "F5-TTS", "revision": "2f866649b779881af8bd644e76b9a6d95053da29",
                "entrypoint": "src/f5_tts/api.py", "imports": ("f5_tts.api", "vocos"), "requirements": "requirements-expressive-f5.txt"},
    "indextts25": {"runtime": "index-tts", "repo": "IndexTTS", "revision": "d9e41aac89fd00b3d71497fddb287b7f24613712",
                   "entrypoint": "indextts/infer_v2_5.py", "imports": ("indextts.infer_v2_5",), "requirements": "requirements-expressive-index.txt"},
    "fish-s2-pro": {"runtime": "fish-speech", "repo": "FishSpeech", "revision": "541566932abbaebcb0a40e562a1f846738383f38",
                    "entrypoint": "fish_speech/inference_engine/__init__.py", "imports": ("tools.server.model_manager", "fish_speech.utils.schema"), "requirements": "requirements-expressive-fish.txt"},
}


class SetupError(RuntimeError):
    pass


def root_from_script(script: Path) -> Path:
    return script.resolve().parent.parent


def runtime_layout(root: Path, engine: str) -> tuple[Path, Path, Path]:
    spec = ENGINES[engine]
    runtime = root / ".runtime" / "python" / spec["runtime"]
    source = root / ".runtime" / "engines" / "research" / spec["repo"]
    receipt = runtime / ".pro4bro-expressive-runtime.json"
    return runtime, source, receipt


def validate_source(source: Path, spec: dict, git=subprocess.run) -> None:
    if not (source / spec["entrypoint"]).is_file():
        raise SetupError(f"Pinned engine source/entrypoint is missing: {source / spec['entrypoint']}")
    head = git(["git", "-C", str(source), "rev-parse", "HEAD"], capture_output=True, text=True)
    if head.returncode or head.stdout.strip() != spec["revision"]:
        raise SetupError(f"{spec['repo']} checkout must be at supported revision {spec['revision']}.")
    # Check tracked product changes. Upstream model/checkpoint directories may be
    # untracked locally, but they must not change the pinned committed source.
    dirty = git(["git", "-C", str(source), "status", "--porcelain", "--untracked-files=no"], capture_output=True, text=True)
    if dirty.returncode or dirty.stdout.strip():
        raise SetupError(f"{spec['repo']} checkout has uncommitted changes; refusing to provision against modified source.")


def inspect_existing(runtime: Path, receipt_path: Path, spec: dict) -> None:
    if not runtime.exists():
        return
    if not runtime.is_dir():
        raise SetupError(f"Runtime destination is not a directory: {runtime}")
    if not any(runtime.iterdir()):
        return
    marker = runtime / ".pro4bro-expressive-managed.json"
    if marker.is_file():
        _validate_ownership_record(marker, spec, "partial setup marker")
        return  # Recover only an explicitly marked partial setup.
    if not receipt_path.is_file():
        raise SetupError(f"Existing runtime is unowned; preserving it: {runtime}")
    _validate_ownership_record(receipt_path, spec, "runtime receipt")


def _validate_ownership_record(path: Path, spec: dict, label: str) -> None:
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SetupError(f"Existing {label} is unreadable; preserving it: {path}") from exc
    expected_path = "../../engines/research/" + spec["repo"]
    if (record.get("schema") != RUNTIME_SCHEMA or record.get("runtime") != spec["runtime"]
            or record.get("sourceRevision") != spec["revision"]
            or record.get("sourcePathFromRuntime") != expected_path):
        raise SetupError(f"Existing {label} does not match this provisioner; preserving it: {path.parent}")


def pth_contents(source: Path, runtime: Path, include_src: bool = False) -> str:
    # The source path is relative to the runtime folder; this keeps project moves valid.
    relative = os.path.relpath(source, runtime).replace("\\", "/")
    paths = ["python311.zip", ".", relative]
    if include_src:
        paths.append(relative + "/src")
    # Every import root is explicit. Enabling site also adds the Windows user
    # site directory even with embedded _pth isolation, leaking other installs.
    paths.extend(("../../../services/api", "site-packages", ""))
    return "\n".join(paths)


def expected_receipt(engine: str, spec: dict, source: Path) -> dict:
    return {"schema": RUNTIME_SCHEMA, "runtime": spec["runtime"], "engine": engine,
            "sourceRevision": spec["revision"], "sourcePathFromRuntime": "../../engines/research/" + spec["repo"]}


def success_receipt(engine: str, spec: dict, source: Path, requirements: Path, site: Path) -> dict:
    receipt = expected_receipt(engine, spec, source)
    receipt.update({
        "pythonVersion": PYTHON_VERSION,
        "requirementsSha256": hashlib.sha256(requirements.read_bytes()).hexdigest(),
        "installedDistributions": sorted(
            ({"name": dist.metadata["Name"], "version": dist.version}
             for dist in metadata.distributions(path=[str(site)]) if dist.metadata.get("Name")),
            key=lambda item: item["name"].casefold(),
        ),
    })
    return receipt


def uv_install_command(uv: Path, python: Path, site: Path, requirements: Path,
                       override: Path | None = None) -> list[str]:
    """Build an isolated uv target install command (never the caller Python)."""
    command = [str(uv), "pip", "install", "--python", str(python), "--target", str(site),
               "--no-config", "--no-python-downloads", "--native-tls"]
    if override is not None:
        command.extend(("--override", str(override)))
    command.extend(("--requirement", str(requirements)))
    return command


def installed_uv_version(uv_bootstrap: Path) -> str:
    """Read the uv wheel metadata from its private pip --target directory."""
    for dist in metadata.distributions(path=[str(uv_bootstrap)]):
        name = dist.metadata.get("Name", "").lower().replace("_", "-").replace(".", "-")
        if name == "uv":
            return dist.version
    raise SetupError(f"Pinned uv distribution metadata is missing from its private bootstrap: {uv_bootstrap}")


def validate_uv_marker(path: Path, runtime: str) -> None:
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SetupError(f"Existing uv bootstrap marker is unreadable; preserving it: {path}") from exc
    if (record.get("schema") != RUNTIME_SCHEMA or record.get("runtime") != runtime
            or record.get("uvVersion") != UV_VERSION):
        raise SetupError(f"Existing uv bootstrap marker does not match this provisioner; preserving it: {path.parent}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cached_artifact_requirement(name: str, artifact: dict, wheel_cache: Path) -> str:
    """Return an approved logical URL pin, substituting only a verified cached copy."""
    digest = artifact["sha256"]
    cached = wheel_cache / artifact["filename"]
    if cached.exists():
        if not cached.is_file():
            raise SetupError(f"Cached {name} artifact is not a file; preserving path: {cached}")
        actual = sha256_file(cached)
        if actual != digest:
            raise SetupError(f"Cached {name} artifact SHA256 mismatch; preserving file: {cached}")
        url = cached.resolve().as_uri()
    else:
        url = artifact["url"]
    return f"{name} @ {url}#sha256={digest}"


def stage_requirements(source: Path, destination: Path, wheel_cache: Path) -> Path:
    """Use verified local copies of specifically pinned artifacts, leaving source unchanged."""
    staged = []
    for line in source.read_text(encoding="utf-8").splitlines():
        requirement, separator, url = line.partition(" @ ")
        name = requirement.strip().lower()
        artifact = (TORCH_WHEELS | PINNED_PYPI_ARTIFACTS).get(name) if separator else None
        if artifact is None:
            staged.append(line)
            continue
        expected = artifact["url"] + "#sha256=" + artifact["sha256"]
        if url != expected:
            raise SetupError(f"Pinned {requirement} source URL/hash differs from the approved artifact.")
        staged.append(_cached_artifact_requirement(name, artifact, wheel_cache))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("\n".join(staged) + "\n", encoding="utf-8")
    return destination


def uv_bootstrap_requirement(wheel_cache: Path) -> str:
    artifact = PINNED_PYPI_ARTIFACTS["uv"]
    return _cached_artifact_requirement("uv", artifact, wheel_cache)


def plan(root: Path, engine: str) -> dict:
    spec = ENGINES[engine]
    runtime, source, _receipt = runtime_layout(root, engine)
    drive = shutil.disk_usage(root)
    files = ["official CPython embeddable zip (SHA256 verified)", "scripts/" + spec["requirements"],
             ".runtime/python/.downloads/wheels/<approved SHA256-pinned artifact>",
             "private staged requirements file", ".pro4bro-expressive-managed.json",
             "python311._pth", ".pro4bro-expressive-runtime.json"]
    files.append(runtime.relative_to(root).as_posix() + "/uv-bootstrap (uv==" + UV_VERSION + ")")
    if engine == "fish-s2-pro":
        files.append("scripts/requirements-expressive-fish-overrides.txt")
    return {"engine": engine, "runtime": runtime.relative_to(root).as_posix(),
            "source": source.relative_to(root).as_posix(), "sourceRevision": spec["revision"],
            "files": files,
            "commands": ["download and verify CPython 3.11.9", "use bootstrap pip only to stage pinned uv into this private runtime",
                         "install SHA256-pinned Torch wheels from local cache when available, or their official URLs",
                         (f"bootstrap uv=={UV_VERSION} into the private runtime; uv pip install --python <runtime/python.exe> "
                          "--target <runtime/site-packages> --no-config --no-python-downloads" +
                          (" --override scripts/requirements-expressive-fish-overrides.txt" if engine == "fish-s2-pro" else "") +
                          " -r scripts/" + spec["requirements"]),
                         "run expressive_import_probe.py with the runtime python.exe"],
            "requiredFreeBytes": DISK_BUDGET, "availableFreeBytes": drive.free}


def run(args: list[str], *, env: dict[str, str] | None = None) -> None:
    try:
        result = subprocess.run(args, env=env, check=False)
    except OSError as exc:
        raise SetupError(f"Could not start command {args[0]}: {exc}") from exc
    if result.returncode:
        raise SetupError(f"Command failed with exit code {result.returncode}: {args[0]}")


def download_python(cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / f"python-{PYTHON_VERSION}-embeddable-amd64.zip"
    if not archive.is_file():
        try:
            urllib.request.urlretrieve(PYTHON_URL, archive)
        except Exception as exc:
            archive.unlink(missing_ok=True)
            raise SetupError(f"Could not download official CPython archive: {exc}") from exc
    digest = hashlib.sha256(archive.read_bytes()).hexdigest().upper()
    if digest != PYTHON_SHA256:
        archive.unlink(missing_ok=True)
        raise SetupError(f"CPython archive checksum mismatch: expected {PYTHON_SHA256}, got {digest}")
    return archive


def bootstrap_python(archive: Path, runtime: Path) -> Path:
    runtime.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(runtime)
    pth = runtime / "python311._pth"
    if not pth.is_file():
        raise SetupError("CPython archive did not contain python311._pth.")
    return runtime / "python.exe"


def setup(root: Path, engine: str, bootstrap: Path | None = None) -> None:
    if os.name != "nt":
        raise SetupError("These embedded CPython runtimes are Windows amd64 only.")
    spec = ENGINES[engine]
    runtime, source, receipt_path = runtime_layout(root, engine)
    validate_source(source, spec)
    inspect_existing(runtime, receipt_path, spec)
    if shutil.disk_usage(root).free < DISK_BUDGET:
        raise SetupError(f"At least {DISK_BUDGET} free bytes are required under the project volume.")
    marker = runtime / ".pro4bro-expressive-managed.json"
    runtime.mkdir(parents=True, exist_ok=True)
    # Invalidate stale success before any runtime mutation; a failed recovery stays unavailable.
    receipt_path.unlink(missing_ok=True)
    marker.write_text(json.dumps(expected_receipt(engine, spec, source), indent=2), encoding="utf-8")
    cache = root / ".runtime" / "python" / ".downloads"
    archive = download_python(cache)
    python = bootstrap_python(archive, runtime)
    (runtime / "python311._pth").write_text(pth_contents(source, runtime, include_src=spec["repo"] == "F5-TTS"), encoding="ascii")
    site = runtime / "site-packages"
    site.mkdir(exist_ok=True)
    bootstrap = bootstrap or Path(os.environ.get("PRO4BRO_BOOTSTRAP_PYTHON", sys.executable))
    if not bootstrap.is_file():
        raise SetupError(f"Bootstrap Python executable is missing: {bootstrap}")
    # Pip is invoked from a caller-supplied development Python only to place the
    # pinned uv executable in this engine's private runtime directory.
    pip_env = os.environ.copy()
    for key in ("PIP_TARGET", "PIP_USER", "PIP_PREFIX", "PIP_ROOT", "PIP_REQUIRE_VIRTUALENV"):
        pip_env.pop(key, None)
    pip_env["PIP_CONFIG_FILE"] = os.devnull
    requirements = root / "scripts" / spec["requirements"]
    requirements_hash = sha256_file(requirements)
    staged_requirements = stage_requirements(
        requirements, runtime / f".requirements-{spec['runtime']}.txt", cache / "wheels")
    override = root / "scripts" / "requirements-expressive-fish-overrides.txt" if engine == "fish-s2-pro" else None
    override_hash = sha256_file(override) if override is not None else None
    uv_bootstrap = runtime / "uv-bootstrap"
    uv_marker = uv_bootstrap / ".pro4bro-uv-bootstrap.json"
    # Do not replace an existing unrelated directory. This path is private and
    # product-owned once the marker is present.
    if uv_bootstrap.exists() and any(uv_bootstrap.iterdir()) and not uv_marker.is_file():
        raise SetupError(f"Existing uv bootstrap is unowned; preserving it: {uv_bootstrap}")
    if uv_marker.is_file():
        validate_uv_marker(uv_marker, spec["runtime"])
    uv_bootstrap.mkdir(parents=True, exist_ok=True)
    uv_marker.write_text(json.dumps({"schema": RUNTIME_SCHEMA, "runtime": spec["runtime"],
                                     "uvVersion": UV_VERSION}, indent=2), encoding="utf-8")
    run([str(bootstrap), "-m", "pip", "--disable-pip-version-check", "install", "--target",
         str(uv_bootstrap), "--upgrade", uv_bootstrap_requirement(cache / "wheels")], env=pip_env)
    # This pinned wheel places its bundled executable under bin for pip --target
    # even on Windows (it is not a generated Python console entry point).
    uv = uv_bootstrap / "bin" / "uv.exe"
    if not uv.is_file():
        raise SetupError(f"Pinned uv bootstrap did not create the expected executable: {uv}")
    uv_version = installed_uv_version(uv_bootstrap)
    if uv_version != UV_VERSION:
        raise SetupError(f"Pinned uv version mismatch: expected {UV_VERSION}, found {uv_version}")
    uv_env = {key: value for key, value in os.environ.items() if not key.startswith("UV_")}
    uv_env["UV_CACHE_DIR"] = str(runtime / "uv-cache")
    # Bound concurrent requests/builds on the local Windows runtime host.
    uv_env.update(UV_CONCURRENT_DOWNLOADS="4", UV_CONCURRENT_BUILDS="1", UV_CONCURRENT_INSTALLS="4")
    run(uv_install_command(uv, python, site, staged_requirements, override), env=uv_env)
    probe = root / "services" / "api" / "app" / "workers" / "expressive_import_probe.py"
    run([str(python), str(probe), spec["runtime"], str(source)])
    # A success receipt is written only after the exact product probe succeeds.
    receipt = success_receipt(engine, spec, source, requirements, site)
    if receipt["requirementsSha256"] != requirements_hash:
        raise SetupError("Expressive runtime requirements changed during installation; refusing a ready receipt.")
    receipt.update({"resolver": "uv", "uvVersion": uv_version})
    if override is not None:
        if sha256_file(override) != override_hash:
            raise SetupError("Fish uv override changed during installation; refusing a ready receipt.")
        receipt["overrideSha256"] = override_hash
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    marker.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=sorted(ENGINES), required=True)
    parser.add_argument("--plan", action="store_true", help="show intended files, commands and free-space check only")
    parser.add_argument("--bootstrap-python", type=Path, help="Python 3.11 executable used only to run pip --target")
    args = parser.parse_args()
    root = root_from_script(Path(__file__))
    try:
        if args.plan:
            print(json.dumps(plan(root, args.engine), indent=2))
        else:
            setup(root, args.engine, args.bootstrap_python)
            print(f"READY {args.engine}: verified import probe completed in {runtime_layout(root, args.engine)[0]}")
    except SetupError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
