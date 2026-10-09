# STT word timing — investigation and next measurement

2026-10-09, USER-FEEDBACK-05. This document records findings and an executable
evaluation scope; it does not claim a measured acoustic accuracy improvement.

## Current source and actual defect

Studio `_transcribe` already requests Faster-Whisper `word_timestamps=True`,
beam5, known project language, VAD and DTW. It then snaps phrase-edge words to
nearby unpadded Silero speech edges; the middle words remain DTW measurements.
The edge refiner previously accepted candidates inside the neighbouring phrase.
This round rejects crossing candidates and also prevents two adjacent phrase
refinements from claiming the same gap. Regression tests reproduce both cases.

The frontend repairs malformed/zero/overlapping editable intervals while retaining
the original supplied interval in `sourceTiming`. These are **untrusted estimates**
for editing, not acoustic measurements. Safe source words and actual silence stay
unchanged. A valid word may start at audio time0; its duration must be positive.

Faster-Whisper uses cross-attention and DTW for word alignment; its implementation
is the authoritative source for those mechanics:
[Faster-Whisper transcription source](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py).
WhisperX offers a separate phoneme/CTC alignment stage and documents language and
unalignable-token limitations:
[WhisperX documentation](https://github.com/m-bain/whisperX).

## Why a new aligner has not been made the default

ADR0007 and `scripts/probe_forced_alignment.py` record the earlier Conviction236s
comparison. Its best Vietnamese250h candidate had median35ms versus DTW50ms,
but mean188ms versus107ms and p90358ms versus230ms. Those are **historical phrase
onset errors against a VAD proxy**, not new measurements or word IN/OUT truth.
Confidence-only hybrid selection did not remove the bad tail. R5 failed its
frozen acceptance gates, so R6 integration remains unaccepted.

## Exact next round: STT-TIMING-ACCURACY-01

1. Freeze a disposable copy of the reported footage/analysis PCM, hash, sample
   rate, channel mapping, model/version, language and recognizer settings.
2. Retain current original DTW words and the repaired editable view separately.
   Use an owner-reviewed set of word IN/OUT anchors from the same audio, including
   long silence, fast speech, small words, phrase edges and the reported failures.
   The new middle-click editor can provide these anchors; structural estimates
   and Silero endpoints must not be scored as human truth.
3. Compare the current DTW baseline and fenced phrase refiner against a fresh
   isolated250h alignment candidate, using identical transcript/audio/anchors.
   Avoid the previously mis-loaded default Vietnamese checkpoint. If comparing
   another recognizer model, score its lexical changes separately.
4. Report matched-word coverage, start/end absolute errors (median, mean, p90,
   p95), zero/reversed/overlapping counts, wall time and memory. Report omitted
   words and unmatched anchors instead of silently excluding them from scores.
5. Keep the existing R5 gates unchanged; any new per-word acoustic gate must be
   recorded explicitly before selecting the winning candidate. Change production
   timing only with reproducible improved mean/tail error and retained coverage.

No model download, inference dispatch, owner-media rewrite or production preset
change occurred in USER-FEEDBACK-05. Real browser/audible acceptance remains
UX-EDITING-DEVICE-01; this measurement is a separate quality gate.
