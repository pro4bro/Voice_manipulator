"""18C feasibility only: bounded independent-source pairs; never patches product.

Source chunks are read-only. Every variant calls the existing two-fsync pair
writer and checks persisted bytes. Report compares serial/3/6 concurrent pairs.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from livelink_ingest_18a import SOURCE, summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--groups", type=int, default=60)
    parser.add_argument("--widths", type=int, nargs="+", choices=(1, 2, 3, 6), default=[1, 3, 6])
    args = parser.parse_args()
    if not 1 <= args.groups <= 120:
        raise ValueError("Bounded group count required")
    widths = tuple(args.widths)
    if len(set(widths)) != len(widths) or 1 not in widths or len(widths) < 2:
        raise ValueError("Unique widths including serial control and a candidate required")
    output = args.output.resolve()
    if output.drive.lower() != SOURCE.drive.lower() or output.is_relative_to(SOURCE.resolve()):
        raise ValueError("Fresh output on source volume outside original recording required")
    output.mkdir(parents=True, exist_ok=False)
    folders = sorted((SOURCE / "channels").iterdir())
    if len(folders) != 6:
        raise ValueError("Six-source fixture required")
    samples = []
    source_pairs = []
    input_hash = hashlib.sha256()
    for sequence in range(args.groups):
        group = []
        for folder in folders:
            path = folder / "chunks" / f"{sequence:012d}.json"
            metadata = path.read_bytes()
            item = json.loads(metadata)
            pcm = path.with_suffix(".pcm").read_bytes()
            if hashlib.sha256(pcm).hexdigest() != item["sha256"] or len(pcm) != item["frameCount"] * item["channels"] * 2:
                raise ValueError("Source hash/size mismatch")
            input_hash.update(folder.name.encode())
            input_hash.update(metadata)
            group.append((folder.name, pcm, metadata))
            source_pairs.append((path, pcm, metadata))
        samples.append(group)
    timings = {width: {"group": [], "pair": []} for width in widths}

    def persist(folder, pcm, metadata):
        start = time.perf_counter_ns()
        FileObsLiveLinkAudio._write_chunk_pair(folder / "chunk.pcm", pcm,
                                              folder / "chunk.json", metadata)
        elapsed = (time.perf_counter_ns()-start)/1e6
        if (folder / "chunk.pcm").read_bytes() != pcm or (folder / "chunk.json").read_bytes() != metadata:
            raise ValueError("Persisted pair mismatch")
        return elapsed

    for index, group in enumerate(samples):
        # Rotate order to reduce a fixed warm-cache/scheduling bias.
        offset = index % len(widths)
        order = widths[offset:] + widths[:offset]
        for width in order:
            root = output / f"width-{width}" / f"{index:03d}"
            begin = time.perf_counter_ns()
            with ThreadPoolExecutor(max_workers=width) as workers:
                futures = [workers.submit(persist, root / channel, pcm, metadata)
                           for channel, pcm, metadata in group]
                values = [future.result() for future in futures]
            timings[width]["group"].append((time.perf_counter_ns()-begin)/1e6)
            timings[width]["pair"].extend(values)
        if index % 10 == 0:
            print(f"{index+1}/{len(samples)} independent-source groups verified", flush=True)
    for path, pcm, metadata in source_pairs:
        if path.read_bytes() != metadata or path.with_suffix(".pcm").read_bytes() != pcm:
            raise ValueError("Original source pair changed")
    result = {"productChanged": False, "sourceGroups": args.groups,
              "pairsPerVariant": args.groups * 6, "inputCatalogSha256": input_hash.hexdigest(),
              "pairsVerified": True, "fsyncsPerPair": 2,
              "originalPairsUnchanged": True,
              "publication": "PCM before metadata", "maximumConcurrentPairs": max(widths),
              "variants": {str(width): {stage: summary(values) for stage, values in stages.items()}
                           for width, stages in timings.items()},
              "limits": "Storage feasibility only; no API lock, native scheduling, STT, network or hardware Stop evidence"}
    baseline = sum(timings[1]["group"])
    result["groupWallReductionPercent"] = {str(width): 100*(1-sum(timings[width]["group"])/baseline) for width in widths if width != 1}
    result["frozenStorageScreenPassed"] = {
        str(width): result["variants"][str(width)]["pair"]["p50Ms"] <= 100
        and result["variants"][str(width)]["pair"]["p95Ms"] <= 150
        and result["groupWallReductionPercent"][str(width)] >= 30
        for width in widths if width != 1}
    (output / "report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
