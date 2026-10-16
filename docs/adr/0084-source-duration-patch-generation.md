# 0084 — Source-duration Patch generation

Date: 2026-10-16. Status: accepted for VM-PATCH-02B.

Patch requests choose natural ripple or the current source span's exact PCM
frame budget. OmniVoice receives native duration conditioning. A conservative
text-unit feasibility ceiling rejects impossible budgets before inference; this
does not predict perceptual quality. Explicit Script timing locks remain blockers.

Duration policy participates in immutable job and clip identity. Old requests
default to natural ripple. Changing policy cannot Apply an earlier preview.
Source-duration preview and Apply both require replacement frames to equal the
source span, so the clip's following PCM and offsets stay fixed.

Existing duration fitting permits at most60ms of codec quantization correction
using digital silence only. It never truncates speech, hides time stretch, or
silently changes the request to natural timing. A failed model fit remains a
failed job. Frame fitting does not establish measured word alignment; replacement
word timing retains its actual trust metadata. Human listening remains required.
