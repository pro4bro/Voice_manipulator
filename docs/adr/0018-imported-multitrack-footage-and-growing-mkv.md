# ADR 0018: Imported multitrack footage and a growing MKV source

Status: Completed-file import, multitrack UI and growing-file follower implemented at generated-media level — 2026-09-29

## Context

MKV, MOV, and MP4 may contain several independent audio streams. The old
importer always decoded `0:a:0`, silently ignoring every other stream. A
Matroska file can expose committed clusters before its writer closes, but
the unfinished tail is not a finalized file. OBS recording mix tracks also
need not correspond one-to-one with LiveLink source channels.

## Decision

For completed files, one imported source file is one Media Pool footage.
Each selected audio stream gets a child analysis WAV and a persistent container
stream index under that footage; omitted streams remain listed in the parent
manifest. The original remains unchanged. The selected
parent opens synchronized child Timeline instances and channel Script rows.
Shared cuts are stored on every child; transcripts remain channel-owned.
A single audio stream with stereo or surround
channels remains one track, matching how one OBS source can carry stereo.
Project media stores relative paths; an external source locator remains only
in the machine-local registry. Footage Recycle and Delete include all child
tracks, while STT and training operate on child analysis assets.

For growing MKV, the follower uses a native local path, walks EBML element
boundaries and reads only complete Clusters. It checkpoints source identity,
last Cluster digest, source byte cursor and per-track sample position before
publishing each append. Project-owned chunks and provisional analysis WAVs
recover from uncheckpointed writes by truncation. Temporary EOF never means
Stop. Explicit Finish copies the closed MKV and re-decodes each selected track
continuously: codecs such as AAC can differ at independently decoded Cluster
boundaries. The final WAV becomes the authoritative analysis source.
Follow registration scans only the first committed Cluster and returns the
footage before historical audio is decoded. The watcher then advances in
bounded Cluster batches, allowing the Media Pool to show the item promptly
even when the MKV already contains a long recording.
Native MKV/MOV/MP4 inspection shows per-track Import and STT choices in the
Media Pool context menu before import or follow. The parent footage persists
all available container streams and which were imported; imported child assets
persist their STT selection. A completed file with one audio stream keeps its
selection on the parent asset. Imported footage shows these choices on right
click; import selection is fixed after creation, while STT selection can change.
This selection drives the growing-file STT worker.
The user-selected final STT segment length defaults to 60 seconds per track
(10–600 seconds). A separate STT worker reads only frames committed by the MKV
follower. It saves a recognition result before advancing its per-track cursor,
so an API restart can replay the publication step without recognizing that
segment again. Three-second live windows use the fast model while the file is
growing. The detailed model starts at frame zero during recording and processes
each complete selected-duration interval per track. Each result records its
source frame range; word timestamps are offset by that range when published to
Script. After explicit Finish, the worker drains the shorter final interval
from the continuously decoded final WAV. The live Script text is provisional;
detailed STT replaces it on completion. If the user edited Script, the detailed
result becomes an STT revision and preserves the user's current text for review.

## Consequences

- The completed-file importer preserves every audio stream. Timeline Layer and
  Column views show them together, while Script selection edits one child.
- A browser upload cannot follow subsequent changes to the source file.
  Growing-MKV import will require a local file locator and explicit stop
  detection or user Stop.
- Temporary probe/decoder EOF, file truncation, track changes, duplicate
  packets and timestamps must be handled before live import is shipped.
- A source mix track must be labeled as a track, never presented as a proven
  isolated microphone or speaker.
