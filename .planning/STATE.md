---
current_phase: 3
current_phase_name: Voice Training
total_phases: 7
current_plan: 3
total_plans_in_phase: 4
status: In progress
progress: 60%
last_activity: 2026-10-25 — Closure check passed all1626 API tests; native UI acceptance remains blocked by effective browser permission.
last_activity_desc: Browser enabled in owner screenshots but CUA still refuses before URL after reset. Four-turn/twelve-layer fixture ready and sources unchanged. Frontend1341/build233 unchanged; Phase03 stays60%, Phase06 open.
---

# Project State

## Closure check — legacy turns and Script/Timeline UI (2026-10-25)

Verified the two latest rounds without advancing product scope. The full API
rerun passes1626 tests (three existing warnings,892.83s), including embedded
VibeVoice checkout import under its unchanged60s deadline. Four isolated runs
also pass. No speculative source/runtime fix, timeout increase or skipped case;
the earlier intermittent import delay has not been root-caused.

Native browser acceptance is still blocked. The owner confirmed enabling Browser
and supplied Settings screenshots. The tool still reports Local browser disabled
in Work settings before opening a URL, including after a CUA kernel reset and
fresh inventory. The enabled screenshot and effective tool permission disagree;
no native selection/clipboard/IME/undo/sticky-geometry result is claimed. An
isolated4-turn/12-layer fixture is ready;22 WAV and22 output JSON hashes unchanged,
mono PCM16/24kHz. The owned server was stopped. A client restart is the next
recovery step to try. See `docs/gates/vm-script-two-round-closure-20261025.md`.
Frontend's existing1341/167 files and typecheck/build233 remain valid on unchanged
source. Phase03 stays60%, Phase06 open; the two rounds are not both fully accepted
until actual browser verification succeeds.

## VM-SCRIPT-TEXT-FREEZE-01 — Text columns and common Timeline scrolling (2026-10-25)

Script text view separates speaker names and dialogue into aligned columns.
Dialogue-only native selections serialize without speaker labels; cross-column
selections include names in turn order. Multiline text, blank lines, stable IDs,
external updates/caret and Find/Replace retain row boundaries. Cross-turn copy is
allowed; destructive cross-turn edits and text drops are guarded.

Master, subtitles and layers now share one vertical viewport. The one top ruler
stays visible; subtitles freeze beneath it after Master scrolls away. Sticky
strips/layers share the waveform zoom/pan/playhead; navigator/transport remain
below the viewport. Direct transfers reject hidden/outside targets and keep
source/timeline coordinates locked.

Frontend167 files/1341 tests, focused Script37 and Timeline79, typecheck/build233
pass. Browser verification is still open: Work settings refused local browser use
before a tab opened. Native selection/clipboard, IME/undo and sticky geometry in
both themes are unverified. The owned temporary server was stopped; no owner
project/media/model changed. ADR0146, `docs/VM-SCRIPT-TEXT-FREEZE-PLAN.md` and
`docs/gates/vm-script-text-freeze-01-20261025.md` hold the contract/evidence.
Prior full API1625 pass/one existing VibeVoice timeout remains recorded; this UI
round changes no backend. Phase03 stays60%, Phase06 open. Stop this bounded round.

## VM-LEGACY-SCRIPT-TURNS-01 — Legacy rows become multiline speaker turns (2026-10-25)

Old projects group adjacent rows with matching explicit speaker/voice/settings
once, preserving original text as lines inside a cell. Alt+Enter stays in that
cell; later manually added rows survive reopen. Stable source aliases preserve
current/generated/Full snapshots and repeated Fix timing. Backups retain old
Script/book documents; immutable audio/output sources are unchanged.

Frontend164 files/1324 tests, typecheck/build229 and focused API26 pass. Full API
1625 pass/one unchanged VibeVoice60s import timeout (three existing warnings),
so that gate remains open. Browser dark/light verifies migration, Alt+Enter,
manual row persistence and preserved Fix feedback;22 WAV and22 output JSON
hashes unchanged. ADR0145, `docs/VM-LEGACY-SCRIPT-TURNS-PLAN.md` and
`docs/gates/vm-legacy-script-turns-01-20261025.md` record guarded boundaries and
evidence. Phase03 stays60%, Phase06 open; real-model listening remains open.

## VM-TIMELINE-DIRECT-EDIT-01 — Direct clip editing and literal Script rows (2026-10-25)

Removed the bottom clip form; the top Timeline toolbar now cuts/uncuts/deletes,
resets to the latest successful Full/Fix arrangement and transfers clips between
layers. Native vertical drag has capture/cancellation and edge scrolling;
timeline/source geometry remains locked. Taller Master, visible vertical layer
scroll and shared horizontal navigation use the existing synchronized viewport.
Script Enter/paste/speaker-looking labels stay literal in the current row.
Automatic transcript rows follow diarized/manual/Profile speaker turns.

Full frontend1315/164 files, final focused53, typecheck/build229 pass. Focused
API56 pass. Full API1615 pass/one unchanged VibeVoice60s import timeout; isolated
retry also fails, so that gate remains open. Real synthetic PCM proves Cut/Uncut
equality, Delete/Reset behavior, locked transfers and unchanged source hashes.
Browser dark/light, native paste/Enter and10-layer scrolling verified. ADR0144,
`docs/VM-TIMELINE-DIRECT-EDIT-PLAN.md` and
`docs/gates/vm-timeline-direct-edit-01-20261025.md` record scope/evidence.
Real-model listening remains open. Phase03 stays60%, Phase06 open. Stop this
bounded round.

## VM-SCRIPT-LAYER-UX-01 — Script Fix feedback and synchronized layers (2026-10-24)

Implemented the approved UI: progress in the right column; direct Speaker switch/
unassign; checkbox-only bulk actions; persistent pending/fixed highlights and safe
Fix publication with concurrent edits. Master, subtitles and upper-half clip
waveforms share zoom/scroll/playhead, with one top ruler and bottom navigation.
Layer Mute/Solo drive the actual compositor; transfers preserve locked timecodes.

Final frontend1307/typecheck/build228 and focused API55 pass. Full API1607 pass /
one existing VibeVoice60s import timeout; the exact test alone passes20.36s.
Browser dark/light and isolated monoPCM16/24kHz artifacts verify disjoint Fixes,
Solo, preserved source hashes and Full+Fix export. Legacy Fix marks require the
new saved Full baseline; uncertain timing retains row fallback. ADR0143 and
`docs/gates/vm-script-layer-ux-01-20261024.md` hold evidence. Phase03 stays60%,
Phase06 open. Stop this bounded round.


## OUTPUT-LIFECYCLE-01 — Shared output recovery and Training Queue (2026-10-24)

Training Queue now reconciles real Run state/progress instead of trusting stale
Done receipts, with resumed attempts grouped under History. Voice Output and
LipSync have Session/Version Export/Delete symbols, complete recoverable slot
snapshots, Restore/permanent delete/Empty Bin and owned-artifact ZIP exports.
Shared action/bin UI also serves Media Pool; lifecycle and artifact policies are
reusable while format adapters guard jobs, references and immutable sources.

Full frontend1286 and final integration167 pass; typecheck/build226 pass. Full backend
1606 passes/3 existing warnings; final backend28 passes. Isolated HTTP/PCM/ZIP checks prove active progress,
Script/WAV recovery, output-picker exclusion and LipSync restoration. Live browser
UAT is unavailable because local browser use is disabled in Work settings. No owner
project/media/model/runtime was changed. ADR0142, `docs/OUTPUT-LIFECYCLE.md` and
`docs/gates/output-lifecycle-01-20261024.md` hold the contract/evidence. Phase03
stays60%, Phase06 open. Stop this bounded round.

## VM-VERSION-LAYERS-01 — Version state and local audio layers (2026-10-24)

Approved Version ownership, Full replacement and local Fix layering are wired.
Sessions expand into Version tracks; New Version copies Script/config/subtitles
and audio independently. Layer edits and bottom-wins playback/export persist;
existing external processors explicitly adopt finished outputs. Browser fixture
proves restore, mute/trim, both themes, restart and exact exported WAV. Full
frontend1277, final173/Patch70 and build224 pass. Backend1590 pass/1 existing
VibeVoice import timeout; isolated retry2 passes, final focused53 passes. The
real-model listening gate remains open; structural Script changes require Full.
See ADR0141 and the round gate. Phase03 stays60%, Phase06 open; stop round.

## VM-OUTPUT-SESSIONS-01 — Voice Output Sessions and themed engine picker (2026-10-24)

Project-owned Session/Version grouping adopts existing Voice Outputs and copies
selected WAV/edit history into independent Version artifacts. New Session waits
for the next generated output. Engine dropdown uses themed, viewport-aware
options. Full frontend1263, backend1545, final focused22/3, typecheck/build217
pass. Script remains project-wide; browser/audio UAT remains open. ADR0140 and
the round gate record evidence. Phase03 stays60%, Phase06 open; stop round.

## PROJECT-QUEUE-01 — persistent project Queue (2026-10-23)

Implemented the approved footage mockup: Import/STT/alignment/diarization share
one footage slot with equal-weight measured progress, unknown propagation and
track detail. Other task families have separate tabs, expandable children,
gray Done and explicit attention states. Status opens Queue; project-owned
atomic history survives reopen/restart, detects reused PIDs and retains attempts.
Batch import reservations are atomic and visible before upload. Existing workers
report real stages/counters; alignment still requires explicit Preview/Apply.

Full frontend1262 passes; final changed cases26, typecheck/build217 pass.
Full backend1535 passes/1 existing VibeVoice60s import timeout; isolated unchanged
case passes48.39s. Final core23, processors60, OBS33 and recovery34 pass; import/
MKV46 plus retry1 pass. Real WAV import/export, paced upload/pending/Done, API
restart and real EasyAligner25/25 progress sidecar verify. No owner edits or gate
relaxation. See `docs/gates/project-queue-01-20261023.md`, `docs/PROJECT-QUEUE.md`
and ADR0139. Stop this bounded round; Phase03 stays60%, Phase06 remains open.


## SUBTITLE-ACTIONS-01 — visible preview/apply controls (2026-10-23)

The previous labels and placement obscured the expected actions, and no eligible
track hid them entirely. Ghost Preview and Apply Aligner now stay visible above
the parameters with disabled-state guidance. Frontend16/backend42, typecheck,
build214 and isolated browser preview/apply/restore checks pass; no owner Project
or model run. Gate: `docs/gates/subtitle-actions-01-20261023.md`.
Stop this bounded correction; Phase03 stays60%, Phase06 remains open.

### Configuration follow-up — EasyAligner default (2026-10-23)

At the owner's explicit request, subtitle refinement now opens with EasyAligner
selected: Vietnamese, Window 30 s, Padding 1 s, maximum movement 2000 ms and no
extra methods. UI/API/worker defaults agree; MFA and stable-ts remain selectable.
Focused frontend 8 and backend 42 checks pass, typecheck/build pass, and an isolated
browser rendering confirms the default controls. This configuration update does
not advance a product round or phase; manual locks and explicit Preview/Apply remain.

## SUBTITLE-BENCHMARK-02 — Conviction timing comparison (2026-10-23)

Completed 17 CPU parameter configurations plus 3 corrected-text replays against
680 eligible manual timings: 587 unique STT anchors, with 427 calibration and
156 reserved anchors. EasyAligner Vietnamese / window 30 s / padding 1 s /
move limit 2000 ms is the strongest review preview. Reserved both-edge agreement
within 100 ms is 65.38% versus 13.46%; severe errors fall from 30 to 7 and duration
MAE from 171.7 ms to 98.3 ms. A common +133.8 ms shift on original STT gives 47.44%
with no overlaps. Separate Easy offsets reach 71.79% but create 169 overlaps;
no engine option passes the no-new-overlap gate. Selected stable-ts has zero raw
reserved measurements; MFA rejects 86 unknown labels. Corrected Easy diagnostics
have a documented crop-context confound. No owner edits, defaults or training.
Focused 59 tests pass; source/model/worker/selection hashes and 5,490 CSV rows verify.
See `docs/gates/subtitle-benchmark-02-20261023.md` and the research report/JSON.
Unknown/group abstention, neighbour conflicts and a second recording remain open.
Stop this named bounded round; Phase03 stays 60% and Phase06 remains open.

## SUBTITLE-ENGINES-01 — selectable subtitle alignment (2026-10-23)

Input now offers MFA, stable-ts and EasyAligner with separate parameters and
explicit Start → Ghost Preview → Apply/Restore. Manual timing stays locked;
unknown/over-limit boundaries stay put and collisions remain visible. All three
CPU workers aligned25/25 words in a real8s Vietnamese fixture; all three also
produced real UI ghosts. Apply/Restore preserved the source audio and restored
exact text/words. Final related API103 and frontend9 pass; typecheck/build pass.
Full snapshots remain non-green:API1454 pass/6 timing failures (isolated5 pass,
VibeVoice60s import still fails); frontend1229 pass/1 CSS5s timeout (focused case
passes). No gate was weakened. See `docs/gates/subtitle-engines-01-20261023.md`,
`docs/SUBTITLE-ALIGNMENT-ENGINES.md` and ADR0137. Private runtimes/models are local;
no portable release or accuracy benchmark is claimed. This named bounded round
is independent of expressive rounds92–96; their status/phase progress is retained.

## Rounds92–96 — EXPRESSIVE-RUNTIME-AND-VARIANT-PREVIEW (2026-10-23)

Owner requested five further rounds in one invocation; stop96. Implementation
and real-artifact verification for the bounded slices are complete:

| Round | Delivered evidence |
|---|---|
|92|Three private embedded Python profiles, pinned requirements/sources/models, isolated imports and successful installation receipts.|
|93|Real F5 EN3.605s and ViVoice VI2.475s through product workers.|
|94|Real Index2.5 sad vector4.191s and happy text3.193s; native logs confirm both emotion paths.|
|95|Real Fish S2 Pro EN whisper3.065s with pinned codec; Vietnamese Fish remains untested.|
|96|Read-only multi-variant API preview with reviewed effort labels, shared neutral anchor/config and train/dev leakage blockers.|

Real WAV review also exposed and fixed direct Voice Output publication: retain
native audio/provenance, create mono PCM16/24k editable audio and derive actual
metadata. Five retained real-media fixtures pass edit/render HTTP200 with source
hashes unchanged. Truncated/inconsistent WAV and failure/cancellation regressions
are covered. ADR0138 complements preview ADR0136.

Final frontend1230/151files, typecheck/build214 pass. Final related API175/2
existing warnings/22.74s pass. Full API snapshot1411 pass/1 pre-existing VibeVoice
60s import timeout remains non-green. No timeout/test gate was weakened.

Managed controller/API/Studio are healthy and live preview passes. Resolved
catalog snapshot has F5/ViVoice/Index available; Fish import still exceeds45s on
this HDD despite its real worker WAV. Cold readiness reliability remains open
(F5 also timed out in an earlier snapshot). Browser UAT is blocked by disabled
local browser access. Index samples hit full scale; listening,72-sentence quality
benchmark and Fish VI remain open. New deep trainers/scheduler are not enabled;
preview is always non-executable. No portable release or owner training.
Gate: `docs/gates/expressive-engines92-96-20261022.md`. Phase03 stays60%, Phase06
open. Next: cold-readiness diagnosis, acoustic acceptance, persistent reviewed
effort/base lineage, then verified multi-LoRA scheduling and native trainers.

## Rounds87–91 — EXPRESSIVE-ENGINE-CONNECTIONS (2026-10-22)

Owner explicitly requested the first five integration rounds in one invocation.
87 pins/clones EasyVoice, F5-TTS, IndexTTS and FishSpeech with on-demand model
receipts;88 adds reference/train/generate choices and isolated parameter forms;
89 connects F5 v1/ViVoice;90 connects IndexTTS2.5 emotion/relative duration;
91 connects Fish S2 Pro tags/sampling/codec and verifies the integrated seams.
EasyVoice is workflow context; product workers call F5 directly. OmniVoice's
existing LoRA/full trainer remains; upstream is read-only. New deep trainers are
visible but blocked. No new model weights/private runtime or pretrained acoustic
benchmark was performed; missing assets correctly block Generate. Multi-state
LoRA scheduling/publication remains subsequent work, not a completed trainer.

Frontend full1223/150 files before final labels/speed correction; final related
116/6 files, typecheck/build213 pass. API final related42 plus catalog32 pass (overlap); full1372 pass/1 VibeVoice
embedded-import timeout/3 warnings/662.71s. That same import test passes alone in
35.26s with the unchanged60s limit; full suite is not green. Updater process
containment from84 is fixed: exact owned-PID fence, sentinel and protected-source
checks; five focused cases pass68.84s and all pass in the full run. No test gate
or timeout was weakened. Read-only Fish API/source review has no open finding.

Cold generator metadata returns in23ms while readiness runs in the background;
UI polls pending states and strict job checks remain synchronous.
Managed idle stack restarted through its controller, healthy; seven generator
entries include the four new engines, installed=true/available=false with exact
missing receipt reasons. Browser checks use a separate scratch project. Gate
`docs/gates/expressive-engines87-91-20261022.md`, ADR0135 and the updated emotion/
delivery plan retain pins, commands, evidence and remaining gaps. Phase03 stays
60%, Phase06 open; stop91. Next: private runtime/model provisioning and real
identity/emotion/effort benchmark, followed by verified trainers and scheduling.


## Round86 — MEDIA-STORAGE-INPUT-01 (2026-10-22)

New imports/followed MKV use footage-named unique folders and prefixed source,
analysis, final audio and waveform/STT caches. Existing footage is not renamed,
as explicitly selected by the owner. Shared lookup preserves legacy directories,
relative paths, transcript/diarization/Patch evidence and checkpoint recovery.
Windows Reveal uses native Shell item selection with explicit failures and balanced
COM cleanup. Input STT/model/queue controls sit immediately below Recorder and
remain available across Library tab switches through the existing controller.

Frontend1221/150files, focused91, typecheck/build213 pass. Related API groups136,
55 and latest51, plus final track7, pass (groups overlap). Native Unicode Shell
item round-trip, real media/cache/move/final-tail and isolated mutation pass.
ADR0134 and `docs/gates/media-storage86-20261022.md` retain evidence/earlier failures.
The already-running idle stack was restarted through its controller; health JSON
and final served build pass. Browser/visible Explorer UAT and Round84 full-API
containment remain open. No existing-owner-footage rename, STT/model or portable
release change. Phase03 stays60%, Phase06 open; stop86.


## Round85 — MKV-IMPORT-REVIEW-01 (2026-10-22)

Native MKV/multitrack selection immediately opens the standard Import review,
retaining cache/link, track Import/STT and normal Import with MKV follow added.
Explicit confirmation, cancel/Escape/backdrop, focus wrapping and processing/no-
track guards are covered. Browser queue/native handoff remains. Source confirms
local faster-whisper tiny live preview; no model or backend/media changes.

Frontend1219/150files, focused135/latest69+2, typecheck/build213, related API32 and
isolated mutation pass. ADR0133/mkv-import85 gate retain earlier failures and
limits. Browser/device UAT and full-API containment remain open. Runtime ports
are stopped at closure; no restart for this UI round. Phase03 stays60%, Phase06
open; stop85.

## Round84 — GROWING-MKV-PLAYHEAD-01 (2026-10-22)

Fixed reproduced96→60s playhead rewind after dragging across growing MKV refresh.
Pointer/paused coordinates keep ownership; audition survives payload polling.
PCM path/duration revisions refresh media, restore held position before clock
updates and preserve ordinary primary/secondary playback. A scrub cancels pending
full Play activation. No shared scrubber/backend/media/persistence change.

Frontend1215/150files, focused77+16, typecheck/build212, real two-track MKV/WAV
queries and isolated mutation pass. API full1317 pass/1 portable isolation failure
is not green; the live source API stopped and the managed stack was recovered
through its canonical console. Do not repeat the live test until containment is
fixed. Browser/device UAT remains open. ADR0132 and mkv-playhead84 gate hold all
evidence/limits. Phase03 stays60%, Phase06 open; stop84.

## Round83 — GROWING-TIMELINE-FIT-01 (2026-10-22)

Full zoom-out now follows growing imported/OBS source extent through the existing
fit sentinel; manual zoom remains finite. OBS viewport grows beyond120s without
relaxing its120s/600-point waveform acquisition. Live clock progression survives
source-linked playhead suspension. Ordinary recording fit has new coverage.

Real browser MKV growth2.925625→24.0326667s retains slider0 through final import;
manual5.8513125s span stays unchanged across an append. Full final two-track PCM
and source hash checks pass. Frontend1209/150files, typecheck/build212, API1318/3
existing warnings and isolated mutation pass. ADR0131 and timeline-fit83 gate
retain initial failures and limitations. Managed app serves the current build;
no backend/media/default STT change. Phase03 stays60%, Phase06 open; stop83.

## Round82 — MKV-RECORDING-SLOTS-01 (2026-10-22)

Media Pool followed-MKV slots and tracks display red pulsing Import circles and
animated45-degree stripes until verified final-parent publication. All tracks
restore native checkbox appearance and saved choices together, independently of
STT. Existing refresh supplies the automatic transition. Static reduced-motion
cues, accessible descriptions and normal controls remain; ordinary/recycled
imports are excluded. Browser three-slot motion/automatic completion and full
two-track8.034125s media checks pass on an isolated fixture. ADR0130 and the
recording-slots82 gate retain validation/limits. Phase03 stays60%, Phase06 open;
no backend/default STT/portable change. Stop82.

Full frontend1203/150files, typecheck/build212, API1318/3 existing warnings pass.
Isolated state mutation killed; initial waiter/recheck evidence remains in gate.

## Round81 — INPUT-FEEDBACK-01 (2026-10-22)

Input timing now uses enable/collapse methods, editable IN/OUT and Timeline Ghost
Preview before one bulk Apply. Unchanged/manual coordinates stay exact; previewed
conflicts remain red/pulse, Restore/Undo and source fencing remain. OBS live drafts
persist; Capture Source owns OBS module/lease and survives remounts. Automatic
closed-MKV import includes the full tail, preserves drafts and queues no final
STT. Explicit STT uses the ordinary full-file track queue; late growing results
cannot overwrite it. Reproduced load/poll stalls have bounded reads and retry;
the earlier whole-app hang's exact cause is not established.

Frontend1201/150files, typecheck/build212, real browser Apply/Restore/visibility
and FFmpeg live-writer/two-track full PCM pass. API closure, metrics and failures:
input-feedback81 gate and ADR0129. Frozen common690 changes/4 conflict indexes,
paired medians64.3/54.2ms; vector21 changes experimental. Owner hashes equal.
Managed runtime healthy after idle reload. Physical OBS/device and held-out
acoustics remain open. Phase03 stays60%, Phase06 open; stop81.

## Round80 — INPUT-SUBTITLE-REFINEMENT-01 (2026-10-22)

Input right-column refinement exposes eight separately selectable methods and
read-only drift reports including manual words,250/500ms discrepancies and
unassessed coverage. Explicit vector mode produces21 real changed proposals on
the frozen source, all review. Common-offset640/692 preserves spans and reduces
paired IN/OUT medians to69.1/56.3ms. No learned universal calibration is claimed.

Current177/68 CTC suspicions versus reviewed18/1 support targeted audition while
retaining model uncertainty. Fresh owner-reviewed diagnosis keeps all words
unchanged. Source hashes and actual bulk apply/restore pass. ADR0128 and the
subtitle-refinement80 gate hold exact evidence. Full frontend1186/API1307 and
latest focused18/60, typecheck/build210 pass. Browser/device audition blocked by
Work settings; held-out quality remains open. Phase03 stays60%, Phase06 open;
no STT default/portable release change. Stop80.

## Round79 — SUBTITLE-ALIGNMENT-01 (2026-10-21)

Implemented Script subtitle proposals, explicit independent IN/OUT offsets,
measured common-offset prefill, automatic local group translations, PCM-vector
landmarks and duration/rate warnings. Before/after waveform and source audition,
review/edit/confirm, selected Apply, source-bound Restore and shared Undo/Redo
retain manual timing, labels and original media. Portable proposal/receipt
snapshots fence stale text/audio/cuts and interrupted writes. See ADR0127,
`docs/SUBTITLE-ALIGNMENT-PLAN.md` and `docs/gates/subtitle-alignment79-20261021.md`.

Real Conviction clone: strict automatic21/692 selected; coverage remains small.
Opt-in measured+116ms common-offset preview selects640/692; paired IN median
159.8→69.1ms, OUT111.8→56.3ms, no new>500ms errors. Spans stay unchanged. Actual
bulk apply/restore and moved-project reopen pass; owner source/reference hashes
remain equal. Vector corners support CTC anchors; direct corner snapping is
rejected because25/44 onset errors worsen. General acoustic acceptance stays open.

Full frontend1184/146files, typecheck/build208 and API1297/3existingwarnings pass;
latest focused backend50 passes after separating position correction from span
warnings. Final browser verification is pending: Work settings disabled browser
use during the fixture check. No visual/device-audio acceptance is claimed.
Phase03 stays60%, Phase06 open; no portable or STT default change. Stop79.

## Round78 — STT-CONVICTION-REFERENCE-01 (2026-10-21)

Conviction reference received:697 edited words,680 explicitly manual,581 unique
archived lexical pairs. Current CPU decoder replay has692 words/587 pairs; raw
DTW signed IN/OUT medians-159.8/-100.8ms reproduce the symptom before SRT. MP3 and
analysis PCM match byte-for-byte. CTC typical errors improve substantially but
OUT p95/overlap failures reject automatic replacement. No global offset fitted.
See the conviction78 gate for full paired evidence, tests and exact artifacts.
Next: consistent short-window alignment, corrected-text arm, review/fallback and
held-out speech. Acoustic acceptance remains open; manual reference is preserved.
Phase03 stays60%, Phase06 open. No portable; stop after78.

## Round77 — SUBTITLE-SCRUB-PREVIEW-01 (2026-10-21)

Fixed Vietnamese subtitle gaps/clipping and added saved start/center/end audition
positions with center default. The bounded 120ms preview repeats during a held
click/drag, shares a faint waveform interval and stops on release/cancel, Escape,
blur or source cleanup. Ordinary/imported/archived OBS and their track editors
share it; original media and word timing remain unchanged.
Frontend1175/145files, typecheck/build205 and headless audio/typography pass;
full API1232 passed / 3 existing warnings. ADR0126/subtitle-scrub77 gate hold evidence and limits.
Existing LipSync work remains intact. No portable; Phase03 stays60%, Phase06 open.

## Round76 — LipSync product Sessions and Version slots (2026-10-21)

Implemented Video Output Sessions/Versions, inline Face ID → Voice Profile cards,
portable per-Version composition/face/history state and scoped jobs/After/exports.
New session starts empty; New version clones current editing decisions and
completed analysis with a fresh history. Undo/Redo (100 combined steps) persists
across page/version switches and reload, including face decisions. Save/validation
fences protect navigation and late responses. Shared-source Send to menus connect
Input footage and generated Voice Outputs to a chosen LipSync slot, with compatible
Training/Voice Manipulation routes. ADR0125 and the sessions76 gate hold details.

Full frontend1162pass/144files and API1230pass/3existing warnings; typecheck/build204
pass. Latest history/Page4 and portable API3 also pass. Real WorkspaceShell browser
checks restore independent history and source routing. New Version2 render job
591cd789 completes75applied/55skipped with3 decoded MP4s; After640×854/4s plays,
Range routes pass and other Versions return404. Three upstream repos remain clean.
Fixture evidence does not approve real-client/generated-voice or multiperson
quality, additional native engines, cross-analysis identity continuity, face swap
or selective repair. No portable release. Phase03 stays60%; Phase06 open. Stop76.

## Rounds71–75 — reviewed-face artifact prototype (2026-10-21)

Five authorized slices now execute actual MuseTalk Offline v1.5 with verified
host models/runtime, scoped face analysis, manual review/profile mapping,
speaker/face gating, durable cancel/retry jobs, decoded composition/source
artifacts and shared Before/After Timeline. ADR0124 and runtime71-75 gate record
tests, real fixture artifacts and UI evidence. The fixture is upstream
research-only media/speech, not a generated-voice/client-footage quality gate.
Next: real footage/voice confidence and quality acceptance, identity continuity
across analyses/Preview overlays, remaining engine pipelines and selective
repair. Phase03 remains60%; Phase06 open. Return to the normal one-round stop
after this explicitly authorized five-round batch.

## Rounds66–70 — authorized LipSync batch (2026-10-21)

Five requested slices are implemented and verified: settings contract, portable
composition, multilayer editing/visibility, processing scopes and preflight.
See ADR0123 and docs/gates/lipsync-composition66-70-20261021.md. Preflight explicitly
has executed=false and pending face/engine blockers. The next authorized-plan
slice is isolated MuseTalk runtime/checkpoints with an actual generated MP4;
face tracking/profile binding and complete multiperson rendering remain open.
Resume normal one-round policy after this explicit five-round batch.

## Round65 — LIPSYNC-ENGINE-SETTINGS-01 (2026-10-21)

Engine source acquisition and grouped settings UI are verified; all render
choices remain unavailable pending actual adapters/models/runtime/artifacts.
See ADR0122 and docs/gates/lipsync-engine-settings65-20261021.md. The authorized
plan is docs/LIPSYNC-IMPLEMENTATION-PLAN.md; next is portable multi-clip/layer
editing with shared visibility scheduling. Face IDs, profile binding and
selective Voice Over video repair remain planned. Stop after this round.

## Round64 — LIPSYNC-TIMELINE-UI-01 (2026-10-21)

Input's grid proportions, library tabs and center Script footprint now shape
LipSync. Timeline's alignment mode adds video and Voice Output lanes with
pointer/keyboard movement, source IN/OUT trims, source waveform, shared zoom
and transport. Browser fixture layout and frontend1146pass/typecheck/build
verify the UI; full backend1208pass/3warnings. Alignment is not saved,
no model is installed and no output video exists. ADR0121 and the round64 gate
record boundaries; engine research is separate. Phase03 remains60%, Phase06
render remains open.

## Round63 — LIPSYNC-PREVIEW-01 (2026-10-20)

Added LipSync navigation, source selection, original-video playback endpoint,
generated-voice audition, and independent clip placement/IN points on a
two-track timeline. Draft is session-only; no render or face swap is claimed.
Full frontend1144pass, focused API2pass, build/typecheck pass. Full API1207pass/1 installed
VibeVoice import timeout; isolated rerun passed. ADR0120 and lipsync-preview63
gate record evidence. Phase03 remains60%; Phase06 is open.

## Stabilization round62 — SELECTION-DUPLICATE-SPACE-01 (2026-10-20)

Unselected footage views hide Script/Timeline data. Alt-left drag duplicates
selected subtitle words at the drop time with a translucent preview and Script
text update; moved timing is untrusted, with original intervals retained.
Space toggles ordinary/imported Timeline playback. Focused88pass, final
frontend1138pass/136files, typecheck/build191pass. Full API1207pass on retry.
ADR0119 and selection-copy-space62 gate hold evidence and limits. No source
media, project schema or engine change; Phase03 remains60%.

Release follow-up: app alpha 0.5.18 has 221 verified payload files / 226 ZIP entries.
The API requirements delta after 0.5.17 blocks app upgrades on the old base; full
portable `f185bb5` contains 82,208 files / 41.00 GiB, including runtime/model layers.
Bundle gate: 33 passed / 0 failed; local core API/UI/STT ASGI probes pass.
See portable-update-0.5.18-20261020 gate for artifact and runtime evidence.
Packaging does not start another product round.

## Stabilization round61 — TIMELINE-EDGE-SPEAKER-01 (2026-10-19)

Shared edge scrolling uses symmetric 10/20/30/40% viewport/sec bands. Subtitle
bottom edges preserve profile identity across states, with manual timing edits
on the orange top edge and updated Note. Frontend 1130 pass/136 files/149.48s;
focused 138 pass; typecheck/build191 pass; API 1207 pass/3 warnings/677.64s.
Real browser CSS checks pass32cases across themes and playback/selection states.
See ADR0118 and edge-speaker61 gate. Native held-drag/portable UAT remains
separate; no portable issued. Phase03 stays60%. Stop after round61; provider
quality/device and complete processor acceptance remain separate future work.

## Stabilization round60 — TIMELINE-SOURCE-BOUNDARY-01 (2026-10-19)

Source-boundary drag exception now survives fractional DOM extents, numerical
roundoff, empty endpoint audio previews and delayed canvas resize repaint.
Final frontend1127pass/136files/161.28s; focused131pass; typecheck/build191 pass;
API1207pass/3warnings/642.63s. Browser DOM/media probes retain0/20.123s at source
limits after release/layout/media events. Native mouse capture and installed
portable acceptance remain manual. ADR0117 and source-boundary60 gate record
scope and evidence. No portable; Phase03 stays60%. Resume separate provider
quality/device and complete processor gates from Round59 when requested.

## Round59 — OPEN-ENGINE-CONNECT-01 (2026-10-19)

Round59 implementation/test gate is closed; advance separate provider acceptance.
Repo installation, CosyVoice worker/reference cloning, streaming-ASR PCM sessions,
Sokuji inspection and per-function provider choices are implemented. Model-local
receipts bind pinned artifacts to readiness; Script assignments do not change
when switching generation engines. Typecheck/build191, focused Cosy/provisioning33
and final catalog28 pass. Frontend1118pass in136files/324.88s; two native startup
cases recovered unchanged in44.53s. Final full API1207pass/3warnings/737.89s. Actual Cosy WAV
5.88s/24kHz/mono passes basic signal checks; w-okada3.10 server/RVC imports pass.
Complete acoustic/device/translation/dub/live gates remain open. No portable. See ADR0116 and
docs/gates/open-engine-connect59-20261019.md. Phase03 remains60%.

## Round58 — ENGINE-CATALOG-01 (2026-10-19)

Task provider catalog now reports capabilities and machine readiness; selected
STT model/adapter IDs are checked before queueing and cannot silently fall back
to Studio. Whisper weights are checked per model; VibeVoice-ASR speaker labels
reach Script independently of Speaker Profiles and estimated word intervals
stay untrusted. Planned streaming ASR and CosyVoice entries are disabled. See
ADR0115 and docs/gates/engine-catalog58-20261019.md. Frontend1112pass/136files,
typecheck/build191 pass; API1152pass (3 existing/fixture warnings); final
focused backend15pass and diff check pass. No new model/audio artifact or
project-format change. Exact next slice STT-VIBE-01; STT-VIBE-STREAM-01,
TTS-COSY-01 and LIVE-COSY-01 remain open. Phase03 stays60%.

## Stabilization round57 — VM-FUNCTION-LAYOUT-01 (2026-10-19)

Owner direction: keep OmniVoice primary and offer compatible providers per task.
OPEN-ENGINE-WORKFLOW-PLAN.md records authorized VibeVoice-ASR, CosyVoice, Sokuji
and live conversion integration slices; none is claimed newly runnable here.
Round57 adds vertical VO/VP/VD/VI/LT tabs, preserves the shared Script/Timeline,
scopes right-side function panels and guards VO generation in other functions.
Script settings dock retains selection/document/refresh ownership through a portal.
Applied-result badges derive VO/VP from provenance. Imported/OBS column headers
contain vertical M/S plus horizontal Gain-over-Level; source mixing semantics stay.
ADR0114 and function-layout57 gate record focused checks, independent review and
memory-only browser fixtures in both themes, including narrow column containment.
Frontend1109pass/136files/312.67s; API1150pass/608.09s (3existing/fixture warnings).
Typecheck/build191/diff pass. Code commit d3062ca;675 frozen inputs match.
Phase03 stays60%; acoustic timing, Checkpoint A, processor acceptance and new
provider integrations remain open. No portable issued in this round.


## Stabilization round56 — OVERVIEW-WAVEFORM-FOLLOW-01 (2026-10-18)

Owner feedback: overview transport moved playhead/Script but left the zoomed
waveform outside the seek target. Explicit overview seeking now reveals the same
numeric target immediately during pointerdown/move/release, including disjoint
selections. Preserve normal multi-selection no-scroll behavior, waveform/playhead
safe-edge panning and release stability. Imported/archived OBS LAYER/CỘT controls
retain their existing reveal behavior. ADR0113 and gate overview-follow56 record
RED2cases, focused28+94passes, source browser forward/reverse drag and final gates.
Final frontend1102pass/133files/273.66s (one worker), API1150pass/479.45s
(3existing/fixture warnings). Typecheck/build187/diff pass;599frozen inputs match.
App update alpha0.5.17:206payload hashes/210ZIP entries verified; actual payload
forward/reverse drag matches source. Full installed base/runtime gate deferred.
No saved timing/media/model/backend/project-schema changes. Phase03 stays60%;
acoustic anchors, Checkpoint A and13processor gates remain open. Stop after round56.

## Stabilization round55 — WORD-MENU-NOTE-01 (2026-10-18)

Owner feedback: word menus must remain inside the visible viewport, manual
subtitle words use Speaker underline with blue text, and both Script/Subtitle
menus offer a horizontal Note legend. Shared measured body portals escape module
clipping, flip/clamp at edges and follow resize. Note chooses left/right, shares
outside dismissal and preserves native editing drafts. Existing edit/profile and
reference actions retain their boundaries. Palette/cascade tests cover exact state
surfaces in both themes; no Speaker body fill for manual subtitles. ADR0112 and
docs/gates/menu-note55-20261018.md record regression, browser and release evidence.
Rendered synthetic Script/Timeline checks pass in both themes without project or
media writes. Validation also fixed a pre-existing launcher first-probe starvation
when diagnostics consumed its deadline; deterministic RED and15focused cases pass.
Final frontend1096pass/133files/376.02s with one worker; API1150pass/596.27s
(3existing/fixture warnings). Typecheck/build187/diff pass;599frozen inputs match.
Intermediate two-worker fixture timeouts and API RED remain in the gate report. No API implementation/model/media/
project-format changes. App update alpha0.5.15:206payload hashes/210ZIP entries verified; actual payload UI
Script/Subtitle Note checks pass. Heavy base/full installed runtime gate deferred.
Phase03 stays60%; acoustic anchors, Checkpoint A and13
processor gates remain open. Stop after round55.

## Stabilization round54 — WORD-EDIT-RESUME-01 (2026-10-18)

Owner feedback: subtitle word context exposes Speaker Profiles; Script table,
native text and channel menus offer Add/Edit/Delete. Selected-word Delete stays
scoped and preserves native text-input behavior. Known word replacements retain
exact original IN/OUT; multiple tokens partition that interval, keep provenance
and remain untrusted. Genuine insertion cannot move old anchors to make space.
Project-scoped local storage restores selected asset/child/output/OBS archive and
its paused cursor; hydrate before writes, yield to explicit opens, guard stale
metadata/clocks and preserve asset identity through OBS callbacks. Live follow
stays live. Stale menus dismiss on word revisions; deletion is blocked in recording.
ADR0111 and docs/gates/word-edit-resume54-20261018.md record RED/GREEN and limits.
Final frontend1075pass/129files/194.01s; API1149pass/590.08s (3existing/fixture
warnings). Typecheck/build183/diff pass; all615frozen input hashes match.
Browser was disabled initially; on resume, real Script/subtitle menus and project
reload restoring the correct footage at00:00:05.200 passed. Destructive editing UAT
and live/imported focused drag acceptance remain open; no console errors observed.
Generated output transcript writes remain under the existing Voice Edits boundary.
No backend/media/model/project.json changes. Resume is local to this device.
Phase03 stays60%; acoustic anchors, Checkpoint A and13processor gates remain open.

## Stabilization round53 — SUBTITLE-DRAFT-FEEDBACK-01 (2026-10-18)

Owner feedback: explicit selection highlights/readouts/markers follow subtitle
word drafts and commit together; cancellation restores source intervals. Preserve
scope, disjoint ranges, silence padding, partial-word proportions and source bounds.
Insertion inherits nearest row identity; unnamed words use footage default profile,
respecting explicit null. Manual subtitles use speaker fill and readable blue text
with exact cached state pairs in both themes. Middle waveform IN/OUT assignment
shares10%/90% safe targets and10% viewport width/s elapsed scrolling; no release
jump. Ordinary/imported/archived OBS editors share these contracts. Existing OBS
reset regression caught a duplicate event; remove it without altering assertions.
See ADR0110, UI-COLOR-RULES.md and docs/gates/subtitle-feedback53-20261018.md.
Final frontend1034pass/126files/145.65s; API1149pass/526.89s (3existing/fixture
warnings). Typecheck/build182/diff pass; all606frozen input hashes match.
Browser inventory reports local use disabled; real mouse/paint UAT stays open.
No backend/media/model/project-format edits. Phase03 remains60%; independent
acoustic anchors, Checkpoint A and13downstream processor gates remain open.

## Stabilization round52 — SUBTITLE-PRECISE-TIMING-01 (2026-10-18)

Owner feedback: remove60ms acoustic snap from word move/IN/OUT and accept fine
trim movement without the3pixel activation zone. Grips mount only on selected
words; hover cannot expose invisible neighbour hit targets. Repeated middle-pick
sets the timestamp target instead of toggling insertion's already promoted word
off. Menu/double-click/word-expansion insertion paths align directly; external
Script/channel events share the same behavior. Existing source/order/neighbour
bounds, compact overview zoom and explicit cancellation/advance remain.
RED-first exact symptom tests and38focused GREEN cases. ADR0109 and
docs/gates/word-timing52-20261018.md record retired snap tests and limits.
Final frontend1017pass/125files/143.64s; API1149pass/538.13s (3existing/fixture
warnings), typecheck/build182/diff pass. All605frozen input hashes match.
Real mouse UAT blocked by browser use disabled in Work settings. No backend,
media/model or project format edits. Phase03 stays60%; independent acoustic
anchors, Checkpoint A and13downstream processor gates remain open.

## Stabilization round51 — TIMELINE-SAFE-EDGE-01 (2026-10-17)

Owner feedback: hold viewport scrub playheads at the existing10%/90% safe edges
while raw pointer direction pans at10% viewport width/s. Use one target on
pointerdown/move/frame/release across ordinary/imported/archived OBS timelines.
Keep first/last sample accessible at physical source limits. One-pixel follow
tolerance prevents rounding-driven release recenter; OBS suppresses the trailing
click after an edge-constrained/panned drag, including a stationary held pointer.
Two ordinary gesture tests RED before fix; both edge/release cases now pass in
all three timelines. See ADR0108 and docs/gates/timeline-safe-edge51-20261017.md.
Final frontend1013pass/125files/147.12s; API1149pass/530.32s (3existing/fixture
warnings). Typecheck/build182/diff pass; all603frozen inputs match.
Browser inventory reports local use disabled; final real mouse UAT remains open.
No source media, saved word timing, model or backend source changes. Phase03
stays60%; acoustic anchors, Checkpoint A and13processor gates remain open.

## Stabilization round50 — TIMELINE-LIVE-READABILITY-01 (2026-10-17)

Owner round49 feedback: paint playhead immediately during all seek drags and
ignore stale media clock repaint during scrubbing. IN/duration/OUT now stay on
one collision-free row with exact source values. Shared color resolver and
semantic foreground/background pairs govern custom speaker/emotion text and
selected/active/untrusted/collision states in both themes; opaque declared
surfaces match the contrast calculation. Normal text gate is4.5:1; preserve
passing user colors and stored preferences. Token parity, actual stylesheet
cascade, custom-color matrix and product TSX dynamic-foreground guard prevent
returning to isolated color guesses. See ADR0107 and docs/UI-COLOR-RULES.md.
Final frontend1010pass/125files/148.56s; API1149pass/551.59s (3existing/fixture
warnings), typecheck/build182 and diff pass. All602frozen inputs match.
Intermediate actual browser drag records8updates before release; three numeric
labels share one top coordinate. Final cross-page browser sweep is blocked by
local browser use disabled in Work settings; subsequent CSS tested separately.
See docs/gates/timeline-readability50-20261017.md for limits. No media, model,
saved word timing or backend changes. Phase03 stays60%; acoustic anchors,
Checkpoint A and downstream processor gates remain open.

## Stabilization round49 — TIMELINE-VIEWPORT-UX-01 (2026-10-17)

Owner-requested Timeline UX: elapsed scrub edge scrolling at10% viewport width/s
with fractional accumulation, playhead-centered zoom and plain blank deselect.
Shared numeric selection overlay uses accent alpha0.30/opaque text, outside
IN/OUT for narrow spans and collision rows at viewport edges. Clipping paints
only contiguous exceeded buckets in one nonzero SVG fill, without quiet-gap
bridging/coalescing/minimum-width expansion. Machine-local Preferences offers
5s auto-hide, defaultoff; archived PCM refresh retains timer ownership and
shares waveform/clipping bucket-start geometry. Applies ordinary/imported/
archived OBS timelines; live capture follow keeps its existing contract.
Final frontend: 968 pass / 120 files / 143.39s; full API: 1149 pass / 559.26s
(3 existing/fixture warnings). Typecheck/build179 and browser PCM proof pass.
All594inputs match the full-run snapshot; subsequent test-only EOF whitespace
cleanup passes its9tests.
See ADR0106 and docs/gates/timeline-ux49-20261017.md for evidence and limits.
No source-media or word timestamp changes. Phase03 stays60%; independent acoustic
anchors, Checkpoint A and13 downstream processor gates remain open.

## Stabilization round48 — STT-WORD-CLOCK-AUDIT-01 (2026-10-17)

Owner clarifies widespread same-word early timing; round47 waveform fix is not
linguistic acceptance. Audit41869words/3projects: all artifact→saved STARTs match,
END differences at most0.4ms; actual UI normalizer changes only5STARTs/54ENDs.
Fresh CPU same-pass native/converted capture preserves all155valid intervals;
one zero-length crop-edge word is omitted and still labelled source (coverage
concern). Exact-text cached aligner comparison of98interior words gives median
IN lags124/168/149.5ms;84candidate INs are closer to saved END than saved START.
Supports early-DTW hypothesis; aligner outliers prevent acoustic accuracy claims.
No production timing shift/default change. Twelve-word blank listening packet,
23profiling tests pass,12input hashes unchanged; docs/gates/stt-word-clock48-20261017.md
records limits. Independent IN/OUT anchors remain unmeasured. Phase03 stays60%;
Checkpoint A and downstream processor gates remain open.


## Stabilization round47 — TIMELINE-CLOCK-SELECTION-01 (2026-10-17)

Reproduced waveform display drift from unequal peak groups and endpoint painting;
now use proportional source partitions and bucket-start coordinates. Rebuild old
overview geometry caches; preserve original media and saved STT words. Timeline
input/draw rectangles now share origin/width. Ordinary STT/import selections show
waveform START/DURATION/END and subtitle highlights; native/channel Script emits
source-scoped selection. Ctrl-left drag selects time; ordinary waveform drag seeks;
subtitle Ctrl-click insertion waits for release. Caret/disjoint/source guards retained.
Final frontend937/113files/132.61s, typecheck/build172 pass; full API1147pass/537.75s (3existing/fixture warnings). Real synthetic PCM
registry/browser evidence validates500ms intervals; user-footage linguistic anchors,
native Ctrl-drag and live OBS acceptance remain open. ADR0105 and
`docs/gates/timing-selection47-20261017.md` record evidence/limits. Phase03 stays60%;
Checkpoint A and13downstream processor codes remain open.


## Stabilization round46 — HUB-BROWSE-RECOVERY-01 / OBS-OFFLINE-LEASE-01 (2026-10-17)

Owner-reported Browse wait investigated without attributing it to recent timing
work: native adapter last changed2026-10-04. Reproduced timeout error contract,
unreported picker rejection and late reply overwriting a typed folder; added
RED-first recovery tests. Windows uses an isolated STA child with activated
owner, detached stdin and recoverable timeout503; UI preserves draft and allows
retry. Actual intermittent native foreground/selection/cancel acceptance remains
open. Independently reproduced offline OBS claim500 and invalid release checkpoint;
now retain exact valid durable state and report disconnected/unknown truthfully,
then rebind on connected hello. ADR0104 records the evidence and limits.
Final full API1145pass/532.74s (3existing/fixture warnings), frontend920pass/
112files/127.02s using ordinary npm test; typecheck/build172/diff pass.
Default jsdom worker count is bounded to2 after two unconstrained runs timed out
the existing5s Script case; all cases/assertions/deadlines remain intact. First
API1144pass/one unconfirmed training-tree stop601.72s retained; exact unchanged
case rerun passes and current full rerun is green. No cancellation safety check
was relaxed. All590API/web input hashes match the final frozen snapshot; the only
change after API rerun began was the frontend test-worker configuration.
Real private controller/API/CPU Studio verifies forced dialog-child error recovery,
project create/reopen, cached real-speech import, waveform/Play/Pause, Unicode
move/Open Existing, source hashes/relative paths and Range206. Source24kHz mono
16bit230400frames/9.6s unchanged; no new inference/model load. Private listeners
stopped, shared runtime untouched. Deleted only two audited old pytest trees
(8482files/120235285logical bytes); recent/unconfirmed evidence and media retained.
See docs/gates/hub-browse-cleanup46-20261017.md for cache cleanup, failures and
remaining native/quality limits. Checkpoint A remains open; Phase03 stays60%.


## Voice Manipulator round45 — VM-CHECKPOINT-A-05 (2026-10-17)

Current frozen source passes all1140 API tests (620.90s, 3 existing/fixture warnings); frontend917 tests/112files pass131.60s,
typecheck/build172 and diff check pass. All589 API/web inputs match the final
frozen SHA manifest; frontend hashes match its broad pass. No assertions,
thresholds/timeouts relaxed or skipped. First API run1136pass/onefail600.75s is
retained: PermissionError reading an MKV checkpoint during restart status polling,
not a deadline failure. Read-only diagnosis led to bounded PermissionError retry
(5attempts, four waits totaling200ms), preserving invalid JSON/persistent errors
and configure click-time snapshots. Focused follower26 pass, including restart;
no long processing lock added. ADR0103 records limits without blaming an unknown
file-lock holder. Current full API rerun is the reported green snapshot.
Actual API verifies fourth stretch, exact WAV/frame/hash, Undo/Redo, fifth draft,
Range206/waveform/stale409 and Unicode move/Open Existing. Browser now works with
private production controller/API and actual CPU Studio, no model loaded. Real
UI shows9.2s waveform/audio ready4, subtitle overlay/two handles/markers, Redo9.6s
and Undo9.2s, playback advancing then pausing. Source/output metadata remain exact;
final journal13/cursor3. Private listeners stopped, ports free, viewport reset.
Browser exposed clipped Script disclosures (100px first,13px others). VoiceScript
settings now share a bounded scroll region; six closed rows29.8px, transcript
126.6px at1280x720,100px at1024x600. Sidebar styles preserved. Focused UI26 and
real layout checks pass; compact19px settings viewport still needs small-pane UAT.
ADR0102, browser45/post-browser45 receipts and ui45.jpg preserve evidence.
250ms Ctrl-drag→audio-ready/continuous listening, native Save/Cancel, human word/
identity/seam review, expressive/random conditioning and13downstream codes remain
open. No new model inference/training/download, shared runtime operation, push or
portable release. Remaining register/NEXT-PLAN refreshed through45; Phase03 stays60%.

## Voice Manipulator round44 — VM-PREVIEW-RECOVERY-01 (2026-10-17)

Malformed preview containers now become the shared PCM validation error instead
of leaking wave.Error/EOFError as HTTP500. Audio reports unavailable404; waveform
uses its existing400 validation contract. Draft regeneration safely repairs the
cache without changing journal/source. Two RED cases reproduced500 before the
fix, then passed error/rebuild/read checks. Focused API33 pass; actual private
cache corruption confirms500/500→404/400 with original bytes restored afterward.
ADR0101 records the compatible error contract. Hash, frame and quality gates
remain intact. Next45 freezes source, checks production artifacts/move/reopen,
real browser behavior where supported, and full regression plus remaining work.

## Voice Manipulator round43 — VM-STRETCH-LOCK-01 (2026-10-17)

Preview publication now locks by canonical output folder, shared across service
instances. All same-output variants/prefixes serialize; unrelated outputs proceed
independently. A guarded weak registry releases unused entries and resolves path
aliases/Windows casing. Hash/PCM/durability and journal semantics stay intact.
RED-first concurrency/failure/alias/collection tests pass; focused API39 pass.
Controlled actual-speech fixture: cached other output previously remained blocked
through a200ms held renderer (404.07ms total lock wait); now completes8.90ms while
that renderer is still held, lock wait0.175ms. This uses an artificial hold and
does not claim normal latency. Native rendered WAV remains byte-identical; source
SHA and journal revision5 unchanged. ADR0100 and contention receipts record scope;
cross-process editing/actively moved folders are not newly supported. Next44
repairs malformed cached WAV reads that currently leak HTTP500 from both routes.

## Voice Manipulator round42 — VM-STRETCH-SCHEDULE-01 (2026-10-17)

Initial preview scheduling now arms one40ms timer from the first changed frame
operation; sustained pointer moves update its payload without postponing it.
One active preview coalesces newer moves and immediately follows the latest on
completion. Equivalent/clamped moves do not create redundant requests. Accepted
audio ownership is tracked even when selection has moved onward; A→B→A and
pointerup-before-followup cannot mistake B audio for an accepted A preview.
RED-first sustained10ms stream and restoration regressions pass; focused UI34
in3files, typecheck and build172 pass. ADR0099 records the contract. Previous
trailing180ms timer could starve under continuous motion;40ms is the scheduler
target, not a browser/audio latency claim.250ms and listening gates remain open.
Next43 removes unrelated-output contention while serializing same-output writes.

## Voice Manipulator round41 — VM-STRETCH-IO-01 (2026-10-17)

Preview request diagnostics now split artifact hashing, report publication and
final verification; the atomic writer optionally measures create/write/flush/
fsync/close/replace/retry without changing durability or two-argument callers.
Measurements remain ephemeral and reset to zero on cache hits. Twelve actual
prefix3+suffix1 renders of the private natural8s fixture produce identical WAVs,
230400frames, no clipping/unsafe boundary and unchanged source/journal revision5.
Render-call median336.98ms, range173.49–536.24ms; fsync median127.41ms and no retry.
This measures current storage variance, not a speedup;250ms remains open.
Focused API checks and ADR0098 document preservation of integrity and cleanup.
Evidence: .scratch/vm-rounds41-45/artifact41-receipt.json. Next round42 removes
starvation caused by resetting the initial180ms timer during sustained dragging.

## Voice Manipulator round40 — VM-CHECKPOINT-A-04 (2026-10-17)

Current frozen source passes all1128 API tests (612.73s, three existing/fixture
warnings), all913 frontend tests in112 files (128.81s), typecheck/build172 and
diff check. All586 tracked API/web input hashes match the frozen manifest; no
tests/assertions/thresholds/timeouts weakened or skipped. An earlier API run was
stopped before a review-driven counter integrity repair and is not claimed green.
Three RED regressions reproduce impossible signed padding/mismatched op counts;
current guard bounds silence fit1440frames per operation and preserves valid
negative adjustment/legacy reports. Repaired focused API32 and full suite pass.
Actual natural8s production API commits3stretches to9.2s, Undo/Redo restores exact
WAV SHA, fourth draft reuses3/render1 without journal commit, WAV/Range206/waveform/
stale409/move/Open Existing pass. Source/metadata unchanged, one original output,
revision5/cursor3 preserved after Unicode folder move, relative manifest and free
GPU lease. No new inference/model/training/download/shared runtime operation.
Performance:100 paired clipping scans13.94→7.54ms median;10before/after WAVs exact.
Five full3-op vs prefix2+suffix1 pairs median284→214ms, every WAV exact;556ms outlier
at artifact stage and initial180ms debounce keep250ms end-to-end gate open.
CUA/Computer Use still fail kernel-assets os error3; no browser/listening/native
export acceptance inferred. Expressive delivery/random/word-anchor and13downstream
codes remain open. Remaining register/NEXT-PLAN updated through40; prioritize
IO/debounce/lock/browser profiling without discarding integrity checks.
Detailed gate: docs/gates/vm-checkpoint-a-preview-performance-20261017.md. Local
receipts/profiles/logs: .scratch/vm-rounds36-40. Five requested rounds complete;
Phase03 remains60%, no push/portable release.

## Voice Manipulator round39 — VM-STRETCH-QUEUE-01 (2026-10-17)

Stretch requests now use one active lane with a replaceable pending task; newest
preview/commit/history/load owns publication. Superseded/cancelled/output-switched
tasks cannot publish or revive old work. Pointerup commit waits behind preview.
Latest queued drag operation dispatches immediately after older preview finishes,
without a second180ms wait; initial180ms debounce is retained and remains a budget
constraint. Late gesture completion cannot restore selection after unmount.
Mapped audio seek/resume state stays until the corresponding metadata is handled;
matching preview operations alone no longer clear transport prematurely.
Focused UI30/typecheck/build172 pass; ADR0097 records scope and lack of server
cancellation. Browser tools still fail kernel-assets initialization, so no audible
continuity or250ms end-to-end claim. Next40 finishes frozen regression/artifact gates.

## Voice Manipulator round38 — VM-STRETCH-REUSE-01 (2026-10-17)

Preview cache now finds the longest exact operation prefix with valid source hash,
WAV/checksum/frames and cumulative quality report, then renders only the suffix.
Missing/corrupt/incomplete cache falls back safely; fork/Undo/Redo use exact keys.
Signed silence adjustments and max boundary/whole targetframes remain consistent.
Malformed/NaN cache diagnostics rebuild instead of leaking invalid HTTP reports.
Focused API32 pass, including native FFmpeg byte parity. Actual natural8s speech
with3operations: full median284.17ms vs prefix2+suffix1 median214.37ms over5paired
runs; all5 WAVs byte-identical and source/journal untouched. One reuse556ms outlier
spent389ms in artifact publication/verification, so250ms remains open. Measurements
do not include browser/debounce/playback. ADR0096 and reuse38-receipt.json record
the tradeoff. Next39 serializes drag preview/commit and retains playback metadata.

## Voice Manipulator round37 — VM-STRETCH-CPU-01 (2026-10-17)

The measured per-frame Python clipping generator is replaced by exact signed-array
endpoint counts. Clipping thresholds/rejection and audio processing stay identical.
Two RED-first scan cases plus existing pitch/source/frame/boundary checks pass10/10.
Paired100-run scan median13.94ms→7.54ms on the same PCM. All10 real rendered WAVs
(one/three operations, five runs each) remain byte-identical to baseline. Profile
generator calls fall from2.1m to native typed scans; this does not imply the whole
request improves by the profiled delta. Real HTTP miss215.84ms/hit36.82ms varies;
three-operation fresh renders still median347.69ms under cProfile. No250ms gate
closure or human listening claim. ADR0095 and local native-scan receipts record
method/results. Next reuse exact validated history prefixes to avoid repeated FFmpeg.

## Voice Manipulator round36 — VM-STRETCH-PROFILE-01 (2026-10-17)

Preview packets now expose ephemeral per-request cache/lock/check/render/artifact/
packet timing, with candidate/handler Server-Timing on draft preview. The cached
render report remains immutable and is not confused with current cache latency.
API18 pass, including a RED-first cache diagnostics regression. ADR0094 records
units and measurement limits. Real8s natural speech baseline: HTTP miss252.54ms,
hit41.44ms; profiled fresh render median210ms one operation/375ms three operations.
Repeated instrumented run miss221.96ms/hit25.64ms shows runtime variance, not an
optimization claim. cProfile locates FFmpeg subprocess work and Python clipping
scan (over2.1m generator calls); timings under profiling include its overhead.
All runs preserve source hash, exact target frames,0clipping/boundary checks and
journal revision0. Receipts/profiles under .scratch/vm-rounds36-40.250ms browser/
continuous-playback gate stays open. Next optimize the measured PCM scan.

## Voice Manipulator round35 — VM-CHECKPOINT-A-03 (2026-10-16)

Frozen f30b77d source passes all1107 API tests (554.78s, three existing/fixture
warnings), all905 frontend tests in112 files (178.02s), typecheck/build172 and
diff check. No assertions/thresholds/timeouts weakened or tests skipped.
Actual production HTTP validates25 exact word crops plus proposed-boundary crop,
Range206, explicit-review false rejected422 without new outputs, and3 comparable
Patch variants with matching checksums/unreviewed ratings. All checks repeat after
a guarded Unicode folder move and Open Existing. Four output WAV hashes/metadata,
original media and LoRA adapter/reference/metadata remain intact; report snapshot
key survives the move, manifest paths stay relative and GPU lease is free.
No real human review, training/download, ASR/TTS or shared runtime operation occurs.
CUA/Computer Use still fail initialization with kernel-assets os error3. Native
playback/Save/Cancel, human word/identity/seam listening, expressive conditioning,
random audio execution and preview250ms gates remain open. Phase03 stays60%.
The owner-facing remaining-round register is docs/VOICE-MANIPULATOR-REMAINING-ROUNDS.md:
prioritize preview profiling, delivery evidence then random execution, plus human/
native gates. After Checkpoint A remain13 function codes:3 Changer,3 Isolator,
2 Emotion,5 Dubber; not a promise that13 execution rounds suffice. Mobile/Convai/
Digital Human still need feasibility. NEXT-PLAN's stale exact-next pointer is fixed.
Detailed evidence/usage: docs/gates/vm-checkpoint-a-word-review-20261016.md; local
receipts/logs under .scratch/vm-rounds31-35. Five requested rounds complete.

## Voice Manipulator round34 — VM-TIMING-RECOVERY-01 (2026-10-16)

Timing jobs persist structured invalidation reasons for audio, metadata, recognizer,
timing policy, proposal or legacy identity. Source changes take precedence, stale
states/reasons survive reopen, and interruption remains failed. UI explains the
reason/current ASR model and keeps Measure/Apply explicit. Start/Stop responses now
check request generations, including select-away-and-back races; Stop disables busy.
Two new UI regressions failed before correction. API14 (timing13 plus production
integration1) and affected UI10/typecheck/build172 pass. ADR0093 documents codes
and recovery. Tests use synthetic recognizers; no new ASR/TTS, model download or
human acceptance. Next round35 freezes source, runs full checks and closes the
owner's five-round batch with the reconciled remaining-work register.

## Voice Manipulator round33 — VM-REVIEW-EXPORT-01 (2026-10-16)

Each accepted Patch comparison group can download a portable JSON report with
target/text, variant identity/audio/metadata checksums and exact user assessments.
Current/stale/unreviewed states remain explicit; no aggregate quality pass.
Concurrent assessment revision changes and corrupt notes reject export; reads
never fabricate a listening confirmation. ADR0092 documents the additive contract.
API11 (report3 plus reviews7 and production integration1), UI5/typecheck/build172
pass. Actual production HTTP exports all3 comparable Vietnamese variants with
matching hashes/unreviewed ratings, no private notes or inference writes.
Local comparison33-report.json/report33-receipt.json hold the result. Native
Save/cancel remains unverified. Next round34 makes timing invalidation/retry clear.

## Voice Manipulator round32 — VM-WORD-REVIEW-01 (2026-10-16)

Word inspection now accepts proposed boundaries and auditions them with context.
Save requires explicit listening/review confirmation and writes a new byte-identical
WAV output with user-reviewed provenance only on selected words. Segment/neighbor
bounds, unique indexes, optimistic source identity, checked idempotent receipts and
source immutability are enforced. Unselected annotations remain unchanged.
API13 and UI5 (plus VoicePatch2)/typecheck/build172 pass. Synthetic temporary
projects verify actual WAV copy, source preservation, batch confirmation, stale/
tamper/corrupt receipt/reopen and proposed crop behavior. No human review was
fabricated on private Vietnamese speech;23/25 machine anchors remain the baseline.
ADR0091 records the distinction between annotation review and acoustic timing control.
Next round33 exports current listening assessments for comparable accepted variants.

## Voice Manipulator round31 — VM-WORD-AUDITION-01 (2026-10-16)

Saved Voice Outputs now have an explicit word inspector with source timing/trust,
START/END/DURATION and one player for200ms-context word crops. Untrusted words
remain listenable without trust promotion. Each request checks WAV/metadata key,
PCM format/frame count, project containment and segment bounds; no inference.
API7 (six new cases plus production integration), UI4/typecheck/build172 pass.
Actual private Vietnamese timing output serves25 exact PCM crops including its
two untrusted words; Range206/stale409 pass, original WAV/metadata unchanged.
Local word31-receipt.json records evidence, not human acceptance. ADR0090 explains
the contract. Next round32 adds explicit manual boundary review as a new output.

## Voice Manipulator round30 — VM-CHECKPOINT-A-02 (2026-10-16)

Checkpoint A integration verified on the frozen48e737d source snapshot: all1085
API tests pass (657.11s, three existing/fixture warnings); all898 frontend tests
in111 files pass (144.13s, one Vitest fork shutdown warning), typecheck/build171
and diff check pass. Assertions/thresholds/timeouts remain intact; no tests skipped.
Actual production HTTP verifies four8s outputs, WAV/Range/line/word/table/sentence
exports, three accepted comparison entries and source/variant crops before and
after a guarded private project move to a Unicode folder plus Open Existing.
Source, model/adapter/reference, output hashes and metadata stay unchanged. Repaired
word SRT skips2 untrusted cues; repaired sentence SRT exports with1 skipped cue.
Changing medium to productionlarge-v3 correctly invalidates the prepared proposal,
while the already-applied same-WAV timing output stays valid. No inference on reopen.
Real reviews remain unreviewed; no fabricated listening or newTTS. GPU lease free.
CUA and Computer Use both fail initialization with kernel-assets os error3, so
browser playback/native Save and independent human identity/seam/word-timing gates
remain open, as do expressive conditioning/performance gates. Phase03 stays60%.
Read-only integration review found no actionable defect. Detailed report and
usage: docs/gates/vm-checkpoint-a-timing-audition-20261016.md; local receipts and
logs under .scratch/vm-rounds26-30. Five-round request complete; next work closes
remaining Checkpoint A gates before new Voice Changer/Isolator/Dubber processors.

## Voice Manipulator round29 — VM-PATCH-REVIEW-01 (2026-10-16)

Explicit listening assessments now accompany the selected accepted Patch variant:
clarity, identity, delivery, transitions, notes and a listening confirmation.
Every rating starts unassessed. Portable notes append immutable assessment snapshots
with accepted WAV/metadata/comparison fingerprints and optimistic revision guards;
stale notes remain visible, corrupt files are not overwritten. No automatic quality
pass or Checkpoint A promotion. UI ignores late saves for another output.
API8 (seven review cases plus production integration) and UI7/typecheck/build171
pass. ADR0089 records the contract. Automated writes use synthetic temporary
projects only; the three actual Vietnamese variants remain human-unreviewed.
Next round30 freezes source, checks integrated exports/move/reopen and whole suites,
and reports remaining perceptual/UI gates honestly.

## Voice Manipulator round28 — VM-PATCH-AUDITION-01 (2026-10-16)

Accepted Patch history now opens one shared source/variant player with region,
head, tail and full-clip views. Explicit selection starts playback; changing region
or output stops it. Saved source checksums and project containment guard original
audio; unavailable originals never substitute a current Timeline render.
Real three-strategy artifacts exposed a trained-media source-location difference;
a RED regression and immutable-output fallback fixed it. Actual HTTP verification
passes24 WAV crops across three accepted variants plus Range206, with source/output
unchanged and0TTS. API audition7 and production route1 pass; UI4/typecheck pass.
ADR0088 records the behavior. Local audition28-receipt.json contains artifact hashes.
The private ASR Studio was released and only its owned18085 server stopped.
Human listening/browser acceptance remain open. Next round29 records explicit
user assessments without automatically marking quality accepted.

## Voice Manipulator round27 — VM-TIMING-REPAIR-01 (2026-10-16)

Explicit persisted Timing Repair jobs now measure existing Voice Output segments
through Studio ASR, with model/policy/source fingerprints, owned Stop, interruption
recovery, checked proposal artifacts and separate immutable same-WAV Apply. No
TTS or source mutation. UI separates plan/measure/Apply and ignores late results.
API8 (seven service regressions plus production route), affected UI39 plus late
Apply test3/typecheck/build169 pass. ADR0087 describes ASR matching limits.
Actual cachedmedium Studio on a private port measured23/25 words in the natural
Vietnamese patched8s file; target2/3 words trusted, two total remain untrusted.
WAV SHA stays8df7b33eda41137d9a4e587d69cb225fb8a5687016867522eebd62ab6453e327;
source metadata unchanged, preview-before-Apply/idempotence/lease pass,0TTS.
New output output-9a94a020fc2a; local timing27-receipt.json records158.36s including
cold ASR startup. This is not a human word-timing acceptance. Next round28 audition.

## Voice Manipulator round26 — VM-WORD-TRUST-01 (2026-10-16)

Generated-word mapping no longer promotes recognizer splits, substituted text,
explicitly untrusted/estimated observations, overlaps or invalid bounds to trusted
Script anchors. Valid short intervals and processor provenance survive; estimates
never exceed PCM length. New clip identity includes timing policy2 to avoid reusing
legacy annotations. Published audio/history stay immutable. ADR0086 explains the
tightened old substitution test and the one-time pending-job/cache invalidation.
Eight new regressions failed before correction; affected API66 now pass. Existing
natural Vietnamese25-word DTW data preserves every boundary/trust/provenance with
unchanged source SHA in a private project copy; no new inference/human claim.
Next round27 adds explicit timing repair without TTS. Checkpoint A stays open.

## Voice Manipulator round25 — VM-CHECKPOINT-A-01 (2026-10-16)

Checkpoint-A artifact integration verifies all three real natural-Vietnamese
variants in one comparison group: exact native2.16s replacement,8s composite,
0clip, unchanged outside PCM/source/model reference/metadata. Production HTTP
WAV/206 Range, line SRT, CSV, conservative word-cue omission and sentence rejection
pass before and after Unicode-folder move plus HTTP Open Existing/fresh API.
See `docs/gates/vm-checkpoint-a-artifacts-20261016.md` for hashes and manual steps.
Full frontend890/108files passes with maxWorkers2 after correcting a pre-existing
wall-clock-aged OBS caption fixture; no assertion, timeout or threshold relaxed.
Typecheck/build168modules/diff pass. Full frozen API1056 passes in690.63s with
3 warnings:2 existing deprecations and1 intentionally duplicate ZIP-entry warning.
The API Python snapshot remained unchanged while the frontend-only fixture was
corrected. Earlier UI888/890 failure remains in the gate evidence.
Five-round21–25 batch is delivered as separate commits. Checkpoint A as a whole
remains OPEN for human A/B/C identity/prosody/splice listening, acoustic word
anchors, browser playback/native Save-cancel and earlier expressive/performance
gates. Both UI tools failed kernel initialization os error3, so HTTP/component
checks are not called native UI acceptance. Next close those gates; do not begin
new VC/Isolator/Dubber processors. Phase03 stays60%; no portable or push included.

## Voice Manipulator round24 — VM-PATCH-02C (2026-10-16)

Immutable per-output history journals, cross-strategy comparison groups and
audition/open UI now retain accepted revisions independently of the current draft.
Legacy pointers remain readable; journal-first Apply recovers failed latest-pointer
writes and repeated older Apply without duplicate outputs. Hash/PCM/lineage/target
checks reject invalid history entries with a visible count. API48 focused plus
updated production-route1, affected UI25/typecheck/build pass. ADR0085.
Actual same-source/text/2.16s native comparison now contains context, trained LoRA
with clean reference and hybrid; all three composite8s192000frames,0clip, delta0,
no padding/trim and unchanged outside PCM/source. History returns3 valid entries
with one comparison key. Trained118.61s, hybrid131.31s include integrity reads;
no interactive latency or subjective identity ranking is claimed. Receipts under
`.scratch/vm-rounds21-25/`. Broader UI run888/890 exposed OBS caption failure and
one timeout; isolated68 rerun67 pass with the caption failure still reproducible.
Round25 diagnoses that failure and closes frozen regression/artifact/export/move
checks. Human listening, calibrated word timing and native/browser acceptance
remain separate open gates. Phase03 remains60%.

## Voice Manipulator round23 — VM-PATCH-02B (2026-10-16)

Patch now chooses natural ripple or native source-duration generation. Exact
sample budgets, conservative text feasibility, neutral-speed requirement and
strict artifact fitting apply across all three media strategies and trained
output Patch. Old ripple cache identity stays compatible. API44 focused,
affected UI13/typecheck/build pass. ADR0084 records limits and no speech cutting.
Actual context clone on natural Vietnamese words generated51840frames/2.16s
natively with0padding/trim/clip. Composite192000frames/8s, delta0, splice0.04114FS,
outside PCM/source/idempotence/lease pass; output-19c33d154a69, receipt
`.scratch/vm-rounds21-25/context23-receipt.json`. Fixture confirmation was an
automated test acknowledgement, not human listening. Replacement words remain
needs-alignment; exact span length is not exact word timing. Next round24
VM-PATCH-02C durable history/comparison, then Checkpoint-A verification.

## Voice Manipulator round22 — VM-PATCH-02A (2026-10-16)

Reviewed whole-word target receipts pin source/metadata hashes, indices, PCM bounds
and Script revision; stale or missing review blocks all three media strategies.
Source playback remains available before review. STT transfers one qualified span
without leaking source indexes into generated-output selection. Strategy1 uses the
trained model's clean saved reference without context. API47 focused plus updated
production routes/raw processor11, affected UI81/typecheck/build pass. ADR0083.
Private natural Vietnamese fixture verifies exact source crop frames2524560–2716560
and25 persisted DTW words, provenance-linked imported speaker, target98880–150720.
No word times were invented; human review is false and the real fixture remains
blocked awaiting review. No human timing/identity or browser acceptance is claimed.
Next round23 VM-PATCH-02B native source-duration generation, then history and
Checkpoint-A verification. Phase03 remains60%.

## Voice Manipulator round21 — VM-PATCH-HYBRID-01 (2026-10-16)

Hybrid uses compatible same-speaker full/LoRA plus selected source context without
mutating trained Voice Model/reference or falling back to clone. Separate hybrid
jobs/receipts/UI preserve cancel/retry/revision checks. API15 + production-route1,
affected UI76/typecheck/build pass. Actual LoRA hybrid20.32s487680frames0clip,
splice0, outside PCM/source/model/reference/idempotence/reopen/lease pass. Same
known-utterance human assembly as round20; human A/B/C identity/delivery and word
alignment remain open. Next VM-PATCH-02A reviewed spans, then02B timing,02C history
and Checkpoint-A-01 verification in this requested21–25 batch. Phase03 stays60%.


## Voice Manipulator round20 — VM-PATCH-REF-01 (2026-10-16)

Context clone Patch now selects trusted same-speaker source spans from imported
or recorded Media Assets, previews reference transcript/audio, and uses a temporary
base-model clone without training or Voice Model publication. Explicit Apply
preserves source PCM outside the target and full usable transcript/speaker runs.
Actual human-speech assembly fixture:20.32s487680frames0clip, splice0, original/
reference/source invariance, idempotence, moved Open Existing and identical HTTP
WAV download pass. First clipped inference was rejected; explicit retry now
creates a fresh immutable clip. Frozen regression closure is recorded in the
combined gate. Source24kPCM only; acoustic noise/identity/listening/browser and
word anchors remain open. Five-round batch16–20 source work is delivered.
Next planned round: VM-PATCH-HYBRID-01 (trained model plus same-speaker context).


## Voice Manipulator round19 — VM-PATCH-01 (2026-10-16)

Trained same-speaker full/LoRA Patch now generates replacement/composite previews,
owned Stop/retry/reopen and explicit immutable Apply with natural-duration ripple.
UI opens replacement Script with the result and retains source/output history.
API20/UI73/typecheck/build pass; real full model result5.07s121680frames0clip,
source/outside PCM/idempotence/reopen/lease pass. Expressive/timing/gain requests
fail explicitly. Next VM-PATCH-REF-01 completes the five-round owner batch.
Human listening, identity and calibrated word timing remain open.


## Voice Manipulator round18 — VM-FLOW-01 (2026-10-16)

Whole-sentence output/selection transfer to Patch now preserves immutable source
voice/profile, frames, audio/metadata hashes and Script/edit revisions. Stale and
late replies cannot attach to another source. API11/UI59/typecheck/build pass;
actual trained-speech source transfer/reopen/hash invariance verified. Patch
processor remains visibly unavailable in this round. Next VM-PATCH-01 then
VM-PATCH-REF-01 to complete the owner batch. Browser/listening gates remain.


## Round17 — VM-FIX-02

Immutable Apply/gain/target carryover/reopen, API48/UI75/build and real speech
5.71s137040frames0clip/gap/row/hash/move pass. Next Flow01, Patch01, PatchRef01.

## Round16 — VM-FIX-01

Incremental clips/job receipts and UI verified: API12/UI18/build, actual full voice
2.68s64320frames,0clipping, no-op/source hash/lease pass. Apply/composition next
VM-FIX-02, then Flow/Patch/PatchRef under owner five-round request. Phase03 60%.

## Voice Manipulator rounds11–15 — 2026-10-15

Scope and evidence: `docs/gates/voice-manipulator-rounds11-15-20261015.md`.
Stretch is preview, not regenerated or reviewed speech timing. Delivery/random
conditioning remain unverified processors. Next planned VM-FIX-01 retains these
gates; STT acoustic review and original OBS/source-library queues remain.

## Project Reference

See: `.planning/PROJECT.md` (status reconciled 2026-09-22)

**Core value:** One portable project carries audio through transcription,
training, generation, conversion, and later LipSync with honest lineage.
**Current focus:** Phase 03 Voice Training — gated publication.

Detailed plan-vs-code evidence: `docs/PROJECT-STATUS.md`.

## Voice Manipulator — next five rounds completed in source (2026-10-15)

Owner-directed VM-REF-DETAIL-01, VM-REF-RESOLVE-01, VM-TIMING-REF-01,
VM-NAV-01 and VM-DURATION-01 delivered slots/navigation, property resolution,
portable timing templates, selection markers and native sample-budget synthesis.
Actual32-step GPU clone audio passed natural1.78s/short1.42s/long2.60s,
two-profile4.95s including.35s pause, timing-template override, replay2/2 and
move/Open Existing reuse2/2 with preserved hashes. No clipping; gap/boundaries0.
CPU attempt timed out; owned workers/lease closed. Live HTTP actual-speech
measurements/plans/revision/move passed. Full backend885 and affected53 pass;
frontend853/typecheck/build pass; exact history is in the combined gate. See ADR0077 and
`docs/gates/voice-manipulator-rounds6-10-20261015.md` for exact results/limits.
Human listening/identity, measured word anchors and native browser UAT remain
open. Delivery/loudness/random/Fix and audible stretch are later rounds.
Next **VM-RIPPLE-01**. Phase03 remains60%; no portable/push; prior queues retained.

## Voice Manipulator — first five rounds (2026-10-15)

Implemented main-source Script hierarchy/settings persistence, independent
reference footage roles/import, shared time/word/text selection/readouts and
frozen-scope multi-reference assignments. Live API actual PCM import, atomic
assignment, revision/idempotency, move/Open Existing and source hashes passed.
CPU/sandbox GPU attempts failed; native GPU execution created a real full-model
2.2s WAV, followed by actual full/clone/LoRA Script edit/reuse/Stop/retry/move UAT.
Two imported profiles retain provenance; words remain estimated. Frontend844 /
backend870/build and PCM/hash/boundary checks pass. Browser unavailable. Requests
for timing/delivery/gain/reference remain intent until later named processors.
Final automated results and commits are in the combined first-five gate; ADR0076
records persistence/selection/binding decisions. Next VM-REF-DETAIL-01 includes
clicking slot content to navigate both Timeline and Script. Phase03 remains60%,
no new portable. Existing source-library/Collection native-GPU UAT not completed.

## HUB-COLLECTION-01 — Hub and Collection feedback (2026-10-14)

Main-source hover/detail geometry, compact header, profile count, expandable
model rows and profile/model export selection delivered. Native ZIP selection /
folder export and archived-model >=15s PCM sample jobs preserve hashes/Script.
Verified Dataset Manifest snapshots provide duration for new archives; old
unknown metadata remains explicit. Frontend818, focused backend88, typecheck /
build and real browser evidence pass. Full backend848/3startup timeouts; exact
unchanged rerun3/0. Actual Anh Vũ CPU attempt stopped without WAV after583.06s.
HUB-COLLECTION-UAT-01 requires native dialogs and real trained GPU sample;
SOURCE-EXTERNAL-ASSETS-01 remains next implementation. No Phase03 advance or new
portable. See docs/gates/hub-collection-01-20261014.md.

## SOURCE-SYNC-01 — source publication and cleanup (2026-10-13)

Owner now prefers GitHub Desktop source sync for daily tests. Research notes
committed; redundant start/restart BATs removed; unique setup/upstream-update/
legacy pack BATs moved to scripts/maintenance. Root retains console/OBS install/
verify/update.7601temporary targets and2249empty directories removed; owner
projects/media/core/model/dependencies and issued packs retained. Final pass
0failures; Syncthing marker classification error recovered and protected.
Native focused63pass/2warnings, frontend menu4pass, typecheck/build pass.
Actual push of9a00345 to origin/feat/03-04-high-quality-training verified by SHA.
See docs/SOURCE-SYNC.md, ADR0074 and docs/gates/source-sync-01-20261013.md.
This configuration round does not advance Phase03 (60%) or issue a new portable.
Next SOURCE-EXTERNAL-ASSETS-01 implements full-source packaging and one local
core/model library path, verified Python/app/Studio origins and cross-drive
artifact parity. Current launchers still require the existing local runtime
layout; cloning alone is not runtime provisioning. Physical OBS/GPU and timing
acceptance remain open.

## PORT-FEEDBACK-03 — immediate media and voice slots (2026-10-13)

Main source emits slots before import/capture/generation awaits, with working
animation, static choice/error states and real receipt replacement. Mic/system/
HQ keeps capture identity and save retry; OBS Start ack refreshes/deduplicates
journals; separate OBS MKV import stays tracked across pages. Generate Voice
shows progress in the first Output row. No engine/model changes. Alpha0.5.13
ships identical154source/payload/installed entries; ZIP1,227,314bytes; native
root UPDATE33/0, base-layer manifest unchanged. Frontend814/84files, backend819,
typecheck/build/diff pass. Source/embedded portable held-import DOM/animation
match; real5s24kHz mono16-bit WAV source/cache hashes match, then pending clears.
See docs/gates/portable-feedback-03-20261013.md and ADR0073. Next exact round:
PORT-FEEDBACK-UAT-03 — D-drive0.5.13 apply and physical first-slot/working/error/
ready acceptance for import, mic/system/HQ, OBS and Generate, plus prior mixer/
bin/voice-transfer checks. Physical zero-PCM OBS cause and GPU/native acceptance
remain open; independent timing awaits Conviction. Phase03 stays60%.

## PORT-FEEDBACK-02 — source-first selection and voice transfer (2026-10-13)

Main source repaired before issuing alpha0.5.12. Only selected tracks own
players/Script; session Gain/Mute/Solo survives changing view/selection, S sits
below M and Mute wins. Failed stopped OBS journals now support menu/bin/restore
and confirmed deletion under processing/path guards. Voice Collection supports
verified external LoRA/full/RVC ZIPs retaining artifacts/lineage without base.
Frontend795/84files, backend819, typecheck/build pass; actual root UPDATE33/0,
154app byte/hash checks and1,223,639byte ZIP verified; model layer unchanged.
Source/embedded portable browser selection/mixer reports match; source export
imports into portable and native re-export retains payload/lineage. Evidence:
docs/gates/portable-feedback-02-20261013.md. Exact next PORT-FEEDBACK-UAT-02 is
D-drive0.5.12 apply, failed OBS menu/bin/restore, one/two-track/Mute/Solo and
actual trained voice ZIP/inference acceptance. Physical OBS zero-PCM cause
remains unconfirmed; independent timing awaits Conviction. Phase03 stays60%.

## PORT-REBUILD-01 — fresh portable and manual base copy (2026-10-13)

Alpha0.5.11 ships the current rebuilt app independently of twelve heavy base
components; VibeVoice stays listed without payload. Canonical Studio source,
atomic zero-failure readiness, shared OBS row actions and older versioned console
launcher migration verified. Frontend785/84files, backend799, installer33,
builder/completion9, typecheck/build pass. Actual hydrated root VERIFY33/0;
thin kit remains incomplete.151app hashes/1.17MiB ZIP verified; complete components
about35.6GiB.174routes/eightcatalogs match with intentional omissions/metadata
recorded; real PCM publishes MKA/analysis WAV and proper browser waveform.
No-PCM meter control matches error; owner D-take remains uninspected. Evidence:
docs/gates/portable-rebuild-20261013.md. Exact next PORT-FEEDBACK-UAT-01 uses new
D-folder/manual base copy/VERIFY/closed-OBS INSTALL, native Forward/durable PCM
capture, prior playback/STT/bin. Timing awaits Conviction; Phase03 stays60%.

## PORT-OBS-REPAIR-01 — default OBS installer recovery (2026-10-13)

Alpha0.5.9 changes the root BAT default to CLI auto mode: damaged or missing
installed files select Repair; healthy/fresh/older installs use Install.
WinPS native stderr capture now retains Python exit code and original reason.
Installer29pass, frontend785/84files, backend786pass, typecheck/build pass.
Actual received pack33/0,151 installed/ZIP hashes verified, models unchanged.
Embedded Python/real package probe repairs DLL/brand, preserves pairing and
refuses repair while simulated OBS runs. Real OBS/user profile untouched.
Evidence: docs/gates/portable-obs-repair-20261013.md. Exact next
PORT-FEEDBACK-UAT-01: owner applies0.5.9 on D-drive, closes OBS, runs root INSTALL,
reopens to confirm native plugin loading, then prior playback/bin acceptance.
UAC/OBS loading needs physical evidence; timing awaits Conviction. Phase03
stays60%.

## PORT-UPDATE-LOCK-01 — updater controller shutdown (2026-10-13)

Alpha0.5.8 detects/stops the whole portable stack before replacing services/api,
which the surviving controller held as its CWD. Verified free ports and real
process exit precede mutation; console reopening after update/rollback reloads
all roles. Native16pass, frontend785/785, backend779/779, typecheck/build pass.
Real embedded controller and installed pack33/0,151
payload/ZIP hashes verified, base/model unchanged, source PIDs survive final
isolated tests. Evidence: docs/gates/portable-update-lock-20261013.md. Exact next
PORT-FEEDBACK-UAT-01 is owner D-drive0.5.8 pack APPLY once, update retry and prior
playback/bin/native OBS checks. Native window/UAC/GPU evidence remains; Phase03
stays60%.

## PORT-FEEDBACK-01 — portable feedback repairs (2026-10-13)

Alpha0.5.7 includes Script/Timeline track identity after STT, Recycle Bin
content sizing/scrolling, native WinPS installer arguments/UTF-8/errors, OBS
pairing launcher migration and the four root BATs. Frontend785/785,
backend774/774, typecheck/build pass. Actual migration and final root UPDATE33/0,
151-file payload/ZIP verified, model inventory unchanged. Real embedded portable
UI and isolated installed BAT checks pass. Candidate0.5.6 is diagnostic-only
after integration found the OBS launcher gap. Evidence:
docs/gates/portable-feedback-20261013.md. Exact next round:
PORT-FEEDBACK-UAT-01 — owner applies0.5.7 on D-drive, retests parent/child
playback and bin, installs with OBS closed and verifies loading after restart.
Native target-machine/UAC/GPU behavior needs physical acceptance; Phase03 stays60%.

## PORT-STT-01 — portable STT catalog (2026-10-13)

The API catalog checked a development-only path, disabling all Whisper choices
and the STT button despite ticked footage. Resolve the bundled sidecar first;
production-endpoint/moved-root regressions and native Windows PowerShell probe
pass. Candidate0.5.4 was rejected and rollback confirmed before issuing0.5.5.
Actual alpha0.5.5 BAT31/0,153-file ZIP verified, base unchanged. Related
backend34/Media Pool56/typecheck/build pass; full755pass/3fail then those3pass
unchanged separately. Real portable CPU/int8 offline Largev3/Medium return21words,
4s PCM/source artifacts verified. See docs/gates/portable-stt-20261013.md.
Exact next round: owner's D-drive alpha0.5.5 update and Medium/Largev3 run.
Target-device performance and independent timing/recognition gates remain;
Phase03 stays60%.

## PORT-IMPORT-01 — native Media Pool connection (2026-10-12)

The real registry dropped selected native paths, confirmation/cancel, pending
work/errors and retry. The owner-reported silent import was reproduced before
the fix in tests and the installed portable UI. Four regressions now exercise
both real registry branches; affected frontend117/117, full784/784, related
backend9/9, typecheck/build pass. Source embedded-core UI imports real WAV.
Alpha 0.5.3 was allocated automatically and has a verified 153-file app-only
ZIP (1.16 MiB). Actual pack BAT passed30/0; updated portable UI imported WAV,
MP4 and two-track MKV, displayed errors/retry and retained media after reopen.
Six PCM24k mono artifacts and playback URLs passed; base manifest hash is
unchanged. See docs/gates/portable-media-import-20261012.md. Exact next round: owner's D-drive alpha
0.5.3 import retry and fixed-media STT benchmark. Phase03 stays60%.

## PORT-UPDATE-03 — numbered portable updates (2026-10-12)

Creating a pack increments patch automatically. The owner copies its original
numbered folder into `updates`; the portable discovers the newest compatible
version. The payload-root failure was reproduced and repaired; new pack
entrypoints apply alpha 0.5.1 to the actual portable with 30/0 gates.
Regression9/9 and UI build pass. Evidence:
docs/gates/portable-numbered-updates-20261012.md. The owner reported a successful
D-drive alpha 0.5.1 update with 30/0 gate. Startup and benchmark on that machine
remain; Phase03 stays60%.

## PORT-VERSION-01 — portable app release version (2026-10-12)

Source `APP-VERSION.json` defines alpha 0.5.0. The pack and installed app
manifests record it, and `VERSION.txt` labels the pack. Two BAT updates passed
30/0; same-version changed content and older version were rejected before
mutation. See docs/gates/portable-release-version-20261012.md. Physical
target-machine verification remains; Phase03 stays60%.

## PORT-UPDATE-02 — portable transfer handoff (2026-10-12)

UPDATE-PORTABLE.bat inside the development portable now creates a stable
updates/app-current pack after each successful app refresh. Repeated runs
and direct VERIFY-PORTABLE.bat passed 29/0. See
docs/gates/portable-update-handoff-20261012.md. The physical copy to
another machine and fixed-media benchmark remain; Phase03 stays60%.

## PORT-UPDATE-01 — app-only portable refresh (2026-10-12)

Source and portable BAT files create and apply a hashed app-only update.
The app and base runtime/model manifests are separate; the model payload is
untouched. Auto-discovered source update passed 29/0, tamper was rejected and
post-gate failure restored exact prior bytes. Evidence:
docs/gates/portable-app-update-20261012.md. Physical target-machine
verification and fixed-media benchmarking remain. Phase03 stays60%.

## USER-FEEDBACK-25 — Media cache choice and reveal (2026-10-12)

The primary host import and completed-container track dialogs offer “Cache
file”. The API now records original paths in the machine-local registry and
reveals original or project copy separately; project reveal is disabled when
uncached. Browser upload always creates a project-owned source. Focused API7/7,
frontend104/104, full frontend780/780, backend744/744, typecheck/build pass.
Native limits: `docs/gates/user-feedback-25-media-cache-reveal.md`. Phase03
stays60%.

## USER-FEEDBACK-24 — Script speaker turns (2026-10-12)

Ordinary and channel Script tables now show Speaker 1/2 labels before a Profile
is mapped. The selected-word menu reassigns a phrase to an existing
diarization speaker, deriving A–B–A or joining a neighboring matching row.
Word timing and raw speaker provenance remain unchanged. Focused70/70, full
frontend777/777, typecheck/build and backend742/742 pass. Native acceptance is in
`docs/gates/user-feedback-24-script-speaker-turns.md`. Phase03 stays60%.

## USER-FEEDBACK-23 — API readiness during project recovery (2026-10-12)

The incident's 23-project recovery scan took 41.657 seconds; API readiness
timed out at 61.067 seconds before Uvicorn bound its port. Slow recovery now
continues after the listener opens, with a one-second wait for fast projects.
Real Uvicorn regression and backend742/742 pass. Verify a source-launcher
restart on the owner's project set; rebuild the older portable bundle before
using it to test this source change. Evidence:
`docs/gates/user-feedback-23-api-readiness-recovery.md`. Phase03 stays60%.

## PORT-NOVIBE-01 — portable variant without VibeVoice (2026-10-12)

Built and locally verified the 35.98 GiB `NoVibeVoice` folder. VibeVoice model
choices remain listed as unavailable. Exact next portable round: copy the folder
to another machine, run its gate, and benchmark installed models against fixed
media. Evidence: `docs/gates/portable-no-vibevoice-20261012.md`. Phase03 stays
60%; STT-TIMING-ACCURACY-01 is still the next planned feature round.

## USER-FEEDBACK-22 — source-independent Script playback following (2026-10-10)

Product `6c2d714` fixes the missing archived/multitrack Script follow behavior.
ChannelScript previously highlighted source words but had no viewport-follow
effect. Ordinary footage, imported parent/child and archived OBS parent/child
now use shared source-aware playback following and virtual reveal. Deliberate
Timeline scrubbing resumes follow even within the same word; manual reading
still pauses it. Simultaneous tracks keep their highlights with one stable
scroll focus. Multitrack plain text follows/highlights without replacing native
editing selection, and VoiceScript tables share the follow policy. Audio and
word timings are unchanged. ADR0067 records the behavior contract.

Initial registry regressions failed5/6 before the correction. Final full frontend
772/84 passes in98.94s with two workers; typecheck/build/diff pass. Backend741
passes /2 existing warnings in192.19s. Default-worker validation initially had
an existing scroll timeout and live-caption assertion failure; the complete
bounded runs passed without changing assertions or timeouts. Evidence:
`docs/gates/user-feedback-22-script-playback-parity.md`.

Native browser acceptance remains: refresh OBS9 and an imported project, drag
to offscreen words, scroll Script manually, drag again within the same word and
switch parent/child or plain text. Controlled DOM geometry does not prove native
scroll/pixel behavior. Exact next planned round: **STT-TIMING-ACCURACY-01
independent anchor review** after the owner finishes the Conviction timing
reference, required for independent acoustic boundary measurement. Phase03
stays60%.

## USER-FEEDBACK-21 — canonical Script word spacing (2026-10-10)

Product `9faf5d3`: ChannelScript now uses the canonical `script-table__word-wrap` around each
word, as ordinary ScriptTable and VoiceScript already do. Inline spans had
allowed trailing spaces to contribute extra inter-word spacing in imported/OBS
channel transcripts. The existing inline-block wrapper gives these transcripts
the Conviction/screenshot1 spacing without a project-specific CSS adjustment.
Text, timestamps and commands are unchanged.

Two stylesheet regressions failed before the fix and pass after it. Focused38/4
passes, including editing, command routing and transcript-window tests. Full
frontend752/83 passes in97.32s; typecheck/build/diff pass. Backend741 passes /2 existing warnings in224.01s. Evidence:
`docs/gates/user-feedback-21-script-word-spacing.md`.

Refresh and compare Conviction and OBS9 at the same Script SIZE. Native glyph
geometry remains owner acceptance; computed-style/markup checks do not measure
it on the owner's device. Exact next: **STT-TIMING-ACCURACY-01 independent anchor
review** after the owner finishes the Conviction timing reference, needed for
independent acoustic boundary measurement. Phase03 stays60%.

## USER-FEEDBACK-20 — Script command parity (2026-10-10)

Product `c253313` removes row-selection/source-feed disabling of valid Script
controls. Row profile dropdowns always open, including an empty catalog, and
always offer Chưa gán Profile. Opening an unselected row selects it only when
there is no existing selection; assignment/unassignment touches selected rows.
The same control rule applies to ordinary footage, channels and VoiceScript.

Archived parents now supply real child documents to table/text, Find/Replace,
AUTO NHỊP, Clear Text, Export and AI fix. Each source retains its own offsets,
word timings and labels. Multi-document edits use one Undo/Redo step. AI
candidates remain choices; late replies preserve newer edits and removals.
Other shared-module routing was audited; matrix and limits are in
`docs/gates/user-feedback-20-script-actions.md`. ADR0066 supersedes ADR0065's
archived-aggregate action restriction. Pending live drafts still require an
archived word document for destructive/word-document operations.

Five original caller repros failed before the fix. Final frontend750/83 passes
in93.46s; typecheck/build/diff pass. Backend741 passes /2 existing warnings in189.09s.
No selection assertion or performance budget was removed or relaxed.

Native acceptance remains after refresh: try profile assign/unassign, selected
rows only, table/text, Find/Replace, pause formatting, Undo/Redo and parent
Export/AI fix in Conviction and OBS9. Automated evidence does not prove native
popup rendering. Exact next: **STT-TIMING-ACCURACY-01 independent anchor review**
after the owner finishes the Conviction reference, required for independent
acoustic boundary measurement. Phase03 stays60%.

## USER-FEEDBACK-19 — shared Script table (2026-10-10)

Product `278188d` makes ordinary footage, imported/archived channels, pending
OBS and VoiceScript use shared transcript table/header/row/speaker/selection
components. Separate channel cards are removed. Default columns and browser
column preferences now apply across projects and sources; legacy per-footage
keys are retained but no longer applied.

The profile dropdown is beside the16.8px checkbox (30% smaller), with its row
number underneath and channel name directly below the dropdown. Selected-only
assignment/unassignment remains; VoiceScript plain-click untick is repaired.
Text formatting and vertical scrollbar chrome are shared. Aggregate/live
export/clear/AI controls remain visible but disabled until a child document is
opened; live segment timing/profile readiness is not represented as archived
word data.

Focused92/7 and full frontend728/80 pass; typecheck/build/diff pass. Backend:
741 passed /2 existing warnings in206.62s. Full frontend preceded the final
code-tag timestamp/title polish, then all92 affected tests and typecheck/build
passed again. Evidence: `docs/gates/user-feedback-19-script-layout.md`;
shared presentation contract: ADR0065.

Native acceptance remains after refresh: compare Conviction and OBS9 parent/
child rows, checkbox/profile/track layout, long scroll and Voice Model selection.
DOM/CSS regressions establish structure and styles, not appearance on the owner's
device. Exact next: **STT-TIMING-ACCURACY-01 independent anchor review** after the
owner completes the Conviction benchmark. Phase03 stays60%; acoustic timing
accuracy, production defaults, media and model jobs are unchanged.

## USER-FEEDBACK-18 — subtitle text insertion (2026-10-10)

Product `3186a8e` adds **Add text** to subtitle context menus and an
inline multiword editor on double-clicking a timing gap. Ordinary, imported
multitrack and archived OBS lanes share the editor. Hidden words still edit by
source timestamp; Ctrl-click and existing word actions remain available.

Inserted tokens receive separate equal positive provisional spans with small
spacing, bounded by adjacent words/audio end. Exact old word identities and
timestamps survive, including repeated text and tiny gaps. A no-room insertion
shows an inline alert and commits nothing. Enter/blur commits once; Escape
cancels. The input remains inside the viewport and Script updates through the
existing asset callback/history path.

Focused102/5 and final frontend715/78 pass; typecheck/build/diff pass. The first
full run714/1 exposed hidden-word editing and was repaired without changing its
assertion or DOM budget. Full backend: 741 passed /2 existing warnings in227.20s.
Evidence: `docs/gates/user-feedback-18-subtitle-text-insertion.md`.

Native device acceptance remains after refreshing the built UI. Exact next:
**STT-TIMING-ACCURACY-01 independent anchor review** when the owner finishes
Conviction. That reference matters because provisional interpolation is not
acoustic truth. Phase03 stays60%; timing defaults/budgets remain unchanged.

## USER-FEEDBACK-17 — subtitle grips and word visibility (2026-10-10)

Product `3669099` / `05a5ce9` repairs subtitle rendering in one bounded round. Trim grips
sit outside and above readable word boxes; a separate clipped label keeps text inside.
Grip width reserves no layout/time space and selection changes no source words
or neighbouring timestamps. Compact overview stripes retain hidden grips.

The missing previous word was reproduced through Timeline audio-clock updates:
floating-point pixel collisions/search boundaries dropped a touching readable
box when the active neighbour changed. Shared density arithmetic now preserves
these boundaries at1e-6 pixel precision, with strict4px compact occupancy and
visual overshoot clipping. Ordinary, imported and archived OBS views use the
same helper; focused editors share the Timeline label/grips.

Original-product replay has3 regression failures (5px grip intrusion, density
omission, missing DOM word). Repaired focused36/4 and full frontend704/78 pass;
typecheck/build/diff pass. The full pass uses two workers with original test
budgets retained, after a loaded default run failed Script wheel/live-caption
checks; affected files also pass separately58/2. Full backend: 741 passed / two existing warnings in223.39s.
Gate `docs/gates/user-feedback-17-subtitle-grips-visibility.md` records evidence
and resolved test-setup failures. No owner runtime restart/model job/media edit.

Native screenshot/audio acceptance remains after reloading the built UI; the
prior automatic browser approval rejection is respected without a workaround.
The owner will carefully review timing in Conviction. Exact next remains
**STT-TIMING-ACCURACY-01 independent anchor review**: after owner confirmation,
freeze the reviewed regions/PCM/word identities as a separate benchmark copy.
That project can supply anchors without repeating the offline worksheet. Human
IN/OUT accuracy remains unmeasured, timing defaults unchanged; Phase03 stays60%.

## STT-TIMING-ACCURACY-01 — isolated screen and anchor tooling (2026-10-10)

Measurement/tooling `08918b7` retains three exact mono PCM16/24kHz crops
(OBS9 236–272s; speech-2 55–66s and 75–82s), 148 native and edge-refined words
from the same private CPU/int8 Studio passes, and a separate cached Vietnamese
250h CPU alignment. Production timing defaults and owner runtimes are unchanged.

Candidate has 150/150 raw timed words. OBS confidence >0.3 is 97/104 =93.27%,
below the unchanged95% gate. Two cases contain leading transcript words absent
from the native timed-word lists; safe identity mapping is withheld rather than
shifted. Safe comparison coverage is104/148 =70.27%, below98%. Pooled candidate
VAD-proxy onset mean142.53ms also exceeds80ms; this is not human IN/OUT truth.
Short-crop intervals have no invalid/zero/overlap cases; prior zero-PCM timing
remains unresolved because decode context changed.

The blind offline worksheet has24 targets, exact audio and empty manual IN/OUT.
The scorer binds protocol/audio/word identity, reports missing/lexically corrected
words and checks IN/OUT p95 separately against250ms. Human anchors are absent:
errors and acceptance remain unmeasured. No timing winner/default is accepted.

Focused23 and full API741/two existing warnings pass; compile/JS syntax/diff
checks pass. Prior frontend701/77/typecheck/build is carried, not rerun. Closure
rehashes23 previous read-only sources, both current PCMs and all3 crops unchanged.
Recognition RSS is unavailable; alignment RSS is measured. First NLTK path denial,
protocol amendment and derived clock repair are retained transparently in the
gate. Browser/audible acceptance remains unverified; no automation workaround.

Gate `docs/gates/stt-timing-accuracy-01.md` and aggregate JSON document evidence.
The bounded profiling/tooling slice is complete; Phase03 remains60%. Exact next
**STT-TIMING-ACCURACY-01 independent anchor review**: receive the matching
`reviewed-anchors.json` from the worksheet, measure paired errors, and resolve
untimed leading-word identity before a bounded correction or default change.
Broader speaker coverage and native Script/Timeline acceptance remain open.

## STT-GAP-02 — retained gap review and common-context screen (2026-10-10)

Measurement `cd86683` freezes reference PCM/protocol and retains real Studio
responses plus publication artifacts. Serial cached large-v3 A/B uses two
116.454s curated speech tracks and125s zero PCM:10 requests. Common60s owned
blocks +2s context improve micro CER11.2831 ->7.8382% and WER13.6364 ->9.5779%;
bounded text passes the inherited10%/20% screen. Pure silence emits zero words
in both modes. Publication handoff keeps the same text/counts, resolves one
raw seam overlap and has zero final overlaps; timing provenance stays partial.

Owner supplied independently heard/reference OBS9 text. The corresponding
expanded101-word passage scores CER30/310=9.6774%, WER13/101=12.8713%; this is
post hoc lexical review with context, not a77-word-only or acoustic timing gate.
All1,177 retained OBS words map one-to-one to owning raw records; starts are
unchanged and ends shorten at most20ms. No owner word data was replaced.

One bounded word interval remains wholly inside inserted zero PCM; lexical
hallucination versus neighboring-word displacement is unresolved. Independent
word anchors are absent, so <=250ms IN/OUT p95 is unmeasured. Focused API34
passed5.60s, profiler compile/reanalysis/diff pass,23 source hashes unchanged.
Full API718 and frontend701/77/typecheck/build are carried, not rerun. Studio
health ok/controller running; no restart/browser automation/source mutation.
Gate `docs/gates/stt-gap-02-context-screen.md` and aggregate JSON retain evidence.

Bounded STT-GAP-02 review/screen is complete; Phase03 stays60%, no acceptance
budget changes. Exact next **STT-TIMING-ACCURACY-01** independently anchors OBS
and boundary/zero-PCM words, measures timing, and screens a bounded correction.
Native Script/Timeline audio acceptance and broader speaker coverage remain.

## USER-FEEDBACK-16 — profile nesting and OBS word sync (2026-10-10)

Product `cc1a8fa` nests trained ProjectVoice models inside independently
expandable Speaker Profile slots, initially collapsed, with accessible counts
and retained selection/context/Collection controls. Imported models still hide
Add to Collection. Properties stays in its header column even without models.

Archived OBS now publishes per-asset active word indexes and accepts Script
seeks through the shared playback store. Subtitle clicks seek audio as well as
the playhead; single-track Script selection and repeat clicks seek correctly.
Silence clears highlights; asset refresh does not rewind. The focused standard
Timeline owns its clock and has local selection when opened from multitrack.

Real ModuleRegistry regressions fail before the repair and pass afterward;
review caught and repaired the multitrack focused-selection gap. Final frontend
701/77 files, typecheck/build/diff checks pass. API718/twoexistingwarnings is
carried from STT-GAP-01, not rerun. Read-only OBS9 confirms two stem/asset/parent
identities and original1094/42 word arrays; six metadata hashes are unchanged.
Gate user-feedback-16-profile-obs-sync; ADR0064. No source/model/data mutation
or runtime restart. Reload the built UI for the new frontend.

Native layout/audio interaction still needs owner acceptance because repository
jsdom tests cannot prove playback on the device; prior automatic browser review
rejection remains respected. Phase03 stays60% and recognition/timing budgets
remain open. Exact next development round **STT-GAP-02** reviews recovered gap
text and other long/boundary/silence samples; STT-TIMING-ACCURACY-01 remains open.

## STT-GAP-01 — OBS recognizer context repair (2026-10-10)

Product `2ebada4` repairs a reproduced recognition-context omission on real
OBS9 audio. Full406s input returns1,094 words and none in240.352–269.020s
before merging; raw recognizer segments also omit the region. VAD retains
speech there and a guard-off candidate is identical/rejected. Common Studio
requests now use60s owned intervals with2s context; initial frozen OBS snapshot
semantics remain. Both detailed and ordinary archive production copies retain
1,177 words, including77 in the gap. Each submitted PCM slice matches source;
1,325 source hashes stay unchanged and the owner still has its original words.

Merge recovers nonconflicting padding words, gives owning intervals priority,
sorts final output and rejects untimed segment text instead of hiding it.
Final retained real-response merge is unchanged; stored intervals have no
overlap/reversal. Source timing warnings remain. Full API718/twoexistingwarnings,
focused31, script compile/diff pass. Frontend696/77/typecheck/build is the
unchanged carried baseline. Gate stt-gap-01-obs-recognizer-context; ADR0063.

Normal controller/API/Studio health is ok; no service restart or browser
workaround. Restart loads the changed API, then explicitly rerun the selected
footage for new STT. Phase03 stays60%; word accuracy and reviewed IN/OUT budgets
are not satisfied by restored coverage. Exact next **STT-GAP-02** reviews77
recovered words and screens other long/boundary/silence samples; existing
STT-TIMING-ACCURACY-01 and native UX acceptance remain open.


## USER-FEEDBACK-15 — Collection profile/model import selection (2026-10-09)

Product `a06c2f8` groups Collection models by exact source project and Speaker ID.
Parent checks select all archived models in that Collection; expanded child
checks select a subset, with mixed parent state. Fixed import action adds no
selection toolbar. Imports run serially with catalog flush before every request;
confirmed models leave selection, failed/unprocessed models remain for retry.
Workspace publishes its changed catalog snapshot synchronously to the transfer
ref, preventing pre-render flush from dropping confirmed profiles.

API imports reuse one destination profile for the same archived origin, retain
manual edits and recover legacy markers/catalogs. Profile consent proof has
independent project ownership; each model retains its archived evidence/hash
snapshot. Copy/save failures roll back new artifacts. Lead review repaired header
CSS specificity and a reproduced child-folder containment gap. Existing artifact,
checkpoint and publication gates remain; unrelated equal names never merge.

Final frontend696/77, API712/twoexistingwarnings, typecheck/build/diff pass.
Focused UI8, Workspace44, Collection API22; isolated legacy proof/manual-edit/
actual-deletion check1 pass. Gate user-feedback-15-profile-model-import, ADR0062.
Native grouped-checkbox layout and audible owner-model output remain acceptance
after restart: fixtures prove transfers, not inference quality. Owner projects,
models and normal runtimes remain untouched; Phase03 stays60%. Exact next
STT-GAP-01 retains isolated OBS recognizer/merge evidence before missing-word repair.


## USER-FEEDBACK-14 — Library menus and imported generation (2026-10-09)

Product `99dc301` moves profile color/apply/delete/deselect and model bulk
delete/deselect into right-click menus. Tick selection inserts no toolbar.
Selected ranges, nested model scope, keyboard navigation and focus are retained.
Labels distinguish Speaker Profile identity from the trained ProjectVoice model.
Optional Collection origin persists on new imports and projects from bounded
legacy markers without rewriting owner records; imported models hide Add to
Collection. A generation category override makes imported trained voices available
immediately and on reopen without changing Training settings; a compact selector
permits manual category choice. Existing publication/engine gates remain.

Final frontend690/77, API706/twoexistingwarnings, typecheck/build/diff checks pass.
Gate user-feedback-14-context-menu-collection-generation and ADR0061 retain
red/green evidence and the old-toolbar caller test update rationale. Read-only
OBS9 confirms its existing full model is imported. Native narrow-menu layout and
audible generation remain device acceptance after restart; mocks prove request
routing, not model quality. Phase03 stays60%; owner media/model/runtime unchanged.
Exact next STT-GAP-01 retains isolated recognizer/merge evidence before repairing
missing OBS words, so existing text is not replaced without recognition evidence.


## USER-FEEDBACK-13 — contained Sound Library and Script row controls (2026-10-09)

Product `1532c47` contains profile/voice controls in compact Sound Library slots,
with fixed selection boxes, separate voice actions and explicit Properties.
Shared list bounds cover Input, standalone and Voice Manipulator. Channel Script
places profile choice with leading row controls. Plain ticks toggle membership;
Shift/Ctrl+A and selected-row-only assignment remain. Explicit null word speaker
IDs survive Script/Workspace/Timeline and compiler ownership, preventing cleared
rows from inheriting the footage default. Raw diarization remains provenance.

Frontend682/77, focused Script56/3 and compiler34 pass; typecheck/build pass.
Full API704/twoexistingwarnings and diff checks pass. Gate user-feedback-13-library-slots-script-profile,
ADR0060. Owner restart/reload and narrow-panel containment, clear/reopen and long
Script-end acceptance remain device gates. Native rendering cannot be proven by
source/jsdom checks. Phase03 stays60%; no owner media/model/runtime mutations.
Exact next STT-GAP-01 retains isolated OBS recognizer/merge evidence before repair.


## USER-FEEDBACK-12 — shared Timeline scale and Voice Collection (2026-10-09)

Product commit `23e6494` aligns standard/imported/OBS Timeline zoom and absolute
rulers at1,000px/s, including positive sub10ms fit, while retaining120s live feed
limits. Consent form spans the shared Sound Library, uses14px checkboxes and
Browse for project-owned evidence, with separate uploadAllowed permission.
Project Library Voice Collection and all Sound Library routes share create/list,
Add to Collection and Import from Collection, common classification properties,
portable copied artifacts and source provenance. Completed retained checkpoints
and published/passed linked-set gates are enforced; copy/retry/re-export hashes
stream and Windows checkpoint separators normalize without relaxing containment.
Catalog writes serialize; an independently reviewed350ms debounce race has a
red/green Workspace caller test and explicit synchronous timer cancellation.

Final frontend672/77, API703/twoexistingwarnings, typecheck/build/diff checks pass.
Focused Timeline88/5, backend35/4 pass; initial API699/oneWindows Stop confirmation
failure is retained, isolated1 and final full703 pass without Stop code changes.
Real retained LoRA fixture reaches its pending gate rejection; five source hashes
match and no entry publishes. Synthetic bytes verify transfer, not model quality.
Gate `docs/gates/user-feedback-12-zoom-consent-collections.md`, ADR0059. Owner must
restart to load new API/UI and accept max zoom, consent layout and collection
reopen/import on the device. Earlier browser policy rejection remains respected.
Normal runtimes/models, owner media/transcript and upstream are untouched. Phase03
stays60%; quality/calibration budgets remain open. Exact next STT-GAP-01 retains
isolated recognizer/merge evidence before replacing missing OBS word text.

## USER-FEEDBACK-11 — 2026-10-09

Commit `9c6c696` repairs React185 at an archived Script boundary. Row minimum
height changed with a one-word continuation; measured offsets updated while
viewport still held the previous position, alternating windows/corrections.
Publish matching corrected viewport and measurements in one batch, retaining
postcommit browser clamp/readback and existing presentation/scrollbar. Minimal
65+600-word hook and OBS9-shaped ChannelScript caller both reproduce the exact
maximum-update-depth error on baseline and pass after repair. Full frontend659/75,
focused20/4, typecheck/build/diff pass; API687 remains carried08 baseline.
Owner confirms jitter/runaway ceased and scrollbar present after10; end error
acceptance is now UX-SCRIPT-END-DEVICE-01 after reload. Gate
`docs/gates/user-feedback-11-script-end-react-depth.md`, ADR0058. Exact next
executable STT-GAP-01 retains isolated recognizer/merge results before replacing
owner text. No source media/transcript, services/models, schema/upstream or
Phase03-budget changes; stays60%. Native all-route/audible/device gates remain.

## USER-FEEDBACK-10 — 2026-10-09

Commit `9fcd554` stabilizes shared Script scrolling: semantic measurement caches,
anchor-preserving height changes, logical-row chrome and header offsets, and
manual browsing priority over playback/data-refresh follow. Table, prose,
archived channels and OBS realtime now share an explicit keyboard/pointer
scrollbar. Table toolbar no longer expands the scrollbar's region. Read-only
owner topology explains different routes: OBS1,136 words/10 turns/25 fragments;
Conviction665/15/19; PDCA42,107/3/659. Three red regressions reproduce anchor
movement, refresh cache churn and Script refresh returning5,000->0; green now.
Full frontend654/75 before final toolbar containment refinement; final focused
53/4, typecheck/build pass. Backend unchanged; API687 is carried08 baseline.
Gate `docs/gates/user-feedback-10-script-scroll.md`, ADR0057. Natural wheel
smoothness, end reachability and visible OBS scrollbar on the owner device still
need UX-EDITING-DEVICE-01 after reload; source/jsdom is not that acceptance.
Exact next executable STT-GAP-01 retains recognizer/merge artifacts on an isolated
copy; native Script acceptance can proceed alongside. No owner media/transcript,
normal service/model, schema/upstream or Phase03-budget change. Phase03 stays60%.

## USER-FEEDBACK-09 — 2026-10-09

Commit4568e3f repairs paused zoom/metadata/drag-release view movement, archived
playback follow and standard PCM detail after Stop. Repeated status/journal refresh
regression preserves the04:00 window. Actual owner media verifies normalized1ms
peaks and unchanged source hashes. Final realtime segment notes expose gaps in
trusted detailed-word coverage without changing word data or STT completion.
Frontend646/74, typecheck/build and relevant API waveform2 pass; full API687 is
carried08 baseline. Gate `docs/gates/user-feedback-09-obs-archive-view.md`, ADR0056.
Exact next STT-GAP-01 reproduces missing words on an isolated copy with retained
recognizer/merge artifacts: actual28.668s gap has audio/realtime text but no raw
segment checkpoints. UX-EDITING-DEVICE-01 natural scrolling, Stop waveform and
audible playback acceptance remains; original rapid jumping is not device-proven.
No services/inference/owner media or transcripts/schema/upstream changed. Read-only
normal closure status is API stopped/Studio running/busyfalse; restore normal
service operation before owner acceptance. Startup/device/LAN/word-truth and
Phase03-budget requirements remain.

## USER-FEEDBACK-08 — 2026-10-09

Removed unnecessary CA/proxy work for controller HTTP loopback clients. Controlled
Uvicorn/environment/early-import regressions pass; CLI captures bounded startup
frames and launchers preserve previous nonempty output. API687/two existing
warnings passes with E temp storage; initial C full fixture errors are recorded,
no owner files deleted. Actual normal controller1.897s/Studio4.354s/API11.393s
readiness passes; runtime/health running/ok and normal stack left up.
Gate `docs/gates/user-feedback-08-controller-readiness.md`, ADR0055.
Original PID25916 stack and idle/cold reliability remain unproven. Exact next
RUNTIME-READINESS-DEVICE-01 records normal idle/cold starts; then UX-EDITING-DEVICE-01
native OBS Stop/waveform/playback/editing acceptance. Frontend07 evidence carried.
No manual inference dispatch, schema/upstream or Phase03-budget change; stays60%.

## USER-FEEDBACK-07 — 2026-10-09

Owner confirms Record signal/overlap detection. Logged406-second stopped overview
exceeded the backend live120-second cap. Stopped full snapshots now permit bounded
recording duration with incremental600-bin extrema; live/cursor120 caps remain.
Immediate journal refresh and same-take overlapping bins retain Stop waveform.
Actual copied owner envelopes pass with600 audio points/channel; baseline adapter
reproduces422. Original MKA/two WAV hashes unchanged. Frontend639/73, API682/two
existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-07-obs-stop-waveform.md`, ADR0054.
Exact next UX-EDITING-DEVICE-01: reload, existing take overview and native >120s
Record -> Stop -> waveform/zoom/playback, plus prior editing/scroll acceptance.
Reviewed STT word truth and browser/physical/quality/LAN prerequisites remain.
No normal service/model, owner media or schema mutation; Phase03 stays60%.

## USER-FEEDBACK-06 — 2026-10-09

One-pass deletion preserves surviving word identity and commits once. Large Script
deletion runs in a Worker with cancellation/fences; pending/error feedback retains
UI control and source data. Changed-text history skips full snapshot serialization.
Table/prose timing notices scroll outside the transcript value with measured
virtual/overlay offsets. Logged historical-owner KeyError no longer blocks current
OBS journal writes; missing completed journals retain explicit errors. Fresh PCM,
waveform/transcript fixture and actual Worker bundle pass. Frontend637/73,
API680/two existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-06-script-deletion-and-obs-journal.md`, ADR0053.
Next UX-EDITING-DEVICE-01 real long-footage deletion/scroll and native OBS acceptance
needs permitted device checks after reload. STT-TIMING-ACCURACY-01 word truth remains.
No normal service/model, owner media or schema mutation; Phase03 stays60%.

## USER-FEEDBACK-05 — 2026-10-09

Timeline word edits route shared30-step history across overview/focused editors;
live drags cancel before undo. Per-word4px spatial filtering preserves source
identity with zoom detail. Atomic IN/OUT and direct drags warn at actual collisions,
retaining10%; tiny words/noncontiguous selections remain valid. Positive estimates
retain original timing and remain untrusted. Promotion guidance is a2s hover portal.
Studio phrase-edge fences prevent cross-word/adjacent-gap overlap. Frontend627/71,
API679/two existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-05-timeline-word-timing.md`, ADR0052.
Next STT-TIMING-ACCURACY-01 needs reviewed word truth and isolated comparison;
`docs/STT-TIMING-ACCURACY-PLAN.md` records previous aligner tail regression.
UX-EDITING-DEVICE-01 visual/audio and older prerequisites remain. No normal
service/model, owner-media or schema change; Phase03 stays60% and R5/R6 gates hold.

## USER-FEEDBACK-04 — 2026-10-09

Fragments remain bounded inside one speaker row; explicit/inherited same profiles
merge. Fixed selection controls and ordinals, checked-row-only attribution,
pointer/focus Ctrl+A and thirty-step project-session undo/redo are delivered.
Cross-track speaker assignments undo as one action. Dense subtitle summaries
restore readable overview text with zoom detail and original source timing.
Frontend611/70, API677/two existing warnings, typecheck/build pass; current gate:
`docs/gates/user-feedback-04-script-rows-subtitles-and-history.md`, ADR0051.
Owner confirms responsiveness from03. Next UX-EDITING-DEVICE-01 needs permitted
visual/theme/ordinal/subtitle/history/scroll and audible evidence. Existing tool
restriction and older physical/quality/download/LAN gates remain. Phase03 stays60%.

## USER-FEEDBACK-03 — 2026-10-08

Animated import placeholders precede metadata/cache choices and retain same-name
feedback. Expandable folder slots replace breadcrumb navigation. Multi-select
retains list IDs without loading Script/Timeline; bulk ticks change immediately
and save in order, fenced against stale opens/reads. Long Script fragments and
dense subtitle overviews bound mounted DOM while retaining full source indexes.
Frontend602/69, API677/two existing warnings, typecheck/build pass; limits in
`docs/gates/user-feedback-03-media-tree-and-responsive-selection.md`, ADR0050.
Next UX-EDITING-DEVICE-01 requires allowed real browser/native, real-STT selection
and scroll, and audible checks. Existing tool restriction and older physical/
quality/download/LAN gates remain. Phase03 stays60%; Queue is still proposed.

## USER-FEEDBACK-02 — 2026-10-08

Larger device Import and separate Host chooser, corrected root breadcrumb,
stale-read lifecycle fence and STT/DIA/Training activity implemented. Shared
pointer preview covers ordinary, middle alignment, multitrack and archived OBS,
preserving gain/mute, excluded boundaries and release/source cancellation.
Frontend593/68, API677 and typecheck/build pass; API results/timing caveat are in
`docs/gates/user-feedback-02-media-and-audio-scrubbing.md`. Queue tabs/hierarchy
and durable GPU dispatcher are proposed, not implemented. Exact next
UX-EDITING-DEVICE-01 still needs allowed visual/native, real-load and audible
checks; browser tool restriction and older device/quality/LAN gates remain.
Phase03 stays60%.

## USER-FEEDBACK-01 — 2026-10-08

Startup/Open Existing reconcile orphan STT/DIA; dedicated checkpoint ownership
is validated and removal fences all affected workers. Shared all/missing choice
dispatches only confirmed targets. Generate force uses new clips and hands over
GPU before terminal status; eligibility verifies WAVs and effective settings.
Icon Import/folder-plus, independent media loading, deferred selection feedback
and shared compact subtitles are implemented. Frontend580/67, typecheck/build
and API677/two existing warnings pass. Actual recycled PDCA MP3 flag
repaired; completed results preserved, Test_OBS_05 valid resumes retained.
Exact next UX-EDITING-DEVICE-01 needs allowed UI/device and real-load evidence;
older quality/identity/physical/download/LAN gates remain. Phase03 stays60%.

## TASK-STOP-DEVICE-01D1–01D3 — 2026-10-07

Resume dev-token cache and Windows tokenizer process pressure repaired. Actual
Generate queue/hard Stop/rerun retains WAVs. Actual Training Stop reaps four
processes and retains11 checkpoint hashes; same-run checkpoint5 Resume completes
20, publishes LoRA and generates WAV.19 retained source/reference hashes agree.
API658, frontend560/63, typecheck/build pass; fixture services cleaned. See the
four01D gates. Next UX-EDITING-DEVICE-01 needs native/audio/load evidence; older
physical/download/LAN and trusted recognition/speaker labels stay open. API
checkpoint-list freshness and unfinished-save recovery remain separate notes.

## TASK-STOP-DEVICE-01C — 2026-10-07

Cancellation settles STT/diarization activity instead of leaving a running
footer. Failed acknowledgement remains failed; first Stop stays running.
Real GPU/new-API and focused regression proof in the01C gate. Exact next01D:
Training checkpoint Resume/Generate Stop using compatible project artifacts.
Owner selection is pending; fixture services/token copy are cleaned.

## TASK-STOP-DEVICE-01B — 2026-10-07

Real community-1 No/Yes/rerun preserves completed spans and all seven WAVs.
See `docs/gates/task-stop-device-01b-diarization.md`. Exact next01C repairs
the observed stale Activity Center task after STT/diarization cancellation.
Training/generation and physical acceptance retain their prerequisites.

## TASK-STOP-DEVICE-01A — 2026-10-07

Real Medium/CUDA No/Yes/rerun passes with actual worker reaping and stable
cancelled records/source PCM. Gate: `docs/gates/task-stop-device-01a-stt.md`.
Next01B runs community-1 diarization. Training Resume and generation need their
compatible project artifacts; physical OBS/native evidence remains separate.

## TASK-STOP-01 — 2026-10-07

STT, diarization, training and generation share queue Stop with a repeated-click
Yes/No dialog for active cancellation. Owned subprocess control and result
fences preserve completed artifacts/PCM/checkpoints. See the task-stop gate and
ADR0047. Next: TASK-STOP-DEVICE-01, real-model Stop then rerun/Training Resume
after normal app/Studio restart. UX-EDITING-DEVICE-01 remains open.

## UX-INTEGRATION-01 — 2026-10-07

Nine requested UX rounds execute under the owner's all-round override. Portable
organization, concurrent multi-file import, shared Script/subtitle edits,
provisional timing and effective working/cut intervals are integrated.
The real PCM and browser fixtures retain source hashes; interpolation never
claims verified recognition. See `docs/gates/ux-editing-2026-10-07.md`.
Next: UX-EDITING-DEVICE-01 — the four owner checks after normal app restart.
Older near-term parents and Phase03-04 retain their documented prerequisites.

## Current Position

Phase: 3 of 7 (Voice Training)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-10-07 — Real Training Stop/Resume and Generate artifacts checked.

Progress: [████████████░░░░░░░░] 60% artifact count (product phases: 1/7 complete)

The 60% figure is GSD's 6/10 plan-summary artifact count. It is not product
completion: historical Phase 02 summaries and a seam-only Phase 07 plan count,
while user-visible success criteria in Phases 2-7 remain open.

## LIVELINK-STT-19B6 — corrected latency attribution (2026-10-05)

Completed paced replay with in-memory timing probes: post-last-offer p95
6.734s, intended source-end p95 6.891s, semaphore wait/session p95 1.578s,
HTTP/session p95 4.610s, event persistence p95 0.188s. CER19.62% still fails
15%; WER24.19% passes30%. Zero errors,29 final spans/input lengths agree,
16 source hashes unchanged. Run1 timing invalid; interrupted run2 retained,
cause unknown. Cachedmedium CUDA inference; no product setting change or
physical OBS timing claim. See `docs/gates/livelink-stt-19b6-timed.md`.
Nine near-term parent rounds remain. Next19B7 isolates1.1s boundary with
preserved quiet PCM; 03-04A durable-session implementation proceeds separately.

## LIVELINK-STT-19B7 — preserved-context boundary rejected (2026-10-05)

One1.1s boundary candidate with repaired quiet PCM reduces final spans29->16,
but CER19.62->20.92% and WER24.19->26.14%; reject, retain0.5s default.
16/16 source spans and hashes match, no errors. Timing is confounded by the
concurrent fullbackend suite and additional Studio model load; no causal speed
claim or repeat. See `docs/gates/livelink-stt-19b7-1s-pcm.md`.
Full19A/19B CER, reviewed word anchors and physical OBS timing remain open.
Nine near-term parent rounds remain; no phase advance or budget relaxation.

## 03-04A — durable Reading Session recovery (2026-10-05)

Server-owned pack/Speaker/card snapshot, revisions, take receipts, measured
coverage, skip/end and reopen now persist with the project. Stable capture IDs
recover lost upload results without duplicate assets; unpublished intents retire
without trapping the card. UI restores HQ in IDLE, requires explicit Speaker,
holds uncertain takes for exact retry and keeps card text instead of live ASR.
Real synthetic3s WAV/API and browser proof survives Unicode folder move,
Open Existing and official API restart with identical source/audio hashes.
Frontend507/58 files, backend570/twoexistingwarnings, typecheck/build/diff pass.
See `docs/gates/03-04a-durable-session.md` and ADR0045.
03-04 remains open for QC, flow segmentation, emotion blocks, references, tier
policy and identity acceptance; per-take Media Pool receipts are intermediate.
Nine near-term parents remain. Exact next acceptance requires reviewed19A
word/video anchors and physical OBS clocks, or trusted03-03C speaker labels
(owner question pending); no phase or budget advance is claimed.

## Verification Baseline

## LIVELINK-CONNECT-01 — Preferences transport recovery (2026-10-04)

Owner reported Failed to fetch and native Disconnected. On inspection both API
and controller proxy answered installation/status requests normally, but OBS
was closed. Opened installed OBS through the existing API action; its real
hello/heartbeats returned 200 and connection became connected. Pairing remained
valid; no token reset, binary update or source media mutation was necessary.
The original outage trigger was not captured and is not attributed to pairing.

Preferences had a reproducible separate defect: an initial transport rejection
left its checking/error state indefinitely. It now retries only status GETs
every three seconds after fetch TypeError, clears errors on recovery, cancels
retries on unmount and suspends them during manual actions. Install/Repair are
never automatically repeated after an uncertain result. Removed obsolete text
claiming native Tools integration was still planned.

Regression baseline: 2 failed / 3 passed. Fixed: 5 passed. Full frontend 468
passed / 55 files; typecheck/build pass. Portable backend installation/connection
suite: 17 passed. Browser at the controller URL shows Preferences installation
status, actual OBS path and running state without Failed to fetch. Test_OBS 7
mixer shows Connected and six currently available source rows; API inventory
also retains missing source identities (22 total), not 22 currently active rows.

Installed binary differs from the current package but connects correctly; an
update requires OBS closed and is not claimed performed. API startup/native
failure acceptance and sustained capture/STT quality remain open. Exact next:
LIVELINK-INGEST-18A, profile six-source spool and Stop tail.

## RUNTIME-READY-01B — Recovery storage waits (2026-10-04)

Resumed MKV STT could block Uvicorn before socket binding while reading project,
checkpoint or track metadata. Real Uvicorn regressions independently hold each
storage seam: baseline **3 fail**, repaired **3 pass**, with health available
while the read still waits and checkpoint bytes unchanged. Worker project reads
and MKV metadata reads now use threads under existing locks. A bounded Python
startup observer logs frame locations at 15/30/45 seconds if binding has not
completed; no faulthandler timer is installed and readiness budgets are unchanged.

Six full-console launches after the storage repair passed (API **3.184–5.023 s**)
and **306 HTTP checks**, including a 63.750-second final monitor. Final backend
**516**, portable media/readiness regressions **23** and diagnostics **4**,
frontend **465 / 55 files**, typecheck/build pass. Final entrypoint and full-suite
results: `docs/gates/runtime-ready-01b-recovery-storage.md`.

The historical intermittent timeout/native crash did not naturally recur;
its complete cause remains unconfirmed. RUNTIME-READY-01B completes the bounded
storage mitigation/diagnostics slice, not native-failure acceptance. Exact next:
**LIVELINK-INGEST-18A**, profile sustained six-source spool and Stop tail while
retaining the runtime gate. New runtime failure must be repaired from captured
evidence; the approximately five-minute Stop-to-archive gap remains open.

## RUNTIME-READY-01 — Owner startup timeout follow-up (2026-10-03)

Owner PID 35832 timed out before its API listener existed; recovery scanning had
finished in 2.721 s. The full intermittent failure did not reproduce on profiled
retries. A regression independently proved cold PCM checkpoint scans in resumed
detailed STT block the API event loop. Those reads now run through `to_thread`,
with existing prefix validation and locks preserved; launcher deadlines unchanged.

Actual production restart passed API readiness in **3.094 s**; health and the
**38-project** catalog returned 200 in **15/78 ms**. Focused **6**, backend **509**,
frontend **465 / 55 files**, typecheck/build pass. Evidence and the unresolved
original-cause boundary: `docs/gates/runtime-ready-01-checkpoint-io.md`.

This is an unplanned bounded repair, not completion of ingestion profiling.
The full-console path still reproduced a timeout after this mitigation; a
diagnostic launch also had a native Python access violation. Final ordinary
console startup passed at **3.108 s**. Exact next repair is
**RUNTIME-READY-01B**, capture these intermittent failures and verify repeated
ordinary starts before **LIVELINK-INGEST-18A**. Six-source spool/backlog and the
approximately five-minute Stop-to-archive delay remain open.

Previous bounded round: `RUNTIME-VOICE-01` (2026-10-03).
`RUNTIME-VOICE-01` completed bundled Voice Changer worker sibling imports.
Actual EngineWorkerProcess failed because embedded Python `_pth` isolation
omits the script directory. The worker now resolves its siblings from `__file__`.
Original and copied runtimes enumerate **66 devices**, return idle status and
reject a missing named device before opening an audio stream; actual RVC runtime
also returns harmless protocol replies without loading a model.

Evidence: Voice Changer **12 passed**, backend **508 passed**, frontend **465 /
55 files**, typecheck/build passed; current checkout portability audit **24/0**.
See `docs/gates/runtime-voice-01-worker-import.md` for reproduction, moved-runtime
proof and boundaries. Previous PROJECT-WRITE-01 persistence evidence remains in
`docs/gates/project-write-01-persistence.md`.

There are **11 scheduled rounds + 2 conditional repairs remaining** in
`docs/GAP-PLAN-2026-10-03.md`. Exact next: **LIVELINK-INGEST-18A**, profile the
six-source spool and Stop tail before tuning. The approximately five-minute
archive delay remains; real conversion/model quality, STT accuracy, physical DPI,
clean-machine transfer and speaker publication gates remain open.


Previous UI-CONTRAST-01B observed browser acceptance remains historical evidence.

Previous UX-11B recording-name gate remains historical evidence.

Existing UX-08B footage lifecycle, CAPTURE-10B and 12L/12M gates remain
historical evidence.
The historical phase baseline below remains distinct from these focused checks.

- Backend: 364 passed.
- Frontend: 288 passed.
- TypeScript/Vite production build: passed.
- `git diff --check`: passed.
- `engines/OmniVoice`: no tracked modification.

## Accumulated Context

## Decisions Made

| Phase | Summary | Rationale |
| --- | --- | --- |
| 03 | Keep `ProjectVoice` and Voice Model Set distinct | One usable artifact cannot carry a coordinated set's identity, lineage, and gate guarantees. |
| 03 | Dataset Manifest remains engine-free | Exporters may change engine shape without changing portable project truth. |
| 05 | RVC gate remains failed/partial | Speed and pitch evidence cannot override failed cross-speaker CER or missing measurements. |

## Completed Contracts

- Stabilization W0-W4; R5 declined and R6 intentionally skipped.
- Phase 01, plans 03-01 and 03-02, and seam-only plan 07-01.
- 03-03 runtime/run/export/process/GPU/progress/cancel/resume foundation.
- Individual project voices, generation/output, and an RVC live-conversion slice.

## Pending Todos

No GSD todo files. Planned work remains in ROADMAP and PROJECT-STATUS.

## Blockers

- 03-03 still lacks backend-specific threshold calibration and one real gated publish run.
- 03-04 lacks durable sessions, measured capture/QC, finalization, tier policy, and identity lock.
- No checked-in sample project supplies consented, ready audio for the real training acceptance run.
- RVC similarity, cross-gender, loopback latency, and owner blind A/B are unmeasured.
- `audioop` blocks a clean Python 3.13 upgrade; Starlette test client emits an `httpx` deprecation warning.

## Deferred Items

| Category | Item | Status | Deferred At |
| --- | --- | --- | --- |
| STT review | Final per-word candidate reconciliation | Open | Phase 02 |
| Workspace | Six-zone docking and `WorkspaceSession` | Planned | Phase 04 |
| Manipulation | Isolation, dubbing, production patch/file workflows | Planned | Phase 05 |
| Video | LipSync implementation | Planned | Phase 06 |
| Distribution | Model delivery, security adapters, installer/updater | Planned | Phase 07 |

## Session

**Last Date:** 2026-09-22
**Stopped At:** Round 03-03B complete; the gate works and fails closed while thresholds are uncalibrated. Round 03-03C is next.
**Resume File:** None

## VM-REF-DETAIL-01 — 2026-10-15

First of the explicitly requested next five rounds: Reference Detail slots,
independent expansion, revision-checked removal and explicit Timeline+Script
reveal. See docs/gates/vm-ref-detail-01-20261015.md. Next VM-REF-RESOLVE-01.

## VM-REF-RESOLVE-01 — 2026-10-15

Second of five: deterministic property resolution/identity/locks/conflicts,
actual PCM feature cache and explicit unsupported outcomes. See the round gate.
Conditioning A/B waits for delivery/loudness processors. Next VM-TIMING-REF-01.

## VM-TIMING-REF-01 — 2026-10-15

Third of five: portable timing source/template plans, reviewed same-text mapping,
unknown different-text anchors, verified training snapshot checks. See round gate.
Word-anchor execution remains pending; next VM-NAV-01.

## VM-NAV-01 — 2026-10-15

Fourth of five: content/time selection markers, collision menus and playback
follow guards. Marker/selection/scrollbar9 pass; see round gate. Next VM-DURATION-01.
