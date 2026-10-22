"""Pinned reference-based generators; weights and runtimes remain machine-local."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from typing import TYPE_CHECKING

from app.adapters.engine_worker import EngineWorkerProcess
from app.adapters.verified_model_component import verified_component
from app.runtime_layout import python_executable

if TYPE_CHECKING:
    from app.adapters.omnivoice_generator import SpeechRequest

WORKER = Path(__file__).resolve().parents[1] / "workers" / "expressive_worker.py"
PROBE = WORKER.with_name("expressive_import_probe.py")
EMOTIONS = ("happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm")
_PROBES: dict[tuple[str, str, str], tuple[float, str | None]] = {}
_PROBE_LOCK = threading.Lock()


@dataclass(frozen=True)
class ModelComponent:
    folder: str
    model_id: str
    revision: str
    required: tuple[str, ...]


VOCOS = ModelComponent("checkpoints/vocos", "charactr/vocos-mel-24khz",
                       "0feb3fdd929bcd6649e0e7c5a688cf7dd012ef21", ("config.yaml", "pytorch_model.bin"))


@dataclass(frozen=True)
class ExpressiveSpec:
    repo_name: str
    revision: str
    entrypoint: str
    runtime_name: str
    component: ModelComponent
    auxiliary: tuple[ModelComponent, ...] = ()
    languages: tuple[str, ...] = ()

    @property
    def model_id(self) -> str:
        return self.component.model_id

    @property
    def model_folder(self) -> str:
        return self.component.folder


SPECS = {
    "f5-tts": ExpressiveSpec("F5-TTS", "2f866649b779881af8bd644e76b9a6d95053da29", "src/f5_tts/api.py", "f5-tts",
        ModelComponent("checkpoints/base", "SWivid/F5-TTS", "84e5a410d9cead4de2f847e7c9369a6440bdfaca",
                       ("F5TTS_v1_Base/model_1250000.safetensors", "F5TTS_v1_Base/vocab.txt")), (VOCOS,), ("en", "zh")),
    "vivoice": ExpressiveSpec("F5-TTS", "2f866649b779881af8bd644e76b9a6d95053da29", "src/f5_tts/api.py", "f5-tts",
        ModelComponent("checkpoints/vivoice", "hynt/F5-TTS-Vietnamese-ViVoice", "5c14cdd4e3f62b69e75140558bea2b2e293ee8f1",
                       ("model_last.pt", "config.json")), (VOCOS,), ("vi",)),
    "indextts25": ExpressiveSpec("IndexTTS", "d9e41aac89fd00b3d71497fddb287b7f24613712", "indextts/infer_v2_5.py", "index-tts",
        ModelComponent("checkpoints", "IndexTeam/IndexTTS-2.5", "c39ce5ba981572cb187443877ff559dfb246ce63",
                       ("config.yaml", "gpt.pth", "s2mel.pth", "codec.pth", "feat1.pt", "feat2.pt",
                        "wav2vec2bert_stats.pt", "multilingual_zh_ja_yue_char_del.tiktoken", "qwen0.6bemo4-merge/config.json",
                        "qwen0.6bemo4-merge/model.safetensors", "qwen0.6bemo4-merge/tokenizer.json")),
        (ModelComponent("checkpoints/hf_cache/w2v-bert-2.0", "facebook/w2v-bert-2.0", "da985ba0987f70aaeb84a80f2851cfac8c697a7b",
                        ("config.json", "preprocessor_config.json", "model.safetensors")),
         ModelComponent("checkpoints/hf_cache", "funasr/campplus", "e4b6ede7ce16997aff4ae69fbca1f0175e2afede", ("campplus_cn_common.bin",)),
         ModelComponent("checkpoints/hf_cache/bigvgan", "nvidia/bigvgan_v2_22khz_80band_256x", "633ff708ed5b74903e86ff1298cf4a98e921c513",
                        ("config.json", "bigvgan_generator.pt"))), ("en", "zh", "ja", "es", "ar")),
    "fish-s2-pro": ExpressiveSpec("FishSpeech", "541566932abbaebcb0a40e562a1f846738383f38", "fish_speech/inference_engine/__init__.py", "fish-speech",
        ModelComponent("checkpoints/s2-pro", "fishaudio/s2-pro", "1de9996b6be38b745688de084d87a5633f714e4e",
                       ("config.json", "codec.pth", "model.safetensors.index.json", "model-00001-of-00002.safetensors",
                        "model-00002-of-00002.safetensors", "tokenizer.json", "tokenizer_config.json"))),
}


@dataclass(frozen=True)
class ExpressivePaths:
    repo: Path
    runtime: Path
    spec: ExpressiveSpec

    @property
    def model(self) -> Path:
        return self.repo / self.spec.model_folder

    @property
    def python(self) -> Path:
        return python_executable(self.runtime)

    def model_identity(self) -> str:
        receipts = [verified_component(self.repo / part.folder, part.model_id, part.revision, part.required)
                    for part in (self.spec.component, *self.spec.auxiliary)]
        # Covers handler edits as well as the common protocol when invalidating generated takes.
        handler = {"f5-tts": "expressive_f5.py", "index-tts": "expressive_index.py", "fish-speech": "expressive_fish.py"}[self.spec.runtime_name]
        handlers = [WORKER, WORKER.with_name(handler)]
        return json.dumps({"models": receipts, "source": self.spec.revision,
                           "workers": [hashlib.sha256(path.read_bytes()).hexdigest() for path in handlers]}, sort_keys=True)

    def unavailable_reason(self, descriptor=None) -> str | None:
        if not (self.repo / self.spec.entrypoint).is_file():
            return f"Chưa có repo {self.spec.repo_name}."
        try:
            result = subprocess.run(["git", "-C", str(self.repo), "rev-parse", "HEAD"],
                                    capture_output=True, text=True, timeout=5, creationflags=0x08000000 if os.name == "nt" else 0)
            if result.returncode or result.stdout.strip() != self.spec.revision:
                return f"{self.spec.repo_name}: source revision không khớp bản được hỗ trợ."
            dirty = subprocess.run(["git", "-C", str(self.repo), "status", "--porcelain", "--untracked-files=no"],
                                   capture_output=True, text=True, timeout=5, creationflags=0x08000000 if os.name == "nt" else 0)
            if dirty.returncode or dirty.stdout.strip():
                return f"{self.spec.repo_name}: source đã thay đổi; cần checkout sạch ở revision đã ghim."
            self.model_identity()
        except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
            return str(exc)
        if not self.python.is_file():
            return f"Chưa có Python riêng cho {self.spec.repo_name}."
        key = (str(self.python.resolve()), str(self.repo.resolve()), self.spec.runtime_name)
        with _PROBE_LOCK:
            cached = _PROBES.get(key)
            if cached and time.monotonic() - cached[0] < 60:
                return cached[1]
            try:
                probe = subprocess.run([str(self.python), str(PROBE), self.spec.runtime_name, str(self.repo)],
                    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=45,
                    env={**os.environ, **self.environment()}, creationflags=0x08000000 if os.name == "nt" else 0)
                reason = None if probe.returncode == 0 else f"{self.spec.repo_name}: runtime chưa import được: " + probe.stderr[-600:]
            except (OSError, subprocess.TimeoutExpired) as exc:
                reason = f"{self.spec.repo_name}: không kiểm tra được runtime: {exc}"
            _PROBES[key] = (time.monotonic(), reason)
            return reason

    def environment(self) -> dict[str, str]:
        return {"PRO4BRO_EXPRESSIVE_ROOT": str(self.repo.resolve()), "HF_HUB_OFFLINE": "1",
                "TRANSFORMERS_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1", "MODELSCOPE_OFFLINE": "1"}

    def worker(self) -> EngineWorkerProcess:
        return EngineWorkerProcess(self.python, WORKER, self.environment(), label=self.spec.repo_name)


class ExpressiveSpeech:
    def __init__(self, worker: EngineWorkerProcess, paths: ExpressivePaths) -> None:
        self.worker, self.paths = worker, paths

    def artifact_identity(self) -> str:
        return self.paths.model_identity()

    def payload(self, request: SpeechRequest) -> dict:
        spec = self.paths.spec
        engine = request.voice.engine
        if engine not in SPECS or SPECS[engine] != spec or request.voice.base_model != spec.model_id:
            raise ValueError("Voice không khớp engine/base model được hỗ trợ.")
        if request.adapter is not None or request.model_dir is not None:
            raise ValueError("Adapter này nhận reference; LoRA/full trainer chưa được kết nối.")
        if request.duration is not None:
            raise ValueError("Engine này chưa hỗ trợ duration tuyệt đối trong Pro4Bro.")
        language = (request.language or request.voice.language or "en").lower().split("-")[0]
        if spec.languages and language not in spec.languages:
            raise ValueError(f"{spec.repo_name} chưa hỗ trợ ngôn ngữ '{language}'.")
        if not request.voice.reference_text.strip():
            raise ValueError("Cần transcript đúng của giọng reference.")
        limit = 30 if engine == "fish-s2-pro" else 15
        if not 0 < request.voice.reference_seconds <= limit:
            raise ValueError(f"Giọng reference cần dài hơn 0 và không quá {limit} giây.")
        options = dict(request.generation)
        payload = {"engine": engine, "model": str(self.paths.model), "repo": str(self.paths.repo),
                   "ref_audio": str(request.reference), "ref_text": request.voice.reference_text,
                   "text": request.text, "output": str(request.output), "artifact_revision": request.artifact_revision}
        payload["components"] = [{"folder": str(self.paths.repo / part.folder), "model_id": part.model_id,
                                  "revision": part.revision, "required": part.required}
                                 for part in (spec.component, *spec.auxiliary)]
        if engine in {"f5-tts", "vivoice"}:
            options["speed"] = request.speed if request.speed is not None else 1.0
            payload["vocoder"] = str(self.paths.repo / VOCOS.folder)
        elif engine == "indextts25":
            if request.speed is not None:
                raise ValueError("IndexTTS dùng duration_factor, không có speed.")
            payload["language"] = language.upper()
            mode = options.pop("emotion_mode", "reference")
            text = options.pop("emo_text", "")
            vector = [options.pop(f"emo_{emotion}", 0.0) for emotion in EMOTIONS]
            if mode not in {"reference", "vector", "text"}:
                raise ValueError("emotion_mode không hợp lệ.")
            if mode != "text" and text.strip():
                raise ValueError("emo_text chỉ dùng trong chế độ text.")
            if mode != "vector" and any(vector):
                raise ValueError("Emotion vector chỉ dùng trong chế độ vector.")
            if mode == "text" and not text.strip():
                raise ValueError("Chế độ text cần emo_text.")
            payload["use_qwen_emo"] = mode == "text"
            options.update(emo_vector=vector if mode == "vector" else None, use_emo_text=mode == "text", emo_text=text or None)
        else:
            if request.speed is not None:
                raise ValueError("Fish S2 Pro không hỗ trợ speed trong adapter này.")
            instruction = options.pop("instruction", "").strip()
            if len(instruction) > 500 or any(char in instruction for char in "[]\r\n"):
                raise ValueError("Chỉ dẫn cần là một cụm không chứa ngoặc vuông hoặc xuống dòng, tối đa 500 ký tự.")
            if instruction:
                payload["text"] = f"[{instruction}] {request.text}"
        payload["options"] = options
        return payload


def expressive_paths(research_root: Path, runtime_root: Path) -> dict[str, ExpressivePaths]:
    return {key: ExpressivePaths(research_root / spec.repo_name, runtime_root / spec.runtime_name, spec)
            for key, spec in SPECS.items()}
