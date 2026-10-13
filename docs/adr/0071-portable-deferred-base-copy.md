# ADR 0071: Rebuild the application independently of portable base files

Date: 2026-10-13

## Context

The owner requests a fresh portable containing the current application, with
large cores and models copied manually. NoVibeVoice remains the selected
profile; VibeVoice stays visible but unavailable. Older bundle assembly could
ship an existing UI build and cached Studio source, and HardLink mode linked
application files as well as large base files.

## Decision

The builder rebuilds the UI by default, takes Studio code from its canonical
product source, and copies application files independently in every mode.
HardLink applies only to base files. `-SkipWebBuild` is an explicit development
option; it is not the default release path.

`-DeferBaseLayer` packages the complete app and small runtime manifest, records
the expected base inventory and critical hashes, and emits a versioned copy
guide plus `.portable-base-copy.json`. Source paths are advisory copy hints;
portable execution still uses paths relative to its root. The copy guide is
outside the app updater's ownership. VibeVoice base trees are absent from the
NoVibeVoice copy plan.

A deferred kit retains `.bundle-incomplete`, reports `appLayerReady: true` and
`ready: false`, and distinguishes copied `files`/`bytes` from expected
`logicalFiles`/`logicalBytes`. Root `VERIFY-PORTABLE.bat` explicitly requests
finalization. Only the complete matching All/NoVibeVoice profile with every
check passing may atomically mark the base ready and remove the marker.
Ordinary audits remain read-only. App updates retain the existing version
allocation and four supported root launchers.

## Consequences

The small app kit cannot run before its base directories are copied. Initial
transfer includes the hydrated whole folder; later app updates remain small.
Runtime/dependency changes still require a compatible base update. An
independently hydrated local verification copy supplies parity evidence without
copying tens of gigabytes into the owner's thin kit. Native OBS, device and GPU
acceptance on another physical machine remains a separate test.
