# 0102 — Give VoiceScript settings an explicit layout region

Accepted 2026-10-17, round45.

Real browser verification at1280×720 found the first closed settings panel100px
high while the next five were13px high, clipping their16.8px summary lines.
The shared Script grid assumes three direct children, but VoiceScript added
multiple optional disclosure panels before its table. Auto-placement assigned
the flexible100px track to the first settings panel and squeezed the others.

Group VoiceScript's settings in a named region and use a VoiceScript-only flex
column body. Keep toolbar/errors/progress/footer intrinsic, reserve at least100px
for the transcript, and let the settings region scroll within a bounded share of
the pane. Closed disclosures keep natural height. Preserve the shared disclosure
max-height/overflow rules for sidebar consumers; only direct settings-stack
children override them. Generic Input/reading Script layout remains unchanged.

The repaired browser shows all six closed panels at29.8px, a105px settings
viewport over179px content and a126.6px transcript shell at1280×720. Expanding
Fix grows the settings content without consuming the transcript's space.
At1024×600 the transcript retains100px and settings have a compact19px scroll
viewport; small-pane ergonomics still need broader UAT. No timing or model
capability is inferred from this layout verification.
