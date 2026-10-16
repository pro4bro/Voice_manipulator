# 0081 — Contextual Patch source and reference

Date: 2026-10-16

## Decision

Context Patch captures an imported or recorded Media Asset directly. The source
stays in Media Pool. An output-shaped metadata view exists only in memory for
composition; it is never published as generated speech. Only explicit Apply
creates a Voice Output with mixed source/TTS provenance.

Targets require contiguous trusted timing and one explicit Speaker Profile.
Reference candidates come from the same source before or after the target with
a safety gap. Unknown or different speakers, known diarization overlaps, removed
regions, clipping and almost-silent candidates are excluded. The entire target
span is checked, including gaps between words. Noise assessment remains
unverified; the user sees spans and transcripts and chooses a reference.

Explicit selection extracts a project-owned reference WAV and records its
source/derivative hashes, exact frames and transcript. Read/reopen verifies the
canonical path and that the PCM equals the current source slice. Stored metadata
alone cannot relabel a different voice or transcript as the chosen reference.

The clone uses the existing OmniVoice base with a temporary reference voice.
There is no training, saved Voice Model publication or trained-checkpoint fallback.
Replacement text and reference text are separate inference inputs. Context jobs,
receipts and preview URLs have their own namespace. They reuse owned Stop,
shared runtime lease and explicit Apply from trained Patch.

## Limits

This slice accepts complete PCM16 mono 24 kHz analysis WAVs. Other rates require
an explicit analysis derivative before this processor can run. It preserves
usable source transcript cues and speaker runs; it does not infer missing speech
or claim word-level acoustic alignment. Natural-duration ripple is the only
timing policy. Delivery, emotion, gain, exact word timing, hybrid conditioning
and acoustic noise/identity acceptance remain separate work.

Failed audio quality never applies. An explicit retry creates a new immutable
clip revision so it does not repeatedly reuse a rejected cache artifact. A
clipping measurement or splice limit is never weakened to admit model output.
