# MEDIA-STAGES-02 — add omitted tracks

2026-10-04. Starting checkout `e885434`, clean. Completed-container stream
materialization is implemented in API and Media Pool. Tick Import on a previously
omitted track to add its analysis under the same footage. Existing-track ticks
withdraw/restore work without erasing source. STT is an explicit subsequent
choice; no recognizer output is fabricated by this gate.

## Evidence

- Real MKV/MOV/MP4 import regressions add the omitted stream, retain source bytes
  and old analysis bytes, return the same child on retry and survive reopen.
- Five new backend tests cover concurrent addition, cache/original source modes,
  move/Open Existing, failed decode/index publication and retry, invalid/recycled
  or still-growing targets, and idempotent HTTP addition from a local source.
- Running browser on private API/controller/Studio adds Track 2 without F5,
  displays two waveforms under one footage, and retains two tracks after reload
  and project reopen. Console has no warning/error. No owner project or runtime
  is changed. Screenshot: `.scratch/media-stages-02/browser.png`.
- Companion JSON checks original/project-copy equivalence, per-stream frequency,
  PCM format, duration, clipping and hashes. Generated 440/880 Hz source tests
  stream mapping; it is not evidence of speech recognition quality.
- Workspace regression retains the selected child's edited Script across a
  successful added-track refresh; UI checkbox regression covers add/withdraw.

Full backend: **552 passed**, two existing warnings, 176.91 seconds.
Final frontend: **475 passed in 55 files**; typecheck and production build pass. Relevant real container regressions: eight passed; new tests: five
passed. Final diff is reviewed and owned services/tab close before commit.

## Boundary and next

Completed-container scope is accepted. Active growing MKV requires Finish before
adding an omitted stream; dynamic follower stream-set changes are separate work.
Uncached external sources still need the original file/registry to decode a
previously omitted stream. Already materialized WAVs remain project-owned.
An unpublished derivative may remain after decode/publication failure, but no
false Media Pool/STT row is published. See ADR 0043 for the atomic index contract.

Exact next queued round: **MKV-FOLLOW-03**, measure long multitrack backlog and
optimize one bounded decoder/cursor seam. 19A timing/physical gates and 19B
recognition acceptance remain open; no training/product phase advances.
