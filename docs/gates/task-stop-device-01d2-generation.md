# TASK-STOP-DEVICE-01D2 — actual Generate Stop and rerun

2026-10-07. Disposable product-owned fixture, real cached OmniVoice inference.
No owner project or upstream changed; no Training Resume or identity acceptance
is inferred from the Clone voice.

## Product fixture and lifecycle

Six retained RVC smoke speech WAVs are imported and cached through the product
API, assigned a generic `Stop Test Fixture` Speaker, selected for training, then
recognized by cached Medium. The product compiler creates six measured segments,
35.19 seconds, both train/dev splits and no rejection. A normal zero-shot Clone
run publishes its own reference and ProjectVoice. No manifest, completed run or
voice metadata is fabricated. The historical sibling HF cache holds OmniVoice;
the fixture points there explicitly and stays offline. Normal project data and
credentials are not copied.

- First Generate starts actual worker40628. Queue Stop retains the active
  request, which publishes a real4.16-second WAV,199,724 bytes.
- A subsequent60-second request binds the same warm worker. Hard Stop reaps
  worker40628, returns cancellation409, releases the GPU lease, settles the
  Activity task and publishes no additional output. Completed output remains.
- Rerun binds new worker11000 and publishes a real3.2-second WAV,153,644 bytes.
  The two WAVs are mono PCM16/24kHz, nonempty, zero clipped samples, zero first/
  last-sample jumps. All19 source/analysis/reference SHA256 checks and the first
  output hash agree. These header/sample checks do not establish intelligibility,
  speaker similarity or quality.

Evidence: `.scratch/task-stop-device-01d/{fixture,prepared,manifest}.json`,
`gen-queue-active.json`, `gen-queue-after.json`, `gen-first-complete.json`,
`gen-hard-active.json`, `gen-hard-stopped.json`, `gen-rerun-active.json` and
`gen-acceptance.json`. Initial harness interpreters lacked `psutil`; process
evidence uses native PowerShell PID lookup instead. The actual fixture API is
PID14008 (the venv launcher has a separate parent). No source change in01D2.

## Remaining acceptance

Browser access to the existing18319 tab was rejected by the computer-use tool's
security policy in this invocation. No alternate browser surface or workaround
was attempted. Therefore this slice is API/process/media evidence; it makes no
new UI Yes/No claim and does not close the saved-file/cancel export gate. Earlier
TASK-STOP-01 browser confirmation evidence retains its separate meaning.

Exact next01D3: a fresh short LoRA run using this product manifest, wait for a
fully saved checkpoint, queue Stop, hard Stop, same-run Resume using the01D1
token-cache repair, and require a real project-owned LoRA publication. GPU usage
fell from11.4GB to5.5GB without stopping unrelated apps; sample it before training.
Owner-specific identity, native picker/audio/OBS and second-machine LAN gates
remain open. Fixture cleanup and final suite results are recorded in the ledger.
