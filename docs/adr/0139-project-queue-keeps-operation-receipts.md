# ADR0139 — Keep project Queue receipts beside their project

Status: accepted, 2026-10-23. Round PROJECT-QUEUE-01, approved footage mockup.

The existing ActivityCenter removed finished jobs after 25 seconds. That was
useful for the Status line, but could not preserve a project's processing history.
Keep that transient view and add project-owned receipts under
`jobs/task-queue/tasks.json`. Versioned atomic snapshots store task identities,
asset/parent-footage relationships, optional task parents, stages, measured
fractions and terminal outcomes. Queued/running receipts owned by a dead API
process become interrupted when read. Opening history does not execute jobs;
existing processors retain their recovery and cancellation policies.

Import, STT, alignment and diarization share one Footage tab. Current attempts
group by footage and retain track identity. Old attempts remain inspectable;
concurrent queued/running attempts stay visible. The footage fraction is the
arithmetic mean of its current actual operations. Unknown inputs propagate to
the aggregate. Generate children use leaf tasks, avoiding a second weight for
their containing parent. Errors/cancellation/interruption remain outside Done.

Reserve browser import batches before dispatching serial uploads so their
pending work is visible. Only the server claims reservations and writes terminal
outcomes. Project HTTP middleware tracks imports, explicit downloads and otherwise
unreported mutating requests exceeding five seconds. Native download anchors use
an explicit query marker; playback stays a read. Native processors report their
own queued/running/terminal transitions. Alignment workers publish atomic progress
sidecars; measured context groups provide fractions, while model loading, MFA and
FFmpeg stages remain indeterminate. No wall-clock percentage is invented.

Queue is a reporting view over existing executors. A second scheduler or automatic
Apply would change execution semantics and is not part of this decision. Alignment
Done means a validated proposal is available for Ghost Preview; the user still
chooses Apply Aligner. Source media and manually corrected timings remain intact.

Global runtime tasks without a project remain in the existing Status stream.
Their containing project operation is recorded when one exists. This history
starts with the new reporting code; no historical engine runs are fabricated.
