# ADR 0069: Version each portable app release

Date: 2026-10-12

## Context

The portable's update manifest records its source revision but has no release
number that the owner can read before transferring a pack to another machine.
A repeated BAT click may build the same app again, so generation time must not
implicitly advance the release.

## Decision

Keep the app release in source `APP-VERSION.json` as a numeric triplet and a
channel. Start at alpha 0.5.0. Bump patch for a changed app release within the
current phase, bump minor and reset patch when entering the next phase, and
publish stable 1.0.0 only after planned functionality is complete. Embed the
release in app update, bundle and app-layer manifests, and write a readable
`VERSION.txt` beside the update payload. An updater rejects a lower release or
changed app bytes under the same release; repeating an identical update is
allowed. Existing unversioned bundles can receive the first versioned update.

The manifest `schemaVersion`, npm package version and API version have separate
meanings and do not change with this app release.

## Consequences

Transferred packs and installed bundles carry an explicit release identity.
Maintainers must bump `APP-VERSION.json` before distributing changed app bytes.
Model/runtime changes still require a base bundle and remain outside app packs.
