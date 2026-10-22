# ADR0133 — Keep MKV options inside the standard Import review

2026-10-22, Round85. Status: implemented.

## Decision

Native single-file MKV/multitrack inspection stages a PendingLocalMedia as before,
then automatically opens the standard Import review. The former automatic context
menu and separate cache confirmation are composed into LocalMediaImportDialog:
filename, cache/link choice, track Import/STT controls and the ordinary Import
button remain visible together. MKV adds its own follow section/action. Ordinary
multitrack media uses the same dialog without MKV-only controls.

Normal Import preserves the selected cache value. Follow uses the original native
file and existing60s detailed-STT configuration; it retains per-track selection,
live preview and separate explicit detailed STT. Cache belongs to the normal Import
action. Track edits preserve cache state while the same source is being reviewed.
No import or model work starts simply by opening the dialog.

Pending footage click/right-click reopens this review. Processing footage cannot
reopen it. Cancel/backdrop/Escape withdraw the pending selection without starting
work; focus enters the enabled controls, wraps with Tab and returns on close.
Track lists and the dialog scroll within the existing media-import styles.

Browser upload keeps its normal queue review and native-file handoff for following
MKV, with copy updated to describe the new review. Browser File objects still do
not expose a native path. Existing batch/native and post-import asset menus remain.
The success notice now describes automatic final import and optional full-file
STT, matching the Round81 backend behavior.

## Current Live Transcribe implementation

Source inspection confirms faster-whisper's WhisperModel in the local Studio.
Both OBS live requests and growing-MKV live phase select Whisper tiny; the MKV
worker reads3s preview slices. Growing MKV detailed phase selects large-v3. This
round changes no model, inference policy, media, engine or persistent format.
