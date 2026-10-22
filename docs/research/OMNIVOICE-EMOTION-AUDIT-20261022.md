# OmniVoice emotion and vocal loudness audit — 2026-10-22

## Question and conclusion

Can the current or newest OmniVoice train a speaker voice across emotion and
vocal loudness, then control those qualities at generation time?

**Not as a documented, end-to-end, independently controllable feature.** The
engine can fine-tune on audio/text examples and has a generic `instruct`
conditioning path. Its documented voice-design vocabulary includes whisper and
pitch, but not emotion classes such as happy/angry/sad, loud/quiet, or a
per-utterance loudness value. Training examples may carry an `instruct` string,
but only if instruction conditioning is enabled; Pro4Bro's OmniVoice fine-tune
recipes set its ratio to `0`, and Pro4Bro generation does not send `instruct` at
all. Therefore the current product path does not provide a way to train and then
select emotional/loudness variants of one voice.

Fine-tuning on consistently emotional recordings may alter the adapter/model's
overall learned delivery as an **uncontrolled consequence**. That is a plausible
experiment, not documented emotion conditioning and not evidence that the
model can switch emotion or loudness on request. No model was trained or
generated for this audit.

## Revision and scope

Repository: `engines/OmniVoice`, remote `https://github.com/k2-fsa/OmniVoice.git`.
The local checkout is clean at `38e992bc60f85548faeb77e8fa70158ba71deb30`
(2026-08-05, optional PEFT LoRA support). On 2026-10-22,
`git ls-remote` reported default branch `master` at
`08be0b4ccbac3e13e374e86fbfead4b4cac343e2`. The latest commit's parent is the
local pin; its only changed file is `omnivoice/scripts/denoise_audio.py`, fixing
the waveform argument type. It is not an emotion, loudness, or training-control
change. The latest official GitHub release is `0.2.1` (tag commit `5ba967c`,
released 2026-07-16); its listed changes concern training attention, prompt
reuse, ASR/device handling, text normalization, and community-project docs,
with no emotion/loudness controls. No fetch, checkout, install, model download,
app launch, or GPU activity was performed.

Project context read: Round86 is current; Phase03 Voice Training is 60% in
progress. This was a research-only/configuration round and does not advance a
product round. `engines/OmniVoice` remained read-only.

## What upstream supports

### Generation controls

The official API's `instruct` parameter is documented as voice-design/style
conditioning. The documented attributes are gender, age, pitch, whisper,
English accent, and Chinese dialect. The implementation validates instructions
against this set. It does not define emotional labels or vocal volume/loudness
controls. Supported decoding controls (`num_step`, guidance, sampling,
duration/speed and audio post-processing) are not emotion or gain controls.
Duration and speed change timing; post-processing controls silence/fades/padding.
None is a calibrated vocal-effort or target-loudness control. There is a
limited amplitude effect in cloning: `create_voice_clone_prompt` records the
reference RMS, raises a nonzero quiet reference (`0 < RMS < 0.1`) to `0.1` for encoding,
then output post-processing scales that generated waveform by
`ref_rms / 0.1` to carry the original quietness back. With no reference prompt,
decoded output is peak-normalized to `0.5`. This is reference-level carryback /
peak normalization, not a user-selectable loudness target or training label.

The actual `_resolve_instruct` validator is in
`omnivoice/models/omnivoice.py:1492` and raises `ValueError` for unknown items;
for example `instruct="angry"` is rejected before generation. The instruction
constants live in `utils/voice_design.py`.

Reference cloning is a separate practical workaround: reference audio carries
some of its own speaker/prosodic style, but it does not give a documented
per-generation loudness target or explicit emotion switch. Upstream tips say a
conflicting instruction usually yields to the reference style.

### Fine-tuning and conditioning

The upstream training pipeline supports full fine-tuning and PEFT LoRA from a
pretrained checkpoint. Its data rows pair audio with text and optionally
`language_id` and `instruct`; training config has `instruct_ratio` and
`only_instruct_ratio`. The sample processor inserts the row's instruction into
the conditioning prefix probabilistically when `instruct_ratio` is nonzero.
Training loss predicts audio tokens; no separate emotion classifier, emotion
label field, loudness target, or loudness loss/control is documented in the
inspected path.

This establishes a generic path to experiment with labelled style instructions
only where corresponding training examples and useful conditioning exist. It
does not establish that unsupported words such as `angry`, `excited`, or `loud`
work, that training them produces reliable controllability, or that a trained
model preserves voice identity across such conditions. The documented and
validated instruction vocabulary remains narrower.

Consequently, changing `instruct_ratio` and providing labelled JSONL records
alone cannot enable `generate(instruct="angry")`: inference still rejects the
unknown label. Pro4Bro's worker also omits `instruct` from its call. Studying
such experimental conditioning would require a product-owned experimental
wrapper/approved custom conditioning path, and must leave `engines/OmniVoice`
read-only; it is outside this audit's implementation scope.

### Vietnamese

Vietnamese is explicitly listed in upstream `docs/languages.md` as language ID
`vi` / ISO 639-3 `vie`, with 8,481.98 hours in the checked-in language table.
The project generator descriptor also lists `vi`. This is direct evidence of
Vietnamese coverage in OmniVoice's supported-language data, rather than an
inference from the phrase “600+ languages.” It does **not** prove Vietnamese
voice-design instruction quality: upstream says voice-design training is only
on Chinese and English and may be unstable when generalized to other languages.
Voice cloning is documented as the more stable mode. No Vietnamese output was
generated or acoustically evaluated in this audit.

## What Pro4Bro currently wires

- `omnivoice_dataset_export.py` writes the segment's existing `instruct` into
  each JSONL record when present; it resolves language from the speaker profile
  or training default. Thus the adapter can carry a label supplied in a
  training segment.
- Both OmniVoice fine-tune descriptors expose `instruct_ratio`, and both default
  it to `0.0` (the recipe value). At that setting, the upstream processor
  replaces the instruction conditioning with `None`; carrying a string in the
  JSONL alone is not sufficient.
- `omnivoice_worker.py` constructs a clone prompt from reference audio and
  transcript, then calls `model.generate` with text/language/duration/speed and
  generation settings. It never passes `instruct`. The voice generator
  descriptor also exposes no emotion or loudness parameter. So even a
  hypothetical adapter trained with instructions cannot be selected by the
  current Pro4Bro generation path.
- The engine's raw-audio `JsonlDatasetReader` normalizes each training sample to
  peak amplitude `0.9` by default before token extraction. Separately, the clone
  reference path records reference RMS, raises nonzero references below RMS
  `0.1` to that floor before token encoding, and scales synthesized output back by
  `ref_rms / 0.1`; no-reference output is peak-normalized to `0.5`. These are
  actual amplitude handling effects. They do not provide calibrated
  vocal-effort control, a loudness target, or a separately supervised training
  label, and there is no demonstrated ability to train selectable loudness
  variants.
- Pro4Bro's own Voice Manipulator loudness renderer is a separate downstream PCM
  gain operation; it changes rendered output level after synthesis and is not
  OmniVoice model training or generation conditioning.

## Latest official upstream comparison

The fetched remote reference was not merged into or copied over the local
engine. The exact current default-branch SHA was compared with the local pin:
the latest commit is a one-commit child whose change is confined to the audio
denoiser waveform type. The official README at that SHA still lists speaker
attributes such as whisper and pitch, and the official model code still routes
voice design through `instruct`; no newer explicit emotion categories,
loudness control, or corresponding supervised training fields/loss were found.
The official issue discussion says explicit emotion/tone conditioning requires
annotated data that the maintainers did not have; that discussion is earlier
context, while the checked current code/docs above are the basis for the
as-of-date feature comparison.

## Evidence classes and limits

- **Documented upstream capability:** language IDs; clone/design/auto modes;
  listed speaker attributes; optional `instruct` and fine-tuning data/config;
  generic token prediction training.
- **Inspected local implementation/config:** pinned revision, product data
  exporter, worker payload, descriptors/defaults, audio normalization.
- **Untested hypotheses:** whether selectively annotated emotional recordings
  can bias delivery; whether arbitrary natural-language style instructions can
  be taught with a changed instruction ratio; what identity/quality tradeoffs
  result. No claims are made for these.
- **Not verified:** audio quality, control strength, Vietnamese pronunciation
  in this installation, loudness consistency, any trained checkpoint, or any
  artifact-producing run.

## Sources

All upstream GitHub source links below use the compared immutable commit where
available.

1. [Pinned local commit 38e992b](https://github.com/k2-fsa/OmniVoice/commit/38e992bc60f85548faeb77e8fa70158ba71deb30) and [current master commit 08be0b4](https://github.com/k2-fsa/OmniVoice/commit/08be0b4ccbac3e13e374e86fbfead4b4cac343e2).
2. [README at current SHA](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/README.md) — feature claims, voice design, cloning notes, generation API, training entry points.
3. [Latest official release 0.2.1](https://github.com/k2-fsa/OmniVoice/releases/tag/0.2.1) — release date and changes.
4. [Voice-design docs at current SHA](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/docs/voice-design.md), [generation parameters](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/docs/generation-parameters.md), [training docs](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/docs/training.md), and [data preparation](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/docs/data_preparation.md).
5. [Inference API, reference RMS handling, and `_resolve_instruct`](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/omnivoice/models/omnivoice.py), [instruction constants](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/omnivoice/utils/voice_design.py), [training sample processor](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/omnivoice/data/processor.py), [dataset reader](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/omnivoice/data/dataset.py), and [training config](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/omnivoice/training/config.py).
6. [Upstream language list](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/docs/languages.md) — Vietnamese row and hours.
7. [Maintainer discussion: emotion/tone control](https://github.com/k2-fsa/OmniVoice/issues/78) — notes need for annotated data; [non-verbal symbol limitations](https://github.com/k2-fsa/OmniVoice/issues/28) — symbols are data-dependent and are not general emotion/loudness control.
8. Local code inspected: `services/api/app/adapters/omnivoice_dataset_export.py`, `services/api/app/workers/omnivoice_worker.py`, `services/api/app/resources/training-models/omnivoice-{full,lora}.json`, `services/api/app/resources/voice-generators/omnivoice-generate.json`, and the corresponding files under `engines/OmniVoice`.

## Commands and validation

- `git rev-parse --show-toplevel; git status --short` — correct repository root; clean before edits.
- `git -C engines/OmniVoice remote -v; git -C engines/OmniVoice rev-parse HEAD; git -C engines/OmniVoice log -1 --format="%H%n%cI%n%s"` — confirmed origin and local SHA/date/message.
- `git ls-remote https://github.com/k2-fsa/OmniVoice.git refs/heads/main refs/heads/master refs/tags/v0.2.1` — only `master` resolved, to `08be0b4ccbac3e13e374e86fbfead4b4cac343e2`.
- `git show -s --format="%H %cI %s" 08be0b4...` in the local engine checkout — unavailable because that remote commit object is not present locally. GitHub's official commit page confirms its parent is the pinned `38e992b` and shows the one-file denoiser change.
- Targeted `rg` / `Get-Content` inspection of the upstream inference, instruction validation, dataset processing, normalization, and training files and the Pro4Bro adapter/descriptors — evidence summarized above.
- No automated test, build, model inference, or training command was run; this note is documentation/research only.
