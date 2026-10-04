# UX-05B3 — pending OBS footage navigation

2026-10-05. Completes the remaining journal-backed pending-footage browser
case of UX-05B. No fresh capture, native picker or hardware acceptance claimed.

## Owned fixture

Copied `.scratch/ux-05b/project` into `.scratch/ux-05b3/project`, with a new
project ID. In this copy only, removed the indexed MKA/children and staged its
retained journal as paused/pending. Original PCM, MKA, analyses, transcript
events and other source artifacts remain. This exercises the actual API/UI
journal-only navigation path without creating a fake successful recording.
All **72 audio/PCM files** match both pre-check hashes and the source copy.

## Reproduced defect and repair

Opening Track 8 narrowed live Script correctly. Clicking the pending footage
parent afterwards left the old `selectOnly` channel request, so only Track 8's
Script remained despite opening the whole footage. The Workspace regression
failed with `mic-1:true` instead of `none:false`.

Opening a footage parent now clears that transient track request. It does not
seek/play audio or alter the retained transcript. Track opens still select the
requested channel. Actual browser changes **1 track row -> 4 parent turns**.
Both waveform lanes remain mounted. Saved-PCM preview is **30 seconds**,
readyState **4**, **paused**. Dark/light views exercised; no captured console
errors. Evidence: `.scratch/ux-05b3/pending-{dark,light}.jpg` and
`browser-evidence.json`.

## Acceptance and limits

Combined with UX-05B1/05B2, the controlled browser scope now covers populated
list selection/bulk actions, copied recording recycle/restore/permanent delete,
restart/tombstone and surviving artifacts, Voice Output bulk delete, pending
OBS navigation, waveform retention and overlap drag/Space with no autoplay.
Parent **UX-05B is complete at this owned-fixture browser scope**. Native file
picker selection remains the separate runtime-picker gate. Actual owner-device
capture/Stop/latency/speech and transfer/DPI cases remain their named rounds.

Focused Timeline/Workspace **103 tests**; full frontend **497 / 57 files**,
backend **564**, typecheck/build/diff check passed on the integrated source.
No phase advances. Continue STT-19B3 context diagnosis/candidate, the independent
ingestion feasibility round, then available export/contrast gates.
