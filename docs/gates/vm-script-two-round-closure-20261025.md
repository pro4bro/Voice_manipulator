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

The current browser attempt was refused before a tab opened:
`Local browser use is disabled in Work settings`.
The owner confirmed enabling it and supplied three Settings screenshots. They
show Browser enabled, default browsing requiring approval, a site exception for
`http://127.0.0.1:18120` and full-CDP enabled. After that confirmation, creation
of the owned fixture tab was still refused. Resetting the CUA JS kernel and
calling `cua.getState()` returned no browsers and the same disabled-in-Work error.
A further inventory check after inspecting the screenshots gave the same result.
The block occurs before URL/site approval. Its effective-permission mismatch is
unresolved; no alternative automation channel or permission bypass is used.

Official references reviewed for configuration guidance:
[Browser](https://learn.chatgpt.com/docs/browser#computer-use-in-the-browser),
[local security](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security).
These describe separate browser/native/policy controls but do not establish the
cause of this particular client mismatch. A client restart is a recovery step
to try, not a verified fix or instruction to loosen additional permissions.

An isolated copy at `.scratch/vm-round-close-uat` contains4 Script turns and12
layers, with22 existing synthetic WAV sources. HTTP reads on port18131 confirm
the current Script and active Version both have4 rows and12 composition layers.
No owner project/media/model was changed and no inference/training was run.
`pre-browser-proof.json` confirms all22 WAV and22 output JSON hashes unchanged;
all source WAVs are mono PCM16 at24kHz. The owned server was stopped after the
blocked browser attempts; fixture files remain available for the next UAT.

Pending actual-browser checks:

- [ ] Dialogue-only forward/reverse selection across turns copies no labels.
- [ ] Cross-column selection copies speaker names and spoken text in turn order.
- [ ] Native Enter/Alt+Enter, multiline paste, Vietnamese input, undo/redo and
      reload preserve exact text and row/speaker identity.
- [ ] Master scrolls with layers; the one ruler remains visible; subtitles freeze
      directly below it. Navigator and transport stay below the scroll viewport.
- [ ] Zoom/pan align ruler, waveform, subtitles and source clip waveforms.
- [ ] Vertical clip transfer and toolbar commands keep source/timeline timecodes;
      frozen/hidden areas reject drops. Source hashes remain unchanged.
- [ ] Dark/light visual evidence and actual screenshots saved.

## Current completion status

The full API gate is closed for this verification run. Browser acceptance remains
open because the tool still denies access despite the enabled Settings screenshot.
The previous complete frontend gate remains1341/167 files, typecheck/build233 pass;
source files were unchanged during this check. Do not interpret
DOM event simulations or a synthetic runtime-status banner as native-browser or
real-model acceptance.
