# ADR0143 — Script highlights follow successful Version snapshots

Status: accepted, 2026-10-24. Round VM-SCRIPT-LAYER-UX-01.

Retain `fullGeneratedScript` alongside `generatedScript` in each Voice Output
Version. Current text differs from the latest successful synthesis in strong blue;
already synthesized differences from Full stay in faded blue. A successful Full
replaces both snapshots and resets the Fix composition. Failed/cancelled jobs
never advance these snapshots. Fix publication may preserve newer Script/config
edits while checking that its captured source output and composition still match.
The frontend refresh reads the published revision before saving newer state and
does not check out the older job text over the live editor.

Older manifests initialize the Full snapshot from their last generated snapshot;
the original Full text cannot be recovered reliably from missing history. This
migration cannot reconstruct faded highlights from Fixes made before the upgrade.

Persist layer `solo` with default false. Muted layers never contribute; while any
layer is soloed, only enabled solo layers enter the existing bottom-wins renderer.
Playback, Master waveform and exported WAV use that rendered output. Source
waveforms request the actual clip source IN/OUT and show only the positive half.
Their visible interval uses the Master's measured canvas width and scroll offset;
there is one top ruler and one bottom navigator. The Version identity retains
zoom/cursor across newly rendered Master output IDs.

Clip transfer is currently vertical only: `move-clip` preserves start/source/frame
count and rejects a different start. Trim/split remain explicit operations. Free
horizontal placement awaits the owner's future behavior decision. Explicit row
checkboxes own bulk selection; row Profile and Voice Model choices are separate.
