# UX-08B — two physical recordings and footage lifecycle

Date: 2026-10-03. Source baseline: `8eb92d0`.

Verdict: **passed after repairing recording-selection feedback**, for two
controlled speech sources. Full owner hardware, live latency and STT accuracy
acceptance remain separate. Only frontend selection logic and its regression
change; backend/native/Studio/engine source is unchanged.

## Physical setup and media

All product service ports and OBS were initially stopped. Scratch-only wrappers
run controller/API/Studio on supported ports 18119/18120/18081 with an independent
registry and project under `.scratch/ux-08b/projects/`. They reuse the controlled
portable OBS from CAPTURE-10B and its unchanged packaged bridge 0.6.9. The copied
unclean-start sentinel is retained before launching OBS successfully. No owner
project registry, OBS configuration or engine source is edited.

Two muted OBS sources explicitly forwarded as Track 7/8 play independent speech
fixtures. Fixture audio comes from the existing 11C speech WAVs: each take uses
a different 12-second excerpt plus four seconds of silence, mono PCM16 48 kHz.
The scratch project is configured with English; the recognizer's English output
is not evidence of accurate Vietnamese transcription. Each fixture repeats.

Native OBS StartRecord/StopRecord run twice in **the same OBS process, PID 70780**.
No replayed HTTP chunks substitute for physical capture.

| Take | Recording ID | Duration s | MKA parent | Durable PCM chunks |
| --- | --- | --- | --- | --- |
| 1 | `55224012-05b6-5dc9-9572-0340de313d6a` | 29.928158 | `asset-live-737591d31c1c` | 29 + 29 |
| 2 | `fa1f74e5-5589-5eb8-bdd5-f60092ba1692` | 43.773155 | `asset-live-2d90e3b45d7a` | 34 + 34 |

Each take produces one MKA parent with two analysis children, not three footage
rows. The two archives have different hashes and two FLAC streams each. All
126 PCM chunks pass sequence, declared frame size, source UUID and SHA-256
checks with zero interchunk sample gaps. Both full archives decode. Child
asset/parent/stream/track-UID mappings match journals. Analysis WAVs are mono
PCM16 24 kHz and match their recording duration within 10 ms.

## Failure, regression and repair

Selecting take 2 in the original browser can leave Timeline's selector and audio
on take 1 while Script requests take 2. API logs show repeated waveform and
transcript requests alternating between recording IDs; browser alerts say
Failed to fetch. `before-selection-fix.json` retains that disagreement.

Timeline synchronizes requested identity into local state in an effect, while
another effect reports the previous local identity back to the workspace.
The regression changes requested identity in both directions and asserts no
stale notification. Before repair it fails with callback `recording` after
requesting `recording-2`. Requested identity now precedes local state when
resolving the recording during render. Explicit Timeline selection still
notifies its caller. ADR 0038 records this ownership rule.

Initial scratch live STT also times out. The copied harness omitted a model
cache locator; the scratch launcher is corrected to the existing offline model
cache, then its owned API/Studio restart. A direct medium-model fixture smoke
passes in 1.860 seconds. Recovery eventually produces different nonempty final
events on both channels of both takes. The original five/three error events
remain in evidence. This is not a complete-live-prefix or accuracy pass.

## Browser after repair

- Load the rebuilt app, open the project, select each footage through Media
  Pool, then switch back. Script recording identity, Timeline selector and both
  audio URLs match the selected take. Both audio elements reach readyState 4;
  durations are approximately 29.93/43.77 seconds respectively. No final alerts.
- Actual transport playback advances both synchronized audio elements for each
  take. Take 2 reaches approximately 38.69 seconds and then its 43.77-second end;
  take 1 reaches its 29.93-second end. Track 7/8 selection controls are exercised.
- Remove take 1 through its Media Pool menu: one live footage remains and one
  grouped footage appears in Recycle Bin. API confirms deletedAt on its parent
  and both children, with take 2 unchanged. Restore through the rebuilt UI
  returns two footage. Original IDs and all six audio hashes remain unchanged.
- A complete independent project backup is retained before irreversible testing.
  The API permanently deletes only the scratch take-1 parent, returning 204;
  its three media records and journal discovery entry disappear. Take 2's three
  records and audio hashes remain. Reload/open the browser project: exactly one
  footage, no provisional ghost, correct take-2 Script and two ready audio tracks.
  The UI permanent Delete button/confirmation flow is **not** exercised; that
  broader list-action sweep remains UX-05B.
- Final browser warn/error console is empty. Successful test tab is closed after
  returning to Hub and releasing the project lease.

Ignored evidence under `.scratch/ux-08b/`: `take-1.json`, `take-2.json`,
`verify-media.py`, `media-acceptance.json`, `before-recycle.json`, `recycled.json`,
`before-selection-fix.json`, `first-after-fix.json`, `second-after-fix.json`,
`play-take*.json`, `permanent-delete.json`, `final.json`, `console.json`,
`restored.png`, `final.png`, and the full `retained-before-delete/` project.

## Validation and limits

- Initial unrestricted test run: 222 tests passed, 19 fork-start errors; not a
  passing gate. A two-worker retry has 463 passes and a 900-second fit assertion
  failure. The unmodified Timeline suite passes alone (30 tests); these failed
  runs are retained in the session evidence rather than reported as green.
- Final `npm test -- --maxWorkers=1`: **55 files / 465 passed**, 111.50 seconds,
  including the new stale-selection regression. Typecheck and Vite build pass.
- Backend 500 remains the historical 12L baseline, not rerun for this frontend
  repair. Full media assertions pass before permanent deletion. No new native
  build, detailed-STT, word-timing or inference-quality claim.
- Cleanup verifies OBS/app recording idle, lease absent, all Forward-off commands
  acknowledged, native spool `chunks=0`. Only owned test OBS and services stop;
  all three initially free product ports return to free, scratch session removed.

Remaining: owner physical devices, sustained inference/capture latency, natural
listener/disk failures, installation, video timing and full UI/DPI/list-action
matrix. The approximately 13-second live tail observed in CAPTURE-10B is not
repaired here. Exact next existing round: **UX-09B**, compare Layer/Column
controls, clipping and pointer hit areas at owner viewport/DPI. Correct media
identity and DOM tests cannot establish those visual interaction gates.
