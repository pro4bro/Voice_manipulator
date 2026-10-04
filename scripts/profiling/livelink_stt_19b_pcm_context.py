"""Run the frozen 19A warm live corpus against the product PCM context repair.

The runner uses the current API adapter with default 4s windows and 0.5s
utterance boundaries. It paces both tracks at 250ms, reuses a healthy local
Studio with the medium model already cached, and verifies submitted WAV-frame
totals against source-sample spans. Use a fresh output directory.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct
import sys
import time
import wave
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/profiling"))
import livelink_stt_19a_run as baseline
from livelink_stt_19a_score import score_tracks

RATE = baseline.RATE
MEDIUM_CACHE = ROOT / ".runtime/omnivoice-studio/models/models--Systran--faster-whisper-medium"


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def wav_metrics(payload: bytes) -> dict:
    with wave.open(__import__("io").BytesIO(payload), "rb") as audio:
        channels, width, rate, frames = (audio.getnchannels(), audio.getsampwidth(),
                                         audio.getframerate(), audio.getnframes())
        pcm = audio.readframes(frames)
    if width != 2:
        raise ValueError(f"Recognizer input is not PCM16: sample width={width}")
    samples = struct.unpack("<" + "h" * (len(pcm) // 2), pcm)
    return {"channels": channels, "sampleWidthBytes": width, "sampleRate": rate,
            "frames": frames, "durationSeconds": frames / rate,
            "sha256": hashlib.sha256(pcm).hexdigest(),
            "peakAbsSample": max((abs(sample) for sample in samples), default=0),
            "clippedSampleCount": sum(sample in (-32768, 32767) for sample in samples)}


def _session_identity(session: str, recording_id: str, channels: list[str]) -> tuple[str, int]:
    prefix = f"obs-v3-{recording_id}-"
    if not session.startswith(prefix):
        raise ValueError("Live STT session is outside this owned recording.")
    suffix = session[len(prefix):]
    for channel in channels:
        marker = f"{channel}-"
        if suffix.startswith(marker):
            first_sample = int(suffix[len(marker):].split("-", 1)[0])
            return channel, first_sample
    raise ValueError("Live STT session has an unknown channel.")


async def run(studio: str, output: Path) -> dict:
    if not MEDIUM_CACHE.is_dir() or not any(MEDIUM_CACHE.rglob("model.bin")):
        raise RuntimeError(f"Cached medium model is absent; refusing a model download: {MEDIUM_CACHE}")
    output.mkdir(parents=True, exist_ok=False)
    tracks, frames = baseline.prepare(output)
    expected_hashes = {turn["id"]: turn["sha256"] for track in tracks for turn in track["turns"]}
    projects = baseline.FileProjectRepository(output / "data/projects")
    project = projects.create(baseline.ProjectCreate(name="19B4 preserved LiveLink PCM context", language="vi"))
    recording_id = str(uuid4())
    channels = [str(uuid4()) for _ in tracks]
    sources = [str(uuid4()) for _ in tracks]
    folder = Path(project.project_path) / "assets/obs-livelink" / recording_id
    baseline.save(folder / "recording.json", {
        "recording": {"recordingId": recording_id, "projectId": project.id,
                      "status": "recording", "startedMonotonicNs": 0},
        "channels": [{"channelId": channel, "relayLabel": f"Track {index + 1}"}
                     for index, channel in enumerate(channels)],
    })

    calls = []
    session_frames: Counter[tuple[str, int]] = Counter()
    async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=3)) as client:
        health = (await client.get(f"{studio.rstrip('/')}/api/health")).json()
        initial_status = (await client.get(f"{studio.rstrip('/')}/api/status")).json()
        if (health.get("status") != "ok" or initial_status.get("device") != "cuda" or
                initial_status.get("compute_type") != "float16"):
            raise RuntimeError(f"Studio is not healthy CUDA/float16: {initial_status}")
        warm_path = ROOT / ".runtime/smoke/rvc-gate/set/self-00.src.wav"
        warm = await client.post(
            f"{studio.rstrip('/')}/api/audio/import",
            files={"file": ("warm.wav", warm_path.read_bytes(), "audio/wav")},
            data={"model": "medium", "language": "vi"},
        )
        warm.raise_for_status()

    async def recognize(session: str, payload: bytes | None, language: str) -> dict:
        channel = first_sample = None
        media = None
        if payload is not None:
            channel, first_sample = _session_identity(session, recording_id, channels)
            media = wav_metrics(payload)
            if (media["channels"], media["sampleWidthBytes"], media["sampleRate"]) != (1, 2, RATE):
                raise ValueError(f"Unexpected recognizer WAV format: {media}")
            session_frames[(channel, first_sample)] += media["frames"]
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=3.0)) as client:
                if payload is None:
                    response = await client.post(
                        f"{studio.rstrip('/')}/api/audio/live/end", data={"session": session})
                else:
                    response = await client.post(
                        f"{studio.rstrip('/')}/api/audio/live/chunk",
                        files={"file": ("obs-v3.wav", payload, "audio/wav")},
                        data={"session": session, "model": "medium", "language": language},
                    )
            response.raise_for_status()
            row = {"channelId": channel, "firstSampleIndex": first_sample,
                   "isFinal": payload is None, "media": media,
                   "elapsedSeconds": round(time.monotonic() - started, 3),
                   "httpStatus": response.status_code}
            calls.append(row)
            save(output / "recognizer-calls.json", calls)
            return response.json()
        except Exception as exc:
            calls.append({"channelId": channel, "firstSampleIndex": first_sample,
                          "isFinal": payload is None, "media": media,
                          "elapsedSeconds": round(time.monotonic() - started, 3),
                          "error": str(exc)})
            save(output / "recognizer-calls.json", calls)
            raise

    live = baseline.ObsLiveLinkTranscription(projects, studio, lambda: False, recognize)
    step = RATE // 4
    epoch = time.monotonic()
    for sequence, start in enumerate(range(0, frames, step)):
        await asyncio.sleep(max(0, epoch + (start + step) / RATE - time.monotonic()))
        for index, track in enumerate(tracks):
            pcm = track["pcm"][start * 2:(start + step) * 2]
            baseline.chunk(folder, channels[index], sources[index], sequence, start, pcm)
            live.offer(project_id=project.id, recording_id=recording_id,
                       channel_id=channels[index], source_uuid=sources[index],
                       alias=f"Track {index + 1}", sequence=sequence,
                       first_sample=start, sample_rate=RATE, channels=1,
                       plugin_monotonic_ns=round(start * 1e9 / RATE),
                       recording_started_ns=0, pcm=pcm)
    live.finish(recording_id)
    await asyncio.wait_for(asyncio.gather(*list(live._tasks.values())), timeout=600)
    elapsed = time.monotonic() - epoch
    events = live.snapshot(project.id, recording_id)["events"]
    event_counts = Counter(event["status"] for event in events)
    live_tracks = [{**{key: track[key] for key in ("track", "reference", "duration")},
                    "text": " ".join(event["text"] for event in events
                                     if event["channelId"] == channels[index] and
                                     event["status"] == "final")}
                   for index, track in enumerate(tracks)]
    score = score_tracks(live_tracks, "live")

    span_checks = []
    for event in events:
        if event["status"] != "final":
            continue
        channel = event["channelId"]
        first_sample = int(event["firstSampleIndex"])
        expected_frames = int(event["lastSampleIndexExclusive"]) - first_sample
        submitted_frames = session_frames[(channel, first_sample)]
        span_checks.append({"channelId": channel, "firstSampleIndex": first_sample,
                            "lastSampleIndexExclusive": event["lastSampleIndexExclusive"],
                            "expectedSourceFrames": expected_frames,
                            "recognizerInputFrames": submitted_frames,
                            "matchesSourceSpan": submitted_frames == expected_frames})
    source_hashes = {turn["id"]: hashlib.sha256(Path(turn["source"]).read_bytes()).hexdigest()
                     for track in tracks for turn in track["turns"]}
    if source_hashes != expected_hashes:
        raise AssertionError("A curated source clip changed during the live replay.")
    async with httpx.AsyncClient(timeout=httpx.Timeout(3, connect=2)) as client:
        final_status = (await client.get(f"{studio.rstrip('/')}/api/status")).json()

    lags = sorted(float(event.get("lagSeconds", 0)) for event in events if event["status"] == "final")
    p95_index = max(0, int(0.95 * len(lags) + 0.999999) - 1)
    metrics = {
        "round": "LIVELINK-STT-19B4",
        "source": "16 curated self utterances from frozen LIVELINK-STT-19A corpus",
        "settings": {"adapter": "current product ObsLiveLinkTranscription defaults",
                     "windowSeconds": 4.0, "silenceBoundarySeconds": 0.5,
                     "model": "medium", "language": "vi", "cadenceMilliseconds": 250},
        "score": score,
        "eventCounts": dict(event_counts),
        "eventErrorCount": event_counts["error"],
        "finalEventLagP95Seconds": lags[p95_index] if lags else None,
        "elapsedSeconds": round(elapsed, 3),
        "audioTimelineSeconds": frames / RATE,
        "recognizerCalls": {"wavInputs": sum(not call["isFinal"] and "error" not in call for call in calls),
                             "finalFlushes": sum(call["isFinal"] and "error" not in call for call in calls),
                             "errors": sum("error" in call for call in calls),
                             "inputFormatsValid": all(
                                 call.get("isFinal") or
                                 (call.get("media", {}).get("channels") == 1 and
                                  call.get("media", {}).get("sampleWidthBytes") == 2 and
                                  call.get("media", {}).get("sampleRate") == RATE)
                                 for call in calls if "error" not in call)},
        "recognizerSourceSpanChecks": {"count": len(span_checks),
                                       "matches": sum(item["matchesSourceSpan"] for item in span_checks),
                                       "allMatch": bool(span_checks) and all(
                                           item["matchesSourceSpan"] for item in span_checks),
                                       "rows": span_checks},
        "sourceHashes": {"count": len(source_hashes), "allUnchanged": source_hashes == expected_hashes},
        "studio": {"url": studio, "healthBefore": health,
                   "initialStatus": initial_status, "finalStatus": final_status},
        "artifacts": {"frozenCorpus": (output / "frozen-corpus.json").relative_to(ROOT).as_posix(),
                      "events": folder.relative_to(ROOT).as_posix() + "/transcript-events.jsonl",
                      "calls": (output / "recognizer-calls.json").relative_to(ROOT).as_posix(),
                      "trackWavs": [track["wav"].relative_to(ROOT).as_posix() for track in tracks]},
    }
    save(output / "events.json", events)
    save(output / "metrics.json", metrics)
    print(json.dumps({"score": score, "events": dict(event_counts),
                      "lagP95Seconds": metrics["finalEventLagP95Seconds"],
                      "sourceSpanChecks": metrics["recognizerSourceSpanChecks"]["matches"],
                      "elapsedSeconds": metrics["elapsedSeconds"]}, indent=2), flush=True)
    return metrics


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", default="http://127.0.0.1:18081")
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    await run(arguments.studio, arguments.output.resolve())


if __name__ == "__main__":
    asyncio.run(main())
