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
    paths.extend(("../../../services/api", "site-packages", "import site", ""))
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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stage_requirements(source: Path, destination: Path, wheel_cache: Path) -> Path:
    """Use verified local copies of pinned Torch wheels while leaving source pins intact."""
    staged = []
    for line in source.read_text(encoding="utf-8").splitlines():
        requirement, separator, url = line.partition(" @ ")
        wheel = TORCH_WHEELS.get(requirement.strip().lower()) if separator else None
        if wheel is None:
            staged.append(line)
            continue
        expected_fragment = "#sha256=" + wheel["sha256"]
        if url != wheel["url"] + expected_fragment:
            raise SetupError(f"Pinned {requirement} source URL/hash differs from the approved wheel.")
        cached = wheel_cache / wheel["filename"]
        if cached.exists():
            actual = sha256_file(cached)
            if actual != wheel["sha256"]:
                raise SetupError(f"Cached {requirement} wheel SHA256 mismatch; preserving file: {cached}")
            staged.append(f"{requirement} @ {cached.resolve().as_uri()}{expected_fragment}")
        else:
            staged.append(line)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("\n".join(staged) + "\n", encoding="utf-8")
    return destination


def plan(root: Path, engine: str) -> dict:
    spec = ENGINES[engine]
    runtime, source, _receipt = runtime_layout(root, engine)
    drive = shutil.disk_usage(root)
    return {"engine": engine, "runtime": runtime.relative_to(root).as_posix(),
            "source": source.relative_to(root).as_posix(), "sourceRevision": spec["revision"],
            "files": ["official CPython embeddable zip (SHA256 verified)", "scripts/" + spec["requirements"],
                      ".runtime/python/.downloads/wheels/<official hashed Torch wheel>",
                      "private staged requirements file", ".pro4bro-expressive-managed.json",
                      "python311._pth", ".pro4bro-expressive-runtime.json"],
            "commands": ["download and verify CPython 3.11.9", "install pip into the private runtime target",
                         "install SHA256-pinned Torch wheels from local cache when available, or their official URLs",
                         "pip install --target " + runtime.relative_to(root).as_posix() + "/site-packages -r scripts/" + spec["requirements"],
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
    # Pip is invoked from a caller-supplied development Python but writes only into this runtime.
    pip_env = os.environ.copy()
    for key in ("PIP_TARGET", "PIP_USER", "PIP_PREFIX", "PIP_ROOT", "PIP_REQUIRE_VIRTUALENV"):
        pip_env.pop(key, None)
    pip_env["PIP_CONFIG_FILE"] = os.devnull
    run([str(bootstrap), "-m", "pip", "--disable-pip-version-check", "install", "--target", str(site),
         "--upgrade", "pip"], env=pip_env)
    requirements = root / "scripts" / spec["requirements"]
    requirements_hash = sha256_file(requirements)
    staged_requirements = stage_requirements(
        requirements, runtime / f".requirements-{spec['runtime']}.txt", cache / "wheels")
    run([str(bootstrap), "-m", "pip", "--disable-pip-version-check", "install", "--target", str(site),
         "--upgrade", "-r", str(staged_requirements)], env=pip_env)
    probe = root / "services" / "api" / "app" / "workers" / "expressive_import_probe.py"
    run([str(python), str(probe), spec["runtime"], str(source)])
    # A success receipt is written only after the exact product probe succeeds.
    receipt = success_receipt(engine, spec, source, requirements, site)
    if receipt["requirementsSha256"] != requirements_hash:
        raise SetupError("Expressive runtime requirements changed during installation; refusing a ready receipt.")
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
