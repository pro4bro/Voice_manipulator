# Portable Windows Runtime

## Release contract

A Pro4Bro test bundle is self-contained at the application layer when all of
these live below the application folder:

- built React application;
- API, STT, diarization, training, RVC, and live voice-change Python runtimes;
- FFmpeg and FFprobe;
- OBS bridge DLL and its configuration template;
- OmniVoice, VibeVoice, and Applio source used by adapters;
- Final STT, diarization, training, tokenizer, and generator model weights.

The bundle still requires 64-bit Windows, a compatible OBS installation for OBS
capture, audio-device drivers, and a compatible NVIDIA driver for CUDA jobs.
Those are operating-system or host-application components and are checked on the
test machine rather than stored as Python packages in the app folder.

## Gate

Run from the application root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-portable-runtime.ps1 -Profile All
```

For machine-readable evidence:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-portable-runtime.ps1 `
  -Profile All -Json -OutputPath data\runtime\portable-audit.json
```

The command exits with code 1 if a required file is missing, a runtime still
points to Python outside the application folder, or a required import fails.
Profiles `Core`, `Capture`, `STT`, and `Training` can isolate one part during
preparation. `All` is the distribution gate.

To copy the current machine's VibeVoice models and research-engine source into
the distribution tree without copying their old environments or caches:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\localize-engine-assets.ps1
```

The optional `-VibeVoiceSource` and `-ResearchEnginesSource` arguments accept
explicit source folders. The command only adds or updates files; it does not
delete the source or destination.

To build every private Python runtime from the prepared build-machine
environments:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-portable-python-runtimes.ps1 -Profiles All
```

The script downloads the official CPython 3.11.9 Windows embedded distribution,
requires SHA-256
`33B448F95FECB7C6F802157DBD5E6B40A2AD9BFC8B95CA634A06BA4073AD1AC0`,
vendors each workload's packages with same-volume hardlinks, writes relative
search paths, verifies imports, and writes `.runtime/python/runtime-manifest.json`.
Hardlinks avoid duplicating package bytes on the build machine. A normal bundle
copy materializes usable files at the destination.

To assemble a transfer folder on the build drive without allocating a second
copy of all model weights:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-portable-bundle.ps1
```

Use `-Mode Copy -OutputRoot <empty-folder>` to write independent files directly
to another drive. The builder refuses an existing destination, supports long
PyTorch paths, writes `.portable-bundle.json`, and retains
`.bundle-incomplete` after an interrupted build. A completed folder includes
`VERIFY-PORTABLE.bat`, `INSTALL-OBS-PLUGIN.bat`, and `PORTABLE-README.md`.

Passing on the development machine is necessary but insufficient. Before an
external test, copy the complete folder to a different absolute path on a clean
Windows machine and run the same `All` gate there. Then start the app, connect
OBS, record one mic and one meeting-application source, stop, and run Final STT.

## Current preparation state

PORT-01 localized engine/model assets and established the gate. PORT-02 built
six private runtimes (`core`, `stt`, `omnivoice-training`,
`vibevoice-training`, `rvc`, and `voice-changer`), switched launcher/adapters to
them, and reached 20 passes / 0 failures on the `All` audit. API and Studio were
also started through the private interpreters, and Whisper large-v3 loaded on
CUDA in float16.

PORT-03A assembled a 128,574-file, 117.60 GiB logical bundle without
build-machine environments and passed 25/25 checks plus API/STT startup from a
different absolute path. PORT-03B remains the physical-copy and OBS recording
gate on another Windows machine. See `docs/PORT-03-PORTABLE-BUNDLE.md`.

Runtime and model folders remain ignored by Git. They belong in the release
bundle or local preparation cache, not in source control.
