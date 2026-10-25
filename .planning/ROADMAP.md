# Roadmap: Pro4Bro Voice Manipulator

## VM-PLAYBACK-IDENTITY-01 — One source word for subtitle and Script (2026-10-25)

Repeated owner feedback exposed data/clock failures beyond ADR0149 geometry.
Imported focused editing kept a parent publisher alive: source intervals and
repaired child intervals could choose different words at one playhead. Retiring
Timelines could clear a successor's highlight. Greedy repeated-word mapping and
whole-row freshness also dropped playback targets after small merged-turn edits.

Implementation232a05c suspends focused parents, protects publisher lifetime,
and shares active-word lookup/publication across standard/imported/OBS Timeline.
Subtitle and Script consume the same source index. Monotonic text alignment and
paint-only overlays retain surviving word clocks in both Voice Script views.
No invented timing for unmatched edits; silence clears both highlights. ADR0150
and docs/gates/vm-playback-identity-01-20261025.md record the contract and limits.

Standard frontend174 files/1380 tests (202.61s), final focused4 files/117 tests
(43.96s), typecheck/build239 pass. New tests reproduce the actual parent/child
conflict, publisher retirement, repeated words, long edits and exact text ranges.
An early virtual Input timeout is recorded in the gate; no thresholds weakened.
Read-only owner-project probe maps all2119 words across two merged rows; inspected
JSON hashes unchanged. No backend/engine/audio/project-format changes; API1626
is a carried baseline, not rerun. Build JS index-BeQ6RswV.js/CSS index-CJncqiqd.css.

Native acceptance remains open: Browser inventory still refuses local access
before opening a tab. Earlier text/history/frozen-subtitle UAT and audio delivery
work remain open. Phase03 stays60%, Phase06 open. Stop this bounded round.

## VM-SCRIPT-SCRUB-FOLLOW-01 — Script remains visible during playhead scrubs (2026-10-25)

Owner feedback after the unified-editor round affects Input table and both Voice
Manipulator views. New red tests expose stale geometry after a word was already
followed, permanently disabled table follow with disjoint selections, and editable
long rows collapsing to auto height on every word-clock render.

Layout observations now coalesce into one animation frame and follow the latest
word after wrapping/virtual measurements settle. Existing word/pending guards
remain to avoid chasing intermediate spacers. New multiple selections pause follow;
a Timeline gesture resumes it without clearing them. Auto-height caches actual
text/width/font/box inputs and restores the viewport after needed measurement.

Implementation e89a2af. Standard frontend172 files/1371 tests (208.61s),
focused8 files/79 tests (16.00s), typecheck/build238 pass. Tests cover forward/reverse
held drags, stale media events, all three reported views, delayed geometry,
1400-word virtual Input, viewport stability, size invalidation and frame cleanup.
No old tests/gates weakened; an intermediate synchronous follow approach was
rejected after existing far-reveal tests caught update loops.

Browser inventory still refuses local access before a tab opens. Native project
acceptance and earlier text/history/frozen-subtitle UAT remain open; JSDOM geometry
and scroll clamping are models. No backend/engine/media/project-format change,
no owner project writes; prior full API1626 is carried. ADR0149 and
`docs/gates/vm-script-scrub-follow-01-20261025.md` record evidence and limits.

Audio endings, newline pauses and additive30% per uppercase/bold/underline remain
planned separately. Do not invent timings for new text without matching audio.
Phase03 stays60%, Phase06 open. Stop this bounded correction round.

## VM-SCRIPT-UNIFIED-01 — Shared normal editor, Timeline resizing and scrub ownership (2026-10-25)

Input and Voice Manipulator normal views now share the two-column text editor,
viewport/custom scrollbar, literal editing, copy scopes and local Undo/Redo.
Input projects exact text into canonical speaker turns, preserves source clocks
and timing reconciliation, and retains first-word edits across equivalent parent
rerenders. Flex height fills the document; specialized comparison/live/tag views
retain their own presentations.

Playback uses paint-only CSS Highlight ranges. Caret/focus do not become playback
selection, and Timeline ignores selection seek/pan during held scrub gestures.
Simultaneous source follow has one owner and manual scroll/typing takes priority.
A horizontal divider resizes Timeline with keyboard support, bounded per-page
machine-local persistence and listener/viewport cleanup.

Implementation commits1bb1b4a/989861a. Frontend169 files/1361 tests (196.58s), final
focused13 files/176 tests, typecheck/build237 pass. No backend, persistent format,
engine, owner project or media change; previous full API1626 remains the baseline.
CUA still refuses local browser inventory, so native geometry/selection/IME,
dark/light and earlier frozen-subtitle UAT remain open. ADR0148 and the round gate
record test adaptations and limits.

Audio endings, newline pauses and30/60/90% emphasis/gain/shout are NOT implemented
in this UI round. NEXT is VM-VOICE-ENDINGS-01, followed by persistent inline
format/pause delivery; see docs/VM-SCRIPT-UNIFICATION-DELIVERY-PLAN.md. Source
inspection is not a listening acceptance. Phase03 stays60%, Phase06 open.
Owner clarification (2026-10-25): newlines add pauses between lines;
uppercase, bold and underline each contribute30%, adding up to90% for all three.
Audio gain is separate and not yet specified. The delivery plan now records this
confirmed rule instead of highest-wins/fixed per-format levels. Documentation-only
clarification; no product round advanced and no synthesis behavior changed.

Stop this bounded development round as required by AGENTS.md.

## VM-MERGED-SCRIPT-SAVE-01 — Stable merged-turn highlights and autosave (2026-10-25)

Owner feedback: merged rows were entirely blue, and the unsaved/unchecked-out
Version warning and Timeline Reset blinked repeatedly. Read-only inspection of
`conviction-voice-over` found2 rows with120 segment definitions, only2 used.
The1159-word first row exceeded the old diff cutoff; frontend normalization also
pruned orphan segments but incorrectly considered that draft already persisted.
The Version API correctly refused it, and automatic retry cleared the warning/
toggled busy repeatedly.

Exact long-turn LCS matching now uses rolling scores/packed direction bits.
Acknowledged server content is compared by value before normalization on load
and checkout, so normalization saves once before Version persistence. Autosave
stops on error until an explicit retry; revision fences and Reset's write guard
remain intact. Real-project read-only evaluation gives2 pending words in row1,
none in row2 (38.36ms single probe); original Script/book hashes unchanged.

Frontend167 files/1350 tests (213.65s), focused24, typecheck/build233 pass.
Relevant backend23 pass (two existing warnings); actual API two-turn/120-segment
probe verifies409 before Script save, then200 Version save and idempotent repeat.
No backend product source or owner project/media/model was edited. ADR0147 and
`docs/gates/vm-merged-script-save-01-20261025.md` record evidence. Browser inventory
still reports Local browser disabled before a tab opens, so post-fix native visual
acceptance remains open. Earlier literal-text/history UAT also remains open.
Phase03 stays60%, Phase06 open. Stop this bounded fix round.

## Closure check — legacy turns and Script/Timeline UI (2026-10-25)

Verified the two latest rounds without advancing product scope. The existing full
API gate is1626 passed (three existing warnings); the intermittent VibeVoice
import timeout has not been root-caused or represented as a repaired defect.

Browser briefly worked after the owner's restart. Native forward/reverse copy,
cross-column speaker+dialogue copy, shared vertical Timeline scrolling, frozen
subtitles under its one ruler, shared zoom/pan geometry and locked vertical clip
transfer/toolbar return were observed on the owned4-turn/12-layer fixture.

Native UAT exposed speaker selection boundaries and browser editing commands
splitting cells/inserting paste outside the dialogue. The final repair uses
protected selectable labels, literal cell text insertion and a bounded100-edit
session-local typing/composition/paste/newline Undo/Redo history. Focused Script
39 tests, final standard frontend167 files/1343 tests (211.25s), typecheck/build233
pass. Source WAV/output metadata22+22 hashes remain unchanged; no owner project
or model inference/training was touched.

After the owner's continuation, CUA again reports Local browser disabled before
reloading the final patch; fresh inventory has no browsers. Final native text/
history/reload/real IME and light-theme/saved-screenshot checks remain open. Do
not equate the unit gate or earlier intermediate-build text checks with that
acceptance. See `docs/gates/vm-script-two-round-closure-20261025.md` for precise
observations and remaining steps. Phase03 stays60%, Phase06 open. Stop this bounded
verification/fix pass with the browser gap explicit.

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

Owner-approved correction implements per-Version Script/config/subtitles/audio,
expandable Sessions, shared output menus, Full replacement and local Fix layers
with bottom-wins playback/export. New Version makes independent artifact copies;
layer trim/split/move/mute/delete update the selected Version. Full frontend1277,
final173/Patch70, typecheck/build224 and final backend53 pass. Full backend1590
pass/1 existing VibeVoice import timeout; isolated import/cancellation2 pass.
Browser/PCM checks verify both themes, clone/restore, layer edits, restart and
matching WAV export. Real-model listening remains open. ADR0141 and the round
gate record the contract/evidence. Phase03 stays60%, Phase06 open; stop round.

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

Completed the owner's missing-action feedback: Ghost Preview and Apply Aligner
stay visible above settings, including disabled empty-selection states. Existing
engine defaults and timing protections remain. Focused frontend16/backend42,
typecheck/build214 and isolated browser interaction checks pass. No owner Project
or inference changes. See `docs/gates/subtitle-actions-01-20261023.md`.
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

Delivered the ordinary native Import review with cache/link and per-track Import/
STT, plus MKV-only follow options. Explicit confirmation/cancel, keyboard focus,
pending-row reopening and processing/no-track guards remain. Current source uses
local faster-whisper tiny for OBS/MKV live preview; inference behavior is unchanged.

Frontend1219, focused135/latest69+2, typecheck/build213, related API32 and mutation
pass. ADR0133 and mkv-import85 gate record proof/limits. Browser/device UAT and
Round84's full-API process containment gap stay open. Runtime ports are stopped
at closure; build is ready for normal launch. No backend/media/default STT change.
Phase03 stays60%, Phase06 open; stop85.

## Round84 — GROWING-MKV-PLAYHEAD-01 (2026-10-22)

Delivered stable playhead/audition during and after growing-MKV refresh. Only
active primary playback advances the held coordinate. PCM path/duration revisions
refresh audio and restore metadata position before clock handoff; a new scrub
cancels pending full Play activation. Normal imports/full-fit/edge-pan remain.

Frontend1215, focused77+16, typecheck/build212, real two-track MKV/WAV Range proof
and isolated mutation pass. API1317 pass/1 portable process-isolation failure
remains open; canonical console recovery restores healthy API/Studio/current
build. Contain termination calls before any future live test rerun. Browser/device
UAT is unavailable in Work settings. ADR0132 and mkv-playhead84 gate record the
evidence and gaps. No backend/default STT change. Phase03 stays60%, Phase06 open;
stop84.

## Round83 — GROWING-TIMELINE-FIT-01 (2026-10-22)

Delivered continuous full fit for growing MKV/OBS footage after slider/minus
reaches full zoom-out. Explicit zoom-in retains manual span; held OBS playhead
does not stop extent growth. OBS viewport exceeds120s while acquisition keeps
its120s/600-point bound. Ordinary recording has growing-fit regression coverage.

Browser actual-app MKV2.925625→24.0326667s full fit and retained5.8513125s manual
zoom pass, including final two-track PCM/source hashes. Frontend1209/150files,
typecheck/build212, API1318/3 existing warnings and isolated mutation pass.
ADR0131 and the timeline-fit83 gate hold evidence/limits. No backend/media/default
STT change. Phase03 stays60%, Phase06 open; physical OBS/device acceptance remains
open. Stop83.

## Round82 — MKV-RECORDING-SLOTS-01 (2026-10-22)

Delivered red pulsing Import circles and45-degree stripes moving left-to-right
on followed-MKV parent/track slots. Final-parent publication restores native
checkboxes and saved selections independently of STT; existing asset refresh
updates the UI without reload. Reduced-motion preserves static cues. No new
backend/polling behavior. Browser actual-app fixture verifies three slots and
two full8.034125s final PCM tracks. ADR0130 and the recording-slots82 gate hold
test closure/limits. Phase03 stays60%, Phase06 open; stop82.

Full frontend1203, typecheck/build212 and API1318/3 existing warnings pass. The
isolated state mutation is killed; initial frontend waiter/rechecks are retained.

## Round81 — INPUT-FEEDBACK-01 (2026-10-22)

Delivered enabled/collapsible refinement settings, editable IN/OUT, contextual
Timeline Ghost Preview, bulk Apply, visible persisted conflicts and exact
manual/unchanged coordinates. Retained OBS draft text and Capture Source gating
are implemented. Followed MKV automatically imports the complete closed source
including tail; optional explicit STT uses the ordinary full-file queue. Late
segmented publication is fenced. Independent loads, single-flight polls and read
deadline/retry address reproduced stalls; historical hang root cause is unproven.

Full frontend1201/typecheck/build212, real browser Apply/Restore/source visibility
and actual FFmpeg writer/two-track full-PCM checks pass. API closure, exact
measurements and retained failures are in the input-feedback81 gate and ADR0129.
Common reviewed690/692 changes preserve gates and expose4 conflicts; vector21
changes remain experimental. Owner hashes equal. Managed runtime reloaded healthy.
Next acceptance gaps: physical OBS/device audition and held-out acoustic quality.
Phase03 stays60%, Phase06 open; no STT default or portable release change. Stop81.

## Round80 — INPUT-SUBTITLE-REFINEMENT-01 (2026-10-22)

Implemented Input right-column subtitle refinement with eight independent trial
methods, actual PCM-vector proposals and read-only drift detection including
manual words. Every editing method retains preview/manual locks/Apply/Restore.
Common-offset640/692 and vector21 changed/all review reproduce on frozen media;
CTC discrepancies177/68 current versus18/1 owner-reviewed remain review evidence.
No universal learned rule or held-out quality acceptance is claimed.

Full frontend1186/API1307, latest focused18/60 and typecheck/build210 pass; owner
hashes unchanged. ADR0128 and `docs/gates/subtitle-refinement80-20261022.md` record
artifacts and limitations. Next quality gaps: actual browser/device audition
(Work settings disabled browser use), held-out speech and reliable vector boundary
selection. Phase03 stays60%, Phase06 open; no STT default/portable release change.
Stop80.

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

Conviction's heard owner reference is preserved and measured. Current raw DTW
reproduces early IN/OUT before refinement and SRT; PCM clocks match. CTC improves
typical boundaries but tail/overlap gates reject automatic replacement. The
conviction78 gate records archived/current/CTC paired evidence and unchanged
acceptance limits. Reference availability is resolved; acoustic quality remains
open. Focused35/frontend1175/typecheck/build/API1245 and closure hashes pass.
Next bounded work: consistent short alignment windows, corrected-text arm and
held-out speech. Phase03 remains60%, Phase06 open; no portable, stop78.

## Round77 — SUBTITLE-SCRUB-PREVIEW-01 (2026-10-21)

Fixed Vietnamese subtitle font shaping and clipping. Added saved start/center/end
audition positions (default center), repeating 120ms held previews, shared faint
range overlays and release/cancel cleanup across ordinary/imported/archived OBS
Timeline. Source/cut limits, mute/gain and logical pointer clocks remain valid.
Frontend1175/145files, typecheck/build205 and headless audio/typography pass;
full API1232 passed / 3 existing warnings. ADR0126 and subtitle-scrub77 gate hold evidence. Existing
LipSync edits retained; no portable, Phase03 stays60%, Phase06 open. Stop77.

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

## Rounds71–75 — actual MuseTalk/face-review prototype (2026-10-21)

Implemented isolated verified runtime/models, scoped face gallery, revisioned
manual identity correction and Speaker mapping, per-frame speaker/face gating,
and durable cancellable MuseTalk Offline v1.5 jobs with actual composition and
full-source artifacts. Before/After share Timeline. See ADR0124 and runtime71-75
gate for full1153/1224 and final focused74/37/catalog81/cleanup3 evidence.
Phase03 stays60%; Phase06 remains open for real generated-voice quality,
simultaneous multiperson/cross-analysis identity continuity, full native/other
engine pipelines, face replacement and selective Voice Over repair. Stop75.

## Rounds66–70 — LipSync composition/scope batch (2026-10-21)

Closed the explicitly authorized native-settings, portable-composition,
multilayer-editor, processing-scope and preflight slices. Independent detection
and sync scopes implement LIP-07; LIP-02 editing/persistence is implemented while
real media/engine artifact acceptance remains separate. Full frontend1153pass,
API1220pass plus final focused11/10, build/typecheck200 and browser fixture checks
are recorded in the composition66-70 gate. ADR0123 defines clocks/visibility and
preflight semantics. Next: real isolated engine output, then reviewed Face IDs,
profile/turn bindings, multi-face composition/After and selective repair. Phase03
stays60%; Phase06 remains open. No portable release; stop after round70.

## Round65 — LIPSYNC-ENGINE-SETTINGS-01 (2026-10-21)

Closed source/catalog/settings slice for MuseTalk, LatentSync and Wav2Lip.
Frontend1148pass/139files, typecheck/build196; API evidence in the round65 gate.
LIP-01..06 and docs/LIPSYNC-IMPLEMENTATION-PLAN.md order remaining slices:
portable multi-clip/layer editing, first real engine artifact, visible shot/face
identity review, Speaker Profile/turn scheduling, composite/After QC and selective
Voice Over repair. ADR0122 records boundaries. No render or identity processing
is available yet; Phase03 stays60% and Phase06 remains open.

## Round64 — LIPSYNC-TIMELINE-UI-01 (2026-10-21)

LipSync uses Input's proportions and presents Preview Video where Script sat.
The Timeline module renders video and generated-voice alignment lanes with
zoom, scroll, ruler, transport, pointer/keyboard placement and non-destructive
IN/OUT trims. Its generated waveform uses the existing output endpoint.
Frontend1146pass/138files and typecheck/build195 modules; browser layout
measured at1900×900. Full backend1208pass/3warnings/667.15s. ADR0121 and
lipsync-timeline64 gate define this UI slice. Engine candidate/license research
is separate; no model or render job is integrated. Phase03 stays60%; Phase06
output artifact, After QC and face replacement remain open.

## Round63 — LIPSYNC-PREVIEW-01 (2026-10-20)

LipSync now has its separate Input-shaped page, a project-scoped video route,
Media Pool/Voice Output selection, shared preview clock and two-track timing
draft. After, Generate and optional face replacement remain gated on persisted
alignment, adapter-backed render jobs and verified video QC. Frontend1144pass/
138files, typecheck/build194 modules; focused API2pass. Full API1207pass/
1 unrelated VibeVoice import timeout, isolated rerun pass. See ADR0120 and
lipsync-preview63 gate. Phase03 stays60%; Phase06 remains open.

## Stabilization round62 — SELECTION-DUPLICATE-SPACE-01 (2026-10-20)

Unselected footage is blank in Script/Timeline; Alt-left drag copies selected
subtitle words with a ghost above the lane and inserts them at the drop time;
Space toggles ordinary/imported Timeline playback. Copies/displaced words have
untrusted timing, and out-of-bounds drops do not write. Frontend1138pass/136
files, focused88pass, typecheck/build191pass; full API1207pass on retry. See ADR0119
and docs/gates/selection-copy-space62-20261020.md. Phase03 remains60%; separate
acoustic/provider/processor gates stay open. Stop after this bounded round.

Release follow-up: alpha 0.5.18 app pack has 221 payload / 226 ZIP files. Full portable
(82,208 files / 41.00 GiB) provides the current base for old 0.5.16/0.5.17 installs,
whose API requirements differ. Dependency guard retained. Evidence in
docs/gates/portable-update-0.5.18-20261020.md. Bundle gate 33 passed / 0 failed;
local core API/UI/STT ASGI probes pass. No product-round advancement.

## Stabilization round61 — TIMELINE-EDGE-SPEAKER-01 (2026-10-19)

Closed 10/20/30/40% viewport/sec edge acceleration and stable speaker underline
feedback. Focused 138 pass; frontend 1130 pass/136 files; typecheck/build191;
API 1207 pass/3 warnings; actual CSS passes32cases in both themes. See ADR0118
and docs/gates/timeline-edge-speaker61-20261019.md. Native held-drag/portable UAT
remains separate; no portable issued. Phase03 stays60%; provider/acoustic/full
processor gates retain their existing status. Stop after this bounded round.

## Stabilization round60 — TIMELINE-SOURCE-BOUNDARY-01 (2026-10-19)

Closed source-end drag regression at zoom, endpoint preview replay and stale
resize repaint. Frontend1127pass/136files, focused131pass, typecheck/build191,
API1207pass/3warnings; browser DOM/media endpoints retain0/20.123s after updates.
See ADR0117 and docs/gates/timeline-source-boundary60-20261019.md. Native mouse
capture/installed portable UAT remains manual; no portable issued. Phase03 stays60%.
Round59 provider quality/device/full processor gates remain separate and open.

## Round59 — OPEN-ENGINE-CONNECT-01 (2026-10-19)

Repos and compatible choices are installed with product adapters for CosyVoice
generation, streaming-ASR sessions and Sokuji inspection. Frontend1118pass;
actual Cosy WAV and w-okada3.10 imports verified. Full API1207pass/737.89s;
implementation/test gate closed. Complete provider acceptance remains open; see ADR0116 and
docs/gates/open-engine-connect59-20261019.md. Preserve separate quality/device gates before
claiming STT-VIBE/TTS-COSY/LIVE-COSY/translation/dub acceptance. Phase03 stays60%.

## Round58 — ENGINE-CATALOG-01 (2026-10-19)

Task provider catalog now reports capabilities and machine readiness; selected
STT model/adapter IDs are checked before queueing and cannot silently fall back
to Studio. Whisper weights are checked per model; VibeVoice-ASR speaker labels
reach Script independently of Speaker Profiles and estimated word intervals
stay untrusted. Planned streaming ASR and CosyVoice entries are disabled. See
ADR0115 and docs/gates/engine-catalog58-20261019.md. Frontend1112pass/136files,
typecheck/build191 pass; API1152pass (3 existing/fixture warnings); final
focused backend15pass and diff check pass. No new model/audio artifact or
project-format change. Exact next integration slice is STT-VIBE-01; subsequent
STT-VIBE-STREAM-01, TTS-COSY-01 and LIVE-COSY-01 remain open. Phase03 stays60%.

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
Closure: frontend883/typecheck/build; full API1018 before final timing-trust
metadata correction, then current affected API81. Combined gate records limits.

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

## Voice Manipulator round17 — 2026-10-16

VM-FIX-02 composition/Apply/reopen and gain render implemented. Actual5.71s
137040frames,0clip, untouched row/gap, source/metadata hashes and move pass;
API48/UI75/typecheck/build. Next VM-FLOW-01 → VM-PATCH-01 → VM-PATCH-REF-01.
Existing conditioning/browser/listening gates retain meaning; Phase03 60%.

## Voice Manipulator round16 — 2026-10-16

VM-FIX-01 implemented and verified with a real trained full voice clip2.68s,
checkpoint/no-op and unchanged source; API12/UI18/build pass. VM-FIX-02 next,
then VM-FLOW-01, VM-PATCH-01 and VM-PATCH-REF-01 in this owner batch. Existing
expressive/random/latency/browser/listening gates retain meaning. Phase03 60%.

## Voice Manipulator rounds11–15 — source slices (2026-10-15)

Ripple/stretch preview, delivery capability report, gain render/export and frozen
reference schedules integrated. Prior real speech5.15s123600frames/source-hash/
undo/move/download pass. Combined rounds11–15 gate records exact tests/limits.
Cold312–812ms misses250ms; browser/listening/identity, expressive conditioning
and schedule execution remain open. Next planned VM-FIX-01/02 with dependencies.
Phase03 stays60%; Phase05 incomplete; no model migration/push/portable.

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

## Voice Manipulator first five rounds — 2026-10-15

Owner-directed batch delivered portable Script hierarchy/intent, reference asset
roles/import, shared waveform/subtitle/Script ranges/readouts and persistent
multi-source/property assignment. VM-GEN-01 cache/invalidation/recovery repaired;
CPU/sandbox GPU attempts timed out, then native GPU execution created an actual
full/clone/LoRA Script WAVs. Edit-one/reuse2, Stop-at2, retry and moved-project
reuse3/3 passed, including hashes/lineage/PCM. Frontend844/backend870/build pass.
Browser unavailable; listening/identity, measured word timing and browser/native UAT remain open. Controls
store requested duration/delivery/reference intent; later synthesis/resolve/Fix
rounds remain pending. See ADR0076 and the combined first-five gate for final
automated/API evidence. Next VM-REF-DETAIL-01 includes slot→Timeline+Script
navigation. Phase03 stays60%, no portable; prior source-library queue retained.

## HUB-COLLECTION-01 — owner Hub/Collection feedback (2026-10-14)

Main-source card/detail layout, compact header, profile count, expandable model
rows, selection/native ZIP transfer and verified >=15s sample jobs delivered.
Frontend818, focused backend88, three initial startup timeouts pass exact rerun;
typecheck/build, IAB geometry/two themes/scroll-end pass. Actual CPU trained
sample did not finish; HUB-COLLECTION-UAT-01 remains for sufficient GPU/native
dialogs. See docs/gates/hub-collection-01-20261014.md and ADR0075. Phase03 stays
60%, no new portable. SOURCE-EXTERNAL-ASSETS-01 remains next implementation.

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

## PORT-FEEDBACK-02 — selected preview and external voice transfer (2026-10-13)

Alpha0.5.12 follows source-first repair: selected tracks own audio/Script,
project-session Gain/Mute/Solo retention, S below M, failed stopped OBS menu/bin/
restore and verified external LoRA/full/RVC Voice Collection ZIP transfer.
Frontend795/84files, backend819, typecheck/build pass. Actual root UPDATE33/0,
154source/payload/installed byte/hash checks and1,223,639byte ZIP verified, base
unchanged. Real source/embedded portable two-track DOM/mixer reports match;
source voice export/native portable import/re-export preserves payload/lineage.
See docs/gates/portable-feedback-02-20261013.md. Exact next PORT-FEEDBACK-UAT-02
uses D-drive0.5.12, real failed take/bin/restore, selected audio/Script/Mute/Solo
and actual trained-voice ZIP/inference. Physical zero-PCM OBS cause remains
unconfirmed. Phase03 stays60%; independent timing still awaits Conviction.

## PORT-REBUILD-01 — new portable with deferred base (2026-10-13)

Alpha0.5.11 includes the rebuilt current app, canonical Studio source, twelve
heavy-component copy map and guarded deferred readiness. VibeVoice remains listed
without payload. Shared OBS row Retry overlap and old versioned console migration
repaired. Frontend785/84files, backend799, installer33, builder/completion9,
typecheck/build pass. Actual hydrated root VERIFY33/0;151app hashes/1.17MiB ZIP
verified; complete components about35.6GiB.174routes/eightcatalogs match except
intentional availability/Git metadata; real portable PCM/MKA/browser waveform
checks pass. Meter-only negative control matches error; native D-cause remains
unconfirmed. See docs/gates/portable-rebuild-20261013.md. Exact next
PORT-FEEDBACK-UAT-01: new D-folder/base copy/VERIFY/closed-OBS INSTALL, native
Forward/durable PCM recording and prior playback/STT/bin acceptance. Phase03
stays60%; independent timing awaits Conviction.

## PORT-OBS-REPAIR-01 — default OBS installer recovery (2026-10-13)

Alpha0.5.9 root BAT auto-selects Repair for damaged/missing installed files;
WinPS error capture retains Python exit code and reason. Existing hash,
compatibility, running-OBS and pairing rules remain. Installer29pass,
frontend785/84files, backend786pass, typecheck/build pass. Actual pack33/0,
151 installed/ZIP hashes checked, models unchanged. Embedded Python/real
package probe repairs DLL/brand, preserves pairing and refuses running-OBS
repair. See docs/gates/portable-obs-repair-20261013.md. Next
PORT-FEEDBACK-UAT-01 is owner D-drive0.5.9 apply, close OBS/root INSTALL/reopen
native loading, then prior playback/bin checks. UAC/OBS loading needs physical
evidence. Independent timing awaits Conviction; Phase03 stays60%.

## PORT-UPDATE-LOCK-01 — portable controller shutdown (2026-10-13)

Alpha0.5.8 stops the controller as well as API/Studio before replacing app trees,
fixing the owner's services/api CWD lock. Reopen after success/rollback uses the
console. Native16pass, frontend785/785, backend779/779, typecheck/build pass.
Real embedded controller + installed pack33/0,151 payload/ZIP hashes
verified, models unchanged. Prior source PIDs survive final isolated checks.
See docs/gates/portable-update-lock-20261013.md. Exact next PORT-FEEDBACK-UAT-01
is owner D-drive pack APPLY once, update retry and prior playback/bin/native OBS
acceptance. Independent STT timing awaits Conviction. Phase03 remains60%.

## PORT-FEEDBACK-01 — portable feedback repairs (2026-10-13)

Source and alpha0.5.7 repair single-track Script/Timeline identity after STT,
Recycle Bin overlap/scrolling, native WinPS OBS installation and pairing launcher
migration. Portable root has the four requested BATs; hashed legacy removal
supports rollback. Frontend785/785, backend774/774, typecheck/build pass; actual
migration and final root UPDATE33/0,151 payload hashes/ZIP verified, base unchanged.
Real embedded portable UI and isolated native BAT installation pass. See
docs/gates/portable-feedback-20261013.md. Next PORT-FEEDBACK-UAT-01 is the owner's
D-drive apply and parent/track/bin/native OBS retry. Phase03 stays60%; independent
timing review remains STT-TIMING-ACCURACY-01 after Conviction.

## PORT-STT-01 — portable Speech to text availability (2026-10-13)

Resolved the API catalog against the portable's bundled STT sidecar rather
than the absent development folder. Actual grey-button reproduction and
production-endpoint/moved-folder regressions pass. Alpha0.5.5 actual BAT31/0,
153-file ZIP verified and base unchanged; real portable CPU/offline Largev3
and Medium return21words with preserved source. Related backend34/Media Pool56 and
typecheck/build pass; full755pass/3fail then those3pass separately.
See docs/gates/portable-stt-20261013.md. Phase03 stays60%. Exact next portable
round: owner's D-drive alpha0.5.5 STT retry and hardware benchmark. Planned
STT-TIMING-ACCURACY-01 still awaits independent Conviction anchors.

## USER-FEEDBACK-23 — API readiness during project recovery (2026-10-12)

The startup blocker was a 41.657-second recovery scan across 23 projects before
API port binding; launcher readiness expired at 61.067 seconds. Recovery now
continues after the listener opens when it exceeds a one-second fast path.
Blocked-scan real-listener regression and backend742/742 pass. Owner source
launcher restart and portable rebuild remain. Evidence:
`docs/gates/user-feedback-23-api-readiness-recovery.md`. Phase03 stays60%.
Next planned feature round: STT-TIMING-ACCURACY-01 after the Conviction timing
reference.

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


## USER-FEEDBACK-11 — Script boundary correction (2026-10-09)

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

## USER-FEEDBACK-10 — consistent Script scrolling (2026-10-09)

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

## USER-FEEDBACK-09 — OBS archive viewport and PCM detail (2026-10-09)

Paused Timeline browsing survives zoom/metadata; stale drag-release follow removed.
Archived OBS playback follows the view; Stop requests the ordinary source PCM
waveform with bounded screen density, shared filled/accent/gain style and fenced
loading. Repeated idle status/journal refreshes keep the chosen window. Actual
owner media has a28.668s detailed-word gap despite audio/final realtime text;
segment-level review notes preserve that text without invented word timing.
Commit4568e3f, ADR0056, `docs/gates/user-feedback-09-obs-archive-view.md`.
Frontend646/74, typecheck/build and relevant API waveform2 pass; full API687 is
carried08 baseline. Original MKA/WAV hashes unchanged. Exact next STT-GAP-01 must
retain isolated recognizer/merge artifacts to attribute and repair missing words.
Native UX-EDITING-DEVICE-01 scroll/Stop/playback and RUNTIME-READINESS-DEVICE-01
idle/cold evidence remain, as do reviewed word truth, physical/LAN/quality budgets.
No normal service/inference, schema/upstream or Phase03-budget change. API was
observed stopped with Studio running/busyfalse at closure; native acceptance needs
normal service operation. Original rapid jumping is not fully device-verified.

## USER-FEEDBACK-08 — controller startup and retained retry evidence (2026-10-09)

Controller fixed HTTP loopback clients avoid CA/proxy setup before binding.
CLI watches before heavy imports; launchers preserve nonempty output across retry.
Controlled real-Uvicorn/invalid-env/slow-import/PowerShell regressions pass; API687/
two existing warnings on E temp storage after C full setup errors. Actual normal
launcher succeeds controller1.897s/Studio4.354s/API11.393s, all health=ok, runtime
running and left up: `docs/gates/user-feedback-08-controller-readiness.md`, ADR0055.
The historical PID25916 stack is lost, so its exact cause and idle/cold reliability
are not declared proven. Exact next RUNTIME-READINESS-DEVICE-01 records normal
idle/cold cycles under existing deadlines; UX-EDITING-DEVICE-01 OBS Stop/waveform/
playback and editing checks follow. STT word truth and existing physical/quality/
LAN requirements remain. Frontend07 checks are carried; Phase03/schema/upstream
and Queue proposal unchanged. No manual inference dispatch or owner-file cleanup.

## USER-FEEDBACK-07 — OBS Stop waveform (2026-10-09)

Stopped overviews now allow bounded recording duration instead of the live120-second
cap, aggregating documents incrementally into at most600 points. Live/cursor caps,
ownership/provenance and source separation remain. UI refreshes journal immediately
and retains same-take overlapping bins during Stop/loading. Real copied406-second
owner envelopes pass; baseline adapter reproduces422; original media hashes match.
Frontend639/73, API682/two existing warnings, typecheck/build pass:
`docs/gates/user-feedback-07-obs-stop-waveform.md`, ADR0054.
Exact next UX-EDITING-DEVICE-01 requires native Stop/overview/playback after reload
and earlier editing/scroll acceptance. Owner accepted Record signal/overlap only.
STT-TIMING-ACCURACY-01 reviewed word truth, existing browser/physical/quality/download/
LAN requirements and hours-long archive latency remain. Phase03 budgets, schema,
upstream and Queue proposal unchanged.

## USER-FEEDBACK-06 — responsive deletion and fresh OBS journal (2026-10-09)

One-pass/Worker deletion retains surviving word identity and one history commit,
with stale-result cancellation and pending/error feedback. Yellow notices scroll
outside editable text; virtual/prose offsets account for their height. Removed
historical machine project owners no longer block fresh OBS journal persistence;
missing completed journals are not fabricated. Frontend637/73, API680/two existing
warnings, typecheck/build, actual Worker bundle and fresh PCM/waveform fixtures pass:
`docs/gates/user-feedback-06-script-deletion-and-obs-journal.md`, ADR0053.
Exact next UX-EDITING-DEVICE-01 needs permitted real long-footage deletion/scroll
and native OBS Record after reload. STT-TIMING-ACCURACY-01 needs reviewed word truth;
existing physical/quality/download/LAN and browser-tool prerequisites remain.
Phase03 budgets, portable schema and the Queue proposal are unchanged.

## USER-FEEDBACK-05 — individual subtitles and local timing edits (2026-10-09)

Timeline word-edit history works in normal/imported/archived OBS overview and
focused editors. Individual4px subtitle filtering replaces multiword summaries.
Atomic middle IN/OUT, neighbour blink/10% reservation, positive untrusted estimates
and2s hover guidance are implemented; Studio phrase fences prevent neighbour/gap
overlap. Frontend627/71, API679/two existing warnings and typecheck/build pass:
`docs/gates/user-feedback-05-timeline-word-timing.md`, ADR0052.
Exact next STT-TIMING-ACCURACY-01 follows `docs/STT-TIMING-ACCURACY-PLAN.md` with
reviewed word truth and isolated comparison. Acoustic improvement is unmeasured;
prior aligner/R5 gates are retained. UX-EDITING-DEVICE-01 real visual/history/audio
acceptance and existing browser/physical/quality/download/LAN prerequisites remain.
Phase03 budgets, project schema and Queue proposal are unchanged.

## USER-FEEDBACK-04 — Script row and history consistency (2026-10-09)

Owner confirms improved response. Logical speaker rows own their view fragments;
fixed checkbox/ordinal controls, checked-row attribution, pointer/focus Ctrl+A,
thirty-step session undo/redo and grouped track assignment are implemented.
Dense Timeline snippets restore overview text and increase detail with zoom,
preserving timestamps/hit tests. Frontend611/70, API677/two existing warnings and
typecheck/build pass: `docs/gates/user-feedback-04-script-rows-subtitles-and-history.md`,
ADR0051. Exact next UX-EDITING-DEVICE-01 requires permitted real visual/theme/
ordinal/density, history/scroll and audible acceptance. Existing tool restriction
and older physical/quality/download/second-machine gates remain. Phase03 budgets,
project schema and Queue proposal are unchanged.

## USER-FEEDBACK-03 — import slots and media selection (2026-10-08)

Immediate animated import choices/inspection rows, expandable folder tree,
closed multi-select detail constructors and immediate bulk checkbox intent are
implemented. Ordered writes and revision fences retain the newest action.
Bounded Script fragments and dense Timeline marker views preserve full-source
editing. Frontend602/69, API677/two existing warnings, typecheck/build pass; limits:
`docs/gates/user-feedback-03-media-tree-and-responsive-selection.md`, ADR0050.
Exact next UX-EDITING-DEVICE-01: permitted visual/native, real-STT selection/scroll
and audible acceptance. DOM tests do not establish real device latency. Existing
browser restriction and physical, reviewed recognition/speaker/identity, download
and second-machine gates remain. Phase03 budgets and Queue proposal are unchanged.

## USER-FEEDBACK-02 — Media Pool and pointer audio previews (2026-10-08)

Device multi-file Import, separate Host picker/errors, larger icons, root
breadcrumb clarification, lifecycle request fence and stage activity delivered.
Shared scrub preview covers ordinary/middle/imported/archived OBS interaction,
gain/mute and excluded boundaries. Frontend593/68, API677 and typecheck/build pass;
API runs and readiness timing caveat are in the current gate:
`docs/gates/user-feedback-02-media-and-audio-scrubbing.md`. Unified Queue is a
source-grounded proposal (`docs/AI-QUEUE-PROPOSAL.md`), not shipped orchestration.
Exact next UX-EDITING-DEVICE-01 requires permitted visual/native, real-load and
audible checks. Existing browser restriction and older physical, reviewed
recognition/speaker/identity, download and second-machine gates remain open.
This round does not complete Phase03-04 or change phase acceptance budgets.

## USER-FEEDBACK-01 — recovery and footage interaction (2026-10-08)

Bounded feedback delivery reconciles orphaned STT/DIA flags, validates resumable
MKV/OBS ownership and fences removal. Shared all/missing/cancel choices cover
STT/DIA/Training/Generate; forced clips and GPU terminal handover retain outputs.
Adjacent Import/folder icons, priority selection feedback and shared compact
subtitles are implemented. Frontend580/67, API677/two existing warnings,
typecheck/build pass: `docs/gates/user-feedback-01-processing-and-footage-ui.md`.
Actual PDCA stale state repaired without replacing completed transcripts; valid
Test_OBS_05 checkpoint owners retained. Exact next UX-EDITING-DEVICE-01 requires
allowed visual/native, real-load and audible checks. Older physical, reviewed
recognition/speaker/identity, download and second-machine gates remain open.
This round does not complete Phase03-04 or change phase acceptance budgets.

## TASK-STOP-DEVICE-01C — settle cancelled activity (2026-10-07)

Bounded STT/diarization Activity Center repair passes regression and actual
new-API GPU cancellation checks; first Stop retains active work and the footer
returns READY after hard Stop. Gate: `docs/gates/task-stop-device-01c-activity.md`.
Exact next01D needs selected project/Speaker and compatible Training/Generate
artifacts. Parent device/identity, physical and older phase gates remain open.

## TASK-STOP-DEVICE-01B — real diarization Stop (2026-10-07)

Cached community-1 No/Yes/new-worker rerun has actual process, raw-span and PCM
evidence in `docs/gates/task-stop-device-01b-diarization.md`. An observed stale
Activity Center task makes01C the exact next repair/acceptance slice. Parent
device, Training/Generate and older phase/physical gates remain open.

## TASK-STOP-DEVICE-01A — real STT Stop (2026-10-07)

Cached Medium/CUDA execution passes No/Yes/new-worker rerun on copied speech.
The cancelled record and original/analysis PCM remain unchanged; no speech
quality, latency or physical recording acceptance is claimed. Full checks and
tool limitations: `docs/gates/task-stop-device-01a-stt.md`. Exact next01B:
community-1 diarization. Parent device acceptance and older phase gates stay open.

## TASK-STOP-01 — confirmed processing Stop (2026-10-07)

The four processing panels share first-click queue Stop and two-click confirmed
active cancellation. Includes detailed MKV/OBS STT, owned subprocess shutdown,
publication fences, training Resume ownership and generation intake reservation.
Frontend560/63 files, API646, Studio22, typecheck/build and browser Yes/No proof pass. Full API
and Studio evidence: `docs/gates/task-stop-2026-10-07.md`, ADR0047.
Exact next: TASK-STOP-DEVICE-01 for real-model shutdown and rerun/Resume after
normal app/Studio restart. Older UX device and product phase gates remain open.

## UX-INTEGRATION-01 — requested editing workflow (2026-10-07)

Nine bounded UX rounds cover concurrent multi-file import, portable nested
organization, Script/native text edits, source-time word interpolation and
promotion, shared subtitle editing, working/cut exclusions and list gutters.
Frontend550/62 files, backend588, typecheck/build, real PCM preservation and
browser persistence have evidence in `docs/gates/ux-editing-2026-10-07.md`.
Owner device checks cover native picker, loaded STT smoothness and audible
timestamp scrubbing. Exact next: UX-EDITING-DEVICE-01. This UX delivery does not
advance Phase03-04 or close the older nine recognition/physical parent gates.

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


## LIVELINK-STT-19B7 — preserved-context boundary rejected (2026-10-05)

One1.1s boundary candidate with repaired quiet PCM reduces final spans29->16,
but CER19.62->20.92% and WER24.19->26.14%; reject, retain0.5s default.
16/16 source spans and hashes match, no errors. Timing is confounded by the
concurrent fullbackend suite and additional Studio model load; no causal speed
claim or repeat. See `docs/gates/livelink-stt-19b7-1s-pcm.md`.
Full19A/19B CER, reviewed word anchors and physical OBS timing remain open.
Nine near-term parent rounds remain; no phase advance or budget relaxation.


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


## LIVELINK-INGEST-18C2 — width-two candidate rejected (2026-10-04)

Sixty same-catalog groups/360 pairs per variant: two-pair width cuts group wall
15.23% (38.666s ->32.776s), pair p50/p95 137.801/282.156ms. Frozen throughput and
ACK screening fail; no API/native integration. All source/output bytes verified,
two fsyncs and ordered publication retained. Six profiling safety tests pass.
Unchanged product validation carries backend 561/frontend 477/typecheck/build.
Evidence docs/gates/livelink-ingest-18c2-width-two.md and JSON. 18B/18C stay open;
ten scheduled rounds remain. Budget question is pending, no threshold relaxed.
Next ingestion scope proposed LIVELINK-INGEST-18D design/candidate after explicit
budget disposition; physical OBS and full HTTP gate remain. No phase advances.


## LIVELINK-INGEST-18B2 — descriptor writer rejected (2026-10-04)

60-pair interleaved E: probe preserves two fsyncs and PCM-before-metadata; all
persisted/source bytes exact. Raw descriptor writer takes 5098.945ms vs current
4663.421ms (9.34% slower); candidate rejected before full HTTP/live OBS gate.
Production is unchanged; 18B acceptance remains open. Evidence:
docs/gates/livelink-ingest-18b2-raw-pair.md and JSON. Product validation carries
from 9c88c92 (backend 561/frontend 477/typecheck/build); helper checks follow in
18C2. Exact next requested scope 18C2 two-pair concurrency screening. No phase
or scheduled-round completion advances.


## VOICE-EXPORT-13B2 — subtitle timing bounds (2026-10-04)

Completed bounded repair: refuse words outside playable audio and cues collapsing
to equal SRT milliseconds, without inventing timestamps. Failed export preserves
prior valid SRT. Four observed regressions repaired. Actual API move/Open Existing
keeps WAV/word/line hashes and all source audio; invalid timing returns HTTP 400.
Full backend 561 passed; final exporter 10 passed after strengthening artifact
preservation checks. Unchanged frontend 477/typecheck/build carries from 13B1.
See docs/gates/voice-export-13b-bounds.md and companion JSON. Browser saved-file,
cancel and real speech evidence remain open; parent 13B is not accepted.
Exact next independent queued round UX-05B requires functioning browser control;
MKV-ACCEPT-01 retains reviewed 19A timing/recognition prerequisites. No phase or
scheduled queue completion count advances.


## VOICE-EXPORT-13B1 — truthful export handoff (2026-10-04)

Completed bounded repair: browser handoff is no longer reported as a confirmed
saved download; Voice Output SRT displays the count of cues omitted for untrusted
timing. Selected-output identity, API WAV bytes and word/line cues verified.
Backend 557, frontend 477/56 files, typecheck/build pass. Actual browser download
artifact/cancel/move evidence remains open after browser interruption; parent
VOICE-EXPORT-13B is not accepted. See docs/gates/voice-export-13b-handoff.md.
Next bounded work VOICE-EXPORT-13B2 export interval validation; MKV-ACCEPT-01
reviewed timing/recognition prerequisites remain open. No phase advances.


## Overview

Build one portable, local-first production workspace that carries project audio
from capture and transcription through dataset preparation, voice creation,
voice manipulation, LipSync, and a distributable Windows desktop release.

This roadmap distinguishes three states that older snapshots blurred:

- **Complete**: implemented and backed by the plan's required evidence.
- **In progress**: usable slices exist, but at least one plan contract or
  end-to-end acceptance gate remains open.
- **Planned**: a contract may exist, but no product slice is claimed complete.

## Phases

## MKV-FOLLOW-03 — selected-stream Cluster decode (2026-10-04)

Complete at measured decoder scope. Probe/decode all selected streams once per
complete Cluster while retaining original per-stream first PTS, PCM alignment,
fsync and per-Cluster checkpoint. Generated six-track/ten-minute backlog improves
99.213s -> 65.851s (33.63%, 9.11x timeline realtime). Retained actual OBS prefix
12 Clusters/49.92s improves serial control 20.430s -> 10.197s (50.08%). Decoder
calls drop 83.33%; all PCM/frame/gap metadata remain exact. Existing tiny AAC gaps
are preserved, not claimed fixed. Sampled process-tree RSS stays below 72 MiB;
not a hard bound for arbitrary Clusters. Owner source is read only/hash unchanged.

Generated six-track restart and Finish hashes pass; focused follower 19 tests
pass. Final full backend: **557 passed**, 167.31s, two existing deprecation warnings. Unchanged frontend
475/typecheck/build evidence carries from MEDIA-STAGES-02. See ADR 0044 and
`docs/gates/mkv-follow-03-backlog.md` with metrics JSON. No phase advances.
Exact next **MKV-ACCEPT-01**, physical writer/A-V/speech acceptance. Full 19A
reviewed timing and 19B accuracy prerequisites remain open, as do 18B/18C budgets.

## MEDIA-STAGES-02 — materialize omitted tracks (2026-10-04)

Complete at completed-container scope. A previously omitted audio stream can
be added from Media Pool Import under the same footage. API deduplicates repeat/
concurrent requests; new WAV and parent selection publish in one index write.
Original source and existing analyses are preserved. Decode/index failure stays
retryable; edited Script/selected child are retained across list refresh.

Real MKV/MOV/MP4, local cache/original, concurrent/retry and move/Open Existing
checks pass. Browser adds Track 2 immediately, shows two waveforms under one
footage, and retains both after reload/reopen; console clean. Generated tracks
are mono24k PCM16/4 seconds, 440/880 Hz, no clipping; source/cache bytes match.
Final backend 552, frontend 475 in 55 files, typecheck/build pass. Owned services
and tab close. Evidence: ADR 0043 and `docs/gates/media-stages-02-track-addition.md`
with metrics JSON. Still-growing MKV must Finish before adding an omitted track;
uncached sources need their original locator; unpublished failed derivatives may
remain. No STT quality or phase completion is claimed.
Exact next **MKV-FOLLOW-03**. 19A timing/physical and 19B accuracy stay open.

## LIVELINK-STT-19B2 — beam-search candidate rejected (2026-10-04)

Medium beam search 5 on the unchanged 19A corpus yields CER 22.17%, WER 25.97%,
still failing <=15% CER. The candidate is rejected; production beam 1/medium is
unchanged. Source hashes match. No physical/timing or phase acceptance advances.
Evidence: `docs/gates/livelink-stt-19b2-beam-candidate.md` and companion JSON.
19B recognition acceptance remains open; further context/segmentation diagnosis
must use a separate scope instead of lowering budgets. Exact next independent
queued work is **MEDIA-STAGES-02**; it does not depend on 19B acceptance.

## LIVELINK-STT-19B — larger model candidate rejected (2026-10-04)

Real large-v3 live candidate on frozen 19A speech reduces CER to 20.87% and
WER to 22.56%, still failing <=15% CER. Warm cadence plus drain takes 159.516s
versus 117.391s medium baseline; no exact latency percentile is inferred. Zero
request errors and original hashes unchanged. Product remains medium; no timing,
physical or phase acceptance advances. See
`docs/gates/livelink-stt-19b-model-candidate.md` and metrics JSON.
Exact next **LIVELINK-STT-19B2**, one medium beam-search candidate. The owner
requested sequential rounds in this session; commit each before proceeding.

## LIVELINK-STT-19A — real speech baseline (2026-10-04)

Two real-model runs freeze normalization, proposed budgets and curated
two-track Vietnamese references. Warm LiveLink live CER 22.97% and detailed
11.88% fail proposed CER budgets; growing MKV live 51.72% fails, detailed
9.19% passes text only. Original PCM/hash checks and browser seek pass.
Timing anchors, physical clocks, row/overlap and silence/seam acceptance remain
open. Full backend 547/frontend 473/typecheck/build pass. See
`docs/gates/livelink-stt-19a-speech-quality.md`. Exact next STT-19B is activated
for one measured LiveLink recognition accuracy failure. No phase advances.

## LIVELINK-08N-B — retained PCM recovery (2026-10-04)

Scoped retry/export and a real private six-source outage/restart complete parent
08N at health/recovery scope. Exact source PCM, Stop trimming and verified six
FLAC/WAV artifacts pass; final backend 536, frontend 473, native 2/2,
typecheck/build pass. Plugin 0.6.10 is installed with pairing unchanged. See ADR
0042 and `docs/gates/livelink-08n-b-outbox-recovery.md`. Exact next STT-19A;
speech quality and 18B/18C latency remain open. No product phase advances.

## LIVELINK-08N-A — visible retained outbox (2026-10-04)

Completed the optional native/API/UI health seam with legacy-safe machine-local
enqueue timestamps. Final backend 526, frontend 471 / 55 files, native 2/2,
typecheck/build and isolated real-browser fixture pass. See ADR 0041 and
`docs/gates/livelink-08n-a-outbox-health.md`. Parent 08N still needs scoped
retry/export and a longer multi-source API outage/Stop recovery in exact next
**LIVELINK-08N-B**. No product phase or installed-plugin acceptance advances;
18B/18C optimization/budget decision remains open.

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

LiveLink/STT continuation (GAP-PLAN, 2026-10-03):
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




Historical GAP-PLAN was documentation-only; its carried baselines are superseded
by the checks above. Its plan evidence remains in `.scratch/gap-plan/`.

- [x] **Phase 1: Foundation** - Portable project shell and reusable application modules.
- [ ] **Phase 2: Speech to Text** - Trustworthy capture, transcription, review, timing, and diarization.
- [ ] **Phase 3: Voice Training** - Deterministic datasets, real training runs, and gated voice publication.
- [ ] **Phase 4: Dockable Workspace** - Six-zone docking and lifecycle-independent workspace sessions.
- [ ] **Phase 5: Manipulator Pipeline** - Generation and voice conversion with honest lineage and runtime state.
- [ ] **Phase 6: LipSync** - Reviewed video/audio inputs, adapter-backed rendering, and QC.
- [ ] **Phase 7: Desktop Release** - Model delivery, security boundaries, packaging, updates, and installation.

## Phase Details

### Phase 1: Foundation
**Goal**: Run a portable project-based React/FastAPI workstation whose modules do not import engine implementations.
**Depends on**: Nothing
**Requirements**: ENG-01, ENG-02, ENG-03, MOD-01, MOD-02, PRJ-01 through PRJ-07, UI-01 through UI-05
**Success Criteria**:
  1. A user can create, reopen, move, and reconnect a project without absolute project-internal paths.
  2. Shared modules compose multiple pages without page-specific copies.
  3. OmniVoice remains read-only and is reached only through product-owned adapters.
**Plans**: 1 plan

Plans:
- [x] 01-01: Application shell, persistence, shared modules, and upstream engine boundary.

### Phase 2: Speech to Text
**Goal**: Turn imported or recorded speech into a reviewable Script with source-provenanced timing, waveform playback, diarization, and honest processor state.
**Depends on**: Phase 1
**Requirements**: STT-01 through STT-13, WF-01, WF-03, WF-04, WF-05
**Success Criteria**:
  1. Finalized local STT persists text, revisions, word timing, and synchronized Script/Timeline playback.
  2. Untrusted timings remain visible for review but cannot silently enter subtitle cues.
  3. Diarization assigns reviewable speaker labels without claiming voice isolation occurred.
  4. Realtime, accurate, AI, and user candidates can be reconciled per word.
**Plans**: 1 written plan plus remaining unplanned review work

Plans:
- [x] 02-01: Capture, finalized STT, Media Pool, transcript review, timing stabilization, and diarization.

Durable chunked live transcript handoff and recovery are implemented slices.
Remaining outside the completed plan artifact: the final per-word candidate
confirmation UX, frozen real-speech quality and wider capture/MKV acceptance
in GAP-PLAN. Phase 2 stays open despite its completed written plan artifact.

### Phase 3: Voice Training
**Goal**: Compile selected, attributed audio into deterministic manifests; execute real model jobs; publish identity-safe project voices with reproducible lineage.
**Depends on**: Phase 2's finalized-audio and word-timing contracts
**Requirements**: TRN-01 through TRN-09
**Success Criteria**:
  1. Only selected, validated, speaker-owned segments enter a deterministic portable Dataset Manifest.
  2. A real run can start, cancel, resume, retain checkpoints, and report engine-derived progress.
  3. Published voice artifacts record their dataset, engine, configuration, and identity-gate evidence.
  4. Guided capture can resume after restart and produces QC-reviewed, tiered training material.
**Plans**: 4 plans

Plans:
- [x] 03-01: Training Catalog, Speaker Profiles, annotations, and Train UI.
- [x] 03-02: Dataset compiler, supplied-script validation, portability, and readiness UI.
- [ ] 03-03: Runtime, run lifecycle, lineage, and the fail-closed `SpeakerEmbedder` gate are implemented; threshold calibration and a verified real gated publish remain.
- [ ] 03-04: Reading packs, capture tier, HQ Recorder, and teleprompter exist; durable sessions, capture/QC/finalize, tier policy, and identity lock remain.

### Phase 4: Dockable Workspace
**Goal**: Make module placement configurable without changing module behavior or stopping active work.
**Depends on**: Phase 3
**Requirements**: MOD-01, MOD-02, UI-01 through UI-04
**Success Criteria**:
  1. Six zones support persisted, keyboard-accessible docking and resizing.
  2. `WorkspaceSession` owns recording, playback, streams, and jobs independently of panel placement.
  3. Existing fixed manifests migrate without breaking current projects.
**Plans**: 1 plan

Plans:
- [ ] 04-01: Dock contract, migration, maintained-library spike, and WorkspaceSession.

Current page manifests, Dashboard, and module reuse are useful pre-work, not
evidence that the dock contract or lifecycle migration is complete.

### Phase 5: Manipulator Pipeline
**Goal**: Produce and transform project-owned voices and audio through real adapters, with complete lineage and no simulated processor success.
**Depends on**: Phase 3 publication contracts and Phase 4 session ownership for live streams
**Requirements**: MAN-01 through MAN-21, WF-01 through WF-05
**Success Criteria**:
  1. Text/script generation creates project-owned playable outputs through selected project voices.
  2. File and live voice conversion preserve lineage and pass a frozen Vietnamese quality/latency gate.
  3. Isolation, dubbing, and patching expose real adapter-backed jobs before being presented as available.
  4. Reference-derived timing, synchronized range selection, Ctrl-handle audio stretching with ripple, and incremental Fix Voice Generated preserve explicit edit intent and publish verified audio revisions. Detailed proposed rounds: `docs/VOICE-MANIPULATOR-NEXT-PLAN.md`; this requirement extension does not advance phase completion.
  5. Multiple reference footage assets can be marked and assigned to selected spans per characteristic, with independent value/time randomization and a frozen, reviewable schedule that incremental Fix can reproduce.
  6. Reference Detail in the right column exposes two-line target/reference slots and expandable per-source selected characteristics for every assigned span.
**Plans**: 1 written plan; additional processor plans remain

Plans:
- [ ] 05-01: Voice Changer evaluation, RVC training, file/live conversion, device loop, and verification.

Generation, Voice Output, RVC training, consent, and live device conversion are
implemented slices. The Vietnamese gate is partial and currently fails its
cross-speaker CER target; file-conversion workflow evidence, loopback latency,
speaker similarity, cross-gender coverage, owner A/B, and the other Manipulator
processors remain open.

### Phase 6: LipSync
**Goal**: Render approved project audio onto reviewed video through an interchangeable engine adapter and human QC.
**Depends on**: Phases 4 and 5
**Requirements**: WF-01 through WF-03; LipSync requirements to be assigned
**Success Criteria**:
  1. The user can approve eligible video, audio, and face-shot inputs before rendering.
  2. A persisted adapter-backed job reports real progress, diagnostics, cancellation, and retry state.
  3. Accepted derivatives return to the project with portable lineage.
**Plans**: 1 plan

Plans:
- [ ] 06-01: LipSync page preview slice exists; portable alignment approval, adapter contract, render lifecycle, engine gate, and QC remain.

### Phase 7: Desktop Release
**Goal**: Deliver the proven workstation as an installable, updateable, secure Windows application with explicit model/runtime management.
**Depends on**: Proven core workflows from Phases 1 through 6
**Requirements**: Packaging and model-management requirements to be assigned
**Success Criteria**:
  1. Base models/runtimes install, verify, update, report disk use, and remain machine-local.
  2. Project adapters and voice artifacts remain portable without duplicating shared base models.
  3. Credentials leave plaintext preferences before distribution, and authorization exists before a second user or remote exposure.
  4. A signed installer, updater, rollback path, and offline behavior are verified.
**Plans**: 1 current architecture plan plus future packaging plans

Plans:
- [x] 07-01: Define model-delivery and identity/security seams without pretending adapters exist.

The domain models and ports from 07-01 exist as designed. No `ModelStore`,
authentication, authorization, or secret-store adapter is wired; packaging,
installer, updater, signing, and release verification are not started.

## Progress

| Phase | Written plans complete | Status | Evidence boundary |
| --- | --- | --- | --- |
| 1. Foundation | 1/1 | Complete | Project, module, portability, and adapter tests |
| 2. Speech to Text | 1/1 | In progress | Finalized path works; realtime candidate UX remains |
| 3. Voice Training | 2/4 | In progress | Compiler and large run/runtime slice pass; gated set publication remains |
| 4. Dockable Workspace | 0/1 | Planned | Fixed manifests only; no dock/session contract |
| 5. Manipulator Pipeline | 0/1 | In progress | Generation and RVC live slices exist; plan gate remains incomplete |
| 6. LipSync | 0/1 | In progress | Source preview/timing draft; render and QC gates open |
| 7. Desktop Release | 1/1 | In progress | Architecture seams complete; release implementation absent |

The GSD plan counter is only an artifact counter. Phase status above is the
product truth: a phase stays open when its user-visible success criteria remain
unmet even if every currently written plan has a summary.

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
