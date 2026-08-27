# ADR 0006: Align Speaker Diarization To STT Words

## Status

Accepted

## Context

A mixed recording needs both trustworthy word timing and an answer to who spoke
when. "Speaker isolation" is not the same operation: it creates audio stems and
can remove conversational context before transcription.

## Decision

Run detailed STT and Speaker Diarization on the same project-owned analysis
recording, then map diarization spans onto STT word boundaries as `Speaker 1`,
`Speaker 2`, and so on. A diarization label is independent from a Speaker
Profile; the user maps it to a profile after review. Run Voice Isolation only
when overlap, noise, or a downstream stem workflow requires it.

## Consequences

- Script rows, Timeline labels, and both SRT modes use exact STT word timing.
- Any diarization engine can be swapped behind one adapter without changing
  speaker profiles or exports.
- Isolation remains an optional, more expensive processor rather than a
  mandatory prerequisite for every transcript.