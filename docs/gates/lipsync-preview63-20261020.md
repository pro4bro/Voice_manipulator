# LipSync preview gate — round 63 — 2026-10-20

## Delivered

- Separate LipSync navigation page with an Input-like left/center/right/bottom
  layout. Left selects a live Media Pool video and an available generated Voice
  Output. Center previews original footage with the generated voice. Right has
  numeric timeline starts and source IN points. Bottom displays two draggable
  tracks and a shared playhead.
- Video playback resolves a project media asset ID through the project-owned
  media index and serves its original file. Audio uses the existing Voice Output
  endpoint. Recycled/disabled video and missing generated audio are excluded.
- The page labels timing as an unsaved preview draft. Generate, After, and face
  replacement are visibly unavailable. No output artifact, project.json structure, or
  engine source is modified.

## Verification

- Focused frontend: 10 passed in 3 files for alignment, source selection,
  source URLs, empty/recycled states, and manifest layout; WorkspaceShell's
  61 tests also passed after adding the page reopen/layout check.
- Full frontend: 1,144 passed in 138 files. Typecheck and Vite build passed
  with 194 modules transformed.
- Focused backend: 2 passed. Video endpoint covers HTTP byte-range response,
  rejection of audio assets and recycled footage; the other check reopens a
  project with LipSync as its saved last page.
- Full backend: 1,207 passed, 1 failed, 3 warnings in 736.65 seconds. The sole
  failure was the unrelated installed VibeVoice Streaming import exceeding its
  fixed 60-second subprocess timeout. It failed again alone, then a direct
  runtime import completed in 47.63 seconds and the unchanged test passed alone
  in 12.58 seconds. This is a host/runtime timing caveat; the full-run result
  remains recorded as failed.
- `git diff --check`: passed. Real browser decoding/sync and an actual
  Lipsync model/artifact are outside this gate.

## Remaining gate

Save a portable, revisioned alignment; approve verified inputs; integrate a
product-owned render adapter and durable job; validate video/audio artifact
properties; then enable synchronized Before/After QC. Optional face replacement
requires its own reference and verified derivative. See ADR 0120.
