# USER-FEEDBACK-07 — OBS waveform after Stop

2026-10-09. Baseline2bdafa8, branch `feat/03-04-high-quality-training`.
One bounded round repairs the owner's Stop/archived waveform regression.
Contract: ADR0054.

## Diagnosis and delivered behavior

Normal `data/logs/pro4bro-controller.out.log` recorded repeated422 responses for
`test-obs-9-f4e60d5e`, recording `13b6cb03-2dfc-4b75-a05e-dd795c70d549`, both
channels, start0/end406.4052262/max600. The UI offers full-recording zoom while
the backend previously rejected any span over120 seconds, including stopped takes.

The endpoint now permits stopped full snapshots within the journal's recording
duration (minimum permitted viewport120 seconds), retaining the600-point cap.
Live and afterSequence cursor windows retain120 seconds. Invalid, nonfinite,
reversed or excessive windows still return422. Envelope blocks and PCM envelopes
are processed individually into bounded extrema bins, retaining sample provenance,
channel separation and gap metadata. Ready MKA and stopped/pending PCM both work.

Two UI regressions failed on baseline behavior: received PCM disappeared when
Stop changed the viewport from60 to10 seconds; the lane disappeared when Stop
preceded the next journal-list reply. Both now pass. Journal refresh happens
immediately on recording identity change/Stop, while same-project/same-take live
lanes and overlapping waveform bins remain visible during loading. Old async
requests remain cancelled. The live subscriber also clamps its window before
the overview-reset effect runs. The overview test now checks the actual900-second
request and visible waveform rather than the zoom label alone.

## Owner artifact check

The owner's journal is stopped/ready and records duration406.4052262 seconds.
The original source MKA is12,904,822 bytes; both mono analysis WAVs are19,507,540
bytes. These files remained present and their SHA256 hashes matched before/after
the probe. This is a waveform request/display failure, with retained media evidence.

The probe copied only journal/envelope metadata to ignored
`.scratch/user-feedback-07/project`. No normal runtime, OBS or project files were
modified. It reads the owner's three media hashes and computes against copied
envelopes using the real waveform adapter. Both channels return source=mka,
600/600 audio-bearing points, peaks32341/6921, with measured local adapter times
545.36ms/519.43ms. These are local fixture timings, not browser latency budgets.

The same copied journal/request executed through the adapter source at2bdafa8
returns422 and the exact reported error, proving the original cause independently
of mocks. The Worker did not capture a pre-edit backend red run; this baseline
comparison supplies the backend red evidence. Generated121-second MKA regression
also exercises real FFmpeg decode and envelope rebuilding (silence fixture, not
speech-quality evidence). Regression pending PCM uses the exact406.4052262 span.

Evidence: `.scratch/user-feedback-07/probe-owner-waveform.py` and
`.scratch/user-feedback-07/owner-waveform-evidence.json`.

## Validation

- Frontend `npm test -- --maxWorkers=4`: **639 passed /73 files**,47.78s.
  Includes the pre-existing ignored `.scratch/footage-switch.performance.test.tsx`;
  tracked suite contributes638 tests/72 files. Focused OBS Timeline36/36 passes.
- `npm run typecheck`: pass. `npm run build`: pass,120 modules; main JS774.73kB
  (gzip224.60kB), CSS250.27kB (gzip38.76kB); deletion Worker1.42kB retained.
- `.venv/Scripts/python.exe -m pytest services/api/tests -q`: **682 passed**,
  two existing Starlette/httpx and audioop deprecation warnings,198.41s.
  Focused OBS runtime module27/27 passes; both new waveform cases executed.
- `git diff --check`: pass (ordinary LF/CRLF checkout warnings only).
- Actual copied owner-envelope overview and baseline422 comparison: pass;
  all three original media SHA256 hashes remain unchanged.

## Remaining gap and exact next round

The owner has confirmed current Record signal and overlap identification work.
Native Stop/display/playback has not yet been accepted with this build. Exact next
round: **UX-EDITING-DEVICE-01**, including reopening the existing take at full zoom
and fresh native Record longer than120 seconds -> Stop -> zoom/playback after
reload. Existing browser access rejection remains; no alternate automation route
was used. Long-footage editing/scroll and acoustic/STT word-truth gates remain.
Initial archive decode and hours-long disk-read latency are not solved or claimed.
No normal services/models, owner media, upstream or project schema changed;
Phase03 remains60%.
