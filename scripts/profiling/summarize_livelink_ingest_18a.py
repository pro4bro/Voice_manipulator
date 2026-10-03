"""Summarize retained scratch evidence without introducing product code probes."""
import csv
from collections import defaultdict
import json
import math
from pathlib import Path
import statistics
import time

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / ".scratch/livelink-ingest-18a"


def summarize(values):
    return {"count": len(values), "totalMs": sum(values), "p50Ms": statistics.median(values),
            "p95Ms": sorted(values)[math.ceil(.95*len(values))-1], "maxMs": max(values)}


def csv_report(path):
    stages = defaultdict(list)
    with path.open() as source:
        for row in csv.DictReader(source):
            stages[row["stage"]].append(float(row["milliseconds"]))
    return {stage: summarize(values) for stage, values in stages.items()}


def timer_overhead():
    # CPU-only paired loop. No filesystem calls or logs in the measured loop.
    def original():
        return None
    def instrumented():
        begin = time.perf_counter_ns()
        original()
        return time.perf_counter_ns() - begin
    count = 200000
    begin = time.perf_counter_ns()
    for _ in range(count):
        original()
    direct = time.perf_counter_ns()-begin
    begin = time.perf_counter_ns()
    for _ in range(count):
        instrumented()
    measured = time.perf_counter_ns()-begin
    return {"iterations": count, "incrementalNanosecondsPerCall": (measured-direct)/count,
            "scope": "Two perf_counter_ns calls and Python dispatch only; excludes contention/list append"}


def main():
    full = json.loads((DATA / "full-baseline/report.json").read_text())
    measured = json.loads((DATA / "probe-instrumented/report.json").read_text())
    control = json.loads((DATA / "probe-control/report.json").read_text())
    assert full["chunkCount"] == 2524 and full["sourceContinuityPassed"]
    assert full["inputCatalogSha256"] == measured["inputCatalogSha256"] == control["inputCatalogSha256"]
    retained = full["retainedTake"]
    # Original scratch reports used an overly broad label; envelope files are
    # atomic/rebuildable and explicitly do not fsync. Preserve the raw data.
    if "waveformComputeAndDurable" in full["stages"]:
        full["stages"]["waveformComputeAndAtomicPublish"] = full["stages"].pop("waveformComputeAndDurable")
    measured_total = measured["stages"]["httpDurableAck"]["totalMs"]
    control_total = control["stages"]["httpDurableAck"]["totalMs"]
    report = {
        "round": "LIVELINK-INGEST-18A", "baselineCommit": "bfb326e", "productBehaviorChanged": False,
        "input": {"recordingId": "f9495cf6-1881-51ce-9f46-f01bb6d18d1c", "chunkCount": full["chunkCount"],
                  "inputBytes": full["inputBytes"], "metadataCatalogSha256": full["inputCatalogSha256"],
                  "tracks": 6, "nativeFormat": "PCM16, 48000 Hz, 2 channels per source",
                  "ordering": "pluginMonotonicNs, channelId, sequence", "continuityPassed": True,
                  "pauseGapCount": sum(len(v) for v in full["sourceSampleGaps"].values())},
        "httpReplay": {"ingressSeconds": full["ingressSeconds"], "lastAckToReadySeconds": full["lastAckToReadySeconds"],
                       "finalizeSeconds": full["finalizeSeconds"], "stages": full["stages"],
                       "hardwareStopToLastAckSeconds": None, "scopeExclusions": full["exclusions"]},
        "nativeSpool": csv_report(DATA / "native-spool/events.csv"),
        "nativeCaptureSynthetic": csv_report(DATA / "capture-events.csv"),
        "retainedTake": {k:v for k,v in retained.items() if k != "spoolSamples"},
        "instrumentation": {"pairedChunks": 120, "instrumentedAckTotalMs": measured_total,
                            "controlAckTotalMs": control_total,
                            "observedWallDeltaPercent": 100*(measured_total/control_total-1),
                            "causalOverheadIsolated": False,
                            "caveat": "One sequential pair on real disk; timing difference includes storage/cache/scheduling variation. Initial probe has four high-level wrappers; full run additionally times fsync/replace.",
                            "timerMicrobenchmark": timer_overhead()},
        "remainingEvidence": ["Exact native Stop-to-last-durable-ACK clock", "Live callback enqueue/dequeue age",
                              "Classification of six startup overflow deltas; historical totals include pre-Record loss",
                              "Six-source replay with actual WinHTTP, live STT and physical OBS scheduler"]}
    pairs = full["stages"]["pcmAndMetadataDurable"]["totalMs"]
    report["selectedBottleneck"] = {"stage": "API per-chunk PCM/metadata durable pair",
                                   "shareOfApiChunkTotalPercent": 100*pairs/full["stages"]["apiChunkTotal"]["totalMs"],
                                   "scope": "Measured dominant service stage in isolated replay; not a proof of sole live OBS bottleneck"}
    analyses = json.loads((DATA / "analysis-integrity.json").read_text())
    assert len(analyses) == 6 and all(track["matchesRetained"] for track in analyses)
    report["analysisIntegrity"] = analyses
    target = ROOT / "docs/gates/livelink-ingest-18a-metrics.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
