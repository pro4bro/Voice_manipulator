# LIVELINK-INGEST-18B — candidate rejected, 2026-10-04

**18B remains open. No product optimization is shipped.** The frozen 18A
budgets are unchanged. The measured candidate fails three performance gates;
the actual OBS gate is not run for a rejected candidate.

## Experiments

Every variant preserves two fsync calls and PCM-before-metadata publication.
Fresh, owned directories on E: are used. Small probes interleave 60 baseline
pairs with 60 candidate pairs using the first retained chunk of each of six
sources. They are screening measurements, not the frozen full workload.

| Variant | Paired baseline total | Candidate total | Result |
| --- | ---: | ---: | --- |
| Reuse two writer threads | 5,888.834ms | 5,578.369ms | About 5.3% lower; insufficient signal |
| Reuse writers, barrier after both writes/flushes | 5,888.834ms | 5,487.457ms | About 6.8% lower; selected for full replay |
| Windows write-through plus existing fsync | 5,801.257ms | 9,099.746ms | 56.9% higher; rejected |
| Stage both writes, then sequential fsync | 5,146.177ms | 5,207.189ms | 1.2% higher; rejected |

The first probe attempt had a prototype temporary-path collision; it aborted
before measurement and is excluded. The corrected probe uses distinct
`chunk.pcm.part` and `chunk.json.part`; no product/source files were affected.

Windows documentation explains the caching/write-through distinction, but it
does not establish this device's speed. The write-through experiment retained
fsync and did not assume close alone provided durability. See Microsoft's
[FlushFileBuffers documentation](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)
and [file caching reference](https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching).

## Full replay verdict

The candidate changes only the process-local pair writer: reuse two workers,
finish both writes/flushes before either fsync, wait for both fsyncs, publish PCM,
then metadata. It is not installed in the API or OBS. Same 2,524 chunks,
573,421,416 PCM bytes, source catalog SHA256, order, E: volume, FFmpeg and
instrumentation as 18A. Full raw evidence is retained under ignored
`.scratch/livelink-ingest-18b/full-candidate/`.

| Gate | Frozen limit | Candidate | Verdict |
| --- | ---: | ---: | --- |
| HTTP ACK p50 | <=100ms | 119.761ms | Fail |
| HTTP ACK p95 | <=150ms | 302.916ms | Fail |
| Ingress drain | <=292.414s (70% of baseline) | 406.961s | Fail |
| Last ACK to ready | <=45s | 24.159s | Pass |
| Catalog, PCM hashes, sequence/sample continuity | Exact retained input | 2,524 chunks pass | Pass |
| Archive and analysis | Six verified streams, six matching analyses | All six pass | Pass |

Baseline ingress was 417.734s: reduction **2.58%**, not the required 30%.
PCM/metadata pair total falls from 297.839s to 286.152s, approximately 3.92%.
Its p95 is essentially unchanged: 250.424ms versus 251.338ms. Removing thread
setup and coordinating writes does not remove the dominant durable flush cost.

Archive code is unchanged. The lower ready tail is measured elapsed time;
it is not attributed to this writer optimization. No claim of improved live
waveform, captions, native Stop latency or loss-free startup is made.

The native pipeline sends one chunk at a time, and the API holds recording and
runtime locks during durable chunk persistence. Merely adding workers inside
one two-file pair cannot create a group of independent source commits. A
broader transport/API change is outside the frozen 18B scope, so it needs the
separately reviewed follow-up below. No fsync is removed to meet a budget.

## Verification and reproducibility

- Full backend: **516 passed**, two existing deprecation warnings, **176.06s**.
- Full frontend: **55 files / 468 passed**, **29.78s**.
- Frontend typecheck and production build pass (Vite build **1.14s**).
- Full candidate creates/verifies six-stream MKA and six mono/24kHz analyses.
  All six analysis PCM hashes match the retained UX-10B take; archive hash
  matches its ready journal. Spool/native code and installed binaries unchanged.
- Budget comparator returns **exit 1**, `passed: false`, three failed performance
  gates. This is the expected red signal, not a successful optimization.

Reproduce a fresh full candidate, then compare without adjusting budgets:

```powershell
.venv/Scripts/python.exe scripts/profiling/livelink_ingest_18b.py --output .scratch/livelink-ingest-18b/fresh-candidate
.venv/Scripts/python.exe scripts/profiling/compare_livelink_ingest_18b.py --candidate .scratch/livelink-ingest-18b/fresh-candidate/report.json --output .scratch/livelink-ingest-18b/fresh-comparison.json
```

The timed scratch prototype was strictly serial; the retained reusable tool
also serializes pair invocations to avoid a shared-pool barrier deadlock if it
is used concurrently. This guard does not change the serial workload. Its
error path waits for both writers and preserves the original write failure.
No candidate success is claimed from that guard.

## Reviewed next scope

**LIVELINK-INGEST-18C** evaluates bounded group durability/transport across
independent sources before implementing it. It may add a batch protocol only
after a reproducible prototype demonstrates the frozen budgets are plausible.
The public boundary must retain per-source sequence, per-chunk durable ACK,
both-file fsync, ordered publication, crash-safe replay and bounded memory.
Do not concurrently weaken locks without proving lifecycle/Stop/finalize and
same-source ordering. Do not change source/archive formats, spool durability,
STT or the frozen quality thresholds.

18C is necessary because 18B explicitly limits changes to the pair writer and
directs a separate reviewed follow-up when that seam cannot meet the budget.
18B and its actual OBS gate stay open until an accepted implementation passes.
The remaining existing rounds retain their order after this prerequisite work.
