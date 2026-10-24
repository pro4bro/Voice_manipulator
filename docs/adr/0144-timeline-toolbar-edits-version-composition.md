# ADR0144 — Timeline toolbar edits the Version composition

Status: accepted, 2026-10-25. Round VM-TIMELINE-DIRECT-EDIT-01.

Clip selection belongs to the adapter between the shared Timeline and Voice
Output lanes. The top toolbar acts on that selected clip; the bottom clip form
is removed. CUT splits at the playhead or valid marked IN/OUT boundaries. The
selected identity follows the piece after the first cut. DELETE removes that
piece. UNCUT joins contiguous source pieces only when they are immediate array
neighbors in the same layer and share output/enabled state. Crossing intervening
clips could change bottom-wins priority and is forbidden. Cutting a continuous
source must not introduce an audible fade or change PCM.

MOVE up/down, Alt+Arrow up/down and pointer drag transfer between existing layers.
Pointer capture, cancellation and edge scrolling support offscreen destinations.
Timeline start, source IN and duration remain locked. Horizontal drag does not
reposition a clip. Master, subtitles and layers keep their shared horizontal
viewport. Only the layer list scrolls vertically; the top ruler and bottom
navigator/transport stay outside it. Spare stage height goes to Master.

Each Version retains `generatedComposition`, its arrangement at the latest
successful Full or Fix publication. RESET restores this arrangement and renders
it at the next composition revision. Manual edits cannot overwrite this baseline.
Cloning and recoverable output lifecycle retain/remap every baseline source.
Older manifests initialize it from their existing composition; earlier manual
history cannot be reconstructed. Full and Fix Script snapshot rules are unchanged.

Typed or pasted Script content is literal inside its row, including newlines,
tabs, paragraphs and speaker-looking prefixes. Enter does not create a row.
Text mode retains known existing row boundaries without inferring new ones from
text labels. Explicit Add Row remains available. Automatic transcript rows use
dedicated diarization identities or manual/Profile assignments, not raw ASR
speaker guesses, punctuation or time gaps. Each continuous speaker turn is one
row; a speaker change starts another. Existing saved rows are not silently merged.
