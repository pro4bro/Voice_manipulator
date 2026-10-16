# Checkpoint A — rounds26–30 timing and audition evidence

This batch adds conservative timing trust, explicit timing repair of saved audio,
source/variant audition and durable user listening assessments. Checkpoint A and
Phase03 perceptual/UI gates remain open. Phase03 stays60%.

## Delivered slices

| Round | Slice | Evidence |
| --- | --- | --- |
| 26 | Preserve actual recognizer trust and provenance; timing identity policy2 | Eight new RED regressions; affected API66 pass; original25 Vietnamese intervals preserved |
| 27 | Persisted timing jobs, owned Stop, checked proposals and immutable Apply | API8; actual cachedmedium ASR23/25 measured; identical WAV and source metadata |
| 28 | Shared source/variant player, region/head/tail/full crops | API7 plus production integration; UI4;24 real WAV crops and Range206 |
| 29 | Explicit listening, four ratings and notes bound to accepted audio | API8; UI7; no real human assessments fabricated |
| 30 | Frozen regressions, exports, private folder move/Open Existing | Receipt and verification details below |

ADRs0086–0089 explain the contracts. The source tree was frozen at48e737d for the
final broad checks; only reports and ignored artifact scripts changed afterward.
A separate read-only review of the audition/review integration found no actionable
defect. No new training, model download, TTS generation, upstream engine edit,
push or portable release occurred in this batch.

## Actual timing repair

The existing natural Vietnamese8s Patch composite `output-19c33d154a69` was
measured segment by segment through a private Studio instance using cached
faster-whisper medium. Production default remains large-v3. The ASR took158.36s
including cold startup; this is not an interactive latency acceptance.

The report records23/25 measured matches:17/17 before the target,2/3 within the
target,4/5 after it. Target words remain inside4.12–6.28s:

| Word | Start | End | Annotation |
| --- | --- | --- | --- |
| giọng | 5.800s | 5.920s | ASR measured |
| nói | 5.920s | 6.020s | Untrusted proportional estimate |
| mẫu | 6.020s | 6.280s | ASR measured with speech-edge adjustment |

These annotations are machine evidence. Human acoustic word review remains open;
an exact native target duration is not individual word timing control.

Apply created `output-9a94a020fc2a` with new word annotations and an unchanged WAV:
SHA256 `8df7b33eda41137d9a4e587d69cb225fb8a5687016867522eebd62ab6453e327`.
Original metadata/audio and accepted Patch history did not change. Apply is
idempotent and requires a proposal artifact; there were0TTS calls. The owned GPU
lease was released, Studio runtime released through its API, and only the private
server on18085 was stopped. Shared Studio on18081 was not restarted or stopped.

Opening this experimental proposal with production's different recognizer makes
it stale by design: its saved medium identity does not equal large-v3. The already
applied immutable timing output remains valid. Reopening never starts inference.
The UI shows a generic source-change reason for this identity mismatch; the receipt
and model identity establish that source bytes did not change.

## Audition and assessments

Three previously accepted variants share source, target, replacement text and
native2.16s policy: context clone `output-19c33d154a69`, trained LoRA + clean
reference `output-c90492f8af9a`, trained LoRA + context `output-001b3b13ad2d`.

Actual HTTP tests retrieved source and variant for all four views per variant:
24 PCM16 mono24k WAV crops, plus Range206. Crops use250ms context around the
target or individual seams. Source identity is checksum checked; a changed/missing
original disables only source listening. No current Timeline reconstruction is
used. Testing exposed and fixed trained-media's different saved source location;
the regression failed before the fix. Source/output PCM stays unchanged.

The selected entry uses one audio player. Changing view/entry stops playback;
reading history or a plan does not autoplay. Component tests cover switching and
source failure. Native browser playback has not been accepted.

Listening assessments default to unassessed. Saving requires user-declared
listening and pins ratings/notes to output/audio/metadata/comparison identities.
Tests exercise saved/stale notes, corrupt-file preservation, revisions and late
responses using synthetic temporary projects. Actual three-variant GETs remain
unreviewed; no listening review file was written to the real private test project.

## Export and project recovery

Production HTTP tests passed before and after moving the private project into
`.scratch/vm-rounds26-30/Nghe và căn từ tiếng Việt`, then Open Existing with a fresh
API lifespan. Same project ID, three accepted comparison entries, source checksum,
all four output hashes, output metadata, LoRA adapter/reference/voice metadata and
manifest relative paths remain unchanged. GPU lease is free.

For each of four outputs, WAV downloads and44-byte Range checks pass. Line SRT and
CSV stay within0–8s. Original variants' word SRT skips3 estimated target cues;
repaired output skips2 untrusted cues across the whole clip. Repaired sentence SRT
now returns200 and skips1 incomplete sentence; original sentence exports return400
when no fully trusted sentence remains. A successful export is not acoustic timing
acceptance. The applied timing output is not relabelled as an accepted Patch
variant and cannot receive a Patch review through those routes.

Local reproducible scripts and JSON receipts live under `.scratch/vm-rounds26-30`:
`prepare26.py`, `trust26-receipt.json`, `real27.py`, `timing27-receipt.json`,
`real28.py`, `audition28-receipt.json`, `checkpoint30.py`, `checkpoint30-receipt.json`.
WAVs, model files, cached crops and speech remain local and outside Git.

## Independent acceptance still open

- Human A/B/C listening for identity, delivery and seam audibility; no strategy ranked.
- Acoustic word-boundary review and model support for individual word constraints.
- Browser layout/playback and native Save/cancel. Both CUA and Computer Use
  initialization failed with `failed to write kernel assets ... os error3`.
- Verified expressive emotion/whisper/shout/random conditioning and the existing
  preview performance budget. This batch does not claim those capabilities.

## Regression evidence

`npm test -- --maxWorkers=2`:898 tests pass across111 files, exit0,144.13s.
Vitest emitted one fork-worker shutdown timeout warning for TimingPlanEditor;
all assertions passed. No timeout, assertion, threshold or test selection was
weakened. Typecheck and production build pass (171 modules). This is component
and build evidence, not native browser playback acceptance.

`.venv/Scripts/python.exe -m pytest services/api/tests -q`:1085 pass, exit0,
657.11s. Three warnings: existing Starlette/httpx deprecation, audioop deprecation,
and the intentional duplicate-ZIP-entry rejection fixture. No test failed or was
skipped. Final `git diff --check` passes. Broad logs remain in the private work
folder as `api-full.log` and `web-full.log`.

## How to try the new controls

1. In Voice Patch, select a saved Voice Output, open **Căn lại timing lời đọc**,
   choose **Kiểm tra timing**, then **Đo lại timing từ audio**. Inspect coverage
   before choosing **Lưu bản timing mới**. Apply stretched/generated audio first.
2. Open **Lịch sử và so sánh bản vá**, choose **Đọc lịch sử bản vá**, then
   **Nghe đối chiếu** on one accepted entry. Switch source/variant and listening
   region using the single player.
3. Fill **Đánh giá sau khi nghe**, confirm **Đã nghe bản này**, then save.
   Ratings can remain unassessed; the application does not declare a quality pass.
