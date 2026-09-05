# State

- **Current phase**: 03 Voice Training, with Phase 02 Speech to Text still open beside it. They overlap on purpose: 02 owns what was heard, 03 owns what can be taught, and both read the same Media Pool, Script and word timing.

- **Status**:
  - Stabilization W0–W4 is merged into `main` (25 commits, fast-forward). R0/R1/R3/R4 done, R7 done, R5 measured and declined, R6 not performed.
  - **R2 accepted by the owner** on 2026-09-03 with two thresholds knowingly unmet — it does what it claims (mark untrusted timing, keep it out of cues) but it never claimed to make timing correct, which is the problem the owner actually has.
  - Plan 03-01 complete. Plan 03-02 compiler and validation implementation delivered. Plan 03-03 is in progress: run records, runtime inspection, dataset export, process parsing, GPU lease, and progress UI are delivered; the live runner route and model publishing remain.
  - Plan 03-04 (High Quality Voice Training) in progress: tasks 1, 2 and 5 delivered.
  - Plan 07-01 written: model delivery and security seams defined, no adapter, no route touched.

- **Last action**: Recording no longer passes through Opus on its way to a dataset — the take is tapped as PCM off the audio graph and uploaded as WAV, with MediaRecorder kept only as a fallback. Added the reading-passage authoring dialog so a moderator writes passages instead of JSON. 125 backend and 179 frontend tests, production build.

  - **Next action**: Finish 03-03 by wiring the validated manifest, runtime report, JSONL exporter, tokenization process, `accelerate` training process, GPU lease, checkpoints, resume, and publish path into one `TrainingRunner`. Keep the Start button disabled until the live route and runtime checks are complete.

- **Blockers**:
  - Nothing actually trains yet. 03-03 now has the execution ingredients, but the API orchestration from a validated manifest into a real OmniVoice job is still missing. The training runtime currently has torch/torchaudio but lacks `omnivoice`, `accelerate`, `peft`, and `webdataset`.
  - Guided reading's read-along follows manually; it needs the local streaming recogniser, which now exists in Recorder for the live transcript and has not been wired to the teleprompter.
  - AI review still needs endpoint, model and API key in Windows → Preferences.

  - **Environment**: The working tree is the active checkout repository root, confirmed with `git rev-parse --show-toplevel`. Other copies are backups only. Project paths remain relative; runtime and model paths are machine-local and ignored.

- **Branches**: `main` at the stabilization tip. `feat/03-04-high-quality-training` is main plus the 03-04 work. `docs/remote-access` is main plus one doc commit and merges independently.

- **Decisions**: The folder containing project.json is the portable project aggregate; app registry and runtime preferences are machine-local. Media Pool and Sound Library are tabs in one left panel. OmniVoice remains untouched; its language/facet schema is exposed through the application adapter. Finalized STT trusts only processor-provenanced word timing; Vietnamese uses non-batched Faster-Whisper DTW plus an unpadded acoustic-boundary pass because VAD padding shifted whole phrases early. A terminal STT progress snapshot is not the Script payload. A tiny control plane must remain alive when workloads are off. Speech processing stays local — no cloud recogniser, not even as a fallback. Guided reading is a capture mode, not a project type or a second pipeline (ADR 0010). Emotion travels through reference audio; one LoRA adapter per emotion, anchored to a shared neutral slice and published only as a Voice Model Set.
