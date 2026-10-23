"""Offline MFA transcript alignment. Reads source media and emits review evidence only."""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unicodedata
import wave


LANGUAGE_MODELS = {"vi": "vietnamese_mfa", "en": "english_mfa"}


def lexical_token(value: str) -> str:
    """Normalize token spelling only for alignment matching, never output text."""
    normalized = unicodedata.normalize("NFC", value).casefold()
    return "".join(char for char in normalized if unicodedata.category(char)[0] in "LN")


def resolve_project_audio(project_root: Path, audio_path: str) -> Path:
    root = project_root.resolve(strict=True)
    if Path(audio_path).is_absolute():
        raise ValueError("Audio path must be project-relative")
    audio = (root / audio_path).resolve(strict=True)
    if not audio.is_relative_to(root) or not audio.is_file():
        raise ValueError("Audio escapes project")
    return audio


def parse_mfa_json(data: object) -> list[tuple[float, float, str]]:
    if not isinstance(data, dict):
        raise ValueError("MFA alignment JSON must be an object")
    tiers = data.get("tiers")
    if not isinstance(tiers, dict):
        raise ValueError("MFA alignment JSON is missing tiers")
    word_tier = tiers.get("words") or tiers.get("word")
    if word_tier is None:
        # Single-speaker MFA TextGrid export uses `words`; multi-speaker exports
        # prefix it. A single-file transcript should have one such tier.
        matches = [value for name, value in tiers.items() if name.endswith(" - words") or name.endswith(" - word")]
        if len(matches) != 1:
            raise ValueError("MFA alignment JSON must contain exactly one word tier")
        word_tier = matches[0]
    if not isinstance(word_tier, dict) or not isinstance(word_tier.get("entries"), list):
        raise ValueError("MFA word tier is malformed")
    result: list[tuple[float, float, str]] = []
    for entry in word_tier["entries"]:
        if not isinstance(entry, list) or len(entry) != 3:
            raise ValueError("MFA word interval is malformed")
        start, end, text = entry
        if (not isinstance(start, (int, float)) or isinstance(start, bool)
                or not isinstance(end, (int, float)) or isinstance(end, bool)
                or not math.isfinite(float(start)) or not math.isfinite(float(end))
                or float(start) < 0 or float(end) <= float(start)
                or not isinstance(text, str)):
            raise ValueError("MFA word interval has invalid interval values")
        # MFA 3.4.3's JSON exporter includes timed <eps> entries for acoustic
        # gaps. They are not transcript words; ignore this exact marker only.
        if text.strip().casefold() == "<eps>":
            continue
        result.append((float(start), float(end), text))
    return result


def map_word_intervals(words: list[dict], intervals: list[tuple[float, float, str]], indexes: list[int] | None = None):
    output = [{"text": word["text"], "start": None, "end": None, "score": None} for word in words]
    requested = set(indexes if indexes is not None else range(len(words)))
    if any(not isinstance(index, int) or isinstance(index, bool) or index < 0 or index >= len(words) for index in requested):
        raise ValueError("Requested word indexes are invalid")
    original_tokens = [lexical_token(word["text"]) for word in words]
    aligned_tokens = [lexical_token(text) for _, _, text in intervals]
    if original_tokens != aligned_tokens:
        mismatch = next((i for i, pair in enumerate(zip(original_tokens, aligned_tokens)) if pair[0] != pair[1]),
                        min(len(original_tokens), len(aligned_tokens)))
        # A length/token mismatch makes later duplicate-word correspondence
        # ambiguous. Reject the whole sequence instead of shifting indices.
        return output, [{"status": "token-mismatch", "unmatchedOriginalIndexes": list(range(mismatch, len(words))),
                         "unmatchedAlignedIndexes": list(range(mismatch, len(intervals)))}]
    for index, (start, end, _) in enumerate(intervals):
        if index in requested:
            output[index].update(start=start, end=end)
    return output, []


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_source_hash(path: Path, expected: str) -> None:
    if sha256_file(path) != expected:
        raise ValueError("Audio changed during alignment")


def write_diagnostic_artifacts(output_path: Path, raw_path: Path | None,
                               stdout: str, stderr: str) -> None:
    """Keep MFA's unmodified response/logs with this job for failed reviews."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if raw_path is not None and raw_path.is_file():
        diagnostic_raw = output_path.parent / "mfa-raw.json"
        with diagnostic_raw.open("xb") as destination, raw_path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                destination.write(block)
    log_path = output_path.parent / "mfa-process.txt"
    with log_path.open("x", encoding="utf-8", newline="") as log:
        log.write("STDOUT\n")
        log.write(stdout[-10000:])
        log.write("\nSTDERR\n")
        log.write(stderr[-20000:])


def read_manifest(runtime_root: Path) -> dict:
    path = runtime_root / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1 or manifest.get("engine") != "mfa":
        raise ValueError("MFA runtime manifest is not supported")
    return manifest


def _run_alignment(payload: dict, audio_path: Path, output_path: Path, project_root: Path, runtime_root: Path, progress=None):
    language = payload["settings"].get("language")
    if language not in LANGUAGE_MODELS:
        raise ValueError("Unsupported MFA language")
    manifest = read_manifest(runtime_root)
    model = manifest.get("models", {}).get(language)
    if not isinstance(model, dict):
        raise RuntimeError(f"MFA model is not installed for language {language}")
    model_root = runtime_root / "models" / language
    acoustic = (model_root / model.get("acousticPath", "acoustic.zip")).resolve()
    dictionary = (model_root / model.get("dictionaryPath", "dictionary.dict")).resolve()
    if not acoustic.is_relative_to(runtime_root.resolve()) or not dictionary.is_relative_to(runtime_root.resolve()):
        raise ValueError("MFA manifest model paths escape the managed runtime")
    if not acoustic.is_file() or not dictionary.is_file():
        raise RuntimeError(f"MFA assets are incomplete for language {language}")
    mfa_exe = runtime_root / "Scripts" / "mfa.exe"
    ffmpeg_exe = runtime_root / "Library" / "bin" / "ffmpeg.exe"
    if not mfa_exe.is_file() or not ffmpeg_exe.is_file():
        raise RuntimeError("MFA runtime is incomplete")
    expected_acoustic = model.get("acousticSha256")
    expected_dictionary = model.get("dictionarySha256")
    if expected_acoustic and sha256_file(acoustic) != expected_acoustic:
        raise ValueError("MFA acoustic model changed")
    if expected_dictionary and sha256_file(dictionary) != expected_dictionary:
        raise ValueError("MFA dictionary changed")
    transcript = " ".join(word["text"] for word in payload["words"])
    with tempfile.TemporaryDirectory(prefix="subtitle-mfa-") as temporary:
        work = Path(temporary)
        pcm_path = work / "source-16k-mono.wav"
        transcript_path = work / "transcript.txt"
        aligned_path = work / "alignment.json"
        transcript_path.write_text(transcript, encoding="utf-8")
        child_env = os.environ.copy()
        child_env["MFA_ROOT_DIR"] = str(runtime_root / "mfa-data")
        child_env["MAMBA_ROOT_PREFIX"] = str(runtime_root / "mamba")
        child_env["CONDA_PREFIX"] = str(runtime_root)
        child_env["PATH"] = os.pathsep.join((str(runtime_root / "Library" / "bin"),
                                              str(runtime_root / "Scripts"),
                                              str(runtime_root), child_env.get("PATH", "")))
        if progress is not None:
            progress({"stage": "Preparing MFA audio", "fraction": None})
        subprocess.run([str(ffmpeg_exe), "-nostdin", "-v", "error", "-y", "-i", str(audio_path),
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(pcm_path)],
                       check=True, capture_output=True, text=True, encoding="utf-8", errors="replace", env=child_env)
        if not pcm_path.is_file() or pcm_path.stat().st_size <= 44:
            raise RuntimeError("MFA PCM derivative was not created")
        with wave.open(str(pcm_path), "rb") as pcm:
            if pcm.getframerate() != 16000 or pcm.getnchannels() != 1 or pcm.getsampwidth() != 2:
                raise RuntimeError("MFA PCM derivative has invalid audio properties")
            duration_seconds = pcm.getnframes() / pcm.getframerate()
            if not math.isfinite(duration_seconds) or duration_seconds <= 0:
                raise RuntimeError("MFA PCM derivative is empty")
        beam = payload["settings"].get("beam", 10)
        retry_beam = payload["settings"].get("retryBeam", 40)
        if (any(not isinstance(value, int) or isinstance(value, bool) for value in (beam, retry_beam))
                or not (1 <= beam <= 100) or not (beam <= retry_beam <= 200)):
            raise ValueError("MFA beam settings must be positive integers")
        # MFA 3.4.3's align_one Click command preserves unknown aligner options
        # only after positional arguments; it parses --beam/--retry_beam from
        # that tail via PretrainedAligner.parse_parameters.
        command = [str(mfa_exe), "align_one", str(pcm_path), str(transcript_path),
                   str(dictionary), str(acoustic), str(aligned_path),
                   "--output_format", "json", "--clean", "--beam", str(beam),
                   "--retry_beam", str(retry_beam)]
        if progress is not None:
            progress({"stage": "Running Montreal Forced Aligner", "fraction": None})
        started = time.perf_counter()
        result = subprocess.run(command, check=False, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", env=child_env)
        if result.returncode and retry_beam > beam:
            beam_position = command.index("--beam")
            command[beam_position + 1] = str(retry_beam)
            command[command.index("--retry_beam") + 1] = str(retry_beam)
            result = subprocess.run(command, check=False, capture_output=True, text=True,
                                    encoding="utf-8", errors="replace", env=child_env)
        write_diagnostic_artifacts(output_path, aligned_path, result.stdout, result.stderr)
        if result.returncode:
            raise RuntimeError(f"MFA alignment failed ({result.returncode}): {result.stderr[-4000:]}")
        if not aligned_path.is_file() or aligned_path.stat().st_size == 0:
            raise RuntimeError("MFA returned success without an alignment artifact")
        intervals = parse_mfa_json(json.loads(aligned_path.read_text(encoding="utf-8")))
        rows, diagnostics = map_word_intervals(payload["words"], intervals, payload["indexes"])
        requested = payload.get("indexes") if payload.get("indexes") is not None else list(range(len(rows)))
        if not requested or not any(rows[index]["start"] is not None for index in requested):
            expected = [lexical_token(word["text"]) for word in payload["words"]]
            observed = [lexical_token(text) for _, _, text in intervals]
            raise RuntimeError(f"MFA produced no usable word timing evidence; diagnostics={diagnostics}; "
                               f"expected={expected[:30]}; observed={observed[:30]}")
        audio_size = audio_path.stat().st_size
        pcm_size = pcm_path.stat().st_size
        return ({"audioSha256": payload["audioSha256"], "words": rows,
                 "model": model.get("modelId", LANGUAGE_MODELS[language]), "engine": "mfa",
                 "versions": {"mfa": manifest.get("software", {}).get("mfa"),
                              "python": manifest.get("software", {}).get("python")},
                 "groups": diagnostics or [{"status": "aligned", "indexes": list(range(len(rows)))}],
                 "elapsedSeconds": time.perf_counter() - started,
                 "sourceBytes": audio_size, "pcmDerivative": {"sha256": sha256_file(pcm_path),
                     "bytes": pcm_size, "sampleRate": 16000, "channels": 1,
                     "sampleFormat": "pcm_s16le", "durationSeconds": duration_seconds}})


def main() -> None:
    input_path, output_path, project_root, runtime_root = map(Path, sys.argv[1:5])
    progress_path = Path(sys.argv[5]) if len(sys.argv) == 6 else None
    if output_path.exists():
        raise FileExistsError("Alignment output already exists")
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if payload.get("engineId") != "mfa" or not isinstance(payload.get("words"), list):
        raise ValueError("Invalid MFA alignment request")
    if not payload["words"]:
        raise ValueError("MFA alignment request must include words")
    for word in payload["words"]:
        if not isinstance(word, dict) or not isinstance(word.get("text"), str):
            raise ValueError("MFA alignment words must have text")
    indexes = payload.get("indexes")
    if indexes is not None and (not isinstance(indexes, list) or not indexes
                                or any(not isinstance(index, int) or isinstance(index, bool)
                                       or index < 0 or index >= len(payload["words"]) for index in indexes)):
        raise ValueError("Requested word indexes are invalid")
    audio_path = resolve_project_audio(project_root, payload["audioPath"])
    actual_hash = payload.get("audioSha256")
    verify_source_hash(audio_path, actual_hash)
    def progress(value):
        if progress_path is None:
            return
        temporary = progress_path.with_suffix(progress_path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        os.replace(temporary, progress_path)
    result = _run_alignment(payload, audio_path, output_path, project_root.resolve(), runtime_root.resolve(), progress)
    verify_source_hash(audio_path, actual_hash)
    serialized = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(output_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(serialized)
        stream.flush()
        os.fsync(stream.fileno())


if __name__ == "__main__":
    main()
