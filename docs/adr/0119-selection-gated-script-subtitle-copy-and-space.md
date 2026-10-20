# 0119 — Selection-gated Script, subtitle copy and Timeline Space

Accepted 2026-10-20, stabilization round62.

## Selection gate

Script and Timeline in the footage workflows show only a selection prompt until
the user opens footage or an OBS recording. A stale `take`, transcript draft or
recording preview cannot leak into an unselected module. Explicitly empty Media
Pool selection wins over a stale selected asset ID. Voice Manipulator's authored
Script/output, Voice Changer's recording and an active Reading Session retain
their separate, source-owned workflows.

## Subtitle duplication

Alt plus left drag on an already selected subtitle word carries the selected
word set. A translucent preview follows the pointer above the subtitle lane.
On release, the first copy starts at the pointer's source time; the others keep
their relative timing. The Script gains the same words in timeline order. Source
words remain present. If the target is occupied, following words move right just
far enough to keep the existing ordered, non-overlapping word model valid.

Copied and displaced words have provisional, untrusted timing and retain source
interval provenance. This gesture edits subtitles and Script text, never audio.
If the copies or displaced suffix would exceed the footage duration, the UI
shows an error and writes nothing. Escape, pointer cancellation and a new source
discard the preview without a write. The existing middle-button move and edge
trim gestures keep their behavior.

## Playback shortcut

Space toggles playback within ordinary and imported Timeline modules. The OBS
overview already has its own Space handler; focused OBS/imported tracks use the
ordinary Timeline handler. Editable controls and buttons keep native Space
behavior, and the shortcut ignores modified, repeating and composing events.

## Verification boundary

See `docs/gates/selection-copy-space62-20261020.md` for regression and suite
results. The round does not change source audio, engine code, persistent project
paths or project schema. The duplicated text has no new acoustic alignment until
the user reviews it.
