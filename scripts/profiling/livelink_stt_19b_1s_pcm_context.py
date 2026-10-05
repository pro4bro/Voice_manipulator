"""Run one isolated 1.1-second silence-boundary candidate with the timed harness."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/profiling"))
import livelink_stt_19b_timed_context as timed


SILENCE_BOUNDARY_SECONDS = 1.1


async def run(studio: str, output: Path) -> dict:
    adapter_type = timed.baseline.ObsLiveLinkTranscription

    def isolated_candidate(*args, **kwargs):
        if "silence_seconds" in kwargs:
            raise ValueError("Candidate boundary is set only by this isolated driver.")
        return adapter_type(*args, silence_seconds=SILENCE_BOUNDARY_SECONDS, **kwargs)

    # This scoped module patch affects only the harness process. Product defaults
    # and the running API adapter are untouched.
    timed.baseline.ObsLiveLinkTranscription = isolated_candidate
    metrics = await timed.run(studio, output.resolve())
    metrics["round"] = "LIVELINK-STT-19B7"
    metrics["source"] = "frozen 19A corpus and 19B4 PCM-preserving adapter; isolated 19B7 boundary candidate"
    metrics["settings"]["silenceBoundarySeconds"] = SILENCE_BOUNDARY_SECONDS
    metrics["hypothesis"] = {
        "description": "Preserving sub-threshold internal quiet PCM with a 1.1-second utterance boundary may reduce fragmentation without losing source context.",
        "priorRejectedTest": "19B3 used a 1.1-second boundary while dropping sub-threshold internal quiet PCM; its 29-to-16 fragmentation result is not evidence for this candidate.",
        "comparison": "Compare fragmentation, CER/WER, and timed post-source-end latency with 19B6 using the same frozen corpus and budgets.",
        "productDefaultChanged": False,
    }
    (output / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "round": metrics["round"],
        "silenceBoundarySeconds": SILENCE_BOUNDARY_SECONDS,
        "score": metrics["score"],
        "events": metrics["eventCounts"],
        "postSourceClockEndToPersistedSeconds": metrics["postSourceClockEndToPersistedSeconds"],
        "eventErrors": metrics["eventErrorCount"],
        "elapsedSeconds": metrics["elapsedSeconds"],
    }, ensure_ascii=False, indent=2), flush=True)
    return metrics


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", default="http://127.0.0.1:18081")
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    await run(arguments.studio, arguments.output.resolve())


if __name__ == "__main__":
    asyncio.run(main())
