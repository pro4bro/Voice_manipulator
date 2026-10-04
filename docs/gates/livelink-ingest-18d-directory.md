# LIVELINK-INGEST-18D — prepared directory candidate rejected

The current durable-pair writer contains one repeatable no-op on steady-state
chunks: `_write_chunk_pair` calls `mkdir(parents=True, exist_ok=True)` for every
pair, although all sequences for a channel share one `chunks` directory. This
round screened omitting that call after directory preparation. It changed no
product behavior and did not relax the frozen 18A budgets.

## Measurement

The probe interleaved current and candidate writes for 60 six-channel groups
(360 pairs per variant) from the immutable UX-10B catalog. Its catalog SHA256
matches 18C/18C2: `60805281fadd1f8e717b4bdf011a757cb5ea757b330cf2c635380e1c6b888fd4`.
Fresh per-channel output directories on the same E: volume were prepared before
timing. Both variants wrote the same bytes, performed two file fsyncs, and
published PCM before metadata. Original files were reread and matched after
the run. The raw report is under ignored
`.scratch/livelink-ingest-18d/directory-screen/report.json`.

| Variant | Total | Pair p50 | Pair p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Current pair writer | 40.150s | 89.825ms | 268.676ms | 591.476ms |
| Prepared directory, skip per-pair mkdir | 38.837s | 86.910ms | 248.944ms | 545.212ms |

The candidate reduces measured total by **3.27%**. Pair p50 is below the frozen
100ms screening limit, but p95 still exceeds 150ms and total reduction is well
below 30%. It is rejected without full HTTP replay or physical OBS work. This is
storage-only evidence; pair p95 is not HTTP ACK p95.

## Feasibility and contract boundary

The frozen full replay drains in 417.734s, so the 70% gate requires at most
292.414s: a 125.320s reduction. Scaling the measured 360-pair savings to 2,524
pairs estimates about 9.2s, or 2.20% of baseline drain. That projection is not
a replay result and is far short of the required 30%. The 18A replay measured
the durable-pair stage at 297.839s; two fsync calls overlap and dominate this
stage (combined fsync time is 534.716s, not additive). The small directory
check savings do not remove that storage cost.

The candidate is safe only if the chunks directory is guaranteed to exist
before the first call. Today `_write_chunk_pair` creates it itself. Removing
that safeguard therefore needs a product-owned lifecycle guarantee to prepare
each channel directory before PCM ingestion. That is a cross-call contract
change and was not made or tested here. Under the current contract, no caller
change is required and this candidate cannot be applied safely.

No supported pair-writer-only candidate has met the unchanged p95 and drain
budgets. 18B and 18C remain open. Before any wider group/API integration, the
pending human disposition must state whether ACK p50/p95 and drain limits remain
frozen or are replaced with explicitly approved end-to-end criteria; durability
requirements remain. If limits stay frozen, another candidate needs same-volume
evidence making the 150ms p95 and 30% drain target plausible before full replay.
Even then, native/live clocks and the six-source physical OBS gate remain.

## Validation and reproduction

Focused helper safety tests pass **8/8**. They verify two fsyncs before ordered
publication and that the prepared-directory writer requires an existing
directory. The actual 360-pair probe verifies PCM and metadata bytes and rereads
every source pair unchanged.

```powershell
.venv/Scripts/python.exe -m pytest scripts/profiling/tests/test_livelink_storage_probes.py -q
.venv/Scripts/python.exe scripts/profiling/livelink_pair_directory_probe.py --output .scratch/livelink-ingest-18d/directory-screen --groups 60
```

No API, native, OBS, runtime, or GPU process was started. 18B/18C remain open;
no round queue, phase, product behavior, or acceptance gate advances.
