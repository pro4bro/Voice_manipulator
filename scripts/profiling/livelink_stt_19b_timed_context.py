"""Replay the frozen 19A corpus with adapter timing probes, without product edits."""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import statistics
import sys
import time
from uuid import uuid4
import wave

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/profiling"))
import livelink_stt_19b_pcm_context as previous
from livelink_stt_19a_score import score_tracks

baseline = previous.baseline
RATE = previous.RATE
MEDIUM_CACHE = previous.MEDIUM_CACHE


def percentile95(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, int(0.95 * len(ordered) + 0.999999) - 1)]


def summary(values: list[float]) -> dict:
    return {
        "count": len(values),
        "p50Seconds": round(statistics.median(values), 4) if values else None,
        "p95Seconds": round(percentile95(values), 4) if values else None,
        "maxSeconds": round(max(values), 4) if values else None,
    }


def wav_header_metrics(payload: bytes) -> dict:
    """Read only WAV metadata so profiling does not scan PCM on the event loop."""
    with wave.open(io.BytesIO(payload), "rb") as audio:
        channels = audio.getnchannels()
        sample_width = audio.getsampwidth()
        sample_rate = audio.getframerate()
        frames = audio.getnframes()
    return {"channels": channels, "sampleWidthBytes": sample_width,
            "sampleRate": sample_rate, "frames": frames,
            "durationSeconds": frames / sample_rate}


class TimedSemaphore:
    """Wrap the adapter's semaphore and attribute acquisition waits by task."""

    def __init__(self, semaphore: asyncio.Semaphore, waits: dict) -> None:
        self.semaphore = semaphore
        self.waits = waits

    async def __aenter__(self):
        started = time.monotonic()
        await self.semaphore.acquire()
        acquired = time.monotonic()
        task = asyncio.current_task()
        self.waits.setdefault(task, []).append((started, acquired))
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        self.semaphore.release()
        return False


async def run(studio: str, output: Path) -> dict:
    if not MEDIUM_CACHE.is_dir() or not any(MEDIUM_CACHE.rglob("model.bin")):
        raise RuntimeError(f"Cached medium model is absent; refusing a model download: {MEDIUM_CACHE}")
    output.mkdir(parents=True, exist_ok=False)
    tracks, frames = baseline.prepare(output)
    expected_hashes = {turn["id"]: turn["sha256"] for track in tracks for turn in track["turns"]}
    projects = baseline.FileProjectRepository(output / "data/projects")
    project = projects.create(baseline.ProjectCreate(name="19B6 timed LiveLink replay", language="vi"))
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

    waits_by_task: dict = {}
    calls: list[dict] = []
    event_timings: list[dict] = []
    offer_rows: list[dict] = []
    offer_at_end: dict[tuple[str, int], float] = {}
    session_call_indices: dict[str, list[int]] = {}
    epoch: float | None = None

    async def recognize(session: str, payload: bytes | None, language: str) -> dict:
        task = asyncio.current_task()
        lock_start, lock_acquired = waits_by_task[task].pop(0)
        channel, first_sample = previous._session_identity(session, recording_id, channels)
        media = wav_header_metrics(payload) if payload is not None else None
        if media is not None:
            if (media["channels"], media["sampleWidthBytes"], media["sampleRate"]) != (1, 2, RATE):
                raise ValueError(f"Unexpected recognizer WAV format: {media}")
        request_started = time.monotonic()
        row = {
            "channelId": channel,
            "session": session,
            "firstSampleIndex": first_sample,
            "isFinal": payload is None,
            "media": media,
            "semaphoreWaitStartedMonotonic": lock_start,
            "semaphoreAcquiredMonotonic": lock_acquired,
            "semaphoreWaitSeconds": round(lock_acquired - lock_start, 6),
            "httpStartedMonotonic": request_started,
        }
        call_index = len(calls)
        calls.append(row)
        session_call_indices.setdefault(session, []).append(call_index)
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
            result = response.json()
            row["httpStatus"] = response.status_code
            return result
        except Exception as exc:
            row["error"] = str(exc)
            raise
        finally:
            row["httpCompletedMonotonic"] = time.monotonic()
            row["httpElapsedSeconds"] = round(
                row["httpCompletedMonotonic"] - request_started, 6)

    live = baseline.ObsLiveLinkTranscription(projects, studio, lambda: False, recognize)
    live._model = TimedSemaphore(live._model, waits_by_task)
    append_event = live._append_event

    async def timed_append_event(item, utterance, **fields):
        started = time.monotonic()
        await append_event(item, utterance, **fields)
        persisted = time.monotonic()
        event_timings.append({
            "channelId": item.channel_id,
            "status": fields.get("status"),
            "utteranceId": utterance.utterance_id if utterance else None,
            "firstSampleIndex": utterance.start if utterance else item.first_sample,
            "lastSampleIndexExclusive": utterance.end if utterance else item.first_sample,
            "appendStartedMonotonic": started,
            "appendReturnedMonotonic": persisted,
            "appendElapsedSeconds": round(persisted - started, 6),
        })

    live._append_event = timed_append_event
    step = RATE // 4
    epoch = time.monotonic()
    for sequence, start in enumerate(range(0, frames, step)):
        await asyncio.sleep(max(0, epoch + (start + step) / RATE - time.monotonic()))
        for index, track in enumerate(tracks):
            pcm = track["pcm"][start * 2:(start + step) * 2]
            channel = channels[index]
            baseline.chunk(folder, channel, sources[index], sequence, start, pcm)
            offered = time.monotonic()
            end_sample = start + len(pcm) // 2
            offer_at_end[(channel, end_sample)] = offered
            offer_rows.append({
                "channelId": channel,
                "sequence": sequence,
                "firstSampleIndex": start,
                "lastSampleIndexExclusive": end_sample,
                "sourceStartSeconds": start / RATE,
                "sourceEndSeconds": end_sample / RATE,
                "replayEpochMonotonic": epoch,
                "offerMonotonic": offered,
                "offerAtOffsetFromReplayEpochSeconds": round(offered - epoch, 6),
                "sourceEndClockSkewSeconds": round(offered - (epoch + end_sample / RATE), 6),
            })
            live.offer(project_id=project.id, recording_id=recording_id,
                       channel_id=channel, source_uuid=sources[index],
                       alias=f"Track {index + 1}", sequence=sequence,
                       first_sample=start, sample_rate=RATE, channels=1,
                       plugin_monotonic_ns=round(start * 1e9 / RATE),
                       recording_started_ns=0, pcm=pcm)
    live.finish(recording_id)
    await asyncio.wait_for(asyncio.gather(*list(live._tasks.values())), timeout=600)
    elapsed = time.monotonic() - epoch
    events = live.snapshot(project.id, recording_id)["events"]
    # Persist probes only after the paced run. Synchronous JSON rewrites while
    # capture is active can block the event loop and distort queue/timing data.
    baseline.save(output / "recognizer-timings.json", calls)
    baseline.save(output / "event-persistence.json", event_timings)
    baseline.save(output / "offer-schedule.json", offer_rows)
    event_counts = Counter(event["status"] for event in events)
    final_timing_rows = []
    span_checks = []
    persisted_finals = {
        (row["channelId"], row["utteranceId"], row["lastSampleIndexExclusive"]): row
        for row in event_timings if row["status"] == "final"
    }
    for event in events:
        if event["status"] != "final":
            continue
        channel = event["channelId"]
        end_sample = int(event["lastSampleIndexExclusive"])
        offer = offer_at_end.get((channel, end_sample))
        persisted = persisted_finals.get((channel, event["utteranceId"], end_sample))
        if offer is None or persisted is None:
            raise AssertionError("Final event could not be tied to its source chunk offer and persist return")
        session = next((call["session"] for call in calls
                        if call["channelId"] == channel and
                        call["firstSampleIndex"] == event["firstSampleIndex"]), None)
        submitted_frames = sum(
            int(call["media"]["frames"])
            for call in calls
            if call["session"] == session and call["media"] is not None
        )
        source_frames = end_sample - int(event["firstSampleIndex"])
        span_check = {
            "channelId": channel,
            "firstSampleIndex": int(event["firstSampleIndex"]),
            "lastSampleIndexExclusive": end_sample,
            "recognizerInputFrames": submitted_frames,
            "sourceFrames": source_frames,
            "matchesSourceSpan": submitted_frames == source_frames,
        }
        span_checks.append(span_check)
        final_calls = [calls[index] for index in session_call_indices.get(session or "", [])]
        final_timing_rows.append({
            "channelId": channel,
            "utteranceId": event["utteranceId"],
            "firstSampleIndex": event["firstSampleIndex"],
            "lastSampleIndexExclusive": end_sample,
            "sampleRate": event["sampleRate"],
            "sourceEndSeconds": event["endSeconds"],
            "sourceEndOfferMonotonic": offer,
            "sourceEndExpectedMonotonic": epoch + end_sample / RATE,
            "sourceEndOfferSkewSeconds": round(offer - (epoch + end_sample / RATE), 6),
            "finalEventAppendStartedMonotonic": persisted["appendStartedMonotonic"],
            "finalEventPersistedMonotonic": persisted["appendReturnedMonotonic"],
            "postLastSampleOfferToPersistedSeconds": round(
                persisted["appendReturnedMonotonic"] - offer, 6),
            "postSourceClockEndToPersistedSeconds": round(
                persisted["appendReturnedMonotonic"] - (epoch + end_sample / RATE), 6),
            "onsetToFinalEventLagSeconds": event["lagSeconds"],
            "semaphoreWaitSeconds": round(sum(call["semaphoreWaitSeconds"] for call in final_calls), 6),
            "httpElapsedSeconds": round(sum(call.get("httpElapsedSeconds", 0) for call in final_calls), 6),
            "httpCalls": len(final_calls),
            "eventAppendElapsedSeconds": persisted["appendElapsedSeconds"],
        })
    if not span_checks or not all(row["matchesSourceSpan"] for row in span_checks):
        raise AssertionError("Recognizer input frame totals do not match final source spans")

    live_tracks = [{**{key: track[key] for key in ("track", "reference", "duration")},
                    "text": " ".join(event["text"] for event in events
                                     if event["channelId"] == channels[index] and
                                     event["status"] == "final")}
                   for index, track in enumerate(tracks)]
    score = score_tracks(live_tracks, "live")
    source_hashes = {turn["id"]: hashlib.sha256(Path(turn["source"]).read_bytes()).hexdigest()
                     for track in tracks for turn in track["turns"]}
    if source_hashes != expected_hashes:
        raise AssertionError("A curated source clip changed during the timed replay")
    async with httpx.AsyncClient(timeout=httpx.Timeout(3, connect=2)) as client:
        final_status = (await client.get(f"{studio.rstrip('/')}/api/status")).json()

    metrics = {
        "round": "LIVELINK-STT-19B6",
        "source": "same frozen 19A corpus and 19B4 product adapter replay",
        "settings": {"windowSeconds": 4.0, "silenceBoundarySeconds": 0.5,
                     "model": "medium", "language": "vi", "cadenceMilliseconds": 250},
        "score": score,
        "eventCounts": dict(event_counts),
        "eventErrorCount": event_counts["error"],
        "recognizerSourceSpanChecks": {
            "count": len(span_checks),
            "matches": sum(row["matchesSourceSpan"] for row in span_checks),
            "allMatch": bool(span_checks) and all(row["matchesSourceSpan"] for row in span_checks),
            "rows": span_checks,
        },
        "finalEventOnsetLagSeconds": summary([row["onsetToFinalEventLagSeconds"]
                                               for row in final_timing_rows]),
        "postLastSampleOfferToPersistedSeconds": summary([
            row["postLastSampleOfferToPersistedSeconds"] for row in final_timing_rows]),
        "postSourceClockEndToPersistedSeconds": summary([
            row["postSourceClockEndToPersistedSeconds"] for row in final_timing_rows]),
        "semaphoreWaitPerFinalSessionSeconds": summary([
            row["semaphoreWaitSeconds"] for row in final_timing_rows]),
        "httpElapsedPerFinalSessionSeconds": summary([
            row["httpElapsedSeconds"] for row in final_timing_rows]),
        "eventAppendElapsedSeconds": summary([
            row["eventAppendElapsedSeconds"] for row in final_timing_rows]),
        "finalTimingRows": final_timing_rows,
        "recognizerCalls": {
            "count": len(calls),
            "semaphoreWaitSeconds": summary([row["semaphoreWaitSeconds"] for row in calls]),
            "httpElapsedSeconds": summary([row.get("httpElapsedSeconds", 0) for row in calls]),
            "errors": sum("error" in row for row in calls),
        },
        "offerSchedule": {
            "count": len(offer_rows),
            "offerSourceClockSkewSeconds": summary([
                row["sourceEndClockSkewSeconds"] for row in offer_rows]),
        },
        "elapsedSeconds": round(elapsed, 3),
        "audioTimelineSeconds": frames / RATE,
        "sourceHashes": {"count": len(source_hashes), "allUnchanged": source_hashes == expected_hashes},
        "studio": {"url": studio, "healthBefore": health,
                   "initialStatus": initial_status, "finalStatus": final_status},
        "artifacts": {"frozenCorpus": (output / "frozen-corpus.json").relative_to(ROOT).as_posix(),
                      "events": folder.relative_to(ROOT).as_posix() + "/transcript-events.jsonl",
                      "offers": (output / "offer-schedule.json").relative_to(ROOT).as_posix(),
                      "calls": (output / "recognizer-timings.json").relative_to(ROOT).as_posix(),
                      "eventPersistence": (output / "event-persistence.json").relative_to(ROOT).as_posix(),
                      "trackWavs": [track["wav"].relative_to(ROOT).as_posix() for track in tracks]},
    }
    baseline.save(output / "events.json", events)
    baseline.save(output / "offer-schedule.json", offer_rows)
    baseline.save(output / "event-persistence.json", event_timings)
    baseline.save(output / "metrics.json", metrics)
    print(json.dumps({"score": score,
                      "finalOnsetLagSeconds": metrics["finalEventOnsetLagSeconds"],
                      "postLastSampleOfferToPersistedSeconds": metrics[
                          "postLastSampleOfferToPersistedSeconds"],
                      "semaphoreWaitPerFinalSessionSeconds": metrics[
                          "semaphoreWaitPerFinalSessionSeconds"],
                      "httpElapsedPerFinalSessionSeconds": metrics[
                          "httpElapsedPerFinalSessionSeconds"],
                      "eventErrors": event_counts["error"],
                      "elapsedSeconds": elapsed}, indent=2), flush=True)
    return metrics


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", default="http://127.0.0.1:18081")
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    await run(arguments.studio, arguments.output.resolve())


if __name__ == "__main__":
    asyncio.run(main())
