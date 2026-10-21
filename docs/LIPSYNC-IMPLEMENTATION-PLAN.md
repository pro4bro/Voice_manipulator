# LipSync implementation plan

Date: 2026-10-21. Owner requested planning and execution. Current bounded round:
76, completed for the owner's Session/Version and Send to workflow request.
Batch71–75 was explicitly authorized as five consecutive rounds and is closed.
Round65 engine acquisition/catalog/settings is complete. Existing OBS tasks/plan.md is retained.
Tasks are tracked under `.scratch/lipsync/` per docs/agents/issue-tracker.md.
Phase 06 remains open; settings alone do not establish runnable inference.

Batch66–70 implementation is complete with evidence in
`docs/gates/lipsync-composition66-70-20261021.md`. This closes settings resolution,
portable multilayer editing, processing scopes and preflight review. At that
checkpoint runtime/model, actual face analysis and video acceptance were open. The
artifact slice has now been implemented by71–75; see below and ADR0124.

## Round76 — product Sessions, Version slots and routing

- Inline Voice Profile under Face ID on every card; same-ID cards share a binding.
- Revisioned portable Session/Version registry, old-composition migration and
  version-scoped composition/jobs/faces/After. New Session starts empty; New
  version clones editing decisions and completed analysis, not running/render jobs.
- Persist up to 100 combined Undo/Redo snapshots per Version, including reviewed
  identity/profile drafts, timing, sources, layers, settings and scopes. Preserve
  pending edits and save before navigation; reject invalid drafts/conflicts.
- Source context Send to: Media → Training (imported live tracks), Media → Voice
  Manipulation (one source in Voice Patch), Media/Voice Output → chosen LipSync
  slot, Voice Output → Voice Manipulation. Incompatible routes explain why.
- Gate: portable store and API ownership/revision tests, real browser Session/
  Version switching, face/card/history tests, cross-page routing with actual API,
  full frontend/API regressions, typecheck/build. Evidence: ADR0125 and
  `docs/gates/lipsync-sessions76-20261021.md`.
- No new inference quality approval or additional engine adapter. One bounded
  round; stop76 under AGENTS.md after verification.

## Execution order and acceptance

## Authorized next batch (71–75)

Implementation complete for the five prototype slices; evidence is in
docs/gates/lipsync-runtime71-75-20261021.md. Actual research-fixture output and
running cancellation pass. Real generated-voice/client-footage quality,
simultaneous multiperson quality, identity continuity between analyses, Preview
overlays and additional native engine pipelines remain explicit open gates.

- **71: isolated runtime and pinned checkpoints.** Inference-only environment,
  resumable verified downloads, readiness separated from source presence.
- **72: scoped face analysis.** OpenCV YuNet/SFace observations and recurring
  identity proposals across source shots; project-owned thumbnails/provenance.
- **73: reviewed identity mapping.** Revisioned gallery, manual reassignment,
  split/merge via observation ID, Speaker Profile binding; stale analysis rejects.
- **74: speaker scheduling.** Intersect reviewed identities with generated turns
  and processing scopes. Unknown/ambiguous/off-screen people receive no sync.
- **75: MuseTalk artifact path.** Durable cancellable job, reviewed-face offline
  v1.5 adapter, verified MP4 and Before/After inspection. Runtime, execution and
  visual quality acceptance are separate gates. Native realtime/v1 and the other
  two engines remain unavailable until their own adapters/artifacts pass.

Weights are host-local. Product code imports upstream inference primitives but
owns face selection, process arguments and media composition; no upstream shell
commands or first-face guessing. No auto-created mapping is considered reviewed.

## Authorized five-round batch (66–70)

- **66: native settings contract.** Each engine exposes only its own active
  parameters. Backend rejects foreign/unknown keys, validates native crop vectors
  and resolves mode-specific defaults. Verify switching engines, resets and native
  argument mapping. No inference is implied by a valid settings packet.
- **67: portable composition.** Revisioned project document stores video clips,
  layers, audio placement, engine selection/settings and processing scope. Save
  atomically, reject stale revisions/invalid sources; UI loads/saves the document.
- **68: multilayer editing.** Add/duplicate/split/trim/extend/delete/reorder clips,
  separate audio, vertical track scrolling and undo/redo. Preview shows top enabled
  layer with deterministic tie order and gaps. Verify overlapping clips and cuts.
- **69: processing scopes.** Separate detection and LipSync scopes choose layers,
  timeline/source range and visible/placed/full-source coverage. Visible coverage
  clips by all occluding layers, including unselected ones. Full-source detection
  deduplicates source intervals; LipSync retains per-occurrence audio mappings.
- **70: integrated processing-plan review.** API compiles selected scopes, source
  intervals, generated speaker turns and active engine parameters into a revisioned
  preflight snapshot with input fingerprints. UI reviews exact coverage and blockers;
  edits invalidate the snapshot. This is a plan, never a successful analysis/render.

Full-source mode uses source time for its optional range; other modes use timeline
time. For LipSync, each selected occurrence anchors source t to timeline
`clip.start + t - clip.inPoint`; only intersecting generated audio is usable.
Conflicting anchors for the same source/time must be reported, never silently
resolved. Detection can inspect full footage without inventing speech outside the
audio. Recognition/face identity and actual render remain subsequent artifact gates.

The five-round user instruction overrides the usual one-round stop for this batch.
Each round receives focused verification; final integrated frontend and full API
checks cover the completed batch. Historical longer-term sequence follows.

1. **Engine settings (round 65).** Download three source checkouts; render
   engine-specific inference controls from descriptors, grouped by face crop,
   quality, performance and output. Preserve independent draft settings when
   switching engines; reset to source defaults; validate numeric fields. Trace
   every control to the downloaded revision. Gate: frontend suite/typecheck/build,
   descriptor/default validation and full API suite. No inference acceptance yet.
2. **Portable multi-clip editing.** Save a revisioned project-owned composition
   with source asset IDs, IN/OUT, start, layer order and audio placement. Add,
   duplicate, split at playhead, trim, extend within source bounds, delete and
   reorder video layers. Video is one track containing layers; audio is separate.
   Provide vertical scroll and optional side-by-side track view. Undo/redo must
   survive ordinary edits; source media stays immutable. Gate: reload/moved-project
   tests and real Preview on overlapping A/B cuts, gaps, duplicate and split.
3. **One runnable engine.** Build isolated MuseTalk runtime, verified checkpoint
   receipts and product adapter, then durable cancel/retry job and artifact QC.
   Start with explicitly selected single face/shot. Gate: actual generated MP4,
   correct dimensions/FPS/duration/audio, mouth quality and boundary review.
   Repeat separately for LatentSync; Wav2Lip requires permitted research usage.
4. **Visible shot analysis.** Partition time at every clip boundary and shot cut;
   select only the top enabled video layer for each interval. Preview and render
   consume the same visibility schedule. Detect faces only on visible intervals;
   hidden clips never receive output. Gate: A over B, transitions to B, empty
   frames and no-face scenes all agree between Preview and render schedule.
5. **Face identity review.** Track detections within shots, compare embeddings
   across shots to propose project-wide face IDs, keep track IDs distinct from
   identity IDs. Show thumbnail galleries and source/time provenance. User can
   merge/split/reassign incorrect detections and exclude faces; manual assignments
   survive re-analysis. Low confidence remains unassigned. Gate: same actor across
   cuts, two actors in one frame, occlusion and intentional wrong-ID correction.
   Evaluate detector/embedding model license and real accuracy before selecting it.
6. **Speaker scheduling.** Bind reviewed face IDs to existing Speaker Profiles.
   Map VoiceOutput.segments speakerProfileId/start/end through audio IN/OUT and
   timeline start, intersect with visible face tracks and video source mappings.
   Apply only to matching visible faces during that speaker's turn; unmatched,
   silent and offscreen speakers leave video unchanged. Overlapping turns process
   each mapped face separately. Fail review on ambiguous assignments rather than
   selecting the first detected face. Gate: two-speaker A/B/A dialogue, offscreen
   speech, overlaps, trims and duplicated source used at different timeline times.
7. **Composite and After QC.** Render isolated face regions, blend each back into
   original visible frames, preserve other faces, concatenate intervals and mux
   generated audio. Cache keys include source fingerprints, composition revision,
   identity edits, speaker binding, voice revision, model revision and settings.
   Before/After use identical timecode. Gate: real cuts and multiple-face output,
   frame count, boundary transitions and human identity/sync review.
8. **Voice Over repair.** Changed voice segments invalidate only intersecting
   scheduled face intervals plus temporal context required by the selected engine.
   Preserve unaffected frames/audio and lineage, cancel stale jobs, invalidate
   old approvals. Gate: one changed turn regenerates the correct face interval;
   another actor's face and untouched intervals remain unchanged.

## Integration constraints

An engine never chooses the speaker. Product-owned scheduling supplies reviewed
face crops and speech intervals. Native first-face detection, constant boxes,
coordinate caches and automatic clip looping must not bypass that schedule.
Duplicate/extend is explicit composition editing, not an engine silently looping
footage. Arbitrary checkpoint/input/output paths belong to installation and the
project asset resolver, not user-editable shell arguments. Training tools and
evaluation datasets are separate capabilities from inference settings.

Each slice requires evidence. The owner's 2026-10-21 instruction authorizes
rounds66–70 consecutively; later work follows the normal one-round stop.
