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

- **STT-01**: The page includes Media Pool, Script, Recorder, Speaker & Emotion, Speaker Isolation, and Timeline production modules, without Voice Vault or Control Rack.
- **STT-02**: Generate Voice, Voice Patch, and Recent Takes are absent from the Speech to Text page.
- **STT-03**: Recorder occupies the top of the third column; Speaker & Emotion and Speaker Isolation follow in the same internally scrollable column.
- **STT-04**: Live, accurate, AI-corrected, and user-corrected transcript states render and edit inside Script.
- **STT-05**: Recorder can select an audio input, select a monitor output, and optionally monitor the live microphone stream.
- **STT-06**: Recording or importing audio invokes the working Studio transcription pipeline and returns audio plus word timing to Script and Timeline.
- **STT-07**: Recorder can capture microphone audio or a browser-authorized tab/window/system audio stream.
- **STT-08**: Media Pool accepts common audio/video containers and codecs and preserves the original project-owned source.
- **STT-09**: Every Media Pool asset owns an independent Script, word timing set, and transcript revision history.
- **STT-10**: Speech to Text exposes speaker diarization/isolation status and manual speaker attribution without reporting unavailable processors as complete.
- **STT-11**: Script words can carry a Speaker Profile so one mixed file can be reviewed as multiple named speakers.
- **STT-12**: Media assets and individual Script words can carry controlled Emotion Labels from positive through critical; multi-emotion assets are labeled `mix`.
- **STT-13**: Media Pool footage rows remain compact; file-level speaker/emotion tags are edited through a right-click menu instead of persistent checkbox groups.
- **STT-OBS-01**: Speech to Text can ingest one OBS recording with separate audio tracks as one portable capture session, preserving the original video and track-to-source mapping.
- **STT-OBS-02**: Each selected OBS audio track can be transcribed independently; its transcript and timing retain source and session provenance.
- **STT-OBS-03**: Reviewed captions export as SRT against the recording timeline, accounting for track offsets and recording pauses; unsafe word timings cannot silently enter cues.
- **STT-OBS-04**: An optional OBS plugin sends selected source PCM and recording events to the local app while OBS records video. The app durably records each source as its own project-owned audio stem and can run provisional live transcription. Transport loss creates explicit gap markers without blocking or corrupting OBS recording.
- **STT-OBS-05**: Provisional live captions can appear in the OBS composition, while the original recording and final corrected captions remain separately recoverable.
- **STT-OBS-06**: A finished session can render a new video with reviewed hard subtitles while preserving the original recording.
- **STT-OBS-07**: OBS stop finalizes the app-side live stems, associates the finished OBS recording with the same capture session, and automatically queues authoritative per-source Final STT; the final revision replaces the live draft as the Script/SRT source.
- **STT-OBS-08**: Every captured source has an explicit role. Microphone sources identify the primary user or people near that microphone; meeting-application sources identify remote guests. Diarization runs independently per source when requested, and Script/SRT speaker labels retain both the source role and diarized speaker identity.

## Distribution

- **PKG-01**: A Windows test bundle contains its Python runtimes, application dependencies, FFmpeg, built web application, engine source, and selected model weights inside the application folder.
- **PKG-02**: Runtime defaults never silently resolve to a sibling checkout, user profile cache, or system Python installation.
- **PKG-03**: A fail-closed portability audit reports every missing or external runtime component and must pass after the bundle is moved to a different path on a clean test machine.

## Voice Training

- **TRN-01**: The page reuses Media Pool, Script, Timeline, and Voice Vault, replaces Recorder with Train, and does not expose capture controls.
- **TRN-02**: Training-specific controls expose dataset readiness, segmentation, checkpoint, progress, and validation status.
- **TRN-03**: Transcript text can be corrected before data preparation or training starts.
- **TRN-04**: One Training Run can target multiple Speaker Profiles, with footage and Script words explicitly attributed to each speaker.
- **TRN-05**: Training Settings persist max steps, batch size, learning rate, and checkpoint backup interval, defaulting to every 1,000 steps.
- **TRN-06**: Training can enable/disable denoising independently from learning a named Environment Noise Profile from multiple selected audio assets.
- **TRN-07**: Voice Vault can create Speaker Profiles with name, language, region, age, and gender before training.
- **TRN-08**: A Training Run consumes a deterministic Dataset Manifest compiled only from explicitly selected footage and verified timed spans.
- **TRN-09**: A supplied reading script may skip ASR but must pass alignment/validation before its audio-text segments become training-ready.

## Voice Manipulator

- **MAN-01**: One page exposes Voice Over, Voice Isolator, Voice Changer, Voice Dubber, and Voice Patch modes.
- **MAN-02**: The page composes Voice Vault, Script, Control Rack, Recorder, Timeline, Voice Patch, and Recent Takes according to mode capabilities.
- **MAN-03**: Unsupported processors show honest planned/unavailable states, not simulated successful processing.
- **MAN-04**: Voice Over supports editable clip, segment, and sentence structure with per-sentence speaker/voice, text, pauses, and overrides; splitting or joining retains provenance and existing user decisions.
- **MAN-05**: Voice Over accepts a desired duration for the whole clip and/or selected segments/sentences, allocates unlocked time including pauses, detects conflicting or infeasible targets, and verifies measured final duration without truncating words to claim success.
- **MAN-06**: Mood, Emotion Label, intensity, and delivery notes can be assigned to individual sentences manually or proposed through an analysis workflow; explicit user notes take precedence, and generation uses only verified compatible emotion/reference/model conditioning.
- **MAN-07**: Voice Over controls vocal delivery from whisper/soft speech through ordinary speech to loud speech/shouting separately from output gain/loudness; the engine's demonstrated capability is visible and loudness processing protects intelligibility and peak headroom.
- **MAN-08**: Voice Patch supports three explicit strategies: a model trained from clean speaker data, a clone reference from verified surrounding same-speaker audio, and compatible trained-model plus contextual-reference conditioning. Each produces previewable replacement text/audio with timing and source lineage, explicit Apply, and retained revisions.
- **MAN-09**: Voice Isolator produces real audio stems from mixed audio, with distinct capabilities for dialogue/background separation and separating overlapping speakers; its outputs support clean references, transcription, patching, and dubbing without claiming diarization alone creates stems.
- **MAN-10**: Voice Dubber can automatically analyze a clip, resolve recurring speakers and context, translate coherently into the selected language, reproduce each character's voice and delivery according to source emotion and explicit user notes, fit reviewed timing, mix retained background stems, and publish audio/subtitles through resumable stage jobs with uncertainty and failures visible.
- **MAN-11**: Generation timing can follow explicit start/end/duration targets and a reference clip, the speaker's verified training footage, or the current dubbing/patch source. Timing plans preserve source spans, pauses and usable speech landmarks, distinguish constraints from average speech rate, report achieved timing error, and surface infeasible or text-incompatible targets.
- **MAN-12**: Selecting a time range or words in waveform, timeline subtitles, or Script synchronizes the same highlights across all three surfaces. Each selected range shows start, duration, and end as an overlay inside the waveform immediately below the timeline time readout; disjoint ranges remain distinct.
- **MAN-13**: Multiple selections remain highlighted without automatic viewport scrolling. Script scrollbars and Timeline navigation/scroll tracks show selection-location markers; clicking a marker explicitly reveals its range without clearing other selections or implicitly changing playback.
- **MAN-14**: A selected sentence, segment, or clip exposes start/end handles; Ctrl plus left-button dragging a handle stretches or compresses that selected audio region rather than trimming it. Waveform, audible time-stretch preview, subtitles, and downstream ripple offsets update consistently throughout the interaction, with reversible, persistent edits and immutable source media.
- **MAN-15**: Fix Voice Generated batches only units whose current desired duration/timing, words, intonation, mood, or emotion differ from their successfully fixed generation revision. Completed matching units and units merely shifted by ripple are reused; failures remain pending, later edits cannot be overwritten by stale jobs, and a rerun resumes unresolved work rather than regenerating everything.
- **MAN-16**: Timing edits maintain explicit source-to-edited-time mappings, revisioned edit intent and real audio preview/render provenance. A temporary time-stretch preview is distinguishable from regenerated speech and reviewed word timing, and validated replacements preserve user timing intent when publishing or exporting a new output revision.
- **MAN-17**: Users can import multiple footage assets into a Reference area accessible from Voice Manipulator and mark/unmark individual or selected footage/tracks as Reference through the context menu. Reference roles reuse project asset identity/provenance, remain distinct from training selection and target voice identity, and persist across reopen/move.
- **MAN-18**: A waveform, subtitle, or Script selection can receive one or more reference footage/spans through a context menu, with independent multi-select properties for timing, intonation, volume/loudness, emotion, shouting, and whispering. Assignments preserve per-source property mappings, overrides, constraints, and explicit conflict/unsupported states without silently changing the target speaker voice.
- **MAN-19**: Reference variation has separate opt-in controls for randomized property values/source choice and randomized application times, with bounded eligible inputs and preserved user timing/identity locks. With randomization disabled, the resolved selected characteristics apply consistently throughout the selected span; long and short selections do not force randomization on.
- **MAN-20**: Multi-reference randomization produces a previewable, editable, revisioned application schedule with stored seed, sampled decisions, source spans and parameter provenance. Fix/retry/reopen reuse the same resolved schedule; explicit reroll or changed assignments invalidate only affected generation units, and incompatible characteristics are resolved rather than blindly superposed.
- **MAN-21**: Voice Manipulator's right column contains a Reference Detail module with a persistent slot for each assigned target span. Each collapsed slot has exactly two content lines: target text, then reference footage names. An expand control lists each source footage/span and its selected characteristics, with target timing and applicable randomization/status details; slots update after assignment and edits without duplicating bindings or disturbing synchronized multi-selection. Clicking a slot's content selects its target and navigates both Timeline and Script to it with synchronized highlights; expanding/collapsing details does not navigate or seek.

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
