# 0109 — Free word timing, selected grips and stable middle-pick

Accepted 2026-10-18, stabilization round52.

## Causes

Word movement and trim targets snapped to acoustic energy transitions within
60ms. Those targets came from the currently loaded detail envelope and were not
shown as explicit guides. Trim handles also shared a3pixel activation threshold
with middle-button movement. Together these prevented precise small adjustments.

Every rendered subtitle word mounted two pointer-active grips, even while their
opacity was zero. Hovering any word exposed its grips. Nearby unselected grips
could therefore interfere with selecting the intended trim control.

Insertion already promoted the first inserted word for waveform IN/OUT assignment.
The promotion listener toggled an already promoted index off. Middle-picking a
newly inserted word therefore disabled assignment; selecting another word first
made the same action appear to work. Existing-word replacement did not always
start promoted, which explains why the paths behaved differently.

## Decision

Remove acoustic snap calculation, targets and the internal edge option from
applyWordDrag. Apply pointer delta directly in move, trim-start and trim-end.
Keep source bounds, order, minimum own duration and10% neighbour retention.
These prevent invalid intervals; they are not acoustic/grid snapping. Trim grips
accept any nonzero pointer movement; middle-button body movement retains its
click-versus-drag threshold so a middle click can still choose the alignment word.

Mount grips only for selected words and remove hover-based visibility. Unselected
words have neither visible grips nor invisible grip hit targets. Selected grips
retain their existing geometry above/outside labels and opacity. Compact overview
stripes still require zoom for trim controls, preserving their density contract.

A promotion event sets the requested source/index idempotently. Re-picking the
same word keeps it ready for assignment, whether the event originated in Subtitle,
Script or a channel view. Left/right click and Escape still clear promotion;
finishing a waveform assignment still advances to the next word.

## Verification and boundaries

RED-first tests reproduce insertion promotion toggling (menu/double-click), hidden
grip hit targets, acoustic snap and1pixel trim suppression. Replace-text insertion
is also exercised as a control. GREEN tests cover all three insertion routes,
repeat external promotion events, one-pixel IN/OUT trims, selection/hover/deselect,
and exact fractional move/trim deltas. Existing ordering, collision, cancellation,
audio preview and source-bound checks remain. Retired acoustic helper tests are
removed with the explicitly removed feature; precise-delta tests replace its drag
contracts. See docs/gates/word-timing52-20261018.md for actual results.

No backend, model, media or persistent format change; saved word timestamps only
change through existing explicit user edit commits. Browser use is disabled in
Work settings, so final real mouse acceptance remains open. Phase03 stays60%;
independent acoustic anchors, Checkpoint A and downstream processor gates stay open.
