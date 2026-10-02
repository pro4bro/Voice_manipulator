# ADR 0023: Voice Output audio and subtitle timing

Date: 2026-10-02
Status: Accepted

## Decision

The Voice Manipulator exports the selected Voice Output's existing WAV through
the browser. It does not create a second audio derivative. The Voice Output
list exposes this action per output, avoiding ambiguity when several takes
were generated. The active Voice Script offers the same export choices.

"SRT từng dòng" means one cue for each Script row actually read into the
output. The row's saved `VoiceOutputSegment.start/end` are measured by the
audio assembly cursor and account for gaps between rows. The cue uses that
segment's original text and speaker; it does not infer a timestamp from the
current editable Script. A legacy output without segments or with invalid
boundaries cannot export line SRT.

"SRT từng từ" uses the existing word-timing exporter. It excludes words whose
timing is untrusted, and fails if no trustworthy cues remain. Line SRT remains
available when word recognition failed because its row boundaries come from
the assembled audio, not from inferred word placement. Existing sentence SRT
and CSV export remain available from the active Script.

Subtitle files are project-owned under `exports/subtitles`; line SRT replaces
its destination atomically after the complete file is written. The browser
also downloads the requested file. Source WAV and Voice Output metadata
remain unchanged.
