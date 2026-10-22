"""Offline stable-ts and EasyAligner subtitle alignment; never edits source text/audio."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import sys
import time
import unicodedata
import wave


STABLE_MODELS = {"tiny", "base", "small", "medium", "large-v3"}
LANGUAGES = {"vi", "en"}
SAMPLE_RATE = 16000


def lexical_token(value: str) -> str:
    """Normalize punctuation/case for identity checks while preserving source text."""
    value = unicodedata.normalize("NFC", value).casefold()
    return "".join(char for char in value if unicodedata.category(char)[0] in "LN")


def alignment_token(value: str, case: str) -> str:
    """Strip punctuation while encoding text in the tokenizer's actual letter case."""
    normalized = unicodedata.normalize("NFC", value)
    token = "".join(char for char in normalized if unicodedata.category(char)[0] in "LN")
    return token.upper() if case == "upper" else token.lower() if case == "lower" else token


def tokenizer_case(vocabulary: set[str]) -> str:
    letters = {char for token in vocabulary for char in token if char.isalpha() and len(char) == 1}
    lower = sum(char.islower() for char in letters)
    upper = sum(char.isupper() for char in letters)
    if upper and not lower:
        return "upper"
    if lower and not upper:
        return "lower"
    return "mixed"


def configure_alignment_heads(model, model_name: str, heads_by_model: dict) -> None:
    """Restore Whisper's official alignment-head preset for a locally loaded checkpoint."""
    heads = heads_by_model.get(model_name)
    setter = getattr(model, "set_alignment_heads", None)
    if heads is None or not callable(setter):
        raise RuntimeError(f"Whisper alignment heads are unavailable for {model_name}")
    setter(heads)


def run_window(group: dict, indexes: list[int], words: list[dict], padding_seconds: float) -> tuple[float, float]:
    """Bound an alignment run to its own source word times, within its context group."""
    start = max(float(group["start"]), float(words[indexes[0]]["start"]) - padding_seconds)
    end = min(float(group["end"]), float(words[indexes[-1]]["end"]) + padding_seconds)
    return start, end


def resolve_project_audio(project_root: Path, audio_path: str) -> Path:
    root = project_root.resolve(strict=True)
    if not isinstance(audio_path, str) or not audio_path.strip():
        raise ValueError("Audio path must be a project-relative path")
    candidate = Path(audio_path)
    if candidate.is_absolute():
        raise ValueError("Audio path must be project-relative")
    audio = (root / candidate).resolve()
    if not audio.is_relative_to(root) or not audio.is_file():
        raise ValueError("Audio escapes project")
    return audio.resolve(strict=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_indexes(indexes: object, word_count: int) -> list[int] | None:
    if indexes is None:
        return None
    if (not isinstance(indexes, list) or any(not isinstance(item, int) or isinstance(item, bool)
                                             or item < 0 or item >= word_count for item in indexes)):
        raise ValueError("Requested word indexes are invalid")
    if len(set(indexes)) != len(indexes):
        raise ValueError("Requested word indexes contain duplicates")
    return indexes


def make_groups(words: list[dict], duration: float, window_seconds: float, padding_seconds: float) -> list[dict]:
    """Group ordered words by their existing times without crossing invalid gaps/windows."""
    groups: list[list[int]] = []
    current: list[int] = []
    for index, word in enumerate(words):
        start, end = word.get("start"), word.get("end")
        valid = (isinstance(start, (int, float)) and not isinstance(start, bool)
                 and isinstance(end, (int, float)) and not isinstance(end, bool)
                 and math.isfinite(float(start)) and math.isfinite(float(end))
                 and 0 <= float(start) < float(end) <= duration)
        if not valid:
            if current:
                groups.append(current)
                current = []
            continue
        if current:
            first = float(words[current[0]]["start"])
            previous = current[-1]
            if index != previous + 1 or float(end) - first > window_seconds:
                groups.append(current)
                current = []
        current.append(index)
    if current:
        groups.append(current)
    return [{"indexes": indexes,
             "start": max(0.0, min(float(words[i]["start"]) for i in indexes) - padding_seconds),
             "end": min(duration, max(float(words[i]["end"]) for i in indexes) + padding_seconds)}
            for indexes in groups]


def map_exact_group(words: list[dict], indexes: list[int], measured: list[dict]) -> tuple[list[dict] | None, str]:
    """Return mappings only when both count and lexical sequence match exactly."""
    if len(indexes) != len(measured):
        return None, "word-count-mismatch"
    expected = [lexical_token(words[index]["text"]) for index in indexes]
    actual = [lexical_token(str(row.get("text", ""))) for row in measured]
    if not all(expected) or expected != actual:
        return None, "token-mismatch"
    result = []
    for row in measured:
        start, end, score = row.get("start"), row.get("end"), row.get("score")
        if (not isinstance(start, (int, float)) or isinstance(start, bool)
                or not isinstance(end, (int, float)) or isinstance(end, bool)
                or not math.isfinite(float(start)) or not math.isfinite(float(end))
                or float(start) < 0 or float(end) <= float(start)):
            return None, "invalid-timing"
        result.append({"start": float(start), "end": float(end),
                       "score": float(score) if isinstance(score, (int, float)) and not isinstance(score, bool)
                       and math.isfinite(float(score)) else None})
    return result, "aligned"


def split_supported_runs(indexes: list[int], words: list[dict], vocabulary: set[str], case: str | None = None) -> tuple[list[list[int]], list[int]]:
    """Split at unsupported words so omitted vocabulary never shifts neighboring indexes."""
    case = case or tokenizer_case(vocabulary)
    runs: list[list[int]] = []
    unknown: list[int] = []
    current: list[int] = []
    for index in indexes:
        token = alignment_token(words[index]["text"], case)
        if not token or any(char not in vocabulary for char in token):
            if current:
                runs.append(current)
                current = []
            unknown.append(index)
        else:
            if current and index != current[-1] + 1:
                runs.append(current)
                current = []
            current.append(index)
    if current:
        runs.append(current)
    return runs, unknown


def read_pcm16_mono(path: Path):
    import numpy as np

    with wave.open(str(path), "rb") as source:
        if source.getcomptype() != "NONE" or source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError("Neural subtitle alignment requires uncompressed PCM16 mono WAV")
        source_rate, expected_frames = source.getframerate(), source.getnframes()
        if source_rate <= 0 or expected_frames <= 0:
            raise ValueError("Audio WAV is empty or has an invalid sample rate")
        pcm = source.readframes(expected_frames + 1)
        if len(pcm) != expected_frames * 2:
            raise ValueError("Audio WAV frame count does not match its header")
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    if source_rate != SAMPLE_RATE:
        import torch
        import torchaudio.functional as audio_functional

        samples = audio_functional.resample(torch.from_numpy(samples), source_rate, SAMPLE_RATE).cpu().numpy()
    if samples.size == 0 or not np.isfinite(samples).all():
        raise ValueError("Audio resampling produced invalid PCM")
    return samples, float(samples.size / SAMPLE_RATE), source_rate


def _groups_for_selection(groups: list[dict], indexes: list[int] | None) -> list[dict]:
    selected = set(indexes) if indexes is not None else None
    return [group for group in groups if selected is None or selected.intersection(group["indexes"])]


def _set_cpu_threads(torch) -> None:
    torch.set_num_threads(4)
    try:
        torch.set_num_interop_threads(2)
    except RuntimeError:
        # A previous library call may already have initialized the inter-op pool.
        pass


def _stable_align(payload: dict, samples, groups: list[dict], runtime_root: Path) -> tuple[list[dict], list[dict], str]:
    import numpy as np
    import torch
    import stable_whisper

    settings = payload["settings"]
    model_name = settings.get("model", "base")
    language = settings.get("language")
    if model_name not in STABLE_MODELS or language not in LANGUAGES:
        raise ValueError("Unsupported stable-ts model or language")
    model_path = (runtime_root / "models" / "stable-ts" / f"{model_name}.pt").resolve(strict=True)
    if not model_path.is_relative_to(runtime_root) or not model_path.is_file():
        raise ValueError("stable-ts model is missing or outside the managed runtime")
    _set_cpu_threads(torch)
    model = stable_whisper.load_model(str(model_path), device="cpu")
    import whisper
    configure_alignment_heads(model, model_name, whisper._ALIGNMENT_HEADS)
    output = [{"text": word["text"], "start": None, "end": None, "score": None} for word in payload["words"]]
    diagnostics = []
    for group in _groups_for_selection(groups, payload["indexes"]):
        selected_indexes = group["indexes"]
        start_sample = max(0, round(group["start"] * SAMPLE_RATE))
        end_sample = min(len(samples), round(group["end"] * SAMPLE_RATE))
        audio_slice = np.asarray(samples[start_sample:end_sample], dtype=np.float32)
        if end_sample <= start_sample or not audio_slice.size:
            diagnostics.append({**group, "status": "empty-window"})
            continue
        text = " ".join(payload["words"][index]["text"] for index in selected_indexes)
        result = model.align(audio_slice, text, language=language, original_split=True,
                             max_word_dur=float(settings.get("maxWordDuration", 3)))
        if settings.get("refine", True):
            result = model.refine(audio_slice, result, precision=float(settings.get("precision", 0.1)),
                                  verbose=None)
        measured = []
        for word in result.all_words():
            measured.append({"text": word.word, "start": word.start + group["start"],
                             "end": word.end + group["start"], "score": getattr(word, "probability", None)})
        mapped, status = map_exact_group(payload["words"], selected_indexes, measured)
        if mapped:
            for index, row in zip(selected_indexes, mapped):
                output[index].update(row)
        diagnostics.append({**group, "status": status})
    return output, diagnostics, model_name


def _easyaligner_align(payload: dict, samples, groups: list[dict], runtime_root: Path) -> tuple[list[dict], list[dict], str]:
    import numpy as np
    import torch
    from transformers import AutoModelForCTC, Wav2Vec2Processor

    engine_root = runtime_root.resolve(strict=True)
    from easyaligner.alignment.pytorch import get_word_spans, get_word_timing, align_pytorch

    settings = payload["settings"]
    language = settings.get("language")
    if language not in LANGUAGES:
        raise ValueError("Unsupported EasyAligner language")
    model_path = (engine_root / "models" / "easyaligner" / language).resolve(strict=True)
    if not model_path.is_relative_to(engine_root) or not model_path.is_dir():
        raise ValueError("EasyAligner model is missing or outside the managed runtime")
    processor = Wav2Vec2Processor.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False)
    _set_cpu_threads(torch)
    model = AutoModelForCTC.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False).to("cpu").eval()
    vocab = processor.tokenizer.get_vocab()
    case = tokenizer_case(set(vocab))
    unk = processor.tokenizer.unk_token_id
    output = [{"text": word["text"], "start": None, "end": None, "score": None} for word in payload["words"]]
    diagnostics = []
    for group in _groups_for_selection(groups, payload["indexes"]):
        # Unsupported vocabulary tokens break correspondence, so leave those words null and
        # align only contiguous supported runs. This cannot shift later word indexes.
        runs, unknown_indexes = split_supported_runs(group["indexes"], payload["words"], set(vocab), case)
        normal_by_index = {index: alignment_token(payload["words"][index]["text"], case) for run in runs for index in run}
        diagnostics.extend({"indexes": [index], "status": "unknown-token"} for index in unknown_indexes)
        for indexes in runs:
            padding = float(settings.get("paddingSeconds", 0.5))
            window_start, window_end = run_window(group, indexes, payload["words"], padding)
            start_sample = max(0, round(window_start * SAMPLE_RATE))
            end_sample = min(len(samples), round(window_end * SAMPLE_RATE))
            audio_slice = np.asarray(samples[start_sample:end_sample], dtype=np.float32)
            normalized_tokens = [normal_by_index[index] for index in indexes]
            mapping = []
            offset = 0
            for index, token in zip(indexes, normalized_tokens):
                mapping.append({"normalized_token": token, "text": payload["words"][index]["text"],
                                "start_char": offset, "end_char": offset + len(token)})
                offset += len(token) + 1
            try:
                encoded = processor.tokenizer(" ".join(normalized_tokens), return_tensors="pt")["input_ids"]
                if unk is not None and bool((encoded == unk).any()):
                    diagnostics.append({"indexes": indexes, "status": "unknown-token"})
                    continue
                values = processor(audio_slice, sampling_rate=SAMPLE_RATE, return_tensors="pt")
                with torch.inference_mode():
                    logits = model(**values).logits.log_softmax(dim=-1)
                blank_id = processor.tokenizer.pad_token_id
                tokens, scores = align_pytorch(normalized_tokens, processor, logits, blank_id,
                                               case=case, start_wildcard=False,
                                               end_wildcard=False, device="cpu")
                # Upstream returns forced_align log probabilities. Its word
                # support aggregation expects probabilities on a 0..1 scale.
                scores = scores.exp()
                spans, _ = get_word_spans(tokens, scores, mapping, blank=blank_id,
                                          start_wildcard=False, end_wildcard=False,
                                          word_boundary="|", processor=processor)
                frames_per_sample = len(audio_slice) / max(1, logits.shape[1])
                measured = []
                for span in spans:
                    start, end, score = get_word_timing(span, frames_per_logit=frames_per_sample,
                                                        start_segment=window_start,
                                                        sample_rate=SAMPLE_RATE)
                    measured.append({"text": "", "start": start, "end": end, "score": score})
                # get_word_spans returns spans in the supplied mapping order; restore lexical
                # identities explicitly before the shared exact text and timing validation.
                for row, index in zip(measured, indexes):
                    row["text"] = payload["words"][index]["text"]
                mapped, status = map_exact_group(payload["words"], indexes, measured)
                if mapped:
                    for index, row in zip(indexes, mapped):
                        output[index].update(row)
                diagnostics.append({"indexes": indexes, "start": window_start, "end": window_end, "status": status})
            except (AssertionError, RuntimeError, ValueError, IndexError) as exc:
                diagnostics.append({"indexes": indexes, "status": "alignment-failed", "reason": str(exc)[:300]})
    del model
    return output, diagnostics, language


def run_worker(payload: dict, project_root: Path, runtime_root: Path) -> dict:
    if payload.get("engineId") not in {"stable-ts", "easyaligner"}:
        raise ValueError("Neural worker accepts only stable-ts or easyaligner")
    settings = payload.get("settings")
    words = payload.get("words")
    if not isinstance(settings, dict) or not isinstance(words, list) or not words:
        raise ValueError("Alignment request needs settings and a non-empty word list")
    if any(not isinstance(word, dict) or not isinstance(word.get("text"), str) or not word["text"].strip() for word in words):
        raise ValueError("Alignment words need non-empty text")
    indexes = validate_indexes(payload.get("indexes"), len(words))
    if indexes == []:
        raise ValueError("Requested word indexes are empty")
    if payload["engineId"] == "stable-ts":
        model = settings.get("model", "base")
        language = settings.get("language")
        precision = settings.get("precision", 0.1)
        max_word_duration = settings.get("maxWordDuration", 3)
        refine = settings.get("refine", True)
        if model not in STABLE_MODELS or language not in LANGUAGES or not isinstance(refine, bool):
            raise ValueError("Unsupported stable-ts settings")
        if (not isinstance(precision, (int, float)) or isinstance(precision, bool)
                or not math.isfinite(float(precision)) or not 0.02 <= float(precision) <= 0.5
                or not isinstance(max_word_duration, (int, float)) or isinstance(max_word_duration, bool)
                or not math.isfinite(float(max_word_duration)) or not 0.1 <= float(max_word_duration) <= 10):
            raise ValueError("Invalid stable-ts refinement settings")
    elif settings.get("language") not in LANGUAGES:
        raise ValueError("Unsupported EasyAligner language")
    payload = {**payload, "indexes": indexes}
    audio = resolve_project_audio(project_root, payload.get("audioPath", ""))
    expected_hash = payload.get("audioSha256")
    if not isinstance(expected_hash, str) or sha256_file(audio) != expected_hash:
        raise ValueError("Audio changed or audio hash is missing")
    runtime_root = runtime_root.resolve(strict=True)
    samples, duration, source_rate = read_pcm16_mono(audio)
    engine = payload["engineId"]
    window = settings.get("windowSeconds", 20)
    padding = settings.get("paddingSeconds", 0.5 if engine == "easyaligner" else 1.0)
    if (not isinstance(window, (int, float)) or isinstance(window, bool) or not math.isfinite(float(window))
            or not 2 <= float(window) <= 30 or not isinstance(padding, (int, float)) or isinstance(padding, bool)
            or not math.isfinite(float(padding)) or not 0 <= float(padding) <= 2):
        raise ValueError("Invalid alignment window settings")
    groups = make_groups(words, duration, float(window), float(padding))
    started = time.perf_counter()
    if engine == "stable-ts":
        output, diagnostics, model_name = _stable_align(payload, samples, _groups_for_selection(groups, indexes), runtime_root)
    else:
        output, diagnostics, model_name = _easyaligner_align(payload, samples, _groups_for_selection(groups, indexes), runtime_root)
    requested = set(indexes if indexes is not None else range(len(output)))
    if not any(output[index]["start"] is not None for index in requested):
        raise RuntimeError("Neural aligner did not produce a measured timing for any requested word")
    if sha256_file(audio) != expected_hash:
        raise ValueError("Audio changed during alignment")
    versions = {name: _version(name) for name in ("torch", "torchaudio", "transformers")}
    versions["stable-ts" if engine == "stable-ts" else "easyaligner"] = _version("stable-ts" if engine == "stable-ts" else "easyaligner")
    alignment_pcm = samples.astype("<f4", copy=False).tobytes()
    return {"audioSha256": expected_hash, "words": output, "engine": engine, "model": model_name,
            "versions": versions, "groups": diagnostics, "elapsedSeconds": time.perf_counter() - started,
            "audio": {"sourceSampleRate": source_rate, "alignmentSampleRate": SAMPLE_RATE,
                      "channels": 1, "sampleFormat": "float32-normalized",
                      "alignmentPcmSha256": hashlib.sha256(alignment_pcm).hexdigest(),
                      "alignmentSamples": len(samples)}}


def _version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def main() -> None:
    if len(sys.argv) != 5:
        raise ValueError("Usage: worker INPUT_JSON OUTPUT_JSON PROJECT_ROOT RUNTIME_ROOT")
    input_path, output_path, project_root, runtime_root = map(Path, sys.argv[1:])
    if output_path.exists():
        raise FileExistsError("Alignment output already exists")
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    result = run_worker(payload, project_root, runtime_root)
    serialized = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(output_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(serialized)
        stream.flush()
        os.fsync(stream.fileno())


if __name__ == "__main__":
    main()
