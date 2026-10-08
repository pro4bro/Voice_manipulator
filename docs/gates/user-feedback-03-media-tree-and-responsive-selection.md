# USER-FEEDBACK-03 — Immediate imports, media tree and responsive selection

2026-10-08. Bounded delivery of the owner's latest four Media Pool requests.
Baseline: dbee45c. Source and synthetic UI evidence are complete; actual device
interaction acceptance remains UX-EDITING-DEVICE-01.

## Delivered

- Browser choices immediately create animated pending footage slots before the
  import confirmation. Host choices appear before slow track inspection or
  cache choice. Queue/import/cache/error rows take over without a duplicate slot.
  Importing a filename already in the project still shows the new pending slot.
  Cancellation removes the choice; project changes discard local choices.
  Existing import controls remain available while independent jobs run. Reduced
  motion retains a static progress marker.
- Selecting footage commits selection feedback before deferred details. Long
  Script speaker turns now render a viewport window rather than thousands of
  word buttons; ChannelScript uses the same window. Text offset mapping is lazy
  for ordinary table viewing. Normal, imported multitrack and archived OBS
  Timeline overviews also bound subtitle DOM. Source words and timestamps are
  retained; distant words remain reachable and editable through source indexes.
- The Thư mục gốc button is removed. Folders are expandable slots with nested
  folder creation, visible parent footage and expandable tracks. Dragging footage
  into a folder, another folder or the root blank area preserves organization.
  The existing organization schema, project paths and source media are unchanged.
- Multi-select closes opened footage details and mounts neither Script nor
  Timeline data, preserving the list selection. Collapsing to one opens that
  footage/track. A late open response cannot undo a newer selection. Clicking
  Import/STT/DIA/Train applies its desired value to every eligible selected item,
  including tracks; all checkboxes update immediately while saving proceeds.
  Reversed bulk clicks are ordered per checkbox and older responses cannot
  restore a previous value. Failed saves roll back their affected fields.

## Evidence

Regression-first failures: the default 6,000-word Script speaker turn mounted
6,000 word nodes; a measured full-zoom Timeline also mounted 6,000 subtitle nodes;
multi-select still displayed another selected transcript; bulk checkboxes kept
their old values while the first API request waited. These fail before their
respective changes and pass afterward.

Final tests cover Script DOM <=768 and selecting/editing word5500; Timeline DOM
<=512, editing a sampled-out word5500 by its original time/index, and switching
to short footage while an old selected word index is still present; closed
multi-select detail constructors, a late detail response, immediate bulk intent,
rapid true/false writes, delayed host inspection, same-name import queue handoff,
folder/subfolder expansion and footage root/folder moves. Existing row deletion,
Find/edit, speaker assignments, scrub and stage activity suites remain passing.

- `npm test`: **602 passed / 69 files**, 22.01s. Includes the existing ignored
  `.scratch/footage-switch.performance.test.tsx`; tracked suite is 601/68. Its
  assertions now accept windowed DOM rather than requiring all 3,000 buttons.
- `npm run typecheck`: pass.
- `npm run build`: pass, 115 modules; JS761.09kB/gzip219.81kB,
  CSS248.16kB/gzip38.40kB.
- `.venv/Scripts/python.exe -m pytest services/api/tests -q`: **677 passed**,
  two existing warnings, 206.50s. Warnings: Starlette/httpx compatibility and
  deprecated `audioop`. Run serially after frontend checks; no readiness failure.
- `git diff --check`: pass; existing Windows LF/CRLF notices only.

The ignored JSDOM harness confirms an initial pending-details commit before word
rendering. It is not a browser INP benchmark or proof of actual STT responsiveness.

## Remaining acceptance — UX-EDITING-DEVICE-01

The previous browser tool policy rejection remains; no alternate browser/CDP/
shell automation was used. No normal service restart, real model/GPU task or
owner-media change occurred. Backend tests use their own disposable fixtures.
The normal listeners from the previous session remain outside this round's work.

After refreshing the updated UI, check:

1. Import several files, including a filename already present. See slots
   immediately, cache/import activity, and choose another batch while jobs run.
2. Switch rapidly between long, short and multitrack footage while real STT runs;
   the newest selection should win and the rest of the UI should remain usable.
   Scroll a long Script, seek a far word, zoom into subtitles, and edit its text.
3. Expand nested folder slots; drag footage in and back out to the root blank
   area, then reopen the project to confirm organization was saved.
4. Ctrl/Shift-select footage/tracks: Script/Timeline stay empty. Tick and untick
   each stage; eligible selected items change together. Collapse to one and
   confirm that item's data opens.

Real browser latency, estimated-row scroll stability, native chooser appearance
and audio behavior need device evidence. Older physical mic/OBS, reviewed
recognition/speaker/identity, download/cancel and second-machine LAN/Tailscale
acceptance remain open. The unified Queue remains only the prior proposal.
Phase03 budgets and upstream engines are unchanged.
