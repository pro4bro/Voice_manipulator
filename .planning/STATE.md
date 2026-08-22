# State

- **Current phase**: 02 Speech to Text
- **Status**: In progress
- **Last action**: Made project folders portable with relative manifests/media paths, migration, project-owned audio playback, Open Existing, and per-project activity/handoff notes; prepared the source tree for GitHub.
- **Next action**: Add chunked live transcription and merged per-word transcript review, then feed selected Media Pool sources into project-native training jobs.
- **Blockers**: None for finalized recording/import STT. Live low-latency STT still needs a local streaming/chunking design.
- **Decisions**: The folder containing project.json is the portable project aggregate; the app registry is disposable. Speech to Text owns Media Pool, Script, Recorder, and Timeline but no Voice Vault or Control Rack. Browser capture uses the native secure share picker. Legacy Studio is an interim adapter and upstream OmniVoice remains untouched.
