# USER-FEEDBACK-06 — responsive deletion, scrolling notices and OBS journal

2026-10-09. Baseline427df74, branch `feat/03-04-high-quality-training`.
One bounded round addresses the owner's deletion lag, yellow notices and fresh
OBS Record failure. ADR0053 records the contracts.

## Delivered and cause

### Selected-word deletion

The Timeline menu called full text/timing reconciliation once for each selected
word. A6,000-word transcript with20 selected words took22,036.2ms and normalized
1,078,230 tokens. The regression also exposed leftover whitespace after deletion.
This processing preceded API persistence, distinguishing it from a slow server.

One shared bulk operation now maps lexical identities once, constructs deleted
text in one pass and retains surviving word objects/timing/annotations. It rejects
unmapped selection atomically. Exact token spelling avoids unnecessary Unicode
normalization; other text reconciliation retains normalized matching. History
does not serialize two entire snapshots when different text already proves an edit.
Script row deletion and Timeline word deletion share the operation and one commit.

Initial corrected6,000-word UI harness:171.5ms, then83.9ms in the focused suite.
These jsdom measurements include click/query/render overhead and are not browser
interaction budgets. A42,107-word/1,000 noncontiguous deletion helper probe still
had median108.78ms after allocation optimization, so large documents now run the
lexical operation in a dedicated Worker at1,000 words or above. Only source text,
word text identities and selected indexes cross the boundary; annotation objects
remain in the captured UI snapshot. Worker results commit once only if asset,
text and word snapshot are still current. Navigation, newer edits and unmount
cancel pending work. Failed workers preserve Script and expose a retryable error.
Pending feedback appears immediately; duplicate deletion is disabled. Small
documents and environments without Worker use the bounded synchronous operation.

The actual built1.42kB Worker bundle was run on isolated Node worker_threads with
42,107 words and1,000 removals:178.21ms round trip,12 main-loop timer ticks and
17.34ms maximum observed tick gap, with correct resulting text. This establishes
bundle protocol and independent computation; it is not real-browser/device latency.
Evidence is retained in ignored `.scratch/user-feedback-06/`:
`measure-delete.cjs`, `deletion-performance.json`, `probe-worker.cjs`,
`worker-performance.json`. The first measurement runner attempted an unavailable
workspace TypeScript compiler API; final runner uses Node's built-in type stripping.
An initial larger spy-based red fixture was cancelled and minimized to the6,000
word case. No production instrumentation remains.

### Yellow Script notices

Timing quality and estimated-timing notices are outside the toolbar and transcript
value. Table notices are a measured prefix inside its single scroll viewport,
outside the semantic transcript grid. Virtual fragment/reveal coordinates account
for the prefix. In prose, native textarea scroll translates a pointer-transparent
notice overlay; textarea and playback/review layers share the measured padding.
The notices scroll away, without entering edits, word counts, copied transcript
or exported text. The regression measures38px of notices and scrolls60px, confirming
that the notices move above the viewport while the transcript value is unchanged.

### OBS Record journal

Actual normal logs show hello synchronization and applied command ACK failing in
`ObsLiveLinkRuntime._persist` with `KeyError` for the removed historical project
`livelink-stt-12d-retry-48659997`. Record actions were acknowledged, but recovery
and transcript reads for the fresh recording returned404. LiveLink meter activity
does not establish that a project-owned journal has been written.

The machine snapshot's completed-recording list outlived a disposable project.
Its lookup prevented persistence of the current recording. `_persist` now excludes
historical completions with missing project owners or deletion tombstones, reuses
resolved project metadata and does not recreate missing/unreadable-JSON completed
journals as valid artifacts. Source audio and portable project journals are retained.

Regression starts a new connection against a snapshot with a removed historical
project and a missing completed journal. Before the fix, hello raises the same
KeyError. After the fix, a fresh recording writes its journal, accepts durable PCM,
returns the measured waveform peak and serves transcript events. The old missing
journal still raises the explicit error on retry; it is not reported as recovered.

## Final verification

| Command | Actual result |
| --- | --- |
| `npm test -- --maxWorkers=4` in `apps/web` | **637 passed /73 files**,48.50s |
| `npm run typecheck` | Pass |
| `npm run build` | Pass;120 modules; main JS774.39kB/gzip224.47kB; CSS250.27kB/gzip38.76kB; Worker1.42kB |
| `.venv/Scripts/python.exe -m pytest services/api/tests -q` | **680 passed**,190.88s;2 existing warnings |
| Worker OBS runtime/outbox suites | **35 passed**,18.61s;2 existing warnings |
| Worker notice/virtualization suites | **43 passed** |
| Lead integration suites before background scheduling | **68 passed** |
| Background scheduling/cancellation/error suite | **3 passed** |
| `git diff --check` | Pass |

Frontend count includes the existing ignored scratch performance test; tracked
suite is636/72. API warnings are existing Starlette/httpx and audioop deprecations.
The intermediate full frontend634/72 passed before background scheduling was added.

## Remaining gap and exact next round

Existing browser automation rejection remains; no browser/CDP/shell workaround was
used. Worker bundle execution above is computation testing, not browser automation.
Normal services/OBS were not restarted or controlled. No model/GPU dispatch, owner
media mutation, journal repair or project-schema migration occurred. Fixtures are
disposable; source evidence is read-only logs. Phase03 stays60% and quality budgets
remain unchanged.

Refresh the UI for the frontend build. After active processing/recording finishes,
restart the app to load the backend fix. A journal already absent from an earlier
failed recording is not recovered by inventing metadata; this round verifies a
fresh capture after the repaired persistence path.

Exact next **UX-EDITING-DEVICE-01** needs permitted real-device acceptance:

1. Delete one and many words on the reported long footage in Timeline and Script;
   retain UI responsiveness, surviving timing/annotations and undo/redo.
2. While a background deletion is pending, change footage or edit Script; no old
   result may replace the new selection/text. Verify pending/error feedback.
3. Scroll table and prose: both notices disappear with content, with no editable
   warning text and no offset drift in playback or text selection.
4. With LiveLink connected, Record a fresh OBS take after the backend reload;
   verify journal, increasing durable PCM/waveform, Script feed, then Stop/archive.

This evidence matters because tests cannot establish actual native transport,
browser frame latency or audible behavior. STT-TIMING-ACCURACY-01 remains separately
open for reviewed per-word truth and isolated alignment comparison. Older physical,
quality, download and second-machine LAN/Tailscale prerequisites remain.
