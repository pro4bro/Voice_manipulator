"""Run a private CPU-only STT timing comparison on three frozen PCM crops.

Phases are intentionally separate so the aligned candidate cannot be loaded
until raw/refined native words have been retained and protocol targets frozen:

  python scripts/profiling/stt_timing_accuracy_probe.py prepare
  .runtime/omnivoice-studio/.venv/Scripts/python.exe scripts/profiling/stt_timing_accuracy_probe.py recognize
  .runtime/omnivoice-studio/.venv/Scripts/python.exe scripts/profiling/stt_timing_accuracy_probe.py align

No project words, media, service process, or production setting is changed.
"""
from __future__ import annotations

import argparse
import array
import ctypes
import hashlib
import importlib.metadata
import json
import math
import os
import sys
import threading
import time
import unicodedata
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / ".scratch/stt-timing-accuracy-01/run-1"
MODEL_ID = "nguyenvulebinh/wav2vec2-base-vietnamese-250h"
MODEL_CACHE = ROOT / ".cache/huggingface/hub/models--nguyenvulebinh--wav2vec2-base-vietnamese-250h"
FW_CACHE = ROOT / ".runtime/omnivoice-studio/models/models--Systran--faster-whisper-large-v3"
NLTK_DATA = ROOT / ".runtime/omnivoice-studio/nltk_data"
ASSET = ROOT / "data/projects/test-obs-9/assets/media/asset-live-05d3d2248f2d/analysis.wav"
SPEECH = ROOT / ".scratch/stt-gap-02/run-1/speech-2.wav"
SAMPLE_RATE = 24_000
SAMPLE_WIDTH = 2
CHANNELS = 1
CPU_THREADS = 4
CASES = (
    ("obs9-236-272", "OBS9 analysis 236-272s", ASSET, 236.0, 272.0),
    ("speech2-55-66", "speech-2 local 55-66s", SPEECH, 55.0, 66.0),
    ("speech2-75-82", "speech-2 local 75-82s", SPEECH, 75.0, 82.0),
)
BUDGETS = {
    "humanWordP95Seconds": 0.25,
    "alignmentCoverage": 0.98,
    "alignmentConfidenceFraction": 0.95,
    "alignmentConfidenceFloor": 0.3,
    "proxyOnsetMeanSeconds": 0.08,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def metadata_versions(interpreter: str) -> dict[str, str | None]:
    packages = (
        "faster-whisper", "ctranslate2", "numpy", "whisperx", "transformers",
        "torch", "torchaudio", "huggingface-hub",
    )
    versions: dict[str, str | None] = {"python": sys.version.split()[0], "interpreter": interpreter}
    for package in packages:
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = None
    return versions


def wav_info(path: Path) -> dict[str, Any]:
    with wave.open(str(path), "rb") as wav:
        return {
            "channels": wav.getnchannels(),
            "sampleRate": wav.getframerate(),
            "sampleWidthBytes": wav.getsampwidth(),
            "frames": wav.getnframes(),
            "duration": wav.getnframes() / wav.getframerate(),
            "compression": wav.getcomptype(),
        }


def zero_runs(path: Path) -> list[dict[str, float | int]]:
    with wave.open(str(path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError(f"Exact-zero audit requires PCM16 mono: {path}")
        samples = array.array("h")
        samples.frombytes(wav.readframes(wav.getnframes()))
        if sys.byteorder != "little":
            samples.byteswap()
        rate = wav.getframerate()
    found: list[dict[str, float | int]] = []
    start: int | None = None
    for i, sample in enumerate(samples):
        if sample == 0:
            if start is None:
                start = i
        elif start is not None:
            found.append({"startFrame": start, "endFrame": i, "start": start / rate, "end": i / rate, "frames": i - start})
            start = None
    if start is not None:
        found.append({"startFrame": start, "endFrame": len(samples), "start": start / rate, "end": len(samples) / rate, "frames": len(samples) - start})
    return found


def snapshot_model() -> dict[str, Any]:
    revision_file = MODEL_CACHE / "refs/main"
    revision = revision_file.read_text(encoding="ascii").strip()
    snapshot = MODEL_CACHE / "snapshots" / revision
    weights = snapshot / "pytorch_model.bin"
    config = snapshot / "config.json"
    return {
        "id": MODEL_ID,
        "revision": revision,
        "snapshot": str(snapshot),
        "configSha256": sha256(config),
        "weights": {"path": str(weights), "bytes": weights.stat().st_size, "sha256": sha256(weights)},
        "files": {p.name: {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in sorted(snapshot.iterdir()) if p.is_file() and p.name != weights.name},
    }


def prepare() -> None:
    if (RUN / "protocol-preflight.json").exists():
        raise FileExistsError(f"Refusing to overwrite frozen run: {RUN}")
    RUN.mkdir(parents=True, exist_ok=False)
    crop_dir = RUN / "crops"
    crop_dir.mkdir()
    source_hashes: dict[Path, str] = {}
    source_infos: dict[Path, dict[str, Any]] = {}
    cases = []
    for case_id, label, source, start_s, end_s in CASES:
        if not source.is_file():
            raise FileNotFoundError(source)
        info = wav_info(source)
        if (info["channels"], info["sampleRate"], info["sampleWidthBytes"], info["compression"]) != (CHANNELS, SAMPLE_RATE, SAMPLE_WIDTH, "NONE"):
            raise ValueError(f"Expected PCM16 mono 24kHz input, got {info}: {source}")
        source_hash = source_hashes.setdefault(source, sha256(source))
        source_infos[source] = info
        first = round(start_s * SAMPLE_RATE)
        last = round(end_s * SAMPLE_RATE)
        name = f"{case_id}.wav"
        crop = crop_dir / name
        with wave.open(str(source), "rb") as src, wave.open(str(crop), "wb") as dst:
            dst.setnchannels(CHANNELS)
            dst.setsampwidth(SAMPLE_WIDTH)
            dst.setframerate(SAMPLE_RATE)
            src.setpos(first)
            dst.writeframes(src.readframes(last - first))
        cinfo = wav_info(crop)
        if cinfo["frames"] != last - first:
            raise RuntimeError(f"Unexpected cropped frame count for {case_id}")
        cases.append({
            "id": case_id,
            "label": label,
            "audioFile": str(crop.relative_to(RUN)).replace("\\", "/"),
            "inputSha256": sha256(crop),
            "startSeconds": start_s,
            "duration": cinfo["duration"],
            "sourcePath": str(source.relative_to(ROOT)).replace("\\", "/"),
            "sourceSha256": source_hash,
            "sourceAudio": info,
            "cropAudio": cinfo,
            "cropFrameRange": [first, last],
            "exactZeroRunsLocal": zero_runs(crop),
        })
    fw_revision = (FW_CACHE / "refs/main").read_text(encoding="ascii").strip()
    fw_snapshot = FW_CACHE / "snapshots" / fw_revision
    fw_config = fw_snapshot / "config.json"
    align_model = snapshot_model()
    preflight = {
        "schema": 1,
        "stage": "pre-inference-frozen-inputs-settings-models-target-rule",
        "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "cases": cases,
        "settings": {
            "recognizer": {
                "implementation": "services/stt_studio/studio_app/server.py::_transcribe",
                "model": "large-v3",
                "modelRevision": fw_revision,
                "modelConfigSha256": sha256(fw_config),
                "modelWeightsSha256": sha256(fw_snapshot / "model.bin"),
                "modelSnapshot": str(fw_snapshot),
                "codeSha256": sha256(ROOT / "services/stt_studio/studio_app/server.py"),
                "device": "cpu",
                "computeType": "int8",
                "cpuThreads": CPU_THREADS,
                "language": "vi",
                "beamSize": 5,
                "patience": 1,
                "conditionOnPreviousText": False,
                "wordTimestamps": True,
                "vadFilter": True,
                "hallucinationSilenceThreshold": 1.0,
                "refinement": "capture native words immediately before and edge-refined words immediately after the production _refine_word_boundaries call in the same _transcribe pass",
            },
            "aligner": {
                "implementation": "WhisperX load_align_model + align, separate process after protocol freeze",
                "model": align_model,
                "device": "cpu",
                "localFilesOnly": True,
                "textInput": "single segment containing exact native recognizer transcript, start 0, end crop duration",
                "wordMapping": "map to native IDs only if normalized token sequence and count match exactly; otherwise all candidate IDs null",
                "nltkData": str(NLTK_DATA),
                "nltkPunktEnglishResourceHashes": {p.name: sha256(p) for p in sorted((NLTK_DATA / "tokenizers/punkt_tab/english").glob("*")) if p.is_file()},
            },
            "offline": {"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HOME": str(ROOT / ".cache/huggingface"), "HUGGINGFACE_HUB_CACHE": str(ROOT / ".cache/huggingface/hub")},
            "threadLimits": {"OMP_NUM_THREADS": CPU_THREADS, "MKL_NUM_THREADS": CPU_THREADS, "OPENBLAS_NUM_THREADS": 1, "torchIntraThreads": CPU_THREADS, "torchInterThreads": 2},
            "targetSelection": {
                "evenlySpacedPerCase": 8,
                "includeEveryNativeWordDurationLessThanSeconds": 0.025,
                "includeEveryNativeWordWhollyInsideExactZeroPcm": True,
                "targetLabelsAre": "ASR hypotheses, not truth",
                "manualAnchorTimestampsPrefilled": False,
            },
        },
        "budgets": BUDGETS,
        "targetSelection": {"status": "pending-native-recognition; protocol.json will be written and hashed before aligner model load"},
        "software": metadata_versions(sys.executable),
        "constraints": {"sourceAudioCopiedWithoutResampling": True, "sourceProjectsModified": False, "ownerServicesUsed": False, "gpuUsed": False, "inferenceStarted": False},
    }
    write_json(RUN / "protocol-preflight.json", preflight)
    print(json.dumps({"created": str(RUN), "cases": [{"id": c["id"], "sha256": c["inputSha256"], "audio": c["cropAudio"], "zeroRuns": len(c["exactZeroRunsLocal"])} for c in cases], "alignerRevision": align_model["revision"], "alignerWeightsSha256": align_model["weights"]["sha256"]}, ensure_ascii=False, indent=2))


class PeakWorkingSet:
    """Sample per-phase Windows RSS without requiring psutil in this runtime."""
    def __init__(self, interval: float = 0.05):
        self.interval = interval
        self.peak = 0
        self.error: str | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @staticmethod
    def current_bytes() -> int:
        class Counters(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong),
                ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ("PrivateUsage", ctypes.c_size_t),
            ]
        counters = Counters()
        counters.cb = ctypes.sizeof(Counters)
        get_process = ctypes.windll.kernel32.GetCurrentProcess
        get_process.restype = ctypes.c_void_p
        process = ctypes.windll.kernel32.GetCurrentProcess()
        get_info = ctypes.windll.psapi.GetProcessMemoryInfo
        get_info.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
        get_info.restype = ctypes.c_int
        ok = get_info(process, ctypes.byref(counters), counters.cb)
        if not ok:
            raise OSError(ctypes.get_last_error(), "GetProcessMemoryInfo failed")
        return int(counters.WorkingSetSize)

    def _sample(self) -> None:
        while not self._stop.is_set():
            try:
                self.peak = max(self.peak, self.current_bytes())
            except Exception as exc:
                self.error = f"{type(exc).__name__}: {exc}"
                return
            self._stop.wait(self.interval)

    def __enter__(self):
        try:
            self.peak = self.current_bytes()
            self._thread = threading.Thread(target=self._sample, daemon=True)
            self._thread.start()
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
        return self

    def __exit__(self, *_exc):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=1)
        try:
            self.peak = max(self.peak, self.current_bytes())
        except Exception as exc:
            self.error = self.error or f"{type(exc).__name__}: {exc}"


def configure_offline_cpu() -> None:
    os.environ.update({
        "PRO4BRO_STUDIO_ROOT": str(ROOT / ".runtime/omnivoice-studio"),
        "PRO4BRO_STT_MODEL_ROOT": str(ROOT / ".runtime/omnivoice-studio/models"),
        "PRO4BRO_STT_MODEL": "large-v3",
        "PRO4BRO_STT_LANGUAGE": "vi",
        "PRO4BRO_STT_DEVICE": "cpu",
        "PRO4BRO_STT_COMPUTE_TYPE": "int8",
        "HF_HOME": str(ROOT / ".cache/huggingface"),
        "HUGGINGFACE_HUB_CACHE": str(ROOT / ".cache/huggingface/hub"),
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "NLTK_DATA": str(NLTK_DATA),
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "OMP_NUM_THREADS": str(CPU_THREADS),
        "MKL_NUM_THREADS": str(CPU_THREADS),
        "OPENBLAS_NUM_THREADS": "1",
        "PYTHONUTF8": "1",
    })


def global_words(words: list[dict[str, Any]], start_seconds: float, case_id: str) -> list[dict[str, Any]]:
    output = []
    for i, word in enumerate(words):
        output.append({
            "id": f"{case_id}.w{i:04d}",
            "text": str(word.get("text") or "").strip(),
            "start": round(start_seconds + float(word["start"]), 6),
            "end": round(start_seconds + float(word["end"]), 6),
            "confidence": word.get("confidence"),
            "timingSource": word.get("timingSource"),
            "segmentIndex": word.get("segmentIndex"),
        })
    return output


def norm_token(value: str) -> str:
    token = unicodedata.normalize("NFKC", value).casefold().strip()
    while token and unicodedata.category(token[0]).startswith("P"):
        token = token[1:]
    while token and unicodedata.category(token[-1]).startswith("P"):
        token = token[:-1]
    return token


def exact_zero_word(word: dict[str, Any], samples: array.array, rate: int, source_offset: float) -> bool:
    start = max(0, math.floor((float(word["start"]) - source_offset) * rate))
    end = min(len(samples), math.ceil((float(word["end"]) - source_offset) * rate))
    return end > start and all(sample == 0 for sample in samples[start:end])


def choose_targets(case_id: str, words: list[dict[str, Any]], crop: Path, source_offset: float) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    with wave.open(str(crop), "rb") as wav:
        samples = array.array("h")
        samples.frombytes(wav.readframes(wav.getnframes()))
        rate = wav.getframerate()
    if sys.byteorder != "little":
        samples.byteswap()
    indexes: dict[int, set[str]] = {}
    n = len(words)
    for i in range(8):
        if n:
            index = round(i * (n - 1) / 7)
            indexes.setdefault(index, set()).add("evenly-spaced")
    for i, word in enumerate(words):
        if float(word["end"]) - float(word["start"]) < 0.025:
            indexes.setdefault(i, set()).add("native-duration-under-25ms")
        if exact_zero_word(word, samples, rate, source_offset):
            indexes.setdefault(i, set()).add("wholly-in-exact-zero-pcm")
    selected = []
    detail = []
    for i in sorted(indexes):
        word = words[i]
        selected.append({"id": word["id"], "case": case_id, "text": word["text"]})
        detail.append({"id": word["id"], "case": case_id, "nativeIndex": i, "reasons": sorted(indexes[i]), "text": word["text"]})
    return selected, detail


def recognize() -> None:
    configure_offline_cpu()
    preflight_path = RUN / "protocol-preflight.json"
    if not preflight_path.is_file():
        raise FileNotFoundError("Run `prepare` first; no native inference was attempted.")
    for name in ("protocol.json", "recognition-started.json", "native.json", "edge.json"):
        if (RUN / name).exists():
            raise FileExistsError(f"Refusing to overwrite recognition evidence: {RUN / name}")
    preflight = read_json(preflight_path)
    recognizer = preflight["settings"]["recognizer"]
    for name, key in (("config.json", "modelConfigSha256"), ("model.bin", "modelWeightsSha256")):
        if sha256(Path(recognizer["modelSnapshot"]) / name) != recognizer[key]:
            raise RuntimeError(f"Frozen recognizer model resource changed: {name}")
    if sha256(ROOT / "services/stt_studio/studio_app/server.py") != recognizer["codeSha256"]:
        raise RuntimeError("Studio implementation changed after preflight freeze")
    with (RUN / "recognition-started.json").open("x", encoding="utf-8") as stream:
        json.dump({"preflightSha256": sha256(preflight_path), "startedAtUtc": datetime.now(timezone.utc).isoformat()}, stream)
    sys.path.insert(0, str(ROOT / "services/stt_studio"))
    from copy import deepcopy
    import faster_whisper
    from studio_app import server

    expected_server = (ROOT / "services/stt_studio/studio_app/server.py").resolve()
    if Path(server.__file__).resolve() != expected_server:
        raise RuntimeError(f"Imported unexpected Studio code: {server.__file__}")
    server_source_hash = sha256(expected_server)
    original_refiner = server._refine_word_boundaries
    original_whisper_model = faster_whisper.WhisperModel
    captures: dict[str, Any] = {}

    def limited_threads_whisper_model(*args, **kwargs):
        kwargs["cpu_threads"] = CPU_THREADS
        return original_whisper_model(*args, **kwargs)

    def capture_refiner(words, spans):
        case_id = getattr(capture_refiner, "case_id", "unknown")
        captures[case_id] = {"native": deepcopy(words), "speechSpans": deepcopy(spans)}
        count = original_refiner(words, spans)
        captures[case_id]["edge"] = deepcopy(words)
        captures[case_id]["refinedGroups"] = count
        return count

    faster_whisper.WhisperModel = limited_threads_whisper_model
    server._refine_word_boundaries = capture_refiner
    native_cases: dict[str, Any] = {}
    edge_cases: dict[str, Any] = {}
    proxy_cases: dict[str, Any] = {}
    recognition_results = []
    selected_targets = []
    target_details = []
    source_after = {}
    try:
        for case in preflight["cases"]:
            case_id = case["id"]
            crop = RUN / case["audioFile"]
            if sha256(crop) != case["inputSha256"]:
                raise RuntimeError(f"Frozen crop hash changed before recognition: {case_id}")
            capture_refiner.case_id = case_id
            started = time.perf_counter()
            with PeakWorkingSet() as memory:
                item = server._transcribe(crop, f"timing-{case_id}", model_name="large-v3", language="vi")
            elapsed = time.perf_counter() - started
            captured = captures.get(case_id, {"native": [], "edge": [], "speechSpans": [], "refinedGroups": 0})
            local_native = captured.get("native", [])
            local_edge = captured.get("edge", item.get("words", []))
            native_words = global_words(local_native, case["startSeconds"], case_id)
            edge_words = global_words(local_edge, case["startSeconds"], case_id)
            native_word_text = " ".join(w["text"] for w in native_words)
            edge_word_text = " ".join(w["text"] for w in edge_words)
            native_cases[case_id] = {"transcript": item.get("text", ""), "timedWordsTranscript": native_word_text, "transcriptMatchesTimedWords": norm_token(str(item.get("text") or "")) == norm_token(native_word_text), "language": item.get("language"), "model": item.get("model"), "timingQuality": item.get("word_timing_quality"), "words": native_words}
            edge_cases[case_id] = {"transcript": item.get("text", ""), "timedWordsTranscript": edge_word_text, "transcriptMatchesTimedWords": norm_token(str(item.get("text") or "")) == norm_token(edge_word_text), "language": item.get("language"), "model": item.get("model"), "timingQuality": item.get("word_timing_quality"), "words": edge_words}
            proxy_cases[case_id] = [{"start": round(case["startSeconds"] + float(s), 6), "end": round(case["startSeconds"] + float(e), 6), "kind": "unpadded-Silero-proxy-not-ground-truth"} for s, e in captured.get("speechSpans", [])]
            targets, details = choose_targets(case_id, native_words, crop, case["startSeconds"])
            selected_targets.extend(targets)
            target_details.extend(details)
            source_path = ROOT / case["sourcePath"]
            source_after[case["sourcePath"]] = sha256(source_path)
            recognition_results.append({
                "case": case_id,
                "status": "complete",
                "elapsedSeconds": round(elapsed, 3),
                "peakWorkingSetBytes": memory.peak or None,
                "peakMemoryError": memory.error,
                "wordCount": len(native_words),
                "edgeWordCount": len(edge_words),
                "refinedPhraseGroups": captured.get("refinedGroups", 0),
                "speechSpanCount": len(captured.get("speechSpans", [])),
                "transcript": item.get("text", ""),
                "sourceHashAfter": source_after[case["sourcePath"]],
            })
            print(f"native {case_id}: words={len(native_words)} refined={captured.get('refinedGroups',0)} elapsed={elapsed:.2f}s peakRSS={memory.peak or 'unavailable'}", flush=True)
            del item, native_words, edge_words, local_native, local_edge
    except Exception as exc:
        write_json(RUN / "recognition-error.json", {"type": type(exc).__name__, "message": str(exc), "completedCases": recognition_results})
        raise
    finally:
        server._refine_word_boundaries = original_refiner
        faster_whisper.WhisperModel = original_whisper_model
        try:
            server.loaded_models.clear()
            server.loaded_model = None
            server.loaded_model_name = None
            server.loaded_device = None
            server.loaded_model_names = ()
        except Exception:
            pass

    write_json(RUN / "native.json", {"schema": 1, "clock": "global source seconds", "cases": native_cases})
    write_json(RUN / "edge.json", {"schema": 1, "clock": "global source seconds", "cases": edge_cases})
    write_json(RUN / "proxy-onsets.json", {"schema": 1, "provenance": "Silero VAD spans passed to the refiner; proxy only, never human word truth", "cases": proxy_cases})
    protocol = {
        "schema": 1,
        "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        "cases": [{k: case[k] for k in ("id", "label", "audioFile", "inputSha256", "startSeconds", "duration")} for case in preflight["cases"]],
        "targets": selected_targets,
        "budgets": BUDGETS,
        "targetProvenance": "Selected from native recognizer hypotheses; not reviewed word-boundary truth. Target objects contain no prefilled timestamps.",
        "targetSelectionDetails": target_details,
        "frozenInputsSettingsAndModels": preflight,
        "recognizerCodeSha256": server_source_hash,
    }
    write_json(RUN / "protocol.json", protocol)
    protocol_hash = sha256(RUN / "protocol.json")
    write_json(RUN / "recognition-results.json", {
        "stage": "native-recognition-complete; aligner not loaded",
        "protocolSha256": protocol_hash,
        "software": metadata_versions(sys.executable),
        "serverSource": str(expected_server),
        "serverSourceSha256": server_source_hash,
        "device": "cpu",
        "computeType": "int8",
        "cpuThreads": CPU_THREADS,
        "cases": recognition_results,
        "sourceHashesBeforeAndAfterEqual": all(x["sourceSha256"] == source_after.get(x["sourcePath"]) for x in preflight["cases"]),
        "targetsFrozenBeforeAlignerLoad": True,
        "alignerLoaded": False,
        "gpuUsed": False,
    })
    print(f"protocol frozen {protocol_hash}; targets={len(selected_targets)}; aligner not loaded", flush=True)


def expected_native_words(native_words: list[dict[str, Any]], words_global: list[dict[str, Any]], same_sequence: bool) -> list[dict[str, Any]]:
    """Project candidate intervals already in source seconds; never offset twice."""
    return [
        {"id": word["id"], "text": word["text"],
         "start": words_global[i]["start"] if same_sequence else None,
         "end": words_global[i]["end"] if same_sequence else None}
        for i, word in enumerate(native_words)
    ]


def align() -> None:
    for name in ("aligned.json", "results.json", "alignment-started.json"):
        if (RUN / name).exists():
            raise FileExistsError(f"Refusing to overwrite candidate evidence: {RUN / name}")
    configure_offline_cpu()
    protocol_path = RUN / "protocol.json"
    if not protocol_path.is_file() or not (RUN / "native.json").is_file() or not (RUN / "edge.json").is_file():
        raise FileNotFoundError("Need frozen protocol.json plus native.json and edge.json before aligner load.")
    protocol_hash = sha256(protocol_path)
    protocol = read_json(protocol_path)
    preflight = protocol["frozenInputsSettingsAndModels"]
    for case in preflight["cases"]:
        crop = RUN / case["audioFile"]
        if sha256(crop) != case["inputSha256"]:
            raise RuntimeError(f"Frozen crop hash changed before alignment: {case['id']}")
    native_data = read_json(RUN / "native.json")["cases"]
    align_model_info = preflight["settings"]["aligner"]["model"]
    snapshot = Path(align_model_info["snapshot"])
    if sha256(snapshot / "pytorch_model.bin") != align_model_info["weights"]["sha256"]:
        raise RuntimeError("Cached aligner model weights changed after protocol freeze.")
    for name, metadata_row in align_model_info["files"].items():
        if sha256(snapshot / name) != metadata_row["sha256"]:
            raise RuntimeError(f"Cached aligner resource changed after protocol freeze: {name}")
    nltk_settings = preflight["settings"]["aligner"]
    for name, digest in nltk_settings["nltkPunktEnglishResourceHashes"].items():
        resource = Path(nltk_settings["nltkData"]) / "tokenizers/punkt_tab/english" / name
        if sha256(resource) != digest:
            raise RuntimeError(f"Frozen tokenizer resource changed: {name}")
    with (RUN / "alignment-started.json").open("x", encoding="utf-8") as stream:
        json.dump({"protocolSha256": protocol_hash, "startedAtUtc": datetime.now(timezone.utc).isoformat()}, stream)
    import torch
    torch.set_num_threads(CPU_THREADS)
    torch.set_num_interop_threads(2)
    import whisperx

    align_started = time.perf_counter()
    with PeakWorkingSet() as model_memory:
        model, metadata = whisperx.load_align_model(
            language_code="vi", device="cpu", model_name=str(snapshot), model_cache_only=True,
        )
    model_load_seconds = time.perf_counter() - align_started
    aligned_cases: dict[str, Any] = {}
    per_case = []
    status_errors = []
    for case in protocol["cases"]:
        case_id = case["id"]
        crop = RUN / case["audioFile"]
        native = native_data[case_id]
        transcript = str(native.get("transcript") or "")
        started = time.perf_counter()
        try:
            audio = whisperx.load_audio(str(crop))
            segment = {"text": transcript, "start": 0.0, "end": float(case["duration"])}
            with PeakWorkingSet() as case_memory:
                result = whisperx.align([segment], model, metadata, audio, "cpu", return_char_alignments=False)
            elapsed = time.perf_counter() - started
            candidate = []
            for seg in result.get("segments", []):
                for word in seg.get("words", []) or []:
                    candidate.append({
                        "text": str(word.get("word") or "").strip(),
                        "start": word.get("start"),
                        "end": word.get("end"),
                        "score": word.get("score"),
                    })
            native_words = native.get("words", [])
            native_tokens = [norm_token(str(w.get("text") or "")) for w in native_words]
            candidate_tokens = [norm_token(str(w.get("text") or "")) for w in candidate]
            same_sequence = len(native_tokens) == len(candidate_tokens) and native_tokens == candidate_tokens
            if same_sequence:
                for i, word in enumerate(candidate):
                    word["id"] = native_words[i]["id"]
            else:
                for word in candidate:
                    word["id"] = None
            words_global = []
            timed_count = 0
            for word in candidate:
                start = word["start"]
                end = word["end"]
                if start is not None and end is not None:
                    word["start"] = round(case["startSeconds"] + float(start), 6)
                    word["end"] = round(case["startSeconds"] + float(end), 6)
                    timed_count += 1
                else:
                    word["start"] = None
                    word["end"] = None
                words_global.append(word)
            scores = [float(w["score"]) for w in candidate if w.get("score") is not None]
            aligned_cases[case_id] = {
                "status": "complete",
                "clock": "global source seconds",
                "transcript": transcript,
                "nativeWordCount": len(native_words),
                "candidateWordCount": len(candidate),
                "timedCandidateWordCount": timed_count,
                "tokenSequenceExact": same_sequence,
                "mappingStatus": "mapped-by-exact-token-sequence" if same_sequence else "unmatched-no-positional-mapping",
                "firstTokenMismatch": next((i for i,(x,y) in enumerate(zip(native_tokens,candidate_tokens)) if x!=y), None) if not same_sequence else None,
                "expectedNativeWords": expected_native_words(native_words, words_global, same_sequence),
                "words": words_global,
            }
            per_case.append({
                "case": case_id,
                "status": "complete",
                "elapsedSeconds": round(elapsed, 3),
                "peakWorkingSetBytes": case_memory.peak or None,
                "peakMemoryError": case_memory.error,
                "nativeWordCount": len(native_words),
                "candidateWordCount": len(candidate),
                "rawTimedCandidateWordCount": timed_count,
                "rawTimingCoverageAgainstCandidateCount": round(timed_count / len(candidate), 6) if candidate else 0.0,
                "safeMappedTimedWordCount": timed_count if same_sequence else 0,
                "safeMappedCoverageAgainstNativeCount": round(timed_count / len(native_words), 6) if same_sequence and native_words else 0.0,
                "confidenceAboveFloorCount": sum(1 for x in scores if x > 0.3),
                "confidenceCount": len(scores),
                "confidenceFractionAboveFloor": round(sum(1 for x in scores if x > 0.3) / len(candidate), 6) if candidate else None,
                "tokenSequenceExact": same_sequence,
                "mappingStatus": aligned_cases[case_id]["mappingStatus"],
            })
            print(f"align {case_id}: native={len(native_words)} aligned={len(candidate)} timed={timed_count} tokenMap={same_sequence} elapsed={elapsed:.2f}s", flush=True)
        except Exception as exc:
            status_errors.append({"case": case_id, "type": type(exc).__name__, "message": str(exc)})
            aligned_cases[case_id] = {"status": "failed", "errorType": type(exc).__name__, "error": str(exc), "words": []}
            per_case.append({"case": case_id, "status": "failed", "type": type(exc).__name__, "message": str(exc)})
    write_json(RUN / "aligned.json", {"schema": 1, "clock": "global source seconds", "candidateModel": align_model_info, "cases": aligned_cases})
    results = {
        "schema": 1,
        "protocolSha256": protocol_hash,
        "startedAtUtc": datetime.now(timezone.utc).isoformat(),
        "aligner": {
            "modelId": align_model_info["id"],
            "revision": align_model_info["revision"],
            "weightsSha256": align_model_info["weights"]["sha256"],
            "device": "cpu",
            "localFilesOnly": True,
            "pipelineType": metadata.get("type"),
            "language": "vi",
            "loadSeconds": round(model_load_seconds, 3),
            "loadPeakWorkingSetBytes": model_memory.peak or None,
            "loadPeakMemoryError": model_memory.error,
            "torchThreads": {"intra": CPU_THREADS, "inter": 2},
        },
        "recognizer": read_json(RUN / "recognition-results.json"),
        "cases": per_case,
        "errors": status_errors,
        "timingTruthStatus": "unmeasured-without-human-reviewed-word-anchors",
        "vadSpansStatus": "proxy-only; not ground-truth word boundaries",
        "alignedOutputPublished": False,
        "gpuUsed": False,
    }
    write_json(RUN / "results.json", results)
    print(json.dumps({"results": str(RUN / "results.json"), "errors": status_errors, "cases": per_case}, ensure_ascii=False, indent=2), flush=True)
    del model
    gc = __import__("gc")
    gc.collect()
    if status_errors:
        raise RuntimeError(f"Alignment had {len(status_errors)} failed case(s); see results.json")


def main() -> int:
    global RUN
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("prepare", "recognize", "align"))
    parser.add_argument("--output", type=Path, default=RUN,
                        help="Fresh run directory inside .scratch/stt-timing-accuracy-01")
    args = parser.parse_args()
    RUN = args.output.resolve()
    private_root = (ROOT / ".scratch/stt-timing-accuracy-01").resolve()
    if RUN == private_root or not RUN.is_relative_to(private_root):
        parser.error("Run directory must be a child of .scratch/stt-timing-accuracy-01")
    if args.phase == "prepare":
        prepare()
    elif args.phase == "recognize":
        recognize()
    else:
        align()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
