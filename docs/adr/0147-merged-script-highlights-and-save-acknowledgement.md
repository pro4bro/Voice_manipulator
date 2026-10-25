# ADR0147 — Merged Script highlights and save acknowledgement

Date: 2026-10-25
Status: Accepted
Round: VM-MERGED-SCRIPT-SAVE-01

## Context

The owner reported whole-turn blue highlights after legacy row grouping and a
repeatedly appearing unsaved/unchecked-out Version warning, with Reset blinking.
Read-only inspection of the reported project found two rows and120 segment
definitions, of which only two were referenced. Its first row had1159 words and
differed from the generated snapshot; the second961-word row was unchanged.

## Decision

Compare long turns exactly, retaining the existing LCS match order and deletion
anchors. Rolling LCS scores and one direction bit per token pair replace the
full Uint32 score matrix. Remove the one-million-pair whole-row highlight
fallback; row length alone does not make unchanged words pending. Pending edits
and completed fixes continue to use their existing generated/Full snapshots.

The Script hook's persisted signature represents the actual server document,
before frontend normalization. Removing unused legacy segment definitions is a
real document change and must be saved before a Version state can refer to it.
Compare JSON objects by value with recursively sorted keys, retaining array
order. Apply the same acknowledgement rule to initial loads and Version checkout.
No backend revision fence or selected-Version check is weakened.

Version autosave stops on an error, retaining the error and idle state until an
explicit operation retries it. Starting each automatic retry previously cleared
the error and toggled busy, which also toggled the layered Timeline Reset button.
Do not hide this problem by changing the toolbar's write guard or error styling.

## Consequences

No persistent format, engine, source audio or composition behavior changes.
Existing normalized Script data saves once through its normal revisioned API;
original generated/Full snapshots and migration backups remain available.
Tests cover long sparse/repeated edits, faded fixes, normalization on load and
checkout, reordered JSON keys, and delayed409 followed by idle and explicit retry.
The gate records read-only real-project results and actual API contract checks.
Native visual confirmation remains separate while Browser access is disabled.
