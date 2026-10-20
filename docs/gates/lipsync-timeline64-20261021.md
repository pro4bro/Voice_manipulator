# LipSync Timeline UI gate — round 64 — 2026-10-21

## Delivered

- LipSync uses Input's three-column widths and 36% Timeline row. Media Pool
  and Voice Output use the shared library tab treatment; Preview Video fills
  the Script region. The timing form is compact enough to keep the render
  status/actions visible at the reference 1900×900 viewport.
- The bottom calls the existing `Timeline` export in an alignment mode with
  its frame, ruler, zoom, scroll navigator and transport styles. Separate
  video and generated-voice lanes support pointer moves, source IN/OUT trims,
  numeric edits and keyboard nudges. The Voice Output lane requests its
  source waveform through the existing endpoint. Preview playback uses one
  clock, video muted, with independent source mappings.
- Source files and project manifest are untouched. Alignment remains session
  only. After, Generate LipSync and face replacement are still disabled.
- `docs/research/lipsync-engines-2026-10-21.md` screens MuseTalk,
  LatentSync, Wav2Lip, InfiniteTalk, VideoReTalking and FaceFusion against
  function, maintainer-provided quality evidence, runtime and licenses.

## Verification

- Focused LipSync tests: 6 passed in 2 files. The workspace integration test
  passed separately. These cover source selection, empty/recycled source,
  shared timing, pointer move, keyboard trims, and source OUT mapping.
- Full frontend: 1,146 passed in 138 files. Typecheck and Vite build pass;
  build transformed 195 modules. The ordinary Timeline suite is included.
- Full backend: 1,208 passed, 3 existing dependency/fixture warnings in
  667.15 seconds. No backend source changed in this round.
- Real browser layout inspection on an isolated fixture at 1900×900 measured:
  left 300 px, center 1246 px, right 340 px, bottom 300 px, Preview screen
  1218×366 px. Both selected clips appeared on the shared ruler. The fixture
  used dummy source IDs, so failed media requests there are expected and do
  not constitute a playback acceptance test.
- `git diff --check`: passed.

## Remaining gate

Persist and approve a portable alignment revision, integrate a licensed
processor through a product-owned adapter, verify real rendered artifacts and
enable Before/After QC. Run both candidate engines on consented project footage
and generated voice before claiming visual/sync quality or production license
clearance. Optional face replacement needs its own reference and license gate.
