"""CPU/offline comparison of frozen Conviction words with a heard reference.

Run with the Studio interpreter and a fresh snapshot directory containing
inputs.json, reviewed.json, baseline.json and analysis.wav. Each artifact is
exclusive-create; interrupted runs remain evidence. No project files are written.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import importlib.metadata
import json
import numbers
from pathlib import Path
import sys
import time

from stt_reviewed_timing import compare, lexical_pairs, token
from stt_timing_accuracy_probe import configure_offline_cpu, PeakWorkingSet


ROOT = Path(__file__).resolve().parents[2]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, value) -> None:
    # WhisperX exposes numpy scalar word indexes in its raw diagnostic records.
    def scalar(value):
        if isinstance(value, numbers.Integral):
            return int(value)
        if isinstance(value, numbers.Real):
            return float(value)
        raise TypeError(f"Unsupported artifact value: {type(value).__name__}")

    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False, default=scalar)
        stream.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    args = parser.parse_args()
    run = args.run.resolve()
    if not run.is_relative_to(ROOT / ".scratch"):
        raise ValueError("Use a private snapshot under repository .scratch")
    manifest = read(run / "inputs.json")
    for source, info in manifest["inputs"].items():
        copy = (run / info["copy"]).resolve()
        if not copy.is_relative_to(run) or digest(copy) != info["sha256"]:
            raise ValueError("Frozen input mismatch")
    configure_offline_cpu()
    snapshot = (ROOT / ".cache/huggingface/hub/models--nguyenvulebinh--wav2vec2-base-vietnamese-250h"
                / "snapshots/69e9000591623e5a4fc2f502407860bcdc0de0b2")
    save(run / "started.json", {
        "inputsSha256": digest(run / "inputs.json"),
        "runnerSha256": digest(Path(__file__)),
        "scorerSha256": digest(Path(__file__).with_name("stt_reviewed_timing.py")),
        "modelFiles": {p.name: digest(p) for p in snapshot.iterdir() if p.is_file()},
        "versions": {p: importlib.metadata.version(p) for p in ("torch", "transformers", "whisperx", "faster-whisper")},
        "studioSha256": digest(ROOT / "services/stt_studio/studio_app/server.py"),
        "settings": {"device": "cpu", "threads": 4, "offline": True,
                     "phrasePaddingSeconds": .65, "candidateTranscript": "archived recognizer words only",
                     "referenceUsedForInference": False, "interpolate_method": "ignore"},
    })
    import torch
    torch.set_num_threads(4)
    torch.set_num_interop_threads(2)
    from faster_whisper.audio import decode_audio
    import whisperx
    sys.path.insert(0, str(ROOT / "services/stt_studio"))
    from studio_app import server
    reference = read(run / "reviewed.json")
    baseline = read(run / "baseline.json")["words"]
    duration = manifest["audio"]["duration"]
    pairs = lexical_pairs([w["text"] for w in baseline], [w["text"] for w in reference])
    save(run / "pairs.json", pairs)
    started = time.perf_counter()
    audio = decode_audio(str(run / "analysis.wav"), sampling_rate=16000)
    spans = server._fine_speech_spans(audio)
    edge = deepcopy(baseline)
    changed_groups = server._refine_word_boundaries(edge, spans)
    save(run / "edge.json", {"words": edge, "changedGroups": changed_groups,
                              "speechSpans": spans, "elapsedSeconds": time.perf_counter() - started,
                              "caveat": "Reapply current refiner to archived already-refined STT; not raw DTW."})
    groups = []
    for i, word in enumerate(baseline):
        if groups and baseline[groups[-1][-1]].get("segmentIndex") == word.get("segmentIndex"):
            groups[-1].append(i)
        else:
            groups.append([i])
    aligned = [dict(w, start=None, end=None, timingSource="experimental-ctc-250h") for w in baseline]
    group_results = []
    started = time.perf_counter()
    with PeakWorkingSet() as memory:
        model, metadata = whisperx.load_align_model(language_code="vi", device="cpu",
                                                   model_name=str(snapshot), model_cache_only=True)
        load_seconds = time.perf_counter() - started
        for number, indexes in enumerate(groups):
            segment = {"text": " ".join(baseline[i]["text"] for i in indexes),
                       "start": max(0, min(baseline[i]["start"] for i in indexes) - .65),
                       "end": min(duration, max(baseline[i]["end"] for i in indexes) + .65)}
            result = whisperx.align([segment], model, metadata, audio, "cpu",
                                    interpolate_method="ignore", return_char_alignments=False)
            words = [w for s in result["segments"] for w in s.get("words", [])]
            mapping = lexical_pairs([baseline[i]["text"] for i in indexes], [w["word"] for w in words])
            for local, output in mapping:
                measured = words[output]
                aligned[indexes[local]].update(start=measured.get("start"), end=measured.get("end"),
                                               score=measured.get("score"))
            group_results.append({"index": number, "segment": segment, "rawWords": words,
                                  "mapping": mapping, "sourceIndices": indexes})
            if (number + 1) % 10 == 0:
                print(f"Aligned {number + 1}/{len(groups)} phrases", flush=True)
    save(run / "aligned.json", {"words": aligned, "groups": group_results, "loadSeconds": load_seconds,
                                 "elapsedSeconds": time.perf_counter() - started,
                                 "peakWorkingSetBytes": memory.peak, "memoryError": memory.error})
    variants = {"archived": baseline, "currentEdgeReplay": edge, "ctc250h": aligned}
    scores = {name: compare(reference, words, duration, pairs=pairs) for name, words in variants.items()}
    common = set.intersection(*(set(r["referenceIndex"] for r in s["perWord"]) for s in scores.values()))
    paired = [(i, j) for i, j in pairs if j in common]
    report = {"all": scores,
              "paired": {name: compare(reference, words, duration, pairs=paired) for name, words in variants.items()},
              "originalInputsUnchanged": {source: digest(ROOT / source) == info["sha256"]
                                          for source, info in manifest["inputs"].items()}}
    save(run / "scores.json", report)
    for name, value in report["paired"].items():
        print(json.dumps({"variant": name, "matched": value["matchedManualWords"],
                          "startAbsMs": value["startAbsMs"], "endAbsMs": value["endAbsMs"],
                          "durationAbsMs": value["durationAbsMs"]}))


if __name__ == "__main__":
    main()
