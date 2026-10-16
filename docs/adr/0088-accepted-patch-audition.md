# 0088 — Audition accepted Patch audio against its saved original

Status: Accepted, 2026-10-16 (round28).

Use one shared player for an explicitly selected accepted Patch history entry.
Source/variant buttons select region with 250ms context, head transition, tail
transition, or full clip. Changing entry or region stops playback. Loading a plan
does not play audio. Audition does not generate, Apply, or change a source.

Resolve source media from immutable output parameters or nested Patch lineage;
the media asset must equal the saved source association. Require its saved WAV
checksum, project containment and PCM16 mono24k shape. Never reconstruct the
original from the current Timeline. A missing/changed source disables source
listening while the validated variant remains available. Crop cache identity
includes input checksum/frame bounds; corrupt cache is rebuilt from checked PCM.
HTTP Range and crop provenance headers support the native audio player.

Automated PCM and playback-state checks establish artifact integrity and UI
ownership. They cannot establish perceived identity, quality or seam audibility.
