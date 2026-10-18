# Cross-language Voice Dub: sentence timing feasibility

Inspected 2026-10-18 against the current first-party repositories. This is a
design note, not an implementation or an audio-quality benchmark.

## Finding

Yes. A translated dub can be generated sentence by sentence and fitted to the
source sentence windows. This is feasible now as an application pipeline, but
model duration control does not by itself align translated words to the source
words or synchronize mouth motion. Translation changes word order, syllable
count and phrasing, so source word timestamps cannot simply be copied to target
words.

**Current PRO4BRO status:** Voice Dubber is still a planned mode, not a complete
workflow. The existing OmniVoice duration foundation is used by voiceover and
patch paths. It disables silence post-processing and accepts at most 60 ms of
token-frame correction using literal zero samples; it rejects an over-budget
result containing audible samples instead of cutting speech. Published audio is
marked `needs-listening` and `speechVerified: false`. This is useful groundwork
for sentence dubbing, but it does not yet provide translation, speaker/dialogue
orchestration, target-word alignment, or a complete dubbing review flow.

## What the upstream models actually expose

| Engine | First-party capability | Implication for dubbing |
|---|---|---|
| **OmniVoice** | `duration` requests a fixed generated-output duration in seconds and overrides `speed`; the API accepts per-item durations in batch use. Default output post-processing may trim trailing silence and make the result slightly shorter; disabling `postprocess_output` preserves requested duration. | Best documented fit for a sentence-specific duration budget among these candidates. It controls the generated span as a whole, not each target word's onset/end. |
| **IndexTTS-2.5** | Released `duration_factor` controls relative speaking duration/speed in the range 0.5–2.0. The upstream README states IndexTTS-2 introduced precise synthesis duration internally, but says the capability was not enabled in that release. A later upstream PR proposing absolute `target_duration` for IndexTTS-2/2.5 is still **Open**, not a released capability. | Current released interface gives rate scaling, not a documented absolute sentence-duration request. Do not plan around the open PR until it is merged and released. |
| **F5-TTS** | `fix_duration` sets the total duration including the reference prompt and generated speech; the internal target is converted to mel-frame count. Automatic chunking and prompt duration affect the budget. | To target generated speech duration `D`, request total `D + prompt_duration` (and account for cross-fades/chunking). It is less direct than an output-only duration contract; validate each generated file. |

## Suggested production flow

1. **Analyze the source:** transcribe with word timestamps, detect speakers, and
   keep each source sentence's start/end plus timing confidence. Treat uncertain
   boundaries as review items; do not extend a subtitle over silence just to
   fill its cue.
2. **Translate in sentence context:** retain the source sentence, translated
   sentence, speaker, emotion/delivery notes, and the original time window
   together. Allow the user to edit translation and choose a concise alternative
   when it cannot be spoken naturally in the available window.
3. **Set a duration budget:** for each sentence, reserve its start and end as an
   envelope and separately represent any desired pauses. The speech budget is
   the envelope minus reserved leading/trailing gaps. Do not let one sentence's
   fit move later source dialogue automatically.
4. **Generate per speaker and sentence:** use that character's selected voice,
   target language, emotion/delivery, and sentence budget. OmniVoice is the
   strongest first candidate for absolute duration control; IndexTTS-2.5 is a
   candidate when relative speed control is sufficient. Keep each sentence as
   its own take so it can be regenerated without changing accepted sentences.
5. **Measure and fit:** measure actual speech onset/offset, not only WAV file
   length. If it overflows, suggest a shorter translation or bounded rate
   adjustment, then re-render. Use pitch-preserving time stretch only as a
   user-visible final correction with a quality warning; do not silently force
   extreme rates. Place silence/gaps on the timeline as editable intervals.
6. **Review the assembled dub:** audition sentence transitions, speaker
   identity, emotion, pronunciation, overlap and scene-level pacing. Preserve
   the original voice as a separate stem for optional ducking/mixing.

## Timing levels and realistic guarantees

- **Sentence window:** achievable as a duration target with OmniVoice, and
  through constrained generation plus correction in other engines. The actual
  speech may not occupy every millisecond of the cue because silence belongs in
  separate timeline gaps.
- **Word timing:** generated speech still needs target-language forced
  alignment or manual correction after synthesis. Translation has no guaranteed
  one-to-one word mapping to source timestamps. Word timing should be treated as
  measured output, not inferred by dividing the sentence duration evenly.
- **Lip synchronization:** matching the source sentence window is not
  lip-sync. Precise mouth/viseme synchronization requires target-language
  phoneme/viseme alignment and likely a separate retiming/visual pass.
- **Naturalness:** exact duration and natural prosody can conflict, especially
  for a much longer translation. Re-translation, rate constraints and
  re-generation provide better quality control than extreme stretching, but
  this requires a human review gate.

## Product recommendation

Model the dub as a set of sentence takes, each linked to its source interval and
carrying editable target text, speaker, emotion, target duration, measured
speech onset/offset, fit status and provenance. Keep source word timing, target
word alignment and sentence duration budget as distinct data. Offer a
sentence-level “Fit to source duration” action and an explicit “review timing”
state when speech still overruns; do not claim automatic word-perfect timing.

For the initial dub slice, reuse the native OmniVoice duration request and
existing strict fit policy, one source sentence per take. Add translation and
speaker mapping around it, and keep target alignment as a separate later
measurement. The project still lacks accepted acoustic source-word anchors, so
sentence windows need timing confidence and an explicit review path.

## First-party sources

- OmniVoice generation duration, speed, post-processing and long-form chunking:
  [generation parameters](https://github.com/k2-fsa/OmniVoice/blob/master/docs/generation-parameters.md),
  [inference CLI](https://github.com/k2-fsa/OmniVoice/blob/master/omnivoice/cli/infer.py).
- IndexTTS release state, language support, IndexTTS-2 duration note, and
  IndexTTS-2.5 `duration_factor`:
  [official IndexTTS repository README](https://github.com/index-tts/index-tts).
- IndexTTS absolute-duration API proposal, explicitly still open when inspected:
  [PR #793](https://github.com/index-tts/index-tts/pull/793).
- F5-TTS `fix_duration` and `speed` API parameters:
  [official API source](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/api.py),
  [official inference implementation](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/utils_infer.py),
  [CLI option description](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/infer_cli.py).
- Current product boundaries and implementation: [workspace mode manifest](../../apps/web/src/pages/workspaceManifest.ts),
  [OmniVoice duration fitting](../../services/api/app/adapters/duration_fitting.py),
  [ADR 0077](../adr/0077-reference-resolution-and-sample-duration-budgets.md),
  [ADR 0084](../adr/0084-source-duration-patch-generation.md).
