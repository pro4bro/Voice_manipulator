# ADR 0024: Concurrent track rows and overlap evidence

Date: 2026-10-02
Status: Accepted

## Decision

Before Speaker Diarization, a Script row belongs to an audio track. An
interjection on a second track starts its own row without ending a first
track that continues speaking. The first track closes its row when another
track speaks during a real gap in its recognized words. A long pause with no
other recognized track does not alone split a row. After diarization, a change
of speaker label on one track does split the row. Rows sort by start time and
may overlap in time; neither text nor source word timing is rewritten by this
display grouping. The gap test allows 0.25 seconds at each edge and requires
0.3 seconds of another track's recognized speech between those edges. Without
an independent VAD end-of-turn event, this is a display inference rather than
proof that the first source was acoustically silent.

OBS archive Script labels retain the source's Track number where stored and
append a custom alias only when available. Saved word timestamps remain the
source of truth; row bounds come from the first and last words in that row.
The UI shows row centiseconds and exposes individual word milliseconds on
hover, keyboard focus and accessible labels. An untrusted word remains visible
for review but cannot establish a precise overlap interval.

Realtime overlap requires nonempty recognized speech on both LiveLink tracks,
valid segment timing, and at least 0.4 seconds of intersection. Detailed STT
overlap uses trusted words from different tracks with the same duration floor.
These are review indicators, not proof of separate speakers: source bleed or
recognizer timing error can still make a false positive. The source recording
and recognized words are preserved for human verification.
