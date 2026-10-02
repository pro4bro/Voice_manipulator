# ADR 0026: Keep OBS permanent deletions in the portable project

Date: 2026-10-02
Status: Accepted at API and restart-test level; running-app check open

## Decision

When the user permanently deletes an archived OBS LiveLink MKA footage, save
its recording ID in `assets/obs-livelink/deleted-recordings.json` before
removing the recording folder and grouped Media Pool assets. The file is a
sorted JSON string array of recording IDs and contains no source paths or
transcript. Writes are atomic. The project owns this small tombstone because
machine-local LiveLink state can outlive the media folder, and a project may
move to another machine.

The delete API holds that recording's archive lock and the LiveLink state lock
while removing media and discarding the deleted ID from the current snapshot.
State loading and persistence also exclude tombstoned IDs. Recovery and
archive retry reject them; journal-backed Media Pool discovery never returns
them. This allows a stale copy of machine state to be loaded without silently
recreating a project journal.

For a recording deleted before this format existed, discovery hides an
archive-ready journal if its recorded MKA parent asset is absent from the
media index. If an older journal has no parent ID, it is hidden only if both
MKA and PCM chunks are absent. Such journals are not automatically erased:
missing media could also indicate a damaged or moved archive, and a read
request should not destroy remaining evidence.

## Evidence and limits

API and adapter tests cover deletion, stale-state restart, persistence,
recovery blocking, archive retry and older orphan filtering. The owner's
`Test_OBS 7` orphan has a ready journal but no indexed parent, MKA or chunks.
The updated running app has not yet been checked with real OBS.
