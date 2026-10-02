# Project Status — 2026-09-22

## LiveLink browser caption timing — 2026-10-03

`LIVELINK-STT-12F` measured event persistence, browser receipt and Script row
frame boundaries. In a warmed, isolated two-track take with concurrent detailed
STT, visible-row audio age peaked at 23.123/10.321 seconds (9/3 samples).
Browser receipt-to-frame median was 39 ms, p95 115 ms, with one 1.882-second
outlier. PCM ingress p95 was 33.210/33.964 seconds; an offscreen tail caption
took 54.379 seconds, including 33.999 seconds before PCM receipt and a
14.234-second recognition request. These are double-animation-frame/viewport
proxies, not compositor presentation measurements. The harness stopped the
take at 70.804 seconds after a status request protocol error; the API stayed
healthy. It is not the planned 170-second sustained acceptance or a latency
improvement claim. All 104 chunks per track were sample-contiguous, the MKA
passed hash/decode checks, live checkpoints reached both tails and detailed
STT published both tracks with no live error events or duplicate finals.

A separate 234.233-second cold take retained all PCM and detailed STT but had
one live timeout with an empty error string. Listener loss recurred in another
launch attempt without an isolated cause. Runtime partial status also reset
the workspace source selection, and later Script rows were rendered offscreen.
See `docs/gates/livelink-stt-12f-browser.md` for methods, limitations and recovery
evidence. Temporary probes were removed; this round changes documentation only.
Exact next: `LIVELINK-STT-12G`, profiling PCM ACK latency under browser polling.
Cold startup, reconnect/follow UX and the wider `LIVELINK-08` matrix remain open.

## LiveLink model reuse and caption delay — 2026-10-03

`LIVELINK-STT-12E` keeps `medium` live and `large-v3` detailed recognizers
warm together when CUDA has sufficient memory (ADR 0032). A fixed repeated
request sequence reduced warm live calls from roughly 3.2 to 0.6 seconds. A
172.806-second physical two-track OBS take with both STT modes and a detached
FastAPI restart retained gap-free PCM, a verified two-stream MKA, complete
live checkpoints and detailed STT on both tracks. Post-restart caption delay
estimates had medians 0.923/1.764 seconds and maxima 16.029/10.912 seconds,
versus 11.689/12.715 and 19.434/29.092 in the prior 12D retry. Independent
API polling measured 6.147/4.641-second median event ages; browser paint was
not observed. The detached launcher stayed healthy for 90 seconds both idle
and under recording load, so the earlier intermittent listener failure remains
unattributed. `LIVELINK-STT-12F` will trace remaining caption spikes at the
viewport; `LIVELINK-08` still owns the wider source/UI acceptance matrix.

## LiveLink physical API restart under model load — 2026-10-03

`LIVELINK-STT-12D` restarted FastAPI during a physical two-track OBS recording
while per-track `medium` live STT and `large-v3` detailed STT ran. The successful
173.507-second retry retained 288 contiguous 48 kHz stereo PCM chunks per
track, a hash-verified and decoded two-stream MKA, 94 live transcript events
with no errors or duplicate finals, complete sequence-288 live checkpoints,
and full detailed STT publication on both tracks. The checkpoints reached the
tail about 15 seconds after Stop. Estimated caption age after restart peaked
at 19.434/29.092 seconds; browser paint time was not measured. The first
detached API launch lost its listener despite a live Python process, while a
foreground launch recovered its PCM and transcripts. See `docs/WORK-ROUNDS.md`
and ignored `.scratch/livelink-stt-12d-retry` evidence. The next bounded round
is `LIVELINK-STT-12E` for launcher diagnosis and live-caption latency; the
owner source/UI matrix remains `LIVELINK-08`.

## LiveLink realtime STT restart recovery — 2026-10-02

`LIVELINK-STT-12C` persists each track's next committed PCM sequence and the
start of any open utterance. FastAPI startup restores unread PCM and replays
an open utterance into a fresh Studio session. Matching transcript events are
not appended twice, including a final event written just before a checkpoint
was interrupted. New recording journals carry a recovery-version marker so a
crash before the first checkpoint can still recover; legacy completed takes
without the marker are left alone. See ADR 0031.

The 12B physical OBS PCM was copied to an isolated project for a simulated
process restart. All 659 chunks across two tracks reached checkpoints 330/329,
with zero error events and zero duplicate finals. Processing the 185.71-second
source took 34.328 seconds total, including 25.734 seconds after restart,
with a deterministic 5-ms fake recognizer. API startup and active-recording
restart are covered by tests. Actual caption lag with the real `medium`
recognizer, simultaneous detailed STT and a running OBS/API process remains
for `LIVELINK-STT-12D`; the wider source/UI gate remains `LIVELINK-08`.

## LiveLink realtime STT catch-up — 2026-10-02

`LIVELINK-STT-12B` replaced queue-full loss with per-track replay of committed
PCM. The RAM queue stays bounded; when it fills, a sequence cursor reads the
remaining project-owned chunks, checks their hashes, and drains through Stop.
A forced two-track backlog test verified all 24 chunks per track reached live
recognition, and a corrupt deferred chunk fails closed. See ADR 0030.

A 185.71-second physical OBS take with two speech sources and concurrent
`large-v3` detailed STT produced zero live queue-full or other event errors,
52 live text events, contiguous PCM on both tracks, a verified two-track MKA,
and published detailed STT for both tracks. PCM ingress p95 was 0.972/1.133
seconds. This take did not prove that the deferred path activated; the forced
backlog test does. The maximum observed live final-event lag was 26.828/20.578
seconds while models shared the runtime. The cursor does not yet survive API
restart. `LIVELINK-STT-12C` will checkpoint and resume it, then measure
catch-up lag; the broader source and viewport gate remains `LIVELINK-08`.

## LiveLink PCM ACK latency reduction — 2026-10-02

`LIVELINK-INGEST-11D` measured the 11C ACK path with real source chunks:
separate PCM, metadata and waveform flushes cost roughly 38, 51 and 38 ms
at the median. PCM and metadata now flush concurrently, then publish in PCM
before metadata order so a retry never sees committed metadata without
committed audio. Rebuildable waveform envelopes retain atomic replace but no
longer add a third per-chunk flush to the ACK path. See ADR 0029.

A 304-second two-source OBS take with live and detailed STT lowered p95 PCM
ingest lag to 4.20/4.14 seconds, versus 16.96/17.23 seconds in the first
304 seconds of the 11C take. Spool peak fell from 56 to 20 chunks. Both
tracks remained sample-contiguous, the final two-track MKA matched its journal
hash and decoded, and detailed STT published both tracks. Full backend suite:
485 passed. The shorter take and different startup timing limit a universal
performance claim. Realtime STT still emitted 47 queue-full errors; the next
round is `LIVELINK-STT-12B`, followed by the full `LIVELINK-08` source/UI gate.

## LiveLink physical two-track ingress gate — 2026-10-02

`LIVELINK-INGEST-11C` loaded the 0.6.6 package in OBS 32.2.2 and recorded
497.288 seconds from two independent OBS speech sources while automatic
realtime and user-started `large-v3` detailed STT ran for both tracks. Native
PCM had zero sample gaps/overlaps across 793 and 795 chunks. The final MKA
matches its journal hash, decodes both 48 kHz stereo FLAC tracks, and ends at
the Stop boundary. Detailed STT published both tracks, with 128 and 66 SRT
cues. Peak disk-spool backlog fell from the earlier 153 chunks to 56; the last
PCM arrived 2.268 seconds after Stop instead of roughly 50 seconds.

The take did not maintain low live latency throughout: PCM ingest p95 was
16.29/16.49 seconds, and the native HTTP log recorded a 258.8 ms weighted
mean and 1,986 ms maximum request. Realtime STT emitted 382 queue-full errors
despite durable PCM remaining complete. `LIVELINK-INGEST-11D` will address
the PCM ACK/write latency; `LIVELINK-STT-12B` will address the distinct
realtime recognition queue. This run used controlled OBS media sources on the
owner's machine; the full source matrix and UI viewport remain in the final
`LIVELINK-08` gate.

## LiveLink long-take PCM ingress throughput — 2026-10-02

`LIVELINK-INGEST-11B` removes the directory-wide chunk metadata scan from
each API PCM write. An isolated two-track replay at sequences 150–179 reduced
median persistence time from 26.8 to 23.9 ms per chunk. The native sender now
amortizes control polling across up to 20 sends within a one-second burst and
logs send count plus average/maximum HTTP request duration every five seconds.
The plugin builds, its package manifest hash matches the DLL, native tests
pass 2/2, backend passes 484/484 and frontend passes 455/455 with typecheck
and build. The running OBS process has not loaded the new DLL. The owner's
earlier 153 pending chunks and roughly 50-second Stop tail remain the physical
comparison for `LIVELINK-INGEST-11C`: sustained OBS plus STT, zero sample gaps,
low tail delay and final MKA publication.

## Bidirectional OBS overlap review — 2026-10-02

`LIVELINK-OVERLAP-15` shares one selected OBS recording interval between Script
and Timeline. A live or detailed-STT Script overlap badge seeks its own source
and highlights the matching range on participating Timeline lanes. Clicking a
waveform within an overlap highlights the corresponding Script badges; moving
from a single archived track to an overlap restores the parent multitrack
Script. Neither direction autoplays audio. Thin Timeline overlap markers remain
passive to pointer dragging. Once trusted detailed words exist, both modules
use those intervals rather than stale realtime-only markers. Frontend 455/455
tests, typecheck and build pass. Running OBS and owner-viewport contrast/hit
area acceptance remain open. See ADR 0028.

## Interactive in-progress OBS footage — 2026-10-02

`LIVELINK-MEDIA-14` lets the journal-backed Media Pool footage expand into
recorded tracks during capture. Selecting the footage opens its live Timeline
and Script; selecting a track focuses its lane while live follow continues.
Tracks with durable PCM can play a 30-second preview rendered from verified,
continuous source chunks. The temporary 24 kHz mono WAV is outside the
project; its exact range is reported to the UI, and source PCM is unchanged.
The selected provisional row moves to its archived MKA parent when publication
finishes. Backend 483/483 and frontend 450/450 tests, typecheck and build pass.
A read-only preview of the owner's `Test_OBS 7` PCM yielded a one-second,
24,000-frame WAV. Physical OBS/app viewport acceptance remains open. The
in-progress preview is bounded; full-length playback still depends on the
completed MKA. See ADR 0027.

## Permanent OBS footage deletion — 2026-10-02

`MEDIA-DELETE-17` records permanently deleted OBS recording IDs inside the
portable project. The API deletes the MKA parent and channel assets while
serialized with archive publication, then removes the ID from the current
LiveLink machine snapshot. Restart, journal persistence, recovery and archive
retry cannot recreate the deleted recording. Media Pool discovery also hides
older archive-ready journals with no indexed parent asset, including the
owner's orphan in `Test_OBS 7`. The old journal remains on disk for forensic
inspection; it is no longer offered as pending footage. Backend 482/482 and
frontend 447/447 tests, typecheck and build pass. Running-app/OBS verification
remains open. See ADR 0026.

## LiveLink detailed STT from durable PCM — 2026-10-02

`LIVELINK-STT-16` adds a per-recording, per-track detailed STT checkpoint. The
in-progress OBS Media Pool row can select tracks that have durable PCM and a
10–600-second block size. Starting the job freezes each selected track's full
recorded interval at the button press. The worker recognizes that interval,
then each subsequent full block with ten seconds of preceding audio. It
replaces timed words from five seconds before the seam, saves each result
before moving its cursor, resumes after API restart, and drains short tails
after Stop. It publishes project-owned SRT and applies the final timed text to
each archived track after the MKA is ready; an STT result without word timing
cannot silently join an overlap block. No source PCM or archived media changes.
The implementation uses the detailed `large-v3` path and keeps realtime
LiveLink recognition separate. See ADR 0025.

Generated two-track PCM and API/UI tests pass. A read-only replay of the
owner's archived `Test_OBS 7` take rendered each source's first five seconds
as PCM16 mono 24 kHz, with the first four seconds byte-identical to its saved
analysis WAV. The physical while-recording OBS/UI and sustained GPU load gates
remain open. Provisional-footage interaction is now covered by
`LIVELINK-MEDIA-14`; `LIVELINK-INGEST-11B` covers live STT spool lag.

## Concurrent multitrack Script rows — 2026-10-02

`MEDIA-SCRIPT-01C` keeps an OBS or imported track's continuing speech in one
Script row when another track interjects. Rows remain ordered by start time;
diarized speaker changes still split them. Archived OBS rows use short Track
labels, show row time bounds, and expose each saved STT word timestamp on
hover/focus. Realtime overlap ignores listening-only and sub-0.4-second
intersections; after detailed STT, parent Script shows overlap review badges
from trusted cross-track word intervals. Frontend 446/446 tests, typecheck and
build pass. Read-only replay of the owner's two-track `Test_OBS 7` recording
found 227 saved timed words and seven Script rows; Track 1 stays open through
Track 4's interjection. Physical viewport and acoustic overlap acceptance
remain open. See ADR 0024.

The same owner's project has an archive-ready OBS journal with no MKA asset,
which explains a deleted recording reappearing as a journal-backed pending row.
`MEDIA-DELETE-17` will reconcile permanent deletion with recording discovery.

## Voice Manipulator WAV and SRT export — 2026-10-02

`VOICE-EXPORT-13` gives each Voice Output row WAV, SRT by Script line, and
SRT by word actions; the active Voice Script has matching export choices.
WAV download sends the original generated file. Line cues use saved audio
assembly bounds and work when word alignment is unavailable. Word cues still
require trustworthy measured timing, so an estimated word cannot appear as a
precisely timed subtitle. A generated two-row file passed byte-for-byte WAV
and exact SRT cue checks; all seven existing local Voice Outputs have valid
segment boundaries. Frontend tests, typecheck and build pass. A manual browser
download and viewport check remains open. Full suites passed 441 frontend and
474 backend tests. See ADR 0023.


## LiveLink transcript quality profile — 2026-10-02

`LIVELINK-STT-12` changes OBS LiveLink v3 from `tiny`/2-second recognition
passes to `medium`/4-second passes and forwards the Project language when set.
The owner's archived two-track 24-second replay reduced total model time from
72.69 seconds across 24 calls to 12.28 seconds across 12 calls on the local CUDA
runtime. A 12-second Track 1 excerpt produced more intelligible Vietnamese
phrases, but no verified reference transcript exists for a word-error score.

The previous 11-minute take had 171 Track 1 live STT queue-full events and up
to 203 seconds of transcript event lag while its durable PCM remained gap-free.
The new profile is implemented and API-tested; a sustained real OBS take is
still needed to verify queue behavior, model load and PCM upload latency. The
local STT portable-runtime profile passes all six checks and now requires the
`medium` model; runtime setup preloads it alongside the batch model. The
Project `Test_OBS 7` has no language set, so automatic detection still applies.
The user's audio/SRT export, live Media Pool interaction and bidirectional
overlap selection are implemented in `VOICE-EXPORT-13`, `LIVELINK-MEDIA-14`
and `LIVELINK-OVERLAP-15`.

## LiveLink waveform tail and overlap controls — 2026-10-02

`LIVELINK-TIMELINE-11` refreshes PCM waveforms when the live Timeline window
shifts, rejects late results for old windows, and distinguishes a pending tail
from an internal missing-PCM gap. Passive thin overlap marks leave waveform
dragging available. Script overlap badges are compact and seek without auto
play; Space toggles archived playback when the pointer is over Timeline.

The owner's 11-minute `Test_OBS 7` take has zero stored sample gaps on Track 1
and Track 4 and PCM reaches Stop. Its native spool nevertheless rose to 153
pending chunks; the last PCM reached the API about 50 seconds late. This is an
ingest throughput gap for `LIVELINK-INGEST-11B`, not resolved by the frontend
round. Frontend tests, typecheck and build pass. A long real recording with the
new UI has not yet been observed.

## LiveLink muted Track 1 and Media Pool recording visibility — 2026-10-02

`LIVELINK-CAPTURE-10` traced the owner's silent Track 1 to a native callback
that zeroed raw source samples whenever Desktop Audio was muted in the OBS
mix. Forwarded LiveLink tracks now retain those raw samples. Missing historical
OBS sources remain in protocol history but no longer appear as current plugin
or app rows; the owner's eight rows comprised six present and two missing.
Media Pool displays a journal-backed provisional footage row during recording
and archive finalization, then the verified MKA parent. Recorder and Media Pool
try the latest transient archive failure once, with manual retry available.

The owner's failed take was rebuilt to MKA `ready`. After installing the new
plugin, a real muted Desktop Audio test produced a ten-second, two-track MKA;
Track 1 peak was 32,284 and RMS 5,211 with a controlled tone. Frontend tests
pass 434/434; native tests pass 2/2, and typecheck/build pass. A visual
in-progress Media Pool check and distinct simultaneous audio across all
selected OBS sources remain `LIVELINK-CAPTURE-10B`. See ADR 0021.

## Growing MKV snapshot STT and visible word timing — 2026-10-01

`MKV-STT-02` snapshots committed audio when detailed STT is requested, recognizes
that entire initial interval per selected channel, then processes configurable
blocks (60 seconds by default) with 10 seconds of preceding audio and transcript
replacement from 5 seconds before each boundary. Import starts live preview;
detailed STT waits for its explicit button. Saved plans/results resume after a
restart and Finish drains the short final block. Each channel receives an
accurate-only SRT. The imported Timeline positions subtitle words by their
absolute timestamps; parent Script words seek and highlight against the shared
multi-channel playhead. See ADR 0020.

Verified with a real growing 42-second, two-track speech MKV: both channels
completed with 91 timed words each and SRT artifacts. The full suites passed
430 frontend / 470 backend tests during this round; after the final import/start
separation, all 49 relevant frontend tests and 14 growing-MKV backend tests
passed again, with typecheck/build. The 29:50 timing example is regression-tested;
a real 30-minute recognition/throughput acceptance has not been run. Broader
simultaneous-speaker Script grouping remains in MEDIA-SCRIPT-02.

## LiveLink capture recovery — 2026-09-30

`LIVELINK-CAPTURE-09` isolates archive finalization from PCM ingress and makes
finalize acknowledgement asynchronous and deduplicated. The owner's 63 queued
SQLite chunks drained and the affected two-channel recording reached MKA ready.
Real new captures verified zero sample gaps, speech waveforms, live/final
transcripts and parent footage publication. Primary IMPORT now opens the native
source picker and automatically shows track choices; browser upload remains a
separate completed-file control. A real two-track MKV imported while its writer
was active in 0.39 seconds, followed growing clusters and completed both STT
tracks after finish. Recording labels use start time, project, MIC/SYS/LIV and
an ID suffix. Frontend 428 tests, backend 468 tests, typecheck and build pass.
See ADR 0019 and the LIVELINK-CAPTURE-09 work-round evidence for acceptance limits.

## Continuous Script turns — 2026-09-30

`MEDIA-SCRIPT-01B` removes the fixed silence threshold that split one person's
or channel's dialogue into multiple rows. The parent Script now orders words
from all imported tracks on one time axis and starts a new row only when the
channel or diarized speaker changes. OBS Live Transcribe applies the same
channel transition rule to recognized speech, ignoring empty listening events
as interruptions. The source utterances and timestamps remain unchanged.

## Parent and channel Script selection — 2026-09-30

`MEDIA-SCRIPT-01` keeps the parent footage selected when opened. Its Script
lists imported channel speech turns by timestamp; clicking a channel opens
only that channel's editable Script and waveform. Selecting the parent again
restores the combined Script and all waveforms. Word-level diarization labels
split a channel's rows at speaker changes. Adjacent OBS live transcript events
from one channel coalesce into a speech turn; only an intervening speaker or
channel starts another row. Shared Timeline cuts still target every channel.
Frontend tests, typecheck and build pass. The owner's six-track `test-obs-3`
recording has no completed STT words, and the app was not running for a live
console or visual check; that acceptance remains open.

## Growing OBS MKV import visibility — 2026-09-30

`MKV-FOLLOW-02` repairs the main IMPORT flow for a growing MKV: the import
dialog now points to the native file locator and the Media Pool pending row
shows how to select tracks and start following. Browser upload still handles
completed files. Follow registration scans only the first committed Cluster
and returns the footage before decoding historical audio; the watcher reads
bounded batches in the background. A real OBS MKV yielded six audio streams;
a temporary project registered two chosen tracks in 0.17 seconds and decoded
one Cluster in 0.55 seconds. Full multi-hour, six-track backlog throughput is
the remaining `MKV-FOLLOW-03` gate.

## Single-line Timeline channel labels — 2026-09-30

`MEDIA-VIEW-02` places Channel and Track/source names on one line in imported
and OBS LiveLink Timelines, in Layer and Column layouts. Labels measure their
available width and scroll right-to-left only when clipped. Hover/focus pause
the motion, and reduced-motion preference disables it. UI regression checks
pass; physical inspection at the owner's viewport and DPI remains open as
`MEDIA-VIEW-02B`.

## Import visibility and long-footage Timeline — 2026-09-30

`MEDIA-VIEW-01` makes an unchecked Import choice withdraw a materialized
footage or channel from Script, Timeline and other working modules while its
Media Pool row remains available to re-enable it. If the withdrawn channel
was open, the Script returns to the parent; it closes when none remain.
Archived OBS lanes honor the same choice. Imported multitrack Timeline zoom now fits the full file at
the left edge and reaches 0.01 seconds per 10 pixels at the right edge. Close
views request interval PCM peaks from the existing project cache and render a
continuous filled envelope. A source stream omitted before decoding still
requires `MEDIA-STAGES-02` to become an importable track. Real viewport
acceptance with a long multitrack file remains open.
Growing MKV live/final STT checks Import on each processing pass, so a
withdrawn channel stops receiving new segments and resumes when re-enabled.

## Media Pool workflow selections — 2026-09-30

`MEDIA-STAGES-01` exposes four persisted choices in the Media Pool: Import,
STT, Speaker Diarization and Train. Imported multitrack footage expands to
show each materialized track; parent checkboxes show the mixed state and apply
a click to all children. The queue and training compiler honor the Import
choice as a processing gate. Speaker Diarization now explains its multi-speaker
purpose before queuing all eligible checked items. The redundant imported-track
list above the Script editor is gone. Existing source media and generated
analysis remain in the project when Import is unchecked. A skipped container
stream still needs `MEDIA-STAGES-02` to be decoded on demand; until then its
pre-import choice in the old right-click menu remains fixed after import.

## Imported multitrack footage and growing-MKV feasibility — 2026-09-29

`MEDIA-MULTITRACK-01` imports a completed MKV, MOV or MP4 as one footage with
one project-owned analysis WAV per audio stream. Original media is preserved;
children retain container stream indices and take part in grouped selection,
STT/TRAIN targeting, Recycle and Delete. Generated two-track files in each
format passed native-path and upload import checks. `MEDIA-MULTITRACK-02` now
routes the selected parent to synchronized Layer/Column Timeline instances and
channel Script rows. All tracks share scrub, zoom, playhead and batch cut tools;
each has its own waveform, gain, level and editable transcript. Frontend tests,
typecheck and build pass. Owner viewport acceptance with a real multitrack
file remains open.

`MKV-FOLLOW-01` adds a local MKV follower that reads complete Clusters into
durable per-track chunks, checkpoints source identity and byte/sample position,
resumes after API restart, and re-decodes the closed MKV at Finish. Generated
two-track tests and the full backend suite pass. Real OBS writer acceptance is
open. `MKV-CHANNEL-01` adds a native-file track inspection step and Media Pool
right-click Import/STT checkboxes. Selected container streams alone become
analysis tracks; available, omitted and STT-selected tracks persist with the
footage. The same choices feed completed import and growing-MKV follow. Live
and final STT execution through Stop is implemented in `MKV-STT-01` and
`MKV-ACCEPT-01` at generated-media and concurrent FFmpeg-writer test level. A
separate worker publishes fast three-second previews from checkpointed PCM.
Detailed STT runs in user-selected segments (60 seconds by default) from the
start of each selected track while the MKV is growing, and drains the shorter
final tail after Finish. Segment word times are placed on the source timeline.
Segment results and per-track cursors survive API restart. Live and final text
refresh in Script; a user-edited Script remains authoritative and gets the
detailed STT as a revision. Real OBS recording, actual Studio STT output and
sustained throughput/viewport acceptance remain open. Browser upload remains a
fixed snapshot.

## OBS LiveLink physical capture and durable PCM outbox — 2026-09-29

`LIVELINK-08M` verified real two- and four-channel OBS takes with zero
source-sample gaps. Five seconds of API suspension left PCM on a new SQLite
disk outbox; the two-channel take resumed and archived cleanly. A four-channel
stall revealed a Stop-tail rejection, fixed by trimming queued PCM at Stop.
Plugin 0.6.6 then recovered the stranded four-channel recording across an OBS
restart, replayed its last chunk and finalized a four-track FLAC MKA with zero
gaps. The outbox uses WAL and full synchronous commits and removes a chunk
only after API acceptance. OBS MKV was readable during recording on this host,
but contains configured mix tracks and an incomplete growing tail; it does not
replace the source-specific outbox or support Ignore Stop as the sole source.
Disk-full recovery UI and a longer high-channel-count outage test remain
`LIVELINK-08N`. See `docs/WORK-ROUNDS.md` and ADR 0017.

## OBS LiveLink PCM resilience — 2026-09-29

`LIVELINK-08L` removes callback lock-failure loss, replaces the two-second
recording queue with an explicit 120-second/512-MiB safety bound, logs any
per-channel overflow, prioritizes pending PCM in the sender, and keeps PCM
persistence off the API event loop. Native four-channel backlog and sample
continuity tests, all 446 backend tests, and plugin 0.6.3 build/package pass.
Real OBS reloading and an intentionally slowed physical capture remain open
as `LIVELINK-08M`; a finite memory buffer cannot promise lossless capture
during an unlimited API outage.

## OBS LiveLink PCM loss diagnosis — 2026-09-29

`LIVELINK-08K` confirms real PCM loss in the owner's two-channel `Test OBS 2`
take: 48 transport gaps across both channels, with contiguous archived chunk
sequences and no capture pause. The loss occurs before native chunk sequencing.
Sender backlog against the plugin's two-second per-source queue is the
strongest explanation; callback lock contention can also discard packets.
The existing plugin has no drop-reason counters, so the exact contribution of
each path remains unverified. No fix or new physical OBS acceptance is claimed.
The next bounded round is `LIVELINK-08L` in `docs/WORK-ROUNDS.md`.

## Owner UX rounds — 2026-09-29

`UX-11` labels OBS Timeline recordings as
`yyyy-mm-dd_hh-mm-ss_project-name` from local start time and the current
project name, including a live option before its journal arrives. Channel
names in Column and Layer are 11.2px (70% of the previous 16px). Frontend
tests, typecheck, and build pass; owner-viewport visual acceptance is `UX-11B`.

`UX-10` makes OBS channel names 16px and inline in Column and Layer views,
keeps the 240px Column minimum, and lets the Layer track and shared playhead
span every channel. `SESSION` is now `BẢN GHI`, with one take explained as
one footage. The app's OBS channel lists use the outer panel scroll; Recorder
rows always show REC at the start, blink only during confirmed capture, and
show PAUSE with a pause symbol when paused. Frontend tests, typecheck, and
build pass; owner-viewport and real OBS visual acceptance remains `UX-10B`.

`UX-09` aligns OBS LiveLink Timeline controls with the normal Timeline:
Column/Layer sits immediately before Mark In, the separate layout row is
gone, zoom uses the same control order and sizing, and transport uses the
same play button and timecode format. In Layer view, vertical Gain/Level
labels leave full-height controls below each channel name. In Column view,
the width slider is replaced by a draggable, keyboard-operable column edge.
Frontend tests, typecheck, and build pass; real-browser comparison at the
owner's viewport remains open in `UX-09B`.

`UX-08` presents each completed OBS LiveLink recording as one Media Pool
footage backed by its multitrack MKA. Channel WAVs remain internal analysis
assets, linked durably to the MKA and recording ID. Selecting the footage
opens its recording-wide Timeline and Script feed. Existing projects recover
the association from their recording journals. Recycle, Restore, and permanent
Delete affect the parent and its channels together. Source and unit tests pass;
physical two-take OBS acceptance remains open in `UX-08B`.

`UX-07` integrates the OBS LiveLink draft into the Script module's primary
content area and keeps the original Script tools available. Its Timeline has
one recording-relative zoom, ruler/playhead, transport scrub, and shared
Mark In/Out, Cut, Delete, Uncut, and Reset for every archived channel. A
batch media-index write persists identical cut ranges on all channel assets;
source WAV/MKA is preserved. Layer Gain/Level now sit below the channel label
at the left, and column Gain/Level share the header row with the inline
channel/source name. Equal default column widths resize independently from
their column edges.
Component and API regression tests cover shared time and cut state. Real OBS
and browser layout acceptance remains open; see `UX-07B` in
`docs/WORK-ROUNDS.md`.

`UX-06` keeps the clarified OBS Stop policy (Ignore Stop continues app capture)
and closes the PCM/live STT tail at the actual Stop boundary. Its Timeline
layer lanes occupy 60% of the viewport with vertical Gain/Level columns; column
lanes put Gain/Level side by side below waveform/subtitle and have independent
width controls. Frontend 381 tests, backend 441 tests, typecheck, web build and
native OBS plugin build pass. Real OBS and browser layout acceptance remains
`UX-06B` in `docs/WORK-ROUNDS.md`.

`UX-05` repairs Recycle Bin permanent batch deletion, Empty Bin, and stale
footage rows after an older list response; it restores the full Script editor
while showing OBS LiveLink rows. The remaining Sound Library bulk callbacks
are wired, Voice Changer recordings can be deleted in a group, and OBS session
tracks can queue Final STT as a group. Frontend 378 tests, typecheck and build
pass; backend 440 tests pass. Physical browser/real-media acceptance is queued
as `UX-05B` in `docs/WORK-ROUNDS.md`.

`UX-03` extends Shift range, Ctrl/Cmd toggle and Ctrl/Cmd+A selection with
appropriate batch actions across the primary editable lists: Voice Output,
Sound Library profiles/voices, Script rows, Project Hub, Speaker Isolation,
Training History, authored training passages, and Media Pool Recycle Bin.
`UX-04` fixes repeated PCM viewport requests caused by comparing a grouped API
response's point count with the requested density. Frontend 369 tests,
typecheck and build pass; backend 439 tests pass. Physical browser playback
remains unverified. The specialized OBS capture track Final STT list is the
next selection gap; see `UX-05` in `docs/WORK-ROUNDS.md`. Final `LIVELINK-08`
acceptance remains open.

## OBS LiveLink execution plan — 2026-09-28

The owner has deferred hands-on acceptance until Record state, a live waveform
for each forwarded channel, and automatic per-channel live transcription are
visible together. `LIVELINK-08` remains the final integration gate. The next
product round is final `LIVELINK-08` in `docs/WORK-ROUNDS.md`. The planning revision itself changed
execution order only; it did not provide physical acceptance.

`LIVELINK-08J` delivers an OBS-themed native dialog with a P4B/Pro4Bro header,
theme-aware panels, meters and controls, DPI-aware layout, and a vector brand
asset in plugin package 0.6.0. On development OBS 32.2.2 the installed package
loaded; dark/light and 1/5/20-source dialog screenshots were captured at 100%
DPI, Forward/alias persisted in a disposable collection, and Install/Repair
reported `installed` with pairing retained. QA scene/config changes were
restored. Actual 125%/150% DPI, the full simultaneous recording/STT matrix,
and the second Windows machine remain final `LIVELINK-08` gates.

`LIVELINK-08A` is complete on development OBS 32.2.2. Its API repair keeps
unsigned Matroska TrackUIDs out of the plugin's hello/heartbeat JSON while
retaining them in app status and project journals. The installed native plugin
now detaches source callbacks on scene collection change/exit. Three consecutive
physical OBS Start/Stop sessions each produced durable PCM, a ready MKA and a
matching MKV; the collection switch back to the owner's `Untitled` completed
without a retained-source warning or new crash. This run forwarded one Mic
channel; visible per-channel Record, waveform, live transcript and wider source
matrix remain in `08B`–`08J` and final `LIVELINK-08`. An earlier OBS access
violation exists in Windows events, but no available stack trace attributes it
definitively to this plugin.

`LIVELINK-08B` adds per-channel app capture evidence to v3 status/SSE:
recording owner, durable PCM count/sequence/sample high-water, last receipt,
gap metrics, and pending/receiving/stalled/paused/disabled/missing/disconnected
states. A project-owned checkpoint plus tail replay recovers these after an
API restart. Tests distinguish OBS Record and Forward ACK from actual silent
PCM persisted by the app. Backend 433 tests, frontend 307 tests, typecheck,
and build pass. Its capture evidence feeds the Recorder display completed in
`LIVELINK-08C`; the final integration gate remains open.

`LIVELINK-08C` is complete at the UI/component and development OBS gate.
Recorder has Record/Stop/Pause/Resume controls and 28 px channel rows. A red
pulsing `REC` means that the current app recording/project has persisted PCM;
all other states use a static gray dot, with separate labels and a reduced-
motion fallback. Frontend 318 tests, typecheck and build pass. In live OBS,
Start changed the app button to Stop; four channels received PCM and showed
red `REC`, while a fifth channel without PCM showed gray `PCM stalled`.
Stop returned every channel to gray Idle. Ignore Start kept the app idle and
every channel gray while OBS recorded; the policy was restored. UI screenshots
at 1600 and 1100 px are in `.scratch/`. Waveforms, automatic per-channel
transcription and the final LIVELINK-08 acceptance remain open.

`LIVELINK-08D` is complete at API/feed and real-MKA artifact level. Durable
PCM produces a 50 ms extrema sidecar per recording/channel/chunk before ACK;
the web receives bounded waveform snapshots keyed by recording-relative frame
and source sample range. Status SSE watermarks drive per-channel updates, with
a polling fallback and 32-chunk cursor. A stopped archive can rebuild portable
10-second envelope blocks from its MKA tracks. Backend 435 tests, frontend
320 tests, typecheck and build pass. A physical four-track OBS MKA gave exact
one-second peak matches between decoded PCM and its four envelopes. The
development API was restarted on port 18120, OBS reconnected, and the live
HTTP route returned the expected physical MKA channel envelope. Its Timeline
consumer is now delivered in 08E; transcription and final multi-channel
acceptance remain open.

`LIVELINK-08E` is complete at the UI and physical OBS gate. OBS LiveLink has
one live waveform lane per forwarded channel with a common ruler/playhead;
received silence, missing PCM, pauses, channel intervals and archive gaps are
distinguishable. Stopped MKA child tracks reopen with channel/source labels
and independent WAV playback/seek. Frontend 323 tests, backend 435 tests,
typecheck and build pass. App Record and physical OBS Start/Stop produced two
four-track MKA sessions; the latter also produced an MKV. Its Channel 2/3
archive peaks were 3091/1708 at 48 kHz and rendered as distinct lanes.
Evidence is in `.scratch/livelink08e-real-check.json`. Layout switching and
per-channel gain/level are delivered in 08F; live transcription and final owner
acceptance remain open.

`LIVELINK-08F` is complete at UI and reopened four-track OBS archive level.
The CỘT/LAYER switch precedes MARK IN; horizontal columns and vertical layers
keep channel gain, selected track and playhead while zooming/scrolling. Each
source has a horizontal preview gain and independent unmodified source level;
Web Audio applies 0–200% gain only to WAV playback in Pro4Bro. The 32 px layer
waveform is 62% of the earlier 52 px height. Frontend 330 tests, typecheck and
build pass;
component coverage includes 1/2/5/20 channels. The physical four-track MKA
reopened at 1280×720 and 900×720 with visible per-column controls and working
horizontal/vertical scrolling. A physical 20-source performance run, live STT,
overlap review and final owner acceptance remain open.

`LIVELINK-08G` is complete at API and real-recognizer fixture level. New
durable PCM chunks automatically enter separate bounded live STT queues per
recording/channel. Project-owned revisioned transcript events expose source
sample bounds, OBS-clock recording-relative seconds, partial/final/error,
lag, alias and segment-level timing trust through a reconnectable API.
Backend 438 tests pass. A 14.82-second spoken
fixture produced nine events on each of two channels using the running Studio
model, including partial and final text. The model repeated a phrase in its
draft, so these events cannot yet be treated as verified subtitles. Physical OBS simultaneous speech and
owner-visible integrated acceptance remain in the final LIVELINK-08 gate.

`LIVELINK-08H` is complete at UI and archived OBS fixture level. A first voiced
chunk emits an immediate `listening` event; the Script feed merges partial/final
revisions in place and orders source-owned rows by start time. Clicking a row
selects that channel and seeks its OBS Timeline. Both Layer and Cột show a
caption and utterance span per channel. Frontend 335 tests, backend 438 tests,
typecheck and build pass. In the running app, a temporary A→B→A transcript
journal on an existing four-track archive showed three ordered Script rows;
seeking B to 00:02 displayed A and B captions simultaneously. The fixture was
removed and the managed workloads restarted. Overlap coloring and replay
markers were delivered in 08I; physical OBS simultaneous speech and end-to-end
latency remain in final LIVELINK-08 acceptance.

`LIVELINK-08I` is complete at UI and archived four-track OBS preview level.
Cross-channel segment intersections create review markers on both Script rows
and Timeline lanes; draft text is red while the playhead is inside the shared
time and returns to normal at its end. Marker playback selects the right WAV
stem and stops at the overlap end. Frontend 343 tests, backend 438 tests,
typecheck and build pass. A temporary A→B→A journal on a physical OBS archive
showed two 00:02.00–00:05.00 markers; Channel 2 preview played from 2.00 to
5.00 and a Channel 1 marker selected its own WAV. The fixture was removed and
managed workloads restarted. Segment timing cannot locate individual words;
same-channel speaker overlap remains unassigned without evidence. Physical
simultaneous OBS speech and latency remain in final LIVELINK-08 acceptance.

## OBS LiveLink addendum — 2026-09-27

LIVELINK-01 froze the v3 domain/protocol but has no live v3 route yet.
LIVELINK-02 added the OBS plugin package, hash-checked standard/portable
installer, local API and Preferences controls. The installer is covered by
eight unit/API/CLI tests and Preferences by two component tests. LIVELINK-03
added a native Tools dialog, Open App, per-user authenticated hello/heartbeat
and a single-owner project lease. The development OBS 32.2.2 process loaded
the new DLL from the build folder and showed Connected/project status; Open
App brought up both local ports. Installed-package/UAC and clean-machine
acceptance remain open. LIVELINK-04
now adds local source strips, meter, forward choice, unique alias and persisted
mapping in the native dialog. Five strips matched the development OBS Mixer,
and a real Desktop Audio tone moved its meter. Live source-change/20-source
acceptance remains open. LIVELINK-05 now synchronizes the five channels,
meters and Forward selection through authenticated v3 hello/heartbeat,
long-poll commands and applied ACKs. The app shows an SSE-backed mixer;
real OBS Idle toggles ACKed in 226/230 ms, and API restart recovered a new
epoch without crashing OBS. V3 audio recording and recording-time intervals
began in LIVELINK-06. The Recorder now has a separate OBS capture controller,
manual app actions and persisted Ignore trigger selections. The native v3
bridge uploads durable per-source PCM chunks and produces project-owned
recording journals and transitional Media Pool WAV stems after Stop. Real
development OBS runs verified two independent source stems and a recording-time
`user-disabled` sample interval. Reducer tests cover the OBS trigger matrix;
physical OBS Start/Pause/Resume/Stop with Ignore combinations and two video
spans still need end-to-end acceptance. LIVELINK-07A now verifies one audio-only
MKA parent per app recording, independent FLAC or PCM source tracks, embedded
mapping/clock/gap attachment, child track references and per-track 24 kHz
analysis WAVs. A prior real two-source OBS session was rebuilt from its retained
chunks via the retry API; a five-source physical OBS run remains open. MKV
handoff is implemented in L7B; installed-package and clean-machine checks
remain L8.

LIVELINK-07B adds the Recorder's Connect to OBS recording folder switch,
machine-local exact recording locators keyed by video span, latest-file fallback,
and Import/Browse actions. OBS Stop sends the last recording path with its span;
the API blocks active spans/recording, waits for a stable file, checks video
content and SHA-256, copies it into project media, and records a relative asset
reference and provenance hash. Repeat import of a linked span returns the
existing asset. Runtime and UI tests cover two spans under one app recording
and ensure absolute source paths do not enter the project journal. The full
physical OBS import/move-reconnect acceptance remains open for LIVELINK-08.

The older verification baseline below describes the 2026-09-22 product snapshot.

This snapshot compares the written plans with repository evidence. “Complete”
means the planned contract has evidence; “implemented slice” means useful code
exists but the whole contract or end-to-end acceptance gate is still open.

## Verification Baseline

| Gate | Result | Meaning |
| --- | --- | --- |
| Backend | 364 passed | Current Python contracts are green; this is not a real-model quality measurement. |
| Frontend | 288 passed | Current UI/domain behavior is green under Vitest. |
| Production build | Passed | TypeScript and Vite can produce the browser bundle. |
| Diff hygiene | `git diff --check` passed | No whitespace/error-marker defect in the pending diff. |
| Upstream boundary | `engines/OmniVoice` clean | Product work has not modified read-only upstream source. |

## Plan Versus Reality

| Plan | Written intention | Repository reality | Status |
| --- | --- | --- | --- |
| 01-01 | Portable shell, persistence, modules, upstream adapter | Delivered and covered by project/module/portability tests | Complete |
| 02-01 + stabilization | Capture/import, finalized STT, Media Pool, Script/Timeline, timing, diarization | Delivered; timing trust and runtime/storage stabilization are real | Plan complete; Phase 02 still open |
| 03-01 | Catalog, profiles, annotations, Train UI | Delivered | Complete |
| 03-02 | Selected deterministic Dataset Manifest and supplied-script validation | Compiler, validator, portability, readiness, exporter inputs, and tests exist | Complete |
| 03-03 | Real run lifecycle ending in a gated Voice Model Set | Runtime/run/process/GPU/progress/cancel/resume, portable lineage, and a fail-closed two-backend identity gate exist | In progress |
| 03-04 | Durable guided capture, QC, tiering, reference harvesting, identity lock | Packs, capture tier, HQ Recorder, teleprompter, and read-along exist mostly in UI memory | In progress |
| 04-01 | Six-zone dock plus `WorkspaceSession` | Fixed page manifests and Dashboard exist; no dock state/migration/session ownership | Planned |
| 05-01 | Evaluate and ship file/live Voice Changer only after Vietnamese gate | RVC/Applio, consent, live device stream, recording, and first gate exist | In progress; gate incomplete/failing |
| 06-01 | LipSync page, engine adapter, jobs, QC | No product implementation found | Planned |
| 07-01 | Define model/security seams only | Models, ports, and glossary split exist; intentionally no adapters | Complete |
| Phase 07 release | Install/download/verify models, secure credentials, package/update app | Training descriptors exist, but release infrastructure does not | Not started |

## Completed Capabilities And Why They Matter

| Capability | Evidence boundary | Product meaning |
| --- | --- | --- |
| Portable project aggregate | Relative manifests/media paths and move/reconnect tests | A project can move without baking one workstation's drive path into its data. |
| Runtime lifecycle stabilization | Controller/job ownership, restart, storage/polling fixes | New code can be loaded without rebooting and background processes do not silently outlive their owner. |
| Finalized local STT | Import/record queue, Faster-Whisper timing, Script/Timeline persistence | Audio becomes editable, replayable project knowledge rather than a transient transcript. |
| Word timing trust | Per-word trust, warnings, subtitle exclusion | Bad timestamps stay reviewable but cannot silently corrupt timed exports. |
| Speaker diarization | Queue, progress sidecar, reviewed label assignment | The app can answer “who spoke when” without pretending it isolated voices. |
| Training Catalog and attribution | Speaker/environment profiles and file/word annotations | Training data has an explicit human identity and emotion owner. |
| Dataset compiler and validation | Deterministic manifests, script validation, portability tests | A training run consumes a frozen, reproducible input rather than whatever happens to be selected later. |
| Training execution foundation | Run journal, engine export, process parsing, GPU lease, cancel/resume | Long GPU work is observable, recoverable, and less likely to collide with STT/diarization. |
| Multiple training/generation adapters | OmniVoice, VibeVoice, RVC descriptors/adapters/tests | The application has real engine seams instead of one hard-coded training path. |
| Individual project voices | `ProjectVoice` store, reference, model/adapter paths, generation tests | A single cloned/trained/converted voice can be selected and used today. |
| Voice Model Set persistence and lineage | Project-relative set records, API, cleanup, manifest/config/engine/source-run lineage | Publication candidates are grouped reproducibly and cannot be mistaken for identity-approved sets. |
| Speaker identity gate contract | `SpeakerEmbedder` port, cached Community-1 and dedicated WeSpeaker adapters, frozen protocol, evidence, preference, API, pass/reject/fail-closed tests | A Model Set cannot become published without complete, model-revision-specific speaker evidence. |
| Voice Output and Script generation | Project output store and generation/UI tests | Generated speech returns as a managed project artifact instead of an engine-side file. |
| HQ reading front end | Reading packs, capture tier, Recorder mode, teleprompter/read-along tests | The user can begin guided capture with known text and structured coverage. |
| Voice Changer live slice | Consent, RVC training, device preflight, native stream/recording | Real microphone-to-device conversion exists behind product-owned adapters. |
| Dashboard and activity stream | Project overview, pipeline readiness, unified activity tests | Users can see what the workstation is doing and what can run next. |
| Model/security architecture seams | Phase 07 domain models and ports | Future distribution/security work has boundaries and cannot be “completed” by a fake always-success adapter. |

## Missing Capabilities And Why They Matter

| Missing part | Exact gap | Why it matters |
| --- | --- | --- |
| Per-word candidate reconciliation | Realtime/accurate/AI/user variants are not fully merged and confirmed per word | Users cannot resolve competing transcript sources at the smallest reviewable unit. |
| Calibrated speaker threshold | Gate and provisional thresholds exist, but no positive/negative Vietnamese trial set has selected an operating point | A generic score boundary cannot yet justify accepting a real speaker identity. |
| Real 03-03 acceptance run | No recorded consented manifest-to-checkpoint-to-gated-publish evidence | Unit tests prove orchestration contracts, not that the whole local model stack produces a usable artifact. |
| Durable Reading Session | Current session state is largely frontend memory | Closing/restarting the app can lose guided-reading progress and provenance. |
| Capture Check and post-take QC | No persisted noise/level/clipping preflight or accept/review/retake pipeline | “HQ” currently describes the workflow, not measured recording quality. |
| Block finalization and reference harvesting | Accepted cards are not finalized into per-emotion block assets/references | Hundreds of takes remain awkward training inputs and identity anchors are not reproducibly harvested. |
| Tier policy | No `HQ only`/`HQ + clean`/`All selected` compiler policy with noise warning | Mixing channels/noise floors can train the model toward recording conditions instead of the speaker. |
| Dockable workspace | No six-zone schema, migration, accessible drag/resize, or `WorkspaceSession` | Moving a panel could otherwise restart/lose active recording, playback, or jobs. |
| Voice Changer gate completion | Cross-speaker CER fails; similarity, cross-gender, loopback latency, owner A/B absent | Fast output is not enough if Vietnamese words change or the target identity is unproven. |
| File-conversion workflow | Live conversion exists, but the planned persisted file job/lineage acceptance is incomplete | Offline converted audio needs reproducible inputs, parameters, output, and next-step routing. |
| Isolation, dubbing, Voice Patch | Honest placeholders/partial surfaces, no complete processors | These are core Manipulator promises and must return verifiable artifacts before being called available. |
| LipSync | Plan only | The fourth production workflow cannot yet render or QC video derivatives. |
| Model delivery | No download/hash/update/disk-management adapters | A clean workstation cannot reliably acquire the same runtimes and weights. |
| Security enforcement | Secrets remain outside the planned DPAPI store; no auth/authorization adapters | Remote or multi-user use would expose credentials and actions without enforceable identity. |
| Desktop release | No installer, signing, updater, rollback, or offline acceptance | The product remains a development checkout rather than a supportable desktop application. |

## Domain Decision

`ProjectVoice` is retained as the implementation record for one **Voice Model**.
It does not replace a **Voice Model Set**. The set is a later aggregate over
compatible Voice Models plus anchor, lineage, and identity-gate evidence. See
ADR 0011. This preserves all current APIs while keeping plans 03-03/03-04 honest.

## Recommended Execution Order

1. Calibrate the chosen `SpeakerEmbedder` and complete one real gated publish; persistence, lineage, and gate enforcement are now complete.
2. Finish or explicitly defer the durable 03-04 capture/QC/finalization slice.
3. Complete the Voice Changer measurement gate; do not broaden engine adoption while it fails.
4. Build Phase 04 `WorkspaceSession` before expanding live processors.
5. Continue remaining Manipulator processors, LipSync, then desktop/security delivery.
