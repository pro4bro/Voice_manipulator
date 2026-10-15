# Voice Manipulator — rounds6–10, 2026-10-15

Owner requested five further rounds. They were executed serially, with separate
commits/gates. Checkmarks represent delivered implementation; acceptance gaps
below remain open. Phase03 stays60%; Phase05 is incomplete; no new portable/push.

| Round | Delivered | Commit |
| --- | --- | --- |
| VM-REF-DETAIL-01 | Right-column two-line slots, independent expansion/removal, explicit Timeline+Script reveal |38d3f46|
| VM-REF-RESOLVE-01 | Independent properties, identity/locks/priority/conflicts, actual PCM features, unsupported outcomes |5c5fd39|
| VM-TIMING-REF-01 | Portable source/template plans, trusted/reviewed mapping, verified historic training checks |5f1ff60|
| VM-NAV-01 | Script/Timeline selection lights, overlapping target menus, playback follow guards |661e580|
| VM-DURATION-01 | Scoped sample budgets, native generation, measured final fit, preview/report/cache |this gate's implementation commit|

## Automated checks

- Backend full **885 passed**,389.87s; latest affected **53 passed**, final
  timing/duration **12 passed** after the added character-feasibility regression
  and partial/offset anchor reporting. Existing warnings: audioop, Starlette
  TestClient, deliberate duplicate-ZIP fixture.
- First frontend full **850 passed /2 failed**,852 tests in95 files,226.52s.
  Failures were the pre-existing OBS selected-archive gain and zoom timing races
  also recorded in the first-five gate. Unchanged OBS55 plus ReferenceDetail2
  rerun: **57 passed**. No OBS source/test, assertions or test configuration changed.
- Final frontend confirmation: **853 passed /95 files**,229.22s, followed by typecheck/build pass.
- Latest reporting/navigation component checks: **10 passed**, including trailing-silence reveal and offset readout; typecheck/build pass.
- Typecheck/build and git diff whitespace checks pass. No suppressions or skips.
- Independent Worker correctness review confirmed the Required unbroken-Latin
  feasibility issue fixed, with inference/model preparation/lease kept untouched
  on rejection. No other Required issue established.

## Actual API/audio evidence

Live private HTTP API imported actual prior GPU speech, measured reference
properties, saved timing plans, previewed locked1.20s plus free4.45s with.35s gap
under6.00s total, rejected409 stale requests, removed one binding and reopened a
moved project with source hashes unchanged. No new TTS is claimed by that HTTP
run. Receipt: .scratch/vm-rounds6-10/http-acceptance.json.

CPU32-step attempt failed297.11s, no WAV. When GPU load/memory permitted, actual
native32-step clone inference passed:

| Case | Requested | Actual | Reused |
| --- | --- | --- | --- |
| Natural | natural |1.78s|0|
| Shorter |1.42s|1.42s|0|
| Longer |2.60s|2.60s|0|
| Two profiles + locked row + pause |4.95s|4.95s|1|
| Replay |4.95s|4.95s|2/2|
| Timing template + explicit parent budget |4.95s|4.95s|1|
| Template replay |4.95s|4.95s|2/2|
| Move/Open Existing replay |4.95s|4.95s|2/2|

All are24kHz/mono/PCM16, no clipped samples. Short target receives20ms zero padding
for native token-frame quantization; longer has none. Follow-up gaps are350ms,
peak0 and left/right transition steps0. Generated word bounds stay within audio.
The2.60s reference envelope is explicitly superseded by the clip's allocation
of2.00s to its free row; report retains-0.60s difference. Anchors remain unknown,
never promoted from estimated subtitles. The two profiles may be the same human.

- .scratch/vm-rounds6-10/gpu/real-duration-result.json
- .scratch/vm-rounds6-10/gpu/followup-result.json
- Audition copies: natural.wav, shorter.wav, longer.wav, moved-reuse.wav there.
- Final portable acceptance project:
  .scratch/vm-rounds6-10/gpu/reopened-duration-native-gpu-acceptance-d998f42b
- Follow-up replay WAV SHA256:
  f066c9a02f485d74a032f46597583744683f26b5f289a4ac40e0869757c30d8b

Private API and owned model workers were stopped; shared lease was released.
Source media/model files remained preserved and upstream engines read-only.

## Open acceptance and next

CUA apps[]/browsers[]: native browser geometry/scroll/zoom acceptance remains open.
Human listening/intelligibility and model identity remain open; measured duration
is not word-anchor or emotional delivery success. Training-source validation has
fixture proof; no new training run or timed full/LoRA quality acceptance claimed.
Emotion/intonation/shout/whisper, loudness rendering, random schedules, Ctrl-handle
ripple/stretch and incremental Fix remain later rounds. Prior source-library and
Collection native/GPU acceptance queues are retained. Next **VM-RIPPLE-01**.
