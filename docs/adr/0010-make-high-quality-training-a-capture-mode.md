# ADR 0010: Make High Quality Training A Capture Mode

## Status

Accepted

## Context

High Quality Voice Training asks the speaker to read app-supplied passages while
the app follows the words live, so the transcript is known before the microphone
opens. Three places invited a fork: Project Hub could gain a voice-cloning
project type, the workspace could gain a dedicated reading route, and training
could gain a second dataset pipeline for studio-grade material.

Each fork is expensive in a different way. A project type forks the portable
project format described in ADR 0004, and every later feature must then ask which
kind of project it is in. A dedicated route duplicates recording, device
selection, and Script rendering that Recorder and Script already own. A second
dataset pipeline duplicates the compiler, segmentation, speaker ownership, and
emotion rollup that Plan 03-02 builds once.

The material difference between guided reads and imported footage is not the
machinery. It is that guided audio arrives with ground-truth text and a measured
recording chain, while footage arrives with neither.

## Decision

Guided reading is a **mode of capture**, not a kind of project, page, or
pipeline.

**Project Hub does not change.** No preset, no project type, no badge. A project
is a project; guided reading is something a user does inside one.

**Recorder gains a Normal / HQ switch.** In HQ, Recorder shows the reading plan —
speaker, language, pack, selected emotions, minutes still owed — and Script
switches from transcript editor to teleprompter for the life of the session.
Recorder and Script already sit side by side on Speech to Text, so the mode
reuses that composition instead of adding a route. Voice Training's "no Recorder
module" contract from Plan 03-01 stays untouched, which places guided capture on
Speech to Text while the resulting material is trained on Voice Training.

**One dataset pipeline, tiered by provenance.** Every media asset carries
`captureTier` of `guided`, `record`, or `import`, and every manifest segment
carries `textProvenance` of `script`, `stt`, or `user`. Both are provenance, not
quality scores. Train exposes a source policy — `HQ only`, `HQ + clean`, or
`All selected` — defaulting to `HQ only` for a speaker's first model. Combining
tiers whose measured noise floors differ by more than 10 dB warns; it does not
block.

Reading Packs are app-level read-only resources under
`services/api/app/resources/reading-packs/`. A session snapshots the cards it
actually recorded into the project, so a moved project keeps its own ground
truth even when the app later ships a different pack version.

## Consequences

- Plan 03-02's compiler, manifest, segmentation, and speaker/emotion rollup serve
  both source kinds. Guided reads add sources; they add no parallel machinery.
- Guided capture is discoverable only through the Recorder switch. Nothing else
  in the product signals that the feature exists, and nothing steers a user
  toward a project suited to it.
- Guided capture happens on Speech to Text while training happens on Voice
  Training. This reads oddly on a page menu and is accepted deliberately: adding
  a second Recorder to Voice Training to fix the wording would cost more than the
  confusion does. Phase 04 makes module placement user-controlled and dissolves
  the problem.
- `captureTier` becomes a permanent field on every media asset, including footage
  that will never be guided. This is the price of one pipeline.
- The tier policy is a decision a user can get wrong. Choosing `All selected` for
  a first model produces the channel-averaging failure the policy exists to
  prevent, and only a warning stands in the way.
- Reversal is asymmetric. Adding a dedicated page later is cheap, because the
  mode already isolates the behaviour. Adding a project type later is a project
  manifest migration across every existing project. This ADR deliberately closes
  the expensive door and leaves the cheap one open.
- A `guided` tier is not proof of quality. A guided asset still passes the same
  Dataset Manifest validation as any other, and ADR 0005's rule stands: a
  configured catalog is not evidence that audio is training-ready.
