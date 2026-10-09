# USER-FEEDBACK-15 — Import a profile's models or a subset

2026-10-09. One bounded round for Collection import selection.

## Scope and contract

One profile may own several models. The Collection browser groups entries by
archived source project and Speaker Profile ID, with a parent checkbox and
expandable individual model checks. Parent checked selects all models available
for that profile in the current Collection; partial selection shows a mixed box.
Same display names do not merge unrelated speakers. A fixed import action remains
disabled with no selection. Tick selection does not add a toolbar. Hub browsing
and model export retain the shared browser.

Selected entries import serially through the existing single-entry endpoint.
Catalog saves flush before each request. Confirmed imports merge into Workspace
and leave selection; failed and unprocessed entries remain selected for retry.
Status distinguishes complete from partial success. These are individual
transactions, so earlier confirmed copies are retained after a later failure.

Destination models from the same archived identity reuse one Speaker Profile,
including imports performed later and retries. Profile consent proof is project
owned independently of model folders; model-specific archived consent snapshots
remain for provenance/hash validation. Existing publication/artifact gates stay.
No owner project or model data was changed during implementation or tests.

## Verification

Workspace caller regression fails on baseline: confirmed profile imports made
before React commits are absent from the next saved catalog. Synchronously
publishing the changed catalog snapshot to the transfer ref repairs that boundary.
Focused Workspace44 pass, including that caller regression.

- Collection UI focused8 pass: all/selective/mixed checks, exact identity groups,
  preflush/serial requests, partial failure/retry, busy locking, collection switch,
  browse/export behavior. The previous single-import test now selects a model
  before submitting, retaining callback and request-order assertions.
- Final frontend **696 tests /77 files passed**,87.71s. Typecheck/build passed.
  Build assets: `index-DyRDMuZQ.js`, `index-D7J6AuBA.css`.
- Lead review found the existing generic div grid rule overriding the new profile
  header flex rule; the contained header now has stronger specificity.
- Independent read-only backend review checked exact identity reuse, per-model
  consent/hash preservation and staged rollback. Lead identified a concrete child
  folder containment gap in shared proof publication; focused red reproduction
  precedes repair, with validation before lookup and publication.

- Collection API focused22 pass, including retry/reopen, legacy marker recovery,
  duplicate names, actual model deletion, copy failure, publication containment
  and injected catalog-save rollback. Existing artifact tamper rejection passes.
  The prior retry proof-path assertion intentionally changes to independent
  profile ownership; its model-owned archived snapshot is separately asserted.
- Final full API **712 passed**, two existing dependency warnings,204.01s.
- Additional isolated legacy proof check **1 passed**: a model-owned proof is
  copied into independent profile ownership on selective import; original proof,
  manual name/color/consent note survive; deleting the first model preserves
  shared evidence and retry of the second model retains its ID. Script/log:
  `.scratch/user-feedback-15/test_legacy_profile_proof.py`,
  `legacy-proof-check.log`. This uses disposable fixture data, not owner projects.
- Diff whitespace check passed; no owner model/media or normal runtime changes.

Lead logs are retained in `.scratch/user-feedback-15/`. Fixtures prove selection, portable copying and
lifecycle behavior, not inference quality. Full frontend/build and API checks
run serially to preserve readiness-test timing.

## Remaining device acceptance / exact next round

After restarting to load the new UI and API:

1. Open Import from Collection; expand a profile with several archived models.
   Tick the profile, then untick one model. Parent must show a partial selection.
2. Import the selected subset. Sound Library should show one profile containing
   only the chosen models. Import another model later and verify it joins the
   same profile; retry must not duplicate it.
3. Reopen the project and select imported models in Voice Manipulation. Confirm
   actual generated audio. Native layout/voice quality are device checks.

Earlier browser approval rejection is respected; no automation workaround was
used. Phase03 remains60%; quality/calibration budgets remain open. Exact next
executable round: STT-GAP-01, collecting isolated OBS recognizer/merge evidence
before repairing missing words. ADR0062 records the design.

Product commit: `a06c2f8`.
