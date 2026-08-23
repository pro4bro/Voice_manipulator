# State

- **Current phase**: 03 Voice Training
- **Status**: In progress
- **Last action**: Added synchronized Light/Dark themes, portable Training Catalog, Speaker Profiles, asset/word speaker and emotion labels, Speaker Isolation seam, multi-speaker Train controls, 1,000-step checkpoint default, denoise settings, and reusable Environment Noise Profiles.
- **Next action**: Connect automatic diarization/isolation, forced alignment for supplied scripts, and the project-native OmniVoice training adapter to the verified catalog contracts.
- **Blockers**: None for finalized recording/import STT. Live low-latency STT still needs a local streaming/chunking design.
- **Decisions**: The folder containing project.json is the portable project aggregate; the app registry is disposable. Speech to Text owns Media Pool, Script, Recorder, Speaker Isolation, and Timeline but no Voice Vault or Control Rack. Voice Training replaces Recorder with Train. Speaker Diarization and Voice Isolation are separate processors. Emotion may be asset-level or word-level; multi-emotion assets use `mix`. Environment Noise Profiles are learned references and remain separate from denoising. ASR may be skipped for a known script, but alignment/validation is still required before training. Legacy Studio is an interim adapter and upstream OmniVoice remains untouched.
