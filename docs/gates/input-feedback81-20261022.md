# Round81 — Input feedback gate (2026-10-22)

Scope: STT-ALIGN-07/08, STT-OBS-07/09/10 and UI-06. ADR0129 and
`docs/INPUT-FEEDBACK-81.md` record the owner's interaction contract. One round;
Phase03 stays60%, Phase06 remains open. No engine/model default or portable release.

## Implemented behavior

- Input has eight enable checkboxes and collapsible method settings. IN/OUT,
  strength and movement limit are editable. Ghost Preview computes only; changed
  positions paint above originals on the actual normal/imported/OBS Timeline.
- Apply New Timing applies the bound reviewed changes together. Unchanged/manual
  coordinates remain exact. Explicitly previewed overlaps remain visible in red
  with a short slow pulse and counts. Restore/Undo and stale-source rejection
  remain. Ordinary legacy selected Apply still rejects timing overlaps.
- Durable OBS live utterances become retained archive-child Script drafts,
  including late final utterances and startup recovery. Clearing or requested STT
  prevents old live events from resurrecting text. No word timing is invented.
- Followed MKV detects sealed Segment length before strict live-header checking,
  or accepts a matching authenticated OBS Stop path. A pause/unchanged size alone
  cannot finish it. The worker copies/hashes the full source and decodes all
  imported tracks in one pass, including tail. Drafts stay; Stop queues no final STT.
- Finalized MKV tracks use the ordinary explicit full-file STT queue. Growing
  block workers are fenced/cancelled and cannot overwrite it with late results.
  Normal recognizer internals may still use inference windows.
- Capture Source controls the OBS module and lease, survives Recorder remounts
  and hides controls without issuing Stop. Independent loads, single-flight OBS
  polls,15s read deadlines and Tải lại dữ liệu provide recovery.

## Reproductions and checks

Failing regressions retained under `.scratch/input81`: a missing auto-final-import
boundary; empty user-cleared Script surviving an explicit detailed-STT request;
coupled schema/catalog loading;21 overlapping OBS polls; stalled reads; pipeline
payload missing method mode accepted; and overlap normalization moving a manual
neighbor. Fixes preserve manual coordinates, input revisions and strict payload
validation. No skips, assertion removal or acoustic threshold reduction.

| Check | Actual result |
| --- | --- |
| Full frontend, latest build |1201 passed /150 files /170.23s |
| Typecheck / Vite build |pass /212 modules |
| Earlier full API before MKV follow-up |1314 passed /3 existing warnings /631.78s |
| Final full API replay |1317 passed /1 obsolete shutdown-mock failure /3 existing warnings /605.47s; corrected seam recheck passes |
| MKV automatic-final/late-publication checks |29 passed /2 existing warnings /88.98s before shutdown integration recheck |
| Isolated mutation |Ghost/ordinary-Apply conflict mutation killed; product adapter SHA unchanged |

Logs: `.scratch/input81/frontend-full-final.log`, `typecheck-final.log`,
`build-final.log`, `api-full-final.log`, `mkv-shutdown-final.log`,
`auto-import-red.log`, `auto-import-green.log`, `auto-import-writer.log`,
`mutation-result.json`. The shutdown writer test now blocks `advance`, the
watcher's new live-or-final writer boundary; all drain/wait assertions remain.

### Real media and acoustic evidence

`scripts/profiling/subtitle_ghost_smoke.py` copies the frozen project and refuses
fresh alignment inference in reuse-only mode. Reference pairs are evaluator-only,
never used to select timing.692 source words /587 fixed manual pairs:

| Trial | Changed words | Conflict word indexes | IN/OUT absolute median |
| --- | ---: | ---: | --- |
| Unchanged input |0 |existing conflicts |159.8/111.8ms |
| Measured common offset |690 |4 |64.3/54.2ms |
| Vector,50%,250ms limit |21 |30 |159.4/111.5ms |
| Common + vector +20ms manual |690 |37 |63.8/60.2ms |

Artifacts: `.scratch/input81/ghost-real/report.json` and portable preview receipts.
All trials reuse source-bound Round80 acoustic artifacts and perform actual bulk
Apply then exact Restore. PCM hashes remain equal.690 reviewed bulk changes differ
from Round80's640 strict-ready words because this explicit contextual operation
includes review candidates and exposes conflicts. It is not an automatic-quality
acceptance claim. Vector snapping remains experimental; generalization is open.

Actual FFmpeg AAC Matroska tests cover two tracks, partial-to-complete growth,
sealed and unknown-size Segment + matching Stop, retained/cleared/final text,
no unsolicited final recognition, one full-track ordinary recognition call,
tail words, a live writer before/after closure and late-inference rejection.
Final PCM is byte-equal to independent full-source24kHz mono PCM16 decode;
full source bytes are preserved. This proves completeness/format/boundaries for
these fixtures, not physical OBS device or speech-quality acceptance.

### Browser verification

Actual built UI and real isolated API on127.0.0.1:18482 use a copied235.989333s
24kHz mono PCM source and692-word Script in an arbitrary fixture project.
No owner project is used for writes. Browser shows editable settings, Ghost
positions above waveform/originals,690 changes/+116ms, red conflicts, one Apply
and Restore. API receipts verify690 actual changed coordinates,692 total words,
four conflicting word indexes and unchanged media hash. Capture Source switches
OBS module on/off in the actual UI. Separate tests cover source/scope invalidation,
reduced-motion styling and persisted conflict coordinates after reopen.

Receipt: `.scratch/input81/browser-apply-report.json`. Final screenshot:
`.scratch/input81/ghost-preview-final.jpg`. Fixture backend has no active model
service; browser acceptance here does not claim a fresh STT inference or physical
OBS recording. Temporary viewport/server are cleaned up after verification.

## Runtime and remaining evidence gaps

Historical whole-app hang is not conclusively attributed. Current health/project
reads were294/119ms and retained runtime observations were healthy. The coupled
load and request-overlap regressions are proven separately; a retry now exists.
Do not present them as proof of that incident's exact cause.

Managed runtime reload occurs only after checking OBS idle and no STT/training
jobs. The heard Conviction reference/source remain unchanged: final SHA checks
for words.json, transcript.stt.json, analysis.wav and source.mp3 all match the
frozen baseline (`.scratch/input81/owner-hashes-final.json`).

Physical OBS Stop/device audition and held-out acoustic quality remain user
acceptance work. An unknown-size MKV without an OBS Stop connection retains the
explicit Finish fallback. No claim of universal waveform word boundaries.

## Closure

The full API run imported the old shutdown mock before it was updated from
`poll` to `advance`, so that one fixture timed out waiting at a boundary no longer
used by the watcher. Its writer-entered/drain-before-close/all-finished assertions
are unchanged. The corrected shutdown and automatic-import API tests both pass
(`mkv-api-closure.log`:2 passed/6.22s). The latest broader MKV/shutdown run passed29
others and caught a test-only asset lookup using the SPA fallback URL; replacing
it with the real media-list endpoint preserves and passes all new full-tail
assertions. Thus all30 cases in that focused set pass across the rechecks; the
earlier failed runs remain. No product test is skipped or weakened. The final
last-failed replay passes1 case/29 deselected/2.83s in
`api-last-failed-closure.log`. Across the full run and corrected recheck, all1318
API cases have passed; the full-run failure remains explicitly recorded above.

Latest frontend:1201 passed/150 files/170.23s, typecheck and build212 pass. Browser
Restore confirms692/692 original coordinates (`browser-restore-report.json`).
Managed restart preflight checked29 projects: no active STT/training jobs and no
OBS process. Controller returned running API/Studio, busy=false, lastError=null;
the runtime status receipt is retained (`runtime-healthy-final.json`). No active
capture was interrupted. Correction in Round82: `/health` is the SPA fallback;
the JSON API health endpoint is `/api/health`, verified in `.scratch/input82/runtime-health.json`.
The final source/reference hash check passes all four frozen Conviction files.

Five-axis self-review covered source/finalization races, manual timing invariants,
strict request boundaries, source matching after authenticated Stop, project-local
artifacts, viewport canvas size, poll serialization and read recovery. The explicit
Ghost conflict mutation remains killed. Physical OBS/device acceptance, the exact
historical hang cause and held-out acoustic quality remain the stated gaps.
