"""Research-only corrected-text alignment using STT-seeded, frozen crop groups.

CLI: INPUT_JSON OUTPUT_JSON PROJECT_ROOT RUNTIME_ROOT
The input's correctedWords contribute text only. The worker never consumes
manual reference times; output evidence is written exclusively to a fresh file.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
for import_root in (ROOT, ROOT / "services" / "api"):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))

from app.workers.subtitle_neural_worker import (  # noqa: E402
    SAMPLE_RATE,
    _easyaligner_align,
    _stable_align,
    _version,
    make_groups,
    read_pcm16_mono,
    run_window,
    sha256_file,
)
from scripts.profiling.stt_reviewed_timing import lexical_pairs  # noqa: E402


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write_exclusive(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, allow_nan=False, indent=2)
        stream.write("\n")


def reference_text(value: object) -> list[str]:
    """Copy corrected text only; discard all other fields on supplied rows."""
    if not isinstance(value, list) or not value:
        raise ValueError("correctedWords must be a non-empty text list")
    result = []
    for row in value:
        text = row if isinstance(row, str) else row.get("text") if isinstance(row, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise ValueError("correctedWords must contain non-empty text")
        result.append(text)
    return result


def assign_corrected_words(corrected: object, seed_words: list[dict], groups: list[dict]) -> list[dict]:
    """Assign corrected text monotonically to STT groups via unique lexical anchors.

    Unanchored runs go to the floor midpoint of their surrounding anchor-group
    indexes; leading/trailing runs inherit the nearest anchor group. No timing
    values or nearest-time comparisons participate in this mapping.
    """
    texts = reference_text(corrected)
    if not seed_words or not groups:
        raise ValueError("No unique lexical anchors; corrected alignment abstains")
    seed_tokens = [word.get("text", "") for word in seed_words]
    pairs = lexical_pairs(seed_tokens, texts)
    seed_to_group = {seed_index: group_index
                     for group_index, group in enumerate(groups)
                     for seed_index in group["indexes"]}
    anchors = [(corrected_index, seed_to_group[seed_index], seed_index)
               for seed_index, corrected_index in pairs if seed_index in seed_to_group]
    anchors.sort()
    if not anchors:
        raise ValueError("No unique lexical anchors; corrected alignment abstains")

    assigned_group: list[int | None] = [None] * len(texts)
    anchor_by_corrected = {corrected_index: (group_index, seed_index)
                           for corrected_index, group_index, seed_index in anchors}
    for corrected_index, (group_index, _) in anchor_by_corrected.items():
        assigned_group[corrected_index] = group_index

    runs = []
    cursor = 0
    while cursor < len(texts):
        if assigned_group[cursor] is not None:
            cursor += 1
            continue
        begin = cursor
        while cursor < len(texts) and assigned_group[cursor] is None:
            cursor += 1
        left = next((i for i in range(begin - 1, -1, -1) if assigned_group[i] is not None), None)
        right = next((i for i in range(cursor, len(texts)) if assigned_group[i] is not None), None)
        if left is None:
            target = assigned_group[right]
            rule = "leading-run-nearest-anchor-group"
        elif right is None:
            target = assigned_group[left]
            rule = "trailing-run-nearest-anchor-group"
        else:
            target = (assigned_group[left] + assigned_group[right]) // 2
            rule = "floor-midpoint-of-neighboring-anchor-groups"
        for index in range(begin, cursor):
            assigned_group[index] = target
        runs.append({"indexes": list(range(begin, cursor)), "groupIndex": target, "rule": rule})

    if any(value is None for value in assigned_group):
        raise RuntimeError("Corrected-text group assignment is incomplete")
    if assigned_group != sorted(assigned_group):
        raise ValueError("Corrected-text anchors do not map monotonically to STT groups")

    result = []
    for group_index, source_group in enumerate(groups):
        indexes = [index for index, selected in enumerate(assigned_group) if selected == group_index]
        if not indexes:
            continue
        selected_anchors = [{"correctedIndex": corrected_index, "seedIndex": seed_index}
                            for corrected_index, anchor_group, seed_index in anchors
                            if anchor_group == group_index]
        result.append({
            "groupIndex": group_index,
            "indexes": indexes,
            "start": float(source_group["start"]),
            "end": float(source_group["end"]),
            "seedStart": float(source_group["seedStart"]),
            "seedEnd": float(source_group["seedEnd"]),
            "sourceSeedIndexes": list(source_group["indexes"]),
            "anchorPairs": selected_anchors,
            "mappingRule": {"method": "unique edit-distance lexical anchors; monotonic group index",
                             "unanchoredIndexes": [index for run in runs if run["groupIndex"] == group_index
                                                   for index in run["indexes"]],
                             "unanchoredRuns": [run for run in runs if run["groupIndex"] == group_index]},
        })
    return result


def set_easyaligner_crop_context(words: list[dict], indexes: list[int], group: dict,
                                 padding_seconds: float) -> None:
    """Set synthetic seed bounds so product run_window reproduces the fixed crop.

    These values are crop context only. Returned alignment coordinates always
    come from EasyAligner's measured CTC spans.
    """
    if not indexes:
        raise ValueError("EasyAligner crop has no corrected word indexes")
    inset = min(padding_seconds, max(0.0, (float(group["end"]) - float(group["start"])) / 2))
    for index in indexes:
        words[index]["start"] = float(group["start"]) + inset
        words[index]["end"] = float(group["end"]) - inset
    actual = run_window(group, indexes, words, padding_seconds)
    if any(abs(a - b) > 1e-7 for a, b in zip(actual, (group["start"], group["end"]))):
        raise ValueError("EasyAligner synthetic seed bounds failed to preserve fixed crop")


def _fixed_seed_groups(seed_words: list[dict], duration: float, engine: str,
                       settings: dict) -> list[dict]:
    if engine == "mfa":
        valid = [word for word in seed_words if isinstance(word.get("start"), (int, float))
                 and not isinstance(word.get("start"), bool)
                 and isinstance(word.get("end"), (int, float)) and not isinstance(word.get("end"), bool)
                 and 0 <= float(word["start"]) < float(word["end"]) <= duration]
        if not valid:
            raise ValueError("No unique lexical anchors or valid frozen STT seed times")
        return [{"indexes": list(range(len(seed_words))), "start": 0.0,
                 "end": max(float(word["end"]) for word in valid),
                 "seedStart": min(float(word["start"]) for word in valid),
                 "seedEnd": max(float(word["end"]) for word in valid)}]
    window = settings.get("windowSeconds", 20)
    padding = settings.get("paddingSeconds", .5 if engine == "easyaligner" else 1.0)
    groups = make_groups(seed_words, duration, float(window), float(padding))
    for group in groups:
        group["seedStart"] = min(float(seed_words[i]["start"]) for i in group["indexes"])
        group["seedEnd"] = max(float(seed_words[i]["end"]) for i in group["indexes"])
    return groups


def _run_mfa(payload: dict, output_path: Path, project_root: Path, runtime_root: Path) -> dict:
    mfa_root = runtime_root / "mfa"
    python = mfa_root / "python.exe"
    if not python.is_file():
        raise FileNotFoundError(f"MFA isolated Python is missing: {python}")
    worker = ROOT / "services" / "api" / "app" / "workers" / "subtitle_mfa_worker.py"
    input_path = output_path.with_name(output_path.stem + ".mfa-worker-input.json")
    raw_output = output_path.with_name(output_path.stem + ".mfa-worker-output.json")
    _write_exclusive(input_path, payload)
    env = os.environ.copy()
    env["MFA_ROOT_DIR"] = str(mfa_root / "mfa-data")
    env["MAMBA_ROOT_PREFIX"] = str(mfa_root / "mamba")
    env["CONDA_PREFIX"] = str(mfa_root)
    env["PATH"] = os.pathsep.join((str(mfa_root / "Library" / "bin"),
                                   str(mfa_root / "Scripts"), str(mfa_root), env.get("PATH", "")))
    process_path = output_path.with_name(output_path.stem + ".mfa-worker-process.txt")
    try:
        process = subprocess.run([str(python), str(worker), str(input_path), str(raw_output),
                                  str(project_root), str(mfa_root)], check=False,
                                 capture_output=True, text=True, encoding="utf-8", errors="replace",
                                 env=env, timeout=1800)
    except subprocess.TimeoutExpired as error:
        def decode_partial(value):
            if isinstance(value, bytes):
                return value.decode("utf-8", errors="replace")
            return value or ""
        with process_path.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write("status=timeout\ntimeoutSeconds=1800\nSTDOUT\n")
            stream.write(decode_partial(error.stdout)[-10000:])
            stream.write("\nSTDERR\n")
            stream.write(decode_partial(error.stderr)[-20000:])
        raise TimeoutError(f"MFA corrected-text worker exceeded 1800 seconds; see {process_path.name}") from error
    with process_path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(f"returncode={process.returncode}\nSTDOUT\n{process.stdout[-10000:]}\nSTDERR\n{process.stderr[-20000:]}")
    if process.returncode:
        raise RuntimeError(f"MFA corrected-text worker failed ({process.returncode}); see {process_path.name}")
    if not raw_output.is_file():
        raise RuntimeError("MFA worker exited successfully without its output artifact")
    return _read_json(raw_output)


def run_probe(payload: dict, output_path: Path, project_root: Path, runtime_root: Path) -> dict:
    if output_path.exists():
        raise FileExistsError("Corrected alignment output already exists")
    engine = payload.get("engineId")
    if engine not in {"mfa", "stable-ts", "easyaligner"}:
        raise ValueError("Unsupported subtitle alignment engine")
    corrected = reference_text(payload.get("correctedWords"))
    seeds = payload.get("seedWords")
    if not isinstance(seeds, list) or not seeds:
        raise ValueError("seedWords must be the frozen non-empty STT transcript")
    if any(not isinstance(word, dict) or not isinstance(word.get("text"), str) for word in seeds):
        raise ValueError("STT seed words need text")
    if any(word.get("timingSource") == "manual" for word in seeds):
        raise ValueError("STT seed times cannot be manual reference timings")
    audio_path = (project_root / payload.get("audioPath", "")).resolve(strict=True)
    project_root = project_root.resolve(strict=True)
    if not audio_path.is_relative_to(project_root) or not audio_path.is_file():
        raise ValueError("Audio escapes project root")
    expected_hash = payload.get("audioSha256")
    source_hash = sha256_file(audio_path)
    if not isinstance(expected_hash, str) or source_hash != expected_hash:
        raise ValueError("Audio hash does not match frozen input")
    settings = payload.get("settings")
    if not isinstance(settings, dict):
        raise ValueError("settings must be an object")
    runtime_root = runtime_root.resolve(strict=True)
    started = time.perf_counter()
    if engine == "mfa":
        groups = _fixed_seed_groups(seeds, float("inf"), engine, settings)
        assigned = assign_corrected_words(corrected, seeds, groups)
        worker_payload = {"engineId": "mfa", "audioPath": payload["audioPath"],
                          "audioSha256": expected_hash, "words": [{"text": text} for text in corrected],
                          "indexes": None, "settings": settings}
        result = _run_mfa(worker_payload, output_path, project_root, runtime_root)
    else:
        samples, duration, source_rate = read_pcm16_mono(audio_path)
        groups = _fixed_seed_groups(seeds, duration, engine, settings)
        assigned = assign_corrected_words(corrected, seeds, groups)
        words = [{"text": text, "start": None, "end": None, "score": None} for text in corrected]
        worker_groups = [{key: group[key] for key in ("indexes", "start", "end")} for group in assigned]
        if engine == "easyaligner":
            padding = float(settings.get("paddingSeconds", .5))
            for group in worker_groups:
                set_easyaligner_crop_context(words, group["indexes"], group, padding)
        worker_payload = {"engineId": engine, "audioPath": payload["audioPath"],
                          "audioSha256": expected_hash, "words": words,
                          "indexes": [i for group in worker_groups for i in group["indexes"]],
                          "settings": settings}
        if engine == "stable-ts":
            aligned, diagnostics, model = _stable_align(worker_payload, samples, worker_groups, runtime_root)
        else:
            aligned, diagnostics, model = _easyaligner_align(worker_payload, samples, worker_groups, runtime_root)
        versions = {name: _version(name) for name in ("torch", "torchaudio", "transformers")}
        versions["stable-ts" if engine == "stable-ts" else "easyaligner"] = _version(
            "stable-ts" if engine == "stable-ts" else "easyaligner")
        alignment_pcm = samples.astype("<f4", copy=False).tobytes()
        result = {"audioSha256": expected_hash, "words": aligned, "groups": diagnostics,
                  "engine": engine, "model": model, "versions": versions,
                  "audio": {"sourceSampleRate": source_rate, "alignmentSampleRate": SAMPLE_RATE,
                            "durationSeconds": duration,
                            "alignmentPcmSha256": hashlib.sha256(alignment_pcm).hexdigest(),
                            "alignmentSamples": len(samples)}}
        if not any(aligned[index].get("start") is not None for index in worker_payload["indexes"]):
            raise RuntimeError(f"{engine} produced no measured timing evidence")
    if sha256_file(audio_path) != expected_hash:
        raise ValueError("Audio changed during corrected-text alignment")
    if len(result.get("words", [])) != len(corrected):
        raise RuntimeError("Engine output word count does not match corrected text")
    if any(not isinstance(row, dict) or row.get("text") != text
           for row, text in zip(result["words"], corrected)):
        raise RuntimeError("Engine output text does not preserve corrected token identity")
    audio_info = result.get("audio", {})
    duration = audio_info.get("durationSeconds")
    if not isinstance(duration, (int, float)) or isinstance(duration, bool):
        derivative = result.get("pcmDerivative", {})
        duration = derivative.get("durationSeconds") if isinstance(derivative, dict) else None
    duration = float(duration) if isinstance(duration, (int, float)) and not isinstance(duration, bool) else None
    for row in result["words"]:
        start, end = row.get("start"), row.get("end")
        if (start is None) != (end is None):
            raise RuntimeError("Engine returned a partial word interval")
        if start is not None and (not isinstance(start, (int, float)) or isinstance(start, bool)
                                  or not isinstance(end, (int, float)) or isinstance(end, bool)
                                  or not (math.isfinite(float(start)) and math.isfinite(float(end)))
                                  or not (0 <= start < end)
                                  or (duration is not None and end > duration)):
            raise RuntimeError("Engine returned invalid measured coordinates")
    manifest = [{"groupIndex": group["groupIndex"], "sourceSeedIndexes": group["sourceSeedIndexes"],
                 "correctedIndexes": group["indexes"], "cropStart": group["start"],
                 "cropEnd": group["end"], "seedStart": group["seedStart"],
                 "seedEnd": group["seedEnd"], "anchorPairs": group["anchorPairs"],
                 "mappingRule": group["mappingRule"],
                 "cropProvenance": ("full source; MFA ignores seed timing" if engine == "mfa"
                                    else "frozen STT seed times only")}
                for index, group in enumerate(assigned)]
    if engine == "mfa":
        for item in manifest:
            item["cropStart"] = None
            item["cropEnd"] = None
    sanitized_payload = {**payload, "correctedWords": corrected}
    output = {"schema": 1, "engine": engine, "audioSha256": expected_hash,
              "inputSha256": hashlib.sha256(json.dumps(sanitized_payload, ensure_ascii=False, sort_keys=True,
                                                         separators=(",", ":")).encode("utf-8")).hexdigest(),
              "runnerSha256": sha256_file(Path(__file__)),
              "workerSha256": sha256_file(ROOT / "services" / "api" / "app" / "workers" /
                                           ("subtitle_mfa_worker.py" if engine == "mfa" else
                                            "subtitle_neural_worker.py")),
              "transcriptSource": "corrected text only; metadata ignored",
              "assignmentSource": "unique lexical anchors from frozen STT text; midpoint fallback",
              "seedTimingSource": "frozen STT seed words only",
              "settings": settings, "versions": result.get("versions", {}),
              "model": result.get("model"), "elapsedSeconds": time.perf_counter() - started,
              "derivedCropManifest": manifest, "groups": result.get("groups", []),
              "words": result["words"], "workerResult": result}
    if sha256_file(audio_path) != expected_hash:
        raise ValueError("Audio changed before output commit")
    _write_exclusive(output_path, output)
    return output


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    input_path, output_path, project_root, runtime_root = map(Path, sys.argv[1:5])
    payload = _read_json(input_path)
    run_probe(payload, output_path, project_root, runtime_root)


if __name__ == "__main__":
    main()
