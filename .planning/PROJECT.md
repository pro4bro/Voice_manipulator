# Pro4Bro Voice Manipulator

## Product

Pro4Bro Voice Manipulator is a project-based desktop audio workspace. It turns speech-to-text, voice training, and voice manipulation into one connected production workflow while keeping individual AI engines replaceable.

## North Star

A creator can open one project, move an audio asset through transcription, voice preparation, generation, isolation, changing, dubbing, and patching, and always understand what changed and what can run next.

## Current Scope

- Project Hub with recent projects, project creation, and moved-project reconnection.
- Full-screen, resizable workspaces for Speech to Text, Voice Training, and Voice Manipulator.
- Reusable deep UI modules: Voice Vault, Script, Control Rack, Recorder, Timeline, Voice Patch, Project Rail, and Job Monitor.
- Editable transcript inside Script after accurate STT and AI correction.
- OmniVoice checked out as an untouched upstream engine under `engines/OmniVoice`.
- A backend engine adapter and project persistence outside OmniVoice.

## Deferred Scope

- Production-quality source separation, voice conversion, automatic dubbing, and DAW-grade editing.
- Packaged installer and automatic engine/model download manager.
- Collaboration, cloud sync, and remote inference.

## Constraints

- Never edit files under `engines/OmniVoice` from Pro4Bro feature work.
- Runtime data, models, and caches use repository-relative ignored folders. Every project is a self-contained portable folder even when the user chooses another location.
- UI modules must expose narrow interfaces and must not import engine implementations.
- The workspace must fit the viewport without page scrolling; module interiors may scroll.

## Key Decisions

- React and TypeScript provide the modular frontend.
- FastAPI owns projects, jobs, media, and engine orchestration.
- OmniVoice is a read-only upstream Git submodule reached through an adapter.
- Local markdown is the issue tracker until a remote repository is configured.
