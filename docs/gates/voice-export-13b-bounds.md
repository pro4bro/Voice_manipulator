# VOICE-EXPORT-13B2 — preserve measured cue bounds

2026-10-04, starting checkout 55a9c48. Four regressions first failed:
negative word start, word after audio end, word crossing the audio tail, and
2.9996–3.0 seconds collapsing to the same SRT millisecond. The old renderer
extended short/inverted cue ends to start+1ms; it could therefore write cues
outside playable audio rather than emitting a reversed interval.

Export now refuses finite word intervals outside [0,duration] and refuses SRT
cues whose rounded millisecond end is not greater than start. It does not clamp
source word times or extend the cue to invent timing. HTTP 400 asks for alignment.
Valid intervals retain their original values. A refusal leaves previous valid
subtitle bytes unchanged. Existing untrusted-cue filtering remains covered.
This affects footage subtitles as well as Voice Output through their shared
exporter; source audio and persisted transcript words are not changed.

Owned actual API gate: move the fixture under .scratch/voice-export-13b to a new
folder, Open Existing by project path, retain same project/output IDs; WAV, word
SRT and line SRT hashes match before/after. Invalid word 5–6 seconds in a 4-second
output returns HTTP 400 and creates no SRT. All three source audio hashes match;
temporary invalid words are restored after the request. Companion JSON holds
file hashes and response evidence. The final console print encountered Windows
cp1252 Unicode encoding after every assertion and JSON write had completed;
the UTF-8 evidence file was then read successfully.

Validation: focused export/voice-script 23 passed with two existing warnings;
final exporter 10 passed after adding old-file preservation assertions.
Full backend 561 passed, 192.10s, two existing dependency warnings.
Unchanged frontend carries 477 tests/56 files, typecheck/build from 13B1.
No reviewed speech, actual browser saved-download/cancel, or physical OBS gate
is inferred from deterministic export timing. Browser automation was interrupted
by a JS dialog; the fresh tab was closed. The interrupted original test tab could
not be closed through the documented API. Owned services are shut down at finish.

Parent VOICE-EXPORT-13B remains open for real browser artifact/cancel evidence.
Exact next independent queued round UX-05B; browser control must be usable before
its running-browser acceptance. MKV-ACCEPT-01 keeps reviewed 19A quality/timing
prerequisites. No phase advances or queue completion count reductions.
