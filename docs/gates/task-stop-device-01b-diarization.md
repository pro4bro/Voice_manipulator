# TASK-STOP-DEVICE-01B — real community-1 cancellation

2026-10-07. Real diarization No/Yes/rerun passes; parent device acceptance stays
open for Training/Generate, MKV/OBS and other installed engines.

## Fixture and observed execution

Continues the isolated current-source API/Studio/controller fixture from01A;
no original project, media or app preferences change. Existing configured model
access is copied only to ignored fixture preferences, with offline model flags.
No new terms accepted, token printed, network model download or identity claim.

- Browser two Stop keyboard activations open the Speaker Diarization Yes/No
  dialog. No drops the waiting74.52s footage to idle; active372.6s footage
  completes with actual labelled words and retained community-1 raw spans.
- This cached model completes the short warm batch before browser refresh can
  reliably catch Yes. Those completed attempts are not hard-stop evidence.
  A separate3726s WAV repeats the same6.21s speech600 times,178,848,044 bytes,
  mono PCM16/24kHz. Its import fixture has empty text and default complete
  metadata; no STT run or transcript quality is claimed for this added asset.
- The longer inference reuses actual worker59148, with an active job bound to
  that PID. GPU sample5972MiB/91%; browser dialog also shows GPU98%.
  Two Stop presses then Yes cancel this task, drop the pending task and reap
  worker59148. Studio worker/job maps are empty; OS PID lookup is absent.
  Post-stop GPU sample3675MiB/2% includes background desktop loads.
- A subsequent74.52s real diarization completes on new worker73644 and stores
  24 raw spans. The earlier completed long footage has120 raw spans and labelled
  words. Hard Stop preserves its full record; the cancelled long asset remains
  byte-for-byte unchanged during rerun and has no published spans.json.
- All seven analysis WAV hashes and the original source hash agree across
  cancellation/rerun. `verify_diarization.py` assertions pass and save
  `diarization-acceptance.json` in `.scratch/task-stop-device-01`.

Raw evidence: `dia-no-active.json`, `dia-no-complete.json`,
`dia-preserved-before-hard.json`, `dia-hard-gpu.json`, `dia-hard-after.json`,
`dia-rerun-start.json`, `dia-rerun-complete.json`, `diarization-events.jsonl`,
and the saved No/Yes DOM snapshots. Console has no errors/warnings. Screenshot
and mouse capture remain unavailable as documented in01A; keyboard/DOM proof
does not claim physical mouse acceptance.

## Observed gap and checks

Engine cancellation is correct, but the Activity Center footer retains an STT
task cancelled in01A and the cancelled diarization task. Queue cancellation
branches do not settle activity. Exact next01C repairs this reproducible UI gap,
then tests the new API with actual inference. Independent cancellation checks
remain meaningful; complete end-user Stop acceptance includes that follow-up.

Full checks pass: frontend560/63 files, host API650/two existing warnings
(195.09s), Studio22/two existing warnings, typecheck, build and diff check.
Logs use the `01b-` prefix under the fixture directory.
The working tree includes the pending01C queue/activity repair during these
suite checks; this running fixture still uses the pre-repair API loaded in01A.
Fixture/token/service cleanup follows01C. Training Resume still requires an
owner-selected project/Speaker and compatible manifest/checkpoint; no suitable
persisted training/generation acceptance artifacts were found.
