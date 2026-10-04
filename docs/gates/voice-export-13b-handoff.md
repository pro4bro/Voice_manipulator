# VOICE-EXPORT-13B1 — truthful browser handoff and omission count

2026-10-04, starting checkout df97b8a. Bounded repair found during the queued
running-browser export gate; parent VOICE-EXPORT-13B acceptance remains open.

A successful fetch and anchor click cannot confirm the browser saved a file or
that a user did not cancel. Voice Manipulator now says the file was sent to the
browser instead of claiming it was downloaded. Subtitle responses report
X-Pro4Bro-Skipped-Cues, calculated with the same timed-word/cue construction as
the export; UI displays the omission count for untrusted timing. A failed HTTP
response still rejects before any download anchor is clicked.

Owned fixture: three deterministic mono PCM16/24k, four-second outputs, under
.scratch/voice-export-13b; synthetic word intervals are export fixtures, not
recognizer accuracy or reviewed speech evidence. In the running browser, output
3 remained active while exporting output 2. API log records the selected output
2 audio and subtitle requests, and the pre-repair UI claimed a completed download
without surfacing the omitted cue. The browser download event did not yield a
file and its tab subsequently stopped accepting input after a JS-dialog
interruption. Actual browser saved-byte/cancel/move acceptance is not claimed.

Actual API file inspection: selected WAV 192044 bytes, SHA256
66de87320b7174b7e140cbd2c146bee8bfdc7d927d91b83fb3c13c8f9acfbe41;
word SRT 235 bytes, four cues, one omitted cue and no UNTRUSTED token;
line SRT 90 bytes, two cues and zero omissions. Original three audio hashes
remain unchanged. These API downloads are not counted as browser downloads.

Validation: export/voice-script backend 19 passed; full backend 557 passed,
222.60s, two existing dependency warnings. Full frontend 477 tests/56 files,
18.59s; typecheck/build passed. New client regressions verify selected output
identity/filename, omission metadata and HTTP failure before browser handoff.
The first typecheck exposed an implicit test this type, corrected before final
checks. No engine, capture policy, phase or parent gate is marked complete.

Exact next bounded round VOICE-EXPORT-13B2: reject export intervals outside the
playable audio; then UX-05B residual acceptance. MKV-ACCEPT-01 remains dependent
on reviewed 19A timing and recognition evidence.
