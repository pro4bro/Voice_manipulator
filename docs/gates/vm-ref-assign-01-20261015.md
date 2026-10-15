# VM-REF-ASSIGN-01 — 2026-10-15

## Delivered

One contextual editor opens from waveform, subtitles and Script, including
keyboard context menus. Right-click inside the selected area retains its scope;
outside it selects the actual word/row under the pointer, or requires an explicit
selection in empty audio. Target/source revisions and text are frozen before
asynchronous loading. Cancel/late responses cannot create or retarget bindings.

Choose multiple reference footage, independent properties (timing, intonation,
volume, emotion, shout, whisper), source spans, strengths and priorities. Preview
shows exact target text/timing and inherited Script intent. Missing/unmarked
sources and invalid spans remain explicit. Apply is atomic, revision checked and
project portable. Reassigning the same sentence after a Script save updates its
existing ID. Source SHA256 detects changed audio; unmarking does not erase bindings.

Requested characteristics are not analyzed or applied to generated audio in this
round. The dialog states that boundary. Reference Detail slots/navigation are the
next round, followed by resolution, timing/delivery and random schedules.

## Evidence

- New domain/component tests cover exact text, UTF16 spans, silent/disjoint
  ranges, all three menu origins, keyboard menus, multi-source property mappings,
  Apply/Cancel, stale targets, cancelled late reads and Script edits during a dialog.
- Backend affected final: **56 passed**, including cache recovery/reuse, original
  text consistency, atomic assignments, stable binding IDs across Script saves,
  changed/missing sources, move/reconnect and bounded output snapshot reads.
- Initial full backend867 passed; final **870 passed** after the review repairs.
  Final frontend **844 passed / 91 files**, typecheck/build passed; see combined gate.
- Live HTTP acceptance on a separate local API: two actual 3s / 24kHz / mono /
  PCM16 WAVs imported, four bindings across untimed Script and two separated timed
  fixture ranges, repeat Apply preserves IDs, stale revision returns409, unmark
  retains mappings, project move/Open Existing retains Script/bindings and exact
  source hashes. `.scratch/vm-first-five/http-acceptance.json` records receipts.
- PCM fixture metadata explicitly says it is not TTS. No trained voice success,
  speech/emotion quality or browser result is inferred from it.

## Open gates

The browser inventory was empty; creating an IAB tab returned `Browser is not
available: iab`. Actual browser layout/gestures/native-import dialogs therefore
remain open. After CPU/sandbox timeouts, native full/clone/LoRA Script UAT passed
edit/reuse/Stop/retry/move checks with actual WAVs. Listening and measured word
alignment remain open. See the combined gate for counts/commits/next round.
