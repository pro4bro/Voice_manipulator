# ADR 0031: Resume OBS realtime STT from per-track PCM checkpoints

Date: 2026-10-02
Status: Accepted at API restart and copied real-PCM replay level

## Context

ADR 0030 replaced queue-full loss with a process-local deferred PCM cursor.
Committed PCM survives an API restart, but that cursor and the recognizer's
open utterance do not. Starting only with the next incoming chunk can omit
speech already on disk or split one speaking turn into two Script rows.

## Decision

Each OBS track owns `channels/<channel-id>/live-stt-progress.json` inside its
recording folder. After processing a committed PCM chunk, the worker atomically
replaces the checkpoint with `nextSequence` and `activeStartSequence`. The
checkpoint is flushed before replacement. A short retry handles the Windows
case in which another reader briefly holds the destination file open.

At API startup, scan nondeleted project recording journals. A new journal's
`liveSttRecoveryVersion: 1` declares that it participates even if no progress
file exists yet. Legacy completed journals without a checkpoint or marker are
not replayed. For each track, begin with `activeStartSequence` when an
utterance was open, otherwise `nextSequence`; read and verify the source PCM
as in ADR 0030. A process-specific Studio session suffix makes reconstruction
independent of an old recognizer session that might remain in Studio memory.

The transcript JSONL stays the public event log. Replayed events with the same
track, utterance ID, status and ending sample reuse the existing event rather
than appending a new revision. This covers a crash between event append and
checkpoint replacement, including a final event. A malformed checkpoint or
missing committed PCM fails visibly rather than advancing the cursor. If an
event cannot be appended, the worker stops without checkpointing its chunk.
Later PCM uploads still commit but cannot open a new transcription queue past
that gap; restart retries from the previous committed position.

## Evidence and limits

Backend tests cover two-track backlog restart, interruption during an active
utterance followed by new PCM, FastAPI lifespan recovery without a new upload,
a checkpoint rewound behind a persisted final, and transient Windows file
locking. A failure-injection test verifies an unsaved event cannot advance the
checkpoint. A copy of the 12B physical OBS PCM replayed 659 chunks across two
tracks through a simulated restart. The final checkpoints were 330/329; its
104 events had zero errors and zero repeated finals. The 185.71-second source
took 34.328 seconds total with a deterministic 5-ms fake recognizer, including
25.734 seconds after restart.

The measured replay rate does not establish latency with the real `medium`
model or concurrent detailed STT. A physical OBS/API restart under that load
is the next acceptance round.
