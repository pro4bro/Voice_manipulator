# ADR 0123 — LipSync composition, scopes and preflight

Date: 2026-10-21. Status: accepted for owner-authorized rounds66–70.

## Decisions

- Store one revisioned `scripts/lipsync-composition.json` per project. It carries
  IDs, layers, video source IN/OUT/start, generated audio placement, selected
  engine, separate engine values, detection scope and LipSync scope. No absolute
  path persists. Atomic saves reject stale revisions and unavailable/invalid
  sources. Reads retain a draft even when a referenced asset becomes unavailable.
- Layer array order is top to bottom. On one layer, the last clip in document
  order wins an overlap. Intervals are half-open; Preview and coverage compilation
  use the same rule. Disabled layers never occlude in visible mode. Explicit
  placed/source scopes may inspect them, independently of Preview visibility.
- Video editing is non-destructive: duplicate appends the selected source span,
  split preserves source mapping, and trim/extend stays inside source duration.
  Undo/redo is session history; saving persists the resulting composition. A
  pointer gesture forms one undo step. Save replies preserve edits made in flight.
- Every engine uses its own descriptor. Backend resolution rejects foreign keys,
  drops inactive mode flags, resolves native defaults and assembles Wav2Lip
  coordinate vectors in top/bottom/left/right order. Settings validation does not
  assert an installed runtime/model or successful inference.
- Detection and LipSync independently select all/explicit layers, optional range,
  and `visible`, `placed` or `source` mode. An explicit empty layer selection
  means no layers; omitted legacy `allLayers` derives from the old layer list.
  Visible mode computes all occluders before filtering selected layers. Placed
  mode includes hidden clip portions. Source mode uses the source clock and can
  include material outside the edited clip. No original source file is rewritten.
- Whole-source detection deduplicates identical source spans while retaining
  occurrence IDs. Whole-source LipSync keeps each clip's audio anchor:
  `timeline = clip.start + source - clip.inPoint`. Intersections with generated
  audio/turns determine candidate intervals; missing audio is never fabricated.
  Conflicting audio assignments to the same source/time block whole-source output.
- Preflight requires the saved composition, compiles scope and generated speaker
  turns, and records a content-addressed JSON snapshot below `jobs/lipsync/`.
  Input SHA256 and voice metadata bind the snapshot to its inputs. It explicitly
  records `executed:false`, `readyForRender:false` and unresolved face/engine
  blockers. It is not a queued inference job, detected-face artifact or video.
  Detection coverage must contain the requested speech/video source intervals.

## Boundaries

No trained face detector, cross-shot identity model, reviewed face/profile
bindings, isolated LipSync runtime, checkpoints, real engine job, After output
or face replacement is delivered by these five rounds. Do not claim speaking
identity is known from a face index, filename or preflight speech candidate.
The next artifact gate is the first real engine integration; face identity,
multi-person scheduling and selective repair retain their separate gates.
