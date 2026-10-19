#!/usr/bin/env python3
"""Provision selected open-engine checkouts and pinned Hugging Face models."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parent.parent
RECEIPT_PATH = ROOT / ".runtime" / "open-engines-install.json"
HF_BASE = "https://huggingface.co"
TREE_PAGE_LIMIT = 50
_RECEIPT_THREAD_LOCK = threading.Lock()
MODEL_RECEIPT_NAME = ".pro4bro-model-receipt.json"

MODELS = {
    "cosyvoice": {
        "repo": "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
        "revision": "29e01c4e8d000f4bcd70751be16fa94bf3d85a18",
        "path": Path(".runtime/engines/research/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B"),
        "omit": {"asset/", "llm.rl.pt", "flow.decoder.estimator.fp32.onnx", "speech_tokenizer_v3.batch.onnx"},
    },
    "vibevoice-streaming": {
        "repo": "microsoft/VibeVoice-ASR-Streaming-7B",
        "revision": "60d858b518b4e19d404af3737f848fc185b30177",
        "path": Path(".runtime/engines/vibevoice/VibeVoice_models/microsoft/VibeVoice-ASR-Streaming-7B"),
        "omit": {"figures/"},
    },
}

REPOSITORIES = (
    {"name": "CosyVoice", "url": "https://github.com/QwenAudio/CosyVoice.git", "path": ".runtime/engines/research/CosyVoice", "submodules": True},
    {"name": "sokuji", "url": "https://github.com/kizuna-ai-lab/sokuji.git", "path": ".runtime/engines/research/sokuji", "submodules": False},
    {"name": "w-okada-voice-changer", "url": "https://github.com/w-okada/voice-changer.git", "path": ".runtime/engines/research/w-okada-voice-changer", "submodules": False},
    {"name": "VibeVoice-streaming", "url": "https://github.com/microsoft/VibeVoice.git", "path": ".runtime/engines/vibevoice/VibeVoice-streaming", "submodules": False},
    {"name": "Applio", "url": "https://github.com/IAHispano/Applio", "path": ".runtime/engines/research/Applio", "submodules": False, "reuse_only": True},
)

class ProvisionError(RuntimeError):
    """A repository or model could not be safely verified/provisioned."""


def _run_git(args: list[str], *, cwd: Path | None = None) -> str:
    try:
        result = subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = getattr(exc, "stderr", None) or str(exc)
        raise ProvisionError(f"Command failed: {' '.join(args)}: {detail.strip()}") from exc
    return result.stdout.strip()


def _inside_root(relative_path: str | Path, *, root: Path | None = None) -> Path:
    base = _without_windows_extended_prefix((root or ROOT).resolve())
    candidate = base.joinpath(relative_path)
    resolved = _without_windows_extended_prefix(candidate.resolve())
    if not resolved.is_relative_to(base):
        raise ProvisionError(f"Path escapes repository root: {relative_path}")
    return resolved


def _without_windows_extended_prefix(path: Path) -> Path:
    """Normalize Win32 long-path prefixes returned for not-yet-created children."""
    value = str(path)
    if value.startswith("\\\\?\\UNC\\"):
        return Path("\\\\" + value[8:])
    if value.startswith("\\\\?\\"):
        return Path(value[4:])
    return path


def provision_repository(repo: dict[str, Any], *, root: Path | None = None) -> dict[str, Any]:
    destination = _inside_root(repo["path"], root=root)
    if destination.exists():
        if not (destination / ".git").exists():
            if repo.get("reuse_only"):
                return _describe_packaged_snapshot(repo, destination)
            raise ProvisionError(f"Existing path is not a Git checkout: {destination}")
    else:
        if repo.get("reuse_only"):
            raise ProvisionError(f"Required reusable checkout is missing: {destination}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        command = ["git", "clone", "--depth", "1"]
        if repo.get("submodules"):
            command.append("--recurse-submodules")
        command.extend([repo["url"], str(destination)])
        try:
            _run_git(command)
        except ProvisionError as exc:
            raise ProvisionError(
                f"Clone failed for {repo['name']}; inspect any partial checkout at {destination}: {exc}"
            ) from exc

    origin = _run_git(["git", "-C", str(destination), "remote", "get-url", "origin"])
    if _normalize_git_url(origin) != _normalize_git_url(repo["url"]):
        raise ProvisionError(f"Wrong origin for {repo['name']}: expected {repo['url']}, found {origin}")
    revision = _run_git(["git", "-C", str(destination), "rev-parse", "HEAD"])
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", revision):
        raise ProvisionError(f"Git returned an invalid revision for {repo['name']}: {revision!r}")
    if repo.get("submodules"):
        submodules = _run_git(["git", "-C", str(destination), "submodule", "status", "--recursive"])
        if any(line.startswith(("-", "+", "U")) for line in submodules.splitlines()):
            raise ProvisionError(f"Submodules are missing or do not match the checkout revision for {repo['name']}")
    return {"name": repo["name"], "path": repo["path"], "origin": origin, "revision": revision}


def _describe_packaged_snapshot(repo: dict[str, Any], destination: Path) -> dict[str, Any]:
    """Describe the known Applio source snapshot without asserting its origin."""
    required = ("rvc/realtime/core.py", "rvc/train/train.py", "LICENSE")
    files: list[dict[str, str]] = []
    for relative in required:
        path = destination.joinpath(*PurePosixPath(relative).parts)
        resolved = path.resolve()
        if not resolved.is_relative_to(destination.resolve()) or not resolved.is_file():
            raise ProvisionError(f"Packaged {repo['name']} snapshot is missing required file: {relative}")
        files.append({"path": relative, "hash": "sha256:" + _file_sha256(resolved)})
    return {
        "name": repo["name"],
        "path": repo["path"],
        "revision": "snapshot-unverified",
        "originVerified": False,
        "files": files,
    }


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_git_url(url: str) -> str:
    return url.removesuffix(".git").rstrip("/").lower()


def _request(url: str, *, headers: dict[str, str] | None = None) -> Any:
    request_headers = {"User-Agent": "PRO4BRO-open-engine-provisioner/1"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, headers=request_headers)
    try:
        return urllib.request.urlopen(request, timeout=60)
    except (OSError, urllib.error.URLError) as exc:
        raise ProvisionError(f"Request failed for {url}: {exc}") from exc


def _read_json_url(url: str) -> tuple[Any, str | None]:
    with _request(url) as response:
        try:
            body = response.read()
            return json.loads(body.decode("utf-8")), response.headers.get("Link")
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ProvisionError(f"Invalid JSON response from {url}") from exc


def list_model_files(model_id: str) -> list[dict[str, Any]]:
    model = MODELS[model_id]
    url = f"{HF_BASE}/api/models/{model['repo']}/tree/{model['revision']}?recursive=true&expand=true&limit={TREE_PAGE_LIMIT}"
    files: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    while url:
        if url in seen_urls:
            raise ProvisionError("Hugging Face returned a repeated pagination link")
        seen_urls.add(url)
        page, link = _read_json_url(url)
        if not isinstance(page, list):
            raise ProvisionError("Unexpected Hugging Face tree response")
        files.extend(item for item in page if isinstance(item, dict) and item.get("type") == "file")
        url = _next_link(link)
    return files


def _next_link(link_header: str | None) -> str | None:
    if not link_header:
        return None
    for part in link_header.split(","):
        match = re.match(r'\s*<([^>]+)>\s*;\s*rel="?next"?', part)
        if match:
            return urllib.parse.urljoin(HF_BASE, match.group(1))
    return None


def _safe_model_relative_path(value: str) -> PurePosixPath:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ProvisionError(f"Unsafe model path: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts) or re.match(r"^[A-Za-z]:", value):
        raise ProvisionError(f"Unsafe model path: {value!r}")
    return path


def _should_download(relative: PurePosixPath, model_id: str) -> bool:
    path = relative.as_posix()
    name = relative.name
    omitted = MODELS[model_id]["omit"]
    if any(path.startswith(item) for item in omitted if item.endswith("/")):
        return False
    if name in omitted:
        return False
    if name.lower() == "readme.md" or name == ".gitattributes":
        return False
    return True


def _expected_hash(metadata: dict[str, Any]) -> tuple[str, str]:
    lfs = metadata.get("lfs") or {}
    lfs_oid = lfs.get("oid") or lfs.get("sha256")
    if isinstance(lfs_oid, str):
        digest = lfs_oid.removeprefix("sha256:")
        if re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            return "sha256", digest.lower()
    blob = metadata.get("blobId") or metadata.get("oid")
    if isinstance(blob, str) and re.fullmatch(r"[0-9a-fA-F]{40}", blob):
        return "git-sha1", blob.lower()
    raise ProvisionError(f"Hugging Face did not provide a verifiable hash for {metadata.get('path')!r}")


def hash_bytes(data: bytes, kind: str) -> str:
    if kind == "sha256":
        return hashlib.sha256(data).hexdigest()
    if kind == "git-sha1":
        return hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()
    raise ValueError(f"Unknown hash kind: {kind}")


def _file_matches(path: Path, kind: str, expected: str) -> bool:
    digest = hashlib.sha256() if kind == "sha256" else None
    if kind not in ("sha256", "git-sha1"):
        return False
    sha1 = hashlib.sha1() if kind == "git-sha1" else None
    size = path.stat().st_size
    if sha1:
        sha1.update(f"blob {size}\0".encode("ascii"))
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            (digest or sha1).update(chunk)
    return (digest or sha1).hexdigest() == expected


def _download_and_verify(metadata: dict[str, Any], relative: PurePosixPath, model_root: Path, model_id: str) -> dict[str, str]:
    kind, expected = _expected_hash(metadata)
    expected_size = metadata.get("size")
    try:
        expected_size = int(expected_size) if expected_size is not None else None
    except (TypeError, ValueError):
        expected_size = None
    label = relative.as_posix()
    destination = model_root.joinpath(*relative.parts).resolve()
    # Also require the fully resolved file to stay under this specific model root.
    resolved_model_root = model_root.resolve()
    if not destination.is_relative_to(resolved_model_root):
        raise ProvisionError(f"Model path escapes target directory: {relative.as_posix()}")
    if destination.is_file() and _file_matches(destination, kind, expected):
        print(f"Reused verified {label} ({destination.stat().st_size:,} bytes)", flush=True)
        return {"path": relative.as_posix(), "hash": f"{kind}:{expected}", "status": "reused"}

    destination.parent.mkdir(parents=True, exist_ok=True)
    quoted = urllib.parse.quote(relative.as_posix(), safe="/")
    model = MODELS[model_id]
    url = f"{HF_BASE}/{model['repo']}/resolve/{model['revision']}/{quoted}?download=true"
    partial = destination.with_name(destination.name + ".part")
    partial_metadata = partial.with_name(partial.name + ".json")
    identity = {"url": url, "hash": f"{kind}:{expected}", "size": expected_size}
    size_text = f"{expected_size:,} bytes" if expected_size is not None else "unknown size"
    print(f"Downloading {label} ({size_text})", flush=True)
    started = last_report = time.monotonic()
    downloaded = 0
    resume_at = 0
    if partial.is_file() and partial_metadata.is_file():
        try:
            previous = json.loads(partial_metadata.read_text(encoding="utf-8"))
            if previous == identity:
                resume_at = partial.stat().st_size
        except (OSError, json.JSONDecodeError):
            pass
    if expected_size is not None and resume_at >= expected_size:
        # A complete-sized partial is not trusted until its final digest is checked.
        if _file_matches(partial, kind, expected):
            partial.replace(destination)
            partial_metadata.unlink(missing_ok=True)
            print(f"Verified {label} ({expected_size:,} bytes; {kind})", flush=True)
            return {"path": relative.as_posix(), "hash": f"{kind}:{expected}", "status": "downloaded"}
        partial.unlink(missing_ok=True)
        partial_metadata.unlink(missing_ok=True)
        resume_at = 0
    elif resume_at == 0:
        # Unknown or stale provenance must never be appended to a new pinned download.
        partial.unlink(missing_ok=True)
        partial_metadata.unlink(missing_ok=True)
    partial_metadata.write_text(json.dumps(identity, sort_keys=True), encoding="utf-8")
    try:
        headers = {"Range": f"bytes={resume_at}-"} if resume_at else None
        response = _request(url, headers=headers)
        if resume_at:
            content_range = response.headers.get("Content-Range", "")
            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+|\*)", content_range.strip(), re.IGNORECASE)
            valid_range = bool(match)
            if match:
                range_start, range_end = int(match.group(1)), int(match.group(2))
                range_total = None if match.group(3) == "*" else int(match.group(3))
                valid_range = (
                    range_start == resume_at
                    and range_end >= range_start
                    and (expected_size is None or range_total == expected_size and range_end == expected_size - 1)
                )
            if not valid_range:
                close = getattr(response, "close", None)
                if close:
                    close()
                resume_at = 0
                downloaded = 0
                response = _request(url)
        with response, partial.open("ab" if resume_at else "wb") as output:
            downloaded = resume_at
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                downloaded += len(chunk)
                now = time.monotonic()
                if now - last_report >= 5:
                    _print_download_progress(label, downloaded, expected_size, now - started)
                    last_report = now
            output.flush()
            os.fsync(output.fileno())
        elapsed = max(time.monotonic() - started, 0.001)
        _print_download_progress(label, downloaded, expected_size, elapsed, complete=True)
        received_size = partial.stat().st_size
        if expected_size is not None and received_size < expected_size:
            # An early EOF is resumable when the pinned URL/hash/size sidecar
            # remains intact. Do not mistake a transport interruption for a
            # corrupt completed model file.
            raise ProvisionError(
                f"Downloaded file was truncated: {relative.as_posix()} received {received_size} of {expected_size} bytes; partial preserved for resume"
            )
        if expected_size is not None and received_size > expected_size:
            partial.unlink(missing_ok=True)
            partial_metadata.unlink(missing_ok=True)
            raise ProvisionError(
                f"Downloaded file exceeded expected size: {relative.as_posix()} received {received_size} of {expected_size} bytes"
            )
        if not _file_matches(partial, kind, expected):
            partial.unlink(missing_ok=True)
            partial_metadata.unlink(missing_ok=True)
            raise ProvisionError(f"Downloaded file failed {kind} verification: {relative.as_posix()}")
        partial.replace(destination)
        partial_metadata.unlink(missing_ok=True)
        print(f"Verified {label} ({downloaded:,} bytes; {kind})", flush=True)
    except ProvisionError:
        raise
    except Exception:
        # Preserve the verified-identity partial after transient network or I/O failures.
        raise
    return {"path": relative.as_posix(), "hash": f"{kind}:{expected}", "status": "downloaded"}


def _print_download_progress(label: str, downloaded: int, expected_size: int | None, elapsed: float, *, complete: bool = False) -> None:
    rate = downloaded / max(elapsed, 0.001)
    size = f"{downloaded:,} bytes"
    if expected_size is not None and expected_size > 0:
        percent = downloaded * 100 / expected_size
        progress = f"{size} / {expected_size:,} bytes ({percent:.1f}%)"
    else:
        progress = size
    state = "Received" if complete else "Progress"
    print(f"{state} {label}: {progress}; {rate / (1024 * 1024):.2f} MiB/s", flush=True)


def provision_model(model_id: str, *, root: Path | None = None, download_workers: int = 3) -> list[dict[str, str]]:
    if model_id not in MODELS:
        raise ProvisionError(f"Unknown model selection: {model_id}")
    if not 1 <= download_workers <= 8:
        raise ProvisionError("Model download workers must be between 1 and 8")
    root = (root or ROOT).resolve()
    model = MODELS[model_id]
    model_root = _inside_root(model["path"], root=root)
    metadata_files = list_model_files(model_id)
    eligible: list[tuple[dict[str, Any], PurePosixPath]] = []
    seen_paths: set[str] = set()
    for item in metadata_files:
        relative = _safe_model_relative_path(item.get("path"))
        if _should_download(relative, model_id):
            normalized = relative.as_posix()
            if normalized in seen_paths:
                raise ProvisionError(f"Hugging Face tree listed a duplicate model path: {normalized}")
            seen_paths.add(normalized)
            eligible.append((item, relative))
    if not eligible:
        raise ProvisionError(f"Hugging Face model tree contained no eligible files for {model_id}")

    # A previous receipt must not keep an in-place update looking ready while
    # any of its pinned files are being replaced.
    model_root.mkdir(parents=True, exist_ok=True)
    (model_root / MODEL_RECEIPT_NAME).unlink(missing_ok=True)

    def download(item: tuple[dict[str, Any], PurePosixPath]) -> dict[str, str]:
        metadata, relative = item
        return _download_and_verify(metadata, relative, model_root, model_id)

    # executor.map bounds network work and returns results in metadata order.
    with ThreadPoolExecutor(max_workers=download_workers) as pool:
        results = list(pool.map(download, eligible))
    _write_model_receipt(model_id, model_root, results)
    return results


def _write_model_receipt(model_id: str, model_root: Path, verified_files: list[dict[str, str]]) -> None:
    """Record pinned hashes and cheap file stats only after every download verifies."""
    model = MODELS[model_id]
    # The caller supplies only the results from this pinned model's complete
    # eligible file list. Each result is emitted by _download_and_verify.
    if not verified_files:
        raise ProvisionError(f"Cannot receipt an empty model download: {model_id}")
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for result in verified_files:
        relative = _safe_model_relative_path(result.get("path", ""))
        name = relative.as_posix()
        if name in seen:
            raise ProvisionError(f"Duplicate verified model path: {name}")
        seen.add(name)
        digest = result.get("hash", "")
        if not re.fullmatch(r"(?:sha256:[0-9a-f]{64}|git-sha1:[0-9a-f]{40})", digest):
            raise ProvisionError(f"Missing verified hash for model file: {name}")
        file_path = model_root.joinpath(*relative.parts).resolve()
        if not file_path.is_relative_to(model_root.resolve()) or not file_path.is_file():
            raise ProvisionError(f"Verified model file is missing or outside its model directory: {name}")
        stat = file_path.stat()
        entries.append({"path": name, "hash": digest, "size": stat.st_size, "mtimeNs": stat.st_mtime_ns})
    receipt = {
        "schemaVersion": 1,
        "modelId": model["repo"],
        "revision": model["revision"],
        "files": entries,
    }
    path = model_root / MODEL_RECEIPT_NAME
    temporary = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.part")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as stream:
            json.dump(receipt, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def _receipt_lock(path: Path):
    """Serialize receipt read/merge/write across threads and processes."""
    lock_path = path.with_name(path.name + ".lock")
    with _RECEIPT_THREAD_LOCK, lock_path.open("a+b") as lock_stream:
        lock_stream.seek(0, os.SEEK_END)
        if lock_stream.tell() == 0:
            lock_stream.write(b"0")
            lock_stream.flush()
        lock_stream.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(lock_stream.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                lock_stream.seek(0)
                msvcrt.locking(lock_stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_stream.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_stream.fileno(), fcntl.LOCK_UN)


def _write_receipt(repos: list[dict[str, Any]] | None, model_files: dict[str, list[dict[str, str]]] | None, *, root: Path | None = None) -> None:
    path = _inside_root(".runtime/open-engines-install.json", root=root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _receipt_lock(path):
        _write_receipt_locked(path, repos, model_files)


def _write_receipt_locked(path: Path, repos: list[dict[str, Any]] | None, model_files: dict[str, list[dict[str, str]]] | None) -> None:
    receipt: dict[str, Any] = {"schemaVersion": 1}
    if path.is_file():
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(previous, dict) and previous.get("schemaVersion") == 1:
                receipt.update(previous)
        except (OSError, json.JSONDecodeError):
            pass
    if repos is not None:
        receipt["repositories"] = repos
    if model_files is not None:
        models = receipt.get("models", {})
        if not isinstance(models, dict):
            models = {}
        models.update(model_files)
        receipt["models"] = models
    temporary = path.with_name(path.name + ".part")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as stream:
            json.dump(receipt, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=(*MODELS.keys(), "all"), help="Fetch one pinned model, or all models")
    parser.add_argument("--models", action="store_true", help="Fetch all pinned models as well as repositories")
    parser.add_argument("--repos-only", action="store_true", help="Provision/verify repositories only (default)")
    parser.add_argument("--download-workers", type=int, choices=range(1, 9), default=3, metavar="1..8", help="Maximum parallel file downloads per model (default: 3)")
    args = parser.parse_args(argv)
    if args.repos_only and (args.models or args.model):
        parser.error("--repos-only cannot be combined with model options")

    repo_results = None
    model_results = None
    try:
        if not args.model:
            repo_results = [provision_repository(repo) for repo in REPOSITORIES]
            for repo in repo_results:
                if repo.get("originVerified", True):
                    print(f"repo {repo['name']}: {repo['revision']} ({repo['origin']})")
                else:
                    print(f"repo {repo['name']}: {repo['revision']} (snapshot; origin unverified; {len(repo['files'])} required files hashed)")
        selected_models = list(MODELS) if args.models or args.model == "all" else ([args.model] if args.model else [])
        if selected_models:
            model_results = {}
            for model_id in selected_models:
                model_results[model_id] = provision_model(model_id, download_workers=args.download_workers)
                model = MODELS[model_id]
                print(f"model {model['repo']}@{model['revision']}: verified {len(model_results[model_id])} files")
        _write_receipt(repo_results, model_results)
    except ProvisionError as exc:
        print(f"provisioning failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
