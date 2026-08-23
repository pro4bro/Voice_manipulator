# ADR 0005: Use A Project-Owned Training Catalog

## Status

Accepted

## Context

Voice Training must support several people, reusable environment references,
and stable settings without coupling UI modules to OmniVoice or to one machine's
absolute paths. Speaker and emotion attribution also needs to survive moving the
whole project folder.

## Decision

Persist Speaker Profiles, Environment Noise Profiles, and Training Settings in
`assets/training/catalog.json` under the portable project root. Media assets and
timed Script words reference catalog IDs. Keep automatic diarization, voice
isolation, environment learning, dataset compilation, and fine-tuning behind
separate application ports rather than embedding engine calls in UI modules.

## Consequences

- One project may prepare several named speakers for one future Training Run.
- Moving the project preserves identity, annotation, and training configuration.
- Denoising and Environment Noise Profile learning remain separate operations.
- Deleting or merging a Speaker Profile will require reference validation.
- A configured catalog is not proof that audio is training-ready; a verified
  Dataset Manifest remains mandatory before an engine job starts.
