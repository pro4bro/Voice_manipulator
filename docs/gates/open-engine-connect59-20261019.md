# Round59 — OPEN-ENGINE-CONNECT-01

Date: 2026-10-19. Baseline: `982faa8` (ENGINE-CATALOG-01).
Owner authorization: download missing planned repos/models, connect compatible
providers and expose their choices by function. This is one integration round;
the separate acoustic and complete live/dub acceptance gates remain open.

## Provisioned sources

| Repository | Local path | Verified revision |
| --- | --- | --- |
| CosyVoice | `.runtime/engines/research/CosyVoice` | `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc` |
| Sokuji | `.runtime/engines/research/sokuji` | `9e789375ed59f45f65f1af9d5daf46bcb16687a2` |
| w-okada | `.runtime/engines/research/w-okada-voice-changer` | `d8ef15799470193f7c8176ef471245753a656626` |
| VibeVoice streaming | `.runtime/engines/vibevoice/VibeVoice-streaming` | `16fb2cb1217c9934a886e1948ffb06120caa2df5` |
| Fairseq (w-okada dependency) | `.runtime/engines/research/fairseq-w-okada` | `4a388e64cd646ed7d7ad8de8fae55df2b8eea91d` (`v0.12.2`) |
| Applio | existing `.runtime/engines/research/Applio` | Packaged snapshot, origin unverified; three entrypoint/license hashes recorded |

CosyVoice Matcha-TTS submodule is initialized. Existing `engines/OmniVoice`,
RVC/Applio runtime, source media and saved user projects were not edited.

Pinned models:

- `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` at
  `29e01c4e8d000f4bcd70751be16fa94bf3d85a18`: 14 inference files verified.
- `microsoft/VibeVoice-ASR-Streaming-7B` at
  `60d858b518b4e19d404af3737f848fc185b30177`: 17 files verified.

Verified payload sizes are5,427,029,152 and17,359,814,972 bytes respectively
(22,786,844,124 bytes combined). Both model-local receipts and the machine-wide
receipt are present. A truncated shard3 was rejected, downloaded again through
eight exact byte ranges in a scratch recovery helper, assembled, and verified
against SHA256 `eeeb0c24e4a3746f16512c0d4aef84732bf8bb4dc5452782e4db356eb5fc7ce7`.
The final normal provisioner run reverified all17 files and wrote the receipt.

## Installation and connection

Run from the repository root with the development Python interpreter:

```powershell
.venv/Scripts/python.exe scripts/provision-open-engines.py --repos-only
.venv/Scripts/python.exe scripts/provision-open-engines.py --model all --download-workers 3
./scripts/setup-cosyvoice-runtime.ps1
./scripts/setup-sokuji-runtime.ps1
./scripts/setup-w-okada-runtime.ps1 -Install
```

The downloader allows 1–8 concurrent files, defaults to3, and checks final hashes
even after resuming. Runtime setup and downloads are explicit operations; opening
a tab does not trigger them. Runtimes and base-model files remain outside Git.

CosyVoice runtime installed Torch/Torchaudio2.3.1 CUDA12.1 in its private venv;
actual `AutoModel`/DiT imports passed. Whisper's released build needed
setuptools75.8.2 and `--no-build-isolation`; the setup script records that fix.
Sokuji sidecar/native1.2.0 imports and real start/ping/catalog/stop passed; its
translation catalog returned11 entries. Full translation inference is not wired.

w-okada official pins failed a Python3.11 dry run at ORT-GPU1.13.1. The upstream
guide requests Python3.10; that separate `.venv-py310` was subsequently created
with3.10.9 and its official direct requirements preflight and install succeeded.
Native RVC imports then exposed omitted `fairseq` and `pyworld` dependencies.
Fairseq0.12.2's PyPI source archive failed C++ compilation because
`fairseq/clib/libbase/balanced_assignment.cpp` was missing. The complete official
tag contains that file; building its pinned checkout with Cython0.29.37 and
wheel0.48.0 succeeded without editing source. Local wheel SHA256:
`fd9cf3d1026b9e02604b042834fa49743762e32b9c92201d37be6a0cedc449f0`
on the final versioned setup rerun.
Added pyworld0.3.4; server/RVC import-only probe then passed with Torch2.0.1+cpu,
Torchaudio2.0.2+cpu, ORT1.13.1, FAISS1.7.3, FastAPI0.95.1, Uvicorn0.21.1.
The setup script now records these exact steps and refuses a mismatched or
tracked-dirty Fairseq checkout. It does not reset existing sources. No server,
audio device, conversion model or audio inference is accepted by this import
check, so the w-okada product choice remains pending its adapter/audio gates.
Final `setup-w-okada-runtime.ps1 -Install` completed with exit0 and its server/
RVC import probe passed; this includes the source build and prerequisite checks.

## Product slice

- CosyVoice reference cloning is offered in Voice Training; generation routes
  its voices through the CosyVoice worker with private weights and existing
  project provenance/cancellation/GPU ownership.
- Voice Over has an actual engine selector. Incompatible Script assignments
  block dispatch and remain intact. VO/VP list CosyVoice; VD/LT list their pending
  providers; VI lists the existing Demucs source as pending; Voice Changer lists
  w-okada as pending alongside existing RVC.
- Sokuji connection in LT reads the real runtime model catalog and exposes a
  model selector with a visible inspection-only limit.
- Streaming ASR has a distinct PCM endpoint/worker with partial/final events,
  bounded sessions, disconnect cleanup and no fabricated word timing.
- Actual narrow-window browser inspection found the generic project-rail CSS
  hiding the function tabs. More specific responsive CSS restores the tabs.

## Validation evidence

Initial focused checks: CosyVoice7, Sokuji6, streaming12 and provisioning18
passed. The initial real embedded-runtime check imported the streaming checkout's
module path without loading weights. After receipt/recovery fixes, CosyVoice and
provisioning32 tests passed. Two catalog fixtures were corrected to isolate their
engine roots from installed machine state, then both passed. No assertion was
removed or timeout increased. The streaming worker uses `torch_dtype` because
the installed Transformers4.51.3 does not consume the newer `dtype` keyword.
Final catalog filtering checks:28pass/14.03s with2 existing warnings. Readiness
is evaluated after task filtering and descriptor overrides; individual ID lookup
does not import unrelated optional engines.

Final changed-UI checks:17pass/2files. Final full frontend:1118pass/136files in
324.88s with `npm test -- --maxWorkers=1 --bail=1`. Typecheck and build191 pass.
The first final full run reported a Timeline failure and was stopped for
reproduction; that case passed alone and its entire64-case file passed unchanged.
The passing serial full run is recorded in
`.scratch/round59-web-final-serial.log`.

Initial full API run:1183pass/13fail/3warnings,2195.06s. Exact failed-case retry:
11pass/2fail/2warnings,114.59s. At that point the remaining failures were controller startup before
its test deadline and the embedded streaming-module import exceeding60s.
The new receipt/provisioning cases were added after full-suite collection and
were covered by the32-case focused run before final revalidation.

After stopping the owned scratch preview, the same two-case rerun still failed
in70.47s. A standalone controller reproduction then passed in0.765s, and its
unchanged pytest case passed in1.48s with diagnostic stack sampling enabled;
this is recovery evidence, not a proven root-cause fix. Streaming import stack
samples at12/24/36s show Transformers4.51.3 opening model source files in
`create_import_structure_from_path`, progressing from `idefics3` to
`omdet_turbo` to `swiftformer`. The checkout path was configured in0.032s;
no model weights were loaded by that diagnostic. Its45s outer bound expired.
Those two unchanged tests subsequently passed together in44.53s after available
RAM recovered to~46GB. No test deadline or assertion was relaxed.

Final full backend gate on the integrated code:
`.venv/Scripts/python.exe -m pytest services/api/tests -q --tb=short`:
**1207 passed,3 warnings in737.89s (12m17s)**. Log:
`.scratch/round59-api-final.log`. The existing Starlette/httpx and `audioop`
deprecations plus the deliberate duplicate-ZIP-entry fixture warning remain.
Frontend/typecheck/build, backend and diff checks are green. This closes this
round's code/test gate; provider quality and complete workflow acceptance below
remain separate.

At11:57 local, only~1.7GB RAM was available while user AfterFX occupied~36.6GB;
later its working set reached~42.6GB. A CosyVoice worker thread was observed in
Windows `PageIn` wait. Worker-start failures also occurred with fork, thread and
detached test launches. These observations document host pressure; they do not
establish a single root cause for every failure. User processes were untouched.

CosyVoice API attempts returned409 after the45s import check, including after
available RAM rose to~12GB. A direct product-worker probe also exceeded its
600s reply budget (610.969s including cleanup). It released its GPU lease and
produced no accepted WAV. Real inference, acoustic checks and TTS acceptance
were still open at that point.

After resource recovery, the actual worker progressed and exposed missing YAML
configuration dependencies: Matcha imports `gdown`, `wget` and `matplotlib`;
the configured dataset processor imports `pyarrow` and `pyworld`. Added their
official upstream pins and a shared weight-free configuration import probe used
by setup and catalog readiness. A regression first reproduced the false-ready
case where AutoModel/DiT imported but flow matching did not, then passed with the
new probe. Final CosyVoice/provisioning focused suite:33pass/2.12s. Independent
read-only review found no concrete defect in these changes.
The final real readiness check returned `available:true` in20.125s with a valid
model receipt and all configuration imports, within the unchanged45s budget.

The corrected real cross-language worker produced
`.scratch/engine-connect59/cosyvoice-smoke-deps-fixed.wav`:5.88s,24000Hz,mono,
FLOAT32 WAV,141120 samples,564560 bytes. All samples are finite; peak0.600304,
RMS0.0528912, no sample at/above full scale; first/last samples are0.000001829
and-0.000213197. SHA256:
`b3a8b347a31bbee396f026ad66b8422fa1fc51a94805aaffeb378ab99b9a44b1`.
Worker synthesis/load time87.09s; total probe102.906s including shutdown. Its
production GPU lease was released and no worker remained active. A scratch-only
stderr tee hit a CP1252 encoding exception while printing a progress bar after
synthesis; the product worker returned success and the resulting WAV was
independently checked with ffprobe and NumPy. This proves native synthesis and
basic signal integrity, not identity/intelligibility or multilingual quality.
Windows ONNX speech-token extraction fell back to its installed CPU provider;
Torch synthesis used CUDA. Text frontend was disabled deliberately in the worker.
Upstream reported synthesis RTF3.102 for this single cold session; no live latency
or sustained real-time throughput acceptance follows from the WAV result.

Browser uses an isolated scratch project and the real product API/catalog. Only
the controller startup status is a fixture so this scratch API can open the UI;
it is not evidence of a running Studio service. No user project was modified.
Actual browser selection changed Voice Dub between OmniVoice and CosyVoice and
retained the explicit unavailable state. Screenshot:
`.scratch/round59-provider-choice.png`. Responsive function tabs are visible.

Logs: `.scratch/download-cosyvoice.out.log`,
`.scratch/cosyvoice59-receipt.out.log`, `.scratch/streaming59-receipt.out.log`,
`.scratch/streaming59-shard-retry.out.log`, `.scratch/round59-api-tests.log`,
`.scratch/round59-api-retry.log`, `.scratch/round59-web-tests.log`,
`.scratch/round59-timeline-repro.log`, `.scratch/round59-timeline-file.log`,
`.scratch/round59-startup-final.log`, `.scratch/round59-controller-stack.log`,
`.scratch/round59-controller-pytest-stack.log`,
`.scratch/round59-stream-import-stack.log`,
`.scratch/cosyvoice59-smoke-first.json`, `.scratch/cosyvoice59-smoke.json`,
and `.scratch/cosyvoice59-worker-result.json`. Runtime w-okada investigation is
under `.scratch/w-okada59/`. Read-only reviews found no concrete frontend
dispatch/cancellation issue; CosyVoice review findings about instructions and
base identity were fixed. Direct output fingerprint persistence remains open.

Recovery logs/artifacts: `.scratch/round59-startup-recovered.log`,
`.scratch/round59-cosy-provision-final.log`, `.scratch/cosyvoice59-yaml-deps.log`,
`.scratch/cosyvoice59-matplotlib.log`, `.scratch/cosyvoice59-import-full-fixed.log`,
`.scratch/cosyvoice59-worker-retry-result.json`,
`.scratch/cosyvoice59-worker-deps-fixed-result.json`,
`.scratch/cosyvoice59-worker-deps-fixed.log`, `.scratch/cosyvoice59-audio-qc.json`.
Final readiness: `.scratch/cosyvoice59-readiness-final.json`. w-okada logs:
`.scratch/w-okada59/python310-setup.log`, `fairseq-install.log`,
`fairseq-source-install.log`, `native-import-final.log` and `setup-final.log`.
Fairseq sources: [official installation guide](https://github.com/facebookresearch/fairseq#requirements-and-installation),
[release0.12.2](https://pypi.org/project/fairseq/0.12.2/) and the
[complete tagged source file](https://github.com/facebookresearch/fairseq/blob/v0.12.2/fairseq/clib/libbase/balanced_assignment.cpp).

## Remaining acceptance

STT-VIBE-01 five-language benchmark, streaming recognition/reconnect/device
latency, CosyVoice acoustic/identity/cross-language/delivery checks, live Cosy
VC, complete Sokuji translation, w-okada conversion, dubbing and live routing
retain their separate gates. CosyVoice and this streaming ASR checkpoint do not
advertise Vietnamese support. Phase03 remains60%. No portable release issued.
