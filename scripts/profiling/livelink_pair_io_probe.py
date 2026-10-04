"""18B2 storage screening only; no product patch, ACK or source mutation.

Compare ordinary buffered pairs with raw-descriptor pairs. Both retain two
fsyncs, wait for both writers and publish PCM before metadata. Fresh E: outputs
and alternating order are mandatory; a screening pass is not HTTP acceptance.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import time

from livelink_ingest_18a import SOURCE, FileObsLiveLinkAudio, summary


def raw_pair(pcm_path, pcm, metadata_path, metadata):
    pcm_path.parent.mkdir(parents=True, exist_ok=True)
    parts = [path.with_name(path.name + ".part") for path in (pcm_path, metadata_path)]

    def prepare(path, data):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
        try:
            remaining = memoryview(data)
            while remaining:
                written = os.write(fd, remaining)
                if written <= 0:
                    raise OSError("No write progress")
                remaining = remaining[written:]
            os.fsync(fd)
        finally:
            os.close(fd)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(prepare, path, data) for path, data in zip(parts, (pcm, metadata))]
        for future in futures:
            future.result()
    os.replace(parts[0], pcm_path)
    os.replace(parts[1], metadata_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pairs", type=int, default=60)
    args = parser.parse_args()
    if not 6 <= args.pairs <= 360 or args.pairs % 6:
        raise ValueError("Use 6..360 pairs, divisible by six")
    target = args.output.resolve()
    if target.drive.lower() != SOURCE.drive.lower() or target.is_relative_to(SOURCE.resolve()):
        raise ValueError("Fresh output on source E: volume, outside original recording required")
    folders = sorted((SOURCE / "channels").iterdir())
    if len(folders) != 6:
        raise ValueError("Six retained sources required")
    samples = []
    catalog = hashlib.sha256()
    for index in range(args.pairs):
        path = folders[index % 6] / "chunks" / f"{index // 6:012d}.json"
        metadata = path.read_bytes()
        item = json.loads(metadata)
        pcm = path.with_suffix(".pcm").read_bytes()
        if len(pcm) != item["frameCount"] * item["channels"] * 2 or hashlib.sha256(pcm).hexdigest() != item["sha256"]:
            raise ValueError("Source size/hash mismatch")
        catalog.update(path.parent.parent.name.encode())
        catalog.update(metadata)
        samples.append((path, metadata, pcm))
    target.mkdir(parents=True, exist_ok=False)
    values = {"baseline": [], "rawDescriptor": []}
    writers = {"baseline": FileObsLiveLinkAudio._write_chunk_pair, "rawDescriptor": raw_pair}
    for index, (_, metadata, pcm) in enumerate(samples):
        modes = tuple(writers) if index % 2 == 0 else tuple(reversed(writers))
        for mode in modes:
            folder = target / mode / str(index)
            start = time.perf_counter_ns()
            writers[mode](folder / "chunk.pcm", pcm, folder / "chunk.json", metadata)
            values[mode].append((time.perf_counter_ns() - start) / 1e6)
            if (folder / "chunk.pcm").read_bytes() != pcm or (folder / "chunk.json").read_bytes() != metadata:
                raise ValueError("Persisted bytes mismatch")
        if index % 12 == 0:
            print(f"{index+1}/{args.pairs} pairs verified", flush=True)
    for path, metadata, pcm in samples:
        if path.read_bytes() != metadata or path.with_suffix(".pcm").read_bytes() != pcm:
            raise ValueError("Original recording changed")
    stats = {mode: summary(times) for mode, times in values.items()}
    reduction = 100 * (1 - stats["rawDescriptor"]["totalMs"] / stats["baseline"]["totalMs"])
    candidate = stats["rawDescriptor"]
    passed = reduction >= 30 and candidate["p50Ms"] <= 100 and candidate["p95Ms"] <= 150
    result = {"productChanged": False, "sourceCatalogSha256": catalog.hexdigest(),
              "pairsPerVariant": args.pairs, "sourceAndOutputBytesVerified": True,
              "fsyncsPerPair": 2, "publication": "PCM before metadata", "variants": stats,
              "reductionPercent": reduction, "screeningPassed": passed,
              "limits": "Pair storage subset only, not full HTTP replay, archive or physical OBS gate"}
    (target / "report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
