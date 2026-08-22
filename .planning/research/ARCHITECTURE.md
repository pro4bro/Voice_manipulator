# Architecture

## Seams

1. `ProjectRepository`: create, list, and read projects.
2. `VoiceEngine`: report status and later generate/train/clone voice.
3. `AudioProcessor`: advertise capabilities and later run isolator/changer/dubber processors.
4. `StudioModule`: a typed UI configuration consumed by page compositions.

## Dependency Direction

Frontend page -> shared UI module interface -> HTTP client -> backend route -> domain interface -> adapter -> engine checkout.

No frontend module imports an engine. No engine checkout imports Pro4Bro. Jobs and assets cross seams as domain records rather than engine-specific objects.

## OmniVoice Integration

`engines/OmniVoice` is an upstream Git checkout. Pro4Bro code lives beside it. The OmniVoice adapter receives its path through settings, inspects status, and will launch engine-specific workers in a dedicated runtime in later phases.

