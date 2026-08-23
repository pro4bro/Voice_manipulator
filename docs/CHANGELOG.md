# Development Changelog

## 2026-08-23 - Compact Footage Tagging

- Moved Speaker & Emotion and Speaker Isolation below Recorder in the Speech to
  Text right column.
- Returned Media Pool to compact footage rows with metadata under the name.
- Moved file-level speaker and emotion assignment into an unclipped right-click
  menu and retained word-level tagging in Script.

## 2026-08-23 - Speaker-Aware Training Catalog And Themes

- Added synchronized Light/Dark theme tokens for Project Hub and every module.
- Added portable Speaker Profiles, Environment Noise Profiles, and Training
  Settings under each project.
- Added file-level and timed-word speaker/emotion attribution with `mix` rollup.
- Replaced Recorder and Control Rack on Voice Training with Train and Training
  Job, including 1,000-step checkpoint defaults, denoise, and environment setup.
- Kept automatic diarization, isolation, environment learning, and training
  execution explicitly unavailable until their adapters are implemented.

## 2026-08-23 - Portable Media Projects

- Added shared Media Pool to Speech to Text, Voice Training, and Voice
  Manipulator.
- Added audio/video ingest and codec inspection through isolated FFmpeg.
- Added microphone and browser-authorized tab/window/system recording.
- Added project-owned source, analysis audio, transcript, word timing, revision,
  and activity files.
- Replaced persistent absolute project/media paths with relative manifests and
  automatic legacy migration.
- Added Open Existing so a moved project folder can be reconnected.
- Added a project audio route so Timeline no longer depends on a legacy output
  filesystem path.
- Added durable session/project handoff notes and pushed the source baseline to
  `pro4bro/Voice_manipulator` with OmniVoice represented as an upstream submodule.

## 2026-08-22 - Pro4Bro Application Foundation

- Created the separate Pro4Bro Voice Manipulator repository.
- Kept OmniVoice behind an adapter and outside product module implementations.
- Built the Project Hub, project creation dialog, three full-screen workspaces,
  manifest/module registry, resizable columns, and initial local persistence.
- Recreated the working Studio surfaces as reusable Media/Voice Vault, Script,
  Recorder, Control Rack, Timeline, Voice Patch, Recent Takes, and Training Job
  modules.
- Connected finalized import/recording to the existing Studio STT pipeline and
  returned real waveform data plus word timestamps.

## Earlier Migration Runtime Work

- Installed OmniVoice and all Python/model dependencies in isolated local
  environments without modifying global Python or PATH.
- Checked upstream updates, model availability, checkpoints, and training data.
- Added one-click Windows BAT/PowerShell flows for dataset preparation,
  tokenization, training, trained-voice TTS, and Studio launch.
- Fixed the `train-voice.ps1` Stage argument/splatting failure.
- Rewrote `segments_review.csv` as Unicode-safe output.
- Built and iterated the original audio Studio UI: scrub, dB/time rulers, source
  gain preview, waveform scaling, peak indication, deep zoom, playback rates,
  karaoke word timing, recording/import STT, and merged transcript review design.
