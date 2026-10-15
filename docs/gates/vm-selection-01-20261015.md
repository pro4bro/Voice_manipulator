# VM-SELECTION-01 — 2026-10-15

Waveform left-drag in Voice Manipulator selects exact time ranges, including
silence. Ctrl/Shift adds ranges and Alt subtracts; reversed sweeps recompute
from the gesture snapshot. Cancellation restores that snapshot. A click still
seeks. Existing STT waveform scrubbing/edit gestures retain their previous path.

Script row, timed word sweep/click and editable text selections share selection
with Timeline/subtitles. Each accepted workspace selection carries source/output
identity and revision, immutable-output word IDs, stable sentence IDs and explicit
time/text spans. Waveform readouts show START, DURATION, END in seconds below the
ruler. Disjoint highlights do not fill the gap or auto-scroll/seek to the last
word. Text without generated timing remains explicitly untimed; partial text
with word timing uses the enclosing word boundaries rather than invented
sub-word timestamps. Clickable scrollbar markers remain VM-NAV-01.

Evidence: frontend full **835 passed / 89 files**, 114.61 seconds; typecheck/build
passed. Affected Timeline/Script **33 passed** before the final extra cancellation
case (included in the full suite). New tests exercise silent and disconnected
selections, exact readouts, cross-module highlights, row selection, reverse sweep,
no-scroll multi-selection and cancel restoration. Browser geometry is recorded
in the final five-round gate. Audio/source bytes are not stretched or edited by
selection; timing edits and reference-conditioned generation are later rounds.
