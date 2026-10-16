# 0092 — Export comparable accepted Patch listening evidence

Accepted 2026-10-16, round33.

Each history comparison group offers a JSON attachment. The server validates
accepted history, includes only entries sharing its comparison key, and snapshots
audio/metadata hashes plus current, stale or unreviewed user assessments. Review
responses expose additive public checksum fields so reports use the same checked
identity without depending on a private method. Mixed concurrent assessment
revisions fail with409 and request a retry. Corrupt notes are never overwritten.

The version1 report has a content snapshot key, export time, frame target and
replacement text. It contains portable identifiers and hashes, no machine paths
or model weights. JSON preserves notes as data. It does not rank strategies or
infer checkpoint acceptance. Reading/exporting never confirms listening, starts
inference or writes a review. An unreviewed entry stays visibly unassessed.

The browser download link plus HTTP attachment checks are not native Save/cancel
acceptance. That existing gate remains open until actual UI interaction works.
