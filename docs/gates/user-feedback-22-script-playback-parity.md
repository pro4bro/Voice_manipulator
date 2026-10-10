# USER-FEEDBACK-22 — shared Script/Timeline playback following

2026-10-10. Owner feedback: dragging archived OBS Timeline highlights words,
but Script does not follow them. Input provenance must not select a different
interaction design.

## Root cause and bounded correction

ChannelScript subscribed to word indexes inside its word renderer, with no
parent viewport-follow effect. The missing behavior affected imported
multitrack footage too. Presentation convergence in earlier rounds had not
converged playback behavior. Ordinary Script's seek-resume flag did not render
when seeking within the same word. Virtual reveal found the first matching word
index without addressing the track, and ordinary follow could stop after
mounting a distant fragment rather than positioning its word.

Stored transcript tables now share `useScriptPlaybackVisibility`. It combines
the existing manual-reading policy, source-aware virtual reveal and viewport
rectangle positioning. Source ID remains part of the address: two tracks with
word index1300 are different words. Simultaneous speech highlights all sources
while maintaining one stable scroll focus. Explicit source selection overrides
that focus. Real Timeline scrubbing announces a deliberate interaction without
issuing a second audio seek, resuming follow even in the same word.

Multitrack plain text now highlights/follows its source word. Its overlay has
only two text runs and an active-word span, so it does not construct one DOM
element per word in large plain transcripts. Editing removes the overlay and
does not replace the native selection. VoiceScript tables reuse the same follow
policy. Releasing playback also clears an old single-source highlight.

Source clocks, timestamps, source assets, grouping, processing and persisted
project formats are preserved. OBS/imported audio acquisition remains in its
adapter. Pending recognition without finalized word timing is provisional;
archived per-word documents use the shared path. ADR0067 records the contract.

## Verification

- Before the correction, five of six initial registry regressions failed:
  imported/OBS paused follow, imported/OBS distant reveal and ordinary
  same-word resume. The initial ordinary virtualized reveal case passed.
- Final registry parity tests cover ordinary file, imported parent/child and
  archived OBS parent/child through the real ModuleRegistry. Other cases cover
  overlapping sources, source preference, manual reading/scrollbar control,
  unrelated seeks, playback release, plain text and native selection.
- Four actual waveform interaction regressions exercise ordinary Timeline,
  ImportedMultitrackTimeline and OBS parent/child via the registry. Existing
  subtitle, timing editing, undo, selection and measured scrolling checks remain.
- Focused104/4 passed before the last stylesheet/playback-release additions.
  The real stylesheet test verifies overlay padding, border width, font,
  line-height and non-interfering positioning.
- Final full frontend: **772/84 passed in98.94s** using
  `npm test -- --maxWorkers=2`. Log:
  `.scratch/user-feedback-22-frontend-final.log`.
- Default-worker full run:770/772 passed; existing measured OBS9 scroll test
  hit its5000ms timeout and the live caption assertion received `Chưa có lời
  nói`. Concurrent load and the fixture's wall-clock age are the suspected
  causes; this run alone does not prove them. Log:
  `.scratch/user-feedback-22-frontend.log`. The bounded full run retains all
  assertions/timeouts; no existing test was weakened. An earlier focused
  archive zoom run also failed once and passed on subsequent focused/full runs.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass.
- Built client: `apps/web/dist/assets/index-kk3tqZhh.js`, stylesheet
  `apps/web/dist/assets/index-D2pWhgMc.css`.
- Backend: **741 passed /2 existing warnings in192.19s** using
  `.venv/Scripts/python.exe -m pytest services/api/tests -q`, serially after
  the first completed frontend/build gate. Log:
  `.scratch/user-feedback-22-backend.log`.
- Product commit: `6c2d714`. The final frontend rerun includes a stronger
  standalone-file fixture with no archive parent; product code is identical
  to the earlier bounded run (772/84 in96.69s).

## Native acceptance and next planned round

The earlier browser-automation approval rejection remains respected. These are
real React caller/handler and stylesheet checks with controlled geometry, not
a native browser recording or proof of every future interaction. Refresh the
built client and compare OBS9 with an imported source: drag to an offscreen
word, scroll Script manually, drag again within that word, switch parent/child,
and repeat in plain text. Both views must follow without scroll oscillation or
changing native editing selection.

Exact next planned round: **STT-TIMING-ACCURACY-01 independent anchor review**
after the owner completes the Conviction timing reference. That evidence is
needed for independent acoustic boundary measurement. Phase03 remains60%.
