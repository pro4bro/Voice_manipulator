# ADR 0015: Channel-owned LiveLink transcript events

**Status:** Accepted for LIVELINK-08G, 2026-09-28.

## Decision

Only a newly durable v3 PCM chunk is offered to live STT. A duplicate chunk
ACK never offers PCM again. Each `(projectId, recordingId, channelId)` has an
ordered, bounded queue; one recognizer call at a time uses the shared model.
The default per-channel queue caps both chunk count (1024) and queued PCM
(8 MiB), so short OBS callback packets do not overflow merely because they
arrive frequently. Overflow is observable as an error event.
Queue overflow, recognizer failure and unavailable model produce diagnostic
events without failing the PCM ACK or changing the source archive.

Transcript events are appended with `fsync` to project-owned
`assets/obs-livelink/<recordingId>/transcript-events.jsonl`. The global
`eventRevision` provides a reconnect cursor. Each event carries stable
recording/channel/source/utterance identity, per-utterance `revision`, source
sample start/end, status (`listening`, `partial`, `final`, `error`), text/pending text,
recording-relative seconds from the OBS monotonic clock, latency, and timing
trust. A torn final line is ignored and truncated before
the next event. A changed alias updates the label on later revisions without
changing source identity or rewriting earlier events.

An utterance begins with a voiced PCM chunk and ends after a short silence,
source sample gap, format change, or recording finalization. Voice detection
uses a provisional amplitude gate, so utterance bounds are coarse. The Studio
consumer receives an immediate `listening` event at that first voiced chunk,
allowing the source-owned Script row to appear while recognition is pending.
The Studio
live endpoint returns no word times: events therefore use `timingTrust=segment`.
The draft is not a final Script asset or trusted subtitle cue. The recognizer
can revise pending text or repeat words; final STT and human review remain
separate.

The read API is
`GET /api/projects/{projectId}/obs-livelink/recordings/{recordingId}/transcript-events?afterRevision=N`.
The `events` array contains revisions greater than `N`, in append order.

## Consequences

- Two OBS channels can be transcribed and displayed independently, including
  simultaneous speech. Channel identity does not imply Speaker Profile identity.
- The Script and Timeline consumers in LIVELINK-08H can replace a partial row
  by `utteranceId` and `revision`, and resume from `eventRevision` after reconnect.
- Audio survives STT failure. A missed live window is not synthesized as
  recognized text; the archived channel track remains available for final STT.
- Word highlighting and verified subtitle timing require later alignment;
  segment bounds alone cannot certify individual words.

## LIVELINK-08I review decision

Cross-channel overlap is derived in the UI from half-open intersections of
recording-relative OBS monotonic intervals. It is not written back into the
source journal. The derivation requires trusted segment bounds and a positive
source sample span, ignores matching channel IDs, and merges concurrent peers
into review intervals. A touching boundary has zero overlap. Text turns red
only while the playhead is within that interval; because the recognizer has
no word timestamps, the entire draft row is the warning surface rather than
an assertion that particular words overlap. Marker playback on a ready
archive uses the selected channel's own WAV and stops at the interval end.
Live recording can locate a marker, but archived playback follows Stop.
