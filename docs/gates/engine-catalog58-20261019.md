# Round58 — ENGINE-CATALOG-01

Date: 2026-10-19. Baseline: `8459046`. Scope: a task provider catalog and
fail-closed selection of installed STT providers/models. No project media,
engine source, training weights or persistent project schema changed.

## Implementation and focused evidence

- `GET /api/engine-catalog?task=...` returns existing STT, generation and live
  conversion providers plus disabled future options. Each entry declares
  languages, custom-voice format, streaming input/output, native duration and
  timing granularity. The Voice Manipulator right panel shows the task's
  capabilities, readiness and reason unavailable.
- `/api/stt-engines` reports per-weight Whisper readiness. On this workstation,
  tiny/base/medium/large-v3 have snapshots; small does not. VibeVoice-ASR's
  checkout, checkpoint shards, tokenizer and Python runtime are present.
  Missing weights or adapter selections fail before entering the queue; an
  unknown model never silently falls through to Studio.
- Existing VibeVoice-ASR jobs retain `asrSpeakerId`, distinct from a user's
  Speaker Profile. Script now displays ASR speaker turns while every estimated
  word remains untrusted. No acoustic alignment is claimed.
- Focused frontend: 79 passed across four files. Focused backend: 15 passed
  across two files, with two existing deprecation warnings. Typecheck passed.
- Production-catalog TestClient preflight returned HTTP 200: VibeVoice-ASR
  available; VibeVoice-ASR-Streaming unavailable because its separate demo and
  checkpoint are absent; CosyVoice3 offline/live unavailable because its
  checkout/runtime/model are absent. The RTX 3090 showed 23,219/24,576 MiB
  allocated and 99% utilization, so no new GPU inference was started.

## Full verification

- Final frontend `npm test`: 1,112 passed / 136 files / 174.93 s after
  guarding against stale providers during function-tab switches.
- `npm run typecheck`: passed. `npm run build`: 191 modules transformed, passed.
- Backend `.venv/Scripts/python.exe -m pytest services/api/tests -q`:
  1,152 passed / 651.42 s, with three existing/fixture warnings (Starlette,
  `audioop`, intentional duplicate ZIP entry).
- First broad run used the portable embedded Python and failed in a fixture
  subprocess: its `python311._pth` ignores `PYTHONPATH`, so it imported the real
  `app` package instead of the isolated controller fixture. A focused rerun of
  that exact case with development `.venv` passed. The full `.venv` run above
  is the authoritative result; no application code or fixture timeout changed.
- After the broad run, the VibeVoice-ASR capability value was corrected from an
  ASR LoRA description to `customVoiceFormat: null`; focused backend rerun:
  15 passed / 9.83 s. No runtime path changed.
- `git diff --check`: passed.

## Remaining acceptance

This round completes provider discovery and selection safety, not new engine
jobs. The five requested sequential slices currently stand as follows:

| Slice | Acceptance state | Required evidence still missing |
| --- | --- | --- |
| ENGINE-CATALOG-01 | Implemented and verified | Real multilingual/provider acceptance belongs to the subsequent slices |
| STT-VIBE-01 | Existing offline adapter/queue improved; not accepted | Measured Việt/Anh/Trung/Nhật/Hàn speech corpus and real checkpoint inference while GPU is free |
| STT-VIBE-STREAM-01 | Disabled | Separate upstream checkout/checkpoint, partial/final session semantics, reconnect/backpressure and language tests |
| TTS-COSY-01 | Disabled | CosyVoice checkout/runtime/weights, real output WAV and reference/language checks |
| LIVE-COSY-01 | Disabled | Streaming integration, sustained device latency, interruption, buffer and voice-quality evidence |

The four later slices are not enabled by these catalog entries. Phase03 and
Checkpoint A remain open.
