# Phase 06: LipSync - Context

## Goal

Deliver the fourth `LipSync` workspace page. It turns an approved dubbed or replaced audio take plus a project-owned video asset into a reviewable lip-synchronised video. It is post-audio workflow, not an independent claim to translate, clone, or dub audio.

## Modules

- **VideoPreview**: project-owned source/output preview, timecode, render state, A/B comparison, and explicit no-video/no-face states.
- **LipSyncRack**: engine/model revision, approved take, quality, face/shot policy, validation, and render command; no direct model-path knowledge.
- **ShotFaceMap**: detected shot/face candidates, human confirmation, active-face selection, exclusions, and per-shot settings.
- **Reused modules**: Media Pool, Script / Cue List, Timeline, Render Queue, and Recent Renders.
- **LipSyncAdapter**: backend seam accepting asset/take IDs plus approved configuration, dispatching a cancellable job, and producing a project-relative derivative asset with full lineage.

## Engine posture

Evaluate MuseTalk behind `LipSyncAdapter` as the first candidate only after reproducibility, license, GPU-memory, identity/quality, and commercial-use review. It remains optional and pinned. The adapter must permit a replacement engine/provider; neither UI nor project schema may depend on MuseTalk internals.

## Integrity rules

- Render input references an approved audio take and an imported project video; no arbitrary external path is embedded in a job.
- Shot/face mapping is reviewed before render. Multi-face or unstable detection cannot silently choose a face.
- Output records source video ID, audio take ID, shot-map version, engine/model revision, settings, timestamp, and review status.
- Preview is not approval; export and next-step use need explicit approval.

## Six-zone default

| Zone | Module |
| --- | --- |
| Top left | Media Pool |
| Top center | Video Preview |
| Top right | LipSync Rack |
| Bottom left | Script / Cue List |
| Bottom center | Timeline |
| Bottom right | Render Queue + Recent Renders tab stack |

## Completion gate
