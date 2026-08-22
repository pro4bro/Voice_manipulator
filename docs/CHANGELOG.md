# Development Changelog

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
