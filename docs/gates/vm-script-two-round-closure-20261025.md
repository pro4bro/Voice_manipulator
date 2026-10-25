# Completion check — legacy turns and Script/Timeline UI

Date: 2026-10-25
Scope: finish the remaining verification of VM-LEGACY-SCRIPT-TURNS-01 and
VM-SCRIPT-TEXT-FREEZE-01. This is not a new feature round or phase advance.

## VibeVoice import diagnosis

The previous full API run passed1625 cases and failed the embedded VibeVoice
checkout import at its unchanged60s subprocess deadline. The same exact test was
re-run without modifying sources or the installed runtime:

- First isolated run:1 passed in36.10s.
- Three further isolated runs:1 passed each in12.49s,11.94s and12.02s.
- Direct offline staged import: checkout configuration0.016s; NumPy0.187s;
  Torch3.547s; Transformers4.187s; target ASR module10.500s;
  processor10.734s. Its module file resolves to the expected streaming checkout.
- A15s repeating faulthandler timer emitted no stall stack on the passing probe.
  No lingering VibeVoice child or persistent test-fixture environment mutation
  was identified. Temporary CPU/disk/native-library contention remains a
  hypothesis, not a proven root cause or repaired product defect.
- No timeout, assertion, skip, dependency, engine or installed runtime was changed.
- Full API rerun: **1626 passed, three existing warnings**,892.83s (14:52),
  exit0. Log `.scratch/vm-two-round-closure-api-full.log`. This includes the exact
  embedded VibeVoice import case within the full-suite context. The latest API
  gate is green; the earlier intermittent timeout has not been root-caused and
  is not represented as a repaired product defect.

## Script and Timeline browser acceptance

Browser access became available after the owner's restart. CUA opened the owned
fixture at `http://127.0.0.1:18131/` using the default1280x720 viewport. All browser
interactions used CUA; read-only DOM geometry was used to verify the native actions.
No permission bypass or alternative automation channel was used.

### Observed in the actual browser

- Forward and reverse dialogue-to-dialogue drag + Ctrl+C both copied exactly
  `alpha bright village dream\necho\nXin chào anh.` without either speaker label.
- Drag starting on a `contenteditable=false` speaker initially selected only that
  name. Removing the explicit noneditable boundary while retaining edit guards
  allowed the same drag to copy exactly
  `An: alpha bright village dream\necho\nBình: Xin chào anh.`.
- Typing `Z` on the speaker label was refused; all four labels and row identities
  remained intact. Table view restored the owned first row after temporary edits.
- At common vertical scrollTop720, the ruler stayed at y398–418 and subtitles at
  y418–446. Master moved to y-302–-142. Navigator stayed at y617–629 and transport
  at y644–664; layer12 was reachable in that same viewport. Only one ruler exists.
- Two Zoom+ clicks gave a4196px canvas. Native horizontal wheel moved the authority
  viewport to scrollLeft640; ruler, subtitle and layer canvases all used width4196
  and translateX(-640px). Subtitle `bright` and its source clip both occupied
  x398.1875–1237.375. This verifies shared zoom/pan geometry on the synthetic fixture.
- Native drag moved `dream` from Fix1 to Fix2, retaining3.000–4.000s. The toolbar's
  Move Up returned it to Fix1. A drop onto the frozen subtitle area was rejected.
  Persisted clip coordinates remain sourceStartFrame0, startFrame72000,
  frameCount24000 at24kHz. Full remains0–120000frames and bright24000–48000frames.
- Unicode Vietnamese typing and multiline paste were exercised on intermediate
  builds. This is not a test of an actual Windows IME composition session.
- Dark-theme screenshots were displayed by CUA during these actions, but were not
  saved to a file before access was lost again. No light-theme or saved screenshot
  result is claimed for this follow-up.

### Native bugs found and final repair

The original browser `insertText` newline command cloned dialogue grid cells and
row IDs. An intermediate `insertHTML` approach preserved interior newlines but,
when pasting leading blank lines at offset0, inserted text outside the dialogue
cell. That intermediate approach was rejected, not accepted as a completed fix.

The final repair removes browser editing commands for Enter/paste. It replaces
only the selected cell's literal text, preserves blank lines/HTML-looking text,
and restores its caret using shared text coordinates. A bounded100-edit,
session-local history unifies ordinary typing, committed composition, newlines
and paste; Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y and beforeinput history requests use it.
External text replacement or row removal clears stale history. Speaker labels
remain protected by input/cut/paste guards while native selection can cross them.
ADR0146 records this implementation decision.

Focused Script verification: **4 files /39 tests passed**,5.31s. Typecheck and build
pass;233 modules. New cases check leading/trailing blank-line paste, literal HTML,
row/cell counts, repeated Undo/Redo, committed composition, normal input and stale
history invalidation. DOM simulation is not native-browser acceptance.

### Access lost after continuation

After the owner sent “em hãy làm tiếp”, reloading the final build was refused with
`Local browser use is disabled in Work settings`. A fresh `cua.getState()` returned
no browsers and the same error. No final-build native text/history/reload/IME or
light-theme screenshot result is claimed. The earlier successful native copy,
scroll, zoom and layer-transfer observations above remain valid as scoped.

The owned fixture still has4 turns/12 layers. `post-browser-proof.json` confirms
all22 original WAV and22 output JSON hashes unchanged, mono PCM16 at24kHz; current
Script rows equal the active Version's Script. No owner project/media/model was
changed and no inference/training was run.
The owned port18131 server was stopped after verification; the fixture and final
build remain available. Browser access was lost before clipboard/tab cleanup or
saving screenshots could run; no successful cleanup of those browser surfaces
is claimed.

Remaining native checks after Browser access returns:

- [ ] Retest the final literal-text/history path at cell start/middle/end and empty
      cells: Enter/Alt+Enter, leading/trailing blank-line paste, Undo/Redo, then reload.
- [ ] Exercise a real Windows IME composition session and inspect browser console.
- [ ] Verify the light theme and save current dark/light screenshots.

## Current completion status

The full API gate remains1626 passed with three existing warnings, unchanged from
the preceding check. The final standard frontend run passes **167 files /1343 tests**,211.25s, exit0;
log `.scratch/vm-browser-closure-frontend-final.log`. An intermediate full run
overlapped source edits and failed the superseded editing-command mock case; it
was discarded and rerun after the final source freeze. No cases, assertions,
timeouts or test configuration were weakened. Final typecheck/build233 pass. Native acceptance is partially complete; the final text/history
patch needs the remaining browser checks above. Phase03 stays60%, Phase06 open.
