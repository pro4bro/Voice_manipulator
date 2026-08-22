# Domain Glossary

- **Project**: A portable folder containing one voice production effort, its manifest, assets, activity, notes, jobs, exports, cache, and last workspace state.
- **Asset**: An immutable audio or transcript input/output with provenance.
- **Take**: A playable audio Asset created by recording, generation, conversion, dubbing, or patching.
- **Voice Profile**: Reusable speaker identity material, whether trained checkpoint or reference prompt.
- **Workflow Step**: One named transformation stage that consumes Assets and may produce new Assets.
- **Workspace Page**: Speech to Text, Voice Training, or Voice Manipulator.
- **Manipulator Mode**: Voice Over, Voice Isolator, Voice Changer, Voice Dubber, or Voice Patch.
- **Script**: The time-aware transcript document shown and edited in the Script module.
- **Transcript Candidate**: A realtime, accurate STT, AI-corrected, or user-corrected option for one Script span.
- **Module**: A reusable deep UI or backend capability with a small interface and hidden implementation.
- **Engine**: An upstream AI implementation such as OmniVoice.
- **Adapter**: Pro4Bro code satisfying an interface at the seam between the app and an Engine.
- **Project Manifest**: Portable `project.json`; `projectPath` and `location` are `.` on disk and become resolved runtime paths only in memory/API responses.
- **Recent Registry**: Disposable app-level index pointing to project manifests; it can be rebuilt with Open Existing.
