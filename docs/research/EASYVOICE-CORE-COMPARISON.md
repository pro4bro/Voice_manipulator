# EasyVoice core comparison with PRO4BRO

Inspected 2026-10-12. EasyVoice source snapshot: `XavierChuu/EasyVoice` commit `af299a5cce44c6f877047bff54496fc1a823c090` (`main`). This compares implemented source and repository-published evidence; no EasyVoice installer, real checkpoint inference, audio-quality test, or hardware benchmark was run. PRO4BRO status reflects the local ledgers dated 2026-10-10.

## Readout

EasyVoice is ahead as a focused, packaged desktop voice utility: it has source paths for F5-TTS generation/speech editing, RVC training/file/live conversion, diarization, Demucs separation, and a multitrack audio editor. Its runtime/model installer and optional model manifest are more explicit than PRO4BRO's current release scaffolding.

The checked-in evidence does **not** show that it is lighter or faster in operation, nor that its generated audio is better. Its own first-run documentation says several GB of disk and recommends NVIDIA GPU; CPU is very slow and has no supported live conversion. The downloadable model assets alone are roughly 1.96 GB for the four manifest entries marked required, with optional voice models pushing that substantially higher. Its benchmark report has no measurements filled in. PRO4BRO is broader around project provenance, OBS/live capture, reviewed timing, dataset lineage, and identity-gated publication, but several generation/training/quality gates remain incomplete.

| Dimension | EasyVoice / Evoice | PRO4BRO | Comparative reading |
|---|---|---|---|
| App shape | Electron + React desktop shell, local FastAPI engine, bundled FFmpeg, first-run Python/PyTorch runtime installer. Windows/macOS installers are documented. | Local React/TypeScript/Vite UI, FastAPI service, PowerShell-managed local runtimes; portable project folders and project-owned media/adapters. Desktop release phase remains in progress. | EasyVoice is further along as a conventional installable end-user app. PRO4BRO has a more developed portable project/workstation boundary. |
| Vietnamese TTS | F5-TTS with optional ViVoice checkpoint, sentence-wise render/re-render, text normalization, reference clips/emotion variants, and optional chained RVC. Default F5 wrapper is 32 NFE steps, 24 kHz output, per code. | TTS/generation slice and VibeVoice worker exist; product status says generation is implemented but Vietnamese quality and wider manipulator acceptance remain open. | EasyVoice exposes more turnkey TTS/editor workflow in this snapshot. Neither repo supplies a comparable blind Vietnamese quality score proving which sounds better. |
| RVC | Vendored RVC v2 40k inference and training; file conversion, live mic/device conversion, and 100/200/400 epoch presets. Live defaults to 160 ms blocks, 1.5 s context, 60 ms crossfade, and 48 kHz where supported. | RVC training and live conversion exist through engine workers/adapters; the persisted file-conversion workflow remains incomplete. Vietnamese cross-speaker CER gate currently fails/partial and loopback latency, similarity, cross-gender and owner A/B evidence remain open. | EasyVoice has a coherent end-to-end UI flow and published defaults. Its real-time/quality claims remain unmeasured in the repo; PRO4BRO documents stricter remaining acceptance gates. |
| STT and diarization | faster-whisper small checkpoint; diarization uses 1.5 s windows at 0.75 s hops, WavLM SV if downloaded, otherwise log-mel embeddings. | Faster-Whisper based finalized and live STT, project-provenanced word timing, diarization/review, OBS LiveLink capture, recovery and queued processing. Timing trust/independent human anchor checks remain open. | EasyVoice offers a compact voice editor; PRO4BRO's project/capture/review/timing pipeline is deeper. No matched WER/DER benchmark was found for either. |
| Edit / isolation | Implemented multitrack transcript editing, F5 speech retext, filler/silence handling, ducking, DSP, Demucs vocal/music separation and exports. | Audio/project processing and timeline workflows exist, with ongoing adapter-backed manipulator work; product status still lists isolation/dubbing/patching as unfinished. | Clear EasyVoice advantage for a self-contained transcript-driven audio-editing workflow in the inspected source. |
| Model/runtime management | `models.manifest.json` lists URL, approximate size, license, optionality and hashes; lazy model manager, LRU unload, GPU job queue and first-run runtime setup are implemented. Hashes are null for 17 of 18 files. | ModelStore/security/identity boundaries are defined, but product status says no ModelStore adapter is wired; packaging/model installer/updater are not started. | EasyVoice has more concrete install/model-delivery implementation. Its hashes/provenance are incomplete and its runtime is not demonstrated by a clean-machine install test here. |

## Core implementation and defaults

### TTS

`engine/easyvoice_engine/services/tts/f5_wrapper.py` wraps upstream F5-TTS. `F5Backend` defaults to `nfe_step=32`, forwards a reference audio/text, requested text, speed and seed to `infer`, and records the model's target sample rate. `services/tts/pipeline.py` splits text into sentences, persists each rendered sentence, permits a sentence redo, and joins results with configured pauses/crossfades. “Via RVC” first renders all F5 sentences, then converts them in a second pass so it does not keep loading and unloading the two model families. The wrapper also implements F5 speech editing by masking a time range in the mel and regenerating it.

The source therefore supports a usable pipeline, but the integration test `engine/tests/test_f5_integration.py` deliberately creates **random F5 and Vocos weights**, runs only when `EASYVOICE_SLOW=1`, and checks API completion/duration and array properties. It is wiring evidence, not naturalness, intelligibility, prosody, or Vietnamese quality evidence.

### RVC training, file conversion and live conversion

`services/rvc/train/config.py` specifies 40 kHz RVC v2, 100/200/400 epoch presets, and automatic batch size (CUDA: 4 below 8 GB, 6 below 12 GB, otherwise 8; MPS 4; CPU 2). Training's source README says it uses fp16 on CUDA and requires GPU for normal training. File STS uses RVC v2 + RMVPE, with chunk/crossfade processing; optional Demucs separates and remixes music.

`services/rvc/realtime.py` processes audio in blocks using context, SOLA alignment and crossfade. Presets are `low` 100 ms / 1.0 s / 40 ms, `balanced` 160 ms / 1.5 s / 60 ms, and `quality` 250 ms / 2.0 s / 80 ms. It picks a common supported device rate from 48, 44.1, 32 or 16 kHz, in that order. The API defaults to balanced and rejects CPU real-time unless an explicit test override is set. The README likewise says CPU has no real-time conversion.

`engine/tests/test_realtime.py` uses FakeIO, randomly initialized RVC/ContentVec/RMVPE assets and CPU with a 0.1x playback rate to give inference extra time. Assertions validate lifecycle, recording, device/session state and file duration, not deadline performance or audio quality. The code reports `proc_ms`, latency and underruns at runtime, but telemetry capability itself is not a measured result.

### STT, diarization and edit

`services/preprocess/asr.py` supplies Whisper transcription. `services/edit/diarize.py` uses 16 kHz speech windows of 1.5 seconds with 0.75 second hops and agglomerative cosine clustering; it uses WavLM speaker embeddings when configured, with log-mel fallback. These choices explain resource/quality tradeoffs: optional WavLM is a 378 MB manifest asset; its fallback avoids that download but the README describes it as less accurate, and there is no DER evaluation in the inspected test/benchmark evidence.

The engine README lists transcript-based retext, silence review, music ducking, diarization, Demucs separation, filters and WAV/MP3/FLAC/SRT rendering. CPU DSP is described as NumPy/SciPy; model-backed jobs use the serialized GPU job queue. These are notable scope advantages over PRO4BRO's current manipulator status, but no paired human editing task or output-quality evaluation is published.

## Resource evidence: what “lightweight” can mean here

The manifest's `size_mb` values are explicitly estimates for UI display. Summing those estimates gives:

| Assets | Approximate download from manifest | Interpretation |
|---|---:|---|
| Required entries: F5-TTS Base (1,350 MB), Vocos (54 MB), ContentVec (378 MB), RMVPE (181 MB) | **1,963 MB (~1.96 GB)** | Model files only, not Python/PyTorch runtime, cache, working files or generated audio. |
| Add Whisper small (484 + tokenizer 2 + vocabulary 0.5 MB; config negligible) | **~2.45 GB total** | ASR asset is marked optional in manifest, although engine README's first-run example includes Whisper. |
| Add RVC training initialization weights | **+216 MB** | Two pretrained RVC checkpoints. |
| Add Demucs htdemucs | **+80 MB** | Optional separation. |
| Add WavLM SV | **+378 MB** | Optional speaker embedding model; plus tiny config files. |
| Add Vietnamese ViVoice | **+5,394 MB** | Optional checkpoint, plus tiny vocab. This checkpoint includes optimizer state; code converts it to EMA safetensors on first load, so additional local disk may be used. |

These are not exact install footprints, RAM, VRAM, or peak working-set figures. README says “several GB” required and runtime setup installs Python 3.11, a selected PyTorch build, and engine dependencies under app data. The source code has model LRU unloading and a one-heavy-GPU-job queue, useful for managing contention, but no published RAM/VRAM peak or idle footprint. PRO4BRO uses separate local runtimes/adapters and currently has no finished product model manager or installer; exact apples-to-apples footprints require installing both on the same machine with the same model set and recording disk/RAM/VRAM.

The [v0.1.0 release API](https://api.github.com/repos/XavierChuu/EasyVoice/releases/tags/v0.1.0) reports a **150.6 MiB Windows installer** and approximately **136–140 MiB macOS DMGs**. These are bootstrap package sizes, not final installed footprints: Python/PyTorch and models are downloaded on first launch. PRO4BRO's [all-profile portable test bundle](../PORT-03-PORTABLE-BUNDLE.md) has a 117.60 GiB logical inventory, including multiple runtimes and model families. The two numbers describe different scopes and cannot establish a runtime-efficiency winner.

## Published performance evidence and gaps

`spikes/REPORT.md` is a blank template: machine specs and measured F5 RTF/load/VRAM, offline RVC RTF/VRAM, real-time p95/deadlines/round-trip/30-minute underruns, training durations and Go/No-go decisions are empty. `spikes/README.md` says the scripts produce result JSON under `spikes/results/`; no results directory or result JSON exists in the inspected checkout. The report's desired targets (for example F5 RTF ≤0.5 on RTX 3060 and real-time end-to-end ≤300 ms) are **targets, not measured outcomes**.

The automated tests establish API contracts and signal/file plumbing, often with fake devices, random model parameters, mock backends or CPU override. They do not establish speed on supported hardware, real-time stability, intelligibility, voice similarity, separation quality, WER/DER, or quality versus PRO4BRO. The GitHub release/installer documentation establishes packaging work exists, but this inspection did not install it or validate setup time, final footprint, hardware compatibility, signing, update or offline behavior.

## What could be called better or lighter

- **Better product coverage today:** EasyVoice, for F5 sentence-based TTS plus transcript-based speech editing, RVC/voice effects, and Demucs inside one desktop utility.
- **Better project/capture workflow:** PRO4BRO, for portable project ownership, source-to-derivative provenance, OBS capture/LiveLink, reviewed transcripts/timing, training dataset lineage and identity/publish gates.
- **Better app packaging today:** EasyVoice has a documented Electron installer and first-run runtime/model download. PRO4BRO's release phase is still in progress.
- **Provably lighter/faster or higher-quality:** **No conclusion from repository evidence.** EasyVoice's model downloads alone start near 2 GB by required manifest estimates and can grow past 8 GB with ViVoice and all listed optional models. No completed hardware measurements or matched quality benchmarks are checked in.

## Sources

All EasyVoice links are pinned to inspected commit `af299a5cce44c6f877047bff54496fc1a823c090`:

- [Main README](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/README.md), [engine README](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/README.md), [desktop packaging README](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/apps/desktop/README.md).
- [Model manifest](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/models.manifest.json), [model downloader](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/services/models.py), [model manager](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/core/model_manager.py), [device selection](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/core/device.py), [GPU job queue](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/core/job_queue.py).
- [F5 wrapper](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/services/tts/f5_wrapper.py), [TTS pipeline](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/services/tts/pipeline.py), [F5 integration test](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/tests/test_f5_integration.py).
- [RVC trainer config](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/services/rvc/train/config.py), [live RVC implementation](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/services/rvc/realtime.py), [live API](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/api/realtime.py), [live test](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/tests/test_realtime.py).
- [Diarization](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/services/edit/diarize.py), [benchmark report template](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/spikes/REPORT.md), [benchmark instructions](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/spikes/README.md).
- PRO4BRO current scope: [project status](../PROJECT-STATUS.md), [work rounds](../WORK-ROUNDS.md), and [state](../../.planning/STATE.md).
