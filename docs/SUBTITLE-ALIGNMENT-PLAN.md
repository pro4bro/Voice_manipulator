# Subtitle Alignment — Round79 plan and specification

2026-10-21. Owner authorized planning and implementation together. Implements
STT-ALIGN-01..04 in one bounded vertical product round. Existing tasks/plan.md
contains historical OBS work and is preserved; task tracking uses the project's
local `.scratch/subtitle-alignment79/` convention.

## Outcome

Input's Script offers **Căn chỉnh subtitle** for finalized project footage and
individual imported/archived OBS tracks. It computes timing proposals against
immutable analysis PCM, shows before/after intervals with waveform/audio audition,
selects eligible changes and lets the user confirm/edit uncertain words. Explicit
Apply updates the existing Script/Timeline/SRT; a persisted restore reverses that
application when no intervening edit has occurred. Text and speaker labels stay
with their words. Manual timing is locked by default and cannot be overwritten by
this processor. Pending live/growing audio must be finalized first.

## Ordered methods

1. Explicit user IN/OUT offset is the cheapest controlled operation. Automatic
   offsets must come from multiple consistent measured anchors, with dispersion
   and temporal coverage reported; never hardcode Conviction's median shift.
   Short complete speech groups can share a translation that preserves word
   spans. Require three high-score anchors covering60% of the group, endpoint
   MAD≤30ms, edge-median disagreement≤60ms and translation≤500ms. Large span
   changes still need individual CTC/review. Validate the actual default-selected
   output, using original intervals for every unselected/review/locked word.
   A span anomaly stays a warning during a common translation; it vetoes a
   span-changing refinement. A measured common-offset button only prefills
   independent explicit inputs, requiring a new proposal and separate Apply.
2. Local speaking-rate/duration statistics identify unusual spans. They do not
   justify equal word durations, silence filling or forced truncation.
3. Waveform activity/transitions support boundary refinement and review. Raw PCM
   is authoritative; timeline envelope pixels alone cannot identify words.
   Reuse Timeline's approximately1ms PCM min/max peak vectors, independently of
   display zoom. Stable amplitude corners at10/20/40ms scales become onset/offset
   landmarks, shown as review dots. A matching high-score CTC edge within30ms
   receives one extra consensus vote; this cannot certify an unstable group or
   move its unweighted translation by more than30ms. Never snap a word to a
   corner merely because the plotted angle is steep.
4. For continuous speech, use the already-cached Vietnamese250h CTC comparator
   through a CPU-only product-owned subprocess. No weights are bundled/downloaded;
   the noncommercial model remains an explicitly local experimental processor.
   Missing runtime/model yields a useful unavailable state while explicit offset
   remains usable. Short windows and exact token identity are required. Confidence
   alone cannot approve a boundary. Large/ambiguous moves remain review proposals.

Automatic proposal selection must produce valid full-source intervals against
unchanged neighbours and manual locks. Genuine mixed-speaker overlap is a review
case, not something to flatten into fabricated single-speaker timing.

## API and persistence contract

- POST `/api/projects/{project}/media/{asset}/subtitle-alignment/proposals`
  accepts mode auto/offset, optional word indices and independent start/end ms.
- GET the latest proposal; POST `/{proposal}/apply` accepts selected indices and
  explicitly reviewed edits; POST `/{proposal}/restore` restores its saved input.
- Proposal rows contain original/proposed IN/OUT, method, ready/review/locked/
  unchanged state and human-readable reasons. Diagnostics report counts and rate.
- Project-owned immutable proposal JSON snapshots bind complete words, transcript,
  media identity/hash and relevant asset state. All persisted paths are relative.
- Compare source fingerprints under the existing media-library project lock
  before mutations. Reject stale edits, changed/missing audio, invalid selections,
  manual changes, reversed/out-of-source/overlapping results without a partial
  write. Restore is similarly fenced. An empty selection is not success.
- Preserve original timing provenance and application evidence. Structural timing
  trust must not be presented as guaranteed acoustic accuracy.

## UI contract

Use the existing compact Script toolbar and dialog/surface tokens. Choose one
footage/track and optionally selected words. Explain locked/manual and review
counts. Offer automatic and explicit IN/OUT offset modes, waveform before/after
overlays, original/proposed audio audition, editable uncertain IN/OUT and explicit
confirmation. Keep Apply disabled for stale/busy/empty input. Cancel/close/switch
stops audition and fences late responses. Apply/restore synchronize current
Script/Timeline and the existing undo history after pending edits are saved.
Opening the panel does not apply a change. Existing user-corrected Conviction is
never used as a destructive experiment.

## Tasks and verification

1. **Analysis contract and guard logic:** focused synthetic tests before code for
   manual locks, offsets, silence, rate outliers, repeated/unalignable tokens,
   adjacent conflicts and source bounds. Compare algorithms on the frozen
   Round78 audio; reference timing is only an evaluator, never an inference input.
2. **Portable proposal service:** real PCM and real file-library route tests for
   read-only analysis, selected apply, metadata retention, stale rejection,
   restore/reopen/move, missing runtime and failed artifacts. Add a thin router.
3. **Script review UI:** interaction tests for proposals, review edits, selection,
   stale responses, asset switches, audible source intervals and Apply/restore.
   Verify the actual workspace in a browser with a disposable real-media project.
4. **Acceptance:** full frontend tests/typecheck/build and API tests; retained
   exact PCM/proposal artifacts, paired IN/OUT/duration errors, accepted versus
   review coverage and tail/regression counts. Do not lower prior quality budgets
   or claim that this one reference generalizes. Record the remaining acoustic
   gate separately from a working explicit review/apply feature. Stop after79.

## Initial evidence and risks

The first isolated waveform-only experiment found no safely applicable complete
word corrections on current Conviction. Its four stable two-edge candidates
collided with unchanged neighbours. It supports waveform as acoustic evidence
and a review aid, not a promise of word identity from energy alone. Round78's
ungated CTC improves typical errors but has a bad tail and overlaps; production
selection must expose and constrain those cases. Model license, unavailable
runtime, long speech, ambiguous labels and cross-speaker audio stay visible.
