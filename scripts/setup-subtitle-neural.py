"""Install isolated CPU alignment runtimes and pinned, commercially usable weights."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request


PACKAGES = ["stable-ts==2.19.1", "openai-whisper==20250625", "transformers==4.57.6", "nltk==3.9.2",
            "msgspec==0.21.1", "soundfile==0.13.1", "rapidfuzz==3.14.3", "numpy==2.3.5"]
HF_MODELS = {
    "vi": ("dragonSwing/wav2vec2-base-vietnamese", "2d658ec1a90820fee04e9d2edc3cf31ededa4886"),
    "en": ("facebook/wav2vec2-base-960h", "22aad52d435eb6dbaf354bdad9b0da84ce7d6156"),
}
WHISPER_DIGESTS = {
    "tiny": "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9",
    "base": "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e",
    "small": "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794",
    "medium": "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1",
    "large-v3": "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb",
}


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def git_digest(path):
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def download(url, path, expected=None, *, git_blob=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    def matches(candidate):
        return (expected is not None and digest(candidate) == expected
                or git_blob is not None and git_digest(candidate) == git_blob)
    if not expected and not git_blob:
        raise ValueError("A trusted upstream digest is required for model downloads.")
    if path.is_file() and matches(path):
        return digest(path)
    temporary = path.with_suffix(path.suffix + ".download")
    try:
        with urllib.request.urlopen(url, timeout=60) as source, temporary.open("wb") as target:
            while block := source.read(1024 * 1024):
                target.write(block)
        actual = digest(temporary)
        if not matches(temporary):
            raise ValueError(f"Model checksum mismatch: {path.name}")
        temporary.replace(path)
        return actual
    finally:
        temporary.unlink(missing_ok=True)


def setup(root, *, models_only=False, stable_models=("tiny", "base")):
    runtime = root / ".runtime/subtitle-alignment"
    environment = runtime / "neural"
    python = environment / "Scripts/python.exe"
    marker = runtime / ".neural-managed.json"
    if os.name != "nt" or sys.version_info[:2] != (3, 11):
        raise ValueError("Use Windows x64 Python 3.11 for the private alignment runtime.")
    if environment.exists() and any(environment.iterdir()) and not marker.is_file():
        raise ValueError("Existing unowned neural environment is preserved.")
    if marker.is_file() and json.loads(marker.read_text(encoding="utf-8-sig")) != {"schema": 1, "engine": "subtitle-neural"}:
        raise ValueError("Unrecognized neural runtime ownership marker; environment preserved.")
    runtime.mkdir(parents=True, exist_ok=True)
    marker.write_text('{"schema":1,"engine":"subtitle-neural"}', encoding="utf-8")
    if not python.is_file():
        subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True)
    if not models_only:
        subprocess.run([str(python), "-m", "pip", "install", "torch==2.8.0", "torchaudio==2.8.0",
                        "--index-url", "https://download.pytorch.org/whl/cpu", "--no-compile"], check=True)
        subprocess.run([str(python), "-m", "pip", "install", *PACKAGES, "torch==2.8.0", "torchaudio==2.8.0", "--no-compile"], check=True)
        # Only the upstream CTC alignment module is used: no diarization/VAD
        # pipeline, optional model downloads, or synthetic fallback alignment.
        subprocess.run([str(python), "-m", "pip", "install", "easyaligner==0.3.3", "--no-deps", "--no-compile"], check=True)
    models = {}
    for model in stable_models:
        expected = WHISPER_DIGESTS[model]
        path = runtime / "models/stable-ts" / (model + ".pt")
        url = f"https://openaipublic.azureedge.net/main/whisper/models/{expected}/{model}.pt"
        models["stable-ts/" + model] = {"modelId": "openai/whisper-" + model, "license": "MIT",
                                       "sha256": download(url, path, expected), "source": url,
                                       "fileStats": {path.name: {"size": path.stat().st_size, "mtimeNs": path.stat().st_mtime_ns}}}
    for language, (model_id, revision) in HF_MODELS.items():
        directory = runtime / "models/easyaligner" / language
        checksums = {}
        api = f"https://huggingface.co/api/models/{model_id}/revision/{revision}?blobs=true"
        with urllib.request.urlopen(api, timeout=60) as response:
            metadata = json.load(response)
        if metadata["sha"] != revision or metadata.get("cardData", {}).get("license") != "apache-2.0":
            raise ValueError("Pinned model revision/license mismatch.")
        remote_files = {row["rfilename"]: row for row in metadata["siblings"]}
        for name in ("config.json", "vocab.json", "preprocessor_config.json", "special_tokens_map.json", "tokenizer_config.json", "model.safetensors", "README.md"):
            url = f"https://huggingface.co/{model_id}/resolve/{revision}/{name}"
            info = remote_files[name]
            checksums[name] = download(url, directory / name, info.get("lfs", {}).get("sha256"),
                                       git_blob=info["blobId"] if not info.get("lfs") else None)
        models["easyaligner/" + language] = {"modelId": model_id, "revision": revision, "license": "Apache-2.0", "files": checksums,
                                           "fileStats": {name: {"size": (directory / name).stat().st_size,
                                                                 "mtimeNs": (directory / name).stat().st_mtime_ns} for name in checksums},
                                           "source": f"https://huggingface.co/{model_id}/tree/{revision}"}
    probe = "import json,torch,torchaudio,stable_whisper;from easyaligner.alignment.pytorch import align_pytorch,get_word_spans;from importlib.metadata import version;print(json.dumps({n:version(n) for n in ['torch','torchaudio','stable-ts','openai-whisper','easyaligner','transformers','numpy']}))"
    software = json.loads(subprocess.check_output([str(python), "-c", probe], encoding="utf-8"))
    if software["torch"].split("+")[0] != "2.8.0" or "+cpu" not in software["torch"]:
        raise ValueError("CPU Torch 2.8.0 runtime was not verified.")
    manifest_path = environment / "manifest.json"
    if manifest_path.is_file():
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
        models = {**previous.get("models", {}), **models}
    packages = environment / "Lib/site-packages"
    critical = [packages / name for name in ("torch/__init__.py", "torchaudio/__init__.py", "stable_whisper/__init__.py",
                "stable_whisper/alignment.py", "easyaligner/alignment/pytorch.py", "transformers/__init__.py", "numpy/__init__.py")]
    critical.extend(p for p in packages.glob("*.dist-info/METADATA") if p.parent.name.lower().startswith(
        ("torch-", "torchaudio-", "stable_ts-", "openai_whisper-", "easyaligner-", "transformers-", "numpy-")))
    manifest = {"schema": 1, "engine": "subtitle-neural", "software": software, "models": models,
                "runtimeFiles": {p.relative_to(environment).as_posix(): digest(p) for p in critical}}
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    lock = subprocess.check_output([str(python), "-m", "pip", "freeze"], encoding="utf-8")
    (environment / "requirements-lock.txt").write_text(lock, encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models-only", action="store_true")
    parser.add_argument("--stable-models", nargs="+", choices=tuple(WHISPER_DIGESTS), default=["tiny", "base"])
    parser.add_argument("--plan", action="store_true")
    args = parser.parse_args()
    if args.plan:
        print(json.dumps({"packages": PACKAGES, "easyaligner": "0.3.3", "torch": "2.8.0+cpu", "models": HF_MODELS, "stableModels": args.stable_models}, indent=2))
    else:
        print(json.dumps(setup(Path(__file__).resolve().parent.parent, models_only=args.models_only, stable_models=args.stable_models), indent=2))
