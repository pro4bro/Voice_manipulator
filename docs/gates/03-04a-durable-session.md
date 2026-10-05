# 03-04A — Durable Reading Session and UI recovery

## Result

The backend persists a project-owned Reading Session snapshot at
`assets/training/reading-sessions/<session-uuid>/session.json`. It snapshots the
selected Reading Pack title/version, chosen emotions, language, card text and
directions, explicit Speaker Profile identity, cursor, skipped cards, measured
per-card seconds and take asset links. File references remain relative to the
folder containing `project.json`; moving the complete project preserves the
snapshot.

The API provides paginated session listing with status filtering, idempotent
session creation by client UUID/request, one active session per project,
individual load, revision-checked skip/end and multipart take upload. A take is
registered only after the media index publishes its asset and the server
verifies its source hash, mono analysis WAV and measured positive duration.
The asset index atomically includes the session/card/capture IDs, guided tier,
snapshotted text, Speaker Profile and card emotion. A stable capture UUID plus
hash prevents an unknown response from importing the same take again.

An upload intent is persisted before media processing. Reading-session reads
reconcile intents against indexed capture IDs after restart. If no asset exists,
the intent moves to a retired tombstone, releasing the card while retaining the
payload identity; an exact retry is accepted only for its original revision and
while that card remains current. Conflicting bytes/card return 409. Failed,
unpublished media derivatives are retained for diagnosis and are never removed
by this round.

All project/session file, catalog, pack and media-index reads used by async
session endpoints run in worker threads. A per-project async lock serializes
session create/mutate/reconcile operations within this single API process. This
does not provide cross-process or multi-host locking; the app's supported local
runtime uses one API process.

## Verification

- `services/api/tests/test_reading_sessions.py`: snapshot/project move/schema
  rejection, same-request idempotence and conflicting request, one-active rule,
  skip/end compare-and-swap, unknown response after index publication and
  no-duplicate retry, source-hash collision, pre-publication failure retirement,
  exact original-revision retry, late skipped-card rejection, measured duration,
  explicit speaker/emotion and health responsiveness during a blocked session
  file read.
- `services/api/tests/test_reading_packs.py` and
  `services/api/tests/test_media_import_processor.py`: existing pack and
  ordinary import behavior remain covered.
- `.venv/Scripts/python.exe -m pytest services/api/tests -q`: **570 passed**,
  2 existing deprecation warnings, 156.67 s. The full suite overlapped the
  separate paced 19B7 profiling run; its CPU/FFmpeg load must be considered
  when interpreting that run's latency measurements.

## Boundary

This completes only the durable-session persistence and recovery slice. It does not complete
03-04. The current capture registration creates one Media Pool asset per take;
emotion-block assembly/registration, capture QC, human microphone evidence,
training-tier policy, reference harvesting, identity lock, 200-card index
acceptance remain unimplemented or unverified. Unknown upload failure recovery is
regression covered; a real microphone fault-injection acceptance is not claimed. Guided tier records provenance and is not a quality claim.
