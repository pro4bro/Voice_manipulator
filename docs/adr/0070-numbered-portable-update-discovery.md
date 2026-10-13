# ADR 0070: Allocate numbered updates and discover the newest pack

Date: 2026-10-12

## Context

The owner wants new packs numbered automatically and copied into `updates`
without renaming one to `app-current`. The alpha 0.5.0 payload BAT also treated
its own folder as a full portable, producing `Not a portable bundle` on the
second machine. Searching ancestor source trees before copied packs could
replace a received update with an older local checkout.

## Decision

The creator locks release allocation, automatically increments patch, writes
the app pack into a temporary folder, and publishes an `App-<channel>-<version>
-<profile>` folder. It records the issued version in `APP-VERSION.json`.
`lastIssuedVersion` preserves the ability to issue a newly configured phase
baseline exactly, such as 0.6.0 or stable 1.0.0. Each new creation issues a new
number; applying a pack does not. This replaces ADR0069's manual patch step.

The updater scans immediate child manifests of `updates`, filters by profile,
and ranks numeric versions. Identical duplicate packs are acceptable;
conflicting bytes under the highest release fail. The selected pack still
passes dependency, path, size and hash checks before app mutation. Older packs
remain in their folders.

A newer copied pack takes precedence over source generation. Automatic source
generation requires the recorded source machine to match the current host.
An update pack includes `APPLY-UPDATE.bat`, which uses the shipped updater even
when the installed alpha 0.5.0 updater cannot discover numbered folders. Both
pack entrypoints resolve only the documented `<portable>/updates/<pack>/payload`
layout and apply packages. They never generate a source build. Missing full
portable manifests produce transfer instructions.

## Consequences

2026-10-13 correction: an app update stops the portable's entire stack, including
the controller on18119, before replacing trees. On Windows the controller's
working directory holds `services/api` even after API/Studio have stopped.
Port ownership checks include the bundled interpreter path and the expected
module for all three roles. Mixed portable/foreign listeners abort before
mutation. Successful stop must leave all three ports free; the existing process
tree helper waits for actual process exit. After success or rollback, restart
uses the durable console launcher so controller code is also reloaded.
`-NoRestart` leaves the whole stack stopped. Installed alpha0.5.7 or earlier
needs the received pack's entrypoint once to install this correction.

The owner copies a whole numbered folder and clicks the BAT. Version ordering
does not depend on names or modification times. Older portable installations
need one use of the new pack's launcher to install this workflow. Source-machine
identity is provenance for source generation, not an authentication mechanism.
