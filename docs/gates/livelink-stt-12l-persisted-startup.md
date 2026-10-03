# LIVELINK-STT-12L — persisted recovery and launch topology

Date: 2026-10-03. Source baseline: `81c887e`.

## Verdict and boundary

The isolated persisted-recovery/topology replay passes. **The historical natural
listener loss remains unreproduced; its root cause is open.** The snapshot is
the current registry, not a byte-identical snapshot of the historical 12F
failure. Each take launches new processes; Windows was not rebooted and the OS
filesystem cache was not controlled. No audio-quality, GPU-load, transcript-tail
completion, physical OBS or browser acceptance is claimed by this round.

## Corpus and isolation

The independent copy contains 37 registered projects, 58 LiveLink recording
journals, ten live progress checkpoints, seven detailed STT checkpoints and
four growing-MKV follow checkpoints. Project files, recovery audio/video,
job/activity records and four external media locators are copied and rewritten
into `.scratch/livelink-stt-12l/corpus/data`. Registry `projectPath` references
are resolved relative to `.registry`, then redirected to the isolated projects.

- 43,763 files / 10,475,132,414 logical bytes copied, without hard links.
- Preferences are empty; no owner credentials or OBS connection config loaded.
- API filesystem audit rejects writes outside the isolated data root. No denied
  writes occurred. Models use existing local runtimes in offline mode.
- Original metadata for all 43,763 files and SHA256 for all 27,885 recorded JSON
  inputs are unchanged after the takes. Binary content is protected by independent
  copies, the write guard and size/mtime checks; it was not rehashed in full.
- Every take ends with API/controller/Studio ports 18120/18119/18081 free.
  Owner OBS, plugin installation, projects and media remain untouched.

Eligibility inspection finds 42 legacy-ready journals intentionally skipped by
the existing recovery guard, 16 eligible journals, nine pending live tracks and
ten completed tracks skipped. Loading 58 journals does not imply 58 active
recognizer workers. The old skip guard is already present at `ce31ac9`; this
round does not remove or redefine it.

## Agent-runnable feedback loop

```powershell
.runtime/python/core/python.exe .scratch/livelink-stt-12l/reset.py
.runtime/python/core/python.exe .scratch/livelink-stt-12l/replay.py --mode foreground --seconds 60 --tag new-take
.runtime/python/core/python.exe .scratch/livelink-stt-12l/reset.py
.runtime/python/core/python.exe .scratch/livelink-stt-12l/replay.py --mode detached --seconds 60 --tag new-take
```

Scratch preparation, provenance, eligibility, replay, owner verification and
analysis scripts remain beside the isolated corpus. Use a fresh tag per run;
existing take directories fail rather than overwrite evidence. Reset verifies
every target inside the corpus and restores only copied inputs/generated files.

Both modes execute the actual product API entry point through a write-audit
wrapper. Foreground PowerShell waits on its Python child. Detached PowerShell
uses hidden `Start-Process`, records the child PID and exits zero; the child
must retain its listener. Studio and the product controller run separately.
The loop records native listener ownership, expected PID/process life, launcher
exit, direct API/Studio/controller health and controller proxy health. It
asserts API ancestry/ownership and continued HTTP health after readiness, and
reads the real project list. No deliberate process failure is injected here.

## Retained results

| Take | Ready seconds | Stable seconds | Samples | Result |
| --- | ---: | ---: | ---: | --- |
| baseline foreground | 61.922 | 90 | 97 | Passed; expensive initial audit wrapper |
| baseline detached | 11.312 | 90 | 88 | Passed; same wrapper, warmer files |
| control foreground | 5.547 | 60 | 59 | Passed; corrected wrapper |
| control detached | 6.156 | 60 | 59 | Passed; corrected wrapper |
| final foreground | 5.500 | 60 | 59 | Passed; product recovery logs |
| final detached | 6.156 | — | — | Project-list ReadTimeout; stable gate not claimed |
| final retry detached | 6.093 | 60 | 59 | Passed; project-list latency 0.110 seconds |

The initial audit wrapper resolved every file-read path before checking whether
it was a write. Removing that unnecessary read-path work reduced harness cost.
Filesystem warmth is also uncontrolled, so the first 61.922-second result
cannot establish an application regression or prove a timeout repair. Product
readiness deadlines are unchanged.

One final detached take returned healthy HTTP on all four endpoints with API
PID/listener 64736, then `/api/projects` exceeded the harness's two-second request
budget. The loop cleaned up instead of declaring a listener failure. That take
is retained separately in `acceptance.json`. A fresh detached take measured
the project-list request with a 15-second diagnostic budget: actual latency
0.110 seconds, followed by the full stable interval. This does not establish
the cause of the earlier request timeout or change a product timeout.

Across the six passing takes, no post-readiness health or listener loss occurred.
Final foreground max sampled API/proxy health latency is 0.047/0.016 seconds;
final detached retry is 0.031/0.016 seconds. Sampled polling cannot exclude a
failure between samples or prove indefinite reliability.

## Product change and observed recovery work

API startup now logs recovery scan start/finish with PID, elapsed seconds,
project count and queued worker counts. Existing `pro4bro.activity` stdout
retains these rows in the managed launcher's `data/logs/pro4bro-api.out.log`.
No project names, paths, transcript text or credentials are
added. Scheduling, checkpoint migration, persistent formats and public APIs
keep their existing behavior. An interrupted scan leaves its start row.

Final foreground/detached retry scans take 0.277/0.343 seconds, respectively,
and each reports 37 projects, nine live tracks queued, one MKV watcher, four
MKV STT workers and seven OBS detailed STT workers. These are scheduling counts,
not completed transcripts or successful recognizer/model artifacts. Scan time
is separate from full listener readiness; worker startup can occur between them.
The corpus has legacy/completed/silent progress, so this is not a sustained
concurrent-inference stress test. No Studio audio POST was found in baseline
logs; new audio quality and drop resilience remain outside this evidence.

## Regression and follow-up

Regression gates after runtime cleanup:

- Backend: **500 passed**, 182.90 seconds; existing Starlette/httpx and audioop
  deprecation warnings (two). Command: `.runtime/python/core/python.exe -m
  pytest services/api/tests -q` from the repository root.
- Frontend: **54 files / 458 tests passed**, 50.96 seconds; `npm test`,
  `npm run typecheck` and `npm run build` from `apps/web` all passed.
- `git diff --check` passed. No tracked engine, Studio, native plugin, model,
  audio or frontend changes; prior 12J/12K artifact gates are not rerun claims.

ADR 0036 records the diagnostic addition. Detailed ignored artifacts include `copy-provenance.json`,
`eligibility.json`, `owner-preservation.json`, each take's samples/logs/cleanup,
and `acceptance.json`; the tracked gate retains the conclusion and caveats.

Natural listener loss still needs evidence from a matching failure. Existing
readiness/controller logs plus the new recovery scan rows can distinguish that
incident from startup backlog or a slow project-list request. Repeating the
same successful snapshot cannot establish its historical cause.

Exact next: **`LIVELINK-STT-12M` — retain and verify selected project/footage and
Script follow through API restart in the running browser.** Healthy services
alone do not prove the owner can continue reviewing the same recording after
reconnect. Natural 12H disk-stall diagnosis, owner plugin installation, exact
video timing and the broader LIVELINK-08 matrix stay open.
