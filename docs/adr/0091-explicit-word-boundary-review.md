# 0091 — Save human-reviewed word boundaries as a new same-WAV output

Accepted 2026-10-16, round32.

The word inspector accepts proposed start/end seconds, quantized to24kHz frames.
Audition can hear those proposed bounds with200ms context before saving. Changes
must remain inside the owning segment and cannot overlap neighboring words.
Every Save requires explicit user confirmation of the selected boundaries. A
word can be confirmed without changing its interval. The first UI saves one
selected word at a time; the API supports an explicit batch of unique indexes.

Save copies the WAV byte-for-byte into a new Voice Output. Original text, speaker,
segment ownership, source output and unlisted words remain intact. Reviewed
words get `timingSource=user-reviewed`, trusted status and their original timing
provenance. This is a user declaration, not an ASR measurement or model timing
control. Quality follows the existing trusted-fraction policy. The immutable
source output retains earlier review history if the same word is reviewed again.

Source key and normalized request hash pin an atomic project-owned receipt.
Repeated Save returns the same checked output; corrupt/missing/tampered receipts
or output artifacts fail closed. No absolute path persists. A new word-review
output is not automatically added to accepted Patch history or listening ratings.

Automated saves use synthetic temporary projects. Actual Vietnamese artifacts
remain at23/25 machine-measured words until a person reviews them. This operation
updates annotations on existing audio; it does not move spoken words acoustically.
