# ADR0140 — Voice Output Sessions own independent Version copies

Status: accepted, 2026-10-24. Round VM-OUTPUT-SESSIONS-01.

Voice Output had a flat list of generated WAV artifacts while LipSync already
used Session → Version. Keep the generated outputs as immutable, project-owned
artifacts and add `scripts/voice-output-sessions.json` as an atomic, relative
project document for their grouping and active selection. Existing outputs are
adopted as one Version per Session; no audio is rewritten during adoption.

New Session creates an empty Version 1. The next newly discovered generated
output fills that active slot. Further independent generated outputs start new
Sessions. New Version explicitly copies the selected output's WAV and metadata
into a new output directory, records `sourceOutputId`, and copies its edit journal
under the new output ID. Subsequent edits and Undo/Redo use separate files. A
deleted output leaves its Version slot visible but cannot receive another take;
an output with a missing WAV remains identifiable and cannot be cloned.

The Script document remains project-wide in this round. Switching Voice Output
Versions opens their audio and existing Script-row restoration behavior; it does
not create an independent Script document or clone a processor job. Versions
share immutable `.clips` references where present. LipSync and Send To continue
to reference output IDs, so creating a Version does not rewrite their sources.
