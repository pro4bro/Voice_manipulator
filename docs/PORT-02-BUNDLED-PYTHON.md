# PORT-02 — Bundled Python Runtimes

Date: 2026-09-23

## Delivered

- Added a repeatable builder for six isolated CPython 3.11.9 embedded runtimes:
  Core API/controller, STT/diarization, OmniVoice training, VibeVoice training,
  RVC, and Voice Changer.
- Pinned the official Windows embedded archive by URL and SHA-256 before use.
- Vendored workload packages into each runtime with NTFS hardlinks and excluded
  stale `__pycache__`/`.pyc` paths from the source venvs.
- Added only relative `_pth` entries for product and engine source. Isolated mode
  ignores system/user Python paths and environment path injection.
- Switched controller, API, Studio, training, VibeVoice, RVC, speaker embedding,
  and voice changer boundaries to the private runtime layout.
- Kept compatibility lookup for test fixtures and legacy venv inspection; the
  production defaults and launchers no longer select those environments.
- Connected setup/provision scripts to rebuild the affected portable runtime
  after dependency updates.

## Evidence

- Portable `All` audit: 20 passed, 0 failed.
- Runtime builder verified imports for every profile, including PyTorch,
  Torchaudio, WhisperX, Pyannote, OmniVoice, VibeVoice, RVC, and SoundDevice.
- Real processes:
  - API executable: `.runtime/python/core/python.exe`;
  - Studio executable: `.runtime/python/stt/python.exe`.
- API `/api/health`: `ok`.
- Studio `/api/status`: `ok`, `large-v3`, CUDA, float16.
- Final STT model smoke: large-v3 loaded successfully on CUDA/float16 through
  the portable STT interpreter.
- Backend suite: 383 passed.
- Frontend suite: 38 files / 293 tests passed; TypeScript/Vite production build
  passed.
- All seven changed PowerShell scripts parsed successfully; `git diff --check`
  passed; `engines/OmniVoice` remained clean.

## Known boundary

Pyannote import reports its existing TorchCodec compatibility warning. Pro4Bro's
speaker worker supplies in-memory PCM waveform tensors and does not use that
decoder path. The import and server/model gates pass.

PORT-02 proves the private runtimes on the source workstation. It does not prove
the final copy operation preserves every required file. PORT-03 owns bundle
assembly, exclusion of build-only venvs, path-move testing, and clean-machine
acceptance.
