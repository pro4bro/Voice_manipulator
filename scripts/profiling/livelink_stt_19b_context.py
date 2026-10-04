"""Diagnose 19A live segmentation and test one private silence-boundary candidate.

The candidate runs the current product adapter with only its constructor-level
silence threshold changed. It uses the cached Studio at the supplied URL and
the frozen 19A corpus. It does not patch product source or change recognizer
settings. Use a fresh output directory for every run.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import time
from uuid import uuid4
import wave

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/profiling"))
import livelink_stt_19a_run as baseline
from livelink_stt_19a_score import score_tracks

RATE = baseline.RATE
BASELINE = ROOT / ".scratch/livelink-stt-19a/run-2"
SILENCE_THRESHOLD_SECONDS = 1.1


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def _track_turn_segments(events: list[dict], corpus: dict) -> list[dict]:
    finals = [event for event in events if event.get("status") == "final"]
    by_alias = {f"Track {i + 1}": track for i, track in enumerate(corpus["tracks"])}
    rows = []
    for alias, track in by_alias.items():
        track_finals = [event for event in finals if event.get("alias") == alias]
        assigned: dict[str, list[dict]] = {turn["id"]: [] for turn in track["turns"]}
        orphan_count = 0
        for event in track_finals:
            start = float(event.get("startSeconds", 0))
            end = float(event.get("endSeconds", start))
            overlaps = [(max(0.0, min(end, turn["end"]) - max(start, turn["start"])), turn)
                        for turn in track["turns"]]
            overlap, turn = max(overlaps, key=lambda item: item[0], default=(0.0, None))
            if turn is None or overlap <= 0:
                orphan_count += 1
            else:
                assigned[turn["id"]].append(event)
        for turn in track["turns"]:
            matched = sorted(assigned[turn["id"]], key=lambda event: event.get("startSeconds", 0))
            predicted = " ".join(str(event.get("text") or "") for event in matched)
            scored = score_tracks([{"track": track["track"], "reference": turn["text"],
                                    "text": predicted, "duration": turn["end"] - turn["start"]}], "live")["tracks"][0]
            gaps = [max(0.0, float(right["startSeconds"]) - float(left["endSeconds"]))
                    for left, right in zip(matched, matched[1:])]
            rows.append({"track": track["track"], "turnId": turn["id"],
                         "turnStartSeconds": round(turn["start"], 3),
                         "turnEndSeconds": round(turn["end"], 3),
                         "finalSpanCount": len(matched),
                         "interSpanGapsSeconds": [round(gap, 3) for gap in gaps],
                         "characterEdits": scored["characterEdits"],
                         "referenceCharacters": scored["referenceCharacters"],
                         "syllableEdits": scored["syllableEdits"],
                         "referenceSyllables": scored["referenceSyllables"]})
        rows.append({"track": track["track"], "orphanFinalSpanCount": orphan_count})
    return rows


def _internal_quiet_runs(track: dict, wav_path: Path) -> list[dict]:
    """Measure 250ms quiet bins with the product's sampled >=500 PCM criterion."""
    with wave.open(str(wav_path), "rb") as audio:
        raw = audio.readframes(audio.getnframes())
    results = []
    for turn in track["turns"]:
        first, last = round(turn["start"] * RATE), round(turn["end"] * RATE)
        bins = []
        for start in range(first, last, RATE // 4):
            stop = min(start + RATE // 4, last)
            values = memoryview(raw[start * 2:stop * 2]).cast("h")
            stride = max(1, len(values) // 800)
            voiced = any(abs(values[index]) >= 500 for index in range(0, len(values), stride))
            bins.append((start, stop, voiced))
        while bins and not bins[0][2]:
            bins.pop(0)
        while bins and not bins[-1][2]:
            bins.pop()
        runs = []
        quiet_start = quiet_end = None
        for start, stop, voiced in bins + [(0, 0, True)]:
            if not voiced:
                if quiet_start is None:
                    quiet_start = start
                quiet_end = stop
            elif quiet_start is not None:
                runs.append(round((quiet_end - quiet_start) / RATE, 3))
                quiet_start = quiet_end = None
        results.append({"track": track["track"], "turnId": turn["id"],
                        "internalQuietRunsSeconds": runs,
                        "maxInternalQuietSeconds": max(runs, default=0.0)})
    return results


def diagnose(baseline_dir: Path) -> dict:
    corpus = json.loads((baseline_dir / "frozen-corpus.json").read_text(encoding="utf-8"))
    live = json.loads((baseline_dir / "livelink-live.json").read_text(encoding="utf-8"))
    events = live["events"]
    quiet = []
    for index, track in enumerate(corpus["tracks"]):
        quiet.extend(_internal_quiet_runs(track, baseline_dir / f"track-{index + 1}.wav"))
    final_lags = sorted(float(event.get("lagSeconds", 0)) for event in events
                        if event.get("status") == "final")
    p95_index = max(0, int(0.95 * len(final_lags) + 0.999999) - 1)
    return {
        "source": "persisted LIVELINK-STT-19A run-2; read-only",
        "sourceHashes": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                         for path in (baseline_dir / "track-1.wav", baseline_dir / "track-2.wav")},
        "baselineScore": live["score"],
        "eventCounts": dict(Counter(event.get("status", "unknown") for event in events)),
        "requestErrorCount": sum(event.get("status") == "error" for event in events),
        "finalSpanCount": len(final_lags),
        "finalLagP95Seconds": final_lags[p95_index] if final_lags else None,
        "liveRecognizerRequestCount": None,
        "liveRecognizerRequestCountNote": (
            "19A did not persist live HTTP call rows; event history supports an inferred count of "
            "partial events plus final events, not a direct request log."
        ),
        "inferredLiveRecognizerRequestCount": (
            sum(event.get("status") == "partial" for event in events) +
            sum(event.get("status") == "final" for event in events)
        ),
        "turnMapping": _track_turn_segments(events, corpus),
        "sourceQuietAnalysis": quiet,
        "candidate": {"silenceSeconds": SILENCE_THRESHOLD_SECONDS,
                      "reason": "Above observed <=1.0s internal quiet bins, below the inserted 1.5s inter-turn gap; one 250ms-bin margin."},
    }


async def run_candidate(studio: str, output: Path) -> dict:
    candidate_dir = output / "candidate"
    candidate_dir.mkdir(parents=True, exist_ok=False)
    tracks, frames = baseline.prepare(candidate_dir)
    baseline.save(candidate_dir / "candidate.json", {
        "candidate": "increased LiveLink silence segmentation threshold only",
        "baselineSilenceSeconds": 0.5,
        "candidateSilenceSeconds": SILENCE_THRESHOLD_SECONDS,
        "windowSeconds": 4.0,
        "model": "medium",
        "language": "vi",
        "cadenceMs": 250,
        "frozenCorpus": candidate_dir.relative_to(ROOT).as_posix() + "/frozen-corpus.json",
        "otherRecognizerSettingsChanged": False,
    })
    projects = baseline.FileProjectRepository(candidate_dir / "data/projects")
    project = projects.create(baseline.ProjectCreate(name="19B3 live context candidate", language="vi"))
    recording = str(uuid4())
    channels, sources = [str(uuid4()) for _ in tracks], [str(uuid4()) for _ in tracks]
    folder = Path(project.project_path) / "assets/obs-livelink" / recording
    baseline.save(folder / "recording.json", {
        "recording": {"recordingId": recording, "projectId": project.id, "status": "recording"},
        "channels": [{"channelId": channel, "relayLabel": f"Track {i + 1}"}
                     for i, channel in enumerate(channels)],
    })

    async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=3)) as client:
        health = (await client.get(f"{studio.rstrip('/')}/api/health")).json()
        status = (await client.get(f"{studio.rstrip('/')}/api/status")).json()
        if health.get("status") != "ok" or status.get("device") != "cuda" or status.get("compute_type") != "float16":
            raise RuntimeError(f"Studio is not the expected healthy CUDA/float16 service: {status}")
        warm = await client.post(
            f"{studio.rstrip('/')}/api/audio/import",
            files={"file": ("warm.wav", (ROOT / ".runtime/smoke/rvc-gate/set/self-00.src.wav").read_bytes(), "audio/wav")},
            data={"model": "medium", "language": "vi"},
        )
        warm.raise_for_status()

    live = baseline.ObsLiveLinkTranscription(
        projects, studio, lambda: False, window_seconds=4.0,
        silence_seconds=SILENCE_THRESHOLD_SECONDS,
    )
    step = RATE // 4
    epoch = time.monotonic()
    for sequence, start in enumerate(range(0, frames, step)):
        await asyncio.sleep(max(0, epoch + (start + step) / RATE - time.monotonic()))
        for index, track in enumerate(tracks):
            pcm = track["pcm"][start * 2:(start + step) * 2]
            baseline.chunk(folder, channels[index], sources[index], sequence, start, pcm)
            live.offer(project_id=project.id, recording_id=recording, channel_id=channels[index],
                       source_uuid=sources[index], alias=f"Track {index + 1}", sequence=sequence,
                       first_sample=start, sample_rate=RATE, channels=1,
                       plugin_monotonic_ns=round(start * 1e9 / RATE), recording_started_ns=0, pcm=pcm)
    live.finish(recording)
    await asyncio.wait_for(asyncio.gather(*list(live._tasks.values())), timeout=600)
    elapsed = time.monotonic() - epoch
    events = live.snapshot(project.id, recording)["events"]
    source_hashes = {turn["id"]: {"expected": turn["sha256"],
                                   "actual": hashlib.sha256(Path(turn["source"]).read_bytes()).hexdigest()}
                     for track in tracks for turn in track["turns"]}
    if any(item["expected"] != item["actual"] for item in source_hashes.values()):
        raise AssertionError("A curated source clip changed during the candidate.")
    results = [{**{key: track[key] for key in ("track", "reference", "duration")},
                "text": " ".join(event["text"] for event in events
                                 if event["channelId"] == channels[index] and event["status"] == "final"),
                "words": [word for event in events if event["channelId"] == channels[index]
                          and event["status"] == "final" for word in event.get("words", [])]}
               for index, track in enumerate(tracks)]
    score = score_tracks(results, "live")
    async with httpx.AsyncClient(timeout=httpx.Timeout(3, connect=2)) as client:
        final_status = (await client.get(f"{studio.rstrip('/')}/api/status")).json()
    final_lags = sorted(float(event.get("lagSeconds", 0)) for event in events
                        if event.get("status") == "final")
    p95_index = max(0, int(0.95 * len(final_lags) + 0.999999) - 1)
    artifact = {
        "studio": {"url": studio, "health": health, "initialStatus": status},
        "studioFinalStatus": final_status,
        "candidate": json.loads((candidate_dir / "candidate.json").read_text(encoding="utf-8")),
        "score": score,
        "eventCounts": dict(Counter(event.get("status", "unknown") for event in events)),
        "requestErrorCount": sum(event.get("status") == "error" for event in events),
        "finalSpanCount": len(final_lags),
        "finalLagP95Seconds": final_lags[p95_index] if final_lags else None,
        "elapsedSeconds": round(elapsed, 3),
        "turnMapping": _track_turn_segments(events, json.loads((candidate_dir / "frozen-corpus.json").read_text(encoding="utf-8"))),
        "sourceHashCheckPass": True,
        "sourceHashes": source_hashes,
        "artifacts": {"frozenCorpus": candidate_dir.relative_to(ROOT).as_posix() + "/frozen-corpus.json",
                      "events": folder.relative_to(ROOT).as_posix() + "/transcript-events.jsonl",
                      "trackWavs": [track["wav"].relative_to(ROOT).as_posix() for track in tracks]},
    }
    save(candidate_dir / "result.json", artifact)
    (candidate_dir / "events.json").write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    return artifact


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", default="http://127.0.0.1:18081")
    parser.add_argument("--baseline", type=Path, default=BASELINE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--diagnose-only", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    diagnosis = diagnose(args.baseline.resolve())
    save(output / "diagnosis.json", diagnosis)
    if args.diagnose_only:
        print(json.dumps({key: diagnosis[key] for key in (
            "baselineScore", "eventCounts", "requestErrorCount", "finalSpanCount",
            "finalLagP95Seconds", "candidate")}, indent=2), flush=True)
        return
    candidate = await run_candidate(args.studio, output)
    save(output / "metrics.json", {"diagnosis": diagnosis, "candidate": candidate})
    print(json.dumps({"baseline": diagnosis["baselineScore"],
                      "candidate": candidate["score"],
                      "candidateFinalSpans": candidate["finalSpanCount"],
                      "candidateLagP95Seconds": candidate["finalLagP95Seconds"],
                      "candidateElapsedSeconds": candidate["elapsedSeconds"]}, indent=2), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
