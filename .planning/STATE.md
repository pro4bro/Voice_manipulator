# State

- **Current phase**: 03 Voice Training, with Phase 02 Speech to Text still open beside it. They overlap on purpose: 02 owns what was heard, 03 owns what can be taught, and both read the same Media Pool, Script and word timing.

- **Status**:
  - Stabilization W0–W4 is merged into `main` (25 commits, fast-forward). R0/R1/R3/R4 done, R7 done, R5 measured and declined, R6 not performed.
  - **R2 accepted by the owner** on 2026-09-03 with two thresholds knowingly unmet — it does what it claims (mark untrusted timing, keep it out of cues) but it never claimed to make timing correct, which is the problem the owner actually has.
  - Plan 03-01 complete. Plan 03-02 written, not started. Plan 03-03 not written.
  - Plan 03-04 (High Quality Voice Training) in progress: tasks 1, 2 and 5 delivered.
  - Plan 07-01 written: model delivery and security seams defined, no adapter, no route touched.

- **Last action**: Recording no longer passes through Opus on its way to a dataset — the take is tapped as PCM off the audio graph and uploaded as WAV, with MediaRecorder kept only as a fallback. Added the reading-passage authoring dialog so a moderator writes passages instead of JSON. 125 backend and 179 frontend tests, production build.

- **Next action**: Alignment. The owner's live complaint is that subtitles do not line up with the waveform, and neither R2 nor R5 addressed that. Before writing code, run a probe in the R5 pattern — thresholds stated first, willing to decline — on two questions: whether cue-level VAD snapping fixes what is visibly wrong, and whether gating the `vietnamese-250h` aligner by agreement with Silero (rather than by its own confidence) beats DTW. Then 03-02, then 03-03.

- **Blockers**:
  - Nothing actually trains yet. 03-04 keeps raising source quality while 03-03 — the path from a manifest into an OmniVoice job — does not exist. Every further 03-04 task stockpiles ingredients for a kitchen that is not built.
  - Guided reading's read-along follows manually; it needs the local streaming recogniser, which now exists in Recorder for the live transcript and has not been wired to the teleprompter.
  - AI review still needs endpoint, model and API key in Windows → Preferences.

- **Environment**: The working tree is `E:\AI_RND\PRO4BRO\VOICE_MANIPULATOR\PRO4BRO_VOICE_MANIPULATOR`. The `V:` copy is a read-only backup on `\\192.168.100.102\hub`; a session on 2026-09-03 did three commits' work in it before this was noticed. Tests on the share either fail outright or take 440 s; on E: the same suite takes 4.9 s.

- **Branches**: `main` at the stabilization tip. `feat/03-04-high-quality-training` is main plus the 03-04 work. `docs/remote-access` is main plus one doc commit and merges independently.

- **Decisions**: The folder containing project.json is the portable project aggregate; app registry and runtime preferences are machine-local. Media Pool and Sound Library are tabs in one left panel. OmniVoice remains untouched; its language/facet schema is exposed through the application adapter. Finalized STT trusts only processor-provenanced word timing; Vietnamese uses non-batched Faster-Whisper DTW plus an unpadded acoustic-boundary pass because VAD padding shifted whole phrases early. A terminal STT progress snapshot is not the Script payload. A tiny control plane must remain alive when workloads are off. Speech processing stays local — no cloud recogniser, not even as a fallback. Guided reading is a capture mode, not a project type or a second pipeline (ADR 0010). Emotion travels through reference audio; one LoRA adapter per emotion, anchored to a shared neutral slice and published only as a Voice Model Set.
