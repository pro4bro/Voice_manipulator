# ADR 0016: One OBS capture recording is one Media Pool footage

Status: Accepted — 2026-09-29

## Context

LiveLink writes a verified multitrack MKA for each completed recording and
also keeps one analysis WAV and transcript stream per channel. The old media
index exposed those WAVs as separate footage. Its archive relation fields
were absent from the persisted media model, so reopening a project lost the
parent–channel relationship.

## Decision

The MKA parent is the Media Pool footage for one completed OBS recording.
Its `obsRecordingId` identifies the recording journal, channel waveforms,
and channel transcript events. Channel WAV media records remain internal
processing assets with a persisted `sourceArchiveAssetId`, stream index,
and track UID. A second recording gets a different parent and recording ID.

The media library recovers old index relationships once from the portable
`recording.json` journal. Recycling, restoring, or permanently deleting the
parent applies to its child records as one group. The verified MKA is the
source archive; analysis WAVs remain project-owned derivatives.

## Consequences

Media Pool selection, counts, and batch actions operate on footage parents.
STT and training still use channel analysis audio. The recording ID routes
the selected parent to the shared multichannel Timeline and Script feed.
Physical OBS verification with two completed takes remains a separate gate.
