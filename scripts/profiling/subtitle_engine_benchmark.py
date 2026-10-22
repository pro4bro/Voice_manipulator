"""Reproducible, offline Conviction alignment sweep; never applies project edits.

Run prepare, run, select, evaluate in that order. Selection reads calibration
scores only. Frozen source words seed crops; manual timings only enter scoring.
Artifacts are deliberately kept outside Git under an exclusive scratch folder.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import sys
import time
import wave

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.adapters.subtitle_alignment_engines import SubtitleAlignmentEngines
from app.domain.subtitle_engine_refinement import compose_engine_refinement
from stt_reviewed_timing import lexical_pairs
from subtitle_engine_metrics import score_alignment


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save(path, value):
    with Path(path).open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, allow_nan=False, indent=2)


def configurations():
    configs = []
    for beam, retry in ((10, 40), (5, 20), (20, 80), (10, 80)):
        configs.append({"id": f"mfa-b{beam}-r{retry}", "engine": "mfa",
                        "settings": {"language": "vi", "beam": beam, "retryBeam": retry}})
    for model, refine, precision, window in (
            ("base", False, .1, 20), ("base", True, .2, 20),
            ("base", True, .1, 20), ("base", True, .05, 20),
            ("small", True, .1, 20), ("base", True, .1, 10), ("base", True, .1, 30)):
        configs.append({"id": f"stable-{model}-{'refine' if refine else 'align'}-p{precision}-w{window}",
                        "engine": "stable-ts", "settings": {"language": "vi", "model": model,
                        "refine": refine, "precision": precision, "windowSeconds": window, "maxWordDuration": 3}})
    for window, padding in ((10, .5), (20, .25), (20, .5), (20, 1.0), (30, .5), (30, 1.0)):
        configs.append({"id": f"easy-w{window}-pad{padding}", "engine": "easyaligner",
                        "settings": {"language": "vi", "windowSeconds": window, "paddingSeconds": padding}})
    return configs


def freeze(destination):
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=False)
    project = ROOT / "data/projects/conviction"
    media = project / "assets/media/asset-a29e7bedc07a"
    sources = {"reviewed.json": media / "words.json", "analysis.wav": media / "analysis.wav",
               "current.json": ROOT / ".scratch/stt-conviction78/current/current.json"}
    expected = read(ROOT / ".scratch/stt-conviction78/run-2/inputs.json")["inputs"]
    if digest(sources["reviewed.json"]) != expected[str(sources["reviewed.json"].relative_to(ROOT))]["sha256"]:
        raise ValueError("Manual reference changed since the documented audit; inspect before proceeding")
    if digest(sources["analysis.wav"]) != expected[str(sources["analysis.wav"].relative_to(ROOT))]["sha256"]:
        raise ValueError("Conviction source audio changed")
    for name, path in sources.items():
        shutil.copyfile(path, destination / name)
    watched = [project / "project.json", media / "words.json", media / "analysis.wav", media / "source.mp3",
               project / "assets/media/index.json", media / "stt/transcript.stt.json"]
    watched += [ROOT / "scripts/profiling/stt_reviewed_timing.py", ROOT / "scripts/profiling/subtitle_engine_metrics.py",
                Path(__file__),
                ROOT / "services/api/app/workers/subtitle_mfa_worker.py",
                ROOT / "services/api/app/workers/subtitle_neural_worker.py"]
    reference = read(destination / "reviewed.json")
    baseline = read(destination / "current.json")["words"]
    with wave.open(str(destination / "analysis.wav"), "rb") as audio:
        pcm = audio.readframes(audio.getnframes())
        props = {"sampleRate": audio.getframerate(), "channels": audio.getnchannels(), "sampleWidth": audio.getsampwidth(),
                 "frames": audio.getnframes(), "duration": audio.getnframes() / audio.getframerate(),
                 "pcmSha256": hashlib.sha256(pcm).hexdigest()}
    eligible = [i for i, word in enumerate(reference)
                if word.get("timingSource") == "manual" and word.get("timingTrusted") is True]
    all_pairs = lexical_pairs([word["text"] for word in baseline], [word["text"] for word in reference])
    pairs = [(j, i) for i, j in all_pairs if j in eligible]
    # Source-clock cut, fixed before looking at any engine output. Guard words
    # crossing the 4s gap never enter calibration or validation.
    cut = props["duration"] * .7
    splits = {"full": eligible,
              "calibration": [i for i in eligible if reference[i]["end"] <= cut - 2],
              "validation": [i for i in eligible if reference[i]["start"] >= cut + 2]}
    save(destination / "protocol.json", {"schema": 1, "audio": props,
         "sources": {str(path.relative_to(ROOT)): digest(path) for path in watched},
         "frozen": {name: digest(destination / name) for name in sources},
         "pairOrder": "referenceIndex,candidateIndex; unique lexical matches, no time matching",
         "pairs": pairs, "splits": splits, "cutSeconds": cut, "guardSeconds": 2,
         "configurations": configurations(), "maxMoveMs": 2000,
         "selection": "Effective pipeline: maximize calibration bothEdgesWithin100Ms count, then minimize severe>500 count, then mean IN/OUT MAE; ties use config order",
         "secondarySelection": "Per-engine winner only: limits500/1000/2000ms x none/scalar/separate-edge bias. Fit bias on calibration only, same rank; baseline scalar/separate bias controls. Validation evaluated after selection is frozen.",
         "caveat": "Approximate owner timing; incomplete overlapping speech; same conversation seen in prior work, not blind or general validation",
         "warmup": "No separate warmup. Wall time includes fresh process/model load, source resampling and worker; MFA may use existing model caches."})
    print(json.dumps({"prepared": str(destination), "referenceWords": len(reference), "trustedManual": len(eligible),
                      "seedWords": len(baseline), "pairs": len(pairs),
                      "splitCounts": {key: len(value) for key, value in splits.items()}}), flush=True)


def verify(folder):
    protocol = read(folder / "protocol.json")
    for name, expected in protocol["frozen"].items():
        if digest(folder / name) != expected:
            raise ValueError(f"Frozen input changed: {name}")
    for name, expected in protocol["sources"].items():
        if digest(ROOT / name) != expected:
            raise ValueError(f"Owner input or worker changed: {name}")
    return protocol


def effective(seed, aligned, duration, engine, limit):
    proposal = compose_engine_refinement(seed, aligned, duration, engine=engine, max_move_ms=limit)
    candidate = deepcopy(seed)
    for word, row in zip(candidate, proposal["rows"]):
        word.update(row["after"])
    return candidate, proposal["diagnostics"]


def score(folder, words, split, baseline=None):
    protocol = read(folder / "protocol.json")
    selected = set(protocol["splits"][split])
    pairs = [tuple(pair) for pair in protocol["pairs"] if pair[0] in selected]
    return score_alignment(read(folder / "reviewed.json"), words, pairs,
                           total_reference_count=len(selected), duration=protocol["audio"]["duration"], baseline_words=baseline)


def run(folder, config_ids=None):
    protocol = verify(folder)
    engines = SubtitleAlignmentEngines(ROOT)
    seed = read(folder / "current.json")["words"]
    duration = protocol["audio"]["duration"]
    for config in protocol["configurations"]:
        if config_ids and config["id"] not in config_ids:
            continue
        output = folder / "runs" / config["id"]
        if output.exists():
            print(json.dumps({"skipExisting": config["id"]}), flush=True)
            continue
        output.mkdir(parents=True)
        start = time.perf_counter()
        print(json.dumps({"starting": config["id"]}), flush=True)
        try:
            save(output / "identity.json", engines.identity(config["engine"], config["settings"]))
            result = engines.run(folder, folder / "analysis.wav", seed, output, None, config["engine"], config["settings"])
            wall = time.perf_counter() - start
            candidate, diagnostics = effective(seed, result["words"], duration, config["engine"], 2000)
            save(output / "effective-words.json", candidate)
            scores = {"raw": score(folder, result["words"], "calibration", seed),
                      "effective": score(folder, candidate, "calibration", seed)}
            save(output / "calibration.json", scores)
            save(output / "run.json", {"id": config["id"], "settings": config["settings"], "engine": config["engine"],
                 "status": "complete", "wallSeconds": wall, "workerElapsedSeconds": result.get("elapsedSeconds"),
                 "diagnostics": diagnostics, "outputSha256": digest(output / "alignment-output.json"),
                 "inputSha256": digest(output / "alignment-input.json")})
            s = scores["effective"]
            print(json.dumps({"completed": config["id"], "seconds": round(wall, 2), "calibrationBoth100": s["bothEdgesWithin100Ms"]["count"],
                              "rawCoverage": scores["raw"]["coveragePaired"], "severe": s["severeOver500Ms"]["count"]}), flush=True)
        except (ValueError, RuntimeError, OSError, KeyError) as exc:
            save(output / "failure.json", {"id": config["id"], "error": str(exc), "wallSeconds": time.perf_counter() - start})
            print(json.dumps({"failed": config["id"], "error": str(exc)}, ensure_ascii=True), flush=True)
        verify(folder)


def rank(metrics):
    if not metrics["measuredWords"]:
        return (math.inf, math.inf, math.inf)
    mae = metrics["inAbsoluteMs"]["mae"] + metrics["outAbsoluteMs"]["mae"]
    return (-metrics["bothEdgesWithin100Ms"]["count"], metrics["severeOver500Ms"]["count"], mae)


def fit_bias(metrics, mode):
    if mode == "none":
        return [0., 0.]
    rows = metrics["perPair"]
    if not rows:
        raise ValueError("No calibration measurements for bias fitting")
    if mode == "scalar":
        offset = -statistics.median([row[key] for row in rows for key in ("inSignedMs", "outSignedMs")]) / 1000
        return [offset, offset]
    if mode != "separate":
        raise ValueError("Unknown bias mode")
    return [-statistics.median([row[key] for row in rows]) / 1000 for key in ("inSignedMs", "outSignedMs")]


def add_bias(words, offsets, duration):
    candidate = deepcopy(words)
    for word in candidate:
        start, end = word.get("start"), word.get("end")
        if (type(start) not in (int, float) or type(end) not in (int, float)
                or not math.isfinite(start) or not math.isfinite(end)):
            continue
        adjusted = max(0, start + offsets[0]), min(duration, end + offsets[1])
        if adjusted[0] < adjusted[1]:
            word.update(start=adjusted[0], end=adjusted[1])
    return candidate


def select(folder):
    protocol = verify(folder)
    code_folder = folder / "scoring-code"
    code_folder.mkdir(exist_ok=False)
    code_paths = [Path(__file__), ROOT / "scripts/profiling/subtitle_engine_metrics.py",
                  ROOT / "scripts/profiling/stt_reviewed_timing.py",
                  ROOT / "services/api/app/domain/subtitle_engine_refinement.py",
                  ROOT / "services/api/app/domain/subtitle_refinement.py",
                  ROOT / "services/api/app/domain/subtitle_alignment.py"]
    for path in code_paths:
        shutil.copyfile(path, code_folder / path.name)
    save(code_folder / "identity.json", {str(path.relative_to(ROOT)): digest(path) for path in code_paths})
    seed = read(folder / "current.json")["words"]
    duration = protocol["audio"]["duration"]
    winners = {}
    for config in protocol["configurations"]:
        output = folder / "runs" / config["id"]
        if not (output / "run.json").is_file():
            continue
        metrics = read(output / "calibration.json")["effective"]
        engine = config["engine"]
        if engine not in winners or rank(metrics) < rank(winners[engine]["calibration"]):
            winners[engine] = {"config": config, "calibration": metrics}
    selected = {}
    for engine, winner in winners.items():
        config = winner["config"]
        aligned = read(folder / "runs" / config["id"] / "alignment-output.json")["words"]
        raw_metrics = score(folder, aligned, "calibration", seed)
        options = []
        for limit in (500, 1000, 2000):
            for mode in ("none", "scalar", "separate"):
                offsets = fit_bias(raw_metrics, mode)
                shifted = add_bias(aligned, offsets, duration)
                words, diagnostics = effective(seed, shifted, duration, engine, limit)
                metrics = score(folder, words, "calibration", seed)
                options.append({"limitMs": limit, "biasMode": mode, "biasSeconds": offsets,
                                "calibration": metrics, "diagnostics": diagnostics})
        best = min(options, key=lambda option: rank(option["calibration"]))
        selected[engine] = {"config": config, "postprocess": best, "options": options}
    baseline_metrics = score(folder, seed, "calibration")
    baseline_options = []
    for mode in ("none", "scalar", "separate"):
        offsets = fit_bias(baseline_metrics, mode)
        words = add_bias(seed, offsets, duration)
        baseline_options.append({"biasMode": mode, "biasSeconds": offsets, "calibration": score(folder, words, "calibration", seed)})
    save(folder / "selection.json", {"engines": selected, "baselineControls": baseline_options,
          "rule": protocol["selection"], "validationInspected": False})
    print(json.dumps({engine: {"config": value["config"]["id"], "limit": value["postprocess"]["limitMs"],
                              "biasMode": value["postprocess"]["biasMode"], "bias": value["postprocess"]["biasSeconds"]}
                      for engine, value in selected.items()}, indent=2), flush=True)


def evaluate(folder):
    protocol = verify(folder)
    for name, expected in read(folder / "scoring-code/identity.json").items():
        if digest(ROOT / name) != expected:
            raise ValueError(f"Selection code changed before validation: {name}")
    selection = read(folder / "selection.json")
    seed = read(folder / "current.json")["words"]
    duration = protocol["audio"]["duration"]
    entries = {"stt-baseline": seed}
    for option in selection["baselineControls"]:
        entries["baseline-" + option["biasMode"]] = add_bias(seed, option["biasSeconds"], duration)
    for engine, selected in selection["engines"].items():
        config = selected["config"]
        aligned = read(folder / "runs" / config["id"] / "alignment-output.json")["words"]
        entries[engine + "-raw"] = aligned
        entries[engine + "-effective-default"], _ = effective(seed, aligned, duration, engine, 2000)
        post = selected["postprocess"]
        entries[engine + "-calibrated"], _ = effective(seed, add_bias(aligned, post["biasSeconds"], duration), duration, engine, post["limitMs"])
    reports = {name: {split: score(folder, words, split, seed) for split in ("calibration", "validation", "full")}
               for name, words in entries.items()}
    save(folder / "evaluation.json", {"selectionSha256": digest(folder / "selection.json"), "entries": reports})
    with (folder / "per-word.csv").open("x", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["candidate", "referenceIndex", "candidateIndex", "text", "referenceIn", "referenceOut", "candidateIn", "candidateOut", "inSignedMs", "outSignedMs", "durationAbsoluteMs"])
        reference = read(folder / "reviewed.json")
        for name, splits in reports.items():
            for row in splits["full"]["perPair"]:
                ref, cand = reference[row["referenceIndex"]], entries[name][row["candidateIndex"]]
                writer.writerow([name, row["referenceIndex"], row["candidateIndex"], ref["text"], ref["start"], ref["end"], cand["start"], cand["end"], row["inSignedMs"], row["outSignedMs"], row["durationAbsoluteMs"]])
    print(json.dumps({name: {"paired": m["validation"]["measuredWords"], "both100": m["validation"]["bothEdgesWithin100Ms"]["pairedPercent"],
                           "inMAE": m["validation"]["inAbsoluteMs"]["mae"], "outMAE": m["validation"]["outAbsoluteMs"]["mae"],
                           "severe": m["validation"]["severeOver500Ms"]["count"]} for name, m in reports.items()}, indent=2), flush=True)
    save(folder / "closure.json", {"sourceHashesUnchanged": True, "verifiedSources": protocol["sources"],
         "selectionSha256": digest(folder / "selection.json"), "evaluationSha256": digest(folder / "evaluation.json")})


def corrected(folder):
    """One diagnostic replay per selected engine, corrected text but STT crops."""
    from subtitle_mfa_partial_probe import build_partial_probe

    protocol = verify(folder)
    selection = read(folder / "selection.json")
    engines = SubtitleAlignmentEngines(ROOT)
    chosen = {engine: value["config"]["settings"] for engine, value in selection["engines"].items()}
    mfa = read(folder / "mfa-diagnostic-selection.json")["winner"]
    chosen["mfa"] = mfa["settings"]
    reference = read(folder / "reviewed.json")
    seed = read(folder / "current.json")["words"]
    duration = protocol["audio"]["duration"]
    reports = {}
    runner = ROOT / "scripts/profiling/subtitle_corrected_alignment_probe.py"
    for engine, settings in chosen.items():
        work = folder / "corrected" / engine
        work.mkdir(parents=True, exist_ok=False)
        identity = engines.identity(engine, settings)
        save(work / "identity.json", {**identity, "probeSha256": digest(runner),
                                     "selectionSha256": digest(folder / "selection.json")})
        payload = {"engineId": engine, "settings": settings, "audioPath": "analysis.wav",
                   "audioSha256": digest(folder / "analysis.wav"),
                   "correctedWords": [word["text"] for word in reference], "seedWords": seed}
        save(work / "input.json", payload)
        python = engines._python(engine) if engine != "mfa" else ROOT / ".venv/Scripts/python.exe"
        command = [str(python), str(runner), str(work / "input.json"), str(work / "output.json"), str(folder), str(engines.runtime)]
        env = {**os.environ, "CUDA_VISIBLE_DEVICES": "", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
               "HF_HUB_DISABLE_TELEMETRY": "1", "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4", "PYTHONUTF8": "1"}
        print(json.dumps({"correctedStarting": engine, "settings": settings}), flush=True)
        started = time.perf_counter()
        result = subprocess.run(command, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                timeout=1900, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        (work / "process.log").write_text(result.stdout + result.stderr, encoding="utf-8")
        words, status = None, "complete" if result.returncode == 0 else "failed"
        if result.returncode == 0 and (work / "output.json").is_file():
            words = read(work / "output.json")["words"]
        elif engine == "mfa" and (work / "mfa-raw.json").is_file():
            probe = build_partial_probe(read(work / "mfa-raw.json"), [{"text": word["text"]} for word in reference],
                                        digest(work / "mfa-raw.json"), model_identity=identity)
            save(work / "diagnostic-output.json", probe)
            words = probe["words"]
            status = "diagnostic-only-product-rejected"
        scores = {}
        if words is not None:
            for split, indices in protocol["splits"].items():
                scores[split] = score_alignment(reference, words, [(i, i) for i in indices],
                                               total_reference_count=len(indices), duration=duration)
                common = [ref for ref, _ in protocol["pairs"] if ref in set(indices)]
                scores[split + "CommonSttAnchors"] = score_alignment(reference, words, [(i, i) for i in common],
                                                    total_reference_count=len(common), duration=duration)
        reports[engine] = {"status": status, "returncode": result.returncode, "settings": settings,
                           "wallSeconds": time.perf_counter() - started, "scores": scores}
        save(work / "scores.json", reports[engine])
        print(json.dumps({"correctedComplete": engine, "status": status,
                          "measuredFull": scores.get("full", {}).get("measuredWords"),
                          "both100": scores.get("full", {}).get("bothEdgesWithin100Ms")}), flush=True)
        verify(folder)
    save(folder / "corrected-evaluation.json", reports)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "run", "select", "evaluate", "corrected", "verify"))
    parser.add_argument("folder", type=Path)
    parser.add_argument("--config", action="append")
    args = parser.parse_args()
    folder = args.folder.resolve()
    if args.action == "prepare":
        freeze(folder)
    elif args.action == "run":
        run(folder, args.config)
    elif args.action == "select":
        select(folder)
    elif args.action == "evaluate":
        evaluate(folder)
    elif args.action == "corrected":
        corrected(folder)
    else:
        verify(folder)
        print("All frozen/owner source hashes match")
