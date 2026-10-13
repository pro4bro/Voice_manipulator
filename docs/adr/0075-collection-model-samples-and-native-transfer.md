# ADR 0075 — Collection model rows, native transfer and real voice samples

Accepted for HUB-COLLECTION-01, 2026-10-14, following owner screenshots/feedback.
This round repairs Project Hub geometry and extends Voice Collection; external
asset-library execution from ADR0074 remains a separate queued round.

## Decisions

- Reserve a small gutter inside the project card scroll canvas for its existing
  hover lift. Remove LOCAL / PROJECTS and reduce header spacing. Detail view
  constrains its decorative waveform to the preview column.
- Count distinct profile identities as (source project, Speaker Profile ID),
  rather than counting model entries. Show the count in Hub navigation.
- Display each profile as an expandable row. Profile selection includes its
  models; partial model selection is visible. Hub export uses the same explicit
  selection semantics as project import. Keep Add to Collection distinct.
- Native ZIP import uses a dedicated multi-file picker. Export opens a directory
  picker and writes one verified single-entry ZIP per selected model. No new
  aggregate ZIP format or silent overwrite. Existing browser ZIP transfer remains
  an explicitly labeled fallback for a client on another machine.
- Preview generation consumes the exact archived model/reference/adapter through
  product-owned engine adapters, in a collection-owned job and directory. It
  does not create hidden user projects or copy base models. Share the GPU lease.
  Only publish audio/script after an actual WAV is validated at >=15seconds.
  No silence padding, guessed duration, substituted voice or false success.
- Samples speak profile name, gender, region, age, creation date, training audio
  duration, engine/model kind and qualified emotion support. Missing metadata is
  explicitly unknown. Reference seconds must not be reported as train seconds.
- New archives may retain an optional immutable Dataset Manifest snapshot in
  source lineage. Verify the SHA256 of its exact stored UTF8 bytes against the run and derive
  speaker seconds from segments. Legacy archives lacking this snapshot remain
  valid and report unknown duration. A snapshot is metadata, not source audio.
- Cached preview WAV/script metadata are optional export/import artifacts with
  their own inventory hashes, input fingerprint and measured format/duration.
  They do not alter trained weights. Old packages without samples remain valid.
- RVC is conversion, not text synthesis. It must expose an honest unsupported
  scripted-preview state until a separate record-and-convert preview path exists.
  Missing runtime/base weights, invalid models and inference failures expose
  errors/retry rather than a playable reference falsely labeled a generated sample.

## Acceptance

Deferred/negative tests cover native selection, cancellation, package hashes,
preview job states and missing/short/invalid outputs. Browser geometry verifies
hover/list fixes and profile/model selection. Real engine sample acceptance is
reported separately from synthetic WAV/renderer fixtures; publication and model
quality gates retain their existing meaning.
