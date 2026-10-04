"""18D screening for the repeated per-pair mkdir in the durable writer.

Storage-only: source chunks are read-only; both variants use fresh same-volume
directories, two fsyncs, and PCM-before-metadata publication. The candidate
assumes its persistent per-channel chunks directory already exists.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from livelink_ingest_18a import SOURCE, summary


def prepared_pair(pcm_path: Path, pcm: bytes, metadata_path: Path, metadata: bytes) -> None:
    """Write a pair into an existing channel directory; retain writer contract."""
    if pcm_path.parent != metadata_path.parent or not pcm_path.parent.is_dir():
        raise ValueError("PCM and metadata require the same prepared channel directory")
    pcm_part = pcm_path.with_name(pcm_path.name + ".part")
    metadata_part = metadata_path.with_name(metadata_path.name + ".part")

    def prepare(path: Path, data: bytes) -> None:
        with path.open("wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())

    with ThreadPoolExecutor(max_workers=2) as writers:
        pcm_write = writers.submit(prepare, pcm_part, pcm)
        metadata_write = writers.submit(prepare, metadata_part, metadata)
        pcm_write.result()
        metadata_write.result()
    os.replace(pcm_part, pcm_path)
    os.replace(metadata_part, metadata_path)


def load_groups(groups: int):
    folders = sorted((SOURCE / "channels").iterdir())
    if len(folders) != 6:
        raise ValueError("Six-source fixture required")
    catalog = hashlib.sha256()
    all_pairs = []
    selected_groups = []
    for sequence in range(groups):
        group = []
        for folder in folders:
            source_json = folder / "chunks" / f"{sequence:012d}.json"
            metadata = source_json.read_bytes()
            item = json.loads(metadata)
            pcm_path = source_json.with_suffix(".pcm")
            pcm = pcm_path.read_bytes()
            if len(pcm) != item["frameCount"] * item["channels"] * 2 or hashlib.sha256(pcm).hexdigest() != item["sha256"]:
                raise ValueError("Source PCM size/hash mismatch")
            catalog.update(folder.name.encode())
            catalog.update(metadata)
            group.append((folder.name, sequence, metadata, pcm, source_json))
            all_pairs.append((source_json, metadata, pcm))
        selected_groups.append(group)
    return selected_groups, all_pairs, catalog.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--groups", type=int, default=60)
    args = parser.parse_args()
    if not 6 <= args.groups <= 120:
        raise ValueError("Use 6..120 groups for the bounded six-source screen")
    target = args.output.resolve()
    if target.drive.lower() != SOURCE.drive.lower() or target.is_relative_to(SOURCE.resolve()):
        raise ValueError("Fresh output on source E: volume, outside original recording required")
    target.mkdir(parents=True, exist_ok=False)

    groups, source_pairs, catalog = load_groups(args.groups)
    modes = {
        "current": FileObsLiveLinkAudio._write_chunk_pair,
        "preparedDirectory": prepared_pair,
    }
    timings = {mode: [] for mode in modes}
    destinations = {mode: target / mode for mode in modes}
    for destination in destinations.values():
        for folder, *_ in groups[0]:
            (destination / folder).mkdir(parents=True, exist_ok=False)

    pair_index = 0
    for group_index, group in enumerate(groups):
        for channel, sequence, metadata, pcm, _source_json in group:
            ordered_modes = tuple(modes) if pair_index % 2 == 0 else tuple(reversed(modes))
            for mode in ordered_modes:
                folder = destinations[mode] / channel
                pcm_path = folder / f"{sequence:012d}.pcm"
                metadata_path = folder / f"{sequence:012d}.json"
                started = time.perf_counter_ns()
                modes[mode](pcm_path, pcm, metadata_path, metadata)
                timings[mode].append((time.perf_counter_ns() - started) / 1e6)
                if pcm_path.read_bytes() != pcm or metadata_path.read_bytes() != metadata:
                    raise ValueError("Persisted pair bytes mismatch")
            pair_index += 1
        if (group_index + 1) % 10 == 0:
            print(f"{group_index + 1}/{len(groups)} six-source groups verified", flush=True)

    for source_json, metadata, pcm in source_pairs:
        if source_json.read_bytes() != metadata or source_json.with_suffix(".pcm").read_bytes() != pcm:
            raise ValueError("Original source pair changed")
    stats = {mode: summary(values) for mode, values in timings.items()}
    reduction = 100 * (1 - stats["preparedDirectory"]["totalMs"] / stats["current"]["totalMs"])
    candidate = stats["preparedDirectory"]
    result = {
        "round": "LIVELINK-INGEST-18D",
        "productChanged": False,
        "sourceCatalogSha256": catalog,
        "sourceGroups": args.groups,
        "pairsPerVariant": pair_index,
        "sourceAndOutputBytesVerified": True,
        "originalPairsUnchanged": True,
        "fsyncsPerPair": 2,
        "publication": "PCM before metadata",
        "directoryContract": "Both variants use fresh per-channel directories prepared before timing; candidate omits per-pair mkdir after preparation.",
        "variants": stats,
        "reductionPercent": reduction,
        "frozenStorageScreen": {
            "pairP50AtMost100Ms": candidate["p50Ms"] <= 100,
            "pairP95AtMost150Ms": candidate["p95Ms"] <= 150,
            "totalReductionAtLeast30Percent": reduction >= 30,
            "plausibleUnderAllThree": candidate["p50Ms"] <= 100 and candidate["p95Ms"] <= 150 and reduction >= 30,
        },
        "scopeLimit": "Storage-only pair screen; not HTTP ACK, full replay, archive, native, or physical OBS acceptance.",
    }
    report_path = target / "report.json"
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)
    print(f"Report: {report_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
