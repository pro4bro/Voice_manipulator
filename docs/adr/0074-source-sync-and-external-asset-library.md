# ADR 0074 — Sync one app source; reuse an external core/model library

Accepted direction, 2026-10-13. SOURCE-SYNC-01 implements repository cleanup,
commit/push and operator documentation. External-library execution is the next
bounded round SOURCE-EXTERNAL-ASSETS-01; it is not implemented by this ADR.

## Owner decision

Use GitHub Desktop to synchronize current app code on the second machine first.
Commit existing work, clean redundant root BATs and temporary artifacts, and
push the current working branch. Future portable builds contain the complete
product source for a Git revision; heavy runtimes/upstream cores/base weights
live in one separately declared folder per machine. Reuse that library instead
of copying it with every build or applying an independent app payload.

This supersedes the portable update workflow as the preferred daily test route,
while existing numbered packs and their updater remain compatible. ADR0072's
source-first feedback rule still applies. No main-branch merge, engine update,
model deletion, project relocation or checkpoint rewrite is inferred.

## Boundaries and acceptance

- App source, product adapters and UI build belong to each checkout/release.
  The asset library owns runtimes, upstream engine checkouts and base models.
  Never synchronize product Studio code by overwriting a shared library copy.
- A local configuration holds the one library path and a format/version contract;
  no machine path or credentials are committed. Library compatibility and missing
  components are verified before launch. Explicit environment overrides retain
  clear precedence and diagnostics.
- Embedded Python path files may contain relative application paths. Merely
  changing a settings root or creating a junction is not proof of correct source
  loading. Test interpreter/module origin, controller/workloads and every engine
  seam against the current app before accepting external assets.
- Project media, trained voices and checkpoints remain project-owned and portable;
  the external base library does not absorb or discard them.
- The initial NoVibeVoice choice remains: descriptors are present, payload may be
  absent, and absent engines must not be reported runnable.
- Full-code portability must be validated independently from Git transfer. Git
  excludes dependencies/build output/data; cloning alone does not install them.

## Cleanup policy

Remove duplicate start/restart wrappers. Keep the canonical console, OBS install,
portable verify/update in root; move unique developer/legacy pack operations to
scripts/maintenance. Preserve old-name migration logic and historic gate records.
Remove identified scratch probes/logs/caches and known synthetic fixtures only
inside the verified checkout. Preserve owner recordings, project folders,
runtimes/models and delivered portable packs. Commit the outstanding research
documents as research, not as newly verified product acceptance.
