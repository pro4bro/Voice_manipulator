# ADR 0020: Snapshot and overlap for growing MKV detailed STT

Date: 2026-10-01
Status: Accepted

## Decision

Selecting STT tracks during import enables live preview. Detailed recognition
starts only through Speech to text (or the equivalent footage menu action).
At this request, capture the follower's atomically published frame counts before
waiting for its decoder lock. The first job for each selected channel covers
zero through that fixed boundary, even if audio grows while waiting for the GPU.

Persist a plan ID and initial frame counts with the follow checkpoint. Repeated
start requests resume that plan; its block length cannot change underneath saved
results. Older automatic-segmentation checkpoints remain readable and can be
superseded by an explicit new plan.

Subsequent logical blocks default to 60 seconds (dialog range 10–600 seconds).
For logical block [S, E], recognize [max(0, S-10), E]. Keep old words before
max(0, S-5), then replace the tail using the new result from that point. A word
crossing the seam belongs to one side based on its midpoint. Recognition offsets
are added to the actual audio start, not the logical block start. Empty or
invalid word intervals are excluded; nonempty detailed text without word timing
is an error rather than a fabricated alignment.

One detailed job per footage runs in the background while the worker can keep
processing live results. Save each result before advancing its cursor; retry
publication separately if interrupted. Wait for a full block while recording,
then drain the shorter tail after Finish. Copy initial audio in bounded pieces
so a long first job does not allocate the entire PCM slice in memory.

Persist an accurate-only SRT for each channel in its project-owned
`stt-segments/<asset-id>/transcript.stt.srt`. It is updated atomically from saved
detailed results and excludes untrusted word timing. Existing subtitle export
can export the selected child track by sentence or word.

Imported Timeline subtitle words use their absolute intervals for placement.
Parent Script retains individual word boundaries and original indices. A shared
playhead publishes active words for every channel; clicking a Script word seeks
all tracks without changing the selected parent footage.

## Validation and limits

Regression tests cover the owner's 29:50 example, overlap replacement, snapshot
capture across decoder-lock wait, repeated starts, restart checkpoints, waiting
for full blocks, old checkpoint compatibility, and live processing while a
detailed request is pending. A real 42-second two-track AAC MKV is followed while
FFmpeg is still writing, recognized with the installed tiny/large-v3 models,
and drained to per-channel words and SRT. Evidence is under `.scratch/mkv-stt-02/`.

Word timing is model output, not guaranteed forced alignment. The real acceptance
fixture is short and English; it does not establish recognition accuracy or
throughput for a 30-minute Vietnamese first job. Overlapping speakers retain
their independent channel timestamps. Broader Script turn grouping and
diarization viewport acceptance remain in MEDIA-SCRIPT-02.
