# Requirements

## Foundation

- **ENG-01**: OmniVoice source is present in `engines/OmniVoice` and Pro4Bro does not modify it.
- **ENG-02**: The app reports OmniVoice path, Git revision, branch, and dirty state through an adapter.
- **ENG-03**: An update command can fast-forward the OmniVoice checkout without touching Pro4Bro code.
- **MOD-01**: Shared audio UI capabilities live in independently named modules with narrow typed interfaces.
- **MOD-02**: Pages compose modules by configuration instead of duplicating module implementations.

## Projects

- **PRJ-01**: Opening the app shows existing projects before any workspace.
- **PRJ-02**: A user can create a named project at a chosen filesystem location.
- **PRJ-02A**: Language, accent, and sample rate are optional project metadata hidden behind an additional-information disclosure.
- **PRJ-03**: Project metadata persists locally and survives app restart.
- **PRJ-04**: A user can reopen a project into its last active page.
- **PRJ-05**: A project manifest and all internal media links remain relative to the project folder.
- **PRJ-06**: A moved project can be reconnected by selecting its folder without rebuilding assets or transcript history.
- **PRJ-07**: Project activity and handoff notes live inside the project folder.

## Workspace

- **UI-01**: The main workspace fits the viewport and does not require page scrolling.
- **UI-02**: Left, center, and right workspace columns are resizable within safe minimums.
- **UI-03**: Loading, empty, ready, recording, processing, success, and error states are visually explicit.
- **UI-04**: Keyboard focus, labels, contrast, and reduced-motion behavior meet baseline accessibility expectations.
- **UI-05**: Light and dark themes use one synchronized surface/token system across Project Hub and every module, including Recorder and Timeline.

## Speech To Text

- **STT-01**: The page includes Media Pool, Script, Recorder, and Timeline production modules, without Voice Vault or Control Rack.
- **STT-02**: Generate Voice, Voice Patch, and Recent Takes are absent from the Speech to Text page.
- **STT-03**: Recorder occupies the third column.
- **STT-04**: Live, accurate, AI-corrected, and user-corrected transcript states render and edit inside Script.
- **STT-05**: Recorder can select an audio input, select a monitor output, and optionally monitor the live microphone stream.
- **STT-06**: Recording or importing audio invokes the working Studio transcription pipeline and returns audio plus word timing to Script and Timeline.
- **STT-07**: Recorder can capture microphone audio or a browser-authorized tab/window/system audio stream.
- **STT-08**: Media Pool accepts common audio/video containers and codecs and preserves the original project-owned source.
- **STT-09**: Every Media Pool asset owns an independent Script, word timing set, and transcript revision history.
- **STT-10**: Speech to Text exposes speaker diarization/isolation status and manual speaker attribution without reporting unavailable processors as complete.
- **STT-11**: Script words can carry a Speaker Profile so one mixed file can be reviewed as multiple named speakers.
- **STT-12**: Media assets and individual Script words can carry controlled Emotion Labels from positive through critical; multi-emotion assets are labeled `mix`.

## Voice Training

- **TRN-01**: The page reuses Media Pool, Script, Timeline, and Voice Vault, replaces Recorder with Train, and does not expose capture controls.
- **TRN-02**: Training-specific controls expose dataset readiness, segmentation, checkpoint, progress, and validation status.
- **TRN-03**: Transcript text can be corrected before data preparation or training starts.
- **TRN-04**: One Training Run can target multiple Speaker Profiles, with footage and Script words explicitly attributed to each speaker.
- **TRN-05**: Training Settings persist max steps, batch size, learning rate, and checkpoint backup interval, defaulting to every 1,000 steps.
- **TRN-06**: Training can enable/disable denoising independently from learning a named Environment Noise Profile from multiple selected audio assets.
- **TRN-07**: Voice Vault can create Speaker Profiles with name, language, region, age, and gender before training.

## Voice Manipulator

- **MAN-01**: One page exposes Voice Over, Voice Isolator, Voice Changer, Voice Dubber, and Voice Patch modes.
- **MAN-02**: The page composes Voice Vault, Script, Control Rack, Recorder, Timeline, Voice Patch, and Recent Takes according to mode capabilities.
- **MAN-03**: Unsupported processors show honest planned/unavailable states, not simulated successful processing.

## Workflow

- **WF-01**: Assets carry lineage between workflow steps.
- **WF-02**: A completed output can be sent to the next valid step without re-importing it.
- **WF-03**: Jobs have stable states and visible progress/error details.
- **WF-04**: Media Pool is shared by Speech to Text, Voice Training, and Voice Manipulator as the source-of-truth asset collection.
- **WF-05**: Timeline playback resolves project-owned analysis audio instead of relying on an external engine output path.

## Traceability

| Requirement group | Phase |
| --- | --- |
| ENG, MOD, PRJ, UI | 01 Foundation |
| STT, WF baseline | 02 Speech to Text |
| TRN | 03 Voice Training |
| MAN, WF completion | 04 Manipulator Pipeline |
| Packaging and model management | 05 Desktop Release |
