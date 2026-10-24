# VM-VERSION-LAYERS-01 — Version state and local audio layers

One bounded round, 2026-10-24. The owner approved per-Version editing and
clarified that Generate Full replaces the current Version's complete audio
arrangement, including all Fix layers. ADR0141 and
`docs/VOICE-VERSION-LAYERS.md` record the contract.

## Delivered

- Media Pool style expandable Session footage cards with Version children,
  folded-page-plus New Session and copy New Version icons. Shared slot context
  menus serve Voice Output and LipSync; future output modules must supply their
  supported actions to the same menu.
- Portable schema2 Version snapshots own Script, generator configuration,
  reference/timing sidecars, subtitles, audio composition and text history.
  Checkout restores the selected snapshot. New Version copies all referenced
  audio into independent output IDs with a unique suffix. Legacy edit journals
  bake into an owned base preview without overwriting their original WAV.
- Generate Full always reruns the entire Script into the current Version and
  resets its Full/Fix arrangement. Generate Fix Only detects new changes since
  the last successful generation, creates local clips and fits them to source
  timing. New overlapping Fixes go below every older overlap. Playback and
  export use the same bottom-wins composition with bounded seam fades.
- Layer controls support source trim, split at playhead, move, mute/enable and
  delete. Changes update the current Version. Disabled slots deselect and reject
  clone/publication; removal is soft. Unmanaged processor results are explicitly
  adopted, so internal Fix/composite files do not appear as extra slots.
- Publication checks captured Version revision and Script content at commit.
  Stopped, stale, invalid or incomplete results cannot replace completed audio.
  Browser findings fixed key-order autosave loops, fractional-frame waveform
  refetch loops and Script text display when an older audible layer is revealed.

## Verification

| Check | Actual result |
|---|---|
| Frontend full | 158 files / 1277 tests passed before the final integration corrections |
| Final frontend focused | 12 files / 173 tests passed; final Patch callback regression separately brings WorkspaceShell to 70 passing cases |
| Final typecheck / build | Passed; Vite built 224 modules |
| Backend full | Started before the final adoption/guard corrections:1590 passed, 1 failed, 4 warnings, 898.14 s; failing existing VibeVoice streaming import exceeded its unchanged 60 s subprocess timeout |
| Final backend focused | 53 passed / 2 deprecation warnings: composition, Fix planning, Version generation, persistence/API, migration, adoption and disabled slots |
| Isolated runtime/cancellation recheck | Both unchanged tests passed, 24.57 s / 2 deprecation warnings; no GPU-lease sharing warning on recheck |
| Existing Script backend | 32 passed in the earlier combined 80-case run |
| Mutation check | Inverting overlap placement made the deeper-overlap regression fail; production file restored byte-for-byte |
| Browser | Isolated synthetic-PCM project at port18561, both themes, context menu, clone, Script/config restore, layer mute and trim, reload and API restart; no browser error/warning logs |
| Artifact audit | Three Versions have disjoint referenced output IDs; Version3 trim is 19200 frames versus 24000 in Versions1/2; all composites mono PCM16 24kHz /29998 frames; browser-downloaded WAV SHA256 equals the active composition |

The full run also reported a Windows temporary GPU-lease file sharing warning
from the existing forced-generation cancellation test. No test timeout,
assertion or quality gate was weakened. The unchanged streaming import and
cancellation cases passed together on the isolated recheck.

Browser artifacts and command logs remain under `.scratch/vm-version-layers01/`
and `.scratch/vm-version-layers01-*.log`: `browser-audit.json`,
`voice-version-dark.png`, `engine-light.png`, `engine-dark.png` and the mutation
log. The isolated server and browser tab were closed after validation. No owner
project, source media, model files, runtime service or engine checkout changed.

## Remaining limits

Trusted matching word timing permits word-local Fixes; missing/untrusted timing
falls back to the affected row. Added/deleted/reordered rows, or new text in a
previously empty row without timing, require Generate Full. Fits outside0.5–2x
return an explicit error. Composition format is bounded to four hours.

PCM tests prove placement, precedence, duration and source preservation. They do
not prove voice identity, prosody or perceptual quality on real model speech;
that listening gate remains open. Phase03 remains60%, Phase06 stays open.
Stop this bounded round.
