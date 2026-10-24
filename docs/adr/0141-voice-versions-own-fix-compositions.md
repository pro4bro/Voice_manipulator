# ADR0141 — Voice Versions own Fix compositions

Status: accepted, 2026-10-24. Round VM-VERSION-LAYERS-01.

Make a Voice Output Version the durable boundary for Script/config and their
reference, timing, subtitle and audio-composition sidecars. Full generation
replaces that Version's baseline; local Fixes become independent, ordered audio
clips, with newer overlapping clips placed below older clips and the bottom
layer taking playback/export precedence. This keeps repeated edits reviewable
and source audio immutable while permitting the same composition to drive
playback and export. Disabled active slots are deselected and cannot be cloned
or published into; removal remains soft so project media is preserved.
