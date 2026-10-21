"""Replay current Studio recognition on frozen, product-planned chunk windows.

Use the Studio Python, pass the snapshot and a fresh output directory with a
chunks.json exported from MediaImportProcessor._stt_chunks. Merge retained
responses with that same product adapter in the API Python environment.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
import time
import wave

from stt_timing_accuracy_probe import configure_offline_cpu, PeakWorkingSet
from stt_conviction_timing_probe import digest, read, save, ROOT
from stt_reviewed_timing import compare


def score_run(run: Path, output: Path) -> None:
    """Use the API interpreter for its real merge/SRT/structural-quality seam."""
    sys.path.insert(0, str(ROOT / "services/api"))
    from app.adapters.media_import_processor import MediaImportProcessor, TranscriptionChunk
    save(output / "scoring-started.json", {"runnerSha256": digest(Path(__file__)),
                                           "snapshotInputsSha256": digest(run / "inputs.json")})
    chunks = read(output / "chunks.json")
    responses = [read(output / f"chunk-{i}.json") for i in range(len(chunks))]
    duration = read(run / "inputs.json")["audio"]["duration"]
    raw, edge = [], []
    for chunk, response in zip(chunks, responses):
        if response["chunk"] != chunk or not response.get("rawWords"):
            raise ValueError("Need bound raw/refined captures for every chunk")
        item = response["item"]
        raw.append((TranscriptionChunk(**chunk), dict(item, words=response["rawWords"])))
        edge.append((TranscriptionChunk(**chunk), item))
    raw_item = MediaImportProcessor._merge_studio_chunks(raw, duration)
    edge_item = MediaImportProcessor._merge_studio_chunks(edge, duration)
    asset_dir = output / "canonical-asset"
    asset_dir.mkdir(exist_ok=False)
    canonical = MediaImportProcessor._write_and_read_stt_artifacts(asset_dir, edge_item)
    current = MediaImportProcessor._attach_timing_quality(canonical, duration)
    save(output / "raw.json", raw_item)
    save(output / "current.json", current)
    reference = read(run / "reviewed.json")
    variants = {"archived": read(run / "baseline.json")["words"],
                "ctc250hOnArchive": read(run / "aligned.json")["words"],
                "freshRawDtw": raw_item["words"], "freshRefined": edge_item["words"],
                "freshCanonical": current["words"]}
    scores = {name: compare(reference, words, duration) for name, words in variants.items()}
    common = set.intersection(*(set(w["referenceIndex"] for w in s["perWord"]) for s in scores.values()))
    report = {"all": scores, "paired": {
        name: compare(reference, words, duration,
                      pairs=[(i, j) for i, j in scores[name]["lexicalPairs"] if j in common])
        for name, words in variants.items()}}
    report["originalInputsUnchanged"] = {
        source: digest(ROOT / source) == info["sha256"] for source, info in read(run / "inputs.json")["inputs"].items()}
    save(output / "scores.json", report)
    for name, s in report["paired"].items():
        print(json.dumps({"variant": name, "matched": s["matchedManualWords"],
                          "startAbsMs": s["startAbsMs"], "endAbsMs": s["endAbsMs"]}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--score", action="store_true", help="Merge and score with the API Python; no inference")
    args = parser.parse_args()
    run, output = args.snapshot.resolve(), args.output.resolve()
    if any(not p.is_relative_to(ROOT / ".scratch") for p in (run, output)) or run == output:
        raise ValueError("Expected distinct private scratch directories")
    manifest = read(run / "inputs.json")
    for info in manifest["inputs"].values():
        path = (run / info["copy"]).resolve()
        if not path.is_relative_to(run) or digest(path) != info["sha256"]:
            raise ValueError("Frozen input changed")
    if args.score:
        score_run(run, output)
        return
    configure_offline_cpu()
    chunks = read(output / "chunks.json")
    save(output / "started.json", {"inputsSha256": digest(run / "inputs.json"),
                                  "runnerSha256": digest(Path(__file__)),
                                  "studioSha256": digest(ROOT / "services/stt_studio/studio_app/server.py"),
                                  "chunksSha256": digest(output / "chunks.json"),
                                  "device": "cpu", "computeType": "int8", "cpuThreads": 4,
                                  "language": "vi", "model": "large-v3"})
    sys.path.insert(0, str(ROOT / "services/stt_studio"))
    from studio_app import server
    import faster_whisper
    factory = faster_whisper.WhisperModel

    def cpu_model(*args, **kwargs):
        kwargs.update(cpu_threads=4, local_files_only=True)
        return factory(*args, **kwargs)

    faster_whisper.WhisperModel = cpu_model
    original_refiner = server._refine_word_boundaries
    capture = {}

    def capture_refiner(words, spans):
        capture.update(rawWords=deepcopy(words), speechSpans=deepcopy(spans))
        return original_refiner(words, spans)

    server._refine_word_boundaries = capture_refiner
    for number, chunk in enumerate(chunks):
        path = output / f"chunk-{number}.wav"
        with wave.open(str(run / "analysis.wav"), "rb") as source, wave.open(str(path), "wb") as target:
            target.setparams(source.getparams())
            rate = source.getframerate()
            source.setpos(round(chunk["source_start"] * rate))
            pcm = source.readframes(round((chunk["source_end"] - chunk["source_start"]) * rate))
            target.writeframes(pcm)
        started = time.perf_counter()
        capture.clear()
        with PeakWorkingSet() as memory:
            item = server._transcribe(path, "", "large-v3", "vi")
        save(output / f"chunk-{number}.json", {"chunk": chunk, "item": item, **capture,
                                               "inputPcmSha256": hashlib.sha256(pcm).hexdigest(),
                                               "elapsedSeconds": time.perf_counter() - started,
                                               "peakWorkingSetBytes": memory.peak, "memoryError": memory.error})
        print(f"Recognized {number + 1}/{len(chunks)} chunks", flush=True)


if __name__ == "__main__":
    main()
