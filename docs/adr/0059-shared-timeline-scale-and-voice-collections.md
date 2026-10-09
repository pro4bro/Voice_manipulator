# ADR0059 — shared Timeline scale and host-local Voice Collection

2026-10-09. Accepted for USER-FEEDBACK-12.

## Shared presentation

Standard, imported multitrack and OBS Timeline use the same logarithmic zoom
mapping, maximum density of 1,000 pixels/second, fit-to-duration endpoint and
resolution readout. Visible ruler marks use the same round time intervals and
absolute labels. OBS live requests remain bounded to 120 seconds; this transport
limit does not impose a 15-second minimum display window. Positive durations
under 10ms still fit without becoming zero. Archive PCM and word boxes retain
their existing source/time provenance.

The shared Sound Library form spans the consent fieldset across both grid
columns and gives checkboxes a fixed 14px box. Voice Changer consent remains the
existing recorded permission. `uploadAllowed` is a separate optional permission
flag, default false. `evidence` is optional `{path,name}`; the file is stored
with the project on the API host. Recording this metadata is not verification
of a contract and does not trigger publication to another service.

## Collection ownership and import

`data_root/voice-collections/<collectionId>` stores collection classification
properties (language, region, age, gender, color and engine facet attributes).
Each atomic entry has a Speaker Profile, ProjectVoice snapshot, copied payload,
source metadata and streaming SHA256 hashes. Base model IDs are retained;
shared engine/base-model folders are not copied. Required project-owned trained
artifacts are copied even where existing checkpoint layouts include full weights.

Export accepts completed LoRA/full/RVC runs with retained nonempty checkpoints.
Linked Voice Model Sets must have published/passed identity evidence. Clone
references and unfinished/rejected sets do not become trained collection voices.
The UI displays server errors rather than claiming success without these files.

Import generates destination-owned voice and Speaker IDs, copies references,
trained artifacts and evidence under `assets/voices/<voiceId>`, and clears
foreign run/segment/set references. `collection-import.json` retains their
original provenance and artifact hashes. Retry recovers the same voice and
profile; verified imported voices may be added to another collection after the
original project has moved or been removed. A single imported member does not
claim a destination Voice Model Set. Collection classification does not rewrite
the individual Speaker Profile.

Profile catalog writes are serialized and flushed before collection operations.
Imports merge the returned Speaker and voice into Workspace state immediately.
Hub browsing, project export and project import use one Collection component;
all three Sound Library routes pass the same project/import/export callbacks.

## API and limits

- `GET /api/voice-collections`
- `POST /api/voice-collections` with `{name,properties}`
- `POST /api/voice-collections/{id}/entries` with `{projectId,voiceId}`
- `POST /api/voice-collections/{id}/entries/{entryId}/import` with `{projectId}`
- `POST /api/projects/{id}/consent-evidence`, multipart `file`, max10MiB,
  PDF, PNG/JPEG/WebP or UTF8 text; result `{path,name}` is project-relative.

Generated IDs, path containment and atomic staging prevent partial successful
publication. Required artifacts retain file/directory types and RVC suffixes.
Streaming file hashes avoid loading multi-GB checkpoints into RAM at once.
The collection itself lives on the host; imported projects retain their own
assets and can be moved/reconnected through Open Existing.

Native visual acceptance, natural pointer/audio behavior and generated voice
quality are separate from API/jsdom copying and state tests. Collection transfer
does not satisfy the unfinished Phase03 identity/calibration acceptance budgets.
