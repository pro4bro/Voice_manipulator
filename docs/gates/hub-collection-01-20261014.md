# HUB-COLLECTION-01 — main-source Hub and Collection feedback

Date: 2026-10-14. Starting source d162f046; branch
`feat/03-04-high-quality-training`. Owner source-sync preference retained;
no new portable/update package, no Phase03 progress change (60%). ADR0075.

## Delivered

- Project canvas reserves6px for the existing3px hover lift. Removed LOCAL /
  PROJECTS; reduced header spacing. Detail waveform stays in its own column.
- Sidebar counts distinct source-project/Speaker Profile pairs. Profiles are
  expandable rows with profile/model checkboxes. Central Export sits by Import.
- Native multiselect ZIP import; native destination-folder export writes one
  verified ZIP per selected model. No overwrite; Windows rename fallback handles
  volumes lacking hard links. Browser upload remains labeled separately.
- Archived-model preview jobs return queued receipts before inference, serialize
  work, share GPU lease, cancel their own requests on shutdown and await cleanup.
  Real engine adapter consumes archived reference/LoRA/full weights without
  hidden projects or base-model copies. Minimum15s actual PCM WAV, nonzero signal,
  format and checksum checks precede ready/audio publication.
- WAV/Script caches travel in the existing package inventory. Cached samples
  reject modified archived weights. Payload hashes are cached only per observed
  file size/mtime/ctime revision, avoiding GB reads on every UI poll.
- Optional exact UTF8 Dataset Manifest snapshot is checked against raw-byte run
  SHA256; speaker duration comes from finite positive segment intervals. Legacy
  archives without evidence report unknown, never reference duration.
- Script speaks profile/model metadata and qualified emotion information.
  RVC remains transferable but honestly lacks scripted synthesis preview.

## Evidence

Round artifacts: `.scratch/hub-collection-01/` (ignored, retained evidence).

- Frontend initial red:2failed/14passed, missing count/Hub selection. Final full
  frontend818passed/84files (116.80s); final affected3files20passed (36.89s).
  Typecheck and production build pass;138modules.
- Native transfer Worker49passed before metadata work; dataset/transfer/preview
  integration51passed before final negative cases. Preview tests use a controlled
  renderer writing real16s24kHz mono16-bit PCM, not model inference. They reject
  missing/short/silent/corrupt output, cached-weight tampering, boolean metadata,
  malformed Model Set metadata, busy GPU and late shutdown publication.
- Full backend848passed/3failed/3warnings,566.44s. Failures were controller bind
  deadline, isolated portable fixture bind deadline and fake worker20s startup.
  All exact three passed unchanged on isolated rerun:3passed/1warning,12.33s.
  No threshold/time budget/test was weakened. Final focused88passed/3warnings,
  26.78s (`backend-focused-final.log`) after the added interval guards.
- Real IAB browser1280x720: first hovered cardtop179 versus canvastop176,
  transformY=-3, hovered=true. LOCAL/PROJECTS absent. All6detail cards:
  previewRight382=copyLeft382; waveformRight372, no overlap.
- Collection DOM: profile checkbox selects its model, Export(1) enabled,
  navigation count1. Model row893px; player345.19px/Script517.81px, no overlap.
  Dark/light screenshots saved: `hub-hover.png`, `hub-detail.png`,
  `collection-selected.png`, `collection-light.png`. These use synthetic fixture
  data/audio, not an owner-trained voice quality demonstration.
- Six-model list scrolls to bottom: scrollTop741, scrollHeight1357,
  viewport616; lastmodelbottom679.19 < panebottom706. Screenshot
  `collection-scroll-end.png`. Hub owns one scroll surface for Collection.
- Read-only Worker review found cache verification bypass, JSON bool/int coercion,
  shutdown continuation and malformed nested metadata; Lead repaired each with
  negative regressions. Diff whitespace check passes.

## Actual-model attempt and remaining acceptance

Read existing archived Anh Vũ full OmniVoice checkpoint through the production
preview service, forced CPU/offline: VRAM snapshot23157/24576MiB. No owner runtime
was stopped. First driver failed CP1252 console printing and was rerun UTF8.
Second attempt returned queued, loaded527/527weight entries but produced no WAV
within583.06s. Lead stopped only its verified child worker (49556,parent48088).
Service reported error, removed stage and released shared lease; no sample was
published. `real-sample-result.json` retains the failure. This is **not successful
real-model sample acceptance**, nor evidence of a model/core defect or GPU speed.

Next acceptance: **HUB-COLLECTION-UAT-01** — source Pull/restart, actual Windows
native import/export on the owner machines and >=15s trained OmniVoice/VibeVoice
sample with sufficient GPU memory, heard against its Script. RVC record/convert
preview remains a separate capability. Physical OBS/identity/timing gates remain
open. Next implementation queue remains **SOURCE-EXTERNAL-ASSETS-01**: complete
source package plus one declared external core/model library path.

Owner app controller31060/API15444/Studio17140 were retained. Temporary fixture
listener18128 and agent-created browser tab are closed at completion. An unrelated
concurrently created `docs/VOICE-MANIPULATOR-NEXT-PLAN.md` is preserved unstaged.
