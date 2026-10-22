# ADR0129 — contextual timing ghosts and retained live Script

2026-10-22. Round81 extends ADR0127/0128 in response to the owner's UX feedback.
Scope and acceptance: `docs/INPUT-FEEDBACK-81.md`.

## Timing review in its audio context

Replace Input's proposal dialog with inline right-column settings. Each method
has an enable checkbox and collapsible parameters. Methods execute in displayed
order against the preceding result, with manual IN/OUT offsets last. Strength
scales the suggested movement; the per-step movement limit bounds each edge.
Manual word locks remain. No setting change writes word timing.

Ghost Preview composes enabled methods using one source-bound acoustic artifact,
with the existing PCM vectors and measured CTC. It stores a portable `pipeline`
preview job and original snapshot, while its visible ghosts are transient. Word
timing, source audio and labels stay unchanged. Source, settings or selected-scope
changes invalidate Apply. Late responses cannot retarget a different source.

A project-scoped provider shares ghosts with ordinary, imported multitrack and
archived OBS Timelines. A viewport-sized canvas paints exact source-clock boxes
above the original subtitle lane; long transcripts do not create one DOM node
per ghost. Normal Timeline waveform, zoom and playback provide listening context.
Input needs no separate word checklist or audition controls.

Apply New Timing is explicit approval of all valid changed preview coordinates.
Its dedicated endpoint checks the stored mode and unchanged source fingerprint,
then atomically applies changed unlocked words only. It permits the reviewed
overlaps shown in the preview. Ordinary selected Apply retains its prior overlap
rejection. Source bounds and positive minimum spans are never waived. The added
per-word `subtitleTimingConflict` flag retains overlap for visible review; the
editable timing normalizer must not silently shift its valid unchanged neighbors.
Quality inspection may mark an overlapping neighbor untrusted while preserving
its source coordinates and manual provenance. Existing Restore and Undo remain.

Conflict ghosts, applied-word borders and persisted conflict canvas marks use red
and a short slow pulse; reduced-motion disables animation. Persisted conflict
marks also paint words whose lexical order differs from their time order. Legacy
Training opens a pipeline job read-only with a valid method control and can
restore an applied snapshot; it does not mislabel pipeline as an acoustic method.

## Live text lifetime and capture visibility

OBS archive creation previously created empty child Scripts even though durable
Live STT events existed. Materialize the latest per-channel utterance text into
those child assets as a `record` revision. Preserve segment-level draft text
without inventing word timestamps. Backfill at runtime recovery and update late
final utterances arriving after archive publication. Skip deleted/disabled assets,
queued/detailed results and any explicit user/STT/AI revision, so clearing text or
running STT cannot be undone by replaying an old live event.

Growing MKV already retained live text through Finish. Explicit detailed STT was
also preserving pre-request user-cleared text, leaving an empty Script. Its durable
plan now records input revision counts. Detailed publication replaces edits that
precede that request and protects edits made afterward. The compare/publish step
runs under the media lock in a worker thread. Legacy plans keep their old protection.

Capture Source separately owns OBS module visibility and the target lease.
Viewing an archived recording does not activate OBS capture controls. Releasing
that lease or hiding controls does not issue Stop or discard captured media.

## Automatic closed-MKV import and explicit full-file recognition

The owner's follow-up requires the final media import independently of STT.
The background follower checks for an exact finite Matroska Segment end before
the strict live header check: a writer sealing its header must not terminate the
follower. An authenticated OBS Stop also binds its exact machine-local source
path to existing follow checkpoints, covering muxers retaining unknown Segment
size. A matching durable finish request survives API restart. No pause/silence or
file-size inactivity heuristic is used as a closure signal.

Finalization copies and hashes the complete source, verifies source identity and
stability, decodes every selected track in one pass, then publishes final paths
and durations. Live text/words/revisions remain unchanged. New automatic and UI
Finish operations persist `finalSttMode: explicit-full-file`; legacy direct
adapter completion retains its compatibility behavior for existing checkpoints.
Growing workers fence both entry and late inference publication on this policy.
The watcher cancels remaining segmented work; startup no longer claims those
finished tracks as resumable segmented jobs. Import never queues final STT.

Finalized tracks enter the existing ordinary queue through Speech to text.
The backend rejects unfinished followed tracks there and drains any old growing
worker before enqueueing a finalized track. Normal model internals may still
window their inference; the growing-file 10-second/block plan is not used.
Tests retain byte-equal full-file PCM including tail, retained/cleared/final text,
no automatic final recognition, matching-path Stop, actual live writer closure
and rejection of a late Live STT result.

## Loading and recovery

Tests reproduce coupled catalog/preferences loading behind a pending engine
schema and21 overlapping OBS polls while the first read remains pending.
Load independent resources independently, keep each OBS poll single-flight, and
give data reads a15s deadline with cleanup. Failed workspace reads expose Tải lại
dữ liệu. Processing POST requests retain their existing duration semantics.

The historical whole-app hang cannot be attributed conclusively: current API
and project reads responded normally, and retained logs did not capture a matching
unhealthy state. These verified failures and recovery behavior are evidence;
they are not proof of that incident's exact cause. Acoustic generalization,
physical OBS/device testing and release acceptance remain separate gates.
