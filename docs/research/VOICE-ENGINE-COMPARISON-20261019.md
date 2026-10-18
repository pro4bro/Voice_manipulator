# Voice engines for TTS, dubbing, and live use

Inspected 2026-10-19. Comparison is based on official repositories/docs; it is
not a local install, model-quality audition, or hardware benchmark. **An engine
is a model/API; a full dubbing product also needs translation, speaker mapping,
timing review, audio mixing and UI.**

## Comparison

| Candidate | What it does | TTS / voiceover / patch / dub | Timing | Live use and custom voice |
|---|---|---|---|---|
| **OmniVoice** | Multilingual TTS and voice cloning/design | Strong engine candidate for voiceover and per-sentence dub generation. Not a translator or complete dubbing app. Existing PRO4BRO integration uses it for voiceover/patch; Voice Dubber is still planned. | `duration` requests a fixed output duration and overrides `speed`. It fits the whole generated sentence/audio, **not individual target-word timestamps**. Post-processing can trim silence unless disabled. | No realtime voice conversion. Reference audio enables voice cloning; language/accent transfer quality must be auditioned. |
| **VibeVoice-TTS 1.5B / Large** | Long-form conversational, multi-speaker TTS; official docs describe up to 90 min and 4 speakers for 1.5B. English/Chinese examples and cross-lingual demo. | Could narrate dialogue from a prepared script, but is not translation/dubbing orchestration. Official repo currently marks its inference/usage **disabled** due misuse; not a practical production dependency today. | Long duration capacity is not exact sentence timing or word anchoring; no absolute sentence-duration API is documented for this released path. | Not live voice conversion. The official TTS code is disabled; avoid assuming a supported custom-voice workflow. |
| **VibeVoice-Realtime-0.5B** | Streaming text-in TTS, primarily English, single speaker; about 0.5B parameters. | Useful for low-latency speech output after another system supplies text. It does not itself perform ASR, translation, source-character diarization or dubbing. | Streaming chunks/long-form are not an absolute sentence-duration target and do not align output words to source words. | Low first-audio latency is hardware dependent. Voice prompts are embedded presets; arbitrary user voice prompts are not supported by the official model. Japanese/Korean and other listed extra-language behavior is explicitly experimental; not validated for production. |
| **VibeVoice-ASR / ASR-Streaming** | ASR, diarization and timestamps; full ASR supports over 50 languages; streaming variant emits transcript chunks while audio arrives. | Useful as an input analysis component. ASR does not translate or generate the translated voice; pair it with a translation model and TTS. | Source timestamps help identify speech turns/windows; they are not target-language TTS word anchors. | Streaming ASR is not voice conversion or TTS. Official benchmark/examples include Vietnamese, English, Chinese, Japanese and Korean. |
| **CosyVoice3** | 0.5B multilingual zero-shot TTS; cross-lingual voice cloning, style/emotion instructions, and text-in/audio-out streaming. | Strong TTS candidate for voiceover and sentence takes in its supported languages. It does not translate or manage an end-to-end dub. CosyVoice code also exposes a voice-conversion inference API; that alone does not establish a ready, low-latency live-microphone VC product. | Exposes speaking-speed control; in the reviewed docs we did not find an absolute target-duration or per-word time-input API. Streaming is incremental output, not timing alignment. | Official supported TTS languages include English, Chinese, Japanese and Korean; Vietnamese is not in the published list. Cross-lingual zero-shot cloning is supported; test each target language and voice. |
| **w-okada Voice Changer / RVC** | Realtime voice conversion clients/runtimes for compatible VC models. Training generally occurs in a separate trainer. | Good for changing the timbre of existing speech while retaining its content and timing broadly. It is not text-to-speech, translation or sentence-level dub generation. | It consumes audio, so timing follows the input stream; no text duration or word alignment control. | Realtime mic/system-audio workflows. Model compatibility depends on runtime edition/backend (for example CUDA/PyTorch versus ONNX); a trained model is not automatically compatible with every engine. |
| **Applio** | RVC training, file conversion and realtime VC. | Similar boundary: good for voice conversion; not a TTS translator/dubber by itself. It can be one stage after translated TTS when the target language has suitable base TTS, but quality and identity need validation. | Conversion preserves source audio timing broadly; no exact TTS duration/word timing contract. | Realtime conversion API/client exists. Check the exported model architecture/version against the intended runtime. |
| **Sokuji** | Live speech translation app with ASR → translation → TTS, desktop and browser workflows. | Closest to a live interpreted-conversation product. It can translate live conversation and speak translated output, but it is not an editor for producing a frame-accurate, per-character film dub. | Optimized for live conversational turns/subtitles, not a user-set exact duration per source sentence or target-word anchor mapping. | README describes local inference and cloud providers; its two-way mode is explicitly powered by Soniox. Do not assume the complete two-way workflow runs locally or provides arbitrary trained character voices. |

## Requested-language snapshot

`✓` means explicitly listed/documented; `experimental` means the upstream
warns that behavior is not extensively tested; `—` means not listed in the
reviewed first-party language list, not a claim that it can never produce it.

| Engine / model task | Vietnamese | English | Chinese | Japanese | Korean |
|---|---:|---:|---:|---:|---:|
| OmniVoice TTS | ✓ | ✓ | ✓ | ✓ | ✓ |
| VibeVoice-TTS 1.5B (current usable release status: disabled) | — | ✓ | ✓ | — | — |
| VibeVoice-Realtime TTS | — | ✓ (primary) | — | experimental | experimental |
| VibeVoice-ASR | ✓ | ✓ | ✓ | ✓ | ✓ |
| CosyVoice3 TTS | — | ✓ | ✓ | ✓ | ✓ |

RVC / w-okada / Applio VC depends on the selected trained model and input;
it has no fixed TTS language list. Sokuji coverage depends on the selected
local/cloud providers; its Soniox mode advertises 60+ languages.

VibeVoice-Realtime documentation advertises streaming text input but also retains
an unchecked TODO for feeding new tokens during audio generation. Validate the
specific demo/API before relying on a continuously fed text stream in a product.

## Practical recommendation

For **offline, editable voice dubbing**, build an app-level pipeline: source
ASR/diarization → reviewed sentence windows → contextual translation → map each
source speaker to a target voice → generate one sentence take per window →
measure speech and review/fix overflow → mix with retained source/music stems.
OmniVoice currently has the clearest absolute output-duration control in the
integrated candidates. CosyVoice3 is a compelling multilingual cloning/streaming
candidate where relative speed control is enough. VibeVoice-Realtime suits
low-latency TTS, not dubbing timing; VibeVoice-ASR is input recognition, not
translation. Sokuji addresses live interpreting, while w-okada/Applio address
audio-to-audio voice conversion.

No single listed engine supplies exact translated word-to-word timing. A fixed
sentence duration is distinct from word alignment and lip-sync. The product
must measure alignment on the **generated target audio**, and treat translation
word mapping as uncertain because languages reorder and rephrase content.

Model weights are **not interchangeable** across OmniVoice, CosyVoice, VibeVoice,
and RVC families. Only a model expressly trained for an engine/runtime with a
compatible architecture and format can be loaded there. RVC-family compatibility
also depends on the specific version and inference backend.

## Primary sources

- [OmniVoice generation parameters](https://github.com/k2-fsa/OmniVoice/blob/master/docs/generation-parameters.md) — duration/speed.
- [OmniVoice README](https://github.com/k2-fsa/OmniVoice) — languages and voice modes.
- [Microsoft VibeVoice README](https://github.com/microsoft/VibeVoice) — model-family release/disabled status and capabilities.
- [VibeVoice long-form TTS docs](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-tts.md) — 1.5B features and disabled usage.
- [VibeVoice Realtime docs](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-realtime-0.5b.md) — streaming, language caveat, single speaker and embedded prompts.
- [VibeVoice ASR docs](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-asr.md) and [streaming ASR docs](https://github.com/microsoft/VibeVoice/blob/main/docs/vibevoice-asr-streaming.md) — languages, diarization, timestamps and streaming.
- [Official CosyVoice repository](https://github.com/QwenAudio/CosyVoice) — CosyVoice3 languages, cross-lingual cloning, streaming and instructions; [VC API implementation](https://github.com/QwenAudio/CosyVoice/blob/main/cosyvoice/cli/cosyvoice.py).
- [w-okada voice changer repository](https://github.com/w-okada/voice-changer) and [RVC tutorial](https://github.com/w-okada/voice-changer/blob/master/tutorials/tutorial_rvc_en_latest.md) — realtime conversion and model separation.
- [Applio repository](https://github.com/IAHispano/Applio) and [realtime audio path](https://github.com/IAHispano/Applio/blob/main/rvc/realtime/audio.py) — RVC inference/realtime conversion.
- [Sokuji README](https://github.com/kizuna-ai-lab/sokuji/blob/main/README.md) — live translation pipeline and provider modes.
