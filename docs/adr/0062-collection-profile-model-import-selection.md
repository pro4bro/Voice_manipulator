# ADR0062 — Collection profile and model import selection

2026-10-09. Accepted for USER-FEEDBACK-15.

## Selection and identity

One Speaker Profile may own several ProjectVoice models. Collection entries are
grouped by the exact archived sourceProjectId and speaker.id. Display names are
labels, not identity; unrelated speakers with identical names stay separate.
This grouping does not create a Voice Model Set or imply coordinated publication.

In project import mode, a profile checkbox selects all of its models available
in the current Collection. Expanding the profile exposes individual model checks.
The parent shows an indeterminate state for partial selection. A fixed import
action remains in place, disabled with no selection; ticking adds no toolbar.
Changing Collection clears selection, preventing hidden entries from importing.
Hub browsing and model export retain their existing purposes.

## Transfer and retry

The existing single-entry API contract remains. UI imports selected entries
serially, flushing project catalog writes before every request. Each confirmed
result is merged immediately; successfully imported entries leave the selection.
If a later entry fails, completed copies remain and only failed/unprocessed entries
stay selected for retry. Status reports progress and partial completion explicitly.
Controls remain disabled during transfer to prevent changed targets or duplicate
submission. This is a series of per-entry transactions, not an atomic batch.

Workspace publishes the catalog snapshot to its transfer ref synchronously when
changing it. A subsequent flush in the same React turn must see the confirmed
import, rather than the pre-render snapshot.

The API reuses the destination Speaker Profile for the exact archived origin,
including subsequent imports and retry/reopen. Legacy origin is resolved through
existing import markers and archived entries. Existing duplicate profiles are not
silently merged. Manual destination profile edits remain authoritative.

## Consent artifact ownership

The shared profile's consent evidence belongs to the project under
assets/consent-evidence/<speakerId>, independently of any one model folder. Each
imported model retains its own archived consent snapshot for provenance/hash
verification. Deleting one model must leave the profile proof and the remaining
models available. Legacy proof is copied to independent profile ownership when
that profile is reused; the old file is retained. Paths remain project-relative.

Existing completed-checkpoint, published-set and artifact/hash gates remain.
Transfer tests prove copying and request selection, not generated voice quality.
Native checkbox/group layout and audible owner-model generation remain device
acceptance after loading the new UI and API.
