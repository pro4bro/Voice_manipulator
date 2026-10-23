# Work Rounds

## SUBTITLE-ACTIONS-01 — visible preview/apply controls (2026-10-23)

Owner could not find Ghost Preview/Apply Aligner: the previous labels differed,
actions were below all settings and disappeared without an eligible track.
Both now stay visible immediately below the refinement heading, with disabled
state guidance and the existing preview/apply/restore protections. EasyAligner
defaults remain. Focused frontend16 and backend42 pass, typecheck/build214 pass;
isolated browser checks preview/apply/restore, empty selection and narrow columns.
No owner media or model run. Gate: `docs/gates/subtitle-actions-01-20261023.md`.
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

Native MKV/multitrack selection now opens the ordinary Import review immediately:
cache/link, per-track Import/STT and normal Import, with a separate MKV follow
section. Pending click/right-click reopens the review; processing cannot reopen
it. Cache survives track edits; no work starts before explicit confirmation.
Cancel/backdrop/Escape withdraw pending selection and focus stays in the dialog.
Browser upload keeps its queue/native handoff. Follow notice matches automatic
final import and optional full-file STT. ADR0133 records the contract.

Source confirms local faster-whisper/Whisper tiny for OBS and MKV live preview;
MKV preview slices3s, detailed phase large-v3. No model/media/backend change.
Frontend1219/150files/192.68s, focused135 then latest69+2, typecheck/build213/409ms,
related API32/2 existing warnings/91.37s and isolated mutation pass. Four new
regressions; existing callback assertions remain. See mkv-import85 gate.

Browser remains disabled; no live UI/device UAT. Full API containment gap from84
remains open; unsafe process tests are not repeated or waived. Runtime ports are
stopped at closure; no runtime restart/owner project writes for this UI round.
Build is ready for the next normal launch. Phase03 stays60%, Phase06 open; stop85.

## Round84 — GROWING-MKV-PLAYHEAD-01 (2026-10-22)

Fixes a reproduced96→60s playhead reset after dragging across growing-MKV refresh.
Pointer/paused coordinates retain authority; only active primary playback owns
the clock. Stable track identity keeps audition alive across payload polling.
Analysis-path/duration revisions reload new PCM and restore position before its
clock resumes; a scrub invalidates pending full Play activation. Normal imports,
full-fit and safe-edge navigation remain. ADR0132 and the mkv-playhead84 gate
record the evidence and six new regressions.

Frontend1215/150files/177.12s, focused77+16, typecheck/build212 and isolated mutation
pass. Real two-track MKV/WAV queries grow2.925625→24.0326667s; six Range reads206,
full final PCM and source hashes pass. Browser is disabled in Work settings, so
new browser/device UAT remains open. No backend/media/persistence changes.

API full is not green:1317 pass/1 portable updater isolation failure/3 existing
warnings/615.14s. Its protected-process check reports the live source API stopped;
the managed stack also went down. Canonical console start restores healthy API/
Studio/current build. Do not repeat the live portable process test until its
termination containment is fixed; the failed wrapper and local issue remain in
`.scratch/playhead84/`. No assertions/gates are weakened. Phase03 stays60%, Phase06
open; stop84 with this verification gap explicit.

## Round83 — GROWING-TIMELINE-FIT-01 (2026-10-22)

Full zoom-out now retains fit intent while imported MKV or OBS footage grows.
Slider/minus select the full source extent continuously; zoom-in keeps a finite
manual window. OBS extent grows past120s while waveform requests remain bounded
to120s/600 points at the visible tail. The live clock continues during a held
source-linked playhead. Ordinary recording already fits at zoom factor1 and has
new growth coverage. No backend, media, engine or persistent-format changes.

Actual browser follows a two-track AAC MKV from2.925625 to24.0326667s without
reload; full fit stays at slider0 through final import. Manual zoom retains its
5.8513125s window across another append. Source bytes match; both24kHz mono PCM16
tracks contain the complete24.0326667s. ADR0131 and the timeline-fit83 gate retain
evidence and the separate OBS acquisition limit.

Validation: frontend1209/150files/174.01s, typecheck/build212, API1318/3 existing
warnings/629.93s pass; isolated fit-condition mutation killed. Initial failures
remain recorded and assertions/thresholds stay intact. Managed app health is ok
and serves the current build. Phase03 stays60%, Phase06 open; physical OBS/device
acceptance remains open. Stop83.

## Round82 — MKV-RECORDING-SLOTS-01 (2026-10-22)

Followed-MKV footage and every displayed track show a pulsing red circle in place
of the Import tick and45-degree stripes moving left-to-right until final-source
publication. Existing Import choices stay functional/unchanged. The parent's
completion signal clears all track indicators independently of STT; ordinary
imports and recycled footage are excluded. Status descriptions/text and static
reduced-motion cues remain. No new polling, media or backend behavior.

Browser on an isolated real-app/two-track AAC MKV fixture confirms three recording
slots, actual positive horizontal stripe motion and automatic return to three
native Import controls without reload. Final source bytes match; both24kHz mono
PCM16 tracks include the full8.034125s. ADR0130 and the recording-slots82 gate
record verification and the provisional-state meaning. Phase03 stays60%, Phase06
open; physical OBS/device acceptance remains open. Stop82.

Validation: frontend1203/150files/193.56s, typecheck/build212; API1318/3 existing
warnings/629.79s. First frontend waiter failure is retained; unchanged focused5
and full replay pass. Isolated recording-state mutation is killed. No thresholds
or assertions relaxed; app health JSON is ok and current build is served.

## Round81 — INPUT-FEEDBACK-01 (2026-10-22)

Replaced Input's per-word refinement modal with eight enable/collapse methods,
editable IN/OUT, contextual Timeline Ghost Preview and one Apply New Timing.
Changed words move; manual/unchanged coordinates remain exact. Shown conflicts
remain red/pulse after explicit Apply; source fencing and Restore/Undo remain.
Retained OBS Live STT survives Stop/reopen/clear semantics. Capture Source owns
OBS visibility/lease and survives Recorder remounts. Independent loading,
single-flight polls,15s reads and retry address reproduced stalls; the historical
whole-app hang's exact cause remains unproven.

OBS Stop/sealed MKV now triggers full background source import with tail and
byte-verified final PCM; no automatic final STT. Explicit STT afterward uses the
ordinary full-file track queue; late growing results cannot overwrite it.
Actual live-writer, two-track tail, retained text, whole-file recognition,
shutdown drain and real browser Ghost Apply/Restore/source visibility checks pass.
Full frontend1201/150files, typecheck/build212 pass; API closure in the gate.
Frozen692-word common trial changes690 with4 conflicting indexes, IN/OUT median
64.3/54.2ms on587 evaluator pairs. Vector21 changes remain experimental; this
reviewed bulk operation does not lower acoustic gates. Heard owner hashes equal.

ADR0129 and `docs/gates/input-feedback81-20261022.md` retain failures, measurements
and limitations. Physical OBS/device audition and held-out acoustics remain open.
Managed runtime reloaded healthy after29-project idle preflight. Phase03 stays60%,
Phase06 open; no default STT/portable release change. Stop81.

## Round80 — INPUT-SUBTITLE-REFINEMENT-01 (2026-10-22)

Input right-column Tinh chỉnh subtitle opens eight separate refinement/diagnostic
methods on any finalized footage/track. Common/edge/group offsets, individual CTC,
manual offset, PCM-vector review and conservative combined retain source-bound
preview, selected Apply/Restore and manual locks. Read-only drift includes manual
words,250/500ms suspicions, inspectable CTC coordinates and unknown coverage.
Matching acoustic artifacts are reused across trials; no universal learned rule.

Frozen current Conviction: common640/692 ready, IN/OUT medians69.1/56.3ms on587
fixed pairs; vector21 changed proposals, all review. Current177/68 CTC suspicions
at250/500ms versus18/1 on a fresh owner-reviewed-word diagnosis. These are model
disagreements to hear again, not confirmed owner errors. Owner hashes unchanged.
See ADR0128 and `docs/gates/subtitle-refinement80-20261022.md`.

Full frontend1186/147files and API1307/3existingwarnings pass; latest focused18
frontend/60 backend, final typecheck/build210 pass. Isolated diagnosis mutation is
killed. Browser/device audition remains pending because Work settings disabled
browser access. Held-out acoustic quality remains open. Phase03 stays60%, Phase06
open; no STT default or portable release change. Stop80.

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

Received the owner's heard Conviction reference and froze all original media,
Script and STT by hash. Of697 edited words,680 are explicitly manual/trusted;
581 match the archived665-word STT unambiguously across all optimal lexical
alignments.99 unmatched manual and17 nonmanual references stay reported.
MP3 decode exactly matches analysis PCM; no clipping or source-clock offset.

Actual current60s/2s CPU large-v3 replay produces692 words/587 unique manual
pairs. Before refinement/SRT, signed IN/OUT medians are-159.8/-100.8ms. The early
boundary symptom is reproduced before persistence. Experimental offline250h CTC
improves typical IN/OUT to18.2/24.5ms absolute medians on565 shared anchors, but
OUT p95452.7ms versus current404.9ms and41 overlapping pairs reject a default
replacement. No scalar offset is fitted. See the conviction78 gate for complete
paired metrics, retained failures, model/source provenance and limitations.

Focused35 pass; frontend1175/145files, typecheck/build205 pass. Full API1245pass/
3existing warnings/641.34s; closure input/chunk/source hashes pass. New comparison/probe tooling only; existing LipSync and
Timeline edits remain intact. No owner-media/transcript, upstream engine,
project-format, production STT default or portable release changes. Phase03
stays60%. Next: consistent bounded alignment windows, corrected-text comparison
and held-out conversation; acoustic acceptance remains open. Stop after78.

## Round77 — SUBTITLE-SCRUB-PREVIEW-01 (2026-10-21)

Fixed Vietnamese subtitle gaps caused by Georgia Pro tone-mark advance and
clipped line boxes. Ordinary/imported/OBS words and copy ghosts use Arial/Segoe
UI fallbacks; normal labels have enough line height for composed/decomposed text.
Preferences → Timeline now saves start/center/end audition positions, with center
as the default. A shared 120ms grain repeats while a plain click/drag is held;
its faint overlay shares the exact bounded source interval. Release/cancel,
Escape, blur and source cleanup stop it and restore the pointer clock/rate.
Removed audio stays silent; clip endpoints and partial metadata are bounded.

Final frontend 1175 passed / 145 files (170.64s), typecheck/build205 passed;
full API 1232 passed / 3 existing warnings (606.48s). Real headless audio checks
pass all three positions, and all 18
Vietnamese shaping/ink cases pass. ADR0126 and subtitle-scrub77 gate hold evidence.
Existing uncommitted LipSync work is retained. No media/model/engine/project
format changes or portable release. Phase03 stays60%; stop after round77.

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

## Rounds71–75 — reviewed-face MuseTalk prototype (2026-10-21)

Owner explicitly requested five more rounds. Closed the runtime/checkpoint,
scoped face analysis, reviewed identity/profile mapping, speaker scheduling and
actual MuseTalk job/artifact slices. See ADR0124 and
docs/gates/lipsync-runtime71-75-20261021.md. Isolated CUDA runtime and pinned
checkpoints pass verification. UI analyzes/reviews faces, schedules only bound
speakers, runs/cancels jobs, auditions After on the shared Timeline and exports
composition/source derivatives. Real visible fixture:35 applied/45 skipped;
full-source:75/55 with3 decoded MP4s. Running cancellation releases GPU/no After.
Full frontend1153pass and API1224pass; final focused74/37 plus catalog81 and
cleanup3 pass; typecheck/build201. Browser found/fixed portrait cropping and
gallery width. No client/generated-voice visual quality acceptance, real
simultaneous multiperson gate, full native pipelines, face swap, automatic
selective repair or release. Phase03 stays60%; Phase06 remains open. Stop75.

## Rounds66–70 — authorized LipSync batch (2026-10-21)

Owner explicitly requested five consecutive rounds, overriding the usual stop
for this invocation. All five implemented slices are closed; artifact gates stay
open. ADR0123 and docs/gates/lipsync-composition66-70-20261021.md hold evidence.

- **66 LIPSYNC-NATIVE-SETTINGS-01:** backend resolves each engine's own controls,
  rejects foreign keys, applies mode defaults and validates native crop vectors.
- **67 LIPSYNC-COMPOSITION-STORE-01:** portable revisioned document, atomic saves,
  source validation, reload/move compatibility and save-in-flight fencing.
- **68 LIPSYNC-MULTILAYER-EDIT-01:** shared Timeline supports multiple clips/layers,
  duplicate/split/trim/extend/delete, order/enable, Undo/Redo and scrolling. Preview
  follows the top visible layer; original video/audio remain immutable.
- **69 LIPSYNC-PROCESSING-SCOPE-01:** independent detection/sync scopes choose
  layers, ranges and visible/placed/full-source clocks, with exact coverage review.
- **70 LIPSYNC-PREFLIGHT-REVIEW-01:** saved-input fingerprints, native settings,
  speaker-turn intersections, source-anchor conflict/detection-coverage checks and
  portable preflight snapshots. No face analysis or inference execution is claimed.

Full frontend1153pass/142files; full API1220pass/3warnings/623.30s, plus final
focused API11pass and frontend10pass after browser-driven corrections. Typecheck
and build200 pass. Real browser fixture confirms engine controls, video decoding,
top-layer visibility, seven-layer/audio scroll, scope save and real API preflight.
An earlier OBS RAF test failed once; isolated and full retry passed without OBS
changes. No model/runtime/face ID/render artifact or portable release. Phase03
stays60%; Phase06 remains open. Next: first isolated engine/artifact gate; stop70.

## Round65 — LIPSYNC-ENGINE-SETTINGS-01 (2026-10-21)

Downloaded MuseTalk, LatentSync and Wav2Lip as independent clean Git checkouts
under ignored runtime/engines/lipsync, with origin/commit receipts and repeatable
selective provisioning. The right column reads three task catalog entries and
offers source-traced, grouped inference parameters, independent engine drafts,
reset, numeric validation and MuseTalk offline/realtime defaults. Source presence
does not imply render readiness; all Generate/After operations stay disabled.
ADR0122, docs/LIPSYNC-IMPLEMENTATION-PLAN.md and LIP-01..06 requirements capture
the authorized next slices: portable multilayer composition/visibility schedule,
real engine artifact, recurring reviewed face identities, Speaker Profile/turn
scheduling, compositing and selective Voice Over repair. Engine capability/license
review is in docs/research/lipsync-compositor-capability-2026-10-21.md.
Final frontend1148pass/139files; typecheck/build196 modules pass. Full API evidence
is recorded in docs/gates/lipsync-engine-settings65-20261021.md. No new model,
runtime, face recognition or output video. Phase03 stays60%; Phase06 remains open.
Stop after this bounded round under AGENTS.md.

## Round64 — LIPSYNC-TIMELINE-UI-01 (2026-10-21)

LipSync now uses Input's column and Timeline row proportions. Its Media Pool /
Voice Output selector uses the shared library treatment, Preview Video fills
the Script footprint, and the right timing form exposes render status at the
reference viewport. The bottom calls the Timeline module in alignment mode:
video and generated voice share its ruler, zoom, navigator and transport, with
separate draggable/IN/OUT trimmable lanes. Voice waveform comes from the
existing endpoint. Numeric and keyboard timing controls remain. Source media
and project.json are untouched; the draft is session-only. ADR0121 and
lipsync-timeline64 gate record the UI boundary and visual check. Current
engine/license research is in docs/research/lipsync-engines-2026-10-21.md;
MuseTalk is a prototype candidate, not a quality acceptance or bundled model.
Final frontend1146pass/138files, typecheck/build195 modules. Full backend
1208pass/3warnings/667.15s. Browser layout was measured at1900×900;
real media playback was not part of the fixture. Phase03 stays60%; Phase06
render, After QC and face replacement remain open. Stop after this round.

## Round63 — LIPSYNC-PREVIEW-01 (2026-10-20)

Added a separate LipSync page shaped like Input: Media Pool video and generated
Voice Output selection at left, Preview Video in the center, timing controls at
right, and two draggable tracks below. The project-scoped video endpoint serves
the original footage by asset ID with byte-range seeking and rejects recycled,
disabled, non-video and missing sources. Preview mutes source audio, plays the
generated voice, and maps independent timeline starts and source IN points to a
shared clock. Timing is an explicitly unsaved session draft; After, Generate,
and face replacement stay disabled until a verified render adapter and output
exist. ADR0120 and lipsync-preview63 gate define later portable approval, job,
artifact and QC slices. Focused frontend10pass/3files plus WorkspaceShell61pass;
full frontend1144pass/
138files; typecheck/build194 modules pass. Focused API2pass incl Range and
last-page persistence.
Full API1207pass/1timeout/3warnings in736.65s; VibeVoice Streaming's separate
60s import gate passed alone after a measured47.63s direct warm import. No
source-media mutation, model, project.json structure change or rendered artifact. Phase03
stays60%; Phase06 remains open. Stop after this round.

## Stabilization round62 — SELECTION-DUPLICATE-SPACE-01 (2026-10-20)

Script/Timeline footage views now expose no stale waveform, transcript or
transport detail until footage or a selected OBS recording is opened. Alt plus
left drag on selected subtitle words previews translucent copies above the lane
and inserts them at the exact drop time, updating Script text. Occupied later
words move right with untrusted timing and retained source provenance; a drop
past the footage end is rejected without a write. Escape cancels the preview.
Space toggles ordinary and imported Timeline playback; OBS overview retains its
existing shortcut. ADR0119 and selection-copy-space62 gate record boundaries.
Focused88pass/4files; final frontend1138pass/136files/165.48s; typecheck and
build191pass. Full API1207pass/663.29s on retry after one transient timeout.
No media/model/project-schema change;
Phase03 stays60%. Stop after this round.

Release follow-up, 2026-10-20: issued alpha 0.5.18 NoVibeVoice from clean app
source `1ee57da`; 221 payload hashes and 226 ZIP entries verified. Since the API
requirements gained websockets after 0.5.17, the unchanged updater rejects this
app pack on the old base. Built a full portable from clean release source
`f185bb5`: 82,208 files / 44,019,963,564 bytes (41.00 GiB), with runtime/models ready.
Full bundle gate: 33 passed / 0 failed; local core API/UI/STT ASGI probes pass.
See docs/gates/portable-update-0.5.18-20261020.md for final release verification.
This packages round62 without advancing a product round or Phase03.

## Stabilization round61 — TIMELINE-EDGE-SPEAKER-01 (2026-10-19)

Closed graduated edge speed and subtitle speaker cue feedback. Shared edge pan
uses 10/20/30/40% viewport width per second at symmetric 90/95/100/outside bands;
physical source bounds, safe playhead position and release/cancel behavior remain.
Ordinary/manual subtitle bottom borders now retain assigned/inherited profile
color across playback and selection; manual timing edits use the orange top
border. Note explains both cues. ADR0118 and edge-speaker61 gate record RED cases,
intentional old speed test input changes and 32 real-browser CSS checks.
Focused 138 pass; frontend 1130 pass/136 files/149.48s; typecheck/build191 pass;
API 1207 pass/3 warnings/677.64s. Native held-drag/installed portable acceptance
remains separate. No portable issued; Phase03 stays60%. Stop after round61.

## Stabilization round60 — TIMELINE-SOURCE-BOUNDARY-01 (2026-10-19)

Closed the zoomed timeline endpoint regression. Ordinary dragging recognizes
physical DOM scroll limits despite fractional canvas widths; shared seek math
tolerates numerical boundary roundoff. At source boundaries the playhead reaches
0/duration outside10%–90%, retaining its released viewport. Interior safe-zone
and10% viewport/sec scrolling remain. Empty endpoint previews stay paused; delayed
canvas resize repaint uses the latest playhead time. ADR0117 and source-boundary60
gate record failing reproductions and evidence. Focused131pass; final frontend
1127pass/136files/161.28s, typecheck/build191 pass; API1207pass/3warnings/642.63s.
Browser DOM/media probe retains0/20.123s at fractional/max zoom after resize/media
events; native mouse capture and installed portable acceptance remain manual.
No portable issued. Phase03 stays60%; provider/acoustic/processor gates stay open.

## Round59 — OPEN-ENGINE-CONNECT-01 (2026-10-19)

Owner authorized missing repo/model downloads and per-function choices. Four
verified Git checkouts plus existing Applio/Demucs are connected to the catalog;
CosyVoice has a product worker/reference-clone choice, streaming ASR a separate
bounded PCM endpoint, and Sokuji a real local inspection bridge/model selector.
VD/VI/LT retain provider choices and explicit incomplete-processor status.
CosyVoice model receipts reject stale/wrong base artifacts; final download hashes
remain mandatory after resume. See ADR0116 and open-engine-connect59 gate.
Typecheck/build191 pass. Final Cosy/provisioning33pass, task-filtered catalog28pass;
frontend1118pass/136files/324.88s. Two startup/import failures recovered unchanged
in44.53s after host resources became available; final full API1207pass/3warnings/
737.89s. Real CosyVoice cross-language WAV:5.88s/24kHz/mono/FLOAT32, finite,
non-silent and no full-scale clipping. Readiness passed in20.125s after fixing
model-YAML dependencies. w-okada3.10 server/RVC imports pass after pinned Fairseq
source build and pyworld installation. Complete quality/device/translation/dub/
live gates remain open. No portable issued. Phase03 stays60%.
Round59 implementation/test gate is closed. Next: separate provider quality,
model/device and complete processor acceptance.

## Round58 — ENGINE-CATALOG-01 (2026-10-19)

Added a task-scoped provider catalog with declared languages, custom-voice
format, streaming input/output, native duration, word timing and machine
availability. Existing STT/generation/live-conversion choices share the same
descriptors as their jobs. Planned streaming VibeVoice-ASR and CosyVoice choices
remain disabled with exact missing prerequisites; OmniVoice Voice Dub is disabled
until its separate processor exists. Whisper selection checks each installed
weight snapshot; VibeVoice-ASR checks shards/tokenizer/Python; unknown or
unavailable STT choices fail before queueing, without falling back to Studio.
Script displays retained raw VibeVoice ASR speaker labels separately from user
Speaker Profiles and keeps estimated word times untrusted. No project format,
engine source, media or model weights changed. ADR0115 and gate
engine-catalog58 record scope and evidence. Frontend1112pass/136files/174.93s,
typecheck/build191 pass; API1152pass/651.42s with3 existing/fixture warnings;
focused backend15pass after a catalog-label correction; diff check pass. An
initial full run used the unsuitable portable Python and failed in a test
fixture whose PYTHONPATH that interpreter ignores; the development `.venv`
rerun is green. GPU was 99% occupied, so no inference acceptance was attempted.
STT-VIBE-01, STT-VIBE-STREAM-01, TTS-COSY-01 and LIVE-COSY-01 remain open with
their real corpus/model/device gates. Phase03 stays60%; Checkpoint A stays open.

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
Focused API42 pass; ADR0098 document preservation of integrity and cleanup.
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

## Voice Manipulator round17 — VM-FIX-02 (2026-10-16)

Explicit Apply creates immutable output with untouched PCM/gaps, ripple offsets,
word trust/lineage, adopted duration budgets and idempotent checksummed receipts.
Gain-only applies existing render with0TTS and no duplicate raw output. API48,
UI75/typecheck/build pass. Actual two-speech5.71s137040frames,0clipping, gap/row2
byte-exact, metadata/source hashes/idempotence/move/Open Existing pass. Next
VM-FLOW-01 → VM-PATCH-01 → VM-PATCH-REF-01 in owner batch. Listening/identity,
partial-word anchors, expressive/random and browser gates remain.

## Voice Manipulator round16 — VM-FIX-01 (2026-10-16)

Incremental clip planning/jobs, whole-row duration, durable checkpoints, Stop/retry,
stale revision/model/reference/timing guards and Fix UI integrated. API12 and
UI18/typecheck/build pass. Real trained full voice produced2.68s64320frames,
0clipping; no-op replay/source hash pass, lease released. No output applied yet.
Five-round owner request continues with VM-FIX-02 → VM-FLOW-01 → VM-PATCH-01 →
VM-PATCH-REF-01. Expressive/random, partial-word anchors and browser/listening
gates remain. See combined rounds16–20 gate and ADR0079.

## Voice Manipulator rounds11–15 — source slices delivered, gates open (2026-10-15)

VM-REF-RANDOM-01 finishes this requested batch's source work: seeded/frozen
value/time schedules, preview/apply, freshness/lock/event integrity and expanded
Reference Detail. Schedule/API/production-route7 and affected UI7 pass. Delivery
and randomized reference conditioning remain unverified processors; preview
latency/browser/listening are open. See combined rounds11–15 gate. Next planned
VM-FIX-01 retains these dependencies; Phase03 stays60%, no push/portable/model migration.
Final frozen-source frontend866/866, typecheck/build and current affected API51/51
pass. Earlier full API942 is explicitly bounded to its pre-final-change snapshot.

### Earlier notes within this batch (superseded by the summary above)

VM-LOUDNESS-01 wired verified render to Script playback/WAV download with portable
latest pointer and stale revision guards. Real5.15s123600frames clip/row gain,
source hash, no clipping, identical preview/download, move/reopen pass. Human
listening/native Save remain open; next VM-REF-RANDOM-01 schedule preview/persistence.

VM-DELIVERY-01 capability/preflight slice integrated. Script shows supported
baseline versus unsupported whisper/shout/mood/emotion/intensity requests;
unsupported fails before inference. Backend38 and frontend13 affected pass,
typecheck passes. No verified expressive conditioning or identity A/B exists:
this round's delivery quality remains open. Next VM-LOUDNESS-01 actual render.

VM-STRETCH-01 source integration adds actual pitch-preserving preview, Ctrl
handles, ready packet publication and undo/move/cache checks. Backend24 and
frontend84 affected pass; real4.73→5.15s PCM passes. Cold API812ms fails250ms
response budget; browser inventory empty and listening/continuous playback open.
See docs/gates/vm-stretch-01-20261015.md. Next VM-DELIVERY-01 capability preflight.

Owner requested five more rounds. VM-RIPPLE-01 contract/journal implemented;
focused13 backend checks pass; independent review in progress. Public handles
await real audio integration. Next VM-STRETCH-01, VM-DELIVERY-01,
VM-LOUDNESS-01, VM-REF-RANDOM-01. Delivery identity/listening and acoustic timing
remain separate gates; no FastPitch migration is part of this request.

This ledger applies the owner's progress-reminder rule. Each invocation performs
one bounded round, verifies it, records what the round means, and stops. The
closing report must always name: completed scope, evidence, remaining gap, why
that gap matters, and the exact next round.

Owner override, 2026-10-05: continue all remaining planned rounds after the UI
work and repair waveform volume. Execute bounded rounds serially with separate
evidence/commits; do not stop between executable rounds. Acceptance budgets and
physical/human evidence requirements retain their meaning.

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

Owner explicitly requested five checklist rounds in this invocation. Separate
commits deliver VM-GEN-01 cache repairs, VM-SCRIPT-01 portable hierarchy/intent,
VM-REF-LIB-01 independent footage role/import, VM-SELECTION-01 synchronized exact
ranges/readouts and VM-REF-ASSIGN-01 frozen-scope multi-reference assignment.
Live API PCM import/assign/idempotency/stale-revision/move/reopen/hash checks pass.
Final automated evidence is in docs/gates/voice-manipulator-first-five-20261015.md.

CPU and sandbox GPU attempts failed; native Windows GPU execution created an
actual full/clone/LoRA Script WAVs. Edit-one/reuse2, Stop-at2, retry3/3 and moved
project reuse3/3 passed with preserved hashes/lineage and PCM/boundaries.
Frontend844/backend870 and build pass. Script receipt is in the combined gate;
no listening/model identity success is claimed. Browser provider unavailable, so
actual browser/native UAT remains open. Timing/delivery/gain/reference controls
store requested intent; resolution/rendering/random/Fix are subsequent rounds.
Next exact implementation **VM-REF-DETAIL-01**, including clicking a slot to
navigate both Timeline and Script, with expansion independent of navigation.
Phase03 remains60%; no new portable. Existing external-library and Collection
GPU/native acceptance queues remain pending. See ADR0076 and each VM gate.

## HUB-COLLECTION-01 — main-source Hub and Collection (2026-10-14)

Owner screenshots repaired in main source: card hover gutter, compact title /
search, detail waveform bounds, distinct profile count and expandable model rows.
Profile/model selection drives native multi-ZIP import and folder export beside
Import. Collection-owned inference jobs publish only measured >=15s PCM samples
with adjacent metadata Script; verified cache/Script travels with each package.
Optional raw-hash Dataset Manifest snapshot provides train seconds; legacy unknown
and unsupported RVC synthesis remain explicit. Shutdown cancels owned workers.
Frontend818/84files, affected20/3files, typecheck/build pass. Backend full848pass /
3startup-timeout failures; exact unchanged rerun3/0, final focused88/0. Real IAB
hover3px clearance, six detail cards without overlap, count/selection/dark/light
and six-model scroll-end geometry verified. Actual Anh Vũ CPU attempt stopped
after583.06s without WAV; no real-model success claimed. See ADR0075 and
docs/gates/hub-collection-01-20261014.md. Phase03 stays60%, no portable pack.
Next acceptance HUB-COLLECTION-UAT-01: source Pull/restart, native dialogs and
trained >=15s sample on sufficient GPU. Next implementation remains
SOURCE-EXTERNAL-ASSETS-01 for full-source packaging/one external library path.

## Configuration round — SOURCE-SYNC-01 (2026-10-13)

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

## Queue

### 2026-10-13 — current: PORT-FEEDBACK-03

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

### 2026-10-13 — previous: PORT-FEEDBACK-02

Main source and alpha0.5.12 share selected-track players/Script, project-session
Gain/Mute/Solo (S below M), stopped failed OBS context menu/bin/restore and
external Voice Collection ZIP export/import for LoRA/full/RVC. Real source
browser exposed the two-child-to-parent synchronization defect; controlled
Media Pool selection regression red/green fixes it. Frontend795/84files,
backend819, typecheck/build pass. Actual root UPDATE33/0;154source/payload/
installed hashes and1,223,639byte ZIP verified, base unchanged. Two-player/two-
Script DOM/mixer reports match in real source/embedded portable UI; native
portable import/export retains payload/lineage. Evidence:
docs/gates/portable-feedback-02-20261013.md. Phase03 stays60%. Exact next:
PORT-FEEDBACK-UAT-02 — D-drive0.5.12 apply, real failed-take menu/bin/restore,
selection/Mute/Solo and actual trained-voice ZIP/inference acceptance. Physical
zero-PCM OBS cause remains unconfirmed; timing still awaits Conviction.

### 2026-10-13 — previous: PORT-REBUILD-01

Fresh alpha0.5.11 contains the current rebuilt app and a twelve-component manual
copy guide; VibeVoice remains listed without its payload. Deferred bundles become
ready only after root VERIFY succeeds. Shared OBS pending-row actions no longer
autoplace Retry into the narrow grid column. OBS install/repair migrates canonical
console paths from differently named older portable folders, preserving pairing.
Frontend785/84files, backend799, installer33, native builder/completion9,
typecheck/build pass. Hydrated actual root VERIFY33/0; thin kit correctly remains
incomplete. ZIP1.17MiB/151app hashes verified; full base about35.6GiB. Production
174routes/eightcatalogs match except omitted VibeVoice and recorded Git metadata.
Real portable PCM produces verified MKA/analysis WAV and browser waveform; no-PCM
meter control reproduces the owner's message, but D-device cause is unconfirmed.
Evidence: docs/gates/portable-rebuild-20261013.md. Phase03 stays60%. Exact next:
PORT-FEEDBACK-UAT-01 — new D-drive folder/copy guide/VERIFY/closed-OBS INSTALL,
native Forward/durable PCM capture and prior playback/STT/bin acceptance.
Independent timing still awaits Conviction.

### 2026-10-13 — previous: PORT-OBS-REPAIR-01

Owner's OBS install failure reproduced through native BAT: default Install
refuses damaged files and WinPS Stop interrupts on redirected Python stderr.
CLI-only auto mode now chooses Repair for damaged/missing installed files;
native error capture retains exit code/reason. Package hashes, running-OBS
guard, compatibility and pairing remain enforced. Installer29pass, frontend
785/84files, backend786pass, typecheck/build pass. Actual alpha0.5.9 pack33/0,
151 installed/ZIP hashes verified, models unchanged. Embedded Python/real
package probe repairs DLL and missing brand, keeps pairing and blocks running
OBS. Evidence: docs/gates/portable-obs-repair-20261013.md. Phase03 stays60%.
Exact next: PORT-FEEDBACK-UAT-01 — owner applies0.5.9 on D-drive, closes OBS,
double-clicks root INSTALL and verifies native loading after reopening, then
prior playback/bin acceptance. UAC/native OBS needs physical evidence;
independent timing still awaits Conviction.

### 2026-10-13 — previous: PORT-UPDATE-LOCK-01

Owner's0.5.7 pack failed moving services/api because the controller still held
that working directory after API/Studio stop. Native process CWD lock reproduces
the exact MoveDirectoryItemIOError. Updater detects all three roles, stops the
whole stack, verifies free ports and reopens via the console after success or
rollback. Native16pass, frontend785/785, backend779/779, typecheck/build pass.
Actual0.5.8 pack updater with embedded controller33/0;
151 installed/ZIP hashes verified, model inventory unchanged. Source standard
port PIDs survive final isolated tests. Evidence:
docs/gates/portable-update-lock-20261013.md. Phase03 stays60%. Exact next:
PORT-FEEDBACK-UAT-01 — owner uses0.5.8 pack APPLY once on D-drive, confirms the
lock failure is gone, then retries prior playback/bin/OBS feedback. Native
window/UAC/GPU/OBS loading remain physical acceptance. Timing awaits Conviction.

### 2026-10-13 — previous: PORT-FEEDBACK-01

Owner's second-machine feedback repaired in source and portable: single-track
Script now observes the project track clock after STT; the Media Pool folder
grid sizes from its contents so Recycle Bin does not overlap and its final row
is reachable. Native WinPS installer preserves default/explicit arguments,
UTF-8 output and errors; OBS pairing uses the main console launcher and migrates
known old paths without changing pairing credentials. Portable root now has
the four requested BATs; legacy removal is hashed, backed up and reversible.
Frontend785/785, backend774/774, typecheck/build pass. Real portable embedded
API/UI verifies both seek directions, playback and repeated bin operations.
Actual pack migration33/0 and root UPDATE selecting alpha0.5.7 passes33/0;
151 payload hashes and 1.16MiB ZIP verified, model inventory unchanged. Candidate
0.5.6 was retained only for migration evidence after the pairing-path gap was
found. Evidence: docs/gates/portable-feedback-20261013.md. Phase03 stays60%.
Exact next round: PORT-FEEDBACK-UAT-01 on the owner's D-drive machine — apply
0.5.7, retry parent/single-track playback and bin operations, close OBS, install
the bridge and reopen OBS. Physical native/UAC/GPU loading remains acceptance
evidence. Independent timing review still awaits Conviction.

### 2026-10-13 — previous: PORT-STT-01

Owner's grey Speech to text button reproduced even with a footage ticked STT.
The API catalog checked services/stt_studio, absent in the portable that ships
the sidecar under .runtime/omnivoice-studio. Resolve the bundled root first;
production-endpoint regressions cover source/portable/missing/moved layouts.
The new catalog gate caught a Windows PowerShell quoting error in candidate
0.5.4 and verified rollback to0.5.3. Repaired native probe regression passes.
Automatically issued alpha0.5.5 actual pack BAT passes31/0;153payload hashes
and ZIP verified (1.16MiB), base manifest SHA256 unchanged. Relevant backend
34pass, Media Pool56pass, typecheck/build pass. Full backend755pass/3fail;
those3unchanged timing checks pass on isolated rerun. Real embedded-runtime
CPU/int8 offline Largev3 and Medium each return21words from4s speech,
source/audio verified; Medium's words are visible in fresh alpha0.5.5 Script.
Evidence: docs/gates/portable-stt-20261013.md. Phase03 stays60%.
Exact next portable round: owner's D-drive alpha0.5.5 update, reopen, tick STT
and run Medium/Largev3 on the target hardware. Independent timing review stays
STT-TIMING-ACCURACY-01 after the owner's Conviction reference.

### 2026-10-12 — previous: PORT-IMPORT-01

Owner-reported second-machine media import produced no slot or notice. The
real ModuleRegistry dropped native paths, confirmation/cancel, pending rows
and retry; the source and portable shared this bug. Four real-registry
regressions reproduced it, and the old portable UI showed the same absent
slot after selection. Fixed source: affected frontend117/117, full784/784,
typecheck/build and relevant backend9/9 pass. Source embedded-core UI imports
a real WAV. Alpha 0.5.3 is the automatically numbered 1.16 MiB app update;
actual pack BAT passed30/0, and updated portable UI imported WAV, MP4 and
two-track MKV, exposed failed imports/retry, and retained them after reopen.
Six PCM24k mono artifacts/playback URLs passed. Detailed evidence is recorded in
docs/gates/portable-media-import-20261012.md. Phase03 stays60%.
Exact next portable round: apply alpha 0.5.3 on the owner's D-drive machine,
retry that footage, then run the fixed-media STT benchmark. Native host/GPU
acceptance there remains distinct from the local smoke checks.

### 2026-10-12 — previous: PORT-UPDATE-03

Update creation now allocates patch numbers and preserves a numbered folder.
The portable picks the highest compatible manifest version under `updates`;
the owner no longer edits the version or renames a pack to `app-current`.
Pack entrypoints resolve the full portable and can bootstrap the old updater.
Regression9/9, creator UI build, and two actual alpha 0.5.1 pack BAT runs
passed 30/0. The 153-file update also has a 1.17 MiB ZIP. Evidence:
docs/gates/portable-numbered-updates-20261012.md. Phase03 stays60%.
Owner-reported second-machine D-drive update selected alpha 0.5.1 and passed
30/0. Exact next portable round: start that updated app and benchmark fixed
media there. STT-TIMING-ACCURACY-01 still awaits Conviction.

### 2026-10-12 — previous: PORT-VERSION-01

Portable app releases now use `APP-VERSION.json`, starting at alpha 0.5.0.
Pack, bundle and app-layer manifests agree; the pack also has `VERSION.txt`.
Two portable BAT updates built the UI and passed 30/0 without changing the
version. Same-version changed payload and downgrade were rejected before
mutating the installed manifest. Current NoVibeVoice bundle is 35.98 GiB;
latest app pack is 3.94 MiB. Evidence:
docs/gates/portable-release-version-20261012.md. Phase03 stays60%.
Exact next portable round: physical copy to another Windows machine,
verification, startup and fixed-media benchmark. STT-TIMING-ACCURACY-01
still awaits Conviction.

### 2026-10-12 — previous: PORT-UPDATE-02

The portable's own UPDATE-PORTABLE.bat now keeps its result visible and
leaves the newest transferable pack at updates/app-current. Repeated
updates preserve older packs as app-previous-*; three portable BAT runs
passed 29/0 each. VERIFY-PORTABLE.bat also passed 29/0 when clicked.
Full portable remains 35.98 GiB; latest app pack is 3.93 MiB.
Evidence: docs/gates/portable-update-handoff-20261012.md. Phase03 stays60%.
Exact next portable round: physical copy to another Windows machine,
verification, startup and fixed-media benchmark. STT-TIMING-ACCURACY-01
still awaits Conviction.

### 2026-10-12 — previous: PORT-UPDATE-01

Added click-to-create and click-to-apply app-only portable updates, with
separate app/base inventories and unchanged loader paths. The 3.93 MiB pack
updated the 35.98 GiB NoVibeVoice folder through its BAT: 29/0 gate. Hash
tampering was rejected before mutation; a post-gate OBS failure rolled back
four checked files/manifests byte for byte. Backend744/744, frontend780/780
with two workers, typecheck/build pass. Evidence:
docs/gates/portable-app-update-20261012.md. Phase03 stays60%. Exact next
portable round: copy the folder and app pack to another machine, verify, start
and benchmark fixed media. STT-TIMING-ACCURACY-01 still awaits Conviction.

### 2026-10-12 — previous: USER-FEEDBACK-25

Media Pool's primary host import now offers a checked-by-default “Cache file”
checkbox; unticking links the original host file, while ticking copies it into
the project. The completed-container track dialog passes the same choice all
the way to the API. The API's machine-local source registry is now wired into
native import. Footage menus separately reveal the original in Explorer and the
project-owned copy; the project action is disabled for uncached host footage,
including its child tracks. Browser upload stays available and always copies
because the browser cannot give the host API an original path. Focused backend
7/7, frontend104/104; full frontend780/780, backend744/744, typecheck/build
pass. Evidence: `docs/gates/user-feedback-25-media-cache-reveal.md`.
Phase03 stays60%. Exact next round: USER-FEEDBACK-25B native Explorer/import
acceptance after source restart. Independent STT timing anchors still await
Conviction.

### 2026-10-12 — previous: USER-FEEDBACK-24

Script now displays diarization Speaker 1/2 separately from its still-unassigned
Speaker Profile. The selected-word menu can reassign a phrase to an existing
diarization speaker without checking its whole row; derived rows split A–B–A
for an interior phrase or join the adjacent matching row at an edge. Raw
speaker provenance, text and timing remain intact. Ordinary and channel tables
show labels. Focused70/70 (final ScriptEditor40/40), full frontend777/777,
typecheck/build and backend742/742 pass. Evidence:
`docs/gates/user-feedback-24-script-speaker-turns.md`.
Phase03 stays60%. Native visual/pointer, Undo/Redo and Timeline acceptance on
the owner's diarized project remains open. Exact next round:
USER-FEEDBACK-24B native Script/Timeline acceptance after source refresh;
STT-TIMING-ACCURACY-01 independent anchor review still awaits Conviction.

### 2026-10-12 — previous: USER-FEEDBACK-23

The source API could not bind within launcher readiness because lifespan
awaited a 41.657-second recovery scan across 23 projects. Recovery now runs as
a lifespan-owned task after a one-second fast-path wait; health can answer while
slow storage continues to be scanned. The original blocked-scan regression
failed before the fix and passed against a real Uvicorn listener afterward.
The affected 11 recovery tests and final backend 742/742 pass. Evidence:
`docs/gates/user-feedback-23-api-readiness-recovery.md`; ADR0068.

The owner's exact 23-project launcher restart is unverified because a separate
portable bundle occupied the normal ports. That folder predates this source
change and needs rebuilding to contain it. Phase03 stays 60%. Exact next
verification: restart the source launcher and check API `state=ready`, then
`Runtime recovery scan finished`. The next planned feature round remains
STT-TIMING-ACCURACY-01 after the Conviction reference is available.

### 2026-10-12 — previous: PORT-NOVIBE-01

Built a 35.98 GiB `NoVibeVoice` portable folder with OmniVoice base checkpoint
and the existing STT/RVC runtimes. VibeVoice stays in the model catalogs as
unavailable. Source gate 22/0, built gate 27/0; bundled Studio/API health and
catalog smoke passed. Evidence: `docs/gates/portable-no-vibevoice-20261012.md`.
Phase03 stays 60%. Physical copy and clean-machine GPU/media acceptance remain
open; the exact next portable round is to copy this folder to the target machine,
run `VERIFY-PORTABLE.bat`, and benchmark fixed audio with installed models.
STT-TIMING-ACCURACY-01 remains the next planned product feature round after the
owner supplies the Conviction timing reference.

### 2026-10-10 — previous: USER-FEEDBACK-22

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

### 2026-10-10 — previous: USER-FEEDBACK-21

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

### 2026-10-10 — previous: USER-FEEDBACK-20

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

### 2026-10-10 — previous: USER-FEEDBACK-19

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

### 2026-10-10 — previous: USER-FEEDBACK-18

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

### 2026-10-10 — previous: USER-FEEDBACK-17

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

### 2026-10-10 — previous: STT-TIMING-ACCURACY-01

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

### 2026-10-10 — previous: STT-GAP-02

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

### 2026-10-10 — previous: USER-FEEDBACK-16

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

### 2026-10-10 — previous: STT-GAP-01

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


### 2026-10-09 — previous: USER-FEEDBACK-15

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


### 2026-10-09 — previous: USER-FEEDBACK-14

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


### 2026-10-09 — previous: USER-FEEDBACK-13

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


### 2026-10-09 — previous: USER-FEEDBACK-12

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

### 2026-10-09 — previous: USER-FEEDBACK-11

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

### 2026-10-09 — previous: USER-FEEDBACK-10

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

### 2026-10-09 — previous: USER-FEEDBACK-09

Commit4568e3f preserves paused Timeline browsing across zoom/metadata and removes
the stale drag-release follow callback. Archived OBS playback advances its view;
Stop loads standard screen-density PCM peaks with shared accent geometry/gain,
retaining same-track feedback through loading. Repeated idle status/journal updates
keep the selected window. Actual owner Channel1 has a28.668s detailed-word gap
despite continuous audio/final realtime text; segment-level review notes expose
realtime text without fabricated words/timing. Cause cannot be attributed because
raw segment checkpoints are absent. Frontend646/74, typecheck/build, relevant API
waveform2 pass; full API687 is carried08 baseline. Real WAV1ms peaks and original
MKA/WAV hashes checked. Gate `docs/gates/user-feedback-09-obs-archive-view.md`,
ADR0056. Exact next STT-GAP-01 retains recognizer/merge artifacts on an isolated
copy before repairing missing recognition; UX-EDITING-DEVICE-01 still needs native
scroll/Stop/playback acceptance after reload. Read-only normal status now API
stopped/Studio running/busyfalse; this round changed no services or inference.
Existing startup/device/LAN/word-truth gates, schema/upstream and Phase03 budgets
remain unchanged. Original rapid jumping is not fully device-verified.

### 2026-10-09 — previous: USER-FEEDBACK-08

Controller readiness repair removes system CA/proxy loading from fixed HTTP
loopback clients; real-Uvicorn stalled-certificate and invalid-environment tests
are red/green. CLI watches from before dependency imports, retaining bounded frame
stacks until bind. Launchers preserve prior nonempty stdout/stderr before retries.
API687/two existing warnings passes on E temp storage; initial C temp run had503
setup errors while C free was0, later independently85GB free; no owner files deleted.
Actual normal launcher succeeds: controller1.897s, Studio4.354s, API11.393s;
all health=ok, runtime=running. Normal owner stack left up; no manual inference
dispatch. Gate `docs/gates/user-feedback-08-controller-readiness.md`, ADR0055.
The historical PID25916 stack is lost; exact cause and idle/cold reliability remain
unproven. Exact next RUNTIME-READINESS-DEVICE-01 captures normal idle/cold cycles
under unchanged deadlines; then UX-EDITING-DEVICE-01 resumes OBS Stop/waveform/
playback and editing acceptance. STT word truth, Phase03 budgets, upstream and
project schema stay unchanged. Frontend07 validation is carried, not rerun.

### 2026-10-09 — previous: USER-FEEDBACK-07

Owner confirms OBS signal and overlap detection; Stop/full overview exposed the
live120-second waveform cap applied to an actual406.4052262-second stopped take.
Stopped full snapshots now cover bounded recorded duration with at most600 bins,
processing envelope documents incrementally. Live/cursor caps remain. Immediate
journal refresh and same-take overlapping bins retain waveform through Stop/loading.
Actual copied owner envelopes return600 audio points per channel; baseline adapter
returns the reported422. Original MKA/two WAV hashes unchanged. Frontend639/73
(tracked638/72), API682/two existing warnings, typecheck/build pass. Gate:
`docs/gates/user-feedback-07-obs-stop-waveform.md`, ADR0054.
Exact next UX-EDITING-DEVICE-01: after reload, reopen this take at full zoom and
validate native >120-second Record -> Stop -> waveform/zoom/playback; deletion/scroll
acceptance remains. STT-TIMING-ACCURACY-01 still needs reviewed word truth. No normal
services, owner media, schema/upstream or Phase03 budget changed. Initial archive
decode and hours-long disk-read latency are not claimed improved.

### 2026-10-09 — previous: USER-FEEDBACK-06

Selected-word deletion is one bulk identity pass and one commit; large documents
use a Worker with snapshot fences, cancellation and pending/error feedback.
Surviving timing/annotations stay intact; changed-text history avoids full snapshot
serialization. Both yellow Script notices scroll with content outside editable
text, including measured virtual/prose offsets. Actual normal logs exposed a
removed historical project's KeyError blocking fresh OBS journal persistence;
stale machine completions no longer block current capture or fabricate old journals.
Frontend637/73 (tracked636/72), API680/two existing warnings, typecheck/build pass;
actual built Worker bundle and fresh-journal/PCM/waveform fixtures pass. Gate:
`docs/gates/user-feedback-06-script-deletion-and-obs-journal.md`, ADR0053.
Exact next UX-EDITING-DEVICE-01 needs permitted real long-footage deletion/scroll
and fresh native OBS Record acceptance after reload. STT-TIMING-ACCURACY-01 still
needs reviewed word truth. No normal service/model/owner-media/schema or Phase03
budget change; previously absent journals were not fabricated or marked recovered.

### 2026-10-09 — previous: USER-FEEDBACK-05

Timeline routes word edit history in normal/imported/archived OBS overview and
focused editors; live gestures cancel before undo. One source word per subtitle
box uses spatial4px filtering with zoom detail and direct index hit tests. Atomic
middle IN/OUT and direct drags trim actual collisions only, blinking neighbours
and retaining10%, including tiny words and noncontiguous selection. Positive
untrusted editable estimates preserve original source timing; promotion guidance
is a2s hover portal without a layout row. Studio phrase refinement cannot cross
neighbour words or claim a previously refined gap. Frontend627/71 (tracked626/70),
API679/two existing warnings, typecheck/build pass. Gate:
`docs/gates/user-feedback-05-timeline-word-timing.md`, ADR0052.
Exact next STT-TIMING-ACCURACY-01 needs reviewed word IN/OUT truth and isolated
comparison in `docs/STT-TIMING-ACCURACY-PLAN.md`; acoustic improvement is unmeasured.
UX-EDITING-DEVICE-01 remains for permitted visual/history/audio acceptance. No
normal services/models, owner media, schema or Phase03 budget changed.

### 2026-10-09 — previous: USER-FEEDBACK-04

Owner confirms improved responsiveness. Logical speaker rows now contain their
virtual fragments, with one fixed24px selector and original ordinal. Same explicit/
inherited speaker identity stays one row. Script speaker choices target checked
rows; pointer/focus Ctrl+A selects all logical rows. Session undo/redo retains30
committed text/timing/attribution steps, grouping cross-track speaker choices.
Dense Timeline snippets restore readable text at overview scale and increase
detail with zoom, retaining original hit tests/timestamps. Frontend611/70 with
capped test workers, API677/two existing warnings and typecheck/build pass.
Gate: `docs/gates/user-feedback-04-script-rows-subtitles-and-history.md`, ADR0051.
Exact next UX-EDITING-DEVICE-01: allowed real checkbox/ordinal/theme, subtitle zoom,
Script editing/history/scroll and audible acceptance. Existing browser restriction
and older physical/quality/download/LAN prerequisites remain. No owner media,
normal service/model dispatch, project schema or Phase03 budget changed.

### 2026-10-08 — previous: USER-FEEDBACK-03

Immediate animated import slots precede browser confirmation and host inspection;
same-name choices retain feedback until queue handoff. Expandable folder slots
replace the root breadcrumb, retaining nested creation and root/folder moves.
Multi-select closes detail data, preserves list IDs and applies checkbox intent
immediately to eligible footage/tracks. Revision fences and ordered bulk writes
prevent older responses restoring prior opens or checkbox values. Long Script
turns use viewport fragments; dense Timeline overviews bound subtitle DOM with
full-source editing hit tests. Frontend602/69, API677/two existing warnings and
typecheck/build pass: `docs/gates/user-feedback-03-media-tree-and-responsive-selection.md`.
ADR0050 records view and selection contracts. Exact next UX-EDITING-DEVICE-01:
permitted visual/native picker, real-STT interaction/scroll and audible acceptance.
Browser restriction and older physical/quality/download/LAN prerequisites remain.
No normal service/model dispatch, owner media or Phase03 budget changed.

### 2026-10-08 — previous: USER-FEEDBACK-02

Main Import uses the current device's multiple-file chooser; Host import retains
host paths/growing MKV and reports picker errors. Larger icons and the corrected
root breadcrumb are delivered. Lifecycle request revisions preserve Recycle/
Restore/Delete across older reads, including after fresh acknowledgement.
STT/DIA activity aggregates tracks; Training maps active speaker runs to media.
Shared normal-pitch short previews cover left drag and promoted middle timing in
normal/imported/archived OBS timelines, preserving gain/mute and excluded audio.
Frontend593/68, API677 and typecheck/build pass. API runs and timing caveat are recorded in
`docs/gates/user-feedback-02-media-and-audio-scrubbing.md`; ADR0049 records the
preview design. Unified Queue is a recommendation in `docs/AI-QUEUE-PROPOSAL.md`,
not a shipped scheduler. Exact next UX-EDITING-DEVICE-01: permitted visual/native
picker, audible scrub and real-load interaction acceptance. The existing browser
policy restriction and older physical/quality/download/LAN prerequisites remain.
No Phase03 budgets or owner media changed.

### 2026-10-08 — previous: USER-FEEDBACK-01

Restart/Open Existing release orphaned STT/diarization flags; removal fences
sequential and dedicated MKV/OBS owners. Valid checkpoint resumes remain.
Shared all/missing/cancel dialog covers STT, diarization, Training speakers and
Generate rows; rerun-all generates fresh immutable clips. Missing WAVs and
changed effective settings do not count as completed generation. Import/folder
icons are adjacent; media loads independently and selection feedback precedes
heavy Script/Timeline rendering. Shared compact subtitles suppress tiny boxes
at zoomed-out scale. Frontend580/67, API677/two existing warnings, typecheck/build
pass. Gate: `docs/gates/user-feedback-01-processing-and-footage-ui.md`.
Original recycled PDCA MP3 flag repaired with completed transcript preservation;
six legitimate Test_OBS_05 growing-MKV resume targets remain unchanged.
Exact next UX-EDITING-DEVICE-01: allowed browser/native visual checks, real-STT
selection responsiveness and audible scrubbing. Older physical/quality/download/
second-machine gates remain; this delivery does not advance Phase03 budgets.

### 2026-10-07 — previous: TASK-STOP-DEVICE-01D3

Actual short LoRA queue Stop retains active training; hard Stop after complete
checkpoint5 reaps four processes and retains all11 checkpoint hashes. Same run/
manifest Resume reuses tokens, loads actual optimizer/model/RNG state and reaches
step20, publishes real LoRA; that adapter generates WAV3.2s.19 retained hashes
and both earlier WAVs agree. API658/two existing warnings, unchanged frontend
560/63, typecheck/build pass. Gate:
`docs/gates/task-stop-device-01d3-training-resume.md`. Isolated services cleaned;
normal source activation checked separately. No quality/identity/UI claim.
Cancelled API checkpoint-list freshness/unfinished-save recovery remain noted.
Exact next UX-EDITING-DEVICE-01 needs native picker, real-load interaction and
audible scrubbing. Older physical mic/OBS, saved-download/cancel, second-machine
LAN and reviewed recognition/speaker/identity gates retain prerequisites.

### 2026-10-07 — previous: TASK-STOP-DEVICE-01D3A

Actual fresh LoRA tokenize failed42s with Windows paging/MemoryError under
upstream3 processes/GPU +24 loaders. Product Windows command uses1 process and
0 loader children; upstream unchanged. Same failed run retries through API and
produces5 train/1 dev shards with zero failures. Command regressions red/green,
process17, full API658/two existing warnings pass; unchanged frontend560/63,
typecheck/build retain their successful check. Gate:
`docs/gates/task-stop-device-01d3a-tokenizer-windows.md`. Exact next01D3 records
the actual completed checkpoint Stop/Resume and LoRA WAV acceptance. No quality,
native, browser-download or second-machine gate advance.

### 2026-10-07 — previous: TASK-STOP-DEVICE-01D2

Product imports + real Medium words compile a disposable six-segment dataset;
Clone publishes a real reference/voice. Generate queue Stop completes WAV4.16s;
hard Stop reaps warm40628, no late output; rerun11000 publishes WAV3.2s.19 retained
hashes and the completed output agree, no clipping; no quality/identity claim.
See `docs/gates/task-stop-device-01d2-generation.md`. Source unchanged since01D1;
full frontend560/63/API656, typecheck/build pass. Exact next01D3: fresh LoRA
checkpoint Stop/Resume using the repaired token cache. Browser access rejected
by tool policy; saved-file/cancel/native/physical/second-machine gates stay open.

### 2026-10-07 — previous: TASK-STOP-DEVICE-01D1

Resume now finds the current dev token list beside train tokens and supports
the legacy nested dev path. Six regressions pass (current layout failed before
repair), full runner19, frontend560/63, API656/two existing warnings, typecheck
and build pass. See `docs/gates/task-stop-device-01d1-token-cache.md`.
Exact next01D2 records actual Generate queue/hard Stop and WAV rerun;01D3 uses
the freshly compiled disposable dataset for real checkpoint Stop/Resume.
Owner-specific quality and older physical/browser/second-machine gates remain.

### 2026-10-07 — previous: TASK-STOP-DEVICE-01C

Repairs the stale Activity Center task found in01A/01B. First Stop retains
running activity; hard cancellation settles cancelled; failed acknowledgement
settles failed. Regression and real new-API Medium/community-1 GPU checks pass;
the footer returns to READY and all seven PCM/source hashes agree. Gate:
`docs/gates/task-stop-device-01c-activity.md`. Fixture services/token copy cleaned.
Full frontend560/63, API650, Studio22, typecheck/build pass. Normal launcher
reloads current source; controller/API/Studio health all ok, readiness below4s.
Exact next01D: real Training Stop/checkpoint Resume and Generate Stop/rerun with
an owner-selected project/Speaker and compatible artifacts (question pending).
Physical/native/second-machine and older recognition/phase gates remain open.

### 2026-10-07 — previous: TASK-STOP-DEVICE-01B

Real cached community-1 No/Yes/rerun passes: actual worker59148 is reaped,
new worker73644 publishes24 raw spans; completed long footage retains120 spans.
All seven PCM/source hashes agree and the cancelled asset has no late publication.
See `docs/gates/task-stop-device-01b-diarization.md`. Model cancellation passes;
Activity Center still displays cancelled work, so exact next01C settles the
STT/diarization cancellation activity and verifies the new API. Training Resume,
generation artifacts and older physical/recognition gates remain open.

### 2026-10-07 — previous: TASK-STOP-DEVICE-01A

Real cached Medium/CUDA STT Stop acceptance passes in an isolated current-source
fixture. Browser No drops pending files while active recognition completes; Yes
reaps the actual inference worker and freezes publication. A subsequent STT
completes on a new worker; all source/analysis PCM hashes agree. No recognition
accuracy or latency budget claim. See `docs/gates/task-stop-device-01a-stt.md`.
Exact next: TASK-STOP-DEVICE-01B — cached community-1 diarization No/Yes/rerun.
Training Resume needs a selected project/Speaker and compatible artifacts; that
owner question remains pending. Parent device/older physical gates remain open.

### 2026-10-07 — previous: TASK-STOP-01

Uniform two-level Stop covers STT, Speaker Diarization, Training and Generate
Voice, including growing MKV and OBS detailed STT. First Stop drops pending
work; two rapid clicks open Yes/No for active cancellation. Task ownership and
publication fences preserve source PCM, completed outputs and saved checkpoints.
Frontend560/63 files, API646, Studio22, typecheck/build and isolated browser
Yes/No proof pass; final Clone guard has a separate13-test Training check.
Final API/Studio counts are in `docs/gates/task-stop-2026-10-07.md`; ADR0047
records the process and persistence contracts.
Exact next round: TASK-STOP-DEVICE-01 — restart normal app including Studio,
exercise real-model Stop and rerun/Training Resume, then address reproducible
device failures. UX-EDITING-DEVICE-01 and older phase gates remain open.

### 2026-10-07 — previous: UX-INTEGRATION-01

Owner override: run all nine requested import/organization/editing/range rounds
in this invocation, with bounded commits and evidence. IMPORT-UX-01,
MEDIA-ORG-01, SCRIPT-EDIT-01, WORD-EDIT-01, WORD-GAP-01, TIMELINE-EDIT-01,
TIMELINE-RANGE-01 and LIST-UX-01 have their implementation and focused checks.
The integration gate records complete tests, real PCM and browser persistence.
Frontend550/62 files and backend588 pass, as do typecheck/build. Archived OBS
and imported multitrack use the shared editing controls with corrected gain
units (100 percent = 0 dB); the final browser check has no console errors.
See `docs/gates/ux-editing-2026-10-07.md`, ADR0046 and
`docs/UX-EDITING-OWNER-CHECKS.md` for the device acceptance checks.
Original source hashes are unchanged; interpolation stays unverified. Native
picker, real STT load and physical audio audition require owner evidence.
Older nine near-term parents and phase gates retain their prerequisites.
Exact next round: UX-EDITING-DEVICE-01, run the four owner checks after restarting
the normal app to load the changed API; fix any reproducible device failure.

### 2026-10-05 — previous: 03-04A / STT19B6–19B7

03-04A persistence/recovery accepted at its bounded slice; frontend507/backend570,
real API/browser/move/restart proof pass. 19B6 corrected replay post-source-end
p956.891s; 19B7 longer boundary rejected for CER20.92% vs19.62%. Its timings are
confounded by concurrent tests. Product defaults and phase gates unchanged.
See the three latest gate files. Nine near-term parent rounds remain; physical
OBS/native/DPI/download/second-machine evidence and reviewed word/speaker labels
retain their prerequisites. 03-04 QC/flow/block/reference/tier work is separate
later roadmap scope, not part of the near-term nine-parent completion count.


### 2026-10-05 — LIVELINK-STT-19B5

Offline attribution finds existing lagSeconds includes utterance duration;
onset-to-final median9.906s/p9521.015s cannot establish post-source-end latency.
85 successful calls reconcile, but semaphore waits/event wall clocks were absent.
No performance change justified; no product change. Next19B6 measures actual
offer/end/persist clocks and semaphore waits in the profiling harness, leaving
source PCM/settings/scorer/budgets frozen. Gate:
`docs/gates/livelink-stt-19b5-latency.md`.

### 2026-10-05 — UI-CONTRAST-01C1

Populated real output/profile/Properties browser samples pass after four shared
CSS repairs; minimum4.615:1 across1,668 repeated DOM readings. Frontend497,
typecheck/build pass; no media or saved profile change, dark theme restored.
Parent01C remains open for physical DPI/native/motion/model/custom-emotion gates.
Gate: `docs/gates/ui-contrast-01c1-populated.md`.

### 2026-10-05 — LIVELINK-STT-19B4

Preserve short internal quiet PCM in Live STT recognizer WAVs; keep last-voice
endpoints, trailing silence trim, 4s windows and 0.5s boundary. Regression fails
before/fixes after; adapter14 and full backend565 pass. Frozen real medium replay
CER19.62%, WER24.19%, paced lag p95 21.015s; 29/29 input/source extents match,
16 source hashes unchanged. Data-loss repair complete; parent19A/19B acceptance
still fails CER/lag. Next recognition scope is measured request/queue latency
diagnosis on the retained19B4 trace, with settings/budgets frozen.
Gate: `docs/gates/livelink-stt-19b4-pcm-context.md`.

### 2026-10-05 — LIVELINK-INGEST-18D

Screened prepared channel directories on the immutable six-source catalog:
360 pairs per variant, 3.27% lower wall time, candidate p95 248.944ms. Rejected
under frozen 150ms/30% limits; no product change. Two fsyncs, ordered publication
and source/output bytes verified; helper safety suite 8 passed. Parent 18B/18C
remain open. Continue STT19B4 and available browser contrast acceptance while
physical OBS, reviewed anchors and second-machine gates need their prerequisites.
Gate: `docs/gates/livelink-ingest-18d-directory.md`.

| Round | Scope | State | Why it matters |
| --- | --- | --- | --- |
| LIVELINK-INGEST-18B | Reduce durable-pair cost | Original and 18B2 candidates rejected; acceptance open | Full replay improves only 2.58%; raw descriptor screen is 9.34% slower. |
| LIVELINK-INGEST-18C | Evaluate bounded group durability/transport contract | Width-six/two measured; budget choice/integration open | Width two cuts group wall 15.23% with pair p95 282ms; frozen thresholds still fail. |
| LIVELINK-INGEST-18A | Profile six-source ingress and Stop tail | Isolated measurement complete; historical live clocks unavailable | Selects durable PCM/metadata pair and freezes 18B comparisons without claiming latency improved. |
| 03-03A | Voice Model Set persistence and lineage | Complete | Creates a portable, reproducible publication candidate without falsely claiming identity approval. |
| 03-03B | `SpeakerEmbedder` port, adapters, frozen protocol, threshold and reject path | Complete | Prevents a usable checkpoint from being published as the wrong speaker. |
| 03-03C | Calibrate the chosen backend and run one real manifest-to-checkpoint-to-gated-publish acceptance | Queued | Proves the local runtime, identity operating point, and real model artifacts rather than only orchestration tests. |
| PORT-01 | Portable path contract, engine/model localization, and fail-closed audit | Complete | Replaces portability assumptions with an executable inventory and removes sibling engine dependencies. |
| PORT-02 | Build private Python runtimes and switch every launcher | Complete | Removes the six remaining dependencies on the developer machine's Python installation. |
| PORT-03A | Assemble the bundle and validate it from a different local path | Complete | Proves the emitted deliverable launches independently of the source root. |
| PORT-03B | Copy the bundle and validate it with real OBS on another Windows machine | Deferred; acceptance carried into LIVELINK-08 | Remains open until physical-transfer and real-OBS clean-machine gates pass. |
| PORT-03 storage audit | Reconcile Explorer size with bundle and NTFS allocation | Complete | Separates logical hard-link paths, unique disk allocation, removable caches, and real duplicate binaries. |
| OBS LiveLink UX plan | Revise install, native dialog, multi-channel capture, causal trigger policy, multi-MKV handoff, and timing evidence contract | Approved | Establishes the implementation order and acceptance gates. |
| LIVELINK-01 | Freeze v3 domain, protocol, state reducer, timing and archive references | Complete at contract level | Gives the native plugin, API and UI a tested shared state contract; no v3 user flow is live yet. |
| LIVELINK-02 | Installer and Preferences integration | Implemented; real Windows UAC/OBS-load gate open | Makes plugin installation discoverable and verifiable from the app. |
| LIVELINK-03 | Native OBS Tools dialog, Open App, automatic pairing | Complete on development OBS; installed-package gate remains at LIVELINK-08 | Removes JSON/UUID setup and gives OBS a usable LiveLink surface. |
| LIVELINK-04 | Native source inventory, meter, forward selection, alias and mapping persistence | Implemented; source-change acceptance open | Lets the OBS dialog configure local channels before v3 synchronization. |
| LIVELINK-05 | V3 channel control and app LiveLink mixer | Implemented; extended source matrix and installed-package acceptance open | Lets the app inspect and toggle OBS channels with applied ACK evidence. |
| LIVELINK-06 | Recorder OBS LiveLink, PCM stems, trigger policy and intervals | Implemented; physical OBS trigger matrix remains open | Creates project-owned channel artifacts and records the boundaries needed for reconciliation. |
| LIVELINK-07A | One audio-only MKA parent with independent source tracks | Implemented; five-source physical OBS gate remains open | Makes a portable source archive while preserving source identity and rebuildable analysis audio. |
| LIVELINK-07B | OBS recording-folder connection and exact MKV handoff per video span | Implemented; physical OBS file-import and move/reconnect acceptance remain open | Preserves the correct OBS video recording beside audio spans without machine paths in the project. |
| LIVELINK-08A | Repair repeated-record PCM capture and per-recording artifacts | Complete on development OBS; broader matrix stays in LIVELINK-08 | OBS Start/Stop 3 times in one process retained PCM/MKA/MKV each time. |
| LIVELINK-08B | Per-channel recording evidence/status contract | Complete at API contract and recovery-test level; live OBS presentation follows in 08C | Distinguish OBS Record, app Record, forward ACK and actual PCM receipt. |
| LIVELINK-08C | Recorder button, compact channel rows and truthful REC indicators | Complete at UI/component and development OBS gate; wider final matrix remains in LIVELINK-08 | Make app capture observable without needing file inspection. |
| LIVELINK-08D | Live per-channel waveform envelope feed | Complete at API/feed and real-MKA artifact gate; Timeline rendering follows in 08E | Supply sample-timed data to the Timeline without streaming raw PCM to the browser. |
| LIVELINK-08E | One live Timeline waveform per OBS channel | Complete at UI and physical OBS gate; final LIVELINK-08 matrix remains open | Make simultaneous source recording visible and replayable. |
| LIVELINK-08F | Timeline column/layer layouts with per-channel gain and level | Complete at UI and reopened four-channel archive gate; physical 20-source gate remains in LIVELINK-08 | Let users inspect many simultaneous channels. |
| LIVELINK-08G | Automatic per-channel LiveLink v3 STT | Complete at API, real recognizer fixture and recovery-test level; physical simultaneous OBS speech remains in final LIVELINK-08 | Produce channel-owned transcript events during app recording. |
| LIVELINK-08H | Channel-ordered live Script rows and Timeline captions | Complete at UI, API-consumer and archived-recording fixture level; physical OBS simultaneous speech remains in final LIVELINK-08 | Show who spoke from which source while the recording is running. |
| LIVELINK-08I | Cross-channel overlap color and replay markers | Complete at derived-timing, UI and archived four-track OBS preview level; physical simultaneous OBS speech remains in final LIVELINK-08 | Make concurrent speech reviewable at its source time. |
| LIVELINK-08J | OBS-style plugin dialog and Pro4Bro brand asset | Implemented; real OBS dark/light and 1/5/20-source checks passed at 100% DPI; 125/150% physical DPI remains open in LIVELINK-08 | Make the OBS-facing control visually coherent while keeping its behavior. |
| LIVELINK-08K | Diagnose missing PCM in the owner's multi-channel recording | Complete from archived PCM metadata, API log and capture/send code; exact native drop counter unavailable | Establishes where audio disappears before changing the capture path. |
| LIVELINK-08L | Prevent short-stall PCM loss and expose native overflow | Implemented at API/native regression and plugin-package level; real OBS and prolonged-stall gates open | Removes the observed two-second eviction path and lets later tests distinguish overflow from API latency. |
| LIVELINK-08M | Measure PCM resilience in real OBS and add a durable PCM outbox | Complete on development OBS; longer outage gate remains in 08N | Two/four-channel recordings and recovery of a stalled four-channel take produced gap-free MKA archives. |
| MEDIA-MULTITRACK-01 | Preserve every audio track when importing completed MKV/MOV/MP4 | Complete at generated-media and UI list level; Timeline presentation open | One original footage retains separate stream-indexed analysis assets and group lifecycle. |
| MEDIA-MULTITRACK-02 | Show imported tracks as synchronized Timeline instances and channel Script | Complete at source and frontend test level; owner viewport acceptance open | Selection exposes every track with shared scrub/zoom/edit controls and per-track Script, gain and level. |
| MKV-FOLLOW-01 | Follow a growing local MKV into durable per-track audio chunks | Complete at generated-MKV/API test level; real OBS writer gate open | Reads complete clusters only, persists a byte/sample cursor, auto-resumes on API restart, and reconciles final audio from the closed MKV. |
| MKV-FOLLOW-02 | Make growing-MKV import discoverable from IMPORT and return footage before backlog decode | Implemented at UI, generated-media and live OBS-file read level; full-session throughput gate open | The active MKV appears promptly while a bounded watcher drains previously recorded clusters. |
| MKV-FOLLOW-03 | Measure and improve long-session multitrack backlog throughput | Complete at measured decoder scope | Ten-minute/retained prefix improves 33.63%/50.08%, exact PCM; full writer acceptance remains MKV-ACCEPT-01. |
| MKV-CHANNEL-01 | Media Pool right-click per-channel Import and Live Transcribe/STT checkboxes | Complete at generated-media/API/UI test level; owner viewport gate open | Native MKV/MOV/MP4 inspection offers per-track choices before import or MKV follow; imported footage retains available and selected tracks. |
| MKV-STT-01 | Live transcript and configurable one-minute-per-track final STT backlog | Implemented at generated-media/test level; real OBS and STT engine gate open | Fast previews use checkpointed PCM; final segments use the closed MKV, persist results before cursors, and drain the short tail after Finish. |
| MKV-ACCEPT-01 | Real OBS growing-MKV and STT engine acceptance | Queued after MKV-STT-01 | Check multi-track source timing, live backlog, Stop-tail completion, transcript quality and UI responsiveness on actual hardware. |
| MEDIA-STAGES-01 | Four persisted workflow selections on Media Pool footage and imported tracks | Implemented at API/UI test level; owner viewport gate open | Footage and materialized tracks expose Import, STT, Speaker Diarization and Train; parent checkboxes summarize and apply to children. |
| MEDIA-STAGES-02 | Materialize an omitted source track after import and align physical import state | Complete at completed-container API/media/browser gate | Same parent, idempotent publication, retry and move pass; active follow requires Finish. |
| MEDIA-VIEW-01 | Withdraw/re-add imported footage and tracks from the workspace, fit full-file zoom, render detailed waveform | Implemented at UI regression level; owner viewport check open | The Import checkbox controls visible work, the left zoom edge fits any duration, and PCM detail replaces sparse bars at close zoom. |
| MEDIA-VIEW-02 | Put Timeline Channel and Track names on one scrolling line | Implemented at UI regression level; physical viewport check open | Narrow Layer labels and resizable Columns remain readable without taking height from meters or waveform. |
| MEDIA-VIEW-02B | Verify label motion at minimum Column width and owner DPI | Browser scope covered by UX-11B; remaining DPI/reduced-motion consolidated into UI-CONTRAST-01C | Avoids duplicating label acceptance while retaining physical gates. |
| LIVELINK-08 | Final integrated OBS matrix, time reconciliation, portability, and clean-machine acceptance | Open; final gate follows LIVELINK-08M | Accept only after channel Record state, waveform, live transcript, overlap review and real media artifacts are visible and verified together. |
| UX-01 | Remove redundant page headings, simplify Media Pool context actions, and apply the supplied Pro4Bro logo | Complete in source and packaged plugin; physical UI review open | Restores workspace height and carries the owner's mark into the app and OBS plugin. |
| UX-02 | Shared range/toggle/select-all behavior and Media Pool batch operations | Complete at UI and project API test level | Establishes predictable multi-selection and safe action targets before applying it across lists. |
| UX-03 | Extend multi-selection and bulk actions to Sound Library, Voice Output, Script rows, and other lists | Implemented in primary editable lists; specialized OBS track actions and physical UI sweep remain | Lets users edit and remove selected objects together in each module. |
| UX-04 | Diagnose and stop repeated PCM viewport waveform loading | Complete at regression-test level; physical playback check remains | Prevents the waveform from flashing and repeatedly reporting loading after media settles. |
| UX-05 | Repair Recycle Bin bulk deletion and stale rows, preserve full Script UI in OBS mode, complete remaining editable list actions | Implemented at source and test level; physical UX review remains | Makes deletion truthful and keeps Script tools available during LiveLink. |
| UX-05B | Browser UX acceptance of Recycle Bin, Script LiveLink, and remaining list actions | Complete at owned-fixture browser scope through 05B1/05B2/05B3 | Journal-only pending navigation, delete/restart and surviving media verified; owner hardware remains separate. |
| UX-05B1 | Copied-project browser list and playback sweep | Complete for selection, bulk color/speaker, recycle/restore and replay; parent open | Pending-footage navigation still needs separate evidence. |
| UX-05B2 | Copied-project permanent deletion and restart | Complete for recording and synthetic Voice Output deletion; parent open | Removed recording stays absent after API restart; surviving media hashes match source. |
| RUNTIME-FOLDER-PICKER-01 | Restore Hub Open Existing in portable Python | Implemented; native dialog selection gate open | Windows Forms fallback replaces the unavailable Tk dialog without changing project paths. |
| UX-06 | OBS Stop boundary and per-channel Timeline layouts | Implemented at source, regression-test and plugin-build level; physical OBS gate open | Prevents PCM/STT crossing Stop and makes layer/column Timeline controls usable. |
| UX-06B | Physical OBS Stop and Timeline layout acceptance | Queued | Checks app Stop, OBS Stop with and without Ignore Stop, transcript tail, and layer/column sizes with real channels. |
| UX-08 | One OBS recording as one MKA footage with internal channels and Script | Implemented; controlled physical two-take lifecycle passes in UX-08B; broader owner matrix open | A second recording creates a second selectable footage, while each footage retains all of its channels and transcript. |
| UX-08B | Record two real OBS sessions and reopen each footage | Complete on controlled physical two-take/reopen/UI recycle-restore and API permanent-delete gate; owner hardware remains LIVELINK-08 | Repairs selection feedback so Media Pool, Timeline, audio and Script retain one recording identity; other footage survives deletion. |
| UX-09 | Match normal/OBS Timeline controls, refine Layer meters, and resize Column edges | Implemented; browser gate covered by UX-09B, physical DPI remains UI-CONTRAST-01C | Switching capture source retains a consistent control layout while each channel remains adjustable. |
| UX-09B | Compare both Timeline modes in the running app at owner viewport and DPI | Complete on controlled browser/DPR-1 archive gate; physical Windows DPI remains UX-10B | Repairs runaway Layer height, control overlap and keyboard resize jumps with real archive playback and browser geometry. |
| UX-10B | Inspect six or more live OBS sources, REC/PAUSE, outer scroll and physical Windows DPI | Live six-source and browser gate passes; physical 125/150% DPI remains open | Repairs mixer clipping and heartbeat-before-Pause control blockage with real native capture. |
| UX-11B | Inspect named recording selectors and 11.2px channel labels with multiple recordings | Complete on controlled two-recording browser gate; physical 125/150% DPI remains open | Verifies full-name tooltips, keyboard selection, font scale, one-line labels and motion/focus at 240px without new source changes. |
| LIVELINK-UX-10 | Short Track labels, truthful PCM evidence, archive-ready Media Pool refresh, and clear highlight text | Implemented at source, frontend regression and native build level; real OBS and viewport gates open | Prevents a moving source meter from implying saved audio and makes completed MKA footage visible without F5. |
| LIVELINK-CAPTURE-10 | Repair muted-source PCM, stale source rows, and in-progress Media Pool visibility | Implemented; real muted Track 1 capture passed, browser visibility and wider source matrix remain open | A moving meter now leads to raw source PCM when Forward is on, and a stopped journal can recover its MKA without F5. |
| LIVELINK-CAPTURE-10B | Verify live Media Pool row and several independent sources in the running app | Complete on controlled five-source physical OBS/browser gate; owner device matrix remains in LIVELINK-08 | Live row/PCM preview, automatic selected MKA handoff and five independent tone streams pass; full owner hardware/load acceptance is not claimed. |
| LIVELINK-TIMELINE-11 | Keep the live waveform window current and simplify overlap review/playback | Complete at frontend regression level; real long-take viewport gate open | Prevents stale window cursors and responses from blanking the tail, distinguishes pending PCM from gaps, and restores drag/Space controls. |
| LIVELINK-INGEST-11B | Remove per-chunk take scan and amortize PCM transport controls | Implemented at replay, API test and native-build level; physical load gate open | The owner's gap-free two-track take accumulated 153 pending chunks and about 50 seconds of tail delay by Stop. |
| LIVELINK-INGEST-11C | Install and measure sustained two-track OBS capture with simultaneous live and detailed STT | Measured; PCM/archive passed, latency and realtime STT gaps open | A real OBS take shows zero PCM sample gaps and a valid two-track MKA, but p95 ingest lag is about 16 seconds and realtime STT drops queued work. |
| LIVELINK-INGEST-11D | Profile and reduce native HTTP ACK and API persistence latency under sustained two-track load | Complete on controlled two-source OBS gate; longer source matrix open | Durable PCM preparation now runs concurrently and waveform avoids a redundant flush; 304-second OBS p95 ingress lag fell to 4.20/4.14 seconds with zero sample gaps. |
| LIVELINK-STT-12B | Prevent realtime transcription queue loss under concurrent detailed STT | Complete at two-source OBS and forced-backlog test level; restart recovery open | Bounded RAM queues now replay committed PCM per track instead of discarding recognition work when full. |
| LIVELINK-STT-12C | Resume pending realtime STT from durable PCM after API restart | Complete at API startup, two-track restart and copied real-PCM replay level; physical model-load gate open | Per-track checkpoints reconstruct an unfinished utterance and replay committed PCM without repeating final transcript events. |
| LIVELINK-STT-12D | Restart the running API during physical two-track OBS capture and concurrent detailed STT | Complete at physical data/model gate; owner viewport open | Both tracks recovered complete PCM, live transcript and detailed STT; post-restart caption delay remains measurable. |
| LIVELINK-STT-12E | Reduce post-restart live caption delay under concurrent detailed STT and diagnose the first restart launcher failure | Complete at two-track physical data/model gate; owner viewport open | Warm model reuse reduced repeat-call time and post-restart median caption delay; detached-launch failure did not recur. |
| LIVELINK-STT-12F | Measure remaining caption spikes at the browser viewport under sustained OBS capture and detailed STT | Measured; sustained-duration gate open | Measured browser receipt and visible/offscreen row frame boundaries; PCM ingress and a long recognition request dominate peaks, while a harness request failure shortened the controlled take. |
| LIVELINK-STT-12G | Profile and reduce PCM ACK latency while the browser workspace polls during sustained two-track recording | Complete at sustained two-source data/latency gate; live waveform UI remains open | Batched native outbox ACK commits and changed-only folder persistence passed regressions; two warmed browser takes measured PCM p95 falling from 49.01/49.26 to 2.16/2.52 seconds without sample gaps. |
| LIVELINK-STT-12H | Repair live waveform clearing and historical missing-source lanes, then verify the recording tail in the browser | Complete at cursor/lane and OBS/browser regression gate; sustained PCM latency remains open | Empty cursor replies retain saved waveform; missing historical sources without PCM are omitted. Two real OBS takes verified retention, source removal and archive handoff; the long take again accumulated ingress delay. |
| LIVELINK-STT-12I | Reproduce and reduce renewed PCM ACK backlog under sustained browser waveform polling | Complete at measured cost/native/physical gate; natural-stall matrix remains open | Plugin 0.6.8 consumes larger existing queues without waiting. Fixed-delay p95 fell from 126 to 31 seconds; final quiet take reached 1.58/1.89 seconds. Arbitrary disk stalls can still postpone the live tail. |
| LIVELINK-STT-12J | Persist source-absence timing when a newly added source disappears during a take | Complete at reducer/native and two OBS/browser artifact gates | Plugin 0.6.9 retains queued PCM, journals callback boundaries and preserves restoration silence; Timeline distinguishes missing sources from receipt delay. |
| LIVELINK-STT-12K | Distinguish cold-start listener loss from process exit and health delay | Readiness/diagnostic/recovery slice complete; natural-loss gate open | Studio status initialized CUDA inside the old probe. Dedicated health, PID-aware waits and retained transitions are verified; five isolated cold cycles did not reproduce the historical listener loss. |
| LIVELINK-STT-12L | Replay persisted recovery backlog and foreground/detached cold startup in isolation | Isolated topology/recovery replay complete; natural-loss cause open | Six passing takes restore scheduling from 37 copied projects; startup scan logs retain evidence, but historical listener loss did not recur. |
| LIVELINK-STT-12M | Preserve selected project/footage and Script follow through API restart | Complete at lifecycle regression and isolated real-browser reconnect gate; live OBS matrix open | The same workspace, selected footage/word, scroll, zoom and transcript cursor survive restart; recovered polling clears stale transport alerts. |
| LIVELINK-STT-12 | Improve LiveLink recognition quality and reduce redundant model passes | Implemented at API test and archived two-track replay level; physical OBS gate open | Replaces the inaccurate tiny/2-second profile with medium/4-second passes and uses the project language when set. |
| VOICE-EXPORT-13 | Export Voice Manipulator output audio and word/line SRT | Implemented at generated-artifact, API and UI test level; running-browser download gate open | A selected Voice Output downloads its WAV, while SRT cues use trusted word timing or exact Script-row assembly bounds. |
| LIVELINK-MEDIA-14 | Make provisional OBS footage interactive during recording | Implemented; controlled physical viewport/PCM/MKA handoff passes in CAPTURE-10B; wider owner matrix open | A journal-only Media Pool row opens its tracks and live Timeline/Script, can preview saved PCM, and hands selection to the completed MKA. |
| LIVELINK-OVERLAP-15 | Link Script and Timeline overlap interval selection in both directions | Implemented at frontend regression level; running OBS viewport gate open | Script and Timeline share a selected interval for live and detailed STT, with source-specific highlighting and no autoplay. |
| MEDIA-SCRIPT-01C | Keep concurrent track rows intact and retain timed overlap after detailed STT | Implemented at frontend regression and owner recording fixture level; viewport acceptance open | An interjecting track no longer splits continuing speech, and detailed word timing remains inspectable in parent Script. |
| LIVELINK-STT-16 | Snapshot in-progress OBS PCM for detailed per-track STT, then process configurable blocks with 10-second padding | Implemented at API/UI, generated PCM and archived owner PCM level; physical recording gate open | A journal-backed job now follows durable PCM independently of the one-shot batch queue. |
| MEDIA-DELETE-17 | Remove a permanently deleted OBS recording from journal-backed Media Pool discovery | Complete at API, restart and owner-journal inspection level; running-app check open | Permanent deletion leaves a portable ID tombstone; stale machine state and orphan journals cannot publish a pending footage row. |
| UI-CONTRAST-01B | Inspect every highlighted state in both themes at owner viewport and DPI | Shared color repairs and observed browser gate pass; exhaustive physical/native matrix open | 29 cases / 863 readings pass in both themes; native OBS, 125/150% Windows DPI and remaining populated/model states are unverified. |
| GAP-PLAN | Re-plan remaining code gaps from verified repository state | Complete at source/evidence reconciliation and documentation level | Current near-term queue: 13 scheduled rounds and 2 conditional repairs; later phases remain open. |
| LIC-01 | Audit every borrowed repository at its pinned revision | Queued | Records license, notice/source obligations, model-weight terms, and distribution risk before release. |

| PROJECT-WRITE-01 | Concurrent project manifest and registry writes | Complete at Windows regression, concurrent HTTP/browser and restart/copy gate | Unique staging files and serialized repository transactions prevent collision and stale updates; see persistence gate. |
| RUNTIME-VOICE-01 | Bundled Voice Changer worker import | Complete at actual original/copied runtime and protocol gate | Script-local bootstrap fixes isolated Python sibling imports; see worker import gate. |
| RUNTIME-READY-01 | Owner startup timeout and detailed checkpoint scan | Measured blocking scan repaired; actual runtime restored; original intermittent cause remains unconfirmed | Cold checkpoint I/O yields to startup/health; see runtime-ready gate. |
| RUNTIME-READY-01B | Recovery storage stalls and full-console diagnostics | Storage mitigation and bounded diagnostics verified; historical native gate remains open | Real Uvicorn regressions and ordinary starts pass; future slow startup logs Python frames. |
| RUNTIME-READY-01C | Controller cold-start readiness deadline | Complete at launcher and live health gate; delay source open | A healthy controller bound just after the former 30-second deadline; a 60-second wait retains process and HTTP checks. |
| LIVELINK-INGEST-18A | Profile six-source spool and Stop tail | Queued by GAP-PLAN | Criteria and dependencies: `docs/GAP-PLAN-2026-10-03.md`. |
| LIVELINK-INGEST-18B | Reduce the measured six-source bottleneck | Conditional on preceding measured failure | Criteria and dependencies: `docs/GAP-PLAN-2026-10-03.md`. |
| LIVELINK-08N | Visible outbox health and safe retained-chunk recovery | Complete at scoped recovery and isolated outage gate | 0.6.10 installed with pairing unchanged; exact next STT-19A; see 08N-B gate. |
| LIVELINK-STT-19A | Freeze multitrack speech accuracy and timing evidence | Baseline measured; timing/physical acceptance open | Two real-model runs fail LiveLink live CER; see `docs/gates/livelink-stt-19a-speech-quality.md`. |
| LIVELINK-STT-19B | Improve the measured recognition or stitching failure | Large-v3 candidate rejected; repair acceptance open | CER 20.87% still fails; beam 5 also rejected (19B2); next independent MEDIA-STAGES-02. |
| VOICE-EXPORT-13B | Running-browser WAV and word/line SRT download | Browser handoff and real SRT artifacts pass; saved-file/cancel open | In-app browser emitted no download event; see `docs/gates/voice-export-13b-browser-real.md`. |
| VOICE-EXPORT-13B3 | Real-output browser handoff | Complete for UI status and project-owned SRT artifacts; parent open | 12 line/333 word cues fit audio; 18 untrusted cues skipped. |
| UI-CONTRAST-01C | Residual physical DPI and populated highlight matrix | Queued by GAP-PLAN | Criteria and dependencies: `docs/GAP-PLAN-2026-10-03.md`. |

The older execution order is in `docs/GAP-PLAN-2026-10-03.md`; queue rows above
retain historical implementation/acceptance distinctions. The latest dated
Queue entry governs the current next round; native-failure acceptance remains open.

## Round 03-03A — 2026-09-22

Completed:

- Added a separate `VoiceModelSet` domain aggregate with member roles, anchor,
  generation family, lifecycle status, timestamps, and reserved gate evidence.
- Persisted one atomic `assets/voice-model-sets/<set-id>/set.json` record using
  project-relative references only.
- Captured manifest ID/hash, engine revision, complete run config, base/model
  identity, segment count, and source run IDs as lineage.
- Connected non-RVC training publication to Model Set creation. A failed set
  write rolls back its new voice; RVC remains standalone by domain decision.
- Added list/get API and web client contracts. Deleting a pending set's only
  voice removes the set; published sets refuse that destructive shortcut.

Evidence:

- Backend suite: 357 passed.
- Focused set/publish contract: 5 passed.
- TypeScript typecheck: passed.
- Every new set stops at `pending-gate`; no code path marks it published.

Still missing:

- `SpeakerEmbedder` and its measured decision protocol (Round 03-03B).
- A real, consented end-to-end publish run (Round 03-03C).
- The code-gap implementation plan and repository/model license audit, both
  queued explicitly above rather than silently folded into this round.

## Round 03-03B — 2026-09-22

Completed:

- Added the `SpeakerEmbedder` port and two subprocess adapters: cached
  Community-1 embedding and separately installable WeSpeaker ResNet34-LM.
- Froze protocol v1: 16-bit PCM, mono 16 kHz, minimum 3 seconds, whole-window
  embedding, cosine similarity, and all-members-must-pass.
- Added project-safe gate inputs using Voice Output IDs rather than caller-owned
  paths; output-to-voice lineage must match exactly.
- Persisted model revision, threshold/calibration state, scores, candidate IDs,
  and decision reason; low scores reject, calibrated passes publish, and high
  scores under an unmeasured threshold remain pending.
- Added machine-local backend preference, discovery API, gate API, web client
  types, and GPU lease participation.
- Reproduced and fixed the Windows TorchCodec failure by preloading PCM WAV as
  the in-memory waveform shape documented by pyannote.

Evidence:

- Backend suite: 364 passed.
- Frontend suite: 288 passed; TypeScript/Vite production build passed.
- Cached Community-1 revision
  `3533c8cf8e369892e6b79ff1bf80f7b0286a54ee` loaded in the real Studio runtime;
  same-file smoke score was `1.0`.
- Dedicated WeSpeaker correctly reports unavailable instead of downloading or
  pretending success.

Still missing:

- Round 03-03C must create the real positive/negative trial evidence, calibrate
  one backend-specific threshold, and complete a real gated publish.
- GAP-PLAN and LIC-01 remain queued after that acceptance round.

## Round PORT-01 — 2026-09-22

Completed:

- Moved default VibeVoice, Applio/research, and Hugging Face cache paths below
  the application root, while retaining explicit environment overrides.
- Added `test-portable-runtime.ps1` with Core, Capture, STT, Training, and All
  fail-closed profiles plus JSON evidence output.
- Localized all 108 direct VibeVoice model files (75.68 GiB) and research engine
  source into ignored application-owned runtime folders; no source files or old
  environments were deleted.
- Declared and installed NumPy for the API worker that imports it directly.
- Recorded the accepted OBS follow-up scope: automatic Stop-to-MKV finalization,
  Final STT replacing live draft, source roles, and independent per-source
  diarization feeding Script/SRT speaker labels. Meeting recap is excluded.

Evidence:

- Portable audit improved from 11 pass / 9 fail to 14 pass / 6 fail.
- All 108 localized model files match source byte sizes; no missing file or size
  mismatch.
- Backend: 381 passed. Frontend: 293 passed. Production build passed.
- PowerShell parser and `git diff --check` passed; `engines/OmniVoice` stayed
  clean.

Still missing:

- Six Python virtual environments point to the developer's system Python and
  are not portable. PORT-02 must replace them with private bundled runtimes.
- PORT-03 must pass the `All` audit after a path move and on another Windows
  test machine.
- OBS-09/10 still need to implement automatic finalization, source roles, and
  per-source diarization in the product.

## Round PORT-02 — 2026-09-23

Completed:

- Added a checksum-pinned builder for six isolated CPython 3.11.9 embedded
  runtimes under `.runtime/python`.
- Vendored each workload's packages with hardlinks and relative-only `_pth`
  entries; excluded stale bytecode from the copied environment surface.
- Switched controller, API, Studio, speaker embedding, OmniVoice/VibeVoice/RVC
  training, and voice changer code to the private runtime layout.
- Preserved legacy layout lookup only for tests/build preparation; production
  defaults no longer select system-Python venvs.
- Updated setup/provision scripts to rebuild the appropriate portable runtime
  after dependency changes.

Evidence:

- Portable `All` audit: 20 passed, 0 failed.
- All six runtime import gates passed.
- API and Studio started successfully from their private interpreters and both
  health endpoints returned `ok`.
- Faster Whisper large-v3 loaded through the portable STT interpreter on CUDA
  with float16.
- Backend: 383 passed. Frontend: 293 passed. Production build, PowerShell parse,
  and `git diff --check` passed; `engines/OmniVoice` stayed clean.

Still missing:

- PORT-03 must build the actual transfer folder without build-only venvs, copy
  it to another path, and repeat the gate on another Windows machine.
- OBS-09/10 remain next after distribution acceptance: automatic finalization,
  source roles, and independent per-source diarization for Script/SRT.

## Round PORT-03A — 2026-09-23

Completed:

- Added a deterministic portable-bundle builder with hardlink staging and
  physical-copy modes, Windows long-path support, an interruption marker, and
  a manifest containing inventory and critical-file hashes.
- Excluded developer environments, source/build caches, tests, logs, Git
  metadata, and user project data while retaining all six Python runtimes,
  models, engine assets, the built web app, FFmpeg, and the OBS bridge.
- Added an OBS plugin installer using the supported machine-wide OBS layout,
  with hash verification and optional per-user configuration generation.
- Added portable verification/installation entry points and machine-facing
  quick-start documentation.

Evidence:

- Bundle inventory: 128,574 files, 117.60 GiB logical size.
- Source audit: 21 passed, 0 failed. Bundle audit: 25 passed, 0 failed.
- API and Studio returned `ok` from interpreters under the bundle path; both
  ports were released after shutdown.
- OBS installer fixture copied a matching DLL and parsed a two-source config.
- Backend: 383 passed. Frontend: 293 passed; production build passed.

Still missing:

- PORT-03B must physically copy the folder to another Windows machine, run the
  audit there, load the DLL in a real OBS 32 installation, and record separate
  mic/application sources. At this 2026-09-23 round, this workstation had no
  verified installed OBS instance; OBS 32.2.2 was observed on 2026-09-26.
- The plugin still uses manual source UUID configuration; observe that setup in
  PORT-03B before deciding whether a native source-picker panel is required.
  This recommendation was superseded by the owner-requested LiveLink UX plan.
- OBS-09/10 remain queued after distribution acceptance.

## Round PORT-03 storage audit — 2026-09-23

Completed:

- Scanned all 436,460 regular files and matched Explorer's 322,374,976,159-byte
  logical total.
- Counted unique NTFS file identities and confirmed hard-link relationships
  with `fsutil`: 300.235 GiB of paths represent about 152.958 GiB of unique
  allocated file data.
- Separated the 117.597 GiB bundle staging tree from its physical impact: all
  but about 0.002 GiB is shared with source runtime/model files.
- Measured removable smoke/build caches and SHA-256 verified 38 large duplicate
  content groups totaling 22.252 GiB of possible future deduplication.

Evidence:

- `docs/PORT-03-STORAGE-AUDIT.md`
- Ignored raw reports under `.scratch/port03-*-audit.json` and
  `.scratch/port03-content-duplicates.json`.

Still missing:

- No file was deleted or relinked. A separate footprint round must decide
  whether to retain old smoke evidence/build environments and how to dedupe
  immutable release runtimes safely.
- At this 2026-09-23 audit, PORT-03B remained the next acceptance round. The
  2026-09-26 planning revision below carries that gate into LIVELINK-08.

## Planning round: OBS LiveLink UX — 2026-09-26

Completed:

- Reconciled the requested Preferences installer, native OBS Tools dialog,
  source mixer, app channel controls, Recorder mode, trigger-ignore policy, MKV
  handoff, and synchronized timeline with the current v2 implementation.
- Defined one backend-owned multi-channel capture aggregate so the OBS LiveLink
  panel and Recorder cannot create duplicate recordings.
- Defined the protocol-v3 control plane, software time mapping, installation
  security boundary, staged migration, validation matrix, and eight bounded
  implementation rounds in `docs/OBS-LIVELINK-UX-PLAN.md`.
- Kept source roles and per-source diarization as the subsequent `OBS-10` round
  because a relay channel name is not a speaker identity.

Evidence:

- The plan is grounded in the current plugin, API, frontend, portability
  contract, OBS 32 headers, and public OBS plugin/frontend/source APIs.
- `git diff --check` passed; its output only contained existing line-ending
  conversion warnings.

Still missing:

- The owner/ChatGPT review must accept or amend the nine defaults in the plan.
- No `LIVELINK-*` code has been implemented. After approval, the exact next
  code round is `LIVELINK-01` (domain, protocol, time mapping, and state machine).
- `PORT-03B` remains unexecuted; the plan recommends folding its real-OBS clean
  machine gate into `LIVELINK-08` instead of certifying the manual v2 UX first.

## Planning revision: OBS LiveLink contract — 2026-09-26

Completed:

- Reconciled the LiveLink plan with the current OBS v2 plugin, PowerShell
  installer/build scripts, portable bundle inventory, project path contract,
  pinned OBS 32.2.2 source, and the installed OBS 32.2.2 executable.
- Replaced the incorrect staging-tree assumption with the actual current
  build-DLL source and distinct standard ProgramData and OBS-root destinations.
- Specified idle LiveLink versus owned app recording, bounded RAM pre-roll,
  0..N OBS video spans, pause causes, project-target leases, command epochs,
  causal event IDs, recovery, timing evidence, and per-user pairing secrets.
- Moved the unpassed physical-transfer/real-OBS gate from PORT-03B into
  LIVELINK-08. PORT-03B stays open; the plan stays awaiting owner review.

Evidence:

- `scripts/install-obs-plugin.ps1` installs the current DLL from
  `build/obs-plugin/RelWithDebInfo` into a ProgramData plugin-owned directory;
  `scripts/build-portable-bundle.ps1` carries that build artifact.
- OBS 32.2.2 source `libobs/obs-windows.c` and `frontend/widgets/OBSBasic.cpp`
  show OBS-root and ProgramData module paths; the installed `obs64.exe` reports
  version 32.2.2. No native dialog load has yet been proven.
- Documentation consistency review, `git diff --check`, and the read-only
  `engines/OmniVoice` cleanliness check were completed for this revision.

Still missing and why it matters:

- Owner/ChatGPT review of the revised defaults remains; the protocol must be
  agreed before native, API, and UI work share persistent IDs and timing data.
- LIVELINK-01..08 have not been implemented. Development OBS load evidence is
  required at LIVELINK-03; physical clean-machine acceptance is required at
  LIVELINK-08 before PORT-03B can be marked Complete.

Exact next code round after owner approval: `LIVELINK-01` — domain, protocol,
timing evidence, and causal state machine. This documentation round does not
start that code round.

## Planning clarification: OBS LiveLink audio archive — 2026-09-26

Completed:

- Selected audio-only Matroska (`source.mka`) as the proposed canonical output
  for one app recording, with one lossless FLAC/PCM track per OBS source.
- Kept durable per-source chunks for live capture/recovery and added a bounded
  `LIVELINK-07A` finalization round before the MKV handoff (`LIVELINK-07B`).
- Defined parent MKA/child track references, per-track STT, an embedded
  provenance attachment, and no default duplicate full source WAV archive.

Evidence:

- Matroska's official format documentation defines `.mka` as audio-only with
  multiple tracks and attachments; Xiph documents FLAC's lossless PCM encoding
  and recommends multiplexing many independent channels in a container.
- The bundled FFmpeg/FFprobe produced and read a two-track FLAC `.mka` with
  separate titles and an audio-only `.mka` carrying a JSON attachment. Test
  files were removed after inspection.
- `git diff --check` and a documentation consistency scan passed. The
  `engines/OmniVoice` checkout remained clean.

Still missing and why it matters:

- The current v2 backend still materializes one WAV source asset per OBS
  source. Multi-track Media Pool references, finalization/retry, and MKA
  artifact validation are planned for LIVELINK-01 and LIVELINK-07A; no code
  path yet creates the proposed canonical MKA.
- The plan remains awaiting owner review. Native OBS, clean-machine, and sync
  gates remain open.

Exact next code round after review: `LIVELINK-01` — domain, protocol, timing
evidence, state machine, and parent MKA/child track persistence contract.

## Planning clarification: OBS LiveLink STT audio — 2026-09-26

Completed:

- Clarified that each MKA track contains FLAC or PCM audio data, while WAV is
  a per-source analysis derivative rather than a file embedded as a track.
- Specified the existing STT derivative format, PCM16 mono 24 kHz, with
  independent extraction for every OBS source and direct PCM chunks for live STT.
- Added acceptance checks for PCM fallback tracks and per-track STT decoding.

Evidence:

- Current OBS live and MKV import adapters both create `analysis.wav` using
  FFmpeg `-ac 1 -ar 24000 -c:a pcm_s16le` for each source/track.
- Official Matroska codec mappings include FLAC and PCM audio tracks; Xiph
  documents FLAC as a lossless encoding of integer PCM.
- Documentation diff checks passed; no product runtime code was changed.

Still missing and why it matters:

- The proposed one-file MKA capture and track references are not implemented.
  The current v2 recorder still creates a source WAV per OBS source.

Exact next code round after plan review: `LIVELINK-01` — persistent track
reference and recording contract, followed by `LIVELINK-07A` for MKA archive.

## Round LIVELINK-01 — 2026-09-26

Completed:

- Added a serializable v3 domain model and pure reducer for connection,
  project-target lease, OBS video spans, app recording, independent pause
  causes, channel identity/tombstones and forwarding intervals.
- Kept capture stopped separate from archive ready; a verified MKA reference
  is required before the archive can claim readiness.
- Defined per-track MKA parent/child references and a read-only projection of
  legacy v2 WAV sessions. Existing v2 routes and project files were not changed.
- Froze lifecycle event sequence/idempotency, command epoch/ACK matching,
  sample and clock evidence, link-loss behavior, and pre-roll eviction policy.
- Recorded the domain decision in ADR 0012 and the v3 transport/persistence
  contract in OBS-LIVELINK-PROTOCOL-V3; updated the domain glossary.

Evidence:

- New reducer suite: 21 passed, including trigger policy changes, manual
  Pause with OBS Unpause, Ignore Stop across two spans, duplicate/missing
  events, stale ACK, source tombstone, v2 read projection and pre-roll limits.
- OBS-focused backend suite after the final model change: 35 passed.
- Full backend suite: 398 passed and 1 unrelated failure in TrainingProcess
  cancellation. The same test failed again in isolation. With that known
  failure deselected, the suite passed 401 tests before the final archive
  readiness and alias cases were added; the 35 OBS tests passed afterward.

Still missing and why it matters:

- No v3 HTTP route, native dialog, durable v3 writer, Media Pool child-track
  reader or MKA finalizer is connected yet. Users still experience the v2 OBS
  flow. Native pre-roll must be checked against the new oracle in a later
  plugin round.
- The pre-existing TrainingProcess cancellation test prevents a fully green
  backend suite and needs its own bounded investigation.

Exact next product round: `LIVELINK-02` — Preferences-based plugin install,
status, repair and OBS layout verification.

## Round LIVELINK-02 — 2026-09-26

Completed:

- Added a staged plugin package containing the built x64 DLL, OBS locale file,
  fixed standard/portable destination map and SHA-256 manifest. Native builds
  refresh the package and portable bundles include it.
- Added a local installer adapter and allowlisted API for status, install,
  update, repair, remove and Open OBS. It validates the OBS root, portable
  marker and package hashes before any write; installed files are rehashed.
- Added rollback for partial writes, distinct rules for fresh install versus
  update/repair/remove while OBS runs, and a UAC fallback after a normal write
  is denied. Per-user install identity/token/launcher metadata stay outside
  the machine-wide binary path; Repair preserves them. Remove only deletes
  pairing metadata when the user explicitly selects that option.
- Added the OBS LiveLink card to Preferences with folder selection, status,
  action controls, installed version/hash state and restart guidance. The
  standalone batch installer now calls the same adapter.

Evidence:

- Installer unit/API/CLI tests: 8 passed (standard, portable, tamper, rollback,
  running OBS, update and API response without token).
- Preferences component tests: 2 passed. Full frontend suite: 300 passed;
  typecheck and production build passed.
- Full backend suite: 409 passed, one pre-existing TrainingProcess cancellation
  test failed at the same `runner.is_alive()` assertion recorded in L1.
- Packager emitted `build/obs-plugin-package/manifest.json`; the development
  machine's OBS executable version probe returned `32.2.2.0`.
- Portable `Capture` audit: 5 passed, 0 failed, including package DLL/locale
  hash checks. Bundle manifest now lists those files as critical artifacts.

Still missing and why it matters:

- Windows UAC prompt, actual plugin load from the new package, and copied-bundle
  installation on another machine have not been exercised. These require an
  interactive/clean Windows acceptance run; code-level tests cannot certify
  OBS loaded the native DLL. This gate remains with LIVELINK-08.
- The generated per-user install identity is preparatory. The current v2
  native plugin still reads its old manual `config.json`; LIVELINK-03 must
  consume the new pairing state and provide the OBS Tools dialog before the
  user flow is automatic.

Exact next product round: `LIVELINK-03` — native Tools dialog, Open App and
automatic pairing with a real OBS load test.

## Round LIVELINK-03 — 2026-09-26

Completed:

- Registered Tools > Pro4Bro Voice Manipulator LiveLink independently of the
  legacy v2 `config.json`. Added an OBS-owned modeless dialog with connection,
  active-project, OBS recording state and Open App controls. The old parser
  remains a v2 fallback.
- Added authenticated v3 hello/heartbeat with per-user install identity and
  token, a process connection epoch, 15-second connection expiry and a
  single-owner 15-second project target lease. WorkspaceShell acquires and
  renews the lease while a project is open; leaving releases it. Competing
  tabs cannot overwrite the current owner.
- Open App checks both the API and frontend; it launches the installer-recorded
  local `start-pro4bro.bat` when either is unavailable, then opens the local UI.
- Built plugin version 0.2.0 and refreshed the package manifest. OBS 32.2.2
  executable and matching source checkout `ba2f32bdf791005443988a4955e963663e16b1ed`
  were used. The installed Qt6Widgets runtime reports 6.11.1.0. ADR 0013
  records the Windows dialog choice for this round.

Evidence:

- Native x64 build succeeded. Actual OBS 32.2.2 loaded the DLL from
  `build/obs-plugin/RelWithDebInfo` through `OBS_PLUGINS_PATH`. Windows UI
  Automation found the Tools entry, opened the dialog, read Connected, Idle and
  No active project, observed the leased project name after heartbeat, and
  reopened the dialog after closing it.
- With the app stopped, the dialog's Open App button brought up API port
  18120 and frontend port 18119; both returned HTTP 200. The plugin then
  reconnected. The smoke test used an existing project without changing its
  project files and released its lease.
- Backend: 415 passed, 2 existing deprecation warnings. Frontend: 301 passed;
  typecheck and production build passed. `git diff --check` passed.

Still missing and why it matters:

- The dialog uses a Windows-owned window because this checkout has OBS' Qt
  runtime but no Qt SDK. The UX plan originally specified Qt Widgets; revisit
  that choice before implementing the larger source mixer in LIVELINK-04.
- The new DLL loaded from the build folder alongside the older installed DLL.
  The installed package still reports damaged and its Repair/UAC path did not
  receive Administrator consent in this run. Do not record with both copies
  loaded: both would receive the legacy v2 OBS recording events. Installed
  package and clean-machine acceptance remain LIVELINK-08 gates.
- Source selection, meter, alias and mapping persistence are LIVELINK-04.
  The v3 connection does not yet forward audio; v2 capture still depends on
  its old config fallback. No MKA, MKV final ingest or final STT/SRT is claimed.

Exact next product round: `LIVELINK-04` — native source inventory, meter,
forward selection, alias and mapping persistence.

## Round LIVELINK-04 — 2026-09-26

Completed:

- Added a plugin-owned Win32 mixer with five reusable visible strips and a
  scrollbar for larger source lists. Inventory uses OBS' public source UUID,
  audio-active, active, pinned and hidden state so the default list matches
  the OBS Audio Mixer. It refreshes add/remove/rename and scene collection
  changes while the dialog is open.
- Added `obs_volmeter` peak callbacks with a 200 ms UI refresh. Callback work
  is atomic-only; meters detach when a source disappears, the collection
  changes or the dialog closes.
- Added per-scene-collection mapping in the plugin's local config with stable
  channel IDs, source UUIDs, slots, native names, forward flags, unique aliases
  and alias revisions. Missing selected sources remain visible; slots are
  reserved rather than recycled while recording ownership is not yet wired.
  The v3 data plane does not consume the forward selection until LIVELINK-05.
- Built and packaged plugin version 0.3.0. The legacy v2 `config.json` path
  remains a migration fallback.

Evidence:

- Native x64 build succeeded against OBS 32.2.2 headers/imports; package
  manifest reports plugin version 0.3.0.
- Actual OBS 32.2.2 loaded the build DLL. Windows UI Automation observed five
  mixer strips matching the five visible OBS Audio Mixer sources. An initial
  all-audio enumeration showed ten; the active/hidden filter corrected it.
- A quiet 48 kHz stereo PCM16 tone played through Desktop Audio moved the
  plugin meter from 0 to 6 and back to 0. A forward toggle and alias edit were
  saved; a duplicate alias was rejected without changing the stored mapping.
- A fresh mapping held five distinct source/channel IDs, and reopening OBS
  preserved all five IDs and strip labels. OBS exited normally after the test.
- Portable `Capture` audit after the final package rebuild: 5 passed, 0 failed.
  `git diff --check` passed; `engines/OmniVoice` remained clean.

Still missing and why it matters:

- Live add/remove/rename, scene collection switch and a 20-source list have
  code paths but no controlled OBS runtime acceptance evidence yet. These
  cases must be exercised before calling the full L4 source matrix complete.
- The forward flag is local configuration only. LIVELINK-05 must synchronize
  inventory/meter/selection with the API and app, then ACK applied state.
- The installed copy is still older/damaged on this workstation. Only the
  build-folder DLL was exercised; installer/clean-machine acceptance stays at
  LIVELINK-08. Do not record with both DLL copies loaded.

Exact next product round: `LIVELINK-05` — v3 channel synchronization and app
mixer, including controlled source-change acceptance carried from L4.

## Round LIVELINK-05 — 2026-09-26

Completed:

- Added v3 channel inventory to authenticated hello/heartbeat, including stable
  channel/source IDs, alias revision, slot, meter peak, OBS mix sample rate,
  observed channel count, mute and missing state. The plugin keeps its control
  worker active while the native dialog is hidden.
- Added per-channel Forward commands through an epoch/revision-scoped long
  poll, idempotent ACK, plugin monotonic applied boundary, desired/applied
  separation and a full snapshot on reconnect. Stale ACKs and invalid source
  identities are rejected. Command queues clear when an epoch is invalidated.
- Added status SSE with a polling fallback and the app LiveLink mixer with
  source strips, meters and per-channel Forward toggles. An Idle toggle does
  not create an app recording.
- Built and packaged plugin version 0.4.0. The v2 capture path remains for
  existing installations; v3 audio capture is a later round.

Evidence:

- Backend suite: 417 passed, two dependency deprecation warnings. Frontend:
  40 files/302 tests passed, typecheck and production build passed. Native x64
  build succeeded against OBS 32.2.2.
- Development OBS 32.2.2 loaded the DLL and reported five channels while the
  dialog was hidden. The API reflected alias edits and a real Desktop Audio
  meter signal. The final build reported 48 kHz and OBS mute/channel metadata.
- Real localhost Forward On and Off returned applied ACKs in 226 ms and
  230 ms, with plugin monotonic boundaries; OBS remained Idle. An earlier
  API-kill/restart exercise produced a new server/connection epoch, restored
  all five channels and accepted subsequent On/Off commands without an OBS
  crash. The final Forward state was Off.
- Capture portability audit: 5 passed, 0 failed. `git diff --check` passed;
  `engines/OmniVoice` remained clean. Test OBS and API processes exited.

Still missing and why it matters:

- The controlled live add/remove/scene-switch and 20-source matrix from L4 is
  still open. Its code paths exist, but mapping stability under those changes
  needs runtime acceptance before claiming the full source matrix.
- Applied sample index, `user-disabled` recording intervals and audio chunk
  reconnect are L6 data-plane work; the current ACK has monotonic time only.
  No v3 recording-quality or timeline claim follows from Idle toggles.
- Installed-package/UAC and clean-machine acceptance remain at L8. This
  workstation's build-folder DLL was used for the OBS runtime check.

Exact next product round: `LIVELINK-06` — OBS LiveLink recorder, trigger/ignore
matrix and recording-time channel intervals. Carry the source-change matrix
into runtime acceptance before claiming L4/L5 complete end to end.

## Round LIVELINK-06 — 2026-09-27

Completed:

- Added an OBS LiveLink source in Recorder with app Start/Pause/Resume/Stop,
  per-channel status, project recording history and persisted multi-select
  Ignore Start/Pause/Stop policy. The browser recorder remains available.
- Connected OBS lifecycle events and applied app/channel commands to the v3
  state reducer. Manual and OBS pause causes, 0..N video spans, recording-time
  `user-disabled` intervals and source sample boundaries persist in a
  project-owned journal.
- Added bounded native per-source PCM capture/upload with SHA-256 and durable
  chunk ACKs. Finalization retains original chunks, builds transitional WAV
  stems and Media Pool assets, and classifies missing sample ranges. A stem is
  reported only after its files exist. The MKA parent archive belongs to L7A.
- Fixed a heartbeat/Forward ACK race discovered during the real OBS test: the
  disabled interval is now opened at ACK even if a heartbeat already updated
  the desired flag.

Evidence:

- Backend: 422 tests passed, including the Forward ACK race regression.
  Frontend: 304 passed;
  typecheck and Vite production build passed. Native DLL build passed.
- Development OBS 32.2.2 produced a 48 kHz stereo, 6.421-second WAV with
  nonzero audio peak; one 10 ms transport gap remained in that run. A later
  two-source recording produced two separate Media Pool stems with zero gaps.
- A real Forward Off/On while recording yielded a `user-disabled` interval
  from sample 13,102,080 to 13,182,720; the matching audio gap was classified
  `user-disabled`, not transport. Manual Pause/Resume/Stop and automatic stem
  finalization also ran against OBS. Capture portability: 5 passed, 0 failed.
- `git diff --check` passed and `engines/OmniVoice` remained clean.

Still missing and why it matters:

- The physical OBS Start/Pause/Resume/Stop and Ignore matrix, including Stop
  then Start across two video spans, has reducer and runtime tests but has not
  yet been exercised as an OBS recording. It must pass before claiming the
  automatic trigger behavior end to end.
- The L4/L5 live source-change/20-source matrix and installed-package/UAC
  gate remain open; the development DLL and current five-source collection
  do not prove either environment.
- Source PCM remains as chunks plus transitional WAV stems. One verified MKA
  parent archive per app recording and MKV handoff are L7A/L7B work.

Exact next product round: `LIVELINK-07A` — build and verify the audio-only MKA
parent archive from the retained per-source PCM; carry the physical OBS trigger
matrix into L8 end-to-end acceptance.

## Round LIVELINK-07A — 2026-09-27

Completed:

- Finalization now creates one project-relative `source.mka` with one FLAC
  track per OBS source. If FLAC encoding or verification fails, it retries
  lossless PCM16 tracks. Stable per-source Matroska TrackUIDs and stream
  indexes match the embedded `pro4bro-session.json` mapping, clock, video
  span and gap evidence; attachment bytes are read back and verified.
- Every audio track is decoded and compared byte-for-byte with the captured
  PCM stem before archive publication. Its own stream is decoded to a PCM16
  mono 24 kHz analysis WAV. A Media Pool parent MKA and child assets carry
  parent asset ID, stream index and TrackUID; the child uses the analysis WAV
  for playback/STT. Full source WAVs are removed after successful archive
  publication. Original hashed chunks remain for recovery.
- Added project-scoped archive retry from retained chunks without an active
  OBS connection. A corrupt chunk fails closed; a repaired chunk can be
  retried. A ready archive has a journal SHA-256 for idempotent retry.
  Channel history survives source disappearance before Stop. V2 sessions
  continue through their existing WAV reader.

Evidence:

- Archive tests pass for 1, 2 and 5 independently addressed sources, one
  forced PCM fallback, a source added then removed during recording, corrupted
  chunk rejection/retry, and copied-project Open Existing with child analysis
  paths. Actual FFmpeg/FFprobe performs mux, attachment extraction and
  per-track audio verification in these tests.
- The local retry API rebuilt a two-track MKA from the prior development OBS
  recording `4285b022-34ac-4c59-8b35-0a6d51a02253`. FFprobe reported two
  audio streams and one attachment; the journal SHA-256 matched the file.
- Backend: 426 passed, two existing dependency deprecation warnings.
  Frontend: 305 passed; typecheck and Vite production build passed. Capture
  portability: 5 passed, 0 failed. `git diff --check` passed and
  `engines/OmniVoice` remained clean.

Still missing and why it matters:

- Five simultaneous sources, source changes and the OBS trigger/Ignore matrix
  have not been exercised together in a physical OBS recording. The automated
  archive tests use real FFmpeg but synthetic source PCM. L8 must measure
  those runtime paths and timing before an end-to-end quality claim.
- OBS MKV locator/import and association with one or more video spans are
  L7B work. The MKA is audio-only and has no imported video counterpart yet.
- A Media Pool child currently uses its 24 kHz analysis WAV for playback and
  STT while its lossless source is addressed through the parent MKA reference.
  Export of an individual original-rate source track has no dedicated UI yet.

## Round LIVELINK-07B — 2026-09-27

Completed:

- Added a machine-local recording-folder preference controlled from the
  Recorder. The OBS plugin reports its configured output folder when enabled
  and sends `obs_frontend_get_last_recording()` with the matching span after
  OBS Stop.
- Stored exact locators under machine data keyed by OBS install and span IDs;
  portable recording journals retain only the video span, imported asset ID,
  and content SHA-256. When no exact locator exists, import can use the latest
  completed MKV from the connected folder.
- Added per-span Import MKV from OBS and Browse flows. The API rejects active
  spans, missing/empty files, changed files during import, non-video MKVs, and
  attempts to replace an already linked asset. Project imports are cached under
  relative `assets/media/...` paths; re-importing the same span returns its
  existing asset.
- Added coverage for two OBS spans in one app recording, exact filename-to-span
  association, project journal path hygiene, duplicate asset linking, and the
  Recorder folder/import/Browse controls.

Evidence:

- Backend: 428 passed, two existing dependency deprecation warnings.
- Frontend: 307 tests passed; TypeScript typecheck and production build passed.
- Native OBS plugin built successfully against the pinned OBS 32.2.2 headers;
  only existing upstream anonymous-struct warnings were emitted.
- `git diff --check` passed; output contains pre-existing line-ending warnings.

Still missing and why it matters:

- A physical OBS run has not yet proven correct exact MKV handoff for closely
  named recordings, active-file rejection, or two spans attached to one app
  recording. Project move/reconnect and actual video playback also remain
  physical acceptance checks. These gates matter because fixtures cannot prove
  OBS finalization timing or a user's moved project can resolve the asset.
- Timestamp reconciliation, five-source capture, and clean-machine packaging
  remain for LIVELINK-08.

Exact next product round: `LIVELINK-08` — physical OBS matrix, time
reconciliation, portability, and clean-machine acceptance.

## Round LIVELINK-08 — 2026-09-28 (physical acceptance checkpoint)

Verified in this checkpoint:

- Repaired the installed standard OBS plugin from the repository package while
  preserving its per-user pairing data. The installer reports plugin 0.5.0,
  OBS 32.2.2.0, `pairingReady: true`, and `state: installed`.
- Closed OBS through its normal window close path, enabled the local OBS
  WebSocket for the test, and confirmed a listener on port 4455. OBS loaded the
  plugin and connected to the API with the real `Pro4Bro-OBS01` collection and
  three inventoried channels.
- Generated a 14-second lossless A/V fixture with four paired audio pulses and
  white video flashes at 1, 4, 8, and 12 seconds. The first physical OBS
  Start/Stop produced a 48 kHz stereo MKA track (721,487 frames, 87 chunks,
  zero classified gaps) and a completed OBS MKV linked to its video span.
- Imported that MKV into the temporary acceptance project. Comparing the four
  sample-clock pulse onsets with the corresponding decoded MKV flash PTS gave
  signed offsets of -35 ms for each cue; all four paired cues meet the <=200 ms
  gate for this short fixture.
- Repeated Start/Stop twice in the same OBS process. Both runs produced a
  completed MKV and video span, and the MKV audio tracks contain the fixture
  sound, but LiveLink retained no PCM chunks and produced no MKA. Archive retry
  returned 503, `OBS source stems are missing; rebuild them from retained
  chunks.` This leaves successive-record audio capture unaccepted.
- Restored the original OBS profile and WebSocket config byte-for-byte, turned
  LiveLink forwarding off, relaunched OBS, and confirmed it reconnected idle.

Not verified in this checkpoint:

- The short synthetic fixture does not prove a 30-minute spoken recording.
  Its first run also contained an extra audio region at 13.765-14.02 seconds
  with no matching video flash, so the no-unexplained-audio-drop/duplicate gate
  remains open even though the four planned cue pairs passed.
- The 1/2/5-source, pause/resume, Ignore, API-restart, source-loss/restore and
  scene-switch matrix remains open. No second Windows machine was available for
  transfer, clean install, and uninstall/repair acceptance.

The passing cue measurement applies only to the first short recording on this
development machine. Fix and verify LiveLink audio capture across successive
OBS recordings before extending the physical matrix. Keep LIVELINK-08 and
PORT-03B open until the 30-minute recording/timing matrix and a
different-Windows-machine portable install pass with retained artifacts.

Historical next-step note from the 2026-09-28 physical checkpoint: repair
LiveLink PCM capture on the second recording before extending the matrix.

## Planning revision: LIVELINK-08 automatic round sequence — 2026-09-28

The owner will inspect only after the complete observable path is implemented:
OBS/app Record state, per-channel indicators and waveform, automatic live STT,
Script rows, overlap markers, and the branded plugin dialog. Split the remaining
work into `LIVELINK-08A` through `08J` in the exact Queue order above. The
scoped objectives and objective evidence for each are in
`docs/OBS-LIVELINK-MULTICHANNEL-UX-PLAN.md`. This is a planning change; it does
not complete any product round or invalidate prior physical measurements.

One invocation completes and verifies one bounded round, logs its evidence and
exact successor, and stops. The next automated invocation continues without
intermediate owner UAT or approval. `LIVELINK-08` becomes the final integration
gate **after** `08J`; its 30-minute/1-2-5-source/time and clean-machine criteria
stay open until actual artifacts and measurements exist. If another Windows
machine is unavailable, complete all local/code rounds and local integration
checks, report that external gate once at the end, and keep `PORT-03B` open.

Exact next product round: `LIVELINK-08A` — repair repeated-record PCM capture
and prove three consecutive OBS recordings have matching chunk/MKA/MKV artifacts.

### LIVELINK-08A investigation and API repair — 2026-09-28 (physical gate open)

The three actual OBS Start/Stop fixture journals at 00:05, 00:12 and 00:17 are
`7e78c240-9a9b-5c1c-becf-539072e7b5d3`,
`2a187eac-5fcc-5b72-baf6-7d8ce274fc29`, and
`b2a4cf53-0ddc-5847-a5d1-519768cafc77`. Each has an OBS video span and
matching MKV. The first has 87 durable PCM chunks and a ready MKA; the next
two have zero chunks and no MKA. The earlier checkpoint accidentally cited
three later 09:38–09:41 sessions; those are separate runs and do not establish
this round's consecutive-OBS result.

Root cause: the first MKA has TrackUID `12738617874486415437`. Beginning at
00:05:52, OBS logs `obs_data_create_from_json` failures for exactly this number
on every plugin heartbeat. The UID is valid unsigned Matroska metadata but
exceeds the signed 64-bit integer limit of OBS's JSON parser. The plugin then
cannot read the snapshot containing the next app `recordingId`, so it sends no
PCM for the second and third OBS sessions although the API records video spans.

The API now omits nested `sourceArchive` only from OBS hello/heartbeat recent
recording summaries. It keeps recording ID, timing, status and video span IDs
there, while app status, project journal and MKA keep the exact full TrackUID.
Regression coverage uses the UID above and verifies the plugin snapshot after
archive and API runtime reload, then checks that a later OBS Start supplies a
new app recording ID. The new test failed before the fix and passed after it.
An additional HTTP integration test now checks the real `/hello` and
`/heartbeat` route responses after the large UID is persisted, confirms app
`/status` retains that UID, and verifies the next OBS Start reaches a distinct
app recording. Full backend suite: 430 passed, two existing dependency
deprecation warnings.
`node --check` for the physical harness and `git diff --check` passed (the
repository's existing line-ending warnings remain).

The local `.scratch/livelink08-acceptance/repeated-recording.mjs` harness now
renews the project lease, restores OBS input/recording directory on failure,
and requires PCM/MKA/MKV per OBS session. Its three-session physical run is
still open. OBS started with WebSocket, but the first attempt lost the temporary
API process before recording; a later unattended run was rejected by the
environment policy. OBS WebSocket configuration was restored to its original
disabled state and OBS exited. The previous forced process cleanup was also
rejected by policy; that stale process has since exited. No three-session pass
or advance to `08B` is claimed.
At the final status check the standalone API answered `/api/health` with HTTP
200, OBS was closed, and WebSocket was disabled. The local frontend port 18119
was not listening; automatic approval review also rejected the attempted
controller restart with the generic reason `blocked by policy`.

### LIVELINK-08A physical acceptance and OBS lifecycle repair — 2026-09-28

The first live retest found two fixture setup problems: OBS had its `Untitled`
scene collection selected, and the fixture channels had forwarding off. That
attempt did not establish audio capture. Switching collections in the old
installed plugin stalled OBS during scene cleanup. OBS logged retained sources;
the v3 capture and mixer retained OBS source references across collection
changes. The plugin now detaches audio callbacks and releases those references
on collection changing/cleanup, resumes on changed, and stops before OBS exit.
The native plugin built and the hash-checked package was repaired into the
standard OBS 32.2.2 installation. A later switch back to `Untitled` completed
with two callback-detach log entries, no retained-source warning, and OBS still
responding. The owner's original scene collection and forward choices were
restored; OBS remained open and idle.

The corrected physical harness explicitly turns on `OBS01 Mic` forwarding,
waits for applied ACK, and restores its previous state. In one OBS process it
then performed three consecutive Start/Stop cycles. Project journals, PCM
chunks, a one-track FLAC MKA, and the matching MKV/video span were present for
each:

| Recording ID | PCM chunks | Frames | Gap intervals | MKA bytes | MKV bytes | Journal |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `5b9a38b0-8534-57cc-8a85-cec18bf49f34` | 65 | 815040 | 0 | 491912 | 2242863 | ready |
| `51a76737-f218-516e-926c-9ae13966f0e2` | 70 | 856800 | 0 | 528945 | 2333011 | ready |
| `5764954a-271b-5070-82d4-c5be0cbe89c6` | 65 | 824640 | 0 | 488858 | 2267130 | ready |

The first MKA was independently probed as 48 kHz stereo FLAC, duration
16.284 s. The package install reported `installed`, matching OBS 32.2.2;
`node --check` passed for both local harness scripts. The API regression/full
backend suite from the earlier 08A fix remains 430 passed. Windows recorded
one earlier OBS `obs.dll` access violation at 11:42; the available event/logs
cannot prove which component caused the owner's error popups. No new crash
occurred in the three-record run or scene switch.

`LIVELINK-08A` is complete for its repeated-record acceptance. This only
proved one forwarded live source; multi-source and visible per-channel Record,
waveform, and transcript acceptance remains in the following rounds and final
`LIVELINK-08` gate.

Exact next product round: `LIVELINK-08B` — expose per-channel evidence that
distinguishes OBS Record, app recording, applied forwarding, and acknowledged
PCM, including stall/gap transitions.

### LIVELINK-08B per-channel capture evidence — 2026-09-28

The app v3 `/status` and SSE `/events` snapshots now include a `capture`
projection on every OBS channel. It carries recording/project ownership,
`idle`, `pending`, `receiving`, `stalled`, `paused`, `disabled`, `missing`,
`forward-pending` or `disconnected` state; durable chunk count, sequence and
sample-index high-water; UTC receipt time of the last persisted PCM; and
positive sample-index discontinuity count/frames. `receiving` requires a
durable chunk from the **current** app recording in the last three seconds.
OBS Record, meter activity and Forward ACK alone cannot make it `receiving`.
Silent PCM counts because it is still persisted audio. UTC is only a stall
diagnostic; sample index and OBS monotonic time remain the media clock.

Each v3 chunk metadata file now saves its server UTC receipt time. Every 16
chunks per channel, a project-relative evidence checkpoint limits API restart
work; recovery verifies its last chunk pair and replays later metadata. The
app's TypeScript contract includes the projection. OBS hello/heartbeat omit
it so the OBS JSON parser sees no new large evidence payload. Existing
recordings without `startedAtUtc` remain readable, but a pre-first-chunk
recording from that older format shows `stalled` rather than an unproven
`receiving` state after restart.

Backend tests cover OBS Start, Ignore Start, manual ACK, Forward pending/ACK,
disabled and missing sources, pause, disconnected state, silent PCM, duplicate
ACK, sample gap, stopped capture, second recording ID, and a fresh API
connection rebuilding high-water from the project checkpoint and tail chunks.
The endpoint test confirms app status includes `capture` while plugin hello
does not. Verification: backend **433 passed** (two existing deprecation
warnings); frontend **307 passed**, TypeScript typecheck and Vite build passed;
`git diff --check` reported no whitespace errors (existing line-ending notices
only). No plugin binary change or live OBS recording was required for this API
contract round. The live channel indicator and visual acceptance remain 08C;
the broader two/five-source and sync matrix remains the final LIVELINK-08 gate.

### LIVELINK-08C Recorder and truthful REC — 2026-09-28

OBS LiveLink in Recorder now retains the normal Record button, changes it to
Stop during app recording, and exposes Pause/Resume. A channel row is 28 px
high at the tested font scale, with the channel alias on the left, native OBS
source and capture status on the right, and a 4 px meter. Historical sessions
scroll within 160 px so controls remain reachable. The red pulsing dot and
visible `REC` appear only when the 08B status reports durable PCM receipt for
the current app recording/project. Idle, pending, forward-pending, paused,
stalled, disabled, missing and disconnected have static gray dots and distinct
labels. Reduced-motion preference suppresses the pulse while retaining `REC`.

Verification: frontend **318 passed**, TypeScript typecheck and Vite build
passed. Component tests cover state mapping, stale paused evidence, manual
Record/Pause/Resume and Ignore Start. In the built app at 1600 and 1100 px,
five channel rows and the Record control stayed visible in the right panel;
screenshots are `.scratch/livelink08c-view-wide.png` and
`.scratch/livelink08c-view-narrow.png`. The development OBS/API test confirmed
OBS Start switched the app button to Stop: four channels had persisted PCM and
showed red `REC`, while a fifth channel with no PCM showed gray `PCM stalled`.
OBS Stop returned all five to gray Idle. A separate OBS Start with Ignore
Start enabled left app recording empty and all channels gray; the trigger
policy was restored afterward. This does not complete live per-channel
waveforms or transcription, nor the final LIVELINK-08 source matrix.

Exact next product round: `LIVELINK-08D` — build sample-timed per-channel
waveform envelopes from acknowledged PCM for live Timeline display.

### LIVELINK-08D Per-channel waveform feed — 2026-09-28

Each durable v3 PCM chunk now writes a project-owned 50 ms min/max/peak
sidecar keyed by recording/channel/sequence before ACK. A bounded waveform
route returns at most 600 extrema points in a window of at most 120 seconds;
live delta requests process at most 32 chunk sequences. Its source sample
range and recording-relative frame range remain distinct. A null peak means
no received live PCM, while zero means received silence. The existing status
SSE reports the durable sequence after sidecar publication; a web feed helper
uses that watermark, fetches only changed channel windows, and falls back to
two-second status polling after SSE disconnect. Raw PCM never enters the web
response. After Stop, the same route can regenerate 10-second envelope blocks
from each matching MKA track, with project-relative portable cache files. ADR
0014 and the v3 protocol document fix this interface.

Verification: backend **435 passed**, frontend **320 passed**, TypeScript
typecheck and Vite build passed. Tests cover two sources with different peaks,
silence versus missing PCM, pause, disabled source, sample gap, fresh reader,
32-chunk cursor catch-up, HTTP validation, MKA rebuild, and moved-project
reopen. A prior physical four-track OBS archive was decoded independently for
the first second: each envelope peak matched its MKA PCM track exactly
(`0`, `1411`, `277`, `0`); evidence is
`.scratch/livelink08d-real-check.json`. The sidecar and response limits bound
memory/payload; a long 20-channel runtime performance run is still part of
the final LIVELINK-08 matrix. The development API was restarted on port
18120; OBS reconnected, and the live HTTP waveform route returned 20 MKA
points with peak `1411` for the selected physical channel.

The waveform is a feed, not yet a Timeline lane or live transcription.
Archive padding is decoded as zero; the existing recording journal identifies
pause, disabled and transport-gap intervals for Timeline presentation.

Exact next product round: `LIVELINK-08E` — render one live and reopened
Timeline waveform for every forwarded OBS channel using this feed and its
recorded gap/interval provenance.

### LIVELINK-08E Per-channel Timeline waveforms — 2026-09-28

The OBS LiveLink capture source now opens a dedicated multi-channel Timeline.
Every forwarded channel has its own labelled waveform lane under one ruler and
playhead. Live lanes read the durable 08D envelope feed; received silence is
drawn as a flat line, while missing PCM, capture pauses, channel intervals and
archive gaps are marked at their recording-relative positions. A 60-second
live window follows the playhead. After Stop, the Timeline reopens each MKA
child track, keeps the source label and sample clock, and lets the user choose
a channel and seek/play its WAV. Recorder history can open all channels of a
selected session in this Timeline.

Verification: backend **435 passed** (two existing deprecation warnings),
frontend **323 passed**, TypeScript typecheck and Vite build passed; diff hygiene
found no whitespace errors. The app's Record produced a 42.55-second
four-track MKA; live Channel 2 and 3 had distinct waveforms, while a fifth
source with no PCM stayed visibly pending. A separate physical OBS Start/Stop
produced a 15.41-second four-track MKA and matching MKV. Its reopened Channel
2/3 envelopes had peaks `3091`/`1708` at 48 kHz, with distinct rendered paths;
selecting Channel 2 loaded its own WAV and seeking moved playback to 00:10.
The two recording IDs and channel/track/gap evidence are preserved in
`.scratch/livelink08e-real-check.json`.

This completes the 08E waveform and replay slice. Column/layer layouts and
per-channel gain/level controls belong to 08F; automatic per-channel live
transcription follows in 08G. The owner-facing acceptance remains the final
LIVELINK-08 matrix after those rounds.

Exact next product round: `LIVELINK-08F` — add column/layer Timeline layouts
with per-channel gain and level controls.

### LIVELINK-08F Column/layer Timeline and channel controls — 2026-09-28

The OBS Timeline now has CỘT/LAYER controls immediately before a working
MARK IN button. Columns place each source waveform, ruler, playhead and its
horizontal gain/level controls side by side in a horizontally scrolling area.
Layers share one ruler/playhead and scroll vertically; each waveform is 32 px
high, about 62% of the previous 52 px lane waveform. The OBS Timeline uses a
larger bottom workspace region so a column's controls remain visible at the
tested 720 px viewport height. Zoom steps show their actual visible span and
skip ineffective steps for short recordings. Layout and zoom switches retain
the selected channel, playhead and per-channel gain.

Gain is a 0–200% preview control applied through Web Audio to the chosen WAV
playback in Pro4Bro; browsers without Web Audio can attenuate only to 100%
and show an error if amplification is requested. The level bar uses OBS source
meter data live and unmodified MKA waveform peaks at the playback position
after Stop. Tooltips state that gain
does not alter the OBS fader or original PCM/MKA. No gain value is written to
the project, archive or OBS; controls start at 100% when a project is opened.

Verification: frontend **330 passed** across 43 test files,
TypeScript typecheck and Vite build passed, diff hygiene passed. Component
tests render 1, 2, 5 and 20 live channels in both layouts and check independent
gain, source level, Web Audio boost/cleanup, Mark In order, zoom and playhead
continuity. In the built app, the physical four-track OBS archive showed four
columns with gain/level
below each waveform at 1280×720 and 900×720. At 900 px the horizontal scroll
reached the fourth column; at 1280 px the layer viewport scrolled to the last
lane. A keyboard Home action set Channel 2 preview gain to 0%, switching to
layers kept it, and it was restored to 100%. On the real archive, the silent
Channel 1 track also started and paused with preview gain at 200%, with no
browser error; gain was restored to 100%. Physical 20-source rendering and
latency measurement remain in the final LIVELINK-08 matrix.

Exact next product round: `LIVELINK-08G` — start separate live STT queues from
durable v3 PCM for each OBS channel and emit channel-owned draft events.

### LIVELINK-08G Per-channel live STT events — 2026-09-28

The v3 PCM ingest route now offers each newly durable, nonduplicate chunk to
an automatic bounded STT queue keyed by recording and channel. Studio live
sessions are independent per utterance/channel, with source-sample start/end
and OBS-clock recording-relative seconds,
partial/final revisions, lag, error and explicit segment-level timing trust.
Events persist as project-owned JSONL and are available through a recording
transcript-events API with a global revision cursor for reconnect. Alias
changes update later event labels without changing channel/source identity.
STT failure and queue overflow report an event while PCM ACK and source
archive remain authoritative. ADR 0015 records the durable event contract.

Verification: backend **438 passed**, including two-channel partial/final,
alias, restart/torn-tail recovery, slow recognizer, queue saturation and
recognizer error tests. A real Studio `tiny` recognizer run on a 14.82-second
spoken WAV generated nine events per channel, with text in partial events and
separate final text/sample bounds for both channels; no recognizer errors.
The recognizer duplicated a phrase in this draft, confirming that it is not
final subtitle text. The development API was restarted on port 18120; OpenAPI
now lists the transcript-events route and startup completed. OBS was
disconnected and no app recording was active at restart. `git diff --check`
passed (line-ending warnings only).
The physical OBS two-speech-source, in-recording UI check remains in the
final LIVELINK-08 matrix. LIVELINK-08H must render channel-owned Script rows
and Timeline captions; those views do not yet consume this feed.

Exact next product round: `LIVELINK-08H` — render live Script rows in source
start order and put each channel's draft caption on its Timeline lane.

### LIVELINK-08H Channel-owned live Script and captions — 2026-09-28

The first voiced PCM chunk now emits a `listening` event before its recognizer
window completes. The web polls revisioned transcript events for the selected
OBS recording, merges later partial/final revisions into the same utterance
row, and orders rows by source start time. Script identifies each row by OBS
channel, keeps A's row as B begins, and lets a row select its source track and
recording-relative time. Each OBS Timeline lane shows its own caption and
utterance span in both Layer and Cột layouts. The draft UI explicitly labels
segment-level timing and does not treat a channel as a verified speaker.

Verification: frontend **335 passed** across 45 files, typecheck and build
passed; backend **438 passed**. A temporary six-event A→B→A journal on an
existing four-track OBS archive was loaded into the real app. Script displayed
three rows in start order; selecting B moved to Channel 2 at 00:02, where A
and B captions were visible simultaneously. Both Layer and Cột displayed the
source captions, gain and level. The temporary journal was removed and the
managed API/Studio restarted. This verifies rendering against an archived OBS
recording; live physical OBS speech and transcription latency remain for the
final LIVELINK-08 matrix.

Exact next product round: `LIVELINK-08I` — mark cross-channel overlap at its
source time and color only the text spoken during overlap for review.

### LIVELINK-08I Cross-channel overlap review — 2026-09-28

Script and Timeline now derive half-open intersections from the recording's
OBS monotonic seconds for distinct channel IDs. A valid source sample range
and segment timing trust are required; a shared boundary, another recording,
and same-channel utterances do not create a cross-channel marker. Multiple
simultaneous peers merge into one review interval per utterance. No inferred
word times or speaker identities are stored. While the playhead is inside an
intersection, both channels' draft text is red; B returns to normal when the
playhead reaches A's end. Script buttons and visible markers on each Timeline
lane show the exact segment interval. On a ready archive, pressing either
marker selects its source WAV, starts at the intersection, and pauses at its
end. While recording, markers still locate the span but playback requires the
archive after Stop.

Verification: frontend **343 passed** across 46 files, typecheck and build
passed; backend **438 passed** (two existing dependency deprecations). Unit
tests cover partial/full overlap, A→B→A, reversed/late revisions, boundary,
same-channel, untrusted timing, merged peers, Script color/seek, and Timeline
stem selection, playback stop, Layer/Cột layout. In the built app, a temporary
three-row A→B→A journal on an existing physical four-track OBS archive showed
00:02.00–00:05.00 markers on Channel 1 and 2. The Channel 2 Script marker
played its source WAV from 2.00 and stopped at exactly 5.00 browser seconds;
the Channel 1 Timeline marker selected and played its own WAV. The temporary
journal was deleted and managed API/Studio restarted. Channel 2's analysis WAV
remained mono PCM16, 24 kHz, 369849 frames (15.410 s); no source audio was
rewritten. `git diff --check`
passed. This verifies archive review, not live simultaneous speech, word-level
color precision, or physical end-to-end latency; those remain in final
LIVELINK-08 acceptance.

Exact next product round: `LIVELINK-08J` — update the OBS plugin dialog to an
OBS-coherent visual style and include a Pro4Bro brand asset.

### LIVELINK-08J OBS dialog styling and Pro4Bro mark — 2026-09-29

The OBS-owned Win32 Tools dialog now follows the current OBS dark/light theme:
Segoe UI typography, a P4B/Pro4Bro header, native dark title bar, compact
connection panel, bordered Audio Mixer source rows, source meters and a
primary Open App button. It
reflows and recreates fonts on `WM_DPICHANGED`, and Tab/Shift+Tab/Escape work
across visible Forward controls, aliases and the button. The GDI header mark
matches the product-owned `pro4bro-livelink.svg`. Plugin package 0.6.0 includes
the vector with the DLL and locale; standard/portable installer allowlists,
hash validation and bundle checks cover all three files. An intact older
two-file install now reports `update-available` rather than `damaged`.

Physical OBS 32.2.2 loaded the installed plugin and displayed the dialog in
both Yami Default and Yami Light without restarting to update the dialog.
Screenshots under `build/obs-plugin-ui/` capture final dark five-source, dark
one-source, and dark twenty-source layouts; the twenty-source list paged to
Channels 16–20. A light five-source screenshot verifies the alternate palette
before the final heading spacing adjustment. In a disposable twenty-source
collection, Forward changed and an edited alias persisted with a new revision.
OBS was closed after QA; its original global/user config and LiveLink channel
mapping were restored byte-for-byte, and all disposable scene collections were
moved out of OBS' scene directory into the local QA artifact folder. The
installed package reports `installed`, `pairingReady=true`, OBS build 32.2.2,
and plugin version 0.6.0.

Verification: native build/package passed; Capture portable check **5/5**;
frontend **343 passed**, typecheck and Vite build passed; backend **439 passed**
(including nine installer tests);
`git diff --check` passed with only line-ending warnings. The one attached
monitor runs at 100% DPI, so real 125%/150% DPI screenshots remain unverified.
No final audio/recording/STT integration result is claimed by this visual
round. The logo is a proposed vector brand variant for the owner's final
review.

Exact next product round: `LIVELINK-08` — run the final integrated OBS
recording, waveform, transcription, overlap, timing and portable acceptance
matrix, including any available 125%/150% DPI environment.

### UX-01 Owner-requested workspace chrome and logo — 2026-09-29

Voice Training and Voice Changer now open directly onto their modules, matching
the existing compact pages. Media Pool right-click actions are ordered as
vertical menu rows, with Remove separated at the end. The supplied
`logo_v2.png` is copied byte-for-byte into the web public assets and displayed
in the hub, workspace bar, boot/runtime screens, and favicon. A 128-pixel
derivative is embedded as a bitmap resource in the native OBS dialog DLL; the
header draws it clipped to its circular mark. The packaged plugin is 0.6.1.
The logo preference was also saved in OpenViking for future Pro4Bro projects.

Verification: frontend **345 passed** across 46 files, typecheck and Vite
build passed; backend **439 passed** (two existing deprecations); native OBS
build and package passed with version 0.6.1. Tests cover the two compact pages,
logo path, and ordered context actions. This round does not claim a physical
OBS or browser screenshot for the new mark; the installed plugin still needs
its package updated before it displays the new DLL.

Still missing: Shift/Ctrl/Ctrl+A selection, batch edit/remove on all list
surfaces, and the repeatedly loading PCM waveform. These need state/action
contracts and a waveform lifecycle diagnosis; a visual-only change cannot
prove either behavior. UX-02 and UX-03 carry selection, UX-04 carries the
waveform; LIVELINK-08 physical acceptance also remains open.

Exact next owner-requested round: `UX-02` — implement shared selection
semantics and Media Pool batch actions, including range, toggle, select all,
right-click target preservation, and verified remove/edit behavior.

### UX-02 Media Pool multi-selection and batch actions — 2026-09-29

Media Pool now keeps a list selection separate from the opened footage and from
the STT/TRAIN checkboxes. Plain click selects one, Shift selects a range,
Ctrl/Cmd toggles individual rows, Ctrl/Cmd+Shift extends a range, and Ctrl/Cmd+A
selects the live rows while focus is in the Media Pool list. Recycled footage
is excluded and IDs removed by a refresh are pruned. Right-click preserves a
selection when the clicked footage belongs to it; otherwise it targets that
single footage. A selected count and distinct row highlight make the action
scope visible.

For multiple selected footage, the menu applies emotion, Speaker Profile,
Environment Profile, enabled state, STT/TRAIN flags, and Remove to the eligible
batch. Existing annotations on each file are preserved when changing one tag.
The project API is called once per asset; a partial failure reports the count
and failed IDs without claiming the whole batch succeeded. Remove moves the
selected live assets into Recycle Bin. Single-file permanent delete still
requires its prior confirmation. Single-file preview and Script/Timeline
editing continue to use the opened footage only.

Verification: selection and Media Pool interaction tests cover range/toggle,
select all, right-click scope, batch tag/disable/STT/TRAIN/remove, and
eligibility. A WorkspaceShell test exercises multi-asset recycle through the
project API. Frontend **352 passed** across 47 files, typecheck and Vite build
passed; backend **439 passed** with two existing dependency deprecations.
`git diff --check` found no whitespace errors. Physical browser interaction
was not exercised in this round.

Still missing: Sound Library, Voice Output, Script rows and other lists need
the shared selection behavior and their own safe batch actions. UX-04 still
owns the repeated PCM waveform loading issue.

Exact next owner-requested round: `UX-03` — extend selection and appropriate
bulk actions to Sound Library, Voice Output, Script rows and remaining lists.

### UX-03 + UX-04 Multi-list actions and PCM waveform stability — 2026-09-29

Selection and scoped bulk actions now cover Voice Output, Sound Library speaker
and environment profiles and nested voices, Voice Script rows, diarized Script
rows, Project Hub entries, Speaker Isolation labels, Training History runs and
adapters, authored training passages, and Media Pool Recycle Bin items. The
actions appropriate to each list include grouped delete or catalog removal,
speaker reassignment, profile color changes, and bin restore. Opened/previewed
items stay distinct from selected items. Destructive groups use one
confirmation; project operations report partial failures rather than claiming
the whole selection succeeded. The shared Shift range, Ctrl/Cmd toggle and
Ctrl/Cmd+A behavior is scoped to the relevant list.

The PCM viewport fix records the density requested from the API. Its response
can contain fewer points because the server groups samples into whole blocks;
comparing only the returned point count made a settled window look too sparse
and triggered another fetch on each render. A covered window now reuses its
envelope, while a genuinely new viewport still requests peaks. The loading
overlay appears only when that window has no envelope to show.

Verification: frontend **369 passed** across 48 files; `npm run typecheck`
and `npm run build` passed. Backend **439 passed** with two existing dependency
deprecations. `git diff --check` passed with line-ending warnings only. Tests
exercise list selection and batch targets, one confirmation for grouped
deletion, partial-failure behavior, Recycle Bin restore, a settled PCM viewport
without repeated requests, and a newly panned viewport with a fresh request.

Remaining gap: the OBS capture session track list has SRT checkboxes, but its
per-track Final STT action still lacks modifier selection and a batch command.
Modifier and waveform behavior also need a physical run in the browser with a
real audio file; component tests do not prove visual stability during playback.
The final `LIVELINK-08` OBS integration and owner acceptance remain separate
open gates.

Exact next owner-requested round: `UX-05` — complete OBS session track batch
selection/actions and run a physical browser sweep of the editable lists and
PCM waveform with real media.

### UX-05 Recycle Bin, Script LiveLink, and remaining editable lists — 2026-09-29

The Recycle Bin now offers Delete for selected footage, a symbol-only Empty
Recycle Bin control, and Restore/Delete actions scoped to the selected rows on
right-click. One confirmation covers a permanent-delete batch. Completed IDs
leave the UI, failures remain visible and are reported. In-flight Media Pool
list responses started before a successful permanent delete can no longer
reinsert its footage. A reopened project test confirms the media index also
keeps permanently removed footage absent on disk.

OBS LiveLink no longer replaces Script with the small live-only module. Its
channel transcript is embedded above the original Script editor, preserving
the text tools, actions, and existing footage text. The list audit also found
that Sound Library's bulk callbacks were implemented but not passed through
its registry entry; they are now wired. Voice Changer recordings have a
modifier-selectable management list and one grouped delete confirmation.
Imported OBS session tracks support Shift/Ctrl/Ctrl+A through their existing
selection checkboxes and can queue Final STT for all selected tracks at once.

Verification: frontend **378 passed** across 49 files, typecheck and Vite
build passed; backend **440 passed** with two existing dependency warnings.
Tests cover batch Delete/Empty/right-click scope, one confirmation, stale list
responses after deletion, persistent removal after reopening, original Script
controls alongside the LiveLink feed, grouped Sound Library callbacks, Voice
Changer recording deletion, and OBS track batch STT. `git diff --check`
passed with line-ending warnings only.

Remaining gap: physical browser interaction against real project media and an
OBS recording has not been run in this round. That matters for verifying
layout, actual modifier keys, and the reported PCM waveform behavior in the
running app. Final `LIVELINK-08` integrated OBS acceptance also remains open.

Exact next owner-requested round: `UX-05B` — run the physical UI sweep for
Recycle Bin, Script LiveLink, Voice Changer/OBS lists, and PCM waveform with
real media, then repair any observed runtime discrepancy.

### UX-06 OBS Stop boundary and per-channel Timeline — 2026-09-29

The owner's clarified Stop policy preserves separate app and OBS recording
state: OBS Stop ends app capture when Ignore Stop is off; Ignore Stop keeps app
capture active; app Stop always ends app capture. The native plugin now clips
the final PCM packet to the applied Stop timestamp and cannot combine later
packets into an earlier batch. The API rejects any chunk whose duration crosses
the stopped recording boundary. Live STT drains only accepted recorded PCM,
closes its queue once, rejects late offers, and closes even when archive creation
fails. A failed archive is left in the project journal for explicit Retry;
the plugin no longer loops indefinitely on an HTTP finalization error. The
recorder shows `Đang dừng…` while awaiting the plugin ACK and discards stale
status polls around app actions.

Each OBS layer now occupies 60% of the Timeline viewport, with its own tall
waveform, subtitle, vertical Gain and vertical Level columns. Column mode keeps
the same four parts, places Gain and Level on one equally split row below the
waveform/subtitle, and provides an independent width slider per channel.

Verification: frontend **381 passed** across 49 files, typecheck and Vite
build passed; backend **441 passed** with two existing dependency warnings;
native OBS plugin 0.6.2 built and packaged successfully. Regression tests cover
the Stop-pending UI, stale poll suppression, one-time STT tail drain and late-offer rejection, backend
PCM boundary rejection, and independent Timeline column widths. Existing
reducer tests cover OBS Stop with and without Ignore Stop.

Remaining gap: the rebuilt plugin has not been installed into a live OBS
process or exercised with simultaneous real channels in this round. CSS layout
also needs a physical browser inspection at multiple workspace sizes. These
checks matter because timing and actual viewport sizing cannot be established
by component tests or compilation alone.

Exact next owner-requested round: `UX-06B` — test the three Stop paths and
live STT tail with real OBS, inspect layer/column layouts at multiple sizes,
then repair any observed discrepancy. `UX-05B` remains queued for the earlier
Recycle Bin and list sweep.

### UX-07 One recording-wide OBS Timeline and integrated Script — 2026-09-29

The owner clarified that simultaneous OBS channels are different signals of
one recording. Live draft rows now occupy the Script module's primary content
area, with a control to switch between the draft and original editable Script;
its existing text tools remain in the same module. The OBS Timeline retains
one shared playhead, ruler and transport scrub, one zoom control, and the
original Mark In/Out → Cut → Delete, Uncut, and Reset workflow. Seeking on a
channel waveform, its ruler, or the transport updates every channel's playhead.
Cut overlays show on every waveform. An atomic batch API stores the same
removed ranges on every archived stem while preserving individual gain
keyframes and source media. An edit failure leaves the staged cut visible.

Layer layout puts the channel label above vertical Gain/Level at the left of
each 60%-height lane. Column layout puts `Channel - source` and Gain/Level
above the waveform, distributes unresized columns equally, and keeps each
user-adjusted width when switching views. There is no per-channel zoom.
ADR 0015 records the recording-wide edit axis and storage decision.

Verification: frontend **382 passed** across 49 files, typecheck and Vite
build passed; backend **443 passed** with two existing dependency warnings;
`git diff --check` passed. Tests cover Script's single content area and mode
switch, shared marks/cut/delete/uncut and synced waveform/ruler/transport
seeking, column width behavior, and all-or-nothing API persistence. The
new OBS batch API is covered through FastAPI TestClient and disk reopen.

Remaining gap: no physical OBS session or browser viewport with simultaneous
real channels was available in this round. Visual sizing and actual audio
timing still need a real run; tests establish state transitions and stored
cuts, not final perceptual quality.

Exact next owner-requested round: `UX-07B` — run a real multi-channel OBS
recording, verify Script and Timeline layouts at several widths, seek/zoom
sync and recording-wide cuts after reopen, then repair observed discrepancies.
The earlier `UX-05B` Recycle Bin/list sweep remains queued.
`UX-06B` Stop/Ignore Stop acceptance with the installed OBS plugin also
remains queued.

### UX-08 One OBS recording as one MKA footage — 2026-09-29

Each completed LiveLink session now produces one visible Media Pool footage:
the verified multitrack MKA. The per-channel analysis WAV records stay in the
project for STT and training but are hidden from the footage list. The media
index persists recording ID, parent ID, stream index, and track UID; older
indexes recover those links once from `recording.json`. Selecting a footage
opens the corresponding recording-wide Timeline and Script feed. Recycling,
restoring, and permanently deleting that footage update its channel assets
together. ADR 0016 records the aggregate boundary.

Verification: frontend **384 passed** across 49 files, typecheck and Vite
build passed; backend **445 passed** with two existing dependency warnings;
`git diff --check` passed. Tests cover two distinct recording parents, two
channels per parent, persisted and legacy relationships after reopen,
group recycle/restore/delete, and routing a selected MKA to the OBS view.
The existing FFmpeg archive test also confirms parent and child relationships
survive a copied project.

Remaining gap: no new physical OBS two-take run was available for this round.
The real Media Pool appearance, channel playback, and per-recording Script
contents need an end-to-end check after reopen.

Exact next owner-requested round: `UX-08B` — record twice with multiple OBS
channels, reopen each Media Pool footage, verify its MKA channels and Script,
then exercise Recycle/Restore/Delete on one footage while the other remains.

### UX-09 Consistent Timeline controls and column-edge resizing — 2026-09-29

OBS LiveLink Timeline now places Column/Layer immediately before Mark In in
the same header row as the edit controls. The separate layout row is removed.
Zoom uses the normal Timeline's control order and width. Transport uses its
play button, full timecode format, scrub placement, and playback-rate position;
OBS track/window actions remain at the right. Layer Gain/Level labels run
vertically at the left of full-height controls. Column width sliders are gone;
each column has a draggable edge with arrow/Home/End keyboard adjustment.
The adjusted width survives switching between Layer and Column.

Verification: frontend **384 passed** across 49 files, typecheck, Vite build,
and `git diff --check` passed. Component tests assert control order and shared
classes, column-edge pointer and keyboard resizing, width retention, zoom,
timecode, gain, and shared seek/cut behavior. Backend code was untouched.

Remaining gap: the browser DevTools test surface was unavailable and no
running OBS session was attached. Unit tests cannot establish final visual
spacing, meter height, or resize hit targets at the owner's display scale.

Exact next owner-requested round: `UX-09B` — compare normal and OBS modes in
the running app at the same viewport/DPI, test Layer and Column with real
channels, and repair any clipping or pointer-hit discrepancy. `UX-08B`
two-take footage acceptance remains queued.

### UX-10 OBS channel readability and status — 2026-09-29

Column and Layer headers now show `Channel - source` on one line at 16px
(scaled with the app font setting), truncating inside the available label
space. Column-edge resize keeps the 240px minimum. Layer rows use a measured
60% of the Timeline viewport as their height, while their common track grows
with every channel; the shared playhead therefore spans the full set of rows.
The Timeline selector is labeled `BẢN GHI` and explains that one OBS take is
one footage with its channels and Script. The app's OBS mixer and recorder
channel lists no longer create their own nested scroll area. Every recorder
row begins with a REC indicator; it turns red and blinks only while that
channel is receiving during app recording. A paused channel shows PAUSE with
a two-bar symbol.

Verification: frontend **384 passed** across 49 files, focused Timeline and
Recorder tests **34 passed**, typecheck and Vite build passed, and
`git diff --check` passed. The component tests cover inline names, 240px
minimum resize, selector wording, and persistent REC/PAUSE state evidence.
Backend and native plugin behavior were not changed in this round.

Remaining gap: browser rendering at the owner's viewport and a real OBS
multi-channel pause/record cycle still need a visual check. The tests do not
measure actual glyph truncation, scrollbar appearance, or playhead pixel
height in the running app.

Exact next owner-requested round: `UX-10B` — inspect six or more live OBS
channels at the owner's display scale, resize a Column to 240px, verify the
Layer playhead reaches the last channel, and verify REC/PAUSE and the single
outer scroll during recording and pause. `UX-08B` two-take footage acceptance
remains queued.

### UX-11 Named OBS recordings and smaller channel labels — 2026-09-29

The Timeline `BẢN GHI` selector now labels each OBS capture as
`yyyy-mm-dd_hh-mm-ss_project-name`, using the recording's start timestamp in
local time and the current project's name with spaces/punctuation converted
to hyphens. The active recording has an option even before its journal entry
appears; old records without a valid start time fall back to their short ID.
The selector is wider and exposes the complete name as a tooltip. Channel
labels in both Column and Layer views are now 11.2px, exactly 70% of the
previous 16px size, while retaining truncation at narrow widths. This changes
the displayed name; the stable recording ID and project-owned MKA path still
identify the media.

Verification: frontend **385 passed** across 49 files, focused Timeline,
Registry, and Workspace tests **29 passed**, typecheck and Vite build passed,
and `git diff --check` passed. A component test checks two distinct local
timestamps, the project-name suffix, and the selected option title.

Remaining gap: final truncation and control spacing at the owner's viewport
still need a browser check. No real OBS recording was available in this round.

Exact next owner-requested round: `UX-11B` — inspect the selector and 11.2px
channel labels with multiple recordings and channels at the owner's viewport;
adjust only observed readability or clipping issues. `UX-08B` two-take
footage acceptance remains queued.

### LIVELINK-08K Missing PCM diagnosis — 2026-09-29

The owner's `Test OBS 2` recording `e99416d0-e0ee-4a6d-9cd0-06ee5e0b096c`
has 25 transport gaps (13.55 s) in Channel 1 and 23 (10.56 s) in Channel 2.
Its archived per-channel chunk sequences are contiguous, and the recording
contains no capture pause. All 208 accepted PCM PUTs returned 200. One initial
Channel 2 sequence-0 request returned 409 and its retry returned 200 in the
same second. The silent regions are therefore missing before the plugin
assigns a chunk sequence; the MKA correctly reflects missing source PCM.

The strongest cause is sender backlog overflowing the plugin's two-second
per-source queue. The native callback advances the source sample index before
`try_lock` and the queue limit; both paths can discard PCM before `take()`
assigns a sequence. The sender performs synchronous HTTP calls for PCM,
heartbeat, and commands in one loop. A good two-channel recording
`490d9f85-8e9f-5321-86dd-2eaad9984afc` has zero gaps, about 0.55 s
median capture-to-receive lag and about 0.6 s median chunk size. The affected
recording rises from about 0.8 s lag in its first 20 s to about 1.8–1.9 s
in the heavily gapped 20–60 s interval; its median chunk size reaches the
one-second batch limit. A four-channel recording has 118 gaps. These are
consistent with backlog and queue eviction, but the current plugin logs no
drop reason or queue depth, so the exact split between overflow and callback
lock failure cannot be measured retrospectively. Synchronous disk/fsync and
waveform work in the API's async PCM route may lengthen sender waits; its
share of the delay is also unmeasured.

Verification was read-only: compare five immutable recording journals and
their PCM chunk metadata, check affected API PUT statuses, and trace native
callback, queue, sender, and API paths. A red/green journal check fails for
the affected recording (48 transport gaps) and passes for the healthy
two-channel control (zero). No product or stored media was changed.

Remaining gap: no plugin queue/drop telemetry exists for this historical
take, and no new physical OBS capture was run. Its missing source PCM cannot
be recovered from the completed MKA. `LiveLinkCapture::take()` also combines
packets without checking adjacent sample indices, so losses inside one batch
may be hidden from the journal.

Exact next round: `LIVELINK-08L` — add per-reason drop/backlog evidence,
remove real-time PCM loss under stalled HTTP, enforce sample continuity in
batched chunks, move blocking API PCM persistence off the event loop, then
verify two and four simultaneous OBS channels with an intentionally slowed
API and inspect the resulting MKA for zero source-sample gaps.

### LIVELINK-08L PCM capture resilience — 2026-09-29

The v3 native callback now waits for the short queue mutex instead of
discarding a packet on `try_lock` failure. Track detach and callback removal
run outside that mutex, with a separate lifecycle lock, so waiting callbacks
cannot deadlock OBS source removal. A recording keeps up to 120 seconds per
source and 512 MiB per connection; idle preroll keeps 10 seconds. Any overflow
past those explicit safety limits increments a per-channel lost-frame counter
and emits an OBS error log with recording/channel identity, backlog and peak
depth. Callback lock waits above 5 ms are logged separately. The sender skips
its 100 ms sleep and command long poll while PCM is pending. Batching stops
at a sample-index discontinuity, leaving the next chunk's true index visible
to the API and archive gap catalog.

The API now runs durable PCM persistence and live waveform work in a worker
thread rather than blocking the FastAPI event loop. A regression test first
failed with a 0.52 s health-response delay during a 0.5 s PCM write; after
the change it passed below 0.35 s. A compiled native stress test queues
eight seconds of four stereo channels without sending, drains all 32 exact
one-second chunks without loss, verifies a deliberate sample-index jump is
split between chunks, and verifies callback mutex contention preserves PCM.

Verification: backend suite **446 passed**, native capture stress executable
passed, OBS plugin 0.6.3 built and packaged, and `git diff --check` passed.
The installed OBS process was already running with its older DLL, so no new
live capture or MKA was produced in this round.

Remaining gap: 120 seconds and 512 MiB are finite safety limits. A sustained
API outage or more concurrent channels can still exhaust them; overflow is
now explicit, not lossless. The physical two/four-channel OBS matrix and an
intentionally slowed API remain unverified. This matters because native unit
tests cannot prove the installed plugin's throughput or archive timing.

Exact next round: `LIVELINK-08M` — install/reload plugin 0.6.3 after OBS is
idle, record two and four forwarded channels with an intentionally slowed
local API, inspect the new MKA and chunk catalog for zero transport gaps,
and decide from measured backlog whether a disk-backed spool is required for
longer outages.

### LIVELINK-08M Physical capture and durable PCM outbox — 2026-09-29

OBS was restarted with plugin 0.6.3. Physical recordings in `Test OBS 2`
produced a ready two-track MKA (`207f182f-a35d-44fc-85b3-e39cac1b56a7`,
32 PCM chunks per channel) and a ready four-track MKA
(`db3dd240-8986-49a7-bc7b-d65318782a21`, 16 chunks per channel). Both
have zero source-sample gaps. Suspending the local API for five seconds during
a two-channel capture left ten chunks on the SQLite disk outbox; after resume,
`880479af-b16a-437e-9686-8f41066882c9` archived with zero gaps and an
empty outbox. A four-channel stall likewise retained pending PCM but exposed
a Stop-tail rejection: one 0.6.4 chunk crossed the Stop boundary by 245 frames.
Plugin 0.6.6 trims pending PCM at the exact Stop boundary and reattaches a
stopped project journal after an OBS process restart. The previously stuck
four-channel recording `adb81fad-2678-4543-b891-2dc88cd016dc` then replayed
the clipped chunk, emptied the outbox and finalized as a four-FLAC-track MKA
with zero source-sample gaps. Its original rejected chunk was preserved until
that successful replay.

The v3 plugin worker now writes captured PCM to a machine-local SQLite WAL
database with `synchronous=FULL` before HTTP upload, deletes only after API
acceptance, and recovers pending stopped recordings from project journals.
The audio callback performs no database I/O. Native spool and capture tests,
16 focused backend tests, 448 backend regression tests, plugin 0.6.6
build/package and physical replay pass.
The old in-memory safety limit remains if SQLite cannot accept data, and disk
exhaustion has no automatic recovery UI. The outbox is machine-local; moving a
project to another machine while its recording has pending chunks requires
first draining this host's outbox.

OBS MKV was probed while recording: FFprobe saw an HEVC video stream and six
AAC stereo mix tracks; FFmpeg decoded three seconds of committed audio before
OBS stopped. The growing tail reported premature EOF, so readers must expect
an incomplete live file and retry as it grows. OBS mix tracks are limited and
do not prove one-to-one capture of every forwarded source. MKV can help verify
or recover configured OBS mixes, but cannot be the canonical per-source take:
Ignore Stop can continue app recording after OBS closes its MKV. See
`docs/adr/0017-obs-livelink-durable-pcm-spool.md`.

Exact next round: `LIVELINK-08N` — expose disk-outbox health and retained
invalid chunks in the app, add a safe recovery/export action for a full disk,
and run a longer high-channel-count physical outage test.

### MEDIA-MULTITRACK-01 Completed-file import foundation — 2026-09-29

The import processor previously mapped only `0:a:0`. It now probes all audio
streams in a completed MKV, MOV, or MP4 and retains one original video footage
plus one 24 kHz mono analysis WAV asset per audio stream in a single FFmpeg
read of the source file. Each child records
its absolute container stream index and parent ID; a project-relative
`audio-tracks.json` records title, codec, source sample rate/channel count,
language, and analysis path. Media Pool displays the track count, selecting
STT/TRAIN on the footage targets its children, and Recycle/Restore/permanent
Delete apply to the whole group. A machine-local original locator and Local
File Cache refresh preserve the existing portability contract. The first
track remains the parent preview until the shared multitrack Timeline exists.

Generated one-second MKV, MOV and MP4 fixtures with two different AAC audio
streams were imported through native-path and browser-upload paths. Each
produced two distinct analysis WAVs with stream indices 1 and 2; the native
path also passed cache refresh and grouped deletion. Verification: 451
backend tests, 385 frontend tests, TypeScript typecheck and Vite build passed.
This round does **not** claim a multitrack Timeline or live MKV read.
One audio stream with a multichannel layout remains one track/instance, as in
the OBS source model; tracks are not assumed to be isolated microphones.

Feasibility: Matroska clusters and FFmpeg can expose committed audio while
the writer is still running, as the LIVELINK-08M physical probe demonstrated.
The growing tail may be incomplete, and a fresh FFmpeg process reaching EOF
does not by itself guarantee continuous following. A production follower must
checkpoint source identity, complete packet/cluster position and per-track
timestamp/sample progress, retry incomplete tails, detect truncation or file
replacement, and compare the final read against the closed MKV. Browser file
upload is a fixed snapshot; live follow requires a local file locator. The
configurable per-track final STT queue must only consume durable, nonduplicate
segments and finish the post-Stop tail. ADR 0018 records these boundaries.

### MEDIA-MULTITRACK-02 Imported channel Timeline and Script — 2026-09-29

Selecting a completed MKV/MOV/MP4 parent now opens all imported audio streams
as Timeline instances. Layer and Column views share one time axis, playhead,
scrub, zoom and Mark In/Out/Cut/Delete/Uncut/Reset. A batch cut writes the same
ranges to every child asset. Playback starts the track audio elements together
and corrects drift against the first channel; each channel has its own preview
gain and source level. Script lists every channel and its transcript, opens the
selected channel in the full editor, and saves edits and word annotations to
that child. Recycle state prevents persistent edits. The completed-file import
and OBS LiveLink paths remain separate.

Frontend regression tests cover import routing, channel selection, Script save,
shared cut, layout controls and waveform loading. Typecheck, frontend test
suite and production build pass. Owner viewport review with a representative
multitrack file remains open; this round does not follow a growing MKV.

Exact next round: `MKV-FOLLOW-01` — follow a growing local MKV into durable,
nonduplicate per-track audio chunks with source identity, committed-byte
cursor, restart recovery and final-file reconciliation.

### MKV-FOLLOW-01 Growing local MKV follower — 2026-09-29

The native-path follower now parses EBML boundaries and consumes only complete
Matroska Clusters. A project-owned checkpoint records source identity, last
Cluster hash, committed byte cursor, per-track frame counts and gap evidence.
Each selected container audio stream has durable PCM chunk WAVs and a live
analysis WAV under one Media Pool footage. The API polls active followers
automatically, resumes unfinished checkpoints after API restart, and exposes
start/status/poll/finish endpoints. Polling a partial tail does not advance
the cursor; recovery truncates uncheckpointed bytes before retry. Source
truncation or replacement fails instead of silently joining another take.

Live per-Cluster decoding is provisional because AAC/other stateful codec
boundaries can differ from uninterrupted decoding. Explicit Finish after the
writer stops copies the complete MKV into the project and re-decodes each
selected track from that closed source, publishing those final WAVs. It does
not infer Stop from temporary EOF. Generated two-track AAC MKV tests cover
partial Clusters, repeated polls, reader restart/orphan WAV recovery, source
truncation, automatic API polling, one-track selection, and final footage
paths. Backend suite: 456 passed. Real OBS growing-file capture and the owner
viewport are still unverified; live/final STT and the right-click channel
selection menu are separate rounds.

Exact next round: `MKV-CHANNEL-01` — add Media Pool right-click checkboxes for
each channel's Import and Live Transcribe/STT selection, persist those choices,
and pass selected stream indices into the MKV follower. `MKV-STT-01` then
consumes the selected tracks through Stop.

### MKV-CHANNEL-01 Per-track Import and STT selection — 2026-09-29

The native file picker now inspects MKV/MOV/MP4 audio streams before creating
a multitrack footage. Media Pool shows a pending item whose right-click menu
has separate Import and STT checkboxes for each stream. The confirmed stream
indices go to completed-file import or the growing-MKV follower; only selected
streams are decoded. Parent footage and its track manifest retain all probed
streams, including omitted ones, while each imported track retains its STT
selection. The footage right-click menu shows the persisted choices and can
change STT selection. A one-track MKV keeps its STT selection on the footage.

Generated-media API tests verify selective import/follow and saved selection.
The full backend suite passes (456 tests), as do frontend tests (394 tests),
typecheck, production build and diff whitespace check. Owner viewport review
with a real OBS recording remains open. The checkboxes persist STT intent;
they do not start a live STT worker in this round. Browser upload still takes
a fixed file snapshot and does not expose the native-path track picker.

Exact next round: `MKV-STT-01` — consume durable per-track audio for live
transcription, offer a user-selected final segment length (default 60 seconds),
and drain every selected track's backlog through the final MKV after Stop.

### MKV-STT-01 Live preview and final segmented STT — 2026-09-29

A worker separate from the MKV reader now transcribes selected tracks from
checkpointed analysis WAV frames. It saves short live preview segments and
text using the tiny model while the MKV grows. The Media Pool follow dialog
lets the user set the detailed STT segment length from 10 to 600 seconds
(default 60). Explicit Finish switches detailed STT to the continuously
decoded final WAV; it processes from frame zero and drains a shorter final
segment. Per-track result files are durable before advancing STT cursors, so
API restart can reuse a saved result without sending it to the model twice.
The API resumes unfinished workers, exposes STT progress/errors with follow
status, and the workspace refreshes the selected channel's Script during
capture. User edits to Script remain visible; detailed STT is saved as a
revision for comparison.

Generated two-track AAC and twelve-second MKV tests cover live preview,
segment boundary and final tail, restart with cursor rollback, and Script
edit preservation. Backend suite: 459 passed. Frontend suite: 395 passed;
typecheck, production build and diff whitespace check pass. The real OBS
writer and STT engine were not available for an end-to-end run in this round;
an attempted request to the local Studio service timed out. Live preview
throughput with many selected tracks remains to be measured on real hardware.

Exact next round: `MKV-ACCEPT-01` — test a real growing OBS MKV with several
selected tracks and the actual Studio models; compare saved PCM duration,
segment coverage, Script timing, Stop-tail completion and UI responsiveness.

### MKV-ACCEPT-01 Segmented STT during an active MKV write — 2026-09-30

The detailed STT worker now runs on each selected track while the MKV is still
growing. Pressing STT on a followed footage opens a minutes-and-seconds dialog
(10–600 seconds, default 60); completed intervals are recognized from the
start of each track, saved by source frame range, and joined into Script with
word timestamps offset to the original timeline. The quick three-second
preview continues ahead of detailed results. Finish drains the shorter last
interval from the final decoded WAV. A saved segment result is reused after a
worker restart, and a user-edited Script remains in review with the detailed
result retained as a revision. The main STT action targets the selected
growing footage when several are present.

Generated two-track AAC tests cover detailed text and word positions before
Finish, restart idempotency, final-tail joining, user-edit preservation, and a
real FFmpeg process writing the MKV concurrently with the follower and STT
worker. This is a simulated source and recognizer: the local OBS process and
Studio model were unavailable for the physical acceptance run. The real OBS
capture, actual-model word quality, sustained multi-track throughput, and
viewport responsiveness remain the next acceptance gate.

Exact next round: `MKV-ACCEPT-02` — capture a real OBS growing MKV with several
selected tracks, run the installed Studio models, and compare source duration,
PCM/segment coverage, word timing, Stop-tail completion, and UI responsiveness.

### MEDIA-STAGES-01 Media Pool workflow selections — 2026-09-30

The Media Pool now shows Import, STT, Speaker Diarization and Train on each
footage and each materialized child track. An expander shows the tracks under
their footage. A parent checkbox is checked if all children agree, indeterminate
if only some are selected, and clicking it applies the stage to all children.
Import and Speaker Diarization choices persist through project API endpoints;
existing STT and Train choices remain persisted. An unchecked Import choice
excludes that existing asset from STT, diarization and dataset compilation
without deleting its source media. The STT action queues the selected imported
assets, the diarization action queues eligible selected assets, and the Train
dataset compiler uses selected imported assets. A compact notice before
diarization explains that single-speaker footage wastes resources. The extra
imported-channel list above the Script editor is removed; its track choice is
available in Media Pool. The pre-import native track picker remains separate.

The API persistence test, Media Pool tri-state/component tests and focused
Speaker notice/Script tests pass. The full frontend suite passed 399 tests on
rerun, frontend typecheck and production build passed, and the backend suite
passed 463 tests. One existing Timeline test failed intermittently on the first
full frontend run but passed both by itself and on the complete rerun; no
Timeline code was changed for this round. `git diff --check` passed. A real
viewport check is still open. Previously omitted source tracks have no
analysis asset to toggle; their import checkboxes in the old context menu are
still read-only. The Import checkbox added here gates processing of an already
materialized asset; it does not decode an omitted stream.

Exact next round: `MEDIA-STAGES-02` — use the saved source track manifest to
decode and register a previously omitted channel on demand, then make Import
selection correspond to actual track presence and verify it on a real MKV.

### MEDIA-VIEW-01 Import visibility and long-footage Timeline — 2026-09-30

Unchecking Import withdraws an existing footage or child track from working
modules. The Media Pool retains its row and source data so Import can be ticked
again. If the open channel is withdrawn, Script moves to another imported
channel; if no channel remains, the workspace closes the footage. Archived OBS
channel lanes also honor the saved Import selection. Training and queued STT
already gate on it at the service boundary from MEDIA-STAGES-01; the growing
MKV transcription worker now checks it on each processing pass, pausing a
withdrawn track until Import is ticked again.

The imported multitrack Timeline now uses a continuous zoom range. Its left
edge fits the entire file, however long; its right edge maps 0.01 seconds to
10 pixels of the measured waveform width. When a close view would stretch a
sparse full-file overview, it requests the API's cached PCM peaks for the
visible interval and draws a connected, filled envelope. This changes only
visualization, not source audio or timing.

Regression tests reproduce all three reported symptoms and cover withdrawal,
re-addition, shared zoom bounds and detailed peak rendering. A physical
viewport review with the owner's long footage remains open. An omitted source
stream that was never decoded still cannot be checked back in; its source
manifest is retained for MEDIA-STAGES-02.

Exact next round: `MEDIA-STAGES-02` — decode a previously omitted MKV/MOV/MP4
stream on demand from the retained original and make its Import box active in
Media Pool, then verify a real multitrack footage end to end.

### MEDIA-VIEW-02 Single-line Timeline channel labels — 2026-09-30

Imported multitrack labels now put Channel and Track on one line in both Layer
and Column views. The same label component also handles OBS LiveLink channel
and source names. It measures the available width, stays still when the text
fits, and repeats a right-to-left loop only when clipped. Hover or keyboard
focus pauses the loop; reduced-motion preference disables it while the full
name remains available as a title. This does not change channel selection,
waveform layout or gain/level controls.

Regression coverage checks one-line content, clipped scrolling, widened
static text and both imported Timeline layouts. Physical inspection at the
owner's column width and DPI remains open.

Exact next round: `MEDIA-VIEW-02B` — inspect Layer and the narrowest Column in
the running app, including text motion, hover/focus pause and reduced motion.

### MKV-FOLLOW-02 Active OBS MKV import visibility — 2026-09-30

The owner used the main IMPORT file input on a still-growing OBS MKV. That
path uploaded a browser snapshot and offered no follow action, so a large
recording did not appear as a live footage. The import dialog now offers a
prominent growing-MKV action, explains why it must reopen the same file using
the native local-file picker, and keeps completed-file import explicit. The
pending Media Pool row now says to click it to select tracks and follow.

The follower previously decoded every existing Cluster inside `start`, which
held the API response until a long backlog completed. `start` now scans only
the first committed Cluster for track discovery, registers the footage and
returns before decoding. The background watcher processes at most eight
Clusters per pass, publishing incremental PCM while preserving checkpoints.
On an OBS MKV that was growing in the owner's recording folder, registration
against a temporary project took 0.17 seconds; one real Cluster decoded two
selected audio tracks in 0.55 seconds. The source was only read and the
temporary project was discarded.

Frontend and backend regression tests cover the visible follow route, fast
registration, limited scanning and existing follow recovery. Full-session
throughput for an hours-long recording with all six tracks has not yet been
measured; per-Cluster FFmpeg process startup may leave the watcher behind the
OBS writer even though the footage now appears promptly.

Exact next round: `MKV-FOLLOW-03` — measure backlog rate on a long six-track
OBS MKV, then batch Cluster decode or otherwise reduce per-Cluster process
startup while preserving cursor, timing and final re-decode invariants.

### MEDIA-OPEN-01 Footage selection and long-recording render containment — 2026-09-30

Media Pool now clears the open footage when its blank list area is clicked.
Script, Timeline take, OBS recording feed, and word selection all clear together.
Reloading the workspace leaves footage unselected rather than opening the
first asset automatically. A newly opened standard or imported multitrack
Timeline starts zoomed to the entire duration. Imported multitrack audio
elements use `preload="none"` so opening six long analysis WAVs for visual
inspection does not eagerly load their audio into the browser. Per-module
render boundaries keep a failing Script/Timeline view from blanking the entire
workspace; they show the error and allow the footage to be closed or retried.

The owner's `test-obs-3` project contains a 9276.633-second imported MKV with
six analysis WAVs of about 424.6 MB each. Its existing cached overview has
7200 points across the full duration. This is a plausible memory-pressure
trigger, but no browser crash was reproduced without the exact failing asset
and runtime console trace. Frontend tests pass 412/412, typecheck and Vite
build pass. A live browser check of that recording remains open.

Exact next round: `MEDIA-SCRIPT-01` — selecting a parent shows imported channel
transcripts in time order, selecting a child shows only that channel, and live
OBS rows coalesce adjacent speech from one channel while diarization refines
speaker turns. Verify against the owner's failing recording and capture its
console error if the render boundary reports one.

### MEDIA-SCRIPT-01 Parent/child Script and speech turns — 2026-09-30

Selecting a multitrack parent now keeps that footage open and renders imported
channel transcript turns ordered by timestamp. A channel click shows its own
editable Script and one waveform; returning to the parent restores all lanes.
Timeline cut/mark operations still retain the full set of channel IDs. Word
speaker labels split parent rows when diarization identifies a new speaker.
OBS live transcript events from adjacent same-channel speech coalesce for
display, while intervening channels and long pauses split rows. Event storage
and per-utterance seek data remain intact. Frontend tests: 415 passing;
typecheck and build passing. The owner recording `test-obs-3` was inspected:
six imported analysis tracks, 9276.633 seconds, no completed STT text or word
timing. No local app listener was present, so browser console and visual
acceptance of that recording remain unverified.

Exact next round: `MEDIA-SCRIPT-02` — run live viewport acceptance with the
owner's failing footage and a multitrack footage whose channels have completed
STT/diarization; capture a render-boundary console error if one occurs and
repair any verified mismatch.

### MEDIA-SCRIPT-01B Continuous dialogue rows — 2026-09-30

Owner feedback clarified that silence does not end a Script row. A row of
recognized speech continues for the same channel and speaker regardless of
elapsed time. A spoken interjection by another channel, or a new diarized
speaker, starts a new row; returning to the earlier source starts another.
Imported parent Script now merges words after sorting all channels on the
shared time axis. OBS live rows ignore empty listening events as interruptions.
The previous 1.5-second gap rule caused the reported extra rows and is gone.
Regression tests cover long silence, channel interjections, speaker changes,
empty listening updates and the displayed row count. Frontend verification:
420/420 tests, typecheck and Vite build pass.

Exact next round remains `MEDIA-SCRIPT-02` for live viewport acceptance with
the owner's recording and completed multitrack STT data.

### MEDIA-PLAYBACK-01 Multitrack playback and import picker — 2026-09-30

OBS archive playback now starts every imported channel at the same playhead,
keeps channel positions aligned during playback, and offers an independent
Mute button beside Gain in both OBS and imported multitrack timelines.
Imported waveform pointer-down no longer changes the selected footage and
unmounts the dragged waveform. OBS scrub suppresses the synthetic post-drag
click that could seek back to zero. The OBS archive zoom adds the full
recording duration after the fixed short windows. Media import uses a Windows
file dialog when the portable Python runtime lacks `tkinter`.

Verification: frontend 423/423 full-suite tests plus one additional scrub
regression test in a passing targeted run, typecheck and Vite build pass;
backend 466/466 tests pass. The Windows picker fallback is covered with an unavailable
`tkinter` runtime mock; a physical dialog and live OBS capture were not run.
The owner's `test-obs-4` recording journal marks two channels forwarded for a
40-second take but has no PCM chunks or source stems and remains archive
`pending`. That evidence places this instance of the missing audio before
Timeline rendering or playback. The plugin's callback/transport behavior on
that workstation still needs a live two-channel trace.

Exact next round: `LIVELINK-CAPTURE-09` — instrument and reproduce a two-channel
OBS take, confirm each source callback, spool write and API chunk count, then
repair the first missing handoff and verify the resulting MKA contains both
channels. `MEDIA-SCRIPT-02` viewport acceptance remains queued after that.

### LIVELINK-CAPTURE-09 PCM recovery and growing-file import — 2026-09-30

Found a real transport stall: 63 SQLite PCM chunks from two channels remained
unacknowledged while an old finalize request repeatedly encoded MKA under the
global audio lock. The endpoint exceeded the plugin HTTP deadline. Reproduced
the lock contention and duplicate encoding with failing tests, then fixed
per-recording serialization, prompt asynchronous acknowledgement and idempotent
publication. Journal writes are protected against concurrent heartbeat updates;
cleanup of a locked temporary WAV no longer invalidates a verified archive.

Reloaded the managed portable API/STT without restarting or stopping OBS. Its
pending SQLite queue drained, and recording 925c6dfb published both tracks.
New real take 2cc71de9 received both channels without sample gaps and published
MKA. Take c15789f2 included two temporary speech sources alongside the existing
two sources: all four had zero observed sample gaps; speech sources had nonzero
waveforms, live text and final transcript events, and the MKA contains four
tracks. Temporary OBS sources were removed; historical channel mappings remain
for their saved recording. The user's muted mic and OBS paused recording state
were preserved.

Primary IMPORT now uses the native source picker, avoiding browser File snapshots
of a growing MKV. Track choices open automatically after inspection. Native picker
fallback supports UTF-8 paths in the portable runtime without tkinter. Inspected
the user's currently open OBS MKV and found all six tracks. An independent real
two-track MKV writer stayed active during import: registration took 0.391 seconds,
six clusters were consumed while writing continued, and finish completed both
24.056-second tracks and detailed STT. No follow or STT error was reported.

New recording/footage names follow
`yyyy-mm-dd_hh-mm-ss_project-name_MIC|SYS|LIV_id8` from the recording start time.
OBS names are persisted; MIC/SYS filenames and take labels share the same name.

Verification: 428 frontend tests, 468 backend tests, typecheck and build pass.
Real evidence and reproducible local scripts are in `.scratch/livelink-capture-09/`.
Browser inspection confirmed the named footage, four waveform lanes and two
speech rows; no render error was logged. Physical Windows file-dialog interaction
was not automated; its fallback is covered by tests and source inspection/follow
were exercised through the running API. These short capture checks do not claim
an hours-long zero-drop guarantee. ADR 0019 records the finalization contract.

Next acceptance: an extended owner recording under ordinary OBS workload;
`MEDIA-SCRIPT-02` remains the separate broader Script/diarization viewport round.

### MKV-STT-02 Snapshot, overlap and word timing — 2026-10-01

Reproduced the initial-interval bug (110 seconds of available audio was processed
as a 60-second first block), wrong absolute offsets at the 29:50 overlap seam,
and missing timestamp-positioned subtitle words with failing regression tests.
Detailed STT now snapshots committed frames before waiting for the decoder lock,
retains a durable plan, processes the complete initial backlog and continues
with configurable blocks. Each later block reads 10 preceding seconds and
replaces the previous transcript from 5 seconds before its logical start.
Midpoint seam ownership avoids appending the same overlap words twice. Results
commit before cursors and publication retries after interruption.

Import's STT checkboxes now select channels for live preview. They no longer
start detailed recognition before the explicit Speech to text request. The
dialog at that request sets future block length. Existing automatic queues
remain compatible; an explicit plan can supersede legacy segmentation. Detailed
jobs run separately from live passes; audio copying has bounded memory use.
After Finish, the queue drains its final short block and atomically updates
each channel's accurate-only `transcript.stt.srt`.

Imported Timeline now draws each subtitle word at its absolute interval.
Parent Script preserves word nodes and original indices, highlights every
channel at the shared time, and seeks all channel audio when a word is clicked.
Untimed text is not displayed as if it covered an arbitrary timeline interval.

Evidence:
- Full frontend suite: 430 tests / 53 files; full backend suite: 470 tests.
- After final start/snapshot refinements: 49 relevant frontend tests and all
  14 growing-MKV tests pass; typecheck/build and diff check pass. Two existing
  backend deprecation warnings remain (Starlette/httpx and audioop).
- Real acceptance script `.scratch/mkv-stt-02/verify_overlap.py` records a
  42-second AAC MKV with two speech tracks while import/follow and tiny/large-v3
  recognition run. Latest evidence project `mkv-stt02-overlap-acceptance-9a7877b4`,
  parent `asset-089c65a9843a`: before the button, detailed mode was false and its
  cursors zero; after Finish both tracks are complete with 91 timed words each,
  no reported STT error, correct saved context/merge offsets and SRT artifacts.
- Browser inspection verifies clicking a Script word seeks both lanes and
  highlights their independently timed words. No browser error was logged.
  Screenshots: `.scratch/mkv-stt-02/timed-words.png` and
  `.scratch/mkv-stt-02/timed-words-columns.png`.
- Managed API/STT reloaded, web build refreshed; OBS was left running unchanged.

Limits: model word timing still needs human accuracy review; this short English
fixture does not prove 30-minute Vietnamese accuracy or throughput. The 29:50
example is covered deterministically. Parent multi-channel SRT export and wider
Script/diarization viewport acceptance were not added in this round; SRT artifacts
and the existing selected-child subtitle export are per channel. ADR 0020 records
the timing contract. No commit was requested for this round.

### LIVELINK-UX-10 Track and capture feedback — 2026-10-02

OBS LiveLink now calls each independent source row a Track in the native dialog,
app mixer, Recorder, Timeline label and Script copy. New default aliases are
`Track N`; legacy `Channel N` aliases display as `Track N` without rewriting
recording metadata or user aliases. OBS' six mix tracks remain distinct from
LiveLink's independent source streams, so capture is not capped at six.

Recorder rows show durable PCM chunk counts beside the source meter and label
the meter as OBS signal, not proof of saved PCM. When a recording journal first
reports archive `ready`, Recorder asks the workspace to fetch Media Pool assets;
the verified MKA parent and any new children appear without F5. The callback
retries if the parent is not yet present. Selected Script edits stay in memory
because this refresh only inserts newly returned assets.

A static color audit found white on orange at 2.89:1 and undefined
`var(--surface)` foregrounds on several active states. Highlight text now uses
the dark foreground token on orange, lime, gold and red fills where measured;
the small gain number uses a theme-specific readable accent. The affected
token pairs measured at least 4.53:1 in their applicable theme. This was a
source-level audit, not a visual sweep of every rendered UI state.

Evidence: 432 frontend tests in 53 files, typecheck and Vite build pass. OBS
plugin RelWithDebInfo builds; native capture and spool tests pass 2/2 after
adding OBS' DLL directory to the test PATH. `git diff --check` passes. No
physical OBS recording was started for this round, and the existing installed
plugin DLL was not replaced while OBS might be running.

Remaining gap: a moving meter with PCM count zero still needs a real OBS trace
to determine whether capture callback, spool or API acknowledgement is absent.
The source-level contrast audit cannot certify every selected/hover/focus
combination in the app or the native OBS dialog. These matter because a source
can look active without a usable artifact, and inherited text colors can still
be hard to read at the owner's DPI.

Exact next round: `LIVELINK-CAPTURE-10` — record a real multi-source OBS take,
correlate source meter, callback, SQLite spool, API chunk count, journal, MKA
tracks and immediate Media Pool appearance; repair the first missing handoff.
Then `UI-CONTRAST-01B` performs the physical light/dark highlight sweep.

### LIVELINK-CAPTURE-10 Muted PCM and footage lifecycle — 2026-10-02

Completed scope:
- Inspected the owner's latest `Test_OBS 6` recording. Track 1 had 58.4 seconds
  of all-zero PCM despite a moving source meter; its Desktop Audio source was
  muted in OBS and forwarded in LiveLink. The native callback explicitly zeroed
  samples whenever OBS reported `muted`. Capture now records raw callback PCM
  when Forward is on, independently of the OBS mix mute. A native regression
  feeds nonzero source samples with `muted=true` and checks nonzero output.
- The same take had a verified MKA but archive status `error`, so the Media Pool
  had only hidden child WAVs. Project archive retry rebuilt the MKA parent and
  changed the journal to `ready`. Recorder and Media Pool now each try the
  latest failed archive once, with a visible manual retry if needed.
- Media Pool reads recording journals while mounted and displays an in-progress
  footage row during capture and finalization. It swaps to the persisted MKA
  parent when ready. The provisional row is labeled as recording/processing;
  it is not presented as a completed file. OBS rows missing from the current
  scene collection are hidden in plugin and app views but retained in the
  protocol and recording history. The owner's eight entries were six present
  sources plus two old missing sources; the current views therefore show six.
  Media Pool OBS labels now use Track, including stored default Channel aliases.
- Built and packaged the plugin, gracefully restarted idle OBS, repaired the
  installed plugin, and reopened OBS. Package and installed DLL SHA-256 both
  equal `F82EACDAB74E7693BF1CD12DFF8DEBD981651280C694B554B3ACC3AA018E28BF`.

Evidence:
- Frontend suite: 434 tests / 53 files; typecheck and Vite build pass. Native
  build passes; capture and spool tests pass 2/2 with OBS DLLs on PATH.
- After the final auto-retry and Track-label refinements, 57 focused frontend
  tests, typecheck, build, and diff check pass.
- Installed OBS 32.2.2 reconnects; current inventory has six present and two
  retained missing sources. A controlled five-second 440-Hz Desktop Audio
  playback produced moving Track 1 meter values while that source remained
  muted. The resulting ten-second take `26071d29-feaf-4a74-9faa-dca0466ae93c`
  finalized automatically to MKA `ready`; its Track 1 analysis WAV has peak
  32,284 and RMS 5,211. The MKA parent is returned by project media API.
- Recovered owner take `f25c8fd0-a786-4c74-85f0-43cb2ca75aee` is `ready`
  with parent `asset-live-587541be9c21`; its original Track 1 samples remain
  silent because the old plugin captured zeros. Source media was preserved.

Remaining gap: the provisional Media Pool row and automatic recovery are
component-tested but not visually checked in a running browser during a live
take. The physical test proved muted Track 1 with a known tone and MKA
publication, not all six sources carrying distinct simultaneous audio. The
original archive error was transient and its exact exception was not retained
in logs; a single automatic retry is now available when it recurs. These gaps
matter because layout and multi-source routing need separate real capture
evidence. No commit was requested; existing dirty work was preserved.

Exact next round: `LIVELINK-CAPTURE-10B` — observe the Media Pool row in the
running app while recording and after Stop, then record known audio on each
selected OBS source and verify per-track nonzero PCM, stream identity, and
archive publication. `UI-CONTRAST-01B` remains the separate physical theme
and highlight sweep.

### LIVELINK-TIMELINE-11 Live waveform and overlap controls — 2026-10-02

Completed scope:
- Live waveform subscriptions now treat each Timeline window as a separate
  cursor. A shifted or zoomed window fetches a full snapshot even if no new
  PCM sequence arrives; a late response for the previous window is discarded.
  The competing live full-fetch effect was removed. Tail bins beyond the last
  received PCM are shown as pending rather than red missing-PCM gaps.
- Timeline overlap markers are thin passive marks, so clicking and dragging
  the underlying waveform still seeks. Overlap selection in Script seeks only;
  it no longer starts or stops playback. Script overlap badges use compact
  time ranges. Space toggles archived track playback while the pointer is over
  the Timeline module, without overriding text entry or other controls.

Evidence:
- The owner's `Test_OBS 7` recording `1b775e3e-524a-4acb-8731-7b37057ec65f`
  has 925 Track 1 and 944 Track 4 durable PCM chunks. Sequence, sample-index,
  journal and MKA gap checks found zero missing spans; both tracks reach Stop.
  No overflow was logged for this recording.
- Chunk timestamps expose a separate throughput problem: median ingest delay
  about 1.3 seconds per track, 95th percentile about 62 seconds, last chunk
  about 50 seconds late. OBS spool pending grew from 9 around 01:16 to 153
  around 01:20 and drained after Stop. The frontend changes cannot remove this
  upstream delay; the pending label makes it explicit.
- Frontend focused tests cover window shifts, stale responses, passive overlap
  marks, Space playback, and pending versus internal missing PCM. Full suite,
  typecheck, build and diff check passed in this round.

Remaining gap: the new Timeline behavior was not observed during another long
real OBS take. The PCM sender still falls behind realtime under the owner's
long two-track recording with live STT. This matters because even a correct
frontend cannot draw PCM that has not reached the API. Existing user changes
were preserved; no commit or OBS restart was made.

Exact next round: `LIVELINK-INGEST-11B` — profile native spool send, HTTP ACK,
API durable write and concurrent STT during a sustained two-track OBS run;
remove the measured bottleneck and verify low tail latency, zero sample gaps,
and final MKA at Stop. `LIVELINK-CAPTURE-10B` and `UI-CONTRAST-01B` remain the
separate Media Pool/multi-source and physical contrast gates.

### LIVELINK-STT-12 Live transcript quality and cadence — 2026-10-02

Completed scope:
- LiveLink v3 STT uses the locally available `medium` recognizer and accumulates
  four seconds of voiced PCM per live pass. The recognizer receives the Project
  language when set; a Project with no language still uses automatic detection.
  The model and cadence are separate from imported-MKV and batch STT paths.
- STT runtime setup now preloads `medium` alongside the batch model; the
  portable-runtime check requires both models so a packaged LiveLink session
  does not silently depend on an online download.
- The two-channel transcript queue remains ordered and bounded. Durable PCM
  capture still ACKs independently of STT. No historical transcript was
  rewritten and source audio was not changed. See ADR 0022.

Evidence:
- The owner's 11-minute `Test_OBS 7` transcript has 171 Track 1 live STT
  queue-full errors, median event lag about 45 seconds and maximum 203 seconds.
  Its PCM archive had no sample gaps. Recognition and transcript backlog are
  distinct from audio capture completeness.
- On a preserved 12-second Track 1 excerpt, `medium` recognizes terms such as
  "Chopper AI" and "anh Minh" where `tiny` produces unrelated wording. This is
  qualitative inspection, not a word-error-rate measurement against verified
  text. In an offline 24-second-per-track two-stream replay, old `tiny`/2-second
  passes took 72.69 seconds across 24 calls; `medium`/4-second passes took
  12.28 seconds across 12 calls on this machine's CUDA runtime. The latter
  stayed below the 24-second elapsed audio interval in that probe.
- The full backend suite passed 471 tests before the final parameterized
  language-test refinement; all six focused LiveLink STT tests passed after it.
  These verify explicit and automatic language handling and the studio request
  model. The STT portable-runtime profile passed all six local checks, including
  the new `medium` weight check. Live OBS acceptance remains a separate gate.

Remaining gap: the replay does not include native plugin upload, HTTP and disk
write pressure, so it cannot prove a new long take will avoid queue overflow or
PCM spool delay. Projects without a chosen language still rely on detection;
there is no per-recording language picker. Real transcript accuracy has not
been scored against a manually verified reference. These gaps matter for
multilingual lessons and sustained recordings.

Exact next round: `VOICE-EXPORT-13` — add Voice Manipulator audio export and
word/line SRT from outputs with verified timing, then test generated artifacts.
`LIVELINK-INGEST-11B` remains the real OBS load gate; `LIVELINK-MEDIA-14` and
`LIVELINK-OVERLAP-15` cover the other requests from this session.

### VOICE-EXPORT-13 Voice Manipulator WAV and SRT — 2026-10-02

Completed scope:
- Each Voice Output row offers WAV, SRT by Script line, and SRT by word. The
  active output's Script export menu offers the same choices and retains the
  existing sentence SRT and Script CSV options. The browser downloads the
  original generated WAV; it does not render or resample another copy.
- A line SRT cue uses each saved Voice Output segment's text, speaker and
  start/end on the assembled audio timeline. This remains available when word
  recognition failed or word timing is estimated. Word SRT continues to use
  measured per-word intervals and omits untrusted words. Missing or invalid
  line boundaries fail closed. See ADR 0023.

Evidence:
- An API test generated a two-row WAV with a half-second gap and no trusted
  word timing. WAV download matched the saved file byte-for-byte; line SRT had
  two cues at 0.000–0.500 and 1.000–1.500 seconds, while word SRT returned 400.
- All seven Voice Outputs currently present under local project folders have
  ordered, in-range saved segment boundaries (read-only metadata check).
- The complete backend suite passed 474/474; focused subtitle/voice-script
  tests passed 19/19 again after the final atomic-write refinement. Frontend
  passed 441/441 tests, typecheck, and production build; UI tests cover choosing
  a specific output and disabling word export when timing is untrusted.

Remaining gap: the app was not running for a manual browser-download and
viewport check. Direct legacy Voice Outputs without Script-row segments can
download WAV but have no honest per-row SRT timestamps. This matters because
generating those timestamps from text alone would misrepresent the audio.

Exact next round: `LIVELINK-MEDIA-14` — make the in-progress OBS footage row
open its recorded tracks and available actions while capture continues, with
live project artifact and UI checks. `LIVELINK-OVERLAP-15` then connects Script
and Timeline overlap selection; `LIVELINK-INGEST-11B` remains the sustained OBS
load gate.

### MEDIA-SCRIPT-01C Concurrent track rows and timed overlap — 2026-10-02

Completed scope:
- Parent Script now groups recognized words per track before ordering rows by
  start time. An interjection on another track does not close speech that
  continues on the original track. Another track speaking in a genuine gap
  closes the earlier turn; a diarized speaker change still makes a new row.
  OBS realtime turns use the same track-continuation rule.
- OBS archive rows show `Track N` and a custom alias where present, rather than
  the full footage asset name. Each row shows start/end to centiseconds; each
  word exposes its saved millisecond timestamp on hover/focus and in its
  accessible name. These are source STT times, not newly inferred alignment.
- Realtime overlap requires recognized text and at least 0.4 seconds of
  shared segment time. After detailed STT, parent Script derives overlap from
  trusted word intervals on different tracks, applying the same minimum and
  showing seekable review badges. See ADR 0024.

Evidence:
- Regressions first failed for track interjection, full OBS asset labels, and
  listening-only/very short overlap; all focused tests now pass. The full
  frontend suite passes 446/446, with typecheck, Vite build, and diff check.
- Read-only replay of the owner's `Test_OBS 7` MKA `6d8e0b65` found 157 timed
  words on Track 1 and 70 on Track 4. The new grouping yields seven rows;
  Track 1 stays in one row from 0.096 to 15.740 seconds while Track 4 begins
  at 8.096 seconds. Saved word timestamps were already present; this round
  makes them visible and prevents display grouping from fragmenting them.
- The same project has a stopped, archive-ready recording journal
  `1b775e3e` with no MKA asset in its media index. The journal-only Media Pool
  path would render it as pending after permanent deletion; this round did not
  modify deletion or remove owner media.

Remaining gap: the 0.4-second floor removes short timing artifacts but cannot
prove acoustic overlap when one OBS source contains bleed from another. A
running-browser viewport check is still needed. LiveLink's explicit detailed
STT still reads each analysis WAV once and lacks continuing blocks with
10-second padding; permanent OBS deletion can leave a journal-only placeholder.
These matter because the visible Script can improve while long-running
recognition and Media Pool lifecycle remain incorrect.

Exact next round: `LIVELINK-STT-16` — add durable initial PCM snapshot and
configurable subsequent detailed STT blocks per selected LiveLink track, each
with 10 seconds of preceding audio and seam-safe word replacement. Follow with
`MEDIA-DELETE-17` for the confirmed journal-backed deleted footage.

### LIVELINK-STT-16 Detailed PCM snapshot and padded blocks — 2026-10-02

Completed:
- Added a journal-backed detailed STT plan for selected LiveLink tracks. The
  initial frame boundary is saved at the button press, independently of the
  realtime transcript queue and the one-shot media batch queue.
- Rendered immutable PCM slices from verified durable source chunks, preserving
  sample-index gaps, pause/disabled intervals, source sample rate and timing;
  FFmpeg produces deliberate 24 kHz mono analysis segments for recognition.
- Added a 10–600-second subsequent block choice in the in-progress Media Pool
  row. Each new block includes ten seconds before its boundary and replaces
  words from the five-second seam by word midpoint. Missing word timestamps
  fail without advancing the cursor.
- Persisted recognition result before the per-track cursor, resumed jobs at
  API startup, drained tails after Stop, and published track SRT plus timed
  transcript after the verified MKA archive becomes ready. Kept user text edits.
  Subsequent polls inspect only new durable chunk sequences.

Evidence:
- Backend full suite: 478 passed; the focused four tests passed again after
  incremental chunk reads. Frontend full suite: 447 passed; TypeScript
  typecheck, Vite build, and `git diff --check` passed. A parallel test run
  briefly failed an unrelated Web Audio gain assertion; the isolated Timeline
  suite and later full frontend run passed.
- New generated-PCM tests cover two tracks with different start snapshots,
  restart, 10-second padding, a short final tail, gap/pause silence, missing
  word timestamps, asset publication, and API validation.
- Read-only rendering of the owner's archived two-track `Test_OBS 7` capture
  (`6d8e0b65`) produced 120,000-frame, mono 24 kHz WAVs for both sources. The
  first four seconds of each matched the corresponding archived analysis WAV
  byte for byte. No owner media was changed.

Remaining gap: physical OBS recording while the app and STT model run together
has not been exercised. That gate matters for GPU contention, PCM spool lag,
the live Media Pool button, and final asset publication in the running app.
`LIVELINK-MEDIA-14` remains the separate full provisional-footage interaction
round; this round adds only the detailed STT action to the provisional row.

Exact next round: `MEDIA-DELETE-17` — reconcile permanent OBS footage deletion
with journal-backed Media Pool discovery, then verify a deleted MKA cannot
reappear as a pending recording row. Keep `LIVELINK-INGEST-11B` as the physical
long-take backlog gate.

## Round MEDIA-DELETE-17 — 2026-10-02

Completed scope:
- Permanent deletion of an OBS MKA parent now writes the recording ID to
  project-owned `assets/obs-livelink/deleted-recordings.json`, then removes the
  recording folder and grouped assets. The API serializes this with the
  recording's archive and LiveLink journal locks.
- LiveLink state persistence and restart discard deleted IDs. Recovery and
  archive retry reject them. Recording discovery excludes those IDs and also
  excludes older archive-ready journals whose parent asset no longer exists;
  a journal without a parent ID is hidden only when both MKA and PCM chunks
  are absent. This keeps unfinished recordings discoverable.

Evidence:
- Backend full suite: 482 passed. Frontend full suite: 447 passed. TypeScript
  typecheck, Vite build, and `git diff --check` passed.
- Tests cover the permanent-delete API, project reload, stale machine-state
  restore, journal persistence, archive retry and legacy orphan discovery.
- Read-only inspection of the owner's `Test_OBS 7` recording
  `1b775e3e-524a-4acb-8731-7b37057ec65f` found `archiveStatus=ready`,
  parent asset `asset-live-b8a59398d825` absent from the media index, no
  `source.mka`, and zero PCM chunks. It meets the orphan filter. No owner media
  was modified for this inspection.

Remaining gap: the updated app was not run against the owner's live OBS process
and Media Pool viewport. The old orphan journal remains on disk as forensic
metadata, but is no longer returned as pending footage; the code cannot infer
that every unindexed journal should be physically erased because an archive
can also be damaged or moved. A running-app check matters to confirm the row
disappears without a manual refresh and a newly deleted take stays absent.

Exact next round: `LIVELINK-MEDIA-14` — make the in-progress OBS footage row
fully interactive during capture. Keep `LIVELINK-INGEST-11B` and
`UI-CONTRAST-01B` as separate physical acceptance rounds.

## Round LIVELINK-MEDIA-14 — 2026-10-02

Completed scope:
- The provisional OBS Media Pool row can expand its forwarded/saved tracks.
  Opening a row clears the previous asset selection and shows its live Timeline
  and Script; opening a track selects its lane without interrupting live follow.
- Each track with durable PCM offers a 30-second listening preview. The API
  validates recording/project/channel ownership, reads the continuous ACKed
  prefix, verifies source PCM hashes, preserves gaps and pause/disabled silence,
  and renders a temporary mono 24 kHz WAV outside the project. It reports the
  exact preview time range and leaves source/project assets unchanged.
- The Media Pool highlights the selected provisional row. When its verified MKA
  arrives, the selected recording moves to the ordinary archived footage asset
  without a manual refresh or a selection reset.

Evidence:
- Backend full suite: 483 passed. Frontend full suite: 450 passed. TypeScript
  typecheck and Vite production build passed.
- API tests cover the generated two-second PCM preview, time bounds, project
  derivative absence, missing channel, and CORS-visible range headers. UI tests
  cover track focus, audio preview, selecting over an old asset, archive handoff,
  and a lane request that arrives before the live lanes.
- Read-only replay of the owner's archived `Test_OBS 7` source PCM produced a
  one-second, 24,000-frame mono WAV without modifying the project.

Remaining gap: a physical OBS recording and app viewport check is still needed
to confirm live row responsiveness, per-track playback, and the journal-to-MKA
transition under real capture load. Long-take PCM spool lag remains in
`LIVELINK-INGEST-11B`; the short preview does not make an unfinished MKA a
seekable full-length footage file.

Exact next round: `LIVELINK-OVERLAP-15` — link Script overlap selection with
the corresponding Timeline interval in both directions. Keep the physical
LiveLink capture/viewport gate and `LIVELINK-INGEST-11B` separate.

## Round LIVELINK-OVERLAP-15 — 2026-10-02

Completed scope:
- Added one transient OBS overlap selection with recording ID, exact time range,
  and participating source IDs. Realtime selections use LiveLink channel IDs;
  detailed STT selections use archived track asset IDs. Switching recordings or
  leaving OBS Timeline clears the selection.
- Clicking a Script overlap badge selects the same interval on both participating
  Timeline lanes and seeks the chosen source without starting playback. The
  archived word-timed Script now sends an asset-targeted seek that OBS Timeline
  actually handles; the imported multitrack Script keeps its existing seek.
- Clicking a Timeline waveform inside an overlap selects its Script badges and
  shows the clipped interval on each participating lane. The thin red markers
  remain pointer-passive so dragging the waveform still works. In single-track
  OBS view, selection returns to the parent Script so both sources are visible.
- After detailed STT exists, Timeline derives markers from the same trusted
  word overlap rows as parent Script instead of retaining stale realtime-only
  overlap indicators.

Evidence:
- Frontend full suite: 455 passed; TypeScript typecheck and Vite build passed.
  Tests cover live and archived Script badge selection, Timeline click/drag and
  no autoplay, asset-targeted seek even when stem IDs arrive late,
  detail-over-draft timing, single-track return to parent, and selection
  clearing on recording change.
- No backend or media files changed. The overlap remains a review interval, not
  evidence of acoustically separate speakers or trusted subtitle timing.

Remaining gap: the running app at the owner's viewport and a real OBS take have
not been used to verify marker hit areas, selected-range contrast in both
layouts/themes, and timing under live transcript revisions. DOM tests establish
state and event behavior but cannot prove these physical pointer/visual details.

Exact next round: `LIVELINK-INGEST-11B` — measure and reduce the long-take PCM
spool backlog under simultaneous OBS capture and STT load. Keep the physical
overlap viewport check in the final `LIVELINK-08` acceptance matrix.

## Round LIVELINK-INGEST-11B — 2026-10-02

Completed scope:
- API PCM ingress now validates the immediate predecessor metadata by sequence
  instead of enumerating and sorting every prior chunk in a long take. The
  existing duplicate/hash and sample-index/format checks remain in place.
- The OBS sender can deliver up to 20 queued chunks per control cycle instead
  of five, with a one-second burst budget so lifecycle and channel commands
  continue to be polled. Its five-second spool log now includes HTTP send
  count, average request duration and maximum request duration for diagnosis.
- Built the updated native plugin and refreshed the local plugin package and
  matching SHA-256 manifest. The running OBS process has not loaded it yet.

Evidence:
- The regression test failed on the old full-directory scan and passed after
  the predecessor lookup. It also rejects a skipped sequence. Backend full
  suite: 484 passed; frontend: 455 passed, typecheck and build passed.
- Native Release and RelWithDebInfo builds passed. Capture and spool native
  tests: 2/2 passed with the OBS DLL directory on PATH. The packaged DLL hash
  matches its manifest.
- On an isolated two-track, 360-chunk PCM replay, median API persistence time
  for sequences 150–179 fell from 26.8 to 23.9 ms/chunk. The old directory
  scan alone took about 4.7 ms at 900 metadata files and 9.3 ms at 1,800
  files on this machine. This replay excludes native HTTP and concurrent STT.

Remaining gap: no sustained OBS take with live STT has run against the newly
built plugin and API. The earlier 153-chunk peak and ~50-second tail have not
been remeasured after installation. This matters because API disk I/O, HTTP
ACKs, native control polling and model load can still compete in the actual
session; an isolated replay cannot establish gap-free, low-latency capture.

Exact next round: `LIVELINK-INGEST-11C` — load the updated package in OBS,
record a sustained two-track take with live and detailed STT, read the new
spool/HTTP metrics and project PCM timestamps, and verify low tail latency,
zero sample gaps and a final two-track MKA. Continue the final `LIVELINK-08`
acceptance matrix after that result.

## Round LIVELINK-INGEST-11C — 2026-10-02

Completed scope:
- Repaired and installed the packaged plugin 0.6.6, started OBS 32.2.2 and the
  local API/STT runtimes, then recorded two independent looping speech sources
  through native OBS for 497.288 seconds. Detailed `large-v3` STT began during
  the take on both tracks with 60-second blocks; automatic realtime STT ran
  concurrently. The test used copies of existing analysis WAVs in ignored
  `.scratch/livelink-ingest-11c`, leaving the owner's source media untouched.
- Restored the original OBS scene, recording directory and Forward selection,
  removed test sources, released the test project lease, and stopped the OBS
  and app processes started for this check.

Evidence:
- Recording `3daf7486-0c86-4bbf-9929-ff344646dca8` in the isolated project
  contains 793 and 795 native PCM chunks at 48 kHz stereo. Sequence, SHA-256,
  format and sample-index checks found zero missing or overlapping samples on
  either track. The final MKA hash matches its journal, decodes without errors,
  and holds two 48 kHz stereo FLAC tracks trimmed to 497.289 seconds.
- 89 OBS spool telemetry samples report 1,588 HTTP sends, zero capture-time
  queue overflow/reject log entries, peak pending 56 versus the prior 153,
  weighted mean HTTP duration 258.8 ms and worst request 1,986 ms. Pending
  returned to zero after Stop. The last PCM receipt was 2.268 seconds after
  the Stop request versus roughly 50 seconds in the earlier take.
- Per-track median PCM ingest lag was 5.96/6.21 seconds; p95 was 16.29/16.49
  seconds, maximum 18.39/18.65 seconds, and the final chunks lagged 1.63/1.51
  seconds. Final raw chunks extended about 0.6 seconds beyond the Stop request;
  the published MKA ends at the recorded Stop boundary.
- Detailed STT published both assets with 128 and 66 SRT cues. The realtime
  stream emitted 113 text events but also 382 `Live STT queue is full` errors,
  concentrated in the first six minutes. These errors do not indicate PCM loss.
  Repro steps, monitor samples and read-only forensic checks remain in ignored
  `.scratch/livelink-ingest-11c`.

Remaining gap: the two-track native capture and archive integrity gate passed,
but PCM did not stay near real time throughout the take, and realtime STT lost
queued recognition work under simultaneous detailed STT. This matters because
the live waveform may appear late and the provisional transcript may omit
speech even though the durable audio and final detailed STT are intact. The
sources were controlled OBS media inputs, so the owner's full physical source
matrix and app viewport still require final `LIVELINK-08` acceptance.

Exact next round: `LIVELINK-INGEST-11D` — profile the HTTP ACK and API write
critical path during sustained two-track capture, reduce p95 PCM ingest lag,
then repeat the OBS load test. Follow with `LIVELINK-STT-12B` for the separate
realtime transcription queue-loss path.

## Round LIVELINK-INGEST-11D — 2026-10-02

Completed scope:
- Profiled the durable PCM ACK path with 100 real 11C source chunks. At the
  baseline median, PCM flush cost 37.68 ms, metadata flush 50.76 ms, envelope
  flush 38.2 ms, and waveform point calculation 9.93 ms. The source PCM and
  metadata remain flushed before ACK; their temporary files now flush in
  parallel and publish PCM before metadata. The rebuildable waveform sidecar
  keeps atomic replace without a separate flush on the ACK path. See ADR 0029.
- Repeated a native OBS recording with the same two copied speech fixtures,
  automatic live STT, and detailed `large-v3` STT started during capture.
  Restored OBS scene, Forward choices and recording folder, then stopped the
  OBS and app processes started for the round. Source media was not changed.

Evidence:
- A failure-injection test went red before the pair writer existed and green
  after implementation. It verifies that failed PCM publication leaves no
  committed metadata and that retry succeeds. Full backend suite: 485 passed.
- In the 304.05-second take, 516/517 PCM chunks were contiguous at 48 kHz
  stereo with zero missing/overlapping samples. The MKA hash matches the
  journal, decodes both FLAC tracks, and ends at 304.049 seconds. Detailed STT
  published both tracks. The last PCM arrived 1.713 seconds after Stop.
- Per-track median ingest lag was 0.531/0.664 seconds, p95 4.199/4.141
  seconds, maximum 7.207/7.340 seconds. The 11C take's first 304 seconds had
  13.036/13.304-second median and 16.955/17.232-second p95 on the same
  fixtures. The measured spool peak fell from 56 to 20 chunks, median pending
  was one, and pending returned to zero. OBS telemetry logged 1,033 sends,
  weighted mean HTTP duration 188.8 ms versus 258.8 ms in the full 11C run,
  with no capture overflow or rejected chunk in the new take.
- Read-only samples, media verification and comparison scripts are retained in
  ignored `.scratch/livelink-ingest-11d`; tracked source and docs pass
  `git diff --check`.

Remaining gap: the new 304-second test is shorter than 11C's 497-second take
and starts app capture at a different point in the OBS session, so it cannot
prove the same p95 under every long-session load. More importantly, realtime
STT still emitted 47 queue-full errors while durable PCM and detailed STT were
complete. Live Script can therefore omit speech even when the waveform and
final archive remain intact. The owner's full OBS source matrix and live UI
viewport are still part of final `LIVELINK-08` acceptance.

Exact next round: `LIVELINK-STT-12B` — replace the lossy realtime STT queue
behavior with a durable per-track catch-up path, then verify two-track live
transcription during simultaneous detailed STT without losing recorded audio.

## Round LIVELINK-STT-12B — 2026-10-02

Completed scope:
- Replaced the realtime STT queue-full discard path with a bounded in-memory
  queue plus a per-track sequence cursor over PCM already committed by the API.
  When the queue fills, the worker reads the remaining chunks in order from the
  project journal, verifies sequence, source and SHA-256, and finishes the tail
  after OBS Stop. Failed verification reports an error instead of inventing
  transcript text. See ADR 0030.
- Recorded 185.71 seconds with two independent OBS speech sources, automatic
  live STT, and detailed `large-v3` STT started during capture. The isolated
  fixture and read-only analysis are in ignored `.scratch/livelink-stt-12b`;
  source media was not modified. Restored OBS scene, recording directory and
  Forward settings, released the test lease, and stopped the OBS/API/Studio
  processes started for the round.

Evidence:
- A forced one-chunk RAM queue test was red on the old discard behavior and
  green after catch-up: 24 committed chunks on each of two tracks produced 24
  partial recognitions per track and final events through all 11,520 frames.
  A corruption test rejects a deferred chunk with a bad hash. Focused backend
  tests: 8 passed. Full backend suite: 487 passed, with two existing
  deprecation warnings.
- Real OBS produced 330/329 48 kHz stereo chunks, with zero sample gaps or
  overlaps on either track. The last PCM arrived 1.503 seconds after Stop;
  p95 ingress lag was 0.972/1.133 seconds and spool peak was two chunks. The
  5,294,525-byte MKA matches the journal hash and decodes two FLAC streams
  through the 185.71-second Stop boundary.
- Live STT wrote 104 events including 52 text events, with zero queue-full or
  other event errors in this take. Both tracks have final events through their
  last voiced interval; detailed STT published both track assets. OBS telemetry
  had no native PCM overflow or rejected chunks. The physical run did not
  force the deferred cursor to activate; the forced-backlog test covers that
  code path.

Remaining gap: the deferred cursor exists only inside the running API process,
so an API restart during backlog does not resume provisional STT. Live text can
also lag under simultaneous detailed STT: the largest final-event lag was
26.828/20.578 seconds. This matters because a complete recording can still
appear to lack current captions or lose unprocessed live text after a crash.
The owner viewport and broader OBS source matrix remain for `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12C` — checkpoint per-track realtime STT
progress and resume unread committed PCM after API restart without duplicate
final events, then measure catch-up lag. Continue the final `LIVELINK-08`
source and UI gate afterward.

## Round LIVELINK-STT-12C — 2026-10-02

Completed scope:
- Added a project-owned, atomically replaced `live-stt-progress.json` per OBS
  track. It records the next PCM sequence and the start sequence of an open
  utterance. API startup discovers these checkpoints, replays the open
  utterance to rebuild the recognizer session, and drains unread committed PCM
  even when OBS sends no new upload. A version marker on newly created
  `recording.json` journals covers a crash before the first checkpoint without
  triggering transcription of every legacy completed recording. Deleted
  recordings are excluded. See ADR 0031.
- Kept the public transcript journal idempotent across replay using the track,
  utterance, event status and ending sample as the event identity. A fresh
  recognizer session ID after API restart prevents old Studio session audio
  from being appended a second time. A transient Windows file lock retries
  checkpoint replacement. A failed event-journal write stops the worker
  without advancing its checkpoint; later uploads cannot open a new queue past
  the gap, so restart can retry all committed PCM. Permanent worker failures
  are logged and reported.
- Added graceful worker cancellation on API shutdown. Copied the 12B physical
  OBS PCM into an isolated ignored project for restart measurement; original
  source PCM and MKA remain unchanged.

Evidence:
- A two-track forced-backlog test interrupts processing, recreates the STT
  adapter, drains both tracks, then rewinds one checkpoint behind an already
  committed final event. The event journal remains byte-for-byte equivalent
  after replay, with one final per utterance and monotonic event revisions.
  Another test restarts during active speech, accepts later PCM, and retains
  one utterance across the seam. FastAPI startup restores a stopped recording
  without a new upload; tests cover the Windows checkpoint lock retry and
  event-write failure before checkpoint advancement and another chunk arriving
  after that failure.
- The copied 185.71-second OBS source contains 330/329 PCM chunks. With a
  deterministic 5-ms fake recognizer, a simulated restart after 8.594 seconds
  completed all 659 chunks in 34.328 seconds total, 25.734 seconds after
  restart. Both final checkpoints reached sequence 330/329; 104 transcript
  events included 24 finals, zero duplicate finals and zero error events.
  Replay report and script are in ignored `.scratch/livelink-stt-12c`.
- Focused Live STT tests: 13 passed. Full backend suite: 492 passed with two
  existing deprecation warnings.

Remaining gap: no running OBS/API process was restarted during a physical
recording with the real `medium` live recognizer and concurrent detailed STT.
The measured 25.734-second replay tail uses a fake recognizer and cannot
predict GPU contention or the caption delay seen by the owner. This matters
because the durable cursor can be correct while the live Script still catches
up too slowly under model load. The full owner source matrix and viewport also
remain in `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12D` — restart the API during a real two-track
OBS take with simultaneous live and detailed STT, then verify the PCM, event
and checkpoint tails and measure visible caption lag. Continue the final
`LIVELINK-08` source/UI gate after that result.

## Round LIVELINK-STT-12D — 2026-10-03

Completed scope:
- Ran two isolated physical OBS 32.2.2 takes with two looping speech sources,
  automatic `medium` per-track live STT and user-started `large-v3` detailed STT.
  Restarted only the FastAPI process while OBS and Studio stayed running. Test
  projects, source media and reports are in ignored `.scratch/livelink-stt-12d`
  and `.scratch/livelink-stt-12d-retry`; no product source changed. Restored the
  original OBS scene, recording directory and six present-channel Forward
  settings after each take, then released the test lease.
- The first restart using a detached PowerShell `Start-Process` launcher briefly
  served requests, then lost its listener while Python remained alive. Its
  268.723-second recording was stopped and recovered by a foreground API launch:
  400/401 PCM chunks and live checkpoints reached the tail, a two-track MKA
  decoded, and no final transcript was duplicated. That outage made its latency
  measurement unsuitable for the intended model-contention comparison; the
  launcher failure is not yet attributed to product code.
- Repeated the take with an observed foreground API restart at 114.156 seconds
  into a 173.507-second recording. Studio kept the same PID. The API remained
  available through Stop and archive finalization.

Evidence:
- The retry retained 288 consecutive 48 kHz stereo PCM chunks per track with
  zero sample gaps or overlaps and 148/170 nonzero chunks. Its 4,866,298-byte
  MKA matched the journal SHA-256 and decoded two FLAC audio streams through
  the Stop boundary. PCM ingress p95 was 2.536/2.777 seconds, spool peak was
  20 chunks and was empty at Stop. The final PCM receipt was 2.729 seconds
  after Stop.
- Both live STT checkpoints reached sequence 288/288 roughly 15 seconds after
  Stop. There were 94 transcript events, 21 finals, zero event errors and zero
  duplicate finals. Detailed STT reached and published the full 4,164,171
  analysis frames on both tracks. The maximum live event `lagSeconds` values
  were 29.417/42.745 seconds. Estimated caption age relative to the latest
  transcribed audio after restart had medians 11.689/12.715 seconds and maxima
  19.434/29.092 seconds; these subtract utterance duration from event lag and
  do not measure browser paint time.
- Read-only sample/hash/decode checks and the restart report are in ignored
  `.scratch/livelink-stt-12d-retry`. Focused backend regression:
  `test_obs_livelink_runtime.py` 21 passed with two existing deprecation
  warnings. OBS settings and lease were checked after cleanup.

Remaining gap: the owner viewport was not observed during the take, so the
caption-age estimate does not prove perceived UI delay. Live captions still
lagged by up to about 29 seconds after the process restart under model load,
even though no PCM or transcript tail was lost. The detached API launcher lost
its listener in the first attempt and needs a controlled reproduction before
blaming the app. The full OBS source matrix and viewport remain in
`LIVELINK-08`.

Exact next round: `LIVELINK-STT-12E` — reproduce the detached-launch failure,
then reduce and remeasure post-restart live-caption lag while detailed STT runs.
Continue the final `LIVELINK-08` source/UI gate afterward.

## Round LIVELINK-STT-12E — 2026-10-03

Completed scope:
- Diagnosed Studio's single-model retention as repeated construction when
  `medium` live STT and `large-v3` detailed STT alternate. Added a two-model
  least-recently-used cache only when CUDA reports at least 20 GiB total and
  6 GiB free, with single-model fallback and observable load counts (ADR 0032).
- Reproduced the 12D detached API restart method first without OBS load, then
  during a 172.806-second physical two-track OBS recording with both STT modes
  active. The API listener stayed healthy for 18 samples over 90 seconds in
  both attempts; the first 12D listener loss did not recur. OBS scene,
  recording directory and the original six channel Forward states were
  restored, and the test lease was released.

Evidence:
- The fixed five-request Studio benchmark changed repeated `medium` calls
  from 3.195/3.213 to 0.619/0.556 seconds and repeated `large-v3` from
  10.392 to 5.875 seconds. The Studio reported both models resident and two
  successful model loads. Cold-call times varied and are not counted as a gain.
- The physical take retained 276 contiguous 48 kHz stereo PCM chunks per
  track with zero sample gaps or overlaps; the 4,838,627-byte MKA matched the
  journal hash and decoded two FLAC streams through 172.806 seconds. Its PCM
  ingress p95 was 5.711/5.914 seconds; spool peak was 26 and drained to zero.
  Both live checkpoints reached sequence 276, with 96 events, 22 finals,
  zero event errors or duplicate finals. Detailed STT published both tracks.
- Using the same event-lag estimate as 12D, post-restart caption delay medians
  fell from 11.689/12.715 to 0.923/1.764 seconds; maxima fell from
  19.434/29.092 to 16.029/10.912 seconds. An independent one-second API poll
  measured post-restart caption age medians 6.147/4.641 seconds and maxima
  17.940/12.378 seconds. Neither measures browser paint. The restart happened
  at 116.706 seconds; the detached launcher became ready in about 8.5 seconds
  and kept the same Studio PID.
- Studio cache/local-agreement tests: 14 passed. Focused LiveLink API tests:
  21 passed. Full API suite: 492 passed; Python compilation and `git diff
  --check` passed. The test OBS process and app workloads were stopped after
  the recording and report checks.
  Read-only acceptance data is in ignored `.scratch/livelink-stt-12e`,
  `.scratch/livelink-stt-12e-physical` and the prior 12D retry directory.

Remaining gap: the 12D detached-listener failure was not reproduced, so its
root cause remains unknown. Caption peaks still reached 16.0/10.9 seconds by
the event estimate, and the owner viewport was not measured. The separate
takes do not prove that the model cache alone caused every latency difference;
PCM ingress and recognition load also varied. The full source/UI matrix stays
in `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12F` — capture browser-visible caption timing
and trace the remaining peaks during sustained two-track OBS plus detailed
STT; then continue the final `LIVELINK-08` source/UI gate.

## Round LIVELINK-STT-12F — 2026-10-03

Completed scope:
- Captured PCM receipt, recognition request, event persistence, browser receipt
  and double-animation-frame row timing with temporary probes. Removed those
  probes byte-for-byte after measurement; this is a diagnostic/documentation
  round, with no claimed product performance improvement.
- Ran a 234.233-second cold two-track OBS take with detailed STT and API restart,
  recovered an interrupted 161.744-second attempt, then measured a warmed
  controlled take with Script in the viewport and detailed STT started at 36.6
  seconds. A status-request RemoteProtocolError stopped the controlled take at
  70.804 seconds; its API listener remained healthy afterward.
- Used an isolated portable OBS copy and later an isolated API project registry
  to separate the current take from recovery of older projects. Restored scene,
  recording directory and the six original visible-source Forward settings,
  released the lease and stopped all test processes.

Evidence:
- Controlled take: 104 consecutive 48 kHz stereo PCM chunks per track, zero
  sample gaps/overlaps, and a 2,036,378-byte hash-verified MKA decoding both
  FLAC streams through Stop. Live checkpoints reached 104/104, with 35 events,
  zero error-status events or duplicate finals. Detailed STT published the full
  1,699,284/1,699,285 analysis frames; the native spool drained to zero.
- All 35 events reached the browser. Measured 26 resulting row revisions:
  12 intersected the list viewport and 14 were offscreen. Browser receipt to
  frame had median 0.039 seconds, p95 0.115 and max 1.882; persistence to receipt
  had median 0.485, p95 1.171 and max 1.283. These are render-boundary proxies,
  not compositor presentation timing. Visible caption audio-age medians were
  11.151/9.850 seconds and maxima 23.123/10.321, on only 9/3 samples.
- Controlled PCM ingress p95 was 33.210/33.964 seconds. The offscreen tail
  caption peaked at 54.379 seconds: 33.999 seconds before PCM receipt, 19.369
  until event persistence, 0.976 until browser receipt and 0.035 until the frame
  callback. A live request in this tail lasted 14.234 seconds with models warm.
  Both ingress and recognition remain relevant; browser render time alone
  cannot explain the peak. Polling has not been proven to cause slower ingress.
- Cold take: 350 contiguous chunks per track and a verified 6,436,215-byte MKA;
  complete live checkpoints and detailed publication, but one opening live
  timeout produced an error event with an empty error string. PCM p95 was
  63.405/63.699 seconds and live catch-up finished about 152–155 seconds after
  Stop. The interrupted warm attempt also recovered gap-free PCM and a verified
  two-stream archive. Neither is a clean warmed latency comparison with 12E.
- Detailed method, peak decomposition and launch/harness limitations:
  `docs/gates/livelink-stt-12f-browser.md`; raw evidence stays in ignored
  `.scratch/livelink-stt-12f-physical`, `-warm` and `-controlled` directories.
- Frontend verification after probe removal: default `npm test` exited 1 with
  218 passing tests and 19 worker-start timeouts; the full rerun with
  `--maxWorkers=2` passed all 54 files / 455 tests. Typecheck and production
  build passed. Focused backend runtime tests: 21 passed with two existing
  deprecation warnings. `git diff --check` passed; product/engine source is clean.

Remaining gap: the planned sustained browser duration did not complete.
Listener loss recurred in another launch without an isolated cause; the cold
live timeout, workspace source reset on partial runtime status, and offscreen
new Script rows remain open. Data continuity does not establish complete live
text after a timeout or acceptable perceived caption latency. The wider source,
owner viewport/DPI and clean-machine gates remain in `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12G` — profile native PCM HTTP ACK stages while
the browser workspace polls during a sustained two-track take, reduce the
measured bottleneck, then repeat ingress and caption timing. Continue the
remaining startup/reconnect UX and final `LIVELINK-08` gates afterward.

## Round LIVELINK-STT-12G — 2026-10-03

Completed scope:

- Profiled PCM ACK stages with the browser workspace polling. Replayed the
  unchanged-folder heartbeat cost and measured native SQLite ACK deletion.
- Plugin 0.6.7 now commits explicit ACK IDs once per existing bounded send
  burst. FULL source/ACK durability and API PCM/metadata flushes remain. Crash
  before commit replays retained sequences; failure rolls the entire ACK batch
  back. Added native ACK commit timing and changed-only folder persistence.
- Completed two warmed physical two-source OBS takes with live `medium`,
  detailed `large-v3`, Script/Media Pool/Timeline polling and browser timing.
  Removed temporary probes, restored test OBS settings and stopped test
  processes. The package is built; owner installation remains separate.

Evidence:

- Folder regression failed on 5 durable writes for 5 identical heartbeats,
  then passed with 1, including change/restart/reconnect/corruption recovery.
  A quiet 30-chunk replay took 8.735 seconds before and 4.145 after; a replay
  during model loading was slower and excluded from that comparison.
- Native 40-row ACK benchmark: 1.488 seconds individually, 0.773 seconds in
  batches of four. Native tests verify retained PCM on reopen before ACK,
  atomic rollback, successful batch deletion and rejected-row preservation.
- Before/after take duration: 174.830/171.477 seconds. PCM receipt p95:
  49.012/49.263 versus 2.157/2.520 seconds; pending peak 99 versus 7, then 0.
  Last receipt after Stop request: 52.344 versus 2.670 seconds. API durable
  PCM-pair preparation remains its largest stage; lock acquisition and
  waveform projection did not explain the backlog. Separate takes/cache/disk
  scheduling prevent attributing every latency difference to one change.
- Both tracks in each take are sample-contiguous 48 kHz stereo PCM with valid
  hashes; both MKA archives decode two FLAC streams and match their journal
  hash. Live checkpoints reach 255/256 and 257/258, with 91/93 events, no
  error-status events or duplicate finals. Detailed STT published the entire
  4,195,894/4,195,908 and 4,115,449/4,115,442 analysis frames. Studio kept the
  same process; its model-load count was 2 before the second take and 5 at
  cleanup. The additional loads are not timed by the logs; continuous model
  residency is not established.
- All 91/93 events reached the browser. Text-event receipt audio-age medians
  changed from 26.977/24.151 to 4.210/3.864 seconds. Receipt-to-first-frame
  median was 33 ms in both, p95 51/67 ms. Only 8/10 measured first frames
  intersected the Script viewport; offscreen rows are not visible-caption
  evidence. This is a render-boundary proxy, not compositor presentation.
- Backend 493 passed (two existing warnings); frontend 54 files / 455 tests
  passed with `--maxWorkers=2`; typecheck/build passed after probe removal.
  Native build/package 0.6.7 and CTest 2/2 passed. `git diff --check` passed.
  Detailed evidence: `docs/gates/livelink-stt-12g-ingress.md`, ADR 0033 and
  ignored `.scratch/livelink-stt-12g` artifacts.

Remaining gap: the live Timeline sometimes looked empty despite low PCM
latency and nonzero waveform API data. Removed historical sources also
appeared as extra live lanes; the completed MKA rendered the two real tracks.
The owner's waveform complaint is not resolved by this ingress improvement.
Preferences Install/Repair and OBS restart are needed for the owner's installed
plugin to use 0.6.7. Cold startup, runtime reconnect/Script follow and the
wider source/UI/portability gates remain under `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12H` — reproduce and repair live waveform
clearing and historical missing-source lanes, then verify the recording tail
in the browser on the improved ingress path.

## Round LIVELINK-STT-12H — 2026-10-03

Completed scope:

- Reproduced two failures before changing behavior: an empty cursor delta
  cleared a saved SVG waveform, and a missing historical source with no PCM
  in this recording appeared as an extra lane.
- Preserve waveform bins/rate on matching empty cursor deltas; full/new-window
  snapshots still replace them. Omit missing sources without current-take PCM,
  retaining sources removed after capturing audio. Clarify the live empty-window
  label when PCM is already saved elsewhere on that track.
- Verified a 202.977-second OBS/browser take with concurrent live and detailed
  STT, rewind to Script, returning to live, window/layout/zoom changes and
  automatic MKA handoff. A 46.509-second take on the final build verified
  source removal during recording and the saved-PCM label.

Evidence:

- Both initially failing regressions passed. The backend contract test confirms
  that out-of-window cursor pagination can have null rate and no points.
- The long take showed exactly two lanes despite four forwarded historical
  missing sources. Rewind retained 600 bins per track after empty replies,
  including 280/233 nonzero bins. The removed source in the short take kept
  its lane; the continuing source retained a visible live waveform.
- Long take: 292/292 contiguous chunks, zero sample gaps/overlaps, two FLAC
  archive streams with matching hash and successful decode. Live checkpoints
  reached both tails; 109 events, no errors/duplicate finals or open utterances.
  Detailed STT published all 4,871,444/4,871,453 analysis frames.
- Short take: 24/79 contiguous chunks, complete live checkpoints, 17 events
  without errors/duplicate finals, and a verified two-track MKA retaining the
  removed source's captured prefix. No detailed STT was requested there.
- Studio model-load count remained 8 from preflight to cleanup, with medium
  and large-v3 resident. Tests ran before recording, followed by model warmup.
- Final frontend suite: 54 files / 457 tests passed. Backend suite: 493 passed
  with two existing warnings; the extended waveform test passed separately.
  Typecheck/build and diff check passed. Restored OBS test settings, released
  the lease, emptied the outbox and stopped the isolated test processes.
- Evidence: `docs/gates/livelink-stt-12h-waveform.md` and ignored
  `.scratch/livelink-stt-12h` artifacts. Native plugin remains 0.6.7.

Remaining gap: the sustained take rebuilt a PCM backlog (sampled peak 118,
receipt p95 41.434/41.801 seconds, last receipt 36.058 seconds after Stop).
The browser then correctly lacked PCM in a future zoomed window. The cached
waveform fix does not resolve this transport delay, which can still postpone
the visible live tail. The new source's mid-take missing interval was also
absent from its journal; timing provenance is queued separately in 12J.
Native idle/Start overflow counter attribution and the
wider startup/reconnect/source/DPI/portability gates remain in LIVELINK-08.

Exact next round: `LIVELINK-STT-12I` — reproduce/profile the renewed PCM ACK
backlog during sustained browser waveform polling with model residency checked,
reduce the measured bottleneck and recheck the live tail and Stop drain.

## Round LIVELINK-STT-12I — 2026-10-03

Completed scope:

- Profiled durable PCM receipt during a sustained OBS/browser take. The
  natural 12H severe stall did not recur in the first quiet take; concurrent
  PCM/metadata preparation consumed 85.5% of handler time.
- Reproduced fixed-cost receipt overload with a scratch-only 400 ms delay
  per PCM pair. Plugin/package 0.6.8 consumes up to two seconds of already
  queued audio, capped at 96,000 frames, without waiting to fill a chunk.
  Drain frequency, sample boundaries, API flushes and native FULL commits
  remain. No API, project schema, UI or engine changes; ADR 0034.
- Completed four two-source physical OBS takes with browser polling, live
  medium and detailed large-v3 STT; verified PCM, archives and transcript
  checkpoints. Restored isolated OBS settings and released its lease/outbox.

Evidence:

- Native backlog regression failed before the fix at `frames == 96000`, then
  passed. Tests cover ordering, immediate partial delivery, Stop clipping,
  discontinuity, capture recovery and atomic durable ACKs; CTest 2/2 passed.
- Quiet 0.6.7 take: 202.777 seconds, PCM receipt p95 2.968/3.308 seconds,
  pending peak 10 and last receipt 3.215 seconds after Stop.
- Delayed before/after takes: 123.372/204.330 seconds, receipt p95
  125.713/126.278 versus 30.985/31.477 seconds, pending peak 182 versus 43,
  final 0. Last receipt after Stop: 134.400 versus 32.570 seconds. For the
  first 120 seconds of audio, p95 was 122.526/123.098 versus 20.798/21.664.
  Request costs stayed similar; audio per request rose from 0.685 to 1.277 s.
  The before harness exceeded its archive wait; preserved PCM drained and
  the verified archive became ready afterward. This was a controlled delay,
  not an isolation of the owner's natural disk-stall trigger.
- Final quiet 0.6.8 take: 201.191 seconds, p95 1.577/1.885 seconds, pending
  peak 5 then 0; last receipt 3.307 seconds after Stop. Live zoom retained
  waveform in the final minute; the saved final window appeared automatically.
- All four takes retained contiguous, hash-valid 48 kHz stereo PCM with no
  sample gaps/overlaps. All four two-track FLAC MKAs matched their journal
  hash and decoded. Complete live checkpoints, no error events/duplicate
  finals/open utterances, and detailed STT published every available tail.
  Studio model-load count stayed 2 through recording cleanup with both models
  resident; regression suites ran afterward.
- Backend 493 passed (two existing warnings); frontend 54 files / 457 tests
  passed; typecheck/build and diff check passed. Native package 0.6.8 matches
  the tested isolated DLL. See `docs/gates/livelink-stt-12i-ingress.md` and
  ignored `.scratch/livelink-stt-12i` evidence.

Remaining gap: fixed-delay pressure still postponed the live tail and the
precise natural 12H stall trigger is not established. Fewer durable uploads
reduce the cost but cannot guarantee throughput through arbitrary storage
stalls. Owner installation requires Preferences Install/Repair and OBS restart.
Source-absence provenance, cold startup, reconnect/Script follow, native
idle/Start overflow attribution and wider source/DPI/portability gates remain.

Exact next round: `LIVELINK-STT-12J` — persist source-absence timing when a
newly added source disappears mid-take, verifying its retained PCM/lane and
the journal interval together.

## Round LIVELINK-STT-12J — 2026-10-03

Completed scope:

- Reproduced journal omission when heartbeat preceded a missing event, and
  native queued-prefix loss on source detachment. Plugin/package 0.6.9 emits
  native missing/restored events for newly discovered sources, retains queued
  PCM/counters while the take drains, and pads observed restoration gaps.
- Reducer retains native event timing despite newer inventory. Stable UUID,
  tombstone, event fingerprint/ordering and durable ACK contracts remain.
  Native observation boundaries follow detach and precede attach, with about
  one-second inventory polling; no exact scene-edit time is invented. ADR 0035.
- First physical take exposed a related UI error: an absent source looked
  like delayed PCM. Timeline now labels source absence, keeps the lane/PCM and
  distinguishes known absence from unknown holes. Second take verifies build.

Evidence:

- Red regressions before fixes, then backend 494 passed (two existing warnings),
  frontend 54 files / 458 tests, native 2/2, typecheck/build and diff check passed.
- Two physical two-source OBS/browser takes, 77.561 and 66.258 seconds. Every
  native absence time/sample counter matches the journal; restoration closes
  the first interval, Stop closes the second. A's final captured sample equals
  the removal boundary: its queued tail remains. B has no sample gap/overlap.
- A's only sample gap is deliberate observed absence, 780,307 / 634,252 frames,
  classified `source-missing`. PCM format/sequence/bytes/hashes verified; both
  two-track FLAC MKAs hash-match and decode. Outbox sampled peak 4 then 0.
- Live checkpoints consume all 39/132 and 28/91 durable chunks; no errors,
  duplicate finals or open utterances. Detailed large-v3 STT publishes all
  available tails within one resampling frame. Medium and large-v3 remain
  resident in one Studio process, model-load count 2 through cleanup.
- Built browser UI keeps source A's lane/waveform and shows `Nguồn đang vắng
  · PCM đã lưu`. Saved wide view has 312/600 bars and A's source-missing gap,
  without reload. Isolated settings restored, lease/outbox cleared and test
  services/tab closed. Gate: `docs/gates/livelink-stt-12j-source-absence.md`;
  ignored `.scratch/livelink-stt-12j` retains projects and diagnostics.

Remaining gap: owner installation requires Preferences Install/Repair and OBS
restart. Native observation lags the actual edit by inventory polling; exact
video synchronization and control recovery through scene changes/process
crashes remain in LIVELINK-08. The natural disk-stall cause, cold startup,
reconnect/Script follow and wider source/DPI/portability gates remain open.

Exact next round: `LIVELINK-STT-12K` — reproduce cold-start local listener loss,
distinguish API/Studio/controller failure from health-readiness delay, and
retain recovery evidence. Warm recording success cannot prove cold startup.

## Round LIVELINK-STT-12K — 2026-10-03

Completed scope: isolate a reproduced Studio health delay, repair readiness,
retain process/listener/HTTP transition evidence, and verify controlled runtime
recovery. The historical natural-listener-loss gate remains open.

Evidence:

- A 0.6-second Studio status probe timed out while the three processes/listeners,
  API, controller and proxy remained healthy. Native TCP inventory and netstat
  agreed. Five cycles with a five-second probe budget passed; first status in
  cycles 1–4 took 2.672–3.594 seconds because it imports Torch/probes CUDA.
- Studio now has async health without device/model work. All three launcher
  waits check expected-process exit before/after HTTP, require `status=ok`, use
  elapsed deadlines and retain expected PID, process life, exit code, listener
  and probe outcome. Session PIDs register before readiness; atomic replacement
  prevents partial reads. Failed launch rolls back processes/session.
- The controller logs changed snapshots approximately every two seconds outside
  actions, distinguishing live PID/no listener, dead PID, health timeout and
  foreign ownership. Existing UI runtime state remains a port-ownership contract.
- Controlled launcher replay: while old device status took 3.062 seconds, new
  health remained responsive (max 0.110 seconds). Deliberately exiting API and
  Studio recovered through `/api/runtime/actions` in 26.068 / 22.167 seconds
  from loss to ready snapshots, including the deliberate diagnostic hold.
  Controller PID stayed unchanged across 37 snapshots; each recovery had ten
  stable samples. Sixteen retained transitions distinguish startup, injected
  failure and recovery. Cleanup leaves all three ports free, no test session.
- Red health regressions before repair. Backend **500 passed**, 195.91 seconds,
  two existing warnings. Studio **16 passed**, 1.11 seconds, two deprecation
  warnings. Frontend **54 files / 458 tests**, 59.59 seconds; typecheck/build and
  diff check passed. Portable Core **6/6**, readiness helper packaged/hashed;
  full emitted bundle/physical-transfer acceptance is not claimed.
- ADR 0036; `docs/gates/livelink-stt-12k-runtime-readiness.md`; ignored
  `.scratch/livelink-stt-12k/acceptance.json` and isolated logs retain diagnostics.
  Harness endpoint/output-pipe/failure-injection mistakes are recorded separately
  and not counted as natural product losses. Owner projects/media/OBS unchanged.

Remaining gap: no natural listener loss was reproduced in five empty-data cold
cycles. Readiness delay explains the observed timeout, not the historical 12F
failure. Owner-registry recovery backlog and foreground/detached topology remain
untested with the new evidence. Natural disk-stall cause, owner plugin install,
reconnect/workspace selection/Script follow and wider LIVELINK-08 gates remain.

Exact next round: `LIVELINK-STT-12L` — replay cold startup against an isolated
copy of the persisted recovery backlog and compare foreground/detached launch
topology. This is needed before claiming the original cold-start failure fixed.

## Round LIVELINK-STT-12L — 2026-10-03

Completed scope: replay foreground/detached startup against an independent copy
of the current persisted registry/backlog and retain startup recovery scan
diagnostics. The historical natural-listener-loss cause remains open.

Evidence:

- Copied 37 projects, 58 recording journals, ten live checkpoints, seven detailed
  checkpoints and four MKV follow checkpoints: 43,763 files / 10,475,132,414 bytes,
  no hard links. Registry/media locators point inside the isolated corpus;
  preferences are empty and models use existing local offline runtimes.
- Existing recovery eligibility skips 42 legacy-ready journals and ten completed
  tracks. Final product logs report nine live tracks, one MKV watcher, four MKV
  STT workers and seven OBS detailed workers queued. These are scheduling counts,
  not successful recognizer artifacts or finished transcript tails.
- Six full takes passed: initial foreground/detached ready in 61.922/11.312
  seconds, then corrected-harness controls in 5.547/6.156 seconds and final
  product takes in 5.500/6.093 seconds. Initial takes stayed healthy 90 seconds,
  others 60 seconds. Detached launchers exit zero while API listeners survive.
  No post-readiness listener/health loss occurred in passing takes.
- Initial audit guard resolved every read path unnecessarily; controls remove
  that cost. OS filesystem warmth is uncontrolled, so the slow first take cannot
  prove a product regression. One additional final detached take timed out on
  `/api/projects` with a two-second harness budget after healthy readiness. It is
  retained as incomplete, not declared a listener loss. Fresh retry measured
  project-list latency 0.110 seconds using a 15-second diagnostic budget.
- Product startup logs scan PID, elapsed time and queued counts through existing
  activity stdout. Final scans took 0.277/0.343 seconds. No scheduling, checkpoint,
  public API or deadline changes. No private project/transcript fields added.
- Write audit found no escaped writes; all ports free after every take. Original
  metadata for 43,763 files and hashes for 27,885 JSON inputs remain unchanged.
  No owner OBS/plugin changes. Gate: `docs/gates/livelink-stt-12l-persisted-startup.md`;
  ADR 0036 addendum; ignored `.scratch/livelink-stt-12l/acceptance.json` retains
  each take's samples, failure and cleanup.
- Backend **500 passed**, 182.90 seconds, two existing deprecation warnings.
  Frontend **54 files / 458 tests**, 50.96 seconds; typecheck/build and diff check
  passed. No new audio/model quality or physical viewport acceptance claimed.

Remaining gap: this current snapshot does not reproduce the historical natural
listener loss; neither its original byte state nor a truly cold OS cache is
available. The isolated corpus does not prove sustained inference load. The
single project-list timeout is also unattributed. Future matching failure logs
are needed; repeating successful copies cannot establish those causes. Natural
12H disk stalls, owner plugin installation, exact video timing and wider
LIVELINK-08 source/UI/portability gates remain open.

Exact next round: `LIVELINK-STT-12M` — retain and verify selected project/footage
and Script follow through API restart in the running browser. Runtime health
alone does not prove the owner can continue reviewing the same recording.

## Round LIVELINK-STT-12M — 2026-10-03

Completed scope: preserve the selected project's workspace through unavailable,
busy and post-restart loading states; clear recovered Timeline polling alerts;
verify the same-document archived review in the real browser.

Evidence:

- Two App regressions reproduced workspace unmounting before repair. A stable
  project-keyed workspace now remains mounted beneath an inert recovery dialog
  with bounded keyboard focus. No persistent format or audio algorithm changes.
- Initial browser recovery exposed a stale stopped Timeline alert. Two further
  red regressions reproduce status/journal polling errors; each now clears on
  its own successful response without suppressing real waveform failures.
- Independent real 12D two-track copy: 2,434 files / 138,097,106 bytes, no hard
  links. Two deliberate API exits recover through UI Restart all. Final API
  69092→33876, Studio 37516; controller 68748 stays unchanged. Track 18, recording
  ID, selected Script word, scroll 122px and zoom 2 remain; final transport alert
  disappears. Transcript polling resumes afterRevision144, no initial revision
  request in the restarted log. Browser console has no warn/error entries.
- Muted post-reconnect playback decodes both tracks and reaches about 25 seconds;
  first/last word selection scrolls the Script 0/122px. Automatic word highlight
  during playback is not claimed. Offline media probes find one two-stream FLAC
  MKA and two mono PCM16 analysis WAVs; all are inside the copied project.
- Source metadata for 2,434 inputs unchanged. Owner service listener PIDs remain
  unchanged; all isolated test ports clear, test session removed, tab closed.
  ADR 0037; `docs/gates/livelink-stt-12m-workspace-reconnect.md`; ignored
  `.scratch/livelink-stt-12m/acceptance.json`, browser snapshots and `final.png`.
- Frontend **55 files / 464 tests**, 20.90 seconds; typecheck/build and diff check
  pass. Backend 500 is the carried 12L baseline, not rerun this frontend round.
  Backend/Studio/native/engine source unchanged. No new inference quality claim.

Remaining gap: archived paused review does not prove provisional footage
interaction during actual OBS recording or the full independent-source matrix.
Same-document retention does not add F5 persistence. Historical natural listener
loss, 12H disk stalls, owner plugin install, exact video timing and wider
LIVELINK-08 gates remain open; successful injected recovery cannot close them.

Exact next round: **LIVELINK-CAPTURE-10B**, the existing queued live Media Pool
and independent-source running-app gate. Ongoing capture behavior requires
physical evidence beyond this archived reconnect. No extra 12N round introduced.

## Round LIVELINK-CAPTURE-10B — 2026-10-03

Completed scope: physical provisional-footage interaction, automatic Stop handoff
and five independent-source routing in the running app.

`LIVELINK-CAPTURE-10B` passes the controlled five-source physical OBS/browser
and media gate. During a native 77.86-second recording, Media Pool opens the
provisional footage and all five track controls; Track 9 saved-PCM preview plays
while OBS remains recording. Stop automatically publishes one selected MKA
footage with five tracks, preserving selection without F5 or project reopen.
All 342 PCM chunks pass identity/hash/frame checks with zero interchunk gaps;
five full FLAC streams decode and retain their distinct 330–770 Hz tone mapping.
First callback lag is 28–78 ms; this is not a zero-start-latency claim.
The live screenshot still reports PCM about 13 seconds behind; final chunk
continuity does not close the live latency gap.

No product repair is needed. Raw recording-labelled overflow warnings remain in
the evidence: cumulative idle counters cannot establish per-recording loss.
Owner runtime PIDs stay unchanged; the scratch test project/media are retained,
portable test OBS and isolated services are stopped, lease/spool cleared.
Frontend 55 files / 464 tests (18.03 seconds), typecheck/build pass. Backend 500
is the carried 12L baseline, not rerun. Gate:
`docs/gates/livelink-capture-10b-live-media.md`.

This controlled scene does not close the owner's physical-device/load matrix,
STT quality, natural listener loss, disk stalls, installation or video timing.
Exact next existing round: **UX-08B**, record two actual OBS sessions and reopen
each footage to verify separate media/Script identity and delete/restore. A
single take cannot prove that lifecycle. Voice Training status is unchanged.

Evidence detail: browser `live.json`/`after.json`, screenshots and final media
assertions are retained under ignored `.scratch/livelink-capture-10b/`. Only one
live track is auditioned; all five final streams decode and all five browser
audio elements reach readyState 4. No backend/native/engine source changed.

## Round UX-08B — 2026-10-03

Completed scope: two physical OBS recordings, per-footage reopen/playback/Script,
group recycle/restore, permanent-delete rediscovery and selection-race repair.

`UX-08B` passes the controlled two-recording footage lifecycle gate after a
frontend selection repair. When Media Pool requested another recording,
Timeline briefly echoed its previous local ID back into the workspace, causing
selection oscillation, mismatched Script/audio and alternating requests.
Workspace-requested identity now wins during render; active capture still takes
precedence. A red/green regression covers both selection directions and the
explicit Timeline selector. ADR 0038; `docs/gates/ux-08b-two-recording-lifecycle.md`.

Two actual native OBS sessions in one process produce separate 29.93/43.77-second
MKA footage, each with two tracks and different channel-owned final Script text.
After rebuilding, footage switching/reopen retains matching Script, Timeline and
audio URLs; both tracks decode and play for each take. UI Recycle/Restore groups
parent/children and preserves all IDs/audio hashes. API permanent deletion of
one scratch footage leaves the other intact; browser reload/open shows no ghost.
The UI permanent Delete confirmation flow remains UX-05B. A complete project
backup is retained. All 126 PCM chunks are gap-free and both full MKAs decode.

Final frontend **55 files / 465 tests**, 111.50 seconds with one worker,
typecheck/build and diff check pass. Initial fork timeouts and a two-worker fit
assertion failure are recorded in the gate; they are not passing runs. Backend
500 is the carried 12L baseline, not rerun. Scratch runtime's initial model-cache
error and live STT error events remain documented; this is not STT accuracy or
complete-prefix acceptance. Owned test services/OBS stop, lease/spool clear,
initially free ports return to free; no owner registry or engine source changes.

Remaining: owner hardware, sustained live latency, inference quality, natural
listener/disk failures, installation, video timing and wider UI/DPI/list gates.
Exact next existing round: **UX-09B**, compare Layer/Column controls, clipping and
pointer hit areas at owner viewport/DPI; correct media identity does not prove
visual interaction. No new alphabet round or completed product phase.

Ignored `.scratch/ux-08b/` retains media assertions, before/after browser states,
playback captures, `restored.png`, `final.png`, cleanup and project backup.

## Round UX-09B — 2026-10-03

Completed scope: normal/OBS archive Timeline comparison, header clipping and
pointer/keyboard resizing, stable stacked Layer geometry and media integrity.

`UX-09B` passes the controlled normal/OBS Layer/Column browser comparison
after repairing unbounded stacked Layer height, overlapping header controls and
column keyboard resize jumps. Final screenshot review also catches normal
transport clipping; its desktop board row now reserves enough height. A definite
responsive module height breaks the
viewport/60%-row feedback; headers wrap complete control groups, the selector
shrinks within its label and UNCUT remains visible. Explicit OBS column bases
keep actual width, separator value and 24px keyboard steps consistent.

Copied real two-track UX-08B archives and one imported analysis WAV exercise
12 browser cases at 750×884, 1280×720, 1024×576 and 853×480, all DPR 1. Header
geometry/hit centers pass; Layer playhead reaches both rows; pointer resize,
240px minimum and layout width retention pass. Normal and synchronized OBS
audio play, zoom/gain work, final console is empty and six original media hashes
remain unchanged. The smaller CSS viewports are not physical Windows DPI proof.
Evidence: `docs/gates/ux-09b-timeline-layout.md`, ignored `.scratch/ux-09b/`.

Frontend **55 files / 465 passed**, 119.38s with one worker; strengthened resize
regression goes red/green, focused suite 31 passes, typecheck/build/diff pass.
Backend 500 remains the carried 12L baseline, not rerun. Scratch services stop,
test ports return to free, browser override resets and test tab closes. Owner
registry/media, native plugin and engine source remain intact.

Exact next existing round: **UX-10B**, inspect six or more live OBS sources,
REC/PAUSE, Recorder/mixer outer scroll and physical Windows DPI. Browser archive
geometry does not prove those active-capture and OS-scale behaviors. Sustained
live latency, STT accuracy and the broader LIVELINK-08 matrix remain open.
No new alphabet round or completed product phase; Voice Training is unchanged.


## Round UX-10B — 2026-10-03

`UX-10B` passes the real six-source REC/PAUSE/Resume/Stop and browser layout
gate after repairing mixer clipping and a heartbeat/lifecycle ordering race.
The heartbeat formerly advanced OBS state before its queued Pause event,
blocking the event and later control ACKs. An open video span now advances
through native lifecycle events; ADR 0039 records the decision.

A separate portable OBS 32.2.2/bridge 0.6.9 instance captures six muted,
unmonitored mono PCM16/48kHz tone sources with long names and slots 1–6.
Browser checks at 1600×1000, 1280×800 and 750×884 (DPR 1) verify six blinking
REC, six steady two-bar PAUSE, Resume, idle after Stop, Recorder/mixer outer
scroll, the Layer playhead reaching lane 6, and Column widths >=240px. The
narrow desktop mixer now measures 296px instead of overflowing to 372.875px.
Evidence: `docs/gates/ux-10b-six-source-capture.md`, ignored `.scratch/ux-10b/`.

Frontend **55 files / 465 passed**, 144.92s; backend **501 passed**, 162.92s;
new ordering regression fails before repair and passes after; runtime suite
24 passes, typecheck and production build pass. This is a tone-source gate,
not physical microphone or speech-quality acceptance. No native plugin or
engine source is changed.

Final media gate: **2,524 PCM chunks** pass sequence, size and SHA256 checks.
The 18,239,361-byte MKA has six decodable FLAC streams with the six expected
tone frequencies and peak 6000 (no clipping in sampled audio). Six mono/24kHz
analysis WAVs span about 652.68s; each source has only the two declared
app-paused sample gaps. Media Pool shows the ready six-track asset without
a reload after Stop. The stop-to-archive delay is roughly five minutes in this
run; it remains a performance gap. Raw artifact evidence is
`.scratch/ux-10b/media-acceptance.json` and `final-summary.json`.

Cleanup: the native spool is empty, the owned OBS process and scratch runtime
are stopped, ports 18119/18120/18081/4466 are free, the runtime session file is
removed, and the browser override/tab are reset/closed. Project artifacts and
raw evidence remain under ignored `.scratch/ux-10b/`.

Physical Windows readings are 96 DPI (100%) on all three monitors. Actual
125/150% scaling remains open; CSS viewport reductions do not prove it.
The live run accumulates a native disk-spool backlog, so six-source waveform
latency and loss-free-start acceptance are not claimed. Sustained latency,
STT accuracy and the broader LIVELINK-08 matrix remain open.

Exact next existing round: **UX-11B**, inspect named recording selectors and
11.2px channel labels with multiple recordings at the owner's viewport.
No new alphabet round or completed product phase; Voice Training is unchanged.


## Round UX-11B — 2026-10-03

`UX-11B` passes the controlled running-browser recording-name and track-label
gate with two copied real OBS archives. Owned metadata fixtures exercise a
legacy name fallback, a long Vietnamese project/source name and a short label.
Stored recording names remain stable; dropdown and keyboard selection update
the full selected tooltip. Script and selector retain the selected recording.

Both themes at 1280×720, 750×884 and 853×480 (DPR 1) show the selector inside
its wrapping header and labels on one line. Label size is 11.2px times the
existing font scale (1.08, actual 12.096px). The long label scrolls at the
240px Column minimum; the short label stays still, and keyboard focus pauses
scrolling. No new source repair is needed for the observed views.
Evidence: `docs/gates/ux-11b-recording-names.md`, ignored `.scratch/ux-11b/`.

Frontend **55 files / 465 passed**, 121.32s; typecheck, production build and
diff check pass. Backend **501** is the carried UX-10B baseline, not rerun;
backend and frontend product source are unchanged. Eight original media hashes
remain unchanged. Scratch services are stopped, 18219/18220/18281 are free,
the session file is removed, and browser size/theme are restored and tab closed.

Physical Windows DPI 125/150% and an actual reduced-motion preference remain
unverified (current system DPI 96, DPR 1, reduced-motion false). The six-source
PCM backlog and roughly five-minute Stop-to-archive delay from UX-10B remain
open; archived label acceptance cannot establish live latency or STT quality.

Exact next existing round: **UI-CONTRAST-01B**, inspect highlighted states
throughout the running app in both themes at the owner viewport. Name/selector
checks do not prove inherited text contrast in every highlighted UI.
No new alphabet round or completed product phase; Voice Training is unchanged.

## Round UI-CONTRAST-01B — 2026-10-03

`UI-CONTRAST-01B` repairs shared status/highlight foreground colors in both
themes, clone badges, selected chips, library counts, overlap and Remove text,
muted captions and console timestamps. Controlled browser acceptance covers
29 observed states / 863 text readings at 1280×720, DPR 1: no reading below
4.5:1; minimum 4.75:1. See `docs/gates/ui-contrast-01b-highlight-text.md` and
ignored `.scratch/ui-contrast-01b/` for measurements, screenshots and limits.

Frontend **55 files / 465 passed**, 114.49s; typecheck, production build and
diff check pass. Backend **501** is carried from UX-10B, not rerun; no API
changes. Eight source media hashes remain unchanged. Owned services are
stopped, 18219/18220/18281 free, session removed, theme restored, tab closed.

Physical Windows 125/150% DPI, native OBS/select dialogs, populated output /
profile and model-run states, custom emotion colors and exhaustive interaction
coverage remain open. Current Windows DPI is 96 (100%). Browser checks also
retain isolated last-page WinError 5 and Voice Changer worker import failures
as limitations, not audio-device acceptance. UX-10B six-source PCM backlog /
five-minute archive delay remains unresolved; CSS does not prove STT quality.

Exact next existing round: **GAP-PLAN**, reconcile verified remaining code and
acceptance gaps into ordered rounds. No new alphabet round or completed phase.

## Round GAP-PLAN — 2026-10-03

`GAP-PLAN` reconciles current code, latest physical/browser evidence and
historical queued follow-ups. The continuation plan is
`docs/GAP-PLAN-2026-10-03.md`; local tickets are `.scratch/gap-plan/`.
There are **13 scheduled rounds + 2 conditional repairs** for the near-term
capture/STT/UX work. Later training/docking/Manipulator/LipSync/release milestones
are separate and not counted as completed or as one-invocation estimates.

Exact next: **PROJECT-WRITE-01**, reproduce and repair manifest/registry atomic
write failures; UI-CONTRAST logs contain WinError 5 and the repository reuses
fixed temporary paths. Concurrency is a hypothesis to prove, not a confirmed
root cause. **RUNTIME-VOICE-01** follows for the actual bundled worker's
voice_stream import failure. Then profile the six-source spool/Stop tail,
conditionally optimize the measured bottleneck, freeze Vietnamese STT quality,
and complete growing-MKV, export and residual physical acceptance.

Passed capture/label/contrast slices are retained. Six-source backlog/five-minute
archive delay, real speech accuracy, physical 125/150% DPI, clean-machine transfer,
calibrated speaker publication and later product phases remain open. Restored
08N outbox recovery and consolidated historical gates have explicit criteria.

Planning only: no product code/media/model/runtime changes. Documentation
references, requirement IDs, dependency order and ledger pointers are checked;
diff hygiene passes. Frontend **465 / 55 files** and backend **501** are carried
baselines, not rerun. See the validation evidence in `.scratch/gap-plan/`.


## PROJECT-WRITE-01 — 2026-10-03

`PROJECT-WRITE-01` completed the project metadata persistence seam. Windows
stress reproduced shared staging-file access failures (7/8 workers); deterministic
regressions proved payload collision and stale reopen overwrites. Repository
transactions now serialize per registry within the API process; atomic writes
use unique closed/fsynced staging files and bounded Windows sharing retries.

Evidence: repository **16 passed**, backend **507 passed**, frontend **465 / 55
files**, typecheck/build passed. The running browser changed pages while eight
HTTP workers completed **640/640** mutations, then a fresh API retained metadata
and a copied project reopened with portable manifest/registry paths. Gate:
`docs/gates/project-write-01-persistence.md`; ADR 0040 records scope/limits.

There are **12 scheduled rounds + 2 conditional repairs remaining** in
`docs/GAP-PLAN-2026-10-03.md`. Exact next: **RUNTIME-VOICE-01**, diagnose the actual
bundled worker's `voice_stream` import failure and prove protocol replies. This
blocks Voice Changer device enumeration. Six-source archive delay, STT quality,
physical DPI, clean-machine transfer and speaker publication remain open.


## RUNTIME-VOICE-01 — 2026-10-03

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

## Round LIVELINK-INGEST-18A — 2026-10-04

Completed isolated six-source profiling and the pre-optimization decision.
No product code, installed plugin, pairing or original project is changed.
New standalone profiling tools replay retained UX-10B data into owned projects
and run the actual native callback/queue and FULL/WAL spool paths separately.
Evidence: `docs/gates/livelink-ingest-18a-profile.md`, its metrics JSON, and
ignored `.scratch/livelink-ingest-18a/`.

All **2,524 chunks / 573,421,416 bytes** pass size/hash/sequence checks. Twelve
sample gaps equal the previously verified Pause gaps. A real six-stream MKA
passes decoded PCM/identity/attachment verification; six mono/24kHz analyses
have the expected duration and exactly match retained analysis PCM hashes.
Native spool verifies all chunks and finishes empty. Synthetic callback fixture
passes 1,500 callbacks / 720,000 continuous frames with zero overflow; its
controlled queue hold is not physical latency.

Full HTTP replay drain **417.734s**, ACK p50/p95 **129.959/302.854ms**,
last ACK to ready **48.860s**. Durable PCM/metadata publication consumes
**78.63%** of API chunk time (297.839s total); individual overlapping fsyncs
p50/p95 **86.062/216.478ms**. This is the one chosen 18B seam. Native spool
append and ACK commit totals are separately **54.476s / 10.767s**. The matched
120-chunk probe shows a 5.48% observed wall-time delta, including storage/cache
variation; the report does not claim it isolates causal instrumentation overhead.

Retained live spool peak **878**, pre-Pause slope **1.543 chunks/s**. Stop to
last receive **325.194s**, receive to ready journal mtime approximately
**36.272s**; these are receive/mtime proxies, not an exact durable ACK clock.
99 idle overflow logs are excluded; six startup deltas remain unclassified.
The retained sample chain does not prove loss-free startup. Missing per-chunk
callback residence and exact native Stop-to-ACK clocks remain explicit live gates.

Focused backend runtime/responsiveness suite **26 passed**, 26.17s, two existing
deprecation warnings. Native profiling Release builds and fixtures pass; Python
scripts parse and diff whitespace passes. No production/frontend source changes,
so full suites and plugin packaging are not rerun for this profiling round.

Frozen identical replay workload, source catalog hash, and actual six-source
OBS schedule/budgets are recorded before optimization. Baseline exceeds the
ACK/ready budgets, activating 18B. Exact next: **LIVELINK-INGEST-18B**, optimize
only the durable-pair seam and verify the frozen replay plus actual OBS gates.
No product phase is completed and no latency improvement is claimed in 18A.

## Round LIVELINK-INGEST-18B — 2026-10-04

Measured four safe pair-writer alternatives, then rejected the strongest
screening candidate against the full frozen workload. No production optimizer,
installed plugin, pairing or original media changes. Candidate reuses two
writers and coordinates both writes before retaining both fsyncs and ordered
PCM/metadata publication. All 2,524 chunks and six-stream/archive/analysis
integrity pass; every analysis PCM hash equals retained UX-10B.

Ingress 406.961s versus baseline 417.734s: **2.58% lower**, not the frozen 30%.
ACK p50/p95 **119.761/302.916ms** fail <=100/150ms; ready tail **24.159s**
passes <=45s. Archive code is unchanged, so its elapsed variation is not
attributed to the pair writer. Windows write-through plus fsync and staged
sequential sync are slower in paired probes. Writer reuse/coordination does
not remove the dominant flush cost. The budget comparator correctly returns
exit 1 with three failed performance gates.

Full backend **516 passed**, 176.06s, two existing deprecation warnings; full
frontend **55 files / 468 passed**, 29.78s; typecheck/build pass (Vite 1.14s).
Evidence: `docs/gates/livelink-ingest-18b-candidate.md`, comparison JSON and
ignored `.scratch/livelink-ingest-18b/`. Reusable process-local candidate and
budget comparator live in scripts/profiling; they are not installed product code.

**18B is not complete**, no live latency improvement is claimed and the
actual OBS gate is not run for the rejected candidate. Following the frozen
scope's required separate review, exact next: **LIVELINK-INGEST-18C**, evaluate
bounded independent-source group durability and its transport/API contract
before integration. Both fsyncs and every frozen budget remain mandatory.
Other scheduled rounds retain their order after this prerequisite work.

## Round LIVELINK-INGEST-18C — 2026-10-04

Measured independent-source group storage feasibility. No product/plugin/pairing
or original media changes. Persisted 60 groups of six retained sources for
concurrency 1/3/6; all 360 pairs per variant preserve two fsyncs and ordered
publication and pass saved-byte/source-hash checks. Concurrency six cuts group
wall time **53.15%**, 61.151s to 28.652s, but pair p50/p95 becomes
**314.842/635.725ms**. Storage throughput is promising; frozen ACK budgets fail
before any API/network/STT overhead. This is not full replay or live latency.

A human budget-choice question is pending: keep all frozen thresholds, or
evaluate actual audio-to-waveform <=3s/non-growing backlog without weakening
durability. No answer is inferred from time; no integration is shipped and the
old budgets remain unchanged. A conditional contract draft covers source order,
bounded buffering/writers, per-chunk durable ACK, partial/crash/duplicate replay,
lifecycle/Stop/finalize exclusion and old plugin/API compatibility.

Full backend **516 passed**, 417.62s, two existing warnings. First frontend run
has 38 worker startup errors (only 133 tests ran); after backend completes,
full rerun with four workers passes **55 files / 468 tests**, 30.30s. Typecheck
and build pass (Vite 280ms); no test filters/skips or config changes. Exact cause
of startup timeouts is unconfirmed. Profiling scripts parse; whitespace passes.
Evidence: `docs/gates/livelink-ingest-18c-group-feasibility.md`, group metrics,
and ignored `.scratch/livelink-ingest-18c/groups/`.

Measured scope is retained, but 18B/18C integration/actual OBS acceptance is
open. Exact independent next while awaiting the budget answer:
**LIVELINK-08N**, outbox health and retained-chunk recovery (depends on 18A).

## Round LIVELINK-08N-A — 2026-10-04

Completed one native/API/UI health seam from the 08N ticket. Authenticated
optional v3 hello/heartbeat exposes retained/rejected count, oldest retained
age, worker chunks not on disk, memory frames, attached-Track overflow and
last SQLite failure. Counts cover all recordings; rejected is a subset of
retained. Legacy plugins/rows and unavailable storage remain unknown; expired
reports are stale. Meter/waveform never substitute for durable acceptance.

Nullable enqueue-clock migration preserves old PCM/provenance. FULL/WAL,
ACK deletion and capture/Stop semantics remain unchanged. Native Release build
and **2/2 CTest** pass (6.63s), including real SQLITE_FULL simulated with a
bounded page cap and byte-preserved earlier PCM. HTTP telemetry regression
first exposed a discarded Pydantic field, then passed after optional request
fields were added. Final full backend **526 passed**, 164.38s, two existing
warnings; frontend **471 / 55 files**, 35.53s; typecheck/build pass. Isolated
real-browser fixture checks stale/unreadable/legacy states, readable wrapping,
no horizontal overflow at 528px and no console errors/warnings. Owned Vite/tab
closed; no owner runtime, installed plugin, source media or pairing changes.

Evidence: ADR 0041 and docs/gates/livelink-08n-a-outbox-health.md. Parent
**LIVELINK-08N stays open**: scoped retry/export and longer multi-source API
outage/Stop recovery need their own verified write/recovery seam. Reviewed
exact next **LIVELINK-08N-B**; this split does not reduce the parent acceptance
criteria or near-term remaining parent count. 18B/18C performance and pending
human budget decision remain open. No loss-free capture or latency claim.

## Round LIVELINK-08N-B — 2026-10-04

Completed the bounded recovery seam and parent 08N's measured acceptance.
Stopped-record scoped snapshot/digest prevents stale retry; retry clears only
rejected flags and explicitly does not imply durable acceptance. Recovery ZIP
preserves exact PCM/metadata/hash/journal under project exports. Deleted/project/
active-record guards, existing recording locks, SQLite FULL/BEGIN IMMEDIATE and
bounded busy waits retain originals on failure. Native waits occur off callbacks.
UI recovery errors survive successful status polling; no footage is recreated.

Actual private OBS 32.2.2/package 0.6.10 six-tone fixture records through API
outage (93.859s to readiness, 75s recorded offline), then Stop and OBS/API
restart. Controlled quarantined PCM exports while OBS is offline, remains
retained after reconnect, retries one row and drains to ACKed outbox 0. 343
retained in-record rows match exact bytes, six boundary prefixes match, 102
outside-Stop rows are explicitly trimmed. No internal sample gaps or recording-
attributed overflow log; exclude 265 idle overflow entries / 13,112,832 frames.
Initial source-absence intervals remain visible; no loss-free startup claim.
Six FLAC streams and six mono/24kHz PCM16 analyses have correct 330-880Hz tones,
peaks 6000-6332/no clipping, durations within 1ms. STT is stubbed only in this
resilience fixture, so no quality/performance claim. Harness bootstrap/config
and cached-outstanding injection failures are retained and explained in the gate.

Final backend **536 passed**, 193.91s/two existing warnings; frontend **473 / 55
files**, 30.92s; typecheck/build pass (274ms); native **2/2**, 6.03s. Native package
0.6.10/fixture/installed hashes verify. Owned processes close/ports free; ordinary
installer Repair updates closed owner OBS with pairing bytes unchanged and no
Admin prompt. Owner OBS is not opened. Evidence: ADR 0042, 08N-B gate and metrics.

Exact next **LIVELINK-STT-19A**, reviewed Vietnamese multitrack speech accuracy,
word timing/turn/padding/overlap evidence for LiveLink and growing MKV. Remaining
18B/18C latency/integration/budget decision stays open. This round completes no
product phase and does not treat tone recovery as recognizer-quality evidence.

## LIVELINK-STT-19A — Vietnamese speech baseline (2026-10-04)

Completed this invocation: frozen scoring and two real-model runs on 16
historical curated owner-voice clips split across two tracks. Source media is
read only. LiveLink uses actual adapter cadence; growing MKV publishes an
initial complete-cluster prefix, appends new bytes and drains detailed blocks
with 10 seconds of leading context. No production tuning or model change.

Warm CER/WER: LiveLink live 22.97%/26.62%, detailed 11.88%/13.15%; MKV live
51.72%/70.45%, detailed 9.19%/10.71%. Cold LiveLink has one request timeout;
warm still fails CER without errors. Proposed budgets were frozen beforehand,
not approved by the owner. Original hashes and final lossless PCM match;
mono24k/PCM16, 116.454 seconds each, no clipping.

Browser: two Timeline instances, detailed words, shared seek without autoplay.
Script rows span inserted silence; overlap survives but is fragmented; MKV
Timeline range highlight is unproved. Full 19A acceptance stays open: reviewed
word anchors, temporal silence/seam review, physical OBS/capture clocks,
row/overlap and budget acceptance. No measured latency percentile is invented.

Validation: scorer 11; backend 547 (two existing warnings), frontend 473 in
55 files, typecheck/build and Python compilation pass. Owned services/ports/tab
close; owner runtimes/media remain intact. No product phase advances.
Evidence: `docs/gates/livelink-stt-19a-speech-quality.md` and metrics JSON.
Exact next **LIVELINK-STT-19B** selects one LiveLink live recognition accuracy
candidate on this corpus. MKV, cold-start and row/overlap failures need separate
bounded scopes; 18B/18C human latency decision remains open. Stop after this round.

## LIVELINK-STT-19B — larger model candidate rejected (2026-10-04)

Real large-v3 live candidate on frozen 19A speech reduces CER to 20.87% and
WER to 22.56%, still failing <=15% CER. Warm cadence plus drain takes 159.516s
versus 117.391s medium baseline; no exact latency percentile is inferred. Zero
request errors and original hashes unchanged. Product remains medium; no timing,
physical or phase acceptance advances. See
`docs/gates/livelink-stt-19b-model-candidate.md` and metrics JSON.
Exact next **LIVELINK-STT-19B2**, one medium beam-search candidate. The owner
requested sequential rounds in this session; commit each before proceeding.

## LIVELINK-STT-19B2 — beam-search candidate rejected (2026-10-04)

Medium beam search 5 on the unchanged 19A corpus yields CER 22.17%, WER 25.97%,
still failing <=15% CER. The candidate is rejected; production beam 1/medium is
unchanged. Source hashes match. No physical/timing or phase acceptance advances.
Evidence: `docs/gates/livelink-stt-19b2-beam-candidate.md` and companion JSON.
19B recognition acceptance remains open; further context/segmentation diagnosis
must use a separate scope instead of lowering budgets. Exact next independent
queued work is **MEDIA-STAGES-02**; it does not depend on 19B acceptance.

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

## VOICE-EXPORT-13B1 — truthful export handoff (2026-10-04)

Completed bounded repair: browser handoff is no longer reported as a confirmed
saved download; Voice Output SRT displays the count of cues omitted for untrusted
timing. Selected-output identity, API WAV bytes and word/line cues verified.
Backend 557, frontend 477/56 files, typecheck/build pass. Actual browser download
artifact/cancel/move evidence remains open after browser interruption; parent
VOICE-EXPORT-13B is not accepted. See docs/gates/voice-export-13b-handoff.md.
Next bounded work VOICE-EXPORT-13B2 export interval validation; MKV-ACCEPT-01
reviewed timing/recognition prerequisites remain open. No phase advances.

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

## LIVELINK-INGEST-18B2 — descriptor writer rejected (2026-10-04)

60-pair interleaved E: probe preserves two fsyncs and PCM-before-metadata; all
persisted/source bytes exact. Raw descriptor writer takes 5098.945ms vs current
4663.421ms (9.34% slower); candidate rejected before full HTTP/live OBS gate.
Production is unchanged; 18B acceptance remains open. Evidence:
docs/gates/livelink-ingest-18b2-raw-pair.md and JSON. Product validation carries
from 9c88c92 (backend 561/frontend 477/typecheck/build); helper checks follow in
18C2. Exact next requested scope 18C2 two-pair concurrency screening. No phase
or scheduled-round completion advances.

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

## RUNTIME-READY-01C — controller startup deadline (2026-10-04)

Completed a bounded launcher repair after owner PID 19904 timed out alive with
no listener at 31.126 seconds. The controller error log shows Uvicorn completed
startup; the action observer recorded the same PID owning port 18119 with
health `ok` about 0.6 seconds after the deadline. A prior same-day controller
launch needed 20.680 seconds. Raised only the controller readiness budget from
30 to 60 seconds, retaining the process-exit and HTTP health requirements.

Focused launcher/controller tests: 11 passed, one existing Starlette warning.
Normal full-stack launch passed: controller 3.615 seconds, Studio 6.896 seconds,
API 16.756 seconds; all three health endpoints returned `ok`. This warm launch
does not reproduce the cold delay or identify its underlying cause. The stack
is running for owner use. `git diff --check` passed. No product phase advances.

Remaining gap: a controller startup exceeding 60 seconds, or a repeatable
profile of the cold delay, remains unverified. If it recurs, exact next runtime
round is RUNTIME-READY-01D: capture pre-bind import and host I/O timing before
changing another deadline. The independent queued UX-05B round remains open.

## UX-05B1 — copied-project list and playback browser sweep (2026-10-04)

Three populated Sound Library, Voice Output and Script lists pass Shift range,
Ctrl toggle and Ctrl+A in the running browser. Bulk profile color and Script
speaker assignment apply to all selected rows. A copied two-track OBS footage
passes recycle, view/play while recycled and Restore; the other remains intact.
Overlap selection seeks without autoplay; Space plays/pauses both tracks and
Timeline drag seeks them while paused, in both themes. All 132 copied media
files match the untouched source by SHA-256. Synthetic Voice Outputs are list
fixtures only. Full backend **561**, frontend **477 / 56 files**, typecheck and
build pass. No product source changed or phase advanced.

Remaining gap: permanent-delete UI confirmation/restart tombstone, pending
footage navigation and Voice Output bulk deletion are open. The irreversible
browser step awaits action-time approval for the copied recording. Exact next
bounded UX round is **UX-05B2** for those gates; see
`docs/gates/ux-05b-list-browser.md`. Parent UX-05B is not accepted.

## UX-05B2 — copied-project permanent deletion and restart (2026-10-04)

After owner approval, UI Delete removed copied recording `55224012`. Its tab
timed out, so the result was verified independently after API/Studio restart:
the browser lists only the surviving `fa1f74e5` recording, the deleted OBS
directory and Media Pool index entries are absent, and the original retained
project still has them. All 225 surviving OBS files match the original by
SHA-256. Separate owner approval allowed bulk removal of three synthetic tone
Voice Outputs; UI confirmed three and left the real copied output untouched
with matching audio SHA-256. No product code changed. UX-05B remains open for
pending native-footage navigation. Separately, Hub Open Existing's folder picker
fails because portable core Python lacks `tkinter`; media file picking has a
Windows Forms fallback that was not exercised. See
`docs/gates/ux-05b-list-browser.md`.

## VOICE-EXPORT-13B3 — real-output browser handoff (2026-10-04)

A copied real 78.746-second output produced 12 line SRT cues and 333 word SRT
cues, all within audio bounds; UI reported 18 untrusted word cues skipped.
The output WAV matches its source by SHA-256. UI reported each format sent to
the browser, but the in-app browser emitted no download event, so saved-file
and cancel acceptance remain open. Product code unchanged. See
`docs/gates/voice-export-13b-browser-real.md`.

## RUNTIME-FOLDER-PICKER-01 — portable Open Existing fallback (2026-10-04)

The running Hub's Open Existing folder picker failed with `No module named
'tkinter'` in the isolated core runtime. The folder picker now uses the same
Windows Forms fallback approach already used by the media file picker. Three
focused tests cover a Unicode selected path, cancel, and dialog error; the
existing media-picker test also passes. A local Windows Forms dialog object was
constructed and disposed. Full backend 564 passed; frontend 477/56 files,
typecheck and build passed. Controller, API and Studio health are `ok` after
workload restart.
Actual native folder selection through the running portable process remains
unverified. See `docs/gates/runtime-folder-picker-01.md`.

## UX-CONSISTENCY-01 — consolidated owner UI requests (2026-10-05)

Completed the owner-requested group in one round: Hub bulk Delete, uniform
filled waveform envelopes based on Conviction, selection-driven Script with
no track/original switches, per-row and multi-row Speaker assignment, readable
profile dropdowns in both themes, Train-only footage/track visibility, and
floating word-time tooltips. Retained the table/prose display choice and renamed
it DẠNG BẢNG in both Script surfaces. Row selection moved beside Speaker.

Frontend 491/57 files passed; final Voice Script label follow-up 12 passed.
Backend 564 passed with two existing deprecation warnings; typecheck/build and
diff check passed. Browser verified real copied Conviction rows: single-row
assignment changed exactly 27 words and preserved text/timing/raw diarization;
bulk rows, multi-footage/empty selection, Train filtering, themes and tooltip
geometry passed. Copied OBS and real TTS waveforms verified. Owner source media
and word data preserved. Evidence: `docs/gates/ux-consistency-01.md`.

Normal launcher start restored the stopped controller and reclaimed two orphan
workload trees; readiness controller/Studio/API 2.909/3.302/3.611 seconds, health
ok. No new physical capture/model run, phase completion or independent gate
advances. Earlier cold-start profiling and unrelated UAT gaps remain open.

## WAVEFORM-VOLUME-01 — waveform follows track volume (2026-10-05)

Fixed OBS/imported multitrack SVG envelopes ignoring gain and mute. Shared
geometry applies per-track linear amplitude before clipping; other tracks,
gaps and detailed viewport PCM remain intact. Main Timeline's existing draft
3/12 and committed dB gain behavior is covered by a canvas regression.
Two SVG regressions failed before the fix. Final focused suite 103/7 files,
full frontend 497/57 files, backend 564, typecheck/build/diff check pass.
Real copied OBS browser displacement 22.99 -> 11.50 at 50% gain; mute -> 0;
other track unchanged. See `docs/gates/waveform-volume-01.md`.
No source PCM was edited or new hardware capture claimed. Next executable
round UX-05B3 pending-footage navigation; STT-19B3 context candidate follows.

## UX-05B3 — pending OBS navigation (2026-10-05)

Owned journal-only copy opens real saved PCM/Script with two waveform lanes.
Track selection works; returning to the parent reproduced a stale selectOnly
channel filter. Red regression mic-1:true versus none:false; clear transient
seek request on parent open fixes it. Browser restores 1 track row -> 4 parent
turns, 30-second PCM preview remains paused/readyState4, two themes pass.
All 72 copied audio/PCM hashes match the source. Full frontend497/backend564,
typecheck/build/diff check pass. See `docs/gates/ux-05b3-pending-navigation.md`.
Parent UX-05B controlled browser acceptance is complete with 05B1/05B2.
Native picker and fresh owner-device capture are separate open gates. Next
executable STT-19B3 context candidate and ingestion18D feasibility; no phase
advances. Nine near-term parent rounds remain; partial candidate work does not
reduce that count until acceptance succeeds.

## LIVELINK-STT-19B3 — silence/context candidate rejected (2026-10-05)

Baseline29 final spans for16 reviewed-reference turns;9 turns fragmented.
Private threshold1.1s candidate removes fragmentation (16 final spans) but
raises CER22.97 ->27.26% and WER26.62 ->31.33%; paced final-event lag proxy
14.344 ->18.641s. Frozen15%/30%/8s budgets fail; reject candidate, no production
setting or threshold changes. All16 source hashes pass; real cachedmediumCUDA
inference on existingStudio, no restart. Script parse/diff checks pass;
frontend497/backend564 remains the integrated UI baseline.
See `docs/gates/livelink-stt-19b3-context.md` and aggregate metrics. Full19A
timing/physical evidence and19B recognition remain open; nine parent rounds
remain. Next19B4 tests a concrete internal-quiet-PCM compaction hypothesis
without also changing the silence/window settings.

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
