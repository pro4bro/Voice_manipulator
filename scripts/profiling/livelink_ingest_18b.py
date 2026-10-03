"""Isolated 18B candidate. Never install this process-local prototype in the API.

Uses the frozen 18A workload/probes and preserves both fsync calls, PCM-before-
metadata publication and immediate post-ACK hash verification. No source writes.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait
import json
import os
from pathlib import Path
import threading

import livelink_ingest_18a as profile

CATALOG = "8aac1c0901d2b9f703c5b6ca4e5ea99e8bbe573c0a03d85392b5bed934a80fd7"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pool = ThreadPoolExecutor(max_workers=2)
    # The reused pool is deliberately serialized. Concurrent pairs otherwise
    # could fill both workers with different barriers and deadlock.
    pair_lock = threading.Lock()

    def coordinated_pair(pcm_path, pcm, metadata_path, metadata):
        with pair_lock:
            pcm_path.parent.mkdir(parents=True, exist_ok=True)
            pcm_part = pcm_path.with_name(pcm_path.name + ".part")
            metadata_part = metadata_path.with_name(metadata_path.name + ".part")
            barrier = threading.Barrier(2)

            def prepare(path, data):
                try:
                    with path.open("wb") as output:
                        output.write(data)
                        output.flush()
                        barrier.wait(timeout=10)
                        os.fsync(output.fileno())
                except BaseException:
                    barrier.abort()
                    raise

            futures = [pool.submit(prepare, pcm_part, pcm),
                       pool.submit(prepare, metadata_part, metadata)]
            wait(futures)
            failures = [future.exception() for future in futures if future.exception()]
            if failures:
                # Preserve the write failure rather than its peer's barrier error.
                raise next((error for error in failures if not isinstance(error, threading.BrokenBarrierError)), failures[0])
            os.replace(pcm_part, pcm_path)
            os.replace(metadata_part, metadata_path)

    original = profile.FileObsLiveLinkAudio._write_chunk_pair
    profile.FileObsLiveLinkAudio._write_chunk_pair = staticmethod(coordinated_pair)
    try:
        journal, entries, gaps = profile.load()
        catalog = profile.hashlib.sha256(b"".join(path.read_bytes() for _, _, _, path in entries)).hexdigest()
        if catalog != CATALOG or len(entries) != 2524:
            raise ValueError("Frozen 18A workload mismatch")
        target = args.output.resolve()
        result = profile.run(entries, journal, target, True, True)
        result.update(inputCatalogSha256=catalog, sourceSampleGaps=gaps,
                      sourceContinuityPassed=True,
                      candidate="Reused two writers and writes-before-fsync barrier; two fsyncs and publication order retained")
        (target / "report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps({key: value for key, value in result.items() if key not in ("ackTimesSeconds", "sourceSampleGaps")}, indent=2))
    finally:
        profile.FileObsLiveLinkAudio._write_chunk_pair = staticmethod(original)
        pool.shutdown(wait=True)


if __name__ == "__main__":
    main()
