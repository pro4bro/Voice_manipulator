# UX-10B — Six live OBS sources and Recorder layout

Date: 2026-10-03
Result: Six-source live UI gate passes after repairs; physical 125/150% DPI
acceptance remains open.

## Setup

- Isolated controller/API/Studio on 18119/18120/18081 with a separate registry,
  project and portable OBS config under ignored `.scratch/ux-10b/`.
- OBS 32.2.2, bridge 0.6.9. Bridge SHA256 matches the packaged manifest:
  `adb1609f1e6589baefdd84d365b00d4367ad4f6a9e918b10f3e294c582f7f1d7`.
- Six new source UUIDs, slots 1–6, looped mono PCM16/48kHz fixture tones at
  330/440/550/660/770/880Hz. Long source names exercise truncation. Sources are
  muted and monitoring is off; independent source capture still receives PCM.
- OBS Start/Pause/Resume/Stop use its authenticated local WebSocket API, not
  mocked app status. Browser actions and screenshots use CUA. Binary trees are
  linked from an existing controlled OBS installation and never modified;
  configuration, fixtures, spool, recordings and project artifacts are separate.

## Reproduced defects and repairs

1. At 1600×1000, the mixer measured 372.875px inside a 340px sidebar and extended
   beyond its right edge. Its four-column intrinsic minimum caused clipping.
   The mixer now establishes an inline-size container and permits shrinking;
   below 400px, applied state sits under Forward in the third column. The
   measured mixer is now 296px and channel rows 276px, with no horizontal
   overflow. Controls remain reachable through the outer sidebar scroll.
2. Native Pause advertised paused in a heartbeat before its lifecycle event.
   The event was rejected because runtime state had already advanced; app
   capture stayed recording and the pending command queue blocked. Open-span
   state now advances through lifecycle events. A red/green regression verifies
   heartbeat-before-Pause/Resume/Stop ordering and exact native pause boundaries.
   An isolated API restart recovered the queued event from the existing OBS
   process; fresh native Pause/Resume/Stop then applied without blockage.

## Browser evidence

At 1600×1000 and 1280×800, DPR 1:

- All six durable-PCM channels show receiving/REC with `obs-rec-pulse`.
- Pause shows six PAUSE labels and two-bar icons, `data-recording=false`,
  animation `none`. Resume returns all six to receiving and blinking REC.
- Stop returns six idle indicators with no animation.
- Recorder list is 183px high; mixer list is 323px high in the narrow sidebar.
  Both have overflow visible and equal client/scroll heights. Only the outer
  sidebar scrolls. Its scroll reaches the final channel and recorder controls.
- Layer playhead is 1110px high across six 185px lanes, with its bottom exactly
  matching the sixth lane's bottom after scrolling there.
- Column widths are 244px on desktop, with computed minimum 240px; at 750×884
  they remain 240px and Timeline owns the horizontal scroll. Channel names keep
  the existing scrolling/truncation behavior; label sizing is not changed.
- At 750×884 the mixer and both lists have equal client/scroll widths and
  overflow visible. Browser error/warning logs are empty after reload/recovery.

Raw evidence: ignored `.scratch/ux-10b/browser-evidence.json`,
`windows-dpi.json`, status snapshots, OBS logs, project journals and screenshots:
`rec-six.png`, `pause-six-fixed.png`, `resume-six-fixed.png`,
`layer-last-six.png`, `mixer-six-1280.png`, `stopped-six-750.png`.

## Final media artifacts

Final media gate: **2,524 PCM chunks** pass sequence, size and SHA256 checks.
The 18,239,361-byte MKA has six decodable FLAC streams with the six expected
tone frequencies and peak 6000 (no clipping in sampled audio). Six mono/24kHz
analysis WAVs span about 652.68s; each source has only the two declared
app-paused sample gaps. Media Pool shows the ready six-track asset without
a reload after Stop. The stop-to-archive delay is roughly five minutes in this
run; it remains a performance gap. Raw artifact evidence is
`.scratch/ux-10b/media-acceptance.json` and `final-summary.json`.

## Verification

- New regression fails before repair (`paused != recording`) and passes after.
- Runtime suite: **24 passed**, 15.45s.
- Full backend: **501 passed**, 162.92s; existing httpx and audioop warnings.
- Frontend: **55 files / 465 passed**, 144.92s, one worker.
- Typecheck and production build pass.

## Cleanup

Cleanup: the native spool is empty, the owned OBS process and scratch runtime
are stopped, ports 18119/18120/18081/4466 are free, the runtime session file is
removed, and the browser override/tab are reset/closed. Project artifacts and
raw evidence remain under ignored `.scratch/ux-10b/`.

## Limits

Windows per-monitor effective DPI reports 96/96 on all three monitors and system
DPI 96. Browser DPR is 1. Smaller viewports are responsive geometry checks;
they do not prove physical 125/150% Windows scaling. Native window screenshot
automation is unavailable in this session, so those acceptance cases stay open.

This is a six-source tone gate, not microphone-device, speech accuracy or
sustained latency acceptance. PCM delivery accumulated a disk-spool backlog
during the live run (HTTP roughly 230–350ms per chunk in sampled logs), and
one temporary stalled indicator was observed under simultaneous test load.
That remains truthful status and a performance gap; this round does not claim
that six-source live waveform latency or data-loss risk is solved. Initial
native overflow counters include pre-Record buffering and cannot establish a
clean loss-free start merely from a moving meter.

Exact next existing round: **UX-11B**, inspect named recording selectors and
11.2px channel labels with multiple recordings at the owner's viewport.
Physical DPI and the broader LIVELINK-08 acceptance matrix remain open.
