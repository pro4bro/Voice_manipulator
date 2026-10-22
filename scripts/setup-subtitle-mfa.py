"""Provision the private Windows CPU runtime and licensed MFA alignment assets."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile


MICROMAMBA_VERSION = "2.9.0-0"
MICROMAMBA_SHA256 = "a6d804394b2418991c4e29562853eaace2f2ce9d9da661a98e74e02e8dbb44b0"
MICROMAMBA_URL = (
    "https://github.com/mamba-org/micromamba-releases/releases/download/"
    f"{MICROMAMBA_VERSION}/micromamba-win-64"
)
MFA_VERSION = "3.4.3"
PYTHON_SPEC = "3.11"
FFMPEG_VERSION = "7.1.1"
FFMPEG_BUILD = "lgpl_h468c918_611"
PYTORCH_CPU_VERSION = "2.14.1"
KALDI_VERSION = "5.5.1172"
RUNTIME_SCHEMA = 1
MARKER = ".pro4bro-subtitle-mfa-managed.json"

# Exact, versioned release assets published by MontrealCorpusTools/mfa-models.
# Digests are recorded in the manifest after verified downloads; the source
# release URLs are immutable tags, never a mutable latest alias.
MODELS = {
    "vi": {
        "modelId": "vietnamese_mfa",
        "version": "3.0.0",
        "license": "CC-BY-4.0",
        "acousticBytes": 61700659,
        "dictionaryBytes": 138575,
        "acousticUrl": "https://github.com/MontrealCorpusTools/mfa-models/releases/download/acoustic-vietnamese_mfa-v3.0.0/vietnamese_mfa.zip",
        "dictionaryUrl": "https://github.com/MontrealCorpusTools/mfa-models/releases/download/dictionary-vietnamese_mfa-v3.0.0/vietnamese_mfa.dict",
        "modelCard": "https://mfa-models.readthedocs.io/en/latest/acoustic/Vietnamese/Vietnamese%20MFA%20acoustic%20model%20v3_0_0.html",
        "dictionaryCard": "https://mfa-models.readthedocs.io/en/latest/dictionary/Vietnamese/Vietnamese%20MFA%20dictionary%20v3_0_0.html",
    },
    "en": {
        "modelId": "english_mfa",
        "version": "3.0.0",
        "license": "CC-BY-4.0",
        "acousticBytes": 92175348,
        "dictionaryBytes": 7862165,
        "acousticUrl": "https://github.com/MontrealCorpusTools/mfa-models/releases/download/acoustic-english_mfa-v3.0.0/english_mfa.zip",
        "dictionaryUrl": "https://github.com/MontrealCorpusTools/mfa-models/releases/download/dictionary-english_mfa-v3.0.0/english_mfa.dict",
        "modelCard": "https://mfa-models.readthedocs.io/en/latest/acoustic/English/English%20MFA%20acoustic%20model%20v3_0_0.html",
        "dictionaryCard": "https://mfa-models.readthedocs.io/en/latest/dictionary/English/English%20MFA%20dictionary%20v3_0_0.html",
    },
}


class SetupError(RuntimeError):
    pass


def root_from_script(script: Path) -> Path:
    return script.resolve().parent.parent


def runtime_layout(root: Path) -> tuple[Path, Path, Path]:
    alignment_root = root / ".runtime" / "subtitle-alignment"
    runtime = alignment_root / "mfa"
    return runtime, alignment_root / "tools" / "micromamba.exe", runtime / "manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def conda_package_records(runtime: Path) -> dict[str, list[dict]]:
    records: dict[str, list[dict]] = {}
    metadata_dir = runtime / "conda-meta"
    if not metadata_dir.is_dir():
        raise SetupError(f"Conda package records are missing: {metadata_dir}")
    for record_path in metadata_dir.glob("*.json"):
        try:
            record = json.loads(record_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise SetupError(f"Unreadable Conda package record: {record_path.name}") from exc
        if not isinstance(record, dict) or not isinstance(record.get("name"), str):
            raise SetupError(f"Malformed Conda package record: {record_path.name}")
        records.setdefault(record["name"], []).append(record)
    return records


def validate_conda_profile(runtime: Path) -> dict[str, dict]:
    """Verify the actual installed package records match the supported CPU profile."""
    records = conda_package_records(runtime)
    requirements = {
        "montreal-forced-aligner": (MFA_VERSION, None),
        "pytorch-cpu": (PYTORCH_CPU_VERSION, None),
        "kaldi": (KALDI_VERSION, "cpu"),
        "ffmpeg": (FFMPEG_VERSION, FFMPEG_BUILD),
    }
    selected = {}
    for name, (expected_version, expected_build) in requirements.items():
        matches = records.get(name, [])
        if len(matches) != 1:
            raise SetupError(f"Expected exactly one installed {name} Conda package record")
        record = matches[0]
        version = record.get("version")
        build = record.get("build")
        if version != expected_version:
            raise SetupError(f"Unsupported {name} version: expected {expected_version}, got {version}")
        if expected_build == "cpu":
            if not isinstance(build, str) or not build.startswith("cpu") or "cuda" in build.casefold():
                raise SetupError(f"MFA requires CPU Kaldi build; got {build}")
        elif expected_build is not None and build != expected_build:
            raise SetupError(f"Unsupported {name} build: expected {expected_build}, got {build}")
        selected[name] = record

    ffmpeg_license = selected["ffmpeg"].get("license")
    if ffmpeg_license != "LGPL-2.1-or-later":
        raise SetupError(f"MFA requires LGPL FFmpeg package; got license {ffmpeg_license}")
    return selected


def package_license(profile: dict[str, dict], package_name: str) -> str | None:
    """Read license from the validated installed Conda package record."""
    record = profile.get(package_name)
    value = record.get("license") if record else None
    return value.strip() if isinstance(value, str) and value.strip() else None


def runtime_file_hashes(runtime: Path) -> dict[str, str]:
    relative_files = [
        "python.exe",
        "Scripts/mfa.exe",
        "Lib/site-packages/montreal_forced_aligner/__init__.py",
        "Lib/site-packages/montreal_forced_aligner/command_line/align.py",
        "Lib/site-packages/kalpy/__init__.py",
    ]
    result = {}
    for relative in relative_files:
        path = runtime / Path(relative)
        if not path.is_file():
            raise SetupError(f"MFA runtime is missing a required identity file: {relative}")
        result[relative.replace("\\", "/")] = sha256_file(path)
    for pattern in ("montreal_forced_aligner-*.dist-info/METADATA",
                    "kalpy_kaldi-*.dist-info/METADATA"):
        matches = sorted((runtime / "Lib" / "site-packages").glob(pattern))
        if len(matches) != 1:
            raise SetupError(f"Expected one installed package metadata file for {pattern}")
        relative = matches[0].relative_to(runtime).as_posix()
        result[relative] = sha256_file(matches[0])
    kalpy_extensions = sorted((runtime / "Lib" / "site-packages").glob("_kalpy*.pyd"))
    if len(kalpy_extensions) != 1:
        raise SetupError("Expected one installed Kalpy native extension")
    relative = kalpy_extensions[0].relative_to(runtime).as_posix()
    result[relative] = sha256_file(kalpy_extensions[0])
    return result


def verify_model_file(path: Path, expected_bytes: int, *, zip_archive: bool) -> str:
    if path.stat().st_size != expected_bytes:
        raise SetupError(f"Unexpected model asset length for {path.name}: expected {expected_bytes} bytes")
    if zip_archive:
        try:
            with zipfile.ZipFile(path) as archive:
                invalid_member = archive.testzip()
        except (OSError, zipfile.BadZipFile) as exc:
            raise SetupError(f"Invalid MFA model ZIP: {path.name}") from exc
        if invalid_member is not None:
            raise SetupError(f"Corrupt MFA model ZIP member: {invalid_member}")
    return sha256_file(path)


def download(url: str, destination: Path, expected_sha256: str | None = None,
             expected_bytes: int | None = None, zip_archive: bool = False) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    request = urllib.request.Request(url, headers={"User-Agent": "Pro4Bro-Subtitle-MFA-Setup"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        if expected_bytes is not None and temporary.stat().st_size != expected_bytes:
            raise SetupError(f"Unexpected download length for {destination.name}: expected {expected_bytes} bytes")
        if zip_archive:
            with zipfile.ZipFile(temporary) as archive:
                invalid_member = archive.testzip()
            if invalid_member is not None:
                raise SetupError(f"Corrupt downloaded ZIP member: {invalid_member}")
        digest = sha256_file(temporary)
        if expected_sha256 and digest.lower() != expected_sha256.lower():
            raise SetupError(f"SHA-256 mismatch for downloaded asset: {url}")
        temporary.replace(destination)
        return digest
    finally:
        temporary.unlink(missing_ok=True)


def run(command: list[str], *, env: dict[str, str], capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(command, env=env, check=True, capture_output=capture, text=True)


def inspect_owned_runtime(runtime: Path) -> None:
    if not runtime.exists() or not any(runtime.iterdir()):
        return
    marker = runtime.parent / MARKER
    if not marker.is_file():
        # Successful installs remove the bootstrap marker only after writing
        # their completed manifest. Accept that durable receipt on reruns, but
        # never infer ownership from a Conda prefix alone.
        manifest_path = runtime / "manifest.json"
        if not manifest_path.is_file():
            raise SetupError(f"Existing unowned MFA runtime is preserved: {runtime}")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if (manifest.get("schema") != RUNTIME_SCHEMA or manifest.get("engine") != "mfa"
                    or manifest.get("platform") != "win-64"):
                raise ValueError("incompatible manifest")
            for language, spec in MODELS.items():
                record = manifest.get("models", {}).get(language, {})
                model_dir = runtime / "models" / language
                for key, filename in (("acousticSha256", "acoustic.zip"),
                                      ("dictionarySha256", "dictionary.dict")):
                    asset = model_dir / filename
                    if not asset.is_file() or sha256_file(asset) != record.get(key):
                        raise ValueError(f"missing or changed model asset: {asset}")
        except (OSError, ValueError, AttributeError) as exc:
            raise SetupError(f"Existing MFA runtime has no valid ownership receipt: {runtime}") from exc
        return
    try:
        ownership = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SetupError(f"Existing MFA ownership marker is unreadable: {marker}") from exc
    if ownership.get("schema") != RUNTIME_SCHEMA or ownership.get("engine") != "mfa":
        raise SetupError(f"Existing MFA ownership marker is incompatible: {marker}")


def recover_initial_prefix_failure(runtime: Path, micromamba: Path) -> None:
    """Move only the bootstrap files from our failed first prefix attempt."""
    old_marker = runtime / MARKER
    old_binary = runtime / "tools" / "micromamba.exe"
    if not old_marker.exists():
        return
    try:
        ownership = json.loads(old_marker.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SetupError(f"Unexpected file in MFA environment prefix; preserving it: {old_marker}") from exc
    expected_files = {old_marker.resolve(), old_binary.resolve()}
    existing_files = {path.resolve() for path in runtime.rglob("*") if path.is_file()}
    if (ownership != {"schema": RUNTIME_SCHEMA, "engine": "mfa"} or existing_files != expected_files
            or not old_binary.is_file() or sha256_file(old_binary) != MICROMAMBA_SHA256):
        raise SetupError(f"Refusing to move unexpected files from MFA environment prefix: {runtime}")
    micromamba.parent.mkdir(parents=True, exist_ok=True)
    old_binary.replace(micromamba)
    old_marker.unlink()
    (runtime / "tools").rmdir()
    runtime.rmdir()


def setup(root: Path) -> dict:
    if os.name != "nt":
        raise SetupError("The isolated MFA provisioner currently supports Windows x64 only")
    runtime, micromamba, manifest_path = runtime_layout(root)
    recover_initial_prefix_failure(runtime, micromamba)
    inspect_owned_runtime(runtime)
    has_runtime_entrypoints = ((runtime / "python.exe").is_file()
                               and (runtime / "Scripts" / "mfa.exe").is_file())
    if has_runtime_entrypoints:
        # Read-only profile check happens before writing markers, lock files, or
        # models so an unsupported existing prefix is preserved untouched.
        validate_conda_profile(runtime)
    runtime.mkdir(parents=True, exist_ok=True)
    marker_path = runtime.parent / MARKER
    marker_path.write_text(json.dumps({"schema": RUNTIME_SCHEMA, "engine": "mfa"}, indent=2), encoding="utf-8")
    micromamba.parent.mkdir(parents=True, exist_ok=True)
    if not micromamba.is_file() or sha256_file(micromamba) != MICROMAMBA_SHA256:
        download(MICROMAMBA_URL, micromamba, MICROMAMBA_SHA256)

    env = os.environ.copy()
    env["MAMBA_ROOT_PREFIX"] = str(runtime.parent / "mfa-mamba-root")
    env["CONDA_PREFIX"] = str(runtime)
    env["PATH"] = os.pathsep.join((str(runtime / "Library" / "bin"),
                                   str(runtime / "Scripts"), str(runtime), env.get("PATH", "")))
    explicit_lock = runtime / "conda-win-64-explicit.txt"
    if has_runtime_entrypoints:
        pass
    elif explicit_lock.is_file():
        run([str(micromamba), "create", "--yes", "--prefix", str(runtime), "--file", str(explicit_lock)], env=env)
    else:
        run([str(micromamba), "create", "--yes", "--prefix", str(runtime), "--channel", "conda-forge",
             f"python={PYTHON_SPEC}", f"montreal-forced-aligner={MFA_VERSION}",
             f"ffmpeg={FFMPEG_VERSION}={FFMPEG_BUILD}",
             f"pytorch-cpu={PYTORCH_CPU_VERSION}", f"kaldi={KALDI_VERSION}=cpu*"], env=env)

    mfa = runtime / "Scripts" / "mfa.exe"
    python = runtime / "python.exe"
    ffmpeg = runtime / "Library" / "bin" / "ffmpeg.exe"
    for required in (mfa, python, ffmpeg):
        if not required.is_file():
            raise SetupError(f"MFA environment is incomplete: missing {required}")
    profile = validate_conda_profile(runtime)
    version_result = run([str(mfa), "version"], env=env, capture=True)
    mfa_version = version_result.stdout.strip().splitlines()[-1]
    if MFA_VERSION not in mfa_version:
        raise SetupError(f"Unexpected MFA version: expected {MFA_VERSION}, got {mfa_version}")

    models_record = {}
    for language, spec in MODELS.items():
        model_dir = runtime / "models" / language
        acoustic = model_dir / "acoustic.zip"
        dictionary = model_dir / "dictionary.dict"
        acoustic_hash = (download(spec["acousticUrl"], acoustic, expected_bytes=spec["acousticBytes"], zip_archive=True)
                         if not acoustic.is_file() else verify_model_file(acoustic, spec["acousticBytes"], zip_archive=True))
        dictionary_hash = (download(spec["dictionaryUrl"], dictionary, expected_bytes=spec["dictionaryBytes"])
                           if not dictionary.is_file() else verify_model_file(dictionary, spec["dictionaryBytes"], zip_archive=False))
        # Installed files must remain stable across retries. Their first
        # verified receipt becomes the local expected digest.
        receipt_path = model_dir / "checksums.json"
        current = {"acousticSha256": acoustic_hash, "dictionarySha256": dictionary_hash}
        if receipt_path.is_file():
            expected = json.loads(receipt_path.read_text(encoding="utf-8"))
            if expected != current:
                raise SetupError(f"Installed MFA model assets changed unexpectedly: {model_dir}")
        else:
            receipt_path.write_text(json.dumps(current, indent=2), encoding="utf-8")
        models_record[language] = {"modelId": spec["modelId"], "version": spec["version"],
                                   "license": spec["license"], "acousticPath": "acoustic.zip",
                                   "dictionaryPath": "dictionary.dict", **current,
                                   "modelCard": spec["modelCard"], "dictionaryCard": spec["dictionaryCard"]}

    # Save an exact Conda artifact URL lock after a successful solve, so later
    # clean installations reproduce the solved dependency set without solving.
    if not explicit_lock.is_file():
        packages = run([str(micromamba), "list", "--explicit", "--prefix", str(runtime)], env=env, capture=True)
        explicit_lock.write_text(packages.stdout, encoding="utf-8")
    python_version = run([str(python), "--version"], env=env, capture=True).stdout.strip().split()[-1]
    ffmpeg_version = run([str(ffmpeg), "-version"], env=env, capture=True).stdout.splitlines()[0]
    mamba_version = run([str(micromamba), "--version"], env=env, capture=True).stdout.strip()
    manifest = {"schema": RUNTIME_SCHEMA, "engine": "mfa", "platform": "win-64",
                "software": {"mfa": mfa_version, "python": python_version,
                             "ffmpeg": ffmpeg_version, "micromamba": mamba_version,
                             "ffmpegPackageLicense": package_license(profile, "ffmpeg"),
                             "pytorchCpu": PYTORCH_CPU_VERSION,
                             "pytorchCpuPackageLicense": package_license(profile, "pytorch-cpu"),
                             "kaldi": KALDI_VERSION,
                             "condaLockSha256": sha256_file(explicit_lock)},
                "models": models_record,
                "runtimeFiles": runtime_file_hashes(runtime)}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    marker_path.unlink(missing_ok=True)
    return manifest


def plan(root: Path) -> dict:
    runtime, micromamba, manifest = runtime_layout(root)
    return {"runtimeRoot": str(runtime), "python": str(runtime / "python.exe"),
            "micromamba": str(micromamba), "manifest": str(manifest),
            "micromambaVersion": MICROMAMBA_VERSION, "mfaVersion": MFA_VERSION,
            "pythonSpec": PYTHON_SPEC, "ffmpegVersion": FFMPEG_VERSION, "ffmpegBuild": FFMPEG_BUILD,
            "pytorchCpuVersion": PYTORCH_CPU_VERSION,
            "kaldiVersion": KALDI_VERSION, "kaldiBuild": "cpu",
            "models": {language: {key: value for key, value in spec.items() if key.endswith("Url") or key.endswith("Bytes") or key in {"modelId", "version", "license"}}
                       for language, spec in MODELS.items()}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="print pinned private-root package/assets without installing")
    args = parser.parse_args()
    root = root_from_script(Path(__file__))
    try:
        if args.plan:
            print(json.dumps(plan(root), indent=2))
        else:
            result = setup(root)
            print(json.dumps({"status": "ready", "manifest": result}, ensure_ascii=False, indent=2))
    except (SetupError, OSError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
