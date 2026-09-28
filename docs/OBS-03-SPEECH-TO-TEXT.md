# OBS-03 — Speech to Text connection

Status: implemented 2026-09-22. This round connects finished OBS sessions to the Speech to Text page. The next round begins simultaneous OBS video recording and Pro4Bro source-audio recording through the native plugin; see `docs/OBS-LIVE-CAPTURE-CONTRACT.md`.

## Delivered

- OBS Capture panel sits beside the existing browser Recorder. It uses the local media picker to choose a finished MKV and calls the inspection API before import.
- Every audio stream is shown with OBS track order, codec, and sample rate. The user can give each track a source label before submitting the session. The UI explicitly says the MKV cannot prove a source's device identity.
- The panel lists queued, processing, ready, and error sessions. A ready session offers the recording's audio preview, each isolated track, and a download link for the original MKV. Selecting an asset refreshes Media Pool and opens it in the existing Script and Timeline. Inline video preview is not yet part of this page.
- The panel labels live plugin recording as upcoming, so finished-file import cannot be mistaken for app-side realtime capture.

## Verification

- Focused OBS API tests: 4 passed, including inspection and separate audio playback.
- Frontend suite: 290 passed (38 files). Production build: passed.
- Full API suite: 362 passed, 1 skipped, 1 unrelated failure in `test_speaker_embedder_worker.py` because this checkout's `.venv` lacks `numpy`.
- In the running local browser, opened the `Test record 1` project and saw OBS Capture, its MKV action, the existing Recorder, Script, and Timeline together. The resident API process initially predated these routes, so the panel showed a restart message. Restarted the local runtime through its controller; API and Studio both returned `running`, and the browser panel loaded without that error. API import/inspection behavior was also verified through the current-code TestClient.
- `git diff --check` passed; `engines/OmniVoice` has no tracked changes.

## Remaining live work

The app is not yet receiving PCM from OBS while OBS records. OBS-04 must deliver the first real one-source plugin-to-app recording path, with a durable app-owned stem and real OBS measurement. OBS-05 expands to multiple sources and provisional per-source live STT.
