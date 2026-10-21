# LipSync rounds71–75 — runtime, reviewed faces and actual artifacts

Date: 2026-10-21. Owner explicitly authorized five more rounds. ADR0124 records
the implementation contract and limitations. All five prototype slices are
implemented; production visual/identity quality and other engine pipelines stay open.

## Per-round evidence

| Round | Implemented slice | Verification |
| --- | --- | --- |
| 71 | Isolated runtime, pinned checkpoints, readiness | Python3.11.9, Torch2.3.1+cu121, torchvision0.18.1, OpenCV4.9, diffusers0.30.2, transformers4.39.2, numpy1.26.4, librosa0.11.0; pip check passes; actual CUDA tensor probe passes; runtime report(verify=True) passes for analysis/render |
| 72 | Scoped YuNet/SFace gallery | Real API/UI analysis: visible scope8 observations/8 sampled frames; full-source12/12 across two footage assets. A recurring face retains the same proposed ID across the cut inside one analysis |
| 73 | Revisioned Face ID correction and Speaker mapping | API tests cover correction/split, unknown profile rejection, revision and scope conflicts; browser explicitly reviews every example and saves both identity/profile bindings |
| 74 | Speaker-turn/face schedule | Actual visible render writes exactly sun frames0–24 plus yongen40–49:35 applied,45 skipped. Full-source writes sun0–39 plus yongen40–74:75 applied,55 skipped. This proves wrong-person/offscreen turns and hidden-layer intervals are treated differently |
| 75 | Durable jobs, MuseTalk execution, QC, After/export/cancel | Actual MP4 composition and two full-source derivatives; full decode, dimensions/duration/audio/hash QC; 206 Range routes; shared Timeline audition for Before/After; actual running worker cancellation returns GPU lease and creates no After |

## Actual fixture and artifacts

Ignored fixture: `.scratch/lipsync/runtime71/`. Project:
`projects/musetalk-research-fixture-not-client-footage/` within that folder.
Uses MuseTalk's local research-only sun/yongen samples and speech. **This is not
client footage or an app-generated voice quality acceptance.** One sample is an
animated character; this is not a real two-human simultaneous-face quality gate.
Do not bundle or redistribute these samples.

- Visible analysis: `a372de63-dc39-4331-b83b-f1bf8af79cd1`.
- Visible render: `163c9bdd-5705-4c32-91a2-98cbafbf5b08`,4s/CFR25,
  applied35/skipped45. Browser found canvas chosen from clip array order; fixed
  to use the first actually visible shot before the full-source rerun.
- Full-source analysis: `6ff66d91-21d4-4ece-a198-c730a613de56`.
- Full-source render: `ec263388-67d1-4e9e-b68d-b00014254259`, composition4s,
  source-yongen2s, source-sun4s;640×854/CFR25, audio24kHz/mono on all three.
  All3 decode and return206 for Range bytes0–63. Exact75 patch filenames match
  the expected schedule. Source originals remain unchanged.
- Repeat full-source job: `f0bc66f1-94bc-41e3-a145-cbc7cf9a2ddb`, again75/55
  with all3 verified artifacts. Retry is a new snapshot, not bit-identical RNG replay.
- Running worker cancelled: `8a1d2959-01ed-4ad5-9021-7f35fbe59c39`;
  status cancelled, no after.mp4, `/api/gpu-lease` returns null.
- `artifact-check.json`, per-job `artifact-schedule-check.json`, `cancel-check.json`
  and each job's request/result/status/log preserve local evidence.
- Screenshot: `.scratch/lipsync/runtime71/lipsync-after-ui.png`, After at0.40s,
  profile mappings and scrolled audio waveform visible. A paired still is in
  `before-after.png`; mouth pixels change while the sampled upper face/body remain
  visually coherent. Motion/phoneme quality acceptance is still false.

## Tests and corrections

- Full frontend: **1153 passed/142files**,176.29s. Collected before the new
  processing test; final focused **74 passed/7files**,15.95s, includes it and
  WorkspaceShell. Logs web71-75.log and final-web71-75.log under .scratch/lipsync.
- Full API: **1224 passed/3warnings**,635.51s. Collected before the jobs/artifact
  tests and later corrections. Final focused **37 passed/2warnings**,4.99s;
  additional affected catalog consumers **81 passed/2warnings**,12.34s.
  Final cleanup adjustment: jobs/artifact **3 passed**,1.45s. Logs api71-75.log,
  final-api71-75.log and catalog-regression71-75.log.
- Final typecheck/build pass,201 modules (index-C8hySGtt.js).
- Runtime dependency check, pinned model hashes, source Git cleanliness and
  untouched engines/OmniVoice checked. No portable release or upstream edits.
- Re-ran the manifest-based provisioning script after refactoring: all6
  components reused their verified bytes and emitted complete receipts
  (provision-recheck71-75.log); no replacement checkpoint download was needed.
- Initial settings test lacked mocks for new processing endpoints: fixed mocks,
  then the focused suite passed. A Windows reader/writer sharing failure in the
  new job test led to shared locking for status reads/writes;24 affected tests
  passed afterward. GPU release now runs even if final status persistence fails.
- Browser corrections: pending reanalysis now selects the new result instead of
  reopening the old gallery; stale scope blocks old review; After shares Timeline
  clock/audio; video intrinsic height no longer crops portrait footage (measured
  video/screen height both305.40625px); gallery uses the full right-column width.

## Open gates

- Actual generated voice/client-footage lip timing, motion, identity, seams and
  calibrated confidence; two faces in the same shot/overlapping speech quality.
- Identity continuity across separate analyses and Preview ID overlays.
- Full MuseTalk native realtime/v1/cache pipeline; LatentSync/Wav2Lip adapters.
- Face replacement and automatic selective Voice Over repair/invalidation/reuse.
- Checkpoint/dependency license and redistribution review before packaging.

Official model cards used for the detector decision:
[YuNet, MIT](https://huggingface.co/opencv/face_detection_yunet),
[SFace, Apache2](https://huggingface.co/opencv/face_recognition_sface).
MuseTalk's [model card](https://huggingface.co/TMElyralab/MuseTalk) distinguishes
the model/code permissions from its research-only test media and dependency terms.
