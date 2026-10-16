# Checkpoint A — rounds31–35 word review and recovery evidence

Date:2026-10-16. This is source/artifact verification, not whole Checkpoint A
acceptance. Phase03 stays60%. Each round has its own verified commit.

## Delivered

| Round | Slice | Focused evidence |
| --- | --- | --- |
| 31 | Saved-output word audition | API7, UI4/typecheck/build172;25 actual PCM-exact crops including2 untrusted words |
| 32 | Explicit word boundary review into a new same-WAV output | API13, word UI5 plus VoicePatch2; synthetic immutable Save/reopen/corruption/overlap cases |
| 33 | Portable Patch comparison JSON | API11, UI5/typecheck/build172;3 actual comparable variants with unreviewed ratings |
| 34 | Structured stale diagnostics and request-generation guards | API14, UI10/typecheck/build172; model/source/policy/proposal and select-away/back regressions |
| 35 | Frozen regression, project recovery and remaining-work register | Actual production HTTP checks below; final regression output recorded below |

New behavior tests failed before implementation. No assertion, threshold or
timeout was weakened. ADRs0090–0093 describe the persistence/API boundaries.
A separate read-only integration review found no actionable defect in the word
audition/review and comparison-report slices. Source/test files were frozen
atf30b77d for final broad checks; only docs and ignored scripts changed afterward.

## What manual word review means

The inspector uses the selected saved Voice Output, its WAV hash and canonical
metadata hash. It does not use a stretched preview or current Timeline render.
Reading/playing an untrusted word does not change its flags. It supports up to
600s/10000 words and requires structurally valid ordered intervals and owning
segments; it is not a repair path for malformed or overlapping saved metadata.

The user can propose start/end seconds, heard with200ms context and quantized
to24kHz frames. Neighbor/segment checks prevent overlap. An explicit confirmation
allows one selected word to be saved in the first UI; API batches accept unique
indexes. The new output copies the original WAV byte-for-byte, leaves all other
annotations unchanged, and records `user-reviewed` provenance plus original
timing values. Immutable source lineage retains preceding revisions. Repeated
Save uses the same checked receipt; corrupt/tampered cases fail closed.

This edits word annotations against existing audio. It cannot relocate spoken
words acoustically or make a TTS model obey user word anchors. Save/review tests
use synthetic temporary projects only. No person was claimed to have reviewed
the actual Vietnamese test artifacts.

## Actual private project checks

Private workspace `.scratch/vm-rounds31-35` copies prior accepted artifacts;
model binaries are hardlinked read-only and metadata/audio copied. There is no
new training, model download, ASR, TTS, upstream edit, push or portable release.

Production HTTP tests exercise repaired output `output-9a94a020fc2a`:

- 25 word crops equal the exact source PCM slices;200ms padding stays inside each
 owning Script segment.23/25 saved anchors are trusted,2 remain untrusted.
- A proposed shorter interval on an untrusted word yields the exact requested
 contextual crop and target-frame headers. This technical crop does not assert
 acoustic truth. HTTP Range206 succeeds.
- Saving with `reviewed:false` returns422 and creates no output/receipt. No
 `user-reviewed` marker is added to real speech. All source metadata stays intact.
- The comparison attachment includes all3 accepted variants with matching audio
 hashes and unreviewed/unassessed ratings. Export does not create a notes file.
 Snapshot key is identical before/after the folder move.
- The already-stale legacy timing job receives reason `identity`, preserving its
 historical terminal state. Production model islarge-v3; the old proposal's
 report remainsmedium. Newly diagnosed jobs have precise reasons; old causes
 are not retroactively guessed.

The contained private project moves to
`.scratch/vm-rounds31-35/Kiểm tra từng từ và đối chiếu`, then HTTP Open Existing
restores the same ID through a fresh app lifespan. All checks above repeat.
Four8s output WAV hashes/metadata, original media and LoRA adapter/reference/voice
metadata stay unchanged; manifest paths stay`.`. Word SRT still skips2 cues on
the repaired output and3 on original variants; line/word/table exports return200.
GPU lease remains free. No shared runtime is started/stopped by this batch.

Scripts/receipts remain local: `word31.py`, `word31-receipt.json`, `report33.py`,
`report33-receipt.json`, `comparison33-report.json`, `checkpoint35.py`,
`checkpoint35-receipt.json` and before/after comparison reports under the private
workspace. Speech, crops and models are not committed.

## Independent gates and next work

Both browser CUA and Windows Computer Use initialization still fail with
`failed to write kernel assets ... os error3`. Component and HTTP verification
do not establish native playback, Save or Cancel acceptance.

Human identity/delivery/seam listening and acoustic word review remain open.
Emotion/whisper/shout conditioning, audio execution of reference random schedules,
piecewise word anchors/linked media, and cold preview250ms performance need their
own evidence. The app does not infer success from capability tags or planner data.

## Regression verification

`npm test -- --maxWorkers=2`:905 tests pass in112 files, exit0,178.02s. No fork
shutdown warning occurred in this run. Typecheck and production build pass with
172 modules. Browser/native acceptance remains separate from these results.

`.venv/Scripts/python.exe -m pytest services/api/tests -q`:1107 pass, exit0,
554.78s. Three warnings are existing Starlette/httpx and audioop deprecations,
plus the intentional duplicate ZIP entry fixture. No tests were skipped. Final
`git diff --check` passes. Logs remain in the ignored work folder as
`api-full.log` and `web-full.log`.

The current owner-facing register is
`docs/VOICE-MANIPULATOR-REMAINING-ROUNDS.md`. It separates remaining Checkpoint A
acceptance and partial capabilities from13 planned downstream function codes:
3 Changer,3 Isolator,2 Emotion and5 Dubber. This is not a promise that13 execution
rounds suffice. Mobile/Convai/Digital Human need separate feasibility scopes.

## Try the new controls

Open a saved Voice Output in Voice Patch, expand **Kiểm tra mốc từng từ**, choose
**Đọc mốc từ đã lưu**. Select a word, listen, enter proposed start/end seconds and
listen again. Confirm **Đã nghe và kiểm tra biên từ này** only after checking by
ear, then **Lưu mốc từ thành bản mới**. The new output opens through the existing
output callback; the original remains in the output list.

In **Lịch sử và so sánh bản vá**, load history and choose **Tải báo cáo đối chiếu
JSON** for a group. User notes must first be saved through its listening form.
In **Căn lại timing lời đọc**, read the invalidation explanation before an
explicit refresh/measure. A stale proposal cannot be applied.
