# State

- **Current phase**: 03 Voice Training
- **Status**: Plan 03-01 complete; Plan 03-02 ready
- **Last action**: Completed the portable Training Catalog, multi-speaker/emotion annotations, synchronized themes, Voice Training composition, and compact Media Pool right-click tagging. Recorded a full repository/project handoff for a clean next session.
- **Next action**: Execute `.planning/phases/03-voice-training/03-02-PLAN.md`: compile only selected footage into a deterministic dataset manifest and add forced alignment/validation for supplied scripts before any fine-tune process starts.
- **Blockers**: None for finalized recording/import STT. Live low-latency STT still needs a local streaming/chunking design.
- **Decisions**: The folder containing `project.json` is the portable project aggregate; the app registry is disposable. Speech to Text owns Media Pool on the left, Script in the center, Recorder plus Speaker & Emotion plus Speaker Isolation on the right, and Timeline below; it has no Voice Vault or Control Rack. Voice Training replaces capture controls with Train and Training Job. Speaker Diarization and Voice Isolation are separate processors. Emotion may be asset-level or word-level; multi-emotion assets use `mix`. Environment Noise Profiles are learned references and remain separate from denoising. ASR may be skipped for a known script, but alignment/validation is still required before training. Legacy Studio is an interim adapter and upstream OmniVoice remains untouched.
