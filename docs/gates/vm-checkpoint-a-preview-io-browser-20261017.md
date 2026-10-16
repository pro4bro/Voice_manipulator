# Checkpoint A — preview IO, scheduling and real browser

2026-10-17, rounds41–45. Phase03 remains60%; Checkpoint A remains open.

## Changes and evidence

1. Artifact diagnostics split checksum, durable report publication and final WAV
   verification. Atomic create/write-flush/fsync/close/replace/retry are separate
   request measurements, zero when skipped and absent from saved cache reports.
   Existing durability/retry/cleanup semantics remain; ADR0098.
2. A non-resetting40ms timer replaces the trailing180ms timer that could starve
   during sustained movement. One request stays active and later moves coalesce.
   A→B→A and pointerup before a pending followup track the actual accepted audio;
   ADR0099. These are scheduler guarantees under deterministic timers.
3. Preview variants share a lock by canonical output folder across instances in
   one process. Unrelated outputs proceed independently; unused weak entries
   collect. Same-key publication, different-key serialization, aliases and error
   release are covered; ADR0100. Cross-process editing is not newly supported.
4. Matching checksum with malformed/truncated RIFF no longer leaks HTTP500.
   Both RED cases now return audio404/waveform400 and rebuild safely through the
   normal draft path, keeping the journal/source unchanged; ADR0101.
5. Real browser exposed a positional Script grid defect: first closed disclosure
   got100px, five others13px despite16.8px summary lines. A VoiceScript-only
   settings region and flex layout retain natural29.8px headers and transcript
   space; shared sidebar styles are preserved; ADR0102.

## Measurements and limits

Private fixture: natural Vietnamese eight-second speech, mono PCM16/24kHz,
192000 source frames, SHA256
`8df7b33eda41137d9a4e587d69cb225fb8a5687016867522eebd62ab6453e327`.

- Twelve fresh suffix renders reusing three exact operations produce the same
  230400-frame WAV, zero clipping and accepted boundary diagnostics. Source and
  journal revision5 stay unchanged. Render-call median336.98ms, range173.49–536.24ms;
  fsync median127.41ms, no replace retry. Storage/scheduling variance is observed;
  no particular filesystem filter or hardware cause has been established.
- Controlled contention fixture holds one native renderer before execution.
  Before43 a cached other output cannot finish during the200ms hold; eventual
  lock wait404.07ms includes remaining native work. After43 it finishes8.90ms
  while the first is held, lock wait0.175ms. Native WAVs are byte-identical. This
  artificial hold proves independence, not normal latency or250ms acceptance.
- No optimization removes fsync, checksum, PCM/frame or boundary validation.
  No250ms end-to-end result is claimed.

Raw receipts: `.scratch/vm-rounds41-45/artifact41-receipt.json`,
`contention-before43-receipt.json`, `contention-after43-receipt.json`.

## Production artifact and portability checks

Actual production API commits a fourth stretch, checks exact9.6s WAV, Undo/Redo
restores exact hashes, a fifth draft reuses four operations without committing,
and Undo restores9.2s. WAV/Range206/waveform/stale409 pass. After a guarded Unicode
folder move, Open Existing reads revision9/cursor3 and a validated cache hit.
Manifest projectPath/location stay relative. Source/output metadata are unchanged.
The extra Concurrency fixture is a copied test output, not model inference.
Receipt: `.scratch/vm-rounds41-45/checkpoint45-receipt.json`.

## Real browser verification

CUA now initializes successfully. A private production controller/API uses
18319/18320 and an actual isolated CPU Studio18381, with no loaded model
(`model_load_count=0`, idle). Shared runtimes and upstream engine source remain
untouched. The first partial-runtime screen correctly blocks workspace access
until the private Studio starts; no runtime-status mock was used.

At1280×720, the moved project opens Voice Manipulator and loads the real preview:

- PCM waveform visible, audio readyState4/duration9.2s.
- Subtitle selection shows START6.670s / DURATION0.138s / END6.808s, two handles
  and Timeline/Script navigation markers. These are mapped annotations, not a
  human acoustic verification of that word.
- Browser Redo9.6s/Undo9.2s select the matching audio URLs; playback advances from
  6.670s to6.894s with paused=false, then pauses. Final journal revision13/cursor3.
- All six closed Script panels measure29.8px. Settings105px scroll viewport over
  179px content; opening Fix increases content to257px while transcript retains
  126.6px. At1024×600 transcript keeps100px; settings viewport is a compact19px
  over179px content, without horizontal overflow. Broader small-pane UAT remains.
- Console warnings/errors empty. Viewport override reset, temporary tab closed;
  private listeners stopped and ports18319/18320/18381 free.

Receipt/image: `.scratch/vm-rounds41-45/browser45-receipt.json`, `ui45.jpg`.
The available browser controls do not expose a held-Ctrl drag gesture. Therefore
Ctrl-drag latency, continuous playback while dragging, human listening and native
Save/Cancel are still unverified. UI source tests do not substitute for these.

## Regression and remaining work

Frontend917 tests/112files pass131.60s, typecheck/build172 pass. The first frozen
API run reports1136 passed/one failed/three warnings in600.75s. The failure is
PermissionError opening follow-state.json during MKV restart status polling;
the exact process/filter denying access was not identified. It is not a timeout.
That first source snapshot has588 inputs; receipt/log/manifest are retained.

Checkpoint reads now retry only PermissionError, at most five attempts with
four waits totaling200ms. Persistent denial and invalid JSON remain errors.
The four reads share this policy, including configure's pre-lock click snapshot
and finish's post-poll reload. Status does not take the long decode lock.
Three focused regressions plus the original follower suite pass26/26 in76.00s,
two existing warnings; original five-second restart deadline stays unchanged.
ADR0103 records the tradeoff. Final rerun on589 frozen API/web inputs passes
all1140 API tests (620.90s, 3 existing/fixture warnings). All589 hashes match after completion; frontend
source also matches its917-test pass. The earlier failed run remains recorded.

No assertions/timeouts/thresholds were relaxed or tests skipped. No new model,
training, inference, download, push or portable release. Emotion/whisper/shout
conditioning, random conditioning execution, model word anchors, human word/
identity/seam reviews, native export and13 downstream processor codes remain
open. See `docs/VOICE-MANIPULATOR-REMAINING-ROUNDS.md` for dependencies.
