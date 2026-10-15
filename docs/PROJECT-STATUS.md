# Project Status — 2026-10-15

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

## Voice Manipulator — first five checklist rounds

Owner requested VM-GEN-01, VM-SCRIPT-01, VM-REF-LIB-01, VM-SELECTION-01 and
VM-REF-ASSIGN-01 in sequence. Main source now has project-owned Script hierarchy /
settings, Reference Library roles/import, shared exact/disjoint selection and a
three-origin multi-reference assignment editor/store. Cache content fingerprints,
validated recovery/reuse, original-text lineage and stale binding safeguards were
repaired. Live local-API PCM imports/assignment/move/reopen/source hashes passed.

CPU and sandbox GPU smokes timed out; native Windows GPU execution subsequently
created actual full/clone/LoRA Script WAVs with two imported profiles. Edit-one/
reuse2, Stop-at2, retry3/3 and moved-project reuse3/3 passed. Reference/output
hashes, PCM/boundaries and lineage passed; frontend844/backend870 and build pass.
Identity/listening and measured word alignment remain separate. Browser unavailable, so browser/native UAT
remains open. Requested duration/delivery/reference properties are persisted
intent; later processors are not claimed. See ADR0076 and
docs/gates/voice-manipulator-first-five-20261015.md for final checks/commits.
Next implementation VM-REF-DETAIL-01 includes slot content-click navigation to
both Timeline and Script. Phase03 stays60%; no portable release. Existing
SOURCE-EXTERNAL-ASSETS-01 and HUB-COLLECTION-UAT-01 remain queued.

## HUB-COLLECTION-01 — main-source Hub and Collection

Card hover/detail layout repaired; LOCAL/PROJECTS removed. Collection counts
distinct profiles, expands model rows, selects profile/model checkboxes, and
uses native multiselect ZIP import/folder export. Archived-model jobs cache and
transfer measured >=15s PCM samples with adjacent metadata Script. New lineage
may retain a raw-hash-verified Dataset Manifest for training seconds; legacy
unknown metadata and RVC scripted-preview limitations remain honest.
Frontend818pass, focused20, typecheck/build pass. Backend full848pass/3startup
timeouts, unchanged exact rerun3pass, final focused88pass. IAB hover/detail/count/
selection/two themes and six-model scroll-to-end verified. Actual Anh Vũ CPU run
stopped after583.06s without WAV; trained GPU/native-dialog acceptance remains
HUB-COLLECTION-UAT-01. See docs/gates/hub-collection-01-20261014.md and ADR0075.
No new portable or Phase03 advance (60%). Pull the existing feature branch and
restart the source app. SOURCE-EXTERNAL-ASSETS-01 remains next implementation.

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

## PORT-FEEDBACK-02 — selected playback and external voice packages (2026-10-13)

Source repairs ship in alpha0.5.12: selected track subsets control audio players
and Script; Gain/Mute/Solo survive view/selection changes within the project
session, with S below M and Mute winning. Stopped failed OBS journals have
context-menu Open/Retry/Recycle and reachable bin Restore/confirmed deletion;
PCM survives recycling and processing/recovery guards respect deletedAt.
Voice Collection exports/imports verified per-model ZIPs for LoRA/full/RVC,
preserving referenced artifacts/lineage and excluding shared base/runtime.
Frontend795/84files, backend819, typecheck/build pass. Actual root UPDATE33/0,
154source/payload/installed app byte checks and1,223,639byte ZIP verified; base
unchanged. Real source/portable UI matches two players/two Script rows and
remembered mixer controls. Native portable imports source ZIP and exports
identical payload/lineage. See docs/gates/portable-feedback-02-20261013.md and
docs/VOICE-COLLECTION-TRANSFER.md. Next PORT-FEEDBACK-UAT-02 is D-machine0.5.12
apply, failed-take menu/bin, selection/Mute/Solo and actual trained-voice transfer
plus inference. Native zero-PCM capture cause remains unconfirmed; synthetic
fixtures do not prove training/inference quality. Phase03 stays60%; timing
awaits Conviction. Main-first/numbered-update parity is a durable owner rule.

## PORT-REBUILD-01 — fresh app and manual base copy (2026-10-13)

Alpha0.5.11 rebuilds and independently copies the current app, uses canonical
Studio source and supplies a twelve-component core/model copy guide. VibeVoice
is listed but absent. Root VERIFY marks deferred readiness only on full success.
Shared OBS row action grouping fixes the narrow-column Retry overlap; installer
migrates console paths from older versioned portable folders without changing
pairing. Frontend785/84files, backend799, installer33, native builder/completion9,
typecheck/build pass. Actual hydrated VERIFY33/0; thin delivery remains pending.
ZIP1.17MiB,151app hashes verified; complete component size about35.6GiB. Eight
production catalogs/174routes match except intentional VibeVoice availability
and recorded Git metadata. Real portable nonzero PCM publishes MKA/analysis WAV;
browser shows proper parent/child/waveform. Meter without PCM reproduces the error
but does not establish the D-device cause. See
docs/gates/portable-rebuild-20261013.md. Next PORT-FEEDBACK-UAT-01 is new D-folder
manual copy/VERIFY, closed-OBS INSTALL, native Forward/durable PCM recording and
prior playback/STT/bin acceptance. Phase03 stays60%; timing awaits Conviction.

## PORT-OBS-REPAIR-01 — default OBS installer recovery (2026-10-13)

Alpha0.5.9 resolves the owner's damaged-manifest Install failure: root BAT
defaults to CLI auto mode, selecting Repair for missing/changed installed files.
Scoped native stderr capture reports Python exit code and original reason.
The manager still checks package hashes, OBS compatibility/running state and
preserves pairing. Installer29pass; frontend785/84files, backend786pass,
typecheck/build pass. Actual received pack33/0,151 installed/ZIP hashes checked,
models unchanged and four root BATs retained. Embedded Python/real package
probe covers fresh/healthy/damaged/missing installation and running-OBS refusal;
pairing remains byte-identical. See docs/gates/portable-obs-repair-20261013.md.
Next PORT-FEEDBACK-UAT-01 is owner's D-drive0.5.9 apply, closed-OBS root INSTALL,
native loading after reopen, then prior playback/bin acceptance. Actual UAC/OBS
loading remains physical evidence. Phase03 stays60%; timing awaits Conviction.

## PORT-UPDATE-LOCK-01 — stop controller during app updates (2026-10-13)

Alpha0.5.8 fixes the owner's Move-Item failure: the updater previously stopped
API/Studio while the controller retained services/api as its CWD. Native Windows
repro goes red at the same old line272. Now all three roles are checked/stopped,
ports must be free before replacement and console restart reloads the controller
after update or rollback. Native16pass; frontend785/785, backend779/779,
typecheck/build pass. Actual installed pack updater stops a real
embedded controller and passes33/0;151 ZIP/installed hashes verified, base/model
hash unchanged. Final isolated tests preserve standard-port source PIDs. Installed
0.5.7 or earlier needs pack APPLY once. See
docs/gates/portable-update-lock-20261013.md. Next PORT-FEEDBACK-UAT-01 is owner
D-drive0.5.8 apply and prior playback/bin/native OBS retry. Phase03 stays60%.

## PORT-FEEDBACK-01 — portable playback, bin, OBS and launchers (2026-10-13)

Repaired the owner's second-machine regressions in source and alpha0.5.7:
single imported/OBS track Script follows the project track clock after STT;
Recycle Bin follows live rows without percentage-height overlap and scrolls to
its last row after repeated operations. Installer survives native WinPS empty
arguments and code pages, reports underlying errors and migrates the OBS
launcher path while preserving pairing. Portable root has exactly the four
requested BATs; obsolete launchers are removed transactionally after hash checks.
Frontend785/785, backend774/774, typecheck/build pass. Real embedded portable
UI checks both seek directions/playback and bin operations; actual embedded BAT
installer writes the correct DLL into isolated app/plugin configuration paths.
Migration and alpha0.5.7 root UPDATE each pass33/0;151 payload hashes and 1.16MiB
ZIP verified, model/base inventory unchanged. Candidate0.5.6 is retained only
under debug after integration found a stale OBS launcher path. See
docs/gates/portable-feedback-20261013.md. Exact next round is
PORT-FEEDBACK-UAT-01 on the owner's D-drive machine, including actual OBS loading
after restart and any UAC path. Phase03 stays60%; independent STT timing still
awaits Conviction.

## PORT-STT-01 — portable STT eligibility (2026-10-13)

The grey Speech to text button was reproduced with a ticked footage: the
production API looked for the development-only services/stt_studio folder,
while the portable ships .runtime/omnivoice-studio. Settings now resolves the
bundled sidecar first and the portable gate verifies actual catalog eligibility.
API/moved-folder and native Windows PowerShell regressions pass; related
backend34, Media Pool56, typecheck/build pass. Full backend755pass/3fail; all3
unchanged timing checks pass separately. Candidate0.5.4 was rejected by the new
gate (native quoting) and rollback verified. Automatically issued alpha0.5.5
actual BAT passes31/0,153payload hashes/1.16MiB ZIP verified, base manifest
unchanged. Real portable CPU/int8 offline Largev3/Medium return21timestamped words
from4s Vietnamese speech, cached source identical and PCM24k mono verified.
Evidence: docs/gates/portable-stt-20261013.md. Owner's D-drive STT/GPU retry
remains the next acceptance round; Phase03 stays60%.

## PORT-IMPORT-01 — repair native media import module connection (2026-10-12)

The owner's silent second-machine import was reproduced at the real module
registry and in the installed portable UI. Native selected paths and callbacks,
pending work/errors and retry were missing from the registry's Media Pool props.
Both standalone Media Pool and LibraryPanel now receive them through typed
StudioContext. Four regressions failed before the fix; affected frontend117/117,
full784/784, typecheck/build and related backend9/9 pass. Source UI with embedded
core Python imported a real WAV and displayed its footage. Alpha 0.5.3 is the
automatically allocated app-only update (153 files, 1.16 MiB ZIP, archive hashes
verified). Actual pack BAT passed30/0; updated portable UI imported WAV, MP4 and
two-track MKV, displayed errors/retry and retained media after reopen. Six real
PCM24k mono analysis WAVs and playback URLs passed; the base manifest hash is
unchanged. Evidence: docs/gates/portable-media-import-20261012.md.
Owner's native dialog, import and STT/GPU benchmark on the D-drive machine remain
the next acceptance round. Phase03 remains60%.

## PORT-UPDATE-03 — numbered portable updates (2026-10-12)

Creating an app pack automatically allocates patch and folder name; copying
whole numbered folders into `updates` is sufficient. The updater picks the
highest compatible numeric manifest version. A pack's launcher uses its own
updater, resolves the full portable and supports alpha 0.5.0 migration.
The owner's payload-root error was reproduced before the fix; the same actual
entrypoint now applies alpha 0.5.1 and passes 30/0. The pack launcher also
passes 30/0 without allocating another version. Regression9/9 and UI build
pass. Pack ZIP: 1.17 MiB; full portable remains 35.98 GiB. The owner supplied
second-machine D-drive evidence: alpha 0.5.1 applied 153 files with 30/0 gate.
Startup and fixed-media benchmark on that machine remain. Evidence:
docs/gates/portable-numbered-updates-20261012.md. Phase03 remains60%.

## PORT-VERSION-01 — portable app release version (2026-10-12)

`APP-VERSION.json` starts the app release at alpha 0.5.0. Update packs have
`VERSION.txt`; pack, bundle and app-layer manifests record the same release.
Two BAT runs passed 30/0 and kept the version. A changed pack with the same
version and a downgrade were rejected before altering the installed manifest.
The 35.98 GiB NoVibeVoice portable now contains the versioned 3.94 MiB
transfer pack. Target-machine copy/start/benchmark remains open. Evidence:
docs/gates/portable-release-version-20261012.md. Phase03 remains60%.

## PORT-UPDATE-02 — portable transfer handoff (2026-10-12)

The portable BAT is the single click for app changes while this bundle
remains below the source checkout. A successful update leaves a stable
updates/app-current transfer pack; repeated updates preserve older packs.
Three update runs and a direct portable VERIFY passed 29/0. Full bundle:
35.98 GiB; current app pack: 3.93 MiB. Target-machine copy/start/benchmark
remains open. Evidence: docs/gates/portable-update-handoff-20261012.md.
Phase03 remains60%.

## PORT-UPDATE-01 — app-only portable refresh (2026-10-12)

The NoVibeVoice portable has separate app and base runtime/model inventories.
Source and portable BAT files create/apply a 3.93 MiB app update without
repacking the 35.98 GiB base. The portable BAT auto-found this source checkout,
built the UI and passed its 29/0 gate. Tamper rejection and post-gate rollback
were verified. Backend744/744, frontend780/780 with two workers,
typecheck/build pass. Another-machine copy/start/benchmark remains open.
Evidence: docs/gates/portable-app-update-20261012.md. Phase03 remains60%.

## USER-FEEDBACK-25 — Media Pool cache choice and reveal (2026-10-12)

The host import dialog and completed-container track dialog now offer a “Cache
file” checkbox. Checked copies the source into the project; unchecked retains
an original-file locator in the machine-local registry. That registry is now
wired into production import. Footage context menus reveal the original and
project copy separately, disabling project reveal for an uncached host source.
Browser upload necessarily copies into the project. Focused backend7/7 and
frontend104/104, full frontend780/780, backend744/744, typecheck/build pass.
Native acceptance is tracked in `docs/gates/user-feedback-25-media-cache-reveal.md`.
Phase03 remains60%.

## USER-FEEDBACK-24 — Script speaker labels and selected passages (2026-10-12)

Script shows diarization Speaker 1/2 even before a Speaker Profile is assigned.
Its word menu can map a selected passage to an existing diarization speaker;
interior passages form A–B–A rows and edge passages merge with a neighboring
matching row. The raw label and word timings remain unchanged; Profile mapping
and checked-row bulk actions retain their separate scope. Ordinary and channel
tables display the label. Focused70/70 (final ScriptEditor40/40),
frontend777/777, typecheck/build and backend742/742 pass.
Native acceptance is recorded in
`docs/gates/user-feedback-24-script-speaker-turns.md`. Phase03 remains60%.

## USER-FEEDBACK-23 — API listener readiness during recovery (2026-10-12)

Product startup no longer waits for a slow persisted-project scan before the
API binds. The incident scan took 41.657 seconds across 23 projects and pushed
readiness to 61.067 seconds, beyond the launcher's 60-second limit. A one-second
fast path preserves immediately reconciled state for small projects; slower
recovery continues with completion/error logging and orderly shutdown. A
blocked-scan test verified a real Uvicorn health response before recovery
finished. Final backend: 742 passed, 2 existing warnings. The owner launcher
restart remains to be verified; the existing portable bundle predates this
source fix. Evidence: `docs/gates/user-feedback-23-api-readiness-recovery.md`;
ADR0068. Phase03 remains 60%.

## PORT-NOVIBE-01 — no-VibeVoice portable test bundle (2026-10-12)

The 35.98 GiB `NoVibeVoice` bundle includes the OmniVoice base checkpoint,
existing STT/RVC runtimes, application and OBS bridge. VibeVoice choices remain
visible but unavailable. Source gate 22/0, built gate 27/0, Studio/API health
and model-catalog smoke passed on this machine. Target-machine transfer, audio
inference and GPU/OBS acceptance remain open. Phase03 remains 60%. Evidence:
`docs/gates/portable-no-vibevoice-20261012.md`.

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

## USER-FEEDBACK-11 — Script end update depth (2026-10-09)

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

## USER-FEEDBACK-10 — shared Script scrolling (2026-10-09)

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

## USER-FEEDBACK-09 — archived OBS views and PCM waveform (2026-10-09)

Paused zoom/metadata no longer follow the idle playhead; the old drag-release
callback is removed. Archived OBS playback follows its viewport edge and paused
browsing survives repeated status/journal replies. Completed tracks load standard
source-derived PCM detail, shared filled geometry/accent/gain and bounded density,
with fenced loading and retries. Live green utterance bands are absent after Stop.
Real owner artifacts prove28.668s of missing detailed words on Channel1 despite
continuous capture/audio and final realtime text; jobs still report complete.
Review notes expose segment-level realtime text without fabricating word timing.
Frontend646/74, typecheck/build, relevant API waveform2 pass; full API687 carried
from08. Original media hashes match. Commit4568e3f, ADR0056, gate
`docs/gates/user-feedback-09-obs-archive-view.md`. Exact next STT-GAP-01 needs an
isolated reproduction with retained recognizer/merge artifacts because this
recording's raw segment results are absent. UX-EDITING-DEVICE-01 native scroll,
Stop waveform and audible playback acceptance remains; full rapid jumping is not
device-verified. No service/model dispatch or owner audio/transcript/schema/
upstream/Phase03-budget change. Normal read-only closure status reports API stopped,
Studio running and busyfalse; reopen the normal app before native acceptance.

## USER-FEEDBACK-08 — controller readiness (2026-10-09)

Controller HTTP loopback clients no longer load system CA/proxy settings before
bind; controlled real-Uvicorn regressions and invalid environment round-trip pass.
CLI startup watches precede heavy imports and keep bounded frame-only stacks.
Controller/Studio/API launchers preserve previous logs before retry truncation.
API687/two existing warnings passes on E temp storage. Initial C temp fixture
setup errors coincided with0 free bytes; no owner files were deleted, later85GB
free independently observed. Real normal launcher passed controller1.897s,
Studio4.354s, API11.393s. All health=ok/runtime=running; normal stack left up.
Evidence `docs/gates/user-feedback-08-controller-readiness.md`, ADR0055.
Original PID25916's exact stack is unavailable and cold reliability is not proven.
Exact next RUNTIME-READINESS-DEVICE-01 retains idle/cold startup evidence under
existing deadlines; UX-EDITING-DEVICE-01 native OBS Stop/waveform and editing
checks follow. No manual model dispatch, schema/upstream or Phase03-budget change.
Frontend07 checks are carried, not new visual evidence.

## USER-FEEDBACK-07 — OBS waveform after Stop (2026-10-09)

Actual406.4052262-second stopped take overview failed because of the live120-second
API cap. Stopped full snapshots now permit bounded recording duration, streaming
envelope documents into at most600 bins. Live/cursor120-second bounds and ownership/
provenance checks stay intact. UI refreshes journals immediately on Stop and retains
same-take overlapping waveform while journal/archive data loads. Copied real owner
envelopes return600 audio points per channel; the baseline adapter returns422.
Original MKA/two WAV hashes unchanged. Frontend639/73, API682/two existing warnings,
typecheck/build pass: `docs/gates/user-feedback-07-obs-stop-waveform.md`, ADR0054.
Owner confirmed Record signal/overlap recognition; exact next UX-EDITING-DEVICE-01
still needs actual native Stop/overview/playback and editing/scroll acceptance after
reload. STT-TIMING-ACCURACY-01 word truth remains. No normal services/models, owner
media, upstream/schema or Phase03-budget mutation; long archive decode/read latency
remains unmeasured beyond the retained local406-second envelope probe.

## USER-FEEDBACK-06 — Script deletion and OBS journal recovery path (2026-10-09)

Bulk deletion replaces repeated full transcript reconciliation; large documents
use a Worker with asset/text/word snapshot fencing, cancellation and visible
feedback. Surviving word timing/annotations stay intact and history avoids
serialization when changed text proves the edit. Yellow notices scroll outside
editable text in table/prose, with measured virtual/overlay offsets. Normal logs
showed a removed historical project's KeyError blocking current OBS journal writes.
Machine-history persistence now isolates missing owners and does not fabricate
missing completed journals. Fresh connection/capture fixtures retain durable PCM,
waveform and transcript reads. Frontend637/73, API680/two existing warnings and
typecheck/build pass; bundled Worker computation also passes. Evidence:
`docs/gates/user-feedback-06-script-deletion-and-obs-journal.md`, ADR0053.
Next UX-EDITING-DEVICE-01 needs allowed real-browser deletion/scroll and native
OBS Record after reload; existing browser rejection and acoustic/device/LAN gates
remain. STT-TIMING-ACCURACY-01 still needs reviewed word truth. No owner-media,
normal service/model, upstream, schema or Phase03-budget mutation occurred.

## USER-FEEDBACK-05 — Timeline identity and local timing edits (2026-10-09)

Timeline word edits share30-step undo/redo across normal/imported/archived OBS
overview and focused editors, cancelling live drags before history navigation.
Individual source-word boxes use4px spatial filtering and zoom detail; no multiword
overview summaries remain. Atomic promoted IN/OUT fixes unintended neighbour
mutation; actual collisions blink and retain10%. Tiny intervals and internal
unchecked neighbours remain valid. Unsafe intervals and new text get positive,
explicitly untrusted estimates with original source timing. Promotion instructions
float after2s hover without changing waveform layout. Studio phrase-edge candidates
cannot cross neighbour words or a previously refined end. Frontend627/71,
API679/two existing warnings and typecheck/build pass. Evidence:
`docs/gates/user-feedback-05-timeline-word-timing.md`, ADR0052.
Next STT-TIMING-ACCURACY-01 needs reviewed per-word IN/OUT truth and isolated model
comparison in `docs/STT-TIMING-ACCURACY-PLAN.md`; acoustic improvement is unmeasured.
UX-EDITING-DEVICE-01 visual/history/audible checks and prior browser restriction
remain. Existing R5/R6 acceptance and Phase03 budgets are unchanged. No owner
media, normal service/model dispatch, upstream or project-schema mutation occurred.

## USER-FEEDBACK-04 — logical Script rows, attribution and history (2026-10-09)

Owner confirms responsiveness from03. Virtual word fragments now share one
speaker row/control; inherited and explicit matching profiles share a key.
Fixed24px selection boxes show original row ordinals. Script attribution requires
checked rows; pointer/focus Ctrl+A includes every logical row. Session Ctrl+Z/
Ctrl+Shift+Z retains30 committed text/timing/tag steps, grouping cross-track
speaker choices and preserving ordered saves. Dense Timeline snippets restore
overview text and reveal more detail with zoom without changing source timing.
Frontend611/70, API677/two existing warnings and typecheck/build pass. Evidence:
`docs/gates/user-feedback-04-script-rows-subtitles-and-history.md`, ADR0051.
Next UX-EDITING-DEVICE-01 needs actual checkbox/ordinal/theme, subtitle density,
history/scroll and audible checks. Prior browser restriction and older physical/
quality/download/LAN gates remain; DOM tests do not establish visual acceptance.
No backend/upstream/project-schema, owner-media or phase-budget change.

## USER-FEEDBACK-03 — import feedback, media tree and bounded detail views (2026-10-08)

Pending footage slots appear before cache confirmation/track inspection, including
same-name imports. Expandable folder slots replace Thư mục gốc and preserve
nested creation/root-folder moves. Multi-selection closes detail constructors;
bulk checkbox intent updates immediately, with ordered saves and stale-read/open
fences. Script/ChannelScript render bounded fragments and dense Timeline subtitle
overviews use full-source hit testing. All words/timestamps remain available.
Frontend602/69, API677/two existing warnings and typecheck/build pass; current gate:
`docs/gates/user-feedback-03-media-tree-and-responsive-selection.md`, ADR0050.
Exact next UX-EDITING-DEVICE-01 needs allowed browser/native, real-load/scroll and
audible evidence. DOM bounds do not establish real browser interaction latency.
Older physical/quality/download/LAN gates remain. No backend/launcher/upstream,
project schema, owner-media mutation or phase-budget change; Queue remains proposed.

## USER-FEEDBACK-02 — Media Pool and audible pointer previews (2026-10-08)

Main Import opens the device multi-file chooser; separate Host import preserves
host/growing-MKV workflows and exposes picker errors. Root breadcrumb semantics
and icon sizing corrected. Lifecycle revisions fence older media responses so
Recycle/Restore/Delete remain actionable without refresh. STT/DIA busy toggles
aggregate parent tracks; Training maps pending/running speaker runs to footage.
Shared short normal-pitch previews support left drag and promoted middle timing
for ordinary/imported/archived OBS timelines, preserving gain/mute and excluded
regions. Frontend593/68, API677 and typecheck/build pass; full API results and initial
readiness timing caveat are in the gate. No backend/launcher source changed.
See `docs/gates/user-feedback-02-media-and-audio-scrubbing.md`, ADR0049 and the
unimplemented recommendation `docs/AI-QUEUE-PROPOSAL.md`. Next remains
UX-EDITING-DEVICE-01: allowed visual/native picker, real-load and audible evidence.
Browser access restriction and older physical/quality/download/LAN gates remain.
No runtime restart/model dispatch, owner-media mutation or phase-budget advance;
the pre-existing normal listeners were left running.

## USER-FEEDBACK-01 — restart recovery and footage UI (2026-10-08)

Orphaned sequential STT/diarization state is cancelled on startup/Open Existing,
while validated MKV/OBS checkpoint owners resume. Removal fences their work.
STT/DIA/Training/Generate ask all versus missing-only before dispatch. Generate
all uses immutable fresh clips; terminal status waits for GPU handover. Result
eligibility compares resolved settings and verifies listed output WAV presence.
Media Pool has adjacent Import/folder-plus icons; independent media loading and
deferred Script/Timeline construction prioritize selection feedback. Shared
subtitle density avoids crowded per-word boxes below22px. Frontend580/67,
API677/two existing warnings, typecheck/build pass. Product helper
recovered the actual recycled PDCA MP3 flag, preserving completed text/words;
Test_OBS_05 valid growing-MKV ownership remains. No normal services/models ran.
See `docs/gates/user-feedback-01-processing-and-footage-ui.md`, ADR0048.
Next UX-EDITING-DEVICE-01 requires allowed visual/native, real-load and audible
checks. Older quality/identity/physical/download/LAN gates retain prerequisites.

## TASK-STOP-DEVICE-01D3A–01D3 — actual Training recovery (2026-10-07)

Windows tokenizer process pressure fixed after real paging/MemoryError; retry
produces5 train/1 dev shards with zero errors. Fresh product LoRA Stop reaps
four processes with11 checkpoint hashes unchanged. Same-run Resume loads actual
checkpoint5, reuses tokens, completes20 and publishes a real adapter which
generates WAV3.2s.19 source/reference hashes and prior outputs remain. Gates:
`docs/gates/task-stop-device-01d3a-tokenizer-windows.md` and
`docs/gates/task-stop-device-01d3-training-resume.md`. Full API658; unchanged
frontend560/63, typecheck/build pass. Fixture cleaned, normal services activated.
No owner identity/quality/browser claim. Next UX-EDITING-DEVICE-01 and physical/
download/second-machine/reviewed-label gates need device/human evidence.
Cancelled checkpoint-list freshness and unfinished-save recovery are noted;
this acceptance deliberately stops only after a fully saved checkpoint.

## TASK-STOP-DEVICE-01D1–01D2 — Resume cache and actual Generate (2026-10-07)

Dev token cache selection repaired; current/legacy/missing layouts pass six
regressions, runner19, full API656, frontend560/63, typecheck/build. Actual
product Clone/OmniVoice proves queue Stop, hard Stop worker reaping and fresh
WAV rerun with19 retained hashes. See the01D1/01D2 gates. Exact next01D3 runs
fresh LoRA checkpoint Stop/Resume on the disposable product-compiled manifest.
Browser tool policy blocks new UI/download evidence; physical/identity gates
remain. No owner project, source PCM, upstream or phase-budget change.

## TASK-STOP-DEVICE-01C — cancelled activity repair (2026-10-07)

STT/diarization cancellation now settles Activity Center as cancelled, including
removed active footage; unconfirmed engine termination is failed. Queue Stop
keeps the active task running. Regressions and actual new-API Medium/community-1
GPU Stop prove the footer returns to READY and PCM/results stay retained. Gate:
`docs/gates/task-stop-device-01c-activity.md`. Isolated services/secret copy cleaned.
Full frontend560/63, API650, Studio22, typecheck/build pass. Normal app restarted
with current source and three healthy services; readiness3.553/3.291/3.409s.
Next01D needs owner-selected project/Speaker and compatible Training/Generate
artifacts. Physical/native/second-machine and older phase gates remain open.

## TASK-STOP-DEVICE-01B — real community-1 acceptance (2026-10-07)

Real cached community-1 diarization No/Yes/rerun passes in the isolated fixture:
worker termination, new-worker execution, real raw spans and PCM preservation
have evidence in `docs/gates/task-stop-device-01b-diarization.md`. Cancelled
activity still appears running in the footer; exact next01C repairs that observed
gap. Speaker accuracy/identity, Training/Generate and physical gates remain open.

## TASK-STOP-DEVICE-01A — real CUDA STT acceptance (2026-10-07)

Current-source isolated fixture proves cached Medium/CUDA No/Yes/rerun. No drops
pending work and lets active recognition complete; Yes removes the actual worker
and prevents late publication; a new worker completes a subsequent STT. Source
and six analysis hashes match. See `docs/gates/task-stop-device-01a-stt.md` for
full suite evidence and browser/tool limitations. This proves cancellation, not
speech accuracy, latency or physical recording. Next: TASK-STOP-DEVICE-01B,
community-1 diarization; Training/Generate and physical acceptance remain open.

## TASK-STOP-01 — confirmed processing Stop (2026-10-07)

STT, Speaker Diarization, Training and Generate Voice share queue Stop and a
second-click Yes/No dialog for active cancellation. General STT covers growing
MKV and OBS detailed pipelines; recording-specific controls name their scope.
Owned cancellation fences block late publication, preserve completed results
and checkpoints, and support explicit rerun/Resume after executor cleanup.
Frontend560/63 files, API646, Studio22, typecheck/build and synthetic browser proof pass; full
API/Studio evidence is recorded in `docs/gates/task-stop-2026-10-07.md`.
Real GPU-model termination and checkpoint Resume require TASK-STOP-DEVICE-01
after restarting the normal app and Studio. Continuous capture controls and
existing phase/recognition budgets retain their current meaning.

## UX-INTEGRATION-01 — import and source-time editing (2026-10-07)

The owner-requested nine UX rounds add concurrent multi-file import with an app
cache dialog, portable folders/order, consistent Script/subtitle text editing,
provisional word interpolation, middle-click timestamp placement and source-time
working/cut intervals. Playback, STT, diarization, subtitle export and training
use the same exclusions. Uncut restores eligibility; original audio is retained.
Object-list gutters and right-edge scrolling are included. Blocking STT result
mapping/publication runs off the API event loop; actual GPU-load smoothness
remains a device check.
Frontend550/62 files, backend588, typecheck/build and real four-second retained
PCM proof pass. Browser edits, upload,
clipboard, range skipping and reopened persistence pass on an isolated copied
synthetic project; no model/physical audio claim. See the integration gate for
full check evidence and `docs/UX-EDITING-OWNER-CHECKS.md` for owner acceptance.
Phase progress and older recognition/physical budgets are unchanged.

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


## LIVELINK-STT-19B5 — latency trace diagnosis (2026-10-05)

Existing lagSeconds is onset-to-event duration, not post-source-end latency.
Offline analyzer reconciles29 finals/85 requests; lock/event clocks were absent.
No budget or product change. Next19B6 adds profiling-harness clocks to attribute
real delay. See `docs/gates/livelink-stt-19b5-latency.md`.

## UI-CONTRAST-01C1 — populated states (2026-10-05)

Repaired inactive library tab/count text, normal Timeline words, advanced profile
labels and fixed white Speaker-card fills. Real copied output, populated profiles
and Properties checked in both themes: six samples/1,668 repeated DOM readings,
minimum4.615:1, zero under4.5 after fixes. Frontend497/typecheck/final build pass;
backend565 for STT repair. Parent01C physical/native/model/emotion/motion scope
remains open. See `docs/gates/ui-contrast-01c1-populated.md`.

## LIVELINK-STT-19B4 — internal quiet PCM repair (2026-10-05)

Live recognizer WAVs now retain short internal quiet PCM when speech resumes,
with trailing silence still trimmed at the unchanged 0.5s boundary. Red regression
reproduced 24,000 instead of 36,000 frames; fixed byte-exact regression and 14
adapter tests pass. Full backend 565 passed (150.26s), two existing warnings.
Real frozen medium replay improves CER22.97->19.62%, WER26.62->24.19%; 29/29 final
spans match recognizer input length and 16 source hashes remain unchanged.
CER and paced final lag still fail; parent19A/19B remain open. See
`docs/gates/livelink-stt-19b4-pcm-context.md`.

## LIVELINK-INGEST-18D — directory candidate rejected (2026-10-05)

Prepared-directory pair writes reduce the same-volume storage screen by 3.27%,
with p95 248.944ms. This fails the frozen 150ms/30% screening limits; no product
integration. Eight helper safety tests pass, source/output bytes match, and
two fsyncs plus PCM-before-metadata publication remain. See
`docs/gates/livelink-ingest-18d-directory.md`. Parent 18B/18C remain open.

## LIVELINK-STT-19B3 — recognition candidate rejected (2026-10-05)

Longer silence threshold reduces final spans29->16 but worsens real frozen
corpus CER22.97->27.26%, WER26.62->31.33% and paced lag. No integration or
budget relaxation. Source hashes unchanged. Next19B4 isolates short internal
quiet PCM preservation; full19A/19B acceptance remains open. See
`docs/gates/livelink-stt-19b3-context.md`.

## UX-05B3 — pending footage browser acceptance (2026-10-05)

Fixed returning from a pending OBS track to its parent leaving a stale channel
filter. Actual copied journal-only browser fixture restores all four turns,
shows two waveforms and a paused 30-second saved PCM preview; 72 media hashes
unchanged. Parent UX-05B browser scope closes with prior list/delete/restart
evidence. Frontend497/backend564/typecheck/build pass. Native picker/owner
hardware/phase gates remain open. See `docs/gates/ux-05b3-pending-navigation.md`.

## WAVEFORM-VOLUME-01 — gain-responsive waveform (2026-10-05)

OBS/imported multitrack envelopes now reflect their per-track gain/mute while
retaining detailed PCM, gaps and original media. Main Timeline draft/committed
gain is regression covered. Frontend 497/57 files, backend 564, typecheck/build
pass. Actual copied OBS waveform halves amplitude at 50%, mute becomes zero,
and another track remains unchanged. See `docs/gates/waveform-volume-01.md`.
The owner authorized continuing all remaining rounds serially; phase gates
remain open until their own required evidence passes.

## UX-CONSISTENCY-01 — consolidated UI consistency (2026-10-05)

Delivered Hub bulk Delete, one filled waveform envelope design across Timeline
renderers, Script following footage/track selection, per-row/multi-row Speaker
assignment, theme-readable profile controls, Train-only footage visibility and
floating word-time popups. The table/prose switch remains, named DẠNG BẢNG.
Frontend 491/57 files, backend 564, typecheck/build/diff check passed; final
label-only Voice Script follow-up 12 passed. Real copied Conviction/OBS/TTS
browser evidence is in `docs/gates/ux-consistency-01.md`. Portable stack is
running; no physical capture/model or product phase gate advances.

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

## LIVELINK-STT-19A — measured Vietnamese speech baseline (2026-10-04)

Frozen historical curated references on two tracks were processed by real
recognizers through LiveLink and an append-only growing MKV. No production
setting changes. Warm LiveLink live CER/WER is 22.97%/26.62%, detailed
11.88%/13.15%; MKV live 51.72%/70.45%, detailed 9.19%/10.71%. Cold LiveLink
has one request timeout; warm run has none but still fails proposed live CER.
Original hashes and lossless final mono24k PCM match, without clipping.

Browser shows two timelines and words; overlap click seeks both without playing.
Rows still span inserted silence and overlap is fragmented. Reviewed word
anchors, silence/seam review, physical OBS/capture latency and owner acceptance
of proposed budgets remain open; full 19A is not accepted. Backend 547, frontend
473, typecheck/build pass. Owned services/tab close. Evidence:
`docs/gates/livelink-stt-19a-speech-quality.md` and companion metrics JSON.
Exact next **LIVELINK-STT-19B**, one LiveLink recognition accuracy candidate on
the frozen corpus. No product phase advances; 18B/18C decision remains open.

## LIVELINK-08N-B — scoped recovery and isolated outage (2026-10-04)

Parent 08N completes its measured health/recovery/outage scope. Stopped-record
UI actions retry only current rejected PCM and export byte-preserving recovery
ZIPs without consuming source rows. Stale/deleted/project/active-record guards,
FULL/transaction/busy waits and staged fsync publication retain originals on
storage failure. Recovery errors remain visible across successful status polls.

Actual private six-source OBS 32.2.2 with package 0.6.10 survives a 93.859s API
outage and stopped-record OBS/API restart. Controlled rejection is exported,
retried and ACKed; 343 retained in-record rows match exact PCM, six boundary
prefixes match, 102 after-Stop rows are explicitly trimmed, no internal gaps.
MKA has six FLAC streams; six mono24k WAVs have correct tone frequencies and no
clipping. Idle overflow/startup source-absence remain distinct; STT is stubbed
only in this resilience fixture and no speech-quality/latency claim is made.

Final full backend 536, frontend 473 / 55 files, native 2/2, typecheck/build pass.
Owned processes/ports close. Installed owner plugin updates to 0.6.10 with package
hashes verified and pairing bytes unchanged; owner OBS is not opened. Evidence:
ADR 0042 and `docs/gates/livelink-08n-b-outbox-recovery.md` plus metrics JSON.
Exact next **LIVELINK-STT-19A**; 18B/18C budgets/integration remain open.

## LIVELINK-08N-A — retained outbox health (2026-10-04)

Native/API/UI health is complete at a bounded seam. Optional authenticated
v3 reports show global retained/rejected PCM counts, age at last report,
volatile memory/worker backlog, attached-Track overflow and the last SQLite
error. Legacy plugins/rows, read failures and disconnects remain unknown/stale;
meter activity never implies durable PCM. Nullable machine-local schema migration
preserves legacy rejected bytes and compatibility. ACK/FULL/WAL unchanged.

Native Release build and 2/2 CTest pass, including simulated SQLITE_FULL with
retained prior PCM; final full backend 526 passed, frontend 471 / 55 files,
typecheck/build pass. Actual browser fixture confirms stale/unreadable/legacy
states with readable product styles. Evidence: ADR 0041 and
`docs/gates/livelink-08n-a-outbox-health.md`.

Parent 08N is open. Exact next **LIVELINK-08N-B**, scoped retry/export and
longer isolated multi-source outage/Stop recovery. No installed plugin/package
update or actual connected-recording acceptance is claimed here. 18B/18C
performance and the pending budget choice remain open.

## LIVELINK-INGEST-18C — group feasibility, decision pending (2026-10-04)

Measured 60 six-source groups, 360 durable PCM/metadata pairs per variant;
source and saved bytes all pass. Concurrency six cuts group wall time 53.15%
(61.151s to 28.652s), but pair p95 increases to 635.725ms. This is storage-only
evidence and does not meet the frozen 150ms ACK budget. No protocol/product
integration is shipped. A conditional bounded contract is recorded in
`docs/gates/livelink-ingest-18c-group-feasibility.md`; the human budget-choice
question remains pending, so frozen thresholds are unchanged.

Full backend 516 passed. An initial frontend run had 38 worker startup errors;
the full serial rerun with four workers passes all 468 tests / 55 files,
typecheck and build. Exact independent next while awaiting the decision:
**LIVELINK-08N**. 18B/18C performance and actual OBS acceptance stay open.

## LIVELINK-INGEST-18B — rejected optimization candidate (2026-10-04)

18B remains open; no product/source-media/installed-plugin changes. Tested
writer reuse, coordinated pre-fsync writes, Windows write-through plus fsync,
and staged sequential fsync. The strongest screening candidate was replayed
against the full frozen 2,524-chunk workload: ingress 406.961s versus 417.734s
(2.58% reduction); ACK p50/p95 119.761/302.916ms. It fails the unchanged 30%
reduction and <=100/150ms ACK budgets. Ready tail 24.159s and all six archive
streams/analysis PCM hashes pass; this does not constitute an accepted fix.

Full backend 516 passed; frontend 468 passed / 55 files; typecheck/build pass.
Evidence and an executable red budget comparator are in
`docs/gates/livelink-ingest-18b-candidate.md` and comparison JSON. Native live
acceptance is not run for this rejected candidate. Exact next:
**LIVELINK-INGEST-18C**, separately evaluate bounded group durability and its
transport/API contract while preserving both fsyncs and all frozen budgets.
Do not mark 18B complete or claim a live latency improvement.

## LIVELINK-INGEST-18A — six-source measurement (2026-10-04)

Complete at isolated profiling/decision scope; exact live clock acceptance
remains open. Replayed retained UX-10B six-source PCM through real durable
adapters and local HTTP: 2,524 chunks / 573,421,416 bytes, all hashes/sequences
valid, only the twelve verified per-source Pause gaps. A real six-stream MKA
and six mono/24kHz analyses are verified; all six analysis PCM hashes match
the retained take. Separate real native callback and FULL/WAL spool fixtures
verify continuity and an empty acknowledged outbox.

API durable PCM/metadata publication consumes 78.63% of chunk time. HTTP ACK
p50/p95 129.959/302.854ms; replay drain 417.734s; last ACK to ready 48.860s.
Retained native spool peak 878 and pre-Pause growth 1.543 chunks/s. Its Stop
to last receive is approximately 325.194s; receive to ready journal mtime is
36.272s. These retained UTC/mtime proxies are not exact durable ACK clocks.
99 idle overflow entries are excluded; six startup deltas remain unclassified,
so loss-free startup is not claimed. Synthetic callback age is separately
labeled and does not prove physical scheduler latency.

No product behavior changes. Profiling tools, instrumentation-overhead limits,
fixed workload and pre-optimization 18B budgets are in
`docs/gates/livelink-ingest-18a-profile.md` and its metrics JSON. Focused backend
26 passed; native profiling builds/fixtures and media integrity pass.
Exact next: **LIVELINK-INGEST-18B**, optimize only the measured durable-pair seam
and meet the frozen replay plus actual six-source OBS acceptance gates.



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

## RUNTIME-READY-01C — Controller late bind (2026-10-04)

The owner controller timed out alive at 31.126 seconds with no listener, then
bound port 18119 and answered health about 0.6 seconds later. The controller
readiness budget is 60 seconds while process and HTTP health checks remain in
force. Focused tests passed (11); a normal full-stack launch returned `ok` for
controller, Studio and API. The cold delay source and a >60-second startup gate
remain open; see the current WORK-ROUNDS ledger and ADR 0036 amendment.

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

## Reconciled execution queue — 2026-10-03

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

## Highlight-text browser acceptance — 2026-10-03

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

## Recording-name and track-label browser acceptance — 2026-10-03

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


## Six-source live OBS layout acceptance — 2026-10-03

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

## OBS two-footage lifecycle and selection — 2026-10-03

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

## LiveLink physical live Media Pool — 2026-10-03

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

## LiveLink workspace reconnect — 2026-10-03

`LIVELINK-STT-12M` completes the lifecycle and isolated real-browser reconnect
gate. A selected project's workspace remains mounted through API outage,
runtime restart and post-restart project refresh. An inert recovery dialog
blocks interaction and contains focus until readiness returns. Timeline clears
status/journal transport errors when their own polling recovers; real waveform
errors retain their separate state.

Two deliberate API-exit/recovery cases use an independent real two-track 12D
project copy. Track/footage, selected Script word, scroll 122px, recording ID and
zoom 2 remain; transcript polling resumes afterRevision144. Final replay clears
the stale Timeline stopped alert. Both track audio elements decode and play
after reconnect. Owner runtime listeners remain unchanged; test ports/session
and browser tab are cleaned up. Frontend 464 tests, typecheck/build and diff check
pass; backend 500 is the carried 12L baseline, not a new run. ADR 0037;
`docs/gates/livelink-stt-12m-workspace-reconnect.md`.

This archived same-document review does not prove ongoing OBS/STT capture or F5
state restoration. Natural listener loss, disk stalls, owner installation and
wider final gates remain open. Exact next: **LIVELINK-CAPTURE-10B**, the existing
live Media Pool/independent-source gate, needed to verify interaction while
recording. No further alphabet round introduced; Voice Training is unchanged.

## LiveLink persisted startup and recovery backlog — 2026-10-03

`LIVELINK-STT-12L` completes the isolated persisted-startup/topology replay.
An independent copy of 37 projects / 58 recording journals produces six passing
foreground/detached takes. Final readiness is 5.500/6.093 seconds, stable for
60 seconds each. Product scan logs retain PID, elapsed time and queued counts:
nine live tracks, one MKV watcher, four MKV STT workers and seven detailed OBS
workers. Scheduling counts do not imply transcript or model success.

The first 61.922-second take used an unnecessarily costly read-path audit guard;
OS filesystem cache is uncontrolled. One extra take timed out on the project
list after healthy readiness; it is retained separately, with no stable gate
claim. Neither anomaly establishes the historical listener-loss cause, which
did not recur. Existing recovery behavior/deadlines remain unchanged.

Owner file metadata/JSON hashes remain unchanged, no denied writes, all test
ports cleared. Backend 500, frontend 458 tests, typecheck/build and diff check
pass. ADR 0036 addendum; `docs/gates/livelink-stt-12l-persisted-startup.md`.
No new physical OBS, audio quality, sustained inference or browser gate claimed.

Exact next is `LIVELINK-STT-12M`: preserve selected project/footage and Script
follow through API restart in the running browser. Matching future failure logs
are needed for natural listener loss; natural disk stalls, owner installation,
exact video timing and wider LIVELINK-08 acceptance remain open. This round
does not advance Voice Training.

## LiveLink runtime readiness and failure evidence — 2026-10-03

`LIVELINK-STT-12K` completes the readiness/diagnostic/controlled-recovery slice.
Studio's old status probe initializes Torch/CUDA, measured at 2.672–3.594 seconds
while the listener remained healthy. Dedicated async health avoids inference
initialization; PID-aware launcher waits retain exit/deadline/listener evidence.
PIDs register atomically before health waits; the controller retains changed
process/listener/health snapshots outside runtime actions. Existing UI state
continues to describe port ownership, not model success.

The replay keeps health responsive during a 3.062-second device initialization
(max health 0.110 seconds), then deliberately exits API and Studio and recovers
each through the controller. Controller PID survives all 37 snapshots; both
recoveries have ten stable samples. All test services stop and ports clear.
Backend 500, Studio 16, frontend 458 tests, typecheck/build, diff and portable
Core 6/6 pass. ADR 0036; `docs/gates/livelink-stt-12k-runtime-readiness.md`.

**Natural cold-start listener loss remains unproven:** five isolated cold cycles
did not reproduce it. Exact next is `LIVELINK-STT-12L`, persisted recovery backlog
and foreground/detached startup replay in isolation. Owner installation,
disk-stall diagnosis, reconnect/Script follow and broader LIVELINK-08 gates stay
open. This round does not advance Voice Training or claim new audio quality.

## LiveLink source absence and retained PCM — 2026-10-03

`LIVELINK-STT-12J` completes source-absence provenance for newly added sources.
Plugin/package 0.6.9 emits native callback detach/attach boundaries, retains
queued PCM and counters through source removal, and pads observed restoration
gaps. The reducer journals native time even after inventory updated presence.
Timeline retains captured lanes and distinguishes source absence from PCM
receipt delay, preserving unknown-hole warnings. Existing v3/project contracts.

Two OBS/browser takes (77.561 / 66.258 seconds) verify complete captured tails,
native-to-journal boundaries, source-missing gap classification, uninterrupted
second track, full live/detailed STT and hash/decode-valid two-track FLAC MKAs.
Built UI shows `Nguồn đang vắng · PCM đã lưu`; saved waveform/gap arrives
without reload. Backend 494, frontend 458 and native 2/2 tests, typecheck/build
and diff check passed. ADR 0035; `docs/gates/livelink-stt-12j-source-absence.md`.

Only the isolated OBS installation used the new DLL; the owner needs
Preferences Install/Repair and OBS restart. Inventory polling observes edits
about once per second; exact OBS video synchronization, process/collection
control recovery, natural disk-stall diagnosis and wider LIVELINK-08 gates
remain. Exact next: `LIVELINK-STT-12K`, isolate cold-start listener loss before
claiming reliable startup. Voice Training phase status is unchanged.

## LiveLink PCM receipt cost and queued chunk ceiling — 2026-10-03

`LIVELINK-STT-12I` profiles PCM receipt and ships plugin/package 0.6.8 with
up to two seconds of already queued PCM per upload (96,000-frame ceiling).
Small prefixes still emit immediately; source/Stop boundaries and all durable
flush/ACK requirements remain. No API, project schema, UI or engine changes.

Four physical OBS/browser takes verified complete PCM, live checkpoints,
detailed STT tails and hash/decode-valid two-track MKAs with both models
resident. A controlled 400 ms pair-write delay reduced receipt p95 from about
126 to 31 seconds and sampled pending peak from 182 to 43; final quiet take
reached 1.577/1.885 seconds and peak 5, then 0. Live zoom retained waveform
in the final minute and the saved tail appeared automatically. Backend 493,
frontend 457 and native 2/2 tests, typecheck/build and diff check passed.
Evidence: `docs/gates/livelink-stt-12i-ingress.md`, ADR 0034.

The natural 12H severe stall did not recur in the first quiet run, so its
precise trigger remains unproven. Controlled pressure still delayed the live
tail; arbitrary disk stalls and the broader LIVELINK-08 matrix remain open.
Only the isolated OBS installation uses the new DLL; the owner needs
Preferences Install/Repair and OBS restart. Exact next: `LIVELINK-STT-12J`,
new-source absence timing in the recording journal.

## LiveLink waveform retention and recording-owned lanes — 2026-10-03

`LIVELINK-STT-12H` preserves saved waveform bins on an empty cursor update
for the same track/window. Missing historical sources without PCM in the
current take no longer create lanes; sources removed after recording audio
remain visible. The empty-window label distinguishes saved PCM from a track
that has not received any audio. No media, API or persistent format changes.

Two OBS/browser takes (202.977/46.509 seconds) verified rewind retention,
layout/window changes, source removal and automatic two-track MKA handoff.
Both retained contiguous PCM and complete live checkpoints; detailed STT in
the longer take published all available audio. Final frontend 457 tests,
backend 493 plus the extended waveform regression, typecheck/build and diff
check passed. Evidence: `docs/gates/livelink-stt-12h-waveform.md`.

The long take again accumulated PCM receipt lag (p95 41.434/41.801 seconds,
118 pending chunks, eventually 0). A future window can still be empty while
transport catches up; the presentation fix does not resolve that delay.
Exact next is `LIVELINK-STT-12I` to profile and reduce this renewed backlog.
The removed new source's journal also lacked its mid-take missing interval;
this timing-provenance gap is queued separately in `LIVELINK-STT-12J`.
Built/test plugin remains 0.6.7; wider LIVELINK-08 acceptance is still open.

## LiveLink sustained PCM ACK optimization — 2026-10-03

`LIVELINK-STT-12G` batches native outbox ACK deletion in one FULL transaction
per bounded send burst and avoids rewriting unchanged recording-folder
locators. Source PCM and metadata retain durable flushes; crash/retry and
atomic rollback semantics are covered by native/API regressions (ADR 0033).
Plugin/package 0.6.7 is built and verified in isolated OBS; the owner's
installed plugin still needs Preferences Install/Repair and an OBS restart.

Two warmed physical OBS takes with the browser workspace open and concurrent
live/detailed STT ran 174.830/171.477 seconds. Before/after PCM receipt p95
was 49.012/49.263 versus 2.157/2.520 seconds; pending peak was 99 versus 7.
Both retained sample-contiguous 48 kHz stereo PCM, hash/decode-verified
two-track MKA, complete live checkpoints and detailed STT, with no live error
events or duplicate finals. Browser text-event receipt age medians changed
from 26.977/24.151 to 4.210/3.864 seconds. First-frame timing is a proxy;
most later Script rows were offscreen, and the comparison is not a universal
latency or recognition-quality guarantee. Backend 493, frontend 455 and
native 2/2 tests passed; typecheck/build passed after probe removal.

Live waveform UI still sometimes looked empty despite low PCM latency and
nonzero waveform API data. Historical removed sources also appeared as extra
live lanes, disappearing at archive handoff. Exact next is `LIVELINK-STT-12H`
to repair these presentation issues and verify the live tail. See
`docs/gates/livelink-stt-12g-ingress.md`; broader startup/reconnect, Script
follow, owner viewport/DPI and portability gates remain under `LIVELINK-08`.

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
Frontend tests, typecheck, and build pass; UX-09B now passes the controlled
normal/archive browser comparison after layout/resize repairs. Physical Windows
DPI and live six-source REC/PAUSE acceptance remain in UX-10B.

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

## Historical milestone order (near-term order superseded by GAP-PLAN)

1. Calibrate the chosen `SpeakerEmbedder` and complete one real gated publish; persistence, lineage, and gate enforcement are now complete.
2. Finish or explicitly defer the durable 03-04 capture/QC/finalization slice.
3. Complete the Voice Changer measurement gate; do not broaden engine adoption while it fails.
4. Build Phase 04 `WorkspaceSession` before expanding live processors.
5. Continue remaining Manipulator processors, LipSync, then desktop/security delivery.

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
