"""Private CPU runtimes for explicit, offline transcript alignment engines."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import threading
import time
from types import SimpleNamespace
from functools import lru_cache

from app.adapters.subtitle_alignment_audio import sha256


ENGINES = {
    "mfa": ("MFA", "Căn theo từ điển phát âm và mô hình âm học."),
    "stable-ts": ("stable-ts", "Căn transcript bằng Whisper; có thể refine biên từ."),
    "easyaligner": ("EasyAligner", "Căn từng từ bằng CTC với mô hình theo ngôn ngữ."),
}


@lru_cache(maxsize=256)
def _cached_digest(path, size, mtime_ns):
    return sha256(Path(path))


def _matches(path, expected):
    if not path.is_file() or not expected:
        return False
    stat = path.stat()
    return _cached_digest(str(path), stat.st_size, stat.st_mtime_ns) == expected


class SubtitleAlignmentEngines:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.runtime = self.root / ".runtime/subtitle-alignment"
        workers = Path(__file__).resolve().parents[1] / "workers"
        self.workers = {engine: workers / ("subtitle_mfa_worker.py" if engine == "mfa" else "subtitle_neural_worker.py")
                        for engine in ENGINES}

    def _python(self, engine):
        return self.runtime / ("mfa/python.exe" if engine == "mfa" else "neural/Scripts/python.exe")

    def _receipt(self, engine):
        path = self.runtime / ("mfa/manifest.json" if engine == "mfa" else "neural/manifest.json")
        try:
            result = json.loads(path.read_text(encoding="utf-8"))
            expected_engine = "mfa" if engine == "mfa" else "subtitle-neural"
            return result if result.get("schema") == 1 and result.get("engine") == expected_engine else {}
        except (OSError, ValueError, AttributeError):
            return {}

    def _model(self, engine, model, receipt):
        reason = "Chưa có mô hình trên máy."
        models = receipt.get("models", {})
        spec = models.get(model if engine == "mfa" else engine + "/" + model, {}) if isinstance(models, dict) else {}
        if not isinstance(spec, dict):
            spec = {}
        if engine == "mfa":
            paths = [self.runtime / "mfa/models" / model / name for name in ("acoustic.zip", "dictionary.dict")]
        elif engine == "stable-ts":
            paths = [self.runtime / "models/stable-ts" / (model + ".pt")]
        else:
            folder = self.runtime / "models/easyaligner" / model
            paths = [folder / name for name in ("config.json", "vocab.json", "preprocessor_config.json", "tokenizer_config.json", "special_tokens_map.json")]
            paths.append(next((p for p in (folder / "model.safetensors", folder / "pytorch_model.bin") if p.is_file()), folder / "model.safetensors"))
        ready = bool(spec and spec.get("license") in {"MIT", "Apache-2.0", "CC-BY-4.0"}
                     and all(p.is_file() and p.stat().st_size > 0 for p in paths))
        if ready and engine == "mfa":
            ready = _matches(paths[0], spec.get("acousticSha256")) and _matches(paths[1], spec.get("dictionarySha256"))
        elif ready:
            # Setup checks upstream digests and records exact stat signatures.
            # Catalog reads stay cheap; dispatch hashes the model bytes again.
            ready = all(spec.get("fileStats", {}).get(p.name) == {"size": p.stat().st_size, "mtimeNs": p.stat().st_mtime_ns}
                        for p in paths)
        return {"id": model, "label": spec.get("modelId", model), "license": spec.get("license", "CC-BY-4.0" if engine == "mfa" else "MIT" if engine == "stable-ts" else "Apache-2.0"),
                **({"language": model} if engine != "stable-ts" else {}), "available": ready,
                "reason": "" if ready else reason}, paths

    def catalog(self):
        entries = []
        for engine, (label, description) in ENGINES.items():
            receipt = self._receipt(engine)
            runtime_ready = self._python(engine).is_file() and self.workers[engine].is_file() and bool(receipt.get("software"))
            if runtime_ready:
                dependencies = receipt.get("runtimeFiles", {})
                environment = self.runtime / ("mfa" if engine == "mfa" else "neural")
                runtime_ready = isinstance(dependencies, dict) and bool(dependencies) and all(isinstance(path, str)
                    and (environment / path).resolve().is_relative_to(environment.resolve())
                    and _matches(environment / path, expected) for path, expected in dependencies.items())
            models = [self._model(engine, name, receipt)[0] for name in
                      (("tiny", "base", "small", "medium", "large-v3") if engine == "stable-ts" else ("vi", "en"))]
            available = runtime_ready and any(m["available"] for m in models)
            entries.append({"id": engine, "label": label, "description": description, "license": "MIT",
                            "available": available, "models": models,
                            "reason": "" if available else "Chưa cài đủ runtime hoặc mô hình căn chỉnh cho engine này."})
        return {"engines": entries}

    def report(self, engine, settings):
        if engine not in ENGINES:
            raise ValueError("Engine căn chỉnh không hợp lệ.")
        entry = next(e for e in self.catalog()["engines"] if e["id"] == engine)
        model = settings["model"] if engine == "stable-ts" else settings["language"]
        choice = next((m for m in entry["models"] if m["id"] == model), None)
        available = entry["available"] and choice is not None and choice["available"]
        return {"status": "available" if available else "unavailable", "engine": engine,
                "model": choice["label"] if choice else model, "license": choice["license"] if choice else "",
                "reason": "" if available else entry["reason"] or (choice or {}).get("reason", "Mô hình chưa có.")}

    def identity(self, engine, settings):
        receipt = self._receipt(engine)
        model = settings["model"] if engine == "stable-ts" else settings["language"]
        _, paths = self._model(engine, model, receipt)
        spec = receipt["models"][model if engine == "mfa" else engine + "/" + model]
        expected = {"acoustic.zip": spec.get("acousticSha256"), "dictionary.dict": spec.get("dictionarySha256")} if engine == "mfa" else (
            {model + ".pt": spec.get("sha256")} if engine == "stable-ts" else spec.get("files", {}))
        if not all(_matches(path, expected.get(path.name)) for path in paths):
            raise ValueError("Mô hình căn chỉnh đã đổi hoặc chưa tải đầy đủ. Cài lại model trước khi chạy.")
        return {"engine": engine, "settings": settings, "receipt": receipt,
                "workerSha256": sha256(self.workers[engine]),
                "modelFiles": {p.relative_to(self.runtime).as_posix(): sha256(p) for p in paths}}

    def run(self, project_root, audio, words, folder, indexes, engine, settings, progress=None):
        report = self.report(engine, settings)
        if report["status"] != "available":
            raise ValueError(report["reason"])
        payload = {"engineId": engine, "settings": settings, "audioPath": audio.resolve().relative_to(project_root.resolve()).as_posix(),
                   "audioSha256": sha256(audio), "words": words, "indexes": indexes}
        input_path, output_path = folder / "alignment-input.json", folder / "alignment-output.json"
        input_path.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        env = {**os.environ, "CUDA_VISIBLE_DEVICES": "", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
               "HF_HUB_DISABLE_TELEMETRY": "1", "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4", "PYTHONUTF8": "1"}
        if engine == "mfa":
            prefix = self.runtime / "mfa"
            env["PATH"] = os.pathsep.join(str(p) for p in (prefix, prefix / "Library/bin", prefix / "Scripts")) + os.pathsep + env.get("PATH", "")
        progress_path = folder / "alignment-progress.json"
        command = [str(self._python(engine)), str(self.workers[engine]), str(input_path), str(output_path),
                   str(project_root.resolve()), str(self.runtime / "mfa" if engine == "mfa" else self.runtime),
                   str(progress_path)]
        try:
            process = subprocess.Popen(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            output = {"stdout": "", "stderr": ""}
            def collect():
                output["stdout"], output["stderr"] = process.communicate()
            reader = threading.Thread(target=collect, daemon=True)
            reader.start()
            started = time.monotonic()
            while process.poll() is None:
                if progress is not None:
                    try:
                        value = json.loads(progress_path.read_text(encoding="utf-8"))
                        progress(value)
                    except (OSError, ValueError):
                        pass
                if time.monotonic() - started > 1800:
                    process.kill()
                    reader.join()
                    raise subprocess.TimeoutExpired(command, 1800)
                time.sleep(.2)
            reader.join()
            result = SimpleNamespace(returncode=process.returncode, stdout=output["stdout"], stderr=output["stderr"])
            if progress is not None:
                progress({"stage": "Worker completed", "fraction": None})
        except subprocess.TimeoutExpired as exc:
            (folder / "alignment.log").write_text("Engine exceeded 1800s timeout.", encoding="utf-8")
            raise ValueError("Engine đã quá thời gian căn chỉnh. Thử phạm vi từ ngắn hơn.") from exc
        (folder / "alignment.log").write_text(result.stdout + result.stderr, encoding="utf-8")
        if result.returncode or not output_path.is_file():
            raise ValueError(f"{ENGINES[engine][0]} chưa tạo được kết quả căn chỉnh. Thử phạm vi từ ngắn hơn hoặc engine khác; chi tiết trong alignment.log của tác vụ.")
        output = json.loads(output_path.read_text(encoding="utf-8"))
        if output.get("audioSha256") != payload["audioSha256"] or sha256(audio) != payload["audioSha256"]:
            raise ValueError("Artifact căn chỉnh không khớp audio nguồn.")
        return {**report, **output, "status": "complete"}
