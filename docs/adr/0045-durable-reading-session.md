# 0045 — Durable guided Reading Sessions and capture receipts

Date: 2026-10-05. Status: accepted at bounded persistence/recovery scope.

## Decision

A Reading Session is a project-owned schema-1 document under
`assets/training/reading-sessions/<session UUID>/session.json`. It snapshots the
selected Reading Pack cards, delivery directions, emotion order and version,
and records one explicitly selected Speaker Profile. Application pack edits
must not change the session's ground truth. References are IDs or project-relative
paths; reopening a moved project resolves the session through its new root.

The server owns revision, cursor, skips, measured take durations and coverage.
Skip/end mutations require the current revision. A session can be in progress,
completed or ended. A completed card plan means capture progress only; it is
not evidence that speech quality, identity or training readiness passed.

Each browser recording freezes the session, card and revision before requesting
the microphone. It assigns one capture UUID to the take. An uncertain upload
retains that exact file and UUID for explicit retry, holds the current card and
prevents another recording, skip or end until a durable receipt returns.
The server records the capture intent before importing, publishes capture
metadata with the media index, and repairs a lost session link from an already
indexed, verified artifact. Reusing a capture UUID for different content fails.
Reopening reconciles published captures and retires unpublished intents while
retaining their hashes. Exact original-intent retries remain valid only for the
current card; skip/end are not trapped by a vanished browser file. Reopening
never resumes the microphone.

Guided takes carry the exact card text, explicit Speaker and emotion. Browser
ASR cannot overwrite that text. `guided` records capture provenance; it grants
no automatic QC, timing, identity or higher-quality-tier approval.

## Limits

This slice does not implement continuous-flow automatic segmentation, post-take
QC, quality-tier promotion, reference harvesting or calibrated identity locking.
An upload that never published an asset does not advance the card. Volatile
browser audio cannot be recovered after a browser restart unless it reached the
project; the reopened card remains ready for an explicit new take.

One local API process serializes session mutations per project. Independent
API processes writing the same project concurrently are outside the current
single-controller runtime contract.

## Evidence

See `docs/gates/03-04a-durable-session.md` for persistence, recovery, move/reopen,
UI and validation evidence. Phase 03-04 remains open for its other gates.
