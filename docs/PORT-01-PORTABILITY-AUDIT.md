# PORT-01 — Portable Runtime Contract and Audit

Date: 2026-09-22

## Delivered

- Runtime defaults for VibeVoice, Applio/research engines, and the Hugging Face
  model cache now resolve below the application root.
- `scripts/test-portable-runtime.ps1` checks Core, OBS Capture, STT, and Training
  profiles and exits nonzero when the folder is not self-contained.
- NumPy is a declared API dependency because the speaker embedding worker imports
  it directly.
- Existing VibeVoice model weights and research-engine source are copied into the
  ignored `.runtime/engines` distribution tree without copying their old venvs,
  caches, outputs, or Git metadata.

## Initial evidence

The first `All` audit reported 11 passes and 9 failures. It proved that the web
build, FFmpeg/FFprobe, OBS plugin DLL, STT service, Whisper large-v3, diarization
models, OmniVoice source, and local Hugging Face cache were already present.

The failures were six Python virtual environments whose `pyvenv.cfg` points to
the developer's installed Python, plus VibeVoice source/models and Applio source
outside the app folder. Engine localization removes the latter three failures.
The six Python failures remain fail-closed for PORT-02.

The post-localization `All` audit reported 14 passes and 6 failures. It copied
82 VibeVoice model files normally, created same-volume hardlinks for the 26
remaining model files (18.69 GiB), and copied 1,081 research-engine files.
Hardlinks retain their data independently of the old path and become ordinary
files when the bundle is copied to another drive or machine.

Verification after the change:

- backend: 381 passed;
- frontend: 38 files, 293 tests passed;
- TypeScript/Vite production build: passed;
- both new PowerShell scripts parsed without syntax errors;
- `git diff --check`: passed.

## Meaning

The current workstation can run the feature set, but the folder must not yet be
given to another machine as a guaranteed portable build. The audit makes that
boundary executable instead of relying on a setup note or a successful launch
on the source machine.

## Next round

PORT-02 builds and verifies private Python runtimes below `.runtime/python`,
vendors the packages for each workload, updates launchers, and reruns `All`
without any dependency on system Python.
