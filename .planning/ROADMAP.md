# Roadmap: Pro4Bro Voice Manipulator

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
- [ ] 06-01: LipSync page, adapter contract, render lifecycle, engine gate, and QC.

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
| 6. LipSync | 0/1 | Planned | Plan only |
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
