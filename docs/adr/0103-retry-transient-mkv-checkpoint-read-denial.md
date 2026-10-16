# 0103 — Bound recovery from transient checkpoint read denial

Accepted 2026-10-17, round45 integration repair.

The first frozen full suite completed1136 cases but failed the existing MKV
restart recovery case with PermissionError opening follow-state.json. Recovery
had started and returned successful status packets before that read; the final
checkpoint still held three complete clusters. This was an access-denial failure,
not an assertion timing out. The exact process/filter denying the read was not
identified; do not attribute it to a particular writer or antivirus product.

Use a bounded read retry for PermissionError in the follower's checkpoint loader:
at most five attempts,20/40/60/80ms waits, total200ms requested backoff. This mirrors
its existing atomic JSON replacement policy. Preserve JSON parsing/identity/
version checks, propagate persistent denial, and never invent a successful
snapshot. Missing files and invalid JSON do not enter this permission retry.

Do not take the parent's full processing lock just to read status: that could
hold a status request behind FFprobe/FFmpeg, multiple clusters or final decoding.
Retrying the atomic checkpoint read preserves the existing status behavior and
does not create cross-process serialization or solve unproven shutdown races.
Keep the existing five-second recovery test deadline and all assertions intact.
