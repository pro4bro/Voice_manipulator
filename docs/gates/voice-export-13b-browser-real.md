# VOICE-EXPORT-13B3 — real-output browser handoff

2026-10-04. Read-only real output `output-c3571850c20f` was copied from the
owner project into `.scratch/ux-05b/project`. Its 3,779,852-byte WAV matches
the source by SHA-256. This copy has 78.746 seconds of audio, 12 segments,
333 trusted timed words and 18 untrusted word cues. Private speech text is not
included in this gate note.

In the running browser, the selected output offered WAV, line SRT and word SRT.
All three actions displayed truthful `sent to browser` status. Word SRT also
reported 18 skipped cues with untrusted timing. The API wrote project-owned
subtitle artifacts under `exports/subtitles`:

| Artifact | Size | Cues | Timing bounds | SHA-256 |
| --- | ---: | ---: | --- | --- |
| line SRT | 2,440 bytes | 12 | 12.110–78.746 s | `BF3FCD9D30AC2A81F79AB1A1A53227289340B5071710FCB1306EE089E58C7CA3` |
| word SRT | 13,572 bytes | 333 | 0.300–78.746 s | `16F534357E3B1060B17A3C187A30957ACCDFD734376E59DB7BF82BF89584F5C1` |

Every SRT cue parsed and fell within playable audio with start earlier than
end. The three synthetic output fixtures were separately deleted from the
copied project after owner approval; the real copied output and source remain.

The in-app browser did not emit a `download` event for either a WAV or word
SRT click (30-second and 7-second waits). No saved browser file was found for
the WAV. The UI only claims handoff, and this round does not claim saved-file,
cancel, or moved-download behavior. Parent VOICE-EXPORT-13B remains open for
those browser outcomes. The product source is unchanged; full suite evidence
from UX-05B1 on the same checkout is backend 561 passed, frontend 477 passed,
typecheck and build passed.
