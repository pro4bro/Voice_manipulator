# Implementation Plan: OBS Capture in Speech to Text

> Current continuation (2026-10-03): `docs/GAP-PLAN-2026-10-03.md`.
> Exact next: **PROJECT-WRITE-01**. The OBS history below is retained;
> `docs/WORK-ROUNDS.md` and current ledgers own execution priority.


Status: OBS-01 through OBS-08 complete; portable distribution and automatic
session finalization are in progress. This plan is a new feature track; it does not advance
the current `03-03C` pointer in `docs/WORK-ROUNDS.md`. Execute one round per
invocation and stop for review, as required by `AGENTS.md`.

## Outcome

On the Speech to Text page, the user can link an OBS recording, see its video
and separately named audio sources, transcribe each source, review the result
in Script/Timeline, and export an SRT synchronized to the video. Later rounds
add provisional live captions in OBS and a reviewed hard-subtitle render.

OBS owns screen/window capture and the original video recording. While OBS is
recording, its native plugin also sends each selected source's PCM directly to
Pro4Bro. The app durably records those separate audio stems as well as running
provisional live STT; these app-owned stems survive a later OBS file import and
support source-specific final STT. Pro4Bro also owns the capture-session record,
transcript revisions, timing review, subtitle export, and derived renders. A
virtual microphone is a separate routing feature; this plan does not require a driver.

## Existing seams

- `apps/web/src/pages/workspaceManifest.ts`: Speech to Text composition.
- `apps/web/src/modules/recorder/Recorder.tsx`: existing single-source browser
  recorder; retain it as a separate choice.
- `services/api/app/adapters/media_import_processor.py`: project-owned video
  import, analysis WAV, and finalized STT entry point.
- `services/api/app/adapters/subtitle_exporter.py`: trusted-timing SRT export.
- `services/api/app/main.py`: media and subtitle routes.
- `docs/PORTABILITY.md`: only project-relative paths persist.

## Architecture decisions

1. **Start with OBS's recorded file.** OBS can record sources on separate audio
   tracks. Importing that file proves the key user journey before native plugin
   development. Standard OBS track slots are finite; the UI must show the
   configured track mapping and warn when sources are already mixed together.
2. **One capture session, several assets.** A project-owned session manifest
   relates the immutable OBS video to each extracted audio asset, OBS track
   number/source label, source start offset, and one recording timeline. Existing
   Media Pool assets remain individually addressable for STT and review.
3. **Recording time is authoritative.** Offline cues use timestamps in the
   finished OBS media file; that file's timeline reflects any pause behavior
   OBS applied. Live mode additionally records OBS pause/resume and
   discontinuity events to map incoming PCM timestamps onto that file. Never
   use API arrival time or the browser wall clock as subtitle timecode.
4. **Live app recording is durable.** A native OBS plugin uses per-source audio
   capture callbacks and OBS recording events. Its callback only copies frames
   into a bounded queue; transport and disk writes run outside OBS's audio
   callback. The API acknowledges a chunk only after writing it to its
   source-specific project stem. A sequence gap, disconnect, or overload is
   recorded as a gap marker; OBS recording continues. Live STT consumes those
   app-owned stems, and its text remains provisional until final review.
5. **Two subtitle products.** A live Text/Browser Source may be burned into
   OBS's recording as a preview. The final corrected SRT is produced after
   recording. Hard-subtitle render makes a new video and never replaces the
   original.
6. **Local, explicit pairing.** OBS plugin and API communicate only over local
   transport with a per-install/session secret, source allowlist, size limits,
   and visible connected/recording state. The OBS WebSocket control channel,
   if used for scene text, is a distinct authenticated connection.

## Speech to Text UX

- Add an **OBS Capture** entry next to the existing Recorder controls, without
  replacing microphone/browser recording.
- Setup shows OBS connection status, selected scene/source/track mapping, and
  whether each source has audio. Initial file-import mode works without the
  plugin; live mode appears only when the plugin is paired.
- A session row in Media Pool opens video plus child audio tracks. Selecting a
  track shows its own Script/Timeline; selecting the session shows a merged
  review timeline with source labels.
- Show `Live draft`, `Final STT`, `Needs timing review`, and `SRT ready` as
  different states. Export controls belong to the session so timecode is the
  video's timeline, even when a child track starts later.

## Task list and gates

Tickets live under `.scratch/obs-speech-to-text/`; requirement IDs are in
`.planning/REQUIREMENTS.md`. Each round is one focused invocation.

| Round | Delivery | Depends on | Gate |
| --- | --- | --- | --- |
| OBS-01 — complete | Feasibility fixture and frozen time contract | None | Real OBS recording with screen, mic, and application audio on separate tracks; `ffprobe` inventory, pause/offset notes, and measured sync documented in `docs/OBS-01-TIMECODE-FIXTURE.md`. |
| OBS-02 — complete | Session ingest and portable track assets | OBS-01 | Import one OBS file; reopen and move project; original video, track files, mapping, and metadata survive. |
| OBS-03 — complete | Speech to Text session UI | OBS-02 | Import/open session from page; select each track; see correct media, Script, and Timeline with no existing Recorder regression. |
| OBS-04 — complete | Live receiver and one-source native plugin | OBS-03 | While OBS records video, app durably records one source's PCM; bounded plugin queue, durable ACK, sequence gaps, pause events, and OBS independence tested on real Windows OBS. Evidence: `docs/OBS-04-LIVE-PLUGIN.md`. |
| OBS-05 — complete | Multiple live sources and recovery | OBS-04 | Independent source IDs/stems/chunks, gap and pause markers, reconnect, per-source live STT; source mute/change does not relabel another stream. Evidence: `docs/OBS-05-MULTI-SOURCE-RECOVERY.md`. |
| OBS-06 — complete | Per-track final STT and session SRT | OBS-05 | Independent transcripts; selected source cues align to the imported video's timeline; untrusted timing omitted with visible count. Evidence: `docs/OBS-06-FINAL-STT-SRT.md`. |
| OBS-07 — complete | Live caption overlay | OBS-05 | Provisional text visible in an OBS scene and in the recording; latency and mismatch measured against final SRT. Evidence: `docs/OBS-07-LIVE-OVERLAY.md`. |
| OBS-08 — complete | Reviewed hard-subtitle render | OBS-06 | New video with reviewed subtitles; original remains; duration, A/V sync, and Vietnamese styling verified. Evidence: `docs/OBS-08-HARD-SUBTITLE.md`. |
| PORT-01 — complete | Portable path contract and fail-closed audit | OBS-08 | Runtime defaults stay inside the app; audit identifies every external/missing component. Evidence: `docs/PORT-01-PORTABILITY-AUDIT.md`. |
| PORT-02 — complete | Bundled Python runtimes | PORT-01 | Core/STT/training interpreters and imports use private embedded Python; `Profile All` passes 20/20. Evidence: `docs/PORT-02-BUNDLED-PYTHON.md`. |
| PORT-03A — complete | Copyable test bundle and local path-move acceptance | PORT-02 | Generated bundle passes 25/25 and starts API/STT from its own private runtimes; OBS installer is included. |
| PORT-03B — next | Physical-copy and clean-machine OBS acceptance | PORT-03A | `Profile All` passes on another Windows machine; plugin loads in OBS and records separate mic/application stems. |
| OBS-09 | Automatic Stop-to-MKV finalization | PORT-02 | OBS Stop closes live stems, supplies the last recording path, links one session, and queues per-source Final STT. |
| OBS-10 | Source roles and per-source diarization | OBS-09 | Mic and meeting-app roles appear in Script speaker selection; optional diarization labels each source independently and writes timeline/speaker labels to SRT. |

### OBS-01 — Fixture and time contract

Set up OBS on a real Windows machine with screen/window capture, one mic,
one application audio source, an intentionally delayed/started source, and a
pause/resume. Record an MKV with a mix track plus isolated tracks. Inspect
container stream indices, start times, durations, audio sync offsets, pause
behavior, and output path using FFprobe. Document OBS version, OS build,
sample rates, and observed discrepancies. Choose and freeze the session time
transform before adding persisted fields. If a source is impossible to isolate
in OBS, report it explicitly rather than promising separate STT.

### OBS-02 — Ingest

Add a project-owned capture-session domain record and file adapter outside
`engines/`. Ingest the original OBS recording through a background job; retain
the source video inside the project, extract selected tracks without changing
their meaning, create child Media Pool audio assets, and persist relative paths
and source/track IDs. Interrupted import must be recoverable or fail with an
honest state, without a half-complete session shown as ready.

### OBS-03 — Page connection

Add a compact OBS Capture panel to the Speech to Text page and session/track
navigation in Media Pool. File-import mode exposes track mapping review before
STT. Existing browser Recorder stays available. Selecting a track changes the
current Script/Timeline asset; session view is a review surface, not a fake
single audio source.

### OBS-04/05 — Live plugin and app-side recording

Build a versioned Windows OBS native module from the official plugin template.
Observe recording lifecycle and selected `obs_source_t` audio capture callbacks.
Copy PCM and source UUID/timestamp/format to a bounded queue, then transmit
locally. The API creates a durable live session and writes separate PCM chunks
for each source inside the project before acknowledging them. Track sequence
gaps, pause/resume, reconnect, and source identity. Live STT reads these app
recordings without blocking writes. A plugin crash, API restart, or STT backlog
must never stop or corrupt OBS's video recording.

### OBS-06 — Final transcription and subtitle timing

Queue STT on selected app-recorded stems and/or child tracks from the finished
MKV. Keep each transcript revision on its own asset and attach source identity
to merged review cues. Convert accepted cue times to the recorded video clock
using measured offsets and the file's timestamp behavior from OBS-01. Export
SRT from accepted, trusted words and include an explicit skipped-cue count.
Test the SRT against the source video, not only against analysis WAV.

### OBS-07/08 — Subtitles

Feed provisional text to an OBS Text/Browser Source for optional live burn-in;
show the current latency in Speech to Text. Keep it visually labeled as live
draft. After recording, use the final reviewed cues for SRT and an optional
FFmpeg hard-subtitle derivative. Validate font rendering for Vietnamese text.

## Verification for every implementation round

- Focused tests for the changed contract, including failure/restart behavior.
- `npm test` and `npm run build` in `apps/web`; API pytest suite from repo root;
  `git diff --check`; no tracked changes under `engines/OmniVoice`.
- Manual OBS check on Windows when a round changes capture, sync, overlay, or
  render behavior. Record actual OBS version, inputs, output files, drift and
  latency; never mark an integration gate passed using only mocks.

## Overall acceptance

1. A 30-minute OBS session with screen, mic, and application audio reopens in
   Speech to Text as video plus independently playable/transcribable sources.
2. A source starting late and a pause/resume produce SRT cues against the video
   timeline. Measure cue-to-speech error at the start, middle, and end; target
   no more than 200 ms at each sampled anchor after review.
3. Provisional live transcript is visibly distinct from finalized text. When
   Pro4Bro disconnects, OBS keeps a playable recording and reports the gap.
4. SRT and hard-subtitle video derive from the accepted transcript; moving the
   project and using Open Existing does not break media or export lineage.

## Risks and decisions to validate in OBS-01

| Risk | Response |
| --- | --- |
| One OBS source already mixes multiple speakers/apps | Preserve it as one source; diarization may label speakers but cannot recover isolated original tracks. |
| OBS track slots or container metadata are insufficient | Use plugin-captured per-source stems only after recording-path limits are measured; do not assume unlimited tracks. |
| Raw callback format or plugin/OBS version changes | Pin a supported OBS version range, negotiate protocol version, and run a real plugin smoke test. |
| Duplicate desktop/application audio causes echo | Provide source-map check and warn when both capture the same app. |
| Live model delay and backpressure | Bounded queue, drop/gap report, no blocking OBS audio thread; final STT owns publishable cues. |
| Large project copy | Report required disk space and import progress before ingest; preserve project-relative storage. |

## Historical next action (superseded by GAP-PLAN below)

Run PORT-03B next with the prepared folder documented in
`docs/PORT-03-PORTABLE-BUNDLE.md`: physically copy it to another Windows
machine, rerun `Profile All`, install/restart OBS, and record separate mic and
meeting-application sources. Then perform OBS-09 and OBS-10 before the
30-minute multi-source acceptance.


## GAP-PLAN continuation — 2026-10-03

The current continuation of this OBS/STT plan is
`docs/GAP-PLAN-2026-10-03.md`: 13 scheduled rounds and 2 conditional repairs.
Local tickets: `.scratch/gap-plan/`. Durable round state remains in
`docs/WORK-ROUNDS.md`. Original contracts and later GSD plans above are retained.

Exact next: **PROJECT-WRITE-01**, reproduce and repair the observed concurrent
manifest/registry write failure before further capture/quality acceptance.
No implementation is performed by this planning round.
