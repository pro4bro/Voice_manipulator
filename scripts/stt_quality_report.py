"""Measure the stabilization acceptance numbers against real project data.

Unit tests answer "does the code run"; they never answered "how much of the data
does this processor actually reach". That gap is why word-timing refinement sat at
0.9% of words across several sessions while every gate reported success.

Run this before and after each round and compare. It reads projects read-only and
works both before and after the storage split, so the same command produces
comparable numbers on either side of a change.

    .venv/Scripts/python.exe scripts/stt_quality_report.py
    .venv/Scripts/python.exe scripts/stt_quality_report.py --project pdca-cldndd-k4
    .venv/Scripts/python.exe scripts/stt_quality_report.py --silence-probe
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import time
import wave
from collections import Counter
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "services" / "api"))

WORD_GROUP_GAP_SECONDS = 0.20
REFINED_SUFFIXES = ("silero-boundary", "silero-edge", "forced-align")


def _load_asset_words(project_root: Path, asset: dict) -> list[dict]:
    """Read words from the split file when present, else from the legacy index."""
    embedded = asset.get("words")
    if isinstance(embedded, list) and embedded:
        return [word for word in embedded if isinstance(word, dict)]
    split = project_root / "assets" / "media" / str(asset.get("id", "")) / "words.json"
    if not split.is_file():
        return []
    try:
        raw = json.loads(split.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [word for word in raw if isinstance(word, dict)] if isinstance(raw, list) else []


def _phrase_groups(words: list[dict], gap: float = WORD_GROUP_GAP_SECONDS) -> list[tuple[int, int]]:
    if not words:
        return []
    groups: list[tuple[int, int]] = []
    start = 0
    for index in range(1, len(words)):
        try:
            silence = float(words[index]["start"]) - float(words[index - 1]["end"])
        except (KeyError, TypeError, ValueError):
            continue
        previous_segment = words[index - 1].get("segmentIndex")
        current_segment = words[index].get("segmentIndex")
        segment_changed = (
            previous_segment is not None
            and current_segment is not None
            and previous_segment != current_segment
        )
        if segment_changed or silence > gap:
            groups.append((start, index))
            start = index
    groups.append((start, len(words)))
    return groups


def _speaker_runs(words: list[dict]) -> tuple[int, int, list[tuple[str, int, float]]]:
    runs: list[tuple[str, int, float]] = []
    unlabeled = 0
    current: str | None = None
    count = 0
    run_start = 0.0
    run_end = 0.0
    for word in words:
        label = word.get("diarizationSpeakerId")
        if not label:
            unlabeled += 1
        if label != current:
            if current is not None:
                runs.append((str(current), count, run_end - run_start))
            current = label
            count = 0
            try:
                run_start = float(word.get("start", 0.0))
            except (TypeError, ValueError):
                run_start = 0.0
        count += 1
        try:
            run_end = float(word.get("end", run_start))
        except (TypeError, ValueError):
            pass
    if current is not None:
        runs.append((str(current), count, run_end - run_start))
    labeled_runs = [run for run in runs if run[0] and run[0] != "None"]
    return len(labeled_runs), unlabeled, labeled_runs


def _short_flips(runs: list[tuple[str, int, float]]) -> int:
    """Count runs of under five words sandwiched between two runs of one speaker."""
    return sum(
        1
        for previous, current, following in zip(runs, runs[1:], runs[2:])
        if previous[0] == following[0] and current[0] != previous[0] and current[1] < 5
    )


def report_project(project_dir: Path) -> dict:
    index_path = project_dir / "assets" / "media" / "index.json"
    if not index_path.is_file():
        return {}
    size_mb = index_path.stat().st_size / 1e6
    try:
        assets = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(assets, list):
        return {}

    print(f"\n=== {project_dir.name}")
    print(f"    index.json {size_mb:.2f} MB · {len(assets)} asset")

    totals = {"words": 0, "trusted": 0, "refined": 0, "groups": 0, "refined_groups": 0}
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        words = _load_asset_words(project_dir, asset)
        if not words:
            continue
        quality = str(asset.get("wordTimingQuality") or "unverified")
        trust_version = int(asset.get("wordTimingTrustVersion") or 0)
        if (
            trust_version < 1
            or any("timingTrusted" not in word for word in words)
        ):
            from app.adapters.word_timing_quality import reconcile_word_timing_quality

            inspection = reconcile_word_timing_quality(
                quality,
                asset.get("wordTimingNote"),
                words,
                float(asset.get("duration") or 0),
                trust_version=trust_version,
            )
            quality = inspection.quality
            words = inspection.words
        sources = Counter(str(word.get("timingSource") or "-") for word in words)
        refined = sum(
            count for source, count in sources.items() if source.endswith(REFINED_SUFFIXES)
        )
        groups = _phrase_groups(words)
        refined_groups = sum(
            1
            for start, end in groups
            if any(
                str(word.get("timingSource") or "").endswith(REFINED_SUFFIXES)
                for word in words[start:end]
            )
        )
        trusted = sum(
            1
            for word in words
            if word.get("timingTrusted") is True
        )
        durations = [
            float(word["end"]) - float(word["start"])
            for word in words
            if isinstance(word.get("start"), (int, float))
            and isinstance(word.get("end"), (int, float))
            and float(word["end"]) > float(word["start"])
        ]
        group_lengths = [
            float(words[end - 1].get("end", 0)) - float(words[start].get("start", 0))
            for start, end in groups
        ]
        run_count, unlabeled, runs = _speaker_runs(words)

        totals["words"] += len(words)
        totals["trusted"] += trusted
        totals["refined"] += refined
        totals["groups"] += len(groups)
        totals["refined_groups"] += refined_groups

        print(f"\n    {asset.get('id')}  {str(asset.get('name'))[:44]}")
        print(
            f"      duration {float(asset.get('duration') or 0):9.1f}s"
            f"   words {len(words):>7,}   quality {quality}"
        )
        print(
            f"      timing trusted   {trusted:>7,} / {len(words):,}"
            f"  ({100 * trusted / len(words):5.1f}%)"
        )
        print(
            f"      edge-refined     {refined:>7,} / {len(words):,}"
            f"  ({100 * refined / len(words):5.1f}%)"
            f"   groups {refined_groups}/{len(groups)}"
        )
        if group_lengths:
            print(
                f"      phrase group     median {statistics.median(group_lengths):6.2f}s"
                f"   max {max(group_lengths):6.2f}s"
            )
        if durations:
            typical = statistics.median(durations)
            limit = max(8.0, typical * 16.0)
            print(
                f"      word span        median {typical:5.3f}s"
                f"   tiny(<25ms) {sum(span < 0.025 for span in durations):,}"
                f"   long(>{limit:.1f}s) {sum(span > limit for span in durations):,}"
            )
        print(f"      timingSource     {dict(sources)}")
        if run_count:
            speakers = len({run[0] for run in runs})
            print(
                f"      diarization      runs {run_count}"
                f"   speakers {speakers}"
                f"   runs/speaker {run_count / max(1, speakers):.1f}"
                f"   unlabeled {unlabeled:,}"
                f"   short flips {_short_flips(runs)}"
            )
    return totals


def benchmark_library(project_id: str) -> None:
    from app.adapters.file_media_library import FileMediaLibrary
    from app.adapters.file_project_repository import FileProjectRepository

    projects = FileProjectRepository(REPOSITORY_ROOT / "data" / "projects")
    media = FileMediaLibrary(projects)
    started = time.perf_counter()
    assets = media.list(project_id)
    first = time.perf_counter() - started
    started = time.perf_counter()
    media.list(project_id)
    second = time.perf_counter() - started
    started = time.perf_counter()
    if assets:
        media.get(project_id, assets[0].id)
    get_elapsed = time.perf_counter() - started
    print(f"\n    media.list()  first {first:6.3f}s   repeat {second:6.3f}s   [threshold < 0.150s]")
    print(f"    media.get()         {get_elapsed:6.3f}s                     [threshold < 0.300s]")


def probe_silence(audio_path: Path) -> None:
    """Time the near-silence guard that runs before ASR starts."""
    started = time.perf_counter()
    with wave.open(str(audio_path), "rb") as stream:
        frames = stream.getnframes()
        rate = stream.getframerate()
        try:
            import audioop

            peak = 0
            sum_squares = 0.0
            counted = 0
            while data := stream.readframes(rate * 8):
                peak = max(peak, audioop.max(data, 2))
                block = len(data) // 2
                sum_squares += (audioop.rms(data, 2) ** 2) * block
                counted += block
            rms = math.sqrt(sum_squares / counted) if counted else 0.0
        except ImportError:
            return
    elapsed = time.perf_counter() - started
    seconds = frames / rate if rate else 0.0
    print(f"\n    silence probe (audioop)  {elapsed:6.3f}s for {seconds:.0f}s audio")
    print(f"      peak {peak}  rms {rms:.1f}  -> near-silent {peak <= 104 and rms <= 52}")
    if seconds:
        print(f"      extrapolated to 9,881s audio: {elapsed * 9881 / seconds:.1f}s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=None, help="Only report this project folder name.")
    parser.add_argument("--benchmark", default=None, help="Project id to time through FileMediaLibrary.")
    parser.add_argument("--silence-probe", action="store_true", help="Time the pre-ASR silence guard.")
    arguments = parser.parse_args()

    projects_root = REPOSITORY_ROOT / "data" / "projects"
    if not projects_root.is_dir():
        print("No local projects found.")
        return 1

    grand = {"words": 0, "trusted": 0, "refined": 0, "groups": 0, "refined_groups": 0}
    for project_dir in sorted(projects_root.iterdir()):
        if not project_dir.is_dir():
            continue
        if arguments.project and project_dir.name != arguments.project:
            continue
        for key, value in (report_project(project_dir) or {}).items():
            grand[key] += value

    if grand["words"]:
        print("\n=== TOTAL")
        print(
            f"    words {grand['words']:,}"
            f"   trusted {100 * grand['trusted'] / grand['words']:.1f}%"
            f"   edge-refined {100 * grand['refined'] / grand['words']:.1f}%"
        )
        if grand["groups"]:
            print(
                f"    phrase groups refined {grand['refined_groups']:,} / {grand['groups']:,}"
                f"  ({100 * grand['refined_groups'] / grand['groups']:.1f}%)"
                f"   [R2 threshold >= 60%]"
            )

    if arguments.benchmark:
        benchmark_library(arguments.benchmark)
    if arguments.silence_probe:
        sample = (
            REPOSITORY_ROOT
            / "data/projects/conviction/assets/media/asset-a29e7bedc07a/analysis.wav"
        )
        if sample.is_file():
            probe_silence(sample)
        else:
            print("\n    silence probe skipped: sample audio not present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
