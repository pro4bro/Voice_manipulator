# 0044 — Decode selected MKV tracks together within one committed Cluster

Date: 2026-10-04. Status: accepted after byte-equivalence and throughput gate.

## Decision

The growing-MKV follower probes first packet PTS for all selected audio streams
in one FFprobe call and decodes their mono PCM16/24k analyses in one FFmpeg
invocation per complete Cluster. Each stream retains its own original first PTS;
a stream with no packets is skipped. Selected packets without finite PTS fail
before any analysis or cursor is published. Unselected streams are not decoded.

Temporary raw outputs live only for the current Cluster. PCM alignment, gap and
overlap handling, chunk files, fsync, source snapshot hashing and the durable
cursor remain the existing per-Cluster transaction. No cross-Cluster group
commit, weaker durability or scanner reinterpretation is introduced. Any failed
probe/decode leaves the checkpoint untouched; recovery/retry retains ownership.
Finish still continuously decodes the source, independently of provisional
Cluster codec effects, before publishing authoritative final WAVs.

## Evidence and limits

The same six-track, ten-minute FLAC MKV drops from 732 decoder/probe calls to 122.
All six provisional PCM hashes and frame counts match the baseline. A retained
actual OBS AAC MKV prefix is compared separately, including its existing tiny
sample gaps; those gaps are not concealed or declared fixed by batching.
Restart/incomplete-Cluster/Stop-Finish and new batch failure regressions pass.
See `docs/gates/mkv-follow-03-backlog.md` and companion metrics.

RAM measurements are sampled working sets for the owned profiler/process tree,
not hard upper bounds for every possible codec/Cluster size. Batching is bounded
to one complete Cluster; it does not buffer an entire backlog. Real writer A/V,
speech quality, latency under simultaneous STT and owner hardware remain in
MKV-ACCEPT-01. Native LiveLink durable ACK budgets are unrelated and unchanged.
