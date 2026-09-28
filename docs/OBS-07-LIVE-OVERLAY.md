# OBS-07 — Live draft captions in OBS

Date: 2026-09-22. OBS Studio 32.2.2 on Windows.

The plugin creates or updates its owned **Pro4Bro Live Captions** Text (GDI+)
source in the active scene after a live audio session opens. It reads a UTF-8
file in the project's cache. The app refreshes that file from each active
source's provisional STT text, prefixes `[LIVE DRAFT]`, and clears it when the
capture stops. A caption file write failure is logged and cannot reject an
already durable audio chunk. The project manifest continues to use relative
paths; only the local pairing response exposes the current absolute cache path.

Speech to Text shows the draft, the lag measured from the most recently
acknowledged audio to STT publication, and a draft/final text difference once
Final STT is complete. The difference is a word-sequence similarity estimate,
not a timed word error rate or a subtitle timing quality score. It remains
unavailable when either transcript is empty.

## Real OBS smoke

- The plugin loaded from the local build, opened one source session, and added
  the owned Text source to `Scene`. WebSocket reported `read_from_file=true`,
  the project cache path, and a 340 × 80 text source after a UTF-8 update.
- OBS produced a playable 27.366 s MKV. At 21 s the recorded frame contains
  `[LIVE DRAFT]` and `OBS07: Xin chào cuộc họp`. Evidence:
  `.scratch/obs-speech-to-text/fixture/obs07-caption-frame-21.png` and the
  adjacent `2026-09-22 21-06-02.mkv`.
- This host's configured microphone failed to initialize, so the session had
  zero audio callbacks. The test injected caption text into the cache file to
  verify the plugin source and burn-in path. It does not establish live speech
  accuracy or end-to-end speech-to-frame latency. OBS plugin and WebSocket
  configuration were restored after the smoke; the temporary scene item was
  removed.

## Automated verification

- Receiver tests cover multi-source draft content, clearing on stop, overlay
  failure without audio ACK failure, and draft/final comparison availability.
- API test covers the caption-quality response. UI tests cover provisional
  labeling and the comparison display.
- Focused receiver tests: 7 passed. Frontend suite: 38 files, 293 tests
  passed. Frontend production build and native plugin build passed.
- Full API suite: 371 passed, 1 skipped, 1 failed in an unrelated speaker
  embedder test because this local `.venv` lacks `numpy` (`_read_pcm16`). The
  OBS receiver suite passed after that run.

## Spoken-source acceptance — completed

An English speech WAV generated locally was played as a looping OBS Media
Source. The plugin recorded that source directly; no caption text was injected
into the file. Source `0590769c-…` became live session
`live-868029363302` and Media Pool stem `asset-868029363302`.

| Measurement | Observed |
| --- | ---: |
| OBS MKV | 69.633 s, playable |
| App PCM stem | 58.484 s, 2,807,253 frames, 11,229,012 bytes |
| Source callbacks / dropped frames | 631 / 0 |
| First provisional text | 20.99 s after source enable (2 s status polling) |
| First recorded frame containing that text | video 32.0 s (0.5 s frame sampling) |
| Estimated speech enable to first visible frame | about 20.9 s; cold model start dominates |
| Subsequent app STT lag from ACK | 0.75–1.11 s in sampled updates |
| Final STT on same stem | complete, 124 words, partial word timing |
| Draft/final difference estimate | 37.5%; live 145 words, final 124 |

The repeated WAV exposed duplicated phrases in the draft. The difference is
therefore useful as a quality warning, and this run does not claim final
subtitle accuracy. The first-frame estimate subtracts the stem's late-start
interval (MKV duration minus stem duration) from the first nonblack caption
frame; its resolution is limited by 0.5 s frame sampling and the audio/video
tail difference. The API's displayed lag measures ACK to STT publication, not
speech to rendered video.

Evidence: `obs07-spoken-events.json`, `obs07-spoken-first-caption.png`,
`obs07-spoken-frame-stats.txt`, and `2026-09-22 21-23-26.mkv` in
`.scratch/obs-speech-to-text/fixture`. OBS configuration and scene collection
were restored after the test.

### Timecode issue found during acceptance

The first spoken run showed an FFmpeg Media Source audio timestamp on a clock
origin different from OBS' recording start. That source started about 11 s
late, yet the app stem had no initial gap and incorrectly reported complete
timing. The plugin now compares the first callback timestamp with its callback
arrival time, rebases a source whose clocks differ by more than 5 s, and keeps
the source's subsequent timestamp deltas.

The repeat OBS recording started the same source late and persisted a known
initial gap of 173,032 frames (3.605 s). Its MKV duration was 13.033 s; the
app stem was 13.079 s, a 46 ms difference. The plugin logged the clock rebase,
uploaded 11 chunks, received 102 callbacks, and dropped zero frames. This
checks the late-source timing path before OBS-08 SRT work. The first run's stem
is preserved as diagnostic evidence and must not be used for synchronized SRT.
