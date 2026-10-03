# ADR 0040: Serialize project metadata transactions

Date: 2026-10-03. Status: Accepted. Round: PROJECT-WRITE-01.

## Context

Windows concurrent reopen/page mutations shared one `.json.tmp` staging file.
Seven of eight stress workers failed; deterministic tests also proved payload
replacement and a reopen snapshot overwriting a newer page update.

## Decision

Repository instances sharing a resolved registry root share a process-local
reentrant lock. Hold it around each public read or mutation, including migration,
adoption, manifest/locator writes and project activity. This prevents stale
read-modify-write updates through the single API process.

Each atomic JSON write stages in a unique file beside the destination, flushes,
fsyncs and closes it, then replaces the destination. Retry only Windows access
or sharing violations (5/32/33), at most six attempts and 310 ms total backoff.
Propagate persistent failures and clean staging files while retaining the prior
JSON. No API, domain term or persistent format changes.

## Consequences

Registry operations serialize, including catalog scans and destructive mutations.
Locks release when repository instances disappear. Individual JSON replacement
is atomic; the manifest and registry locator are not a crash-atomic pair.
Concurrent API processes sharing a registry are outside this transaction guarantee;
unique staging files alone do not prevent cross-process stale updates. Permanent
external handle/ACL denial remains an explicit error, rather than false success.

Portable paths and original media stay intact. Evidence is recorded in
`docs/gates/project-write-01-persistence.md`.
