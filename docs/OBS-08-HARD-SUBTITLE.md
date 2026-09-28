# OBS-08 — Reviewed SRT and hard-subtitle derivative

Date: 2026-09-22.

## Delivered behavior

- Speech to Text already merges only timing-trusted cues from the selected OBS
  track assets onto the imported recording clock. The same selected asset IDs
  now drive both the downloaded SRT and the hard-subtitle render.
- `POST /api/projects/{projectId}/obs-sessions/{sessionId}/hard-subtitle`
  renders a project-owned MP4 under `exports/videos`. The SRT remains under
  `exports/subtitles`; the imported MKV remains unchanged under `assets/media`.
- FFmpeg renders H.264 video and AAC audio with UTF-8 SRT, Segoe UI, outline,
  and bottom-center placement. FFprobe must confirm output duration within
  250 ms of the session before the temporary file is atomically published.
- A failed render removes its `.part` file. It does not change or remove the
  source recording, so the user can retry the same action.
- The activity log records the output, SRT, source recording, selected source
  assets, and measured duration using project-relative paths.
- The OBS Capture UI enables **Render video có subtitle** only when the selected
  tracks contain trusted cues. The returned MP4 downloads when rendering ends.

## Vietnamese visual and timing check

A six-second project fixture contains three reviewed Vietnamese cues:

| Position | Cue time | Text | Visual result |
| --- | --- | --- | --- |
| Start | 0.250–1.250 s | `Người nói: Xin chào Việt Nam.` | correct glyphs |
| Middle | 2.550–3.650 s | `Người nói: Phụ đề ở giữa rõ ràng.` | correct glyphs |
| End | 4.750–5.750 s | `Người nói: Kết thúc đồng bộ.` | correct glyphs |

The source duration is 6.023 s and rendered duration is 6.040 s, a 17 ms
difference. The source audio starts at -23 ms relative to video; the MP4 muxer
normalizes both output streams to 0, so the measured A/V start shift is 23 ms.
SHA-256 confirmed the source MKV was unchanged. Visual evidence for
the three sampled frames is
`.scratch/obs-speech-to-text/fixture/obs08-start-middle-end.png`. The portable
fixture output and report are under `.scratch/obs-speech-to-text/obs08-project`.

## Verification

- Renderer tests cover a successful project-owned render, duration validation,
  source preservation, and failure cleanup without publishing a partial MP4.
- The API integration test imports a real two-track MKV, accepts a reviewed
  timing cue, downloads an MP4 through the new endpoint, and verifies the
  original recording bytes remain identical.
- Frontend focused test covers the selected-track render action.
- Frontend suite: 38 files, 293 tests passed. Production build passed.
- Full API suite: 373 passed, 1 skipped, with the one existing unrelated
  speaker embedder failure because the local `.venv` lacks `numpy`.

## Scope boundary

This round verifies reviewed cue rendering, portability, Vietnamese text, and
start/middle/end timing on a controlled video. The remaining product acceptance
is the 30-minute OBS meeting with screen, microphone, and application audio,
including a late source and pause/resume.
