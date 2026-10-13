# PORT-REBUILD-01 — fresh portable with a deferred base

2026-10-13. The owner requested a new portable containing the current source
application and a copy map for heavy cores/models. VibeVoice stays listed but its
payload is excluded. Phase 03 stays at 60%.

## Changes and observed cause

The builder now rebuilds the web distribution by default and copies app files
independently of the runtime/model layer. The Studio application comes from the
canonical source folder, rather than an older generated runtime copy. A deferred
base build contains the complete app, a twelve-component copy plan and a Vietnamese
guide. It remains explicitly incomplete until the root VERIFY BAT passes all
runtime gates. Finalization is atomic and refuses a missing, failed, mismatched
or empty report. Native PowerShell replacement uses `[NullString]::Value` for
the absent backup path; ordinary `$null` is coerced to an invalid empty path.

The overlapping stopped OBS row was a shared UI defect: its Retry button became
a fourth direct grid item and landed in the narrow expansion column. Grouping
the actions fixes both source and portable. In the real browser, the old Retry
was 12 px wide and 45.59 px tall. Source and alpha 0.5.11 each give it
65.328125 x 30.1875 px, entirely inside the 252 x 74.375 px footage row.

Fresh-folder review also found that the OBS installer retained an old canonical
console path when the old and new portable folder names differed. It now migrates
recognized `Pro4Bro-Portable-*` console paths, including deleted old folders,
while preserving pairing credentials, API base and custom settings. Four native
install/repair cases reproduced the defect before the fix and pass afterward.
Unrecognized custom launchers retain the existing preservation rules.

The owner's meter-without-recording symptom has a separate boundary. A plugin
meter heartbeat does not establish durable PCM ingress. A controlled take with
meterPeak 75.0 but no PCM chunk produces zero JSON/PCM chunks and the exact error
shown by the owner: `OBS source stems are missing; rebuild them from retained
chunks.` Source and portable both pass the positive PCM-to-MKA path. This
reproduces the failure condition; the actual D-drive take and plugin outbox were
not inspected, so its physical cause is still unconfirmed.

## Issued artifacts

Product commits:

- `478c87f872549c4dce6b47d6b304e12b92759de5`: builder, deferred-base verification,
  shared OBS row layout and documentation.
- `f49b1e8fcb81be4f04424439bb13b2ef306e5185`: old versioned portable console
  launcher migration and four regressions.

MAKE automatically issued alpha 0.5.10 first. That candidate was rejected after
the fresh-folder launcher finding and moved into
`.scratch/portable-rebuild-debug/rejected-alpha-0.5.10/` for diagnosis. It is not
in the delivery directory. MAKE then issued **alpha 0.5.11** from `f49b1e8`, with
the working-tree flag recorded. No issued app bytes were edited afterward.

- Folder: `.scratch/portable-release/Pro4Bro-Portable-alpha-0.5.11-NoVibeVoice`.
- ZIP: `.scratch/portable-release/Pro4Bro-Portable-alpha-0.5.11-NoVibeVoice.zip`.
- ZIP size: **1,223,266 bytes**, approximately **1.17 MiB**.
- ZIP SHA256:
  `72a5c58ca797f66a1612fe7782ee0caef665be55d8dfbca567ccfdc94bf45825`.
- 158 physical files; 151 app manifest entries. ZIP integrity and every file's
  bytes were checked against the folder. All 151 app sizes/hashes match the
  separately numbered `App-alpha-0.5.11-NoVibeVoice` update payload.
- Packed component bytes: 4,105,734; entire delivery folder: 4,188,694 bytes.
- Expected complete component bytes: **38,205,124,406**, about **35.6 GiB** before
  user projects, recordings and future caches. Twelve deferred components account
  for 76,057 files and 38,201,018,672 bytes. The four relative HF cache symlinks
  resolve inside the validation root; copying them as regular files adds roughly
  78 MB instead of retaining links.
- Exactly four root BATs: `open-pro4bro-console.bat`, `INSTALL-OBS-PLUGIN.bat`,
  `UPDATE-PORTABLE.bat`, `VERIFY-PORTABLE.bat`.

The ZIP intentionally contains no heavy base. `.bundle-incomplete` remains and
`baseLayerReady` is false. The source absolute paths in `COPY-CORE-MODELS.md` are
copy instructions only; shipped application/runtime paths are relative.

## Checks and actual artifacts

| Check | Evidence |
| --- | --- |
| Native builder and deferred completion | 9 passed, 13.12 s |
| OBS installer suite | 33 passed, 19.05 s; two existing warnings |
| Frontend final full run | 785 passed / 84 files, 210.35 s, `npm test -- --maxWorkers=1` |
| Frontend typecheck/build | Both pass; builder and MAKE also rebuilt the current distribution |
| Backend final full run | 799 passed, 329.76 s; two existing deprecation warnings |
| Source NoVibeVoice runtime gate | 24 passed / 0 failed |
| Thin portable root VERIFY before copying base | 16 passed / 17 failed, exit 1; incomplete flag retained as required |
| Independently hydrated portable root VERIFY | 33 passed / 0 failed, exit 0; ready flag and timestamp set, marker removed |

The first parallel frontend run had 783 passes and two timing failures in
ChannelScript/Timeline; those unchanged files passed all 64 tests in isolation.
The two-worker rerun had 784 passes and one ChannelScript timeout. The final
serial run passed all 785 without weakening thresholds or editing tests. Initial
backend full run passed 795; the final run includes the four installer additions.

The validation copy is
`.scratch/portable-rebuild-debug/validation-alpha-0.5.11`. Its app is independently
copied from the delivery kit; only its heavy base uses local hardlinks to avoid
a second physical 36 GB copy. Its four relative cache symlinks remain internal.
The hydration harness initially counted symlink target sizes instead of symlink
entries. Correcting scratch inventory to lstat, matching native PowerShell,
allowed an exact twelve-component inventory. No product gate was weakened.

Real production API applications match **174 routes and eight catalogs**, with
no functional differences outside the intentional VibeVoice omission. All six
VibeVoice entries remain listed and unavailable. OmniVoice revision/branch are
separately recorded metadata differences: source Git metadata exists, portable
upstream `.git` is excluded. This can produce the existing hub label
`detached · undefined`; engine capabilities and installation status match.

Fresh embedded-core portable capture verification uses real nonzero PCM,
FFmpeg and FFprobe in an owned scratch project: 250 ms, 48 kHz mono PCM16,
12,000 frames / 24,000 bytes, durable ACK true. It produces a verified **4,872-byte
MKA**, a **773-byte manifest** and a **24 kHz mono analysis WAV** with 6,000 frames,
12,078 file bytes and 11,901 nonzero PCM bytes. The transient source WAV is
deliberately removed after publication; retained chunks remain. The real portable
API/UI opens the published parent and child footage and displays MKA READY and
the Audit Mic waveform with no browser errors/warnings. This is a controlled
PCM pipeline check, not a native OBS or speech inference test.

Browser evidence (1280 x 720):

- `.scratch/portable-rebuild-debug/before-obs-slot.png` — old shared row.
- `.scratch/portable-rebuild-debug/source-obs-slot.png` and
  `source-obs-metrics.json` — corrected source row.
- `.scratch/portable-rebuild-debug/portable-obs-slot.png` and
  `portable-obs-metrics.json` — exact matching portable row geometry.
- `.scratch/portable-rebuild-debug/portable-pcm-footage.png` — real published
  MKA/child/waveform. Only runtime status is substituted for this isolated UI
  listener; media, journals, waveform and archive routes are real.

Other reports/logs: `catalog-parity.json`, `fresh-capture.json`, `hydration.json`,
`hydrated-verify.log`, `missing-base-verify.log`, `frontend-serial.log`,
`backend-final.log` under `.scratch/portable-rebuild-debug/`; capture audit and
positive/negative repros under `.scratch/portable-obs-record-debug/backend/`.
The package report is beside the delivery ZIP.

## Operator steps and remaining acceptance

1. Extract the new ZIP into a new folder. Copy all twelve guide components from
   the source checkout into the same relative paths. Do not replace the new app
   with old API, web distribution, scripts or Studio application files.
2. Run root VERIFY. Only zero failures marks the bundle ready. Then run root
   `open-pro4bro-console.bat`.
3. Copy the entire hydrated folder to the other machine. After its final location
   is chosen, close OBS and run root INSTALL to refresh installation/launcher
   configuration; reopen OBS. Future app updates use numbered folders inside
   `updates` and the root UPDATE BAT.

Exact next round: **PORT-FEEDBACK-UAT-01** on the owner's D-drive machine. Verify
the new folder, native OBS loading/pairing/Forward, durable PCM chunk counts and
outbox/rejection logs, then record a native take and test parent/child playback,
STT follow and repeated Recycle Bin operations. Machine-local OBS configuration,
devices, GPU/inference and UAC are outside what hash/catalog/controlled PCM
checks can prove. Independent STT-TIMING-ACCURACY-01 still awaits Conviction.
No user projects, OBS profile or standard source stack were changed.
