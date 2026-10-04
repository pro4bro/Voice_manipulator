"""Offline latency attribution for a retained LIVELINK-STT-19B replay."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any


def percentile95(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, int(0.95 * len(ordered) + 0.999999) - 1)]


def summarize(values: list[float]) -> dict[str, float | int | None]:
    return {
        "count": len(values),
        "p50": round(statistics.median(values), 3) if values else None,
        "p95": round(percentile95(values), 3) if values else None,
        "max": round(max(values), 3) if values else None,
        "sum": round(sum(values), 3),
    }


def analyze(trace_dir: Path) -> dict[str, Any]:
    events = json.loads((trace_dir / "events.json").read_text(encoding="utf-8"))
    calls = json.loads((trace_dir / "recognizer-calls.json").read_text(encoding="utf-8"))
    persisted = json.loads((trace_dir / "metrics.json").read_text(encoding="utf-8"))

    final_rows = []
    for event in events:
        if event.get("status") != "final":
            continue
        span_seconds = (
            event["lastSampleIndexExclusive"] - event["firstSampleIndex"]
        ) / event["sampleRate"]
        event_lag = float(event["lagSeconds"])
        final_rows.append({
            "channelId": event["channelId"],
            "utteranceId": event["utteranceId"],
            "sourceSpanSeconds": round(span_seconds, 3),
            "onsetToFinalEventSeconds": round(event_lag, 3),
            # This is a diagnostic subtraction, not an exact post-end latency:
            # _Audio.queued_at is captured at offer time, while samples have
            # source time and are offered in 250 ms bins.
            "lagMinusSourceSpanSeconds": round(max(0.0, event_lag - span_seconds), 3),
        })

    successful_calls = [call for call in calls if "error" not in call]
    live_calls = [call for call in successful_calls if not call["isFinal"]]
    flush_calls = [call for call in successful_calls if call["isFinal"]]
    live_durations = [float(call["elapsedSeconds"]) for call in live_calls]
    flush_durations = [float(call["elapsedSeconds"]) for call in flush_calls]

    duration_groups: dict[str, list[float]] = {}
    for call in live_calls:
        duration = float(call["media"]["durationSeconds"])
        duration_groups.setdefault(f"{duration:.2f}", []).append(
            float(call["elapsedSeconds"])
        )

    return {
        "round": "LIVELINK-STT-19B5",
        "source": trace_dir.as_posix(),
        "eventTimestampAvailability": {
            "wallClockEventTimestampPersisted": False,
            "recognizerCallStartedAtPersisted": False,
            "adapterModelSemaphoreWaitPersisted": False,
            "recognizerHttpElapsedPersisted": True,
        },
        "finalEvents": {
            "count": len(final_rows),
            "onsetToFinalEventSeconds": summarize(
                [row["onsetToFinalEventSeconds"] for row in final_rows]
            ),
            "sourceSpanSeconds": summarize(
                [row["sourceSpanSeconds"] for row in final_rows]
            ),
            "lagMinusSourceSpanSeconds": summarize(
                [row["lagMinusSourceSpanSeconds"] for row in final_rows]
            ),
            "rows": final_rows,
        },
        "recognizerCalls": {
            "totalPersisted": len(calls),
            "successful": len(successful_calls),
            "livePartial": summarize(live_durations),
            "finalFlush": summarize(flush_durations),
            "totalHttpElapsedSeconds": round(sum(live_durations) + sum(flush_durations), 3),
            "liveHttpElapsedByInputDuration": {
                duration: summarize(elapsed)
                for duration, elapsed in sorted(duration_groups.items(), key=lambda row: float(row[0]))
            },
        },
        "consistency": {
            "finalEventsMatchPersistedMetrics": len(final_rows)
            == persisted["eventCounts"].get("final", 0),
            "callCountMatchesPersistedMetrics": len(calls)
            == persisted["recognizerCalls"]["wavInputs"]
            + persisted["recognizerCalls"]["finalFlushes"],
            "reportedFinalLagP95Seconds": persisted["finalEventLagP95Seconds"],
        },
        "interpretation": {
            "eventLagOrigin": "utterance _Audio.queued_at set at onset chunk offer",
            "sourceSpanSubtraction": "diagnostic only; not exact post-end latency because offer time and source time differ within cadence bins",
            "lockWaitAttribution": "unavailable from retained trace",
            "performanceChangeSupported": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--trace-dir", type=Path,
        default=Path(".scratch/livelink-stt-19b4/run-1"),
    )
    parser.add_argument(
        "--output", type=Path,
        default=Path("docs/gates/livelink-stt-19b5-latency-metrics.json"),
    )
    arguments = parser.parse_args()
    result = analyze(arguments.trace_dir)
    if not all(result["consistency"][key] for key in (
        "finalEventsMatchPersistedMetrics", "callCountMatchesPersistedMetrics"
    )):
        raise SystemExit("retained trace does not match its persisted aggregate metrics")
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "finalEvents": result["finalEvents"]["count"],
        "onsetToFinalEventSeconds": result["finalEvents"]["onsetToFinalEventSeconds"],
        "sourceSpanSeconds": result["finalEvents"]["sourceSpanSeconds"],
        "lagMinusSourceSpanSeconds": result["finalEvents"]["lagMinusSourceSpanSeconds"],
        "liveHttpElapsedSeconds": result["recognizerCalls"]["livePartial"]["sum"],
        "finalFlushHttpElapsedSeconds": result["recognizerCalls"]["finalFlush"]["sum"],
        "performanceChangeSupported": result["interpretation"]["performanceChangeSupported"],
    }, indent=2))


if __name__ == "__main__":
    main()
