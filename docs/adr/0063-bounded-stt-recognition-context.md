# ADR0063 — bounded Studio recognition context

2026-10-10. Accepted for STT-GAP-01. Refines internal request chunking under
ADR0025; its frozen initial OBS snapshot and cursor semantics remain in force.

## Context

A real406s archived OBS file has28.668s with no detailed words although captured
PCM and provisional text exist. Full-context replay reproduces the omission in
raw recognizer segments, before conversion/merge/publication. VAD keeps speech
in that region; disabling the hallucination silence guard does not repair it.
The transport-oriented89.1min client chunk threshold sends ordinary-length
recordings to recognition in a single large request.

## Decision

Bound common Studio import requests to60s timeline intervals with the existing
2s source context on either side. Keep model, language, VAD, native DTW and
phrase-edge settings. This applies to ordinary archive STT and the internal
recognizer path of a frozen full OBS snapshot. Provisional live recognition,
other engine adapters, public APIs and persistent schemas are unchanged.

Primary intervals own words. Padding may recover an omitted word only without
overlapping already-owned words. Defer trailing padding until its owner is seen;
preserve owning text on conflicts and sort final output chronologically. Reject
text-bearing blocks without usable segment timing instead of silently stripping
recognized text during overlap merge. No timestamps are invented by this repair.
Cancellation, progress and scratch-file cleanup continue through the existing
serial importer path.

## Evidence and limits

Two independent production copy routes produce1,177 words/77 in the reported
gap versus baseline1,094/zero. Source1325 hashes remain identical; submitted PCM
slices match exactly, and final stored word intervals do not overlap. Retained
real responses also pass the final merge policy unchanged. Source timing warnings
are kept. Gate: `docs/gates/stt-gap-01-obs-recognizer-context.md`.

This is a repair for a reproduced context-sensitive omission, not proof of
general transcription accuracy or the recognizer's internal decoder mechanism.
STT-GAP-02 needs reviewed gap text and broader boundary/silence samples;
STT-TIMING-ACCURACY-01 and frozen quality budgets remain required. Existing owner
transcripts are not automatically replaced.
