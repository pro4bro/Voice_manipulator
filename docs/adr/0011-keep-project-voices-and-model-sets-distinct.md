# ADR 0011: Keep Project Voices And Voice Model Sets Distinct

## Status

Accepted

## Context

The training implementation now publishes a `ProjectVoice`: one usable,
project-relative clone, LoRA, full checkpoint, or RVC model with a reference
clip. Plans 03-03 and 03-04 require a stronger deliverable called a Voice Model
Set: one Speaker Profile, a shared identity anchor, compatible neutral and
per-emotion artifacts, reproducible lineage, and a similarity gate before the
set can publish.

Treating the existing `ProjectVoice` as if it replaced the set would make the
current UI usable quickly, but it would silently discard the exact safeguards
the set was introduced to provide. Renaming every existing voice into a set is
also wrong: a zero-shot clone or RVC checkpoint is legitimately useful alone,
and a set can contain several generated-voice artifacts.

## Decision

Keep both concepts.

- `ProjectVoice` remains the implementation record for one addressable Voice
  Model and keeps its current API/storage compatibility.
- Voice Model Set becomes a separate project-owned publication aggregate. It
  references compatible Voice Model IDs and records the Speaker Profile,
  identity anchor, Dataset Manifest hash, engine revision, training config,
  adapter roles/emotions, and similarity-gate protocol/results.
- Existing publication may honestly say that it produced a usable project
  voice. It may not claim that a Voice Model Set published until the aggregate,
  lineage, and gate exist and pass.
- Voice conversion models may remain standalone Voice Models. They preserve a
  performer's emotion and do not need to masquerade as a text-generation
  emotion set.

## Consequences

- No breaking rename or data migration is required for current `ProjectVoice`
  consumers, Voice Vault, generation, or Voice Changer.
- Plan 03-03 remains incomplete despite the current `_publish_voice` path.
- Plan 03-04's identity lock has a concrete boundary: generation can switch
  emotion only among Voice Models named by one published set.
- The future set schema must reference project-relative artifacts and preserve
  the portability contract; shared base-model bytes remain machine-local.
