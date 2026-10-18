# Open engine workflows — owner direction, 2026-10-19

## Accepted direction

PRO4BRO owns the workflow, Script, Timeline, media provenance, jobs and review.
OmniVoice remains the primary/default generation family. Compatible repositories
are additional choices by capability, not replacements for the workspace.
Do not present a TTS engine, a converter and a translation application as identical
processors. Expose every compatible capability through its product-owned adapter.

The owner authorized this direction and the integrations below. They need bounded
implementation rounds and measured artifacts; they are not waiting for approval.
Round57 implements the shared workspace layout, not these new engine integrations.

## Integration slices

| Slice | Work | Acceptance before enabling the choice |
| --- | --- | --- |
| ENGINE-CATALOG-01 | Per-task provider catalog: supported languages, custom-voice format, streaming input/output, native duration, word timing, availability and reason unavailable | Choices reflect the actual installed adapter/model; selected provider reaches the real job, with no silent fallback |
| STT-VIBE-01 | VibeVoice-ASR alongside Whisper in the existing import/transcribe workflow | Same project assets, queue, progress, cancellation, retry and transcript revisions; retain diarization speaker labels separately from user Speaker Profiles; benchmark Việt/Anh/Trung/Nhật/Hàn |
| STT-VIBE-STREAM-01 | Separate streaming ASR adapter using the appropriate VibeVoice variant | Mark partial/final results, stable speaker identities where supported, reconnect/backpressure; test supported languages for this variant separately; segment timestamps must not masquerade as acoustic word timestamps |
| TTS-COSY-01 | CosyVoice generation, reference cloning, cross-language cloning and supported delivery controls; expose training/VC only where that adapter is verified | Real output WAVs, language and voice checks, cancellation, provenance; native absolute duration must not be advertised from speed control |
| LIVE-COSY-01 | Streaming text/audio and an evaluation of its VC API as separate capabilities | Sustained device-to-device latency, interruption, buffer bounds and voice quality; a streaming API alone is not proof of a live microphone workflow |
| TRANSLATE-SOKUJI-01 | Connect supported Sokuji local/provider workflows, translated speech, subtitles, mic/system capture and virtual-microphone routing | Verify each supported direction, language and custom-voice path; distinguish local/cloud, prerequisites, costs and provider-specific options; adapter availability/terms checked before distribution |
| VC-PROVIDERS-01 | Keep RVC/Applio; evaluate w-okada compatible runtimes/models as user choices; assess further compatible providers separately | Hardware calibration, source/target model compatibility, intelligibility, identity, Mute/Solo/routing, latency and session ownership; no inference success without audio |
| DUB-PROVIDERS-01 | Integrate OmniVoice/CosyVoice synthesis and compatible Sokuji translation workflows into the existing dub plan | Source analysis, cast mapping, contextual translation, sentence budget, generated-speech measurement, retained source/background, review and resumed jobs; no provider silently ignores unsupported duration/emotion |
| LIVE-TRANSLATE-01 | Build ASR → translation → selected TTS/provider with independent incoming/outgoing routes | End-to-end latency, no echo loops, interruption, growing queue limits, offline/network recovery and explicit original-voice bypass |

Keep existing quality gates and unresolved acoustic timing checks. Follow each
engine's actual supported languages and model rights; benchmark quality rather
than equating a README feature with product readiness. No automatic downloading,
credential setup or migration of model weights is implied by choosing a tab.

## Shared workspace and results

- Vertical function tabs at the page's left edge: VO Voice Over, VP Voice Patch,
  VD Voice Dub, VI Voice Isolator, LT Live Translate. Voice Changer keeps its
  existing dedicated page; compatible live providers are selected there.
- Script, Timeline, waveform and current output remain the same workspace while
  switching function. Function-specific controls occupy the right column.
- Structure/delivery/duration/reference timing settings belong in the right column,
  sharing the Script's actual selection/document rather than a copied draft.
- Result prefixes belong to the operation which produced the result, independent
  of the currently selected tab. Round57 labels existing VO/VP results using real
  provenance without renaming saved files. New VD/VI/LT processors must emit their
  own provenance and matching prefix in display names and new exported filenames.
- Existing saved projects and audio must not be renamed as a side effect of opening
  a new app. Model weights stay specific to the engine/version; reuse source
  recordings where appropriate, not incompatible trained checkpoints.

Research context: [engine comparison](research/VOICE-ENGINE-COMPARISON-20261019.md),
[dub timing](research/VOICE-DUB-TIMING-20261018.md), and
[live translation](REALTIME-TRANSLATION-RESEARCH.md). These are research notes,
not evidence that the integrations have passed their artifact/hardware gates.
