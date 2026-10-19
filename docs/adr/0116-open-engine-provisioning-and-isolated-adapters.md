# 0116 — Open engine provisioning and isolated adapters

Date: 2026-10-19. Scope: round59, OPEN-ENGINE-CONNECT-01.

The owner explicitly authorized downloading the repositories and models needed
for subsequent engine slices and exposing compatible choices in each function.
This extends ADR0115. Installation, adapter availability and acceptance of an
entire live/dub workflow remain separate facts.

Keep engine checkouts, Python environments and base models under ignored
`.runtime/`. Reuse the existing Applio snapshot without asserting an unknown Git
origin. Record verified origins/revisions for Git checkouts. Model provisioning
uses pinned Hugging Face revisions, verifies LFS SHA256 or Git blob SHA1,
preserves resumable partials with their identity, and publishes files only after
verification. A model-local receipt records the verified files and their stat
identity; CosyVoice rejects a missing/stale receipt or a mismatched base model.
The machine-wide receipt is `.runtime/open-engines-install.json`.

CosyVoice uses its own Python environment because its Torch/dependency versions
differ from the existing OmniVoice/VibeVoice runtimes. Product code calls its
official reference/instruction APIs through an `EngineWorkerProcess`, preserving
the existing GPU lease, cancellation and project Voice Output path. Required
audio must exist before publication. No upstream source is edited. Selecting an
engine filters compatible voices and blocks assigned rows from another family;
switching engines does not rewrite those assignments. Cross-language/zero-shot
speech follows the Script text. Language/delivery instruction controls appear
only for instruct mode. Speed does not imply native absolute duration.

Readiness and setup share a configuration import probe which includes Matcha,
flow matching and the dataset/HiFiGAN modules referenced by the pinned model
YAML. Importing AutoModel alone does not establish these dependencies. The probe
loads no weights; real synthesis and acoustic acceptance remain separate checks.

Merge shipped and local catalog descriptors before filtering by task, then check
readiness only for matching providers. Resolving an individual ID checks only
that provider. A slow optional native import must not block unrelated function
catalogs or the existing OmniVoice path; local descriptor overrides retain their
precedence even when they change the tasks supported by an ID.

The separate VibeVoice streaming checkout exposes a bounded PCM WebSocket
session through a product worker. It explicitly imports that checkout rather
than the legacy package in the embedded runtime. One session holds the shared
GPU lease through startup, inference and cleanup. Partial/final text retains
upstream speaker markup; it does not create acoustic word timestamps or assign
Speaker Profiles. Checkpoint-supported languages omit Vietnamese.

Sokuji uses an isolated local sidecar and a restricted inspection bridge. The
user explicitly connects it in Live Translate, then chooses from its real model
catalog. These controls do not claim a complete microphone → translation → TTS
pipeline. w-okada remains a disabled compatible choice until its Python3.10
runtime, adapter and real audio pass their gates. The Python3.10 import-only gate
now passes using the official requirements, pyworld and the complete pinned
Fairseq0.12.2 checkout. Its PyPI source archive omitted a required C++ file, so
setup builds the unmodified Git tag and validates its commit before installation.
Adapter/model/device/audio gates remain open. Keep existing RVC/Applio usable.

Public additions:

- `GET /api/open-engines/sokuji/health` reads status without starting a process.
- `POST /api/open-engines/sokuji/start` and `/stop` own only the product sidecar.
- `GET /api/open-engines/sokuji/catalog?kind=asr|translate|tts` requires it running.
- `GET /api/stt/vibevoice-streaming/status` reports local prerequisites.
- WebSocket `/api/stt/vibevoice-streaming`: send JSON `start` with the reported
  `sampleRate`, wait for `ready`, send little-endian float32 mono PCM in frames
  of at most one second, then JSON `end`. Responses are `partial`, `final`, or
  `error`. A new session requires fresh startup; disconnect does not promise
  continuation of a prior model state.

Alternatives: installing every engine into the existing Python environment
would risk working runtimes; enabling an entire function from an upstream demo
would overstate product readiness. Separate adapters and explicit unavailable
reasons preserve those boundaries. Direct single-voice output metadata still
does not store the computed artifact fingerprint; its engine/voice/settings are
retained, while stronger immutable revision receipts remain a follow-up.

Sources: [CosyVoice](https://github.com/QwenAudio/CosyVoice),
[CosyVoice3 checkpoint](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512),
[streaming ASR guide](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-asr-streaming.md),
[streaming checkpoint](https://huggingface.co/microsoft/VibeVoice-ASR-Streaming-7B),
[Sokuji](https://github.com/kizuna-ai-lab/sokuji), and
[w-okada](https://github.com/w-okada/voice-changer).
