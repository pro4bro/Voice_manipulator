"""Download the pinned, inference-only MuseTalk and OpenCV components.

Uses the existing resumable/hash-verifying downloader. No upstream checkout is
modified; weights live in the host runtime, never inside a portable Project.
"""
import importlib.util
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SPECS = json.loads((ROOT / "services/api/app/resources/lipsync-models.json").read_text(encoding="utf-8"))


def main():
    spec = importlib.util.spec_from_file_location("open_engines", ROOT / "scripts/provision-open-engines.py")
    downloader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(downloader)
    for key, component in SPECS.items():
        repo, revision, names = component["repo"], component["revision"], component["files"]
        model_root = ROOT / ".runtime/lipsync-models" / key
        downloader.MODELS[key] = {"repo": repo, "revision": revision, "path": model_root, "omit": set()}
        metadata = {item["path"]: item for item in downloader.list_model_files(key)}
        if not set(names) <= metadata.keys():
            raise RuntimeError(f"Pinned tree missing required files: {key}")
        for name, expected in names.items():
            kind, digest = downloader._expected_hash(metadata[name])
            if f"{kind}:{digest}" != expected["hash"] or metadata[name]["size"] != expected["size"]:
                raise RuntimeError(f"Pinned tree/hash changed: {key}/{name}")
        model_root.mkdir(parents=True, exist_ok=True)
        (model_root / downloader.MODEL_RECEIPT_NAME).unlink(missing_ok=True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda name: downloader._download_and_verify(metadata[name], PurePosixPath(name), model_root, key), names))
        downloader._write_model_receipt(key, model_root, results)
        print(f"Ready: {key}", flush=True)


if __name__ == "__main__":
    main()
