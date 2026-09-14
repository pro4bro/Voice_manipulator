# Training Models (and every other engine capability)

Each JSON file here is one option in the Train module's **Model Training** list.
The web app draws that option's parameters from the file, so adding a model or a
repository is adding a descriptor, not editing the UI.

The same descriptor format describes each capability a repository brings, one
folder per capability, so a repo is used for whatever it can actually do:

| Folder | Where it shows up | Examples |
|--------|-------------------|----------|
| `training-models/` | Voice Training · Model Training list | OmniVoice LoRA, OmniVoice zero-shot clone, VibeVoice TTS LoRA |
| `voice-generators/` | Voice Manipulator · Tạo giọng | OmniVoice speaking with a project voice |
| `stt-engines/` | Speech to Text · model select | faster-whisper models, VibeVoice-ASR |

An STT descriptor with a `model` choice parameter contributes one entry per
model; otherwise the descriptor id itself is the value the transcription queue
receives, and the API routes that value to its engine adapter.

- Shipped descriptors live here.
- Descriptors for this machine only go in `<PRO4BRO_DATA_ROOT>/training-models/`.
  One with the same `id` as a shipped descriptor replaces it.
- A malformed file is skipped with a log line; the rest still load.

## Schema

```jsonc
{
  "schemaVersion": 1,
  "id": "vibevoice-1.5b-tts-lora",     // stable; saved in project catalogs
  "label": "VibeVoice 1.5B · TTS LoRA (community)",
  "family": "VibeVoice",               // groups the list
  "engine": "vibevoice",
  "mode": "tts-lora",
  "order": 40,                         // position in the list
  "description": "...",
  "runnable": false,                   // true only when Pro4Bro has a runner for it
  "blockedReason": "...",              // shown while runnable is false
  "repository": {
    "root": "vibevoice",               // a named root, never a machine path
    "path": "VibeVoice-community",     // folder under that root
    "entrypoint": "vibevoice/finetune/train_vibevoice.py",
    "recipe": "FINETUNING.md",         // where the defaults came from
    "url": "https://github.com/...",
    "revision": "631804b"              // the commit the values were read from
  },
  "dataFormat": "...",
  "notes": ["..."],
  "parameters": [
    {
      "key": "ddpm_batch_mul",         // the trainer's own config key / CLI flag
      "label": "DDPM batch multiplier",
      "group": "Loss",
      "kind": "int",                   // int | float | text | bool | choice
      "default": 4,                    // what Pro4Bro fills in
      "recipe": 4,                     // what the published recipe sets (omit if it does not)
      "codeDefault": 1,                // what the trainer does when the flag is left out
      "source": "VibeVoice-community/FINETUNING.md · code vibevoice/finetune/train_vibevoice.py",
      "min": 1, "max": 64, "step": 1,
      "options": [],                   // required for kind "choice": [{ "value", "label" }]
      "unit": null,
      "help": null,
      "nullable": false,               // empty field allowed, sent as null
      "editable": true,                // false = shown locked, default always used
      "advanced": false,               // true = folded under "Nâng cao"
      "runField": null                 // TrainingRunConfig field it also fills (steps, save_steps, ...)
    }
  ]
}
```

## Roots

| Root        | Setting                  | Default                                  |
|-------------|--------------------------|------------------------------------------|
| `omnivoice` | `PRO4BRO_OMNIVOICE_ROOT` | `engines/OmniVoice`                      |
| `vibevoice` | `PRO4BRO_VIBEVOICE_ROOT` | `../VibeVoice` beside this checkout      |

A new root is one entry in the `roots` map where `FileTrainingModelCatalog` is
built in `app/main.py`.

## What the states mean

- `installed`: the entrypoint file exists under its root. It does **not** mean
  weights are downloaded or the Python environment can import the trainer.
- `available`: installed **and** `runnable`. Only these can be started; the API
  refuses the rest with 409 even if a client sends them.

Parameter values are checked against the descriptor when a run starts: unknown
keys, values outside `min`/`max`, and choices not in `options` are refused, and a
locked parameter always takes its default.

## Keeping values honest

`tests/test_training_model_catalog.py` reads the OmniVoice config files and the
VibeVoice recipes and dataclasses from the local checkouts and fails when a
`recipe` or `codeDefault` here disagrees with them. It skips a repository that is
not checked out. When adding a descriptor for a new repository, add the same
kind of check.
