from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
from pathlib import PurePosixPath
import re
import subprocess
import threading
import time
from typing import TYPE_CHECKING

from app.adapters.engine_worker import EngineWorkerProcess
from app.runtime_layout import python_executable, site_packages

if TYPE_CHECKING:
    from app.adapters.omnivoice_generator import SpeechRequest

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "cosyvoice_worker.py"
IMPORT_PROBE = WORKER_SCRIPT.with_name("cosyvoice_import_probe.py")
LANGUAGES = {"zh", "en", "ja", "ko", "de", "es", "fr", "it", "ru"}
MODEL_ID = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"
MODEL_REVISION = "29e01c4e8d000f4bcd70751be16fa94bf3d85a18"
MODEL_RECEIPT_NAME = ".pro4bro-model-receipt.json"
_IMPORT_CACHE: dict[tuple[str, str], tuple[float, str | None]] = {}
_IMPORT_LOCK = threading.Lock()
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CosyVoicePaths:
    repo: Path
    runtime: Path

    required_files = ("cosyvoice3.yaml", "llm.pt", "flow.pt", "hift.pt", "campplus.onnx",
                      "speech_tokenizer_v3.onnx", "CosyVoice-BlankEN/config.json",
                      "CosyVoice-BlankEN/model.safetensors", "CosyVoice-BlankEN/tokenizer_config.json",
                      "CosyVoice-BlankEN/vocab.json", "CosyVoice-BlankEN/merges.txt")

    @property
    def model(self) -> Path:
        return self.repo / "pretrained_models" / "Fun-CosyVoice3-0.5B"

    @property
    def python(self) -> Path:
        return python_executable(self.runtime)

    def unavailable_reason(self, descriptor=None) -> str | None:
        if not (self.repo / "cosyvoice/cli/cosyvoice.py").is_file():
            return "Chưa có repo CosyVoice."
        missing = [name for name in self.required_files
                   if not (self.model / name).is_file() or (self.model / name).stat().st_size == 0]
        if missing:
            return "CosyVoice3 còn thiếu weights: " + ", ".join(missing) + "."
        receipt_problem = self._model_receipt_problem()
        if receipt_problem:
            return receipt_problem
        if not self.python.is_file():
            return "Chưa có Python riêng cho CosyVoice."
        packages = site_packages(self.runtime)
        if packages is None or any(not (packages / name).exists() for name in
                                   ("torch", "torchaudio", "transformers", "hyperpyyaml", "onnxruntime", "whisper",
                                    "gdown", "wget.py", "pyarrow", "pyworld")):
            return "Python của CosyVoice còn thiếu dependency inference."
        if not (self.repo / "third_party/Matcha-TTS/matcha").is_dir():
            return "Chưa có submodule Matcha-TTS của CosyVoice."
        return self._import_reason()

    def _model_receipt_problem(self) -> str | None:
        receipt_path = self.model / MODEL_RECEIPT_NAME
        try:
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return "CosyVoice3 chưa có receipt xác minh model đã tải đầy đủ."
        if (not isinstance(receipt, dict) or receipt.get("schemaVersion") != 1
                or receipt.get("modelId") != MODEL_ID or receipt.get("revision") != MODEL_REVISION):
            return "CosyVoice3 receipt không khớp model/revision được hỗ trợ."
        files = receipt.get("files")
        if not isinstance(files, list):
            return "CosyVoice3 receipt không hợp lệ."
        entries: dict[str, dict] = {}
        for entry in files:
            if not isinstance(entry, dict):
                return "CosyVoice3 receipt không hợp lệ."
            name, digest = entry.get("path"), entry.get("hash")
            size, mtime_ns = entry.get("size"), entry.get("mtimeNs")
            if (not isinstance(name, str) or not isinstance(digest, str)
                    or not re.fullmatch(r"(?:sha256:[0-9a-f]{64}|git-sha1:[0-9a-f]{40})", digest)
                    or not isinstance(size, int) or isinstance(size, bool) or size < 0
                    or not isinstance(mtime_ns, int) or isinstance(mtime_ns, bool) or mtime_ns < 0):
                return "CosyVoice3 receipt không hợp lệ."
            relative = PurePosixPath(name)
            if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
                return "CosyVoice3 receipt chứa đường dẫn không hợp lệ."
            normalized = relative.as_posix()
            if normalized in entries:
                return "CosyVoice3 receipt có file trùng lặp."
            entries[normalized] = entry
            path = self.model.joinpath(*relative.parts).resolve()
            if not path.is_relative_to(self.model.resolve()):
                return "CosyVoice3 receipt chứa đường dẫn ngoài model."
            try:
                stat = path.stat()
            except OSError:
                return f"CosyVoice3 model đã thay đổi sau khi xác minh: {normalized}."
            if not path.is_file() or stat.st_size != size or stat.st_mtime_ns != mtime_ns:
                return f"CosyVoice3 model đã thay đổi sau khi xác minh: {normalized}."
        missing = [name for name in self.required_files if name not in entries]
        if missing:
            return "CosyVoice3 receipt thiếu file đã xác minh: " + ", ".join(missing) + "."
        return None

    def _import_reason(self) -> str | None:
        key = (str(self.python.resolve()), str(self.repo.resolve()))
        with _IMPORT_LOCK:
            cached = _IMPORT_CACHE.get(key)
            if cached and time.monotonic() - cached[0] < 60:
                return cached[1]
            try:
                # Checking the actual imports catches broken DLLs and incompatible packages.
                result = subprocess.run([str(self.python), str(IMPORT_PROBE), str(self.repo.resolve())], capture_output=True, text=True,
                                        encoding="utf-8", errors="replace", timeout=45,
                                        creationflags=0x08000000 if os.name == "nt" else 0)
                lines = result.stderr.strip().splitlines()
                reason = None if result.returncode == 0 else "Python CosyVoice chưa import được: " + (lines[-1] if lines else "kiểm tra dependency inference.")
            except subprocess.TimeoutExpired:
                logger.warning("CosyVoice runtime import probe exceeded 45 seconds")
                reason = "Runtime CosyVoice chưa phản hồi sau 45 giây. Thử lại khi máy có đủ tài nguyên."
            except OSError:
                logger.warning("Could not start the CosyVoice runtime import probe", exc_info=True)
                reason = "Không khởi động được Python CosyVoice; kiểm tra lại runtime đã cài."
            _IMPORT_CACHE[key] = (time.monotonic(), reason)
            return reason

    def model_identity(self) -> str:
        """Use the verified pinned receipt and cheap stats to identify cached artifacts."""
        reason = self._model_receipt_problem()
        if reason:
            raise ValueError(reason)
        receipt = json.loads((self.model / MODEL_RECEIPT_NAME).read_text(encoding="utf-8"))
        identity = {key: receipt[key] for key in ("modelId", "revision", "files")}
        return json.dumps(identity, sort_keys=True, separators=(",", ":"))

    def worker(self) -> EngineWorkerProcess:
        return EngineWorkerProcess(self.python, WORKER_SCRIPT, {
            "PRO4BRO_COSYVOICE_ROOT": str(self.repo.resolve()),
            "PYTHONPATH": os.pathsep.join((str(self.repo.resolve()), str((self.repo / "third_party/Matcha-TTS").resolve()))),
            "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
        }, label="CosyVoice3")


class CosyVoiceSpeech:
    def __init__(self, worker: EngineWorkerProcess, paths: CosyVoicePaths) -> None:
        self.worker = worker
        self.paths = paths

    def artifact_identity(self) -> str:
        return self.paths.model_identity()

    def payload(self, request: SpeechRequest) -> dict:
        if request.voice.base_model != MODEL_ID:
            raise ValueError(f"CosyVoice3 chỉ hỗ trợ base model '{MODEL_ID}'.")
        if request.duration is not None:
            raise ValueError("CosyVoice3 chưa hỗ trợ native duration; chọn timing tự nhiên.")
        if request.adapter is not None or request.model_dir is not None:
            raise ValueError("CosyVoice3 chỉ nhận voice reference; chưa hỗ trợ LoRA/full model trong adapter này.")
        language = (request.language or "en").lower().split("-")[0]
        if language not in LANGUAGES:
            raise ValueError(f"CosyVoice3 chưa hỗ trợ ngôn ngữ '{language}'.")
        if request.voice.reference_seconds > 30:
            raise ValueError("CosyVoice3 cần giọng mẫu không quá 30 giây.")
        mode = request.generation.get("mode", "cross-lingual")
        if mode not in {"zero-shot", "cross-lingual", "instruct"}:
            raise ValueError("Chế độ CosyVoice3 không hợp lệ.")
        instruction = request.generation.get("instruction", "")
        if mode != "instruct" and isinstance(instruction, str) and instruction.strip():
            raise ValueError("Chỉ dẫn CosyVoice3 chỉ dùng trong chế độ instruct.")
        if mode == "zero-shot" and not request.voice.reference_text.strip():
            raise ValueError("Zero-shot cần transcript đúng của giọng mẫu.")
        return {"model": str(self.paths.model), "ref_audio": str(request.reference),
                "ref_text": request.voice.reference_text, "text": request.text, "mode": mode,
                "instruction": instruction, "language": language,
                "speed": request.speed or 1.0, "output": str(request.output),
                "artifact_revision": request.artifact_revision}
