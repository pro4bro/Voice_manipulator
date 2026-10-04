# MKV-FOLLOW-03 — batch selected streams within one complete Cluster

2026-10-04, starting checkout `00ddfd3`, clean. The measured optimization changes
only the Cluster probe/decode seam. First PTS stays per stream; snapshot, cursor,
PCM alignment/gaps, fsync and publication retain their per-Cluster transaction.
No recognizer, word timing, STT block, native ACK or Stop policy changes.

## Same-machine measurements

Windows, Intel Core i9-10900X @ 3.70 GHz. FFmpeg/FFprobe from `.tools/ffmpeg`.
Wall time covers the actual follower `poll` backlog decode/publication only;
start/inspect, source hashing, STT and Finish are excluded. Other gate decoder
work is serial during the selected baseline/candidate comparisons.

| Source / scope | Before | After | Wall reduction | Timeline seconds / wall second |
| --- | --- | --- | --- | --- |
| Generated six-track FLAC, 600 seconds, 61 Clusters | 99.213 s | 65.851 s | 33.63% | 6.05 -> 9.11 |
| Retained actual OBS six-track AAC, first 12 Clusters / 49.92 seconds | 20.430 s | 10.197 s | 50.08% | 2.44 -> 4.90 |

The generated source was already faster than realtime before optimization.
Candidate reduces backlog cost without claiming the old path was below realtime
on this machine. For six tracks, decoder/probe invocations drop 732 -> 122
(generated) and 144 -> 24 (retained). One probe and one FFmpeg invocation now
serve all selected streams in the current Cluster. CPU/process cost is reduced;
existing storage/transaction costs remain.

Observed sampled process-tree working sets are 63.84 -> 71.39 MiB (generated)
and 65.39 -> 71.44 MiB (retained control). Parent working sets stay below 40 MiB.
Samples use Windows process/memory APIs at 50 ms intervals; this is not a hard
maximum for arbitrary codecs or huge Clusters. No psutil/package installation
was needed. Decode buffers only one Cluster, not the complete backlog.

The first retained baseline (19.049 s) overlapped a regression suite and is kept
in JSON as raw evidence, not used for the selected comparison. The serial
20.430 s control loads the exact saved baseline follower source from `00ddfd3`.
Both retained controls produce the same PCM/frame/gap metadata.

## Media and recovery evidence

All six generated provisional PCM hashes, 14,400,000 frames per track and empty
gap lists match baseline byte for byte. Restart poll does not replay Clusters;
Finish produces six authoritative mono24k PCM16 WAVs, each 600 seconds, whose
PCM hashes match provisional/source-derived PCM. Repeat Finish is idempotent.
Original source hash remains unchanged.

Retained owner source `data/projects/test-obs-3/assets/media/asset-c47dc159e08b/source.mkv`
is read only. It has video plus six AAC tracks and lasts 9,276.633 seconds; this
gate decodes only its first 12 complete Clusters into owned scratch projects.
The full 1,325,553,927-byte source hash is verified unchanged before/after using
streaming reads. All six prefix PCM hashes, frame counts, first-PTS alignment and
existing 8/16-frame gaps match. This optimization does not declare those existing
small AAC gaps fixed. Full 2.5-hour replay and live writer acceptance remain open.

Raw profiler, saved reference source, sampled-memory helper, generated MKV,
projects and hashes are retained under ignored `.scratch/mkv-follow-03/`.
Companion committed JSON preserves comparisons. Source audio is not discarded.

## Validation and disposition

Focused follower suite: 19 passed, two existing warnings, 66.36 seconds. Five new
cases check actual later-Cluster AAC byte/PTS equivalence, missing/nonfinite PTS
failure, and failed multitrack decode preserving cursor before successful retry.
Existing tests cover incomplete tail, restart truncation, all-track ownership,
Stop/Finish, selected STT and padding. Full backend: **557 passed**, 167.31s, two existing deprecation warnings. Frontend is unchanged since MEDIA-STAGES-02: 475 tests,
typecheck/build passed. No redundant UI suite is counted as new evidence.

Accepted at this measured decoder scope. Physical growing writer A/V clocks,
simultaneous STT latency, full retained-session replay and reviewed speech/timing
remain in **MKV-ACCEPT-01** and 19A/19B. Exact next ordered gate is MKV-ACCEPT-01;
it cannot be declared fully accepted while reviewed 19A timing evidence is absent.
No product phase advances. See ADR 0044 for durability and memory boundaries.
