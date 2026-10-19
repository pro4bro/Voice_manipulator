# 0115 — Task provider catalog and model readiness

Date: 2026-10-19. Scope: round58, ENGINE-CATALOG-01.

Provider capability and machine readiness are different facts. The existing
training-model descriptor contract gains `tasks` and `capabilities`; `available`
continues to mean this installation has a runnable product adapter. The new
`GET /api/engine-catalog?task=...` is an additive view over the same STT,
generation and live-conversion options used by jobs. Planned streaming ASR and
CosyVoice options are explicit disabled descriptors. Voice Dub has a disabled
OmniVoice option because sentence generation alone is not a dub processor.

Whisper exposes one descriptor with several weights. `modelStatus` reports each
installed snapshot separately; an entrypoint without the selected model's
`config.json` and nonempty `model.bin` is not enough to enqueue a job. VibeVoice
ASR checks its checkpoint shards, tokenizer and Python packages. The STT queue
rejects unknown/unavailable model IDs and ASR adapter IDs before changing any
asset state. The media processor also rejects an unknown model so an internal
caller cannot silently fall through to Studio. Existing project files and
transcript formats do not change.

VibeVoice-ASR's per-segment speaker label remains `asrSpeakerId`, distinct from
`diarizationSpeakerId` and user-owned `speakerId`. Script groups by that raw
label only when no explicit Profile/manual diarization assignment exists.
Character-distributed word intervals remain `timingTrusted=false`; the catalog
reports segment timing and does not advertise acoustic word timing.

The catalog lists [VibeVoice ASR](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-asr.md),
[VibeVoice streaming ASR](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-asr-streaming.md)
and [CosyVoice3](https://github.com/FunAudioLLM/CosyVoice) capabilities as
upstream claims. Actual availability comes from local adapters and artifacts.
Generation speed and streaming output do not imply native absolute duration or
an operational device-to-device workflow. Real audio, language quality and live
latency remain separate acceptance gates in OPEN-ENGINE-WORKFLOW-PLAN.md.
