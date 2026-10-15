# Voice Manipulator — first five rounds, 2026-10-15

Owner explicitly requested these five checklist rounds in one invocation:
VM-GEN-01 → VM-SCRIPT-01 → VM-REF-LIB-01 → VM-SELECTION-01 → VM-REF-ASSIGN-01.

| Round | Delivered | Acceptance remaining |
| --- | --- | --- |
| VM-GEN-01 | Content fingerprints, validated PCM cache, immutable recovery and reusable repaired clips; native full-model smoke created2.2s real PCM | Multi-row/portability receipt below; subjective identity/listening, actual word alignment and browser acceptance remain separate |
| VM-SCRIPT-01 | Portable hierarchy, migration, five-language split/join, inherited settings/locks and original-text lineage | Browser interaction; actual timing/delivery synthesis belongs to later rounds |
| VM-REF-LIB-01 | Multi-file import/track flow, independent persistent reference role, batch menu/filter/lazy preview | Browser/native-dialog interaction |
| VM-SELECTION-01 | Shared time/word/text/row selection, exact overlays, silence/disjoint ranges, cancel and no implicit multi-range scroll | Browser geometry and long-list gestures; scrollbar markers are VM-NAV-01 |
| VM-REF-ASSIGN-01 | Shared three-origin editor, multiple sources/properties/spans/strengths/priorities, atomic persistent bindings and stale guards | Browser interaction; feature resolution/generation/randomization are later rounds |

## Validation

- Final frontend **844 passed / 91 files**, 229.93seconds with one worker;
  typecheck and production build passed. No tests/timeouts/thresholds changed.
- Final backend **870 passed**, 365.85seconds, with native Windows inspection
  permission. Three existing deprecation/archive warnings remain.
- Earlier full frontend835/89 and backend867 passed. A later frontend run had
  one pre-existing OBS volume race (840pass/1fail); exact unchanged case passed.
  Another had a pre-existing OBS zoom race (841pass/1fail). The unchanged entire
  OBS and WorkspaceShell files then passed **110 tests**; final suite uses one
  worker to reduce resource contention without changing tests or timeouts.
- Final affected backend **56 passed** after three review repairs: avoid repeated
  output reads across targets; keep one binding ID across Script saves; reuse a
  recovered valid clip while preserving its corrupt predecessor.
- Live API PCM acceptance passed import, binding ID/revision rules, original
  source hashes and project move/reconnect. Fixture transcript/output metadata
  are explicitly synthetic, not evidence of TTS or emotional voice quality.
- Browser could not be initialized (`Browser is not available: iab`). This was
  recorded rather than replaced with a browser success claim.
- GPU became available during the batch. CPU291.16s and sandbox GPU281.72s
  attempts timed out. Native Windows GPU retry created a real full-model WAV
  in70.48s at32steps,24kHz monoPCM16. A2s request produced2.2s; locked-duration
  rendering is still a later round, not claimed from this smoke.

## Delivery and next round

Main source only; no portable distribution, push or Phase03 completion is claimed.
Phase03 remains60%. First four local commits:98a939c, ec0c05c,2cf3022,972a7fc.
The fifth commit contains reference assignment and the final integration repairs.

Next implementation: **VM-REF-DETAIL-01** — right-column two-line slots,
expandable source/property details, and content-click navigation to the same
target in both Timeline and Script. Expanding a slot must not navigate.
Separate acceptance: **VM-GEN-01** on sufficient model/runtime resources, then
actual listening and browser/native UAT. SOURCE-EXTERNAL-ASSETS-01 and existing
HUB-COLLECTION-UAT-01 remain queued; this batch does not mark them complete.
