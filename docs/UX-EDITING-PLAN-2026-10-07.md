# Import, organization and time-aware editing — 2026-10-07

Owner authorizes every round below in one invocation, with separate verified
commits and resumable evidence. This request supersedes the one-round stop rule.

| Round | Acceptance |
| --- | --- |
| IMPORT-UX-01 | Multi-file selection, in-app cache choice, visible per-file pending/caching/error entries, adding batches during import. |
| MEDIA-ORG-01 | Persistent manual order and nested virtual folders, drag move into/out, cycle rejection, immutable media retained. |
| SCRIPT-EDIT-01 | Explicit table/prose switch only, stable native selection/edit/copy/paste, inline table edit, context edit and functional find/replace. |
| WORD-EDIT-01 | Preserve unchanged anchors; deleted text drops its interval; inserted text has bounded equal interpolation, visible unverified provenance and delayed explanation. |
| WORD-GAP-01 | A small bounded gap on newly recognized adjacent word intervals; preserve original recognizer boundaries/provenance. |
| TIMELINE-EDIT-01 | Inline subtitle edit, Ctrl insertion, shared Script edits; middle-click promote, waveform IN/OUT drag with audition, advance and cancellation. |
| TIMELINE-RANGE-01 | Persist working IN/OUT and cut points; select/delete cut sections non-destructively, uncut restore; identical effective intervals for playback, STT, diarization and training. |
| LIST-UX-01 | Right-edge list scrolling, blank side gutters to deselect, measured responsiveness while other footage transcribes. |
| UX-INTEGRATION-01 | Full frontend/backend/typecheck/build; browser-owned copied project exercises cross-module behavior and persistence. |

## Decisions

Folders organize references, not source files. No project asset is destroyed by
reordering, folder changes, cut deletion or marks. Empty working ranges are errors
for processors, not permission to process the original whole file. Existing
projects default to their full interval. Source-to-processed interval mapping
must survive compact analysis audio. Restoring intervals makes later processor
runs include them again; existing transcript is retained until explicitly rerun.

Interpolated words are estimates (`user-interpolated`, untrusted); manual waveform
assignment records `manual` provenance. Missing or reversed anchors do not invent
verified alignment. Proposed small gap is 10 ms, reduced if the available span
cannot accommodate it. Preserve original recognizer intervals when applying the
new editing gap; do not reinterpret historical measured source timings silently.

Validation uses owned fixtures and preserved source hashes. Hardware/audio quality,
real high-load smoothness and exact OS clipboard remain explicit if tools cannot
observe them. Existing failed CER/performance and physical owner gates stay open.

## Result

All requested implementation rounds are integrated; separate commits retain
their focused checks. UX-INTEGRATION-01 combines final complete suites, actual
PCM processing and browser persistence evidence in
`docs/gates/ux-editing-2026-10-07.md`. Device acceptance is explicitly listed in
`docs/UX-EDITING-OWNER-CHECKS.md`; no older phase or quality gate is advanced.
