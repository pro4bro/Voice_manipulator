# Voice Manipulator rounds16–20

Owner requested five further rounds on 2026-10-16. Starting point: dc95fcd,
clean checkout. The current ledgers supersede older memory suggesting rounds6–10.

## Ordered scope

1. **VM-FIX-01**: inspect desired/completed sentence fingerprints, generate only
   missing valid clips, persist checkpoints, no-op replay, Stop/retry and stale
   revision protection. Initial duration edits support whole sentences; partial
   or cross-sentence acoustic anchors require review. No new conditioning claim.
2. **VM-FIX-02**: explicitly apply verified replacement clips to a new output;
   preserve immutable source and unaffected PCM, current gaps and downstream
   timing. Retain portable source/replacement lineage and undo/reopen identity.
3. **VM-FLOW-01**: pass an explicit output/selection/revision to Voice Patch;
   show missing prerequisites and reject late replies for another source.
4. **VM-PATCH-01**: use a selected trained voice (including its stored clean
   reference as required by the existing engine), preview replacement before
   explicit Apply, preserve original output and use actual-duration ripple.
5. **VM-PATCH-REF-01**: select surrounding same-speaker context with transcript,
   visible QC and provenance; generate context-only clone and explicitly Apply.
   No automatic same-speaker/noise/overlap certainty without supporting evidence.

## Frozen checks

- WAV PCM16 mono24kHz; source SHA256 unchanged; exact reported frame count.
- Fixed-duration requests must fit within one sample, with no audible truncation.
- Zero clipped samples; boundary step <=0.05 full scale, or refuse publication.
- Retry and replay must demonstrate inference invocation counts and artifact
  hashes; stale source/Script/edit/voice/reference replies cannot apply or clean
  newer changes. Failed/unsupported units remain pending or blocked.
- Browser/native Save, human identity/listening and calibrated word alignment
  are separate acceptance gates. Tests using generated tones cannot establish
  speech quality. Existing expressive/random conditioning and stretch latency
  gaps retain their meaning.
- Engine upstream read-only; local trained artifacts remain outside Git. No
  push or portable publication is included in this implementation request.

## Results

### Round16 — VM-FIX-01

API12/12 and affected UI18/18 pass, typecheck and build pass (164 modules).
Independent reviews repaired queued/latest-job/Start-after-edit/Stop races,
sequential row mapping, post-mapping native-duration preflight and the real
production TimingPlans canonical-row type boundary. Gap edits intentionally
request no TTS; no composition is claimed in this clips-only round.

Actual trained full voice produced64320frames (2.68s), mono24k PCM16,0clipped
samples. Source SHA256 unchanged, matching replay has0dirty units/no inference,
owned worker closed and GPU lease released. Receipt and audio:
`.scratch/vm-rounds16-20/fix-receipt.json`, `fix-full.wav`; elapsed293.67s includes
multiple complete model-content integrity reads, inference and cleanup.
Initial attempt to copy the 4.9GB training optimizer was interrupted; immutable
weights/optimizer now use local read-only hardlinks in the private fixture.
Older all-model cache failed current fingerprints and was not relabeled valid.
The actual gate therefore uses one real full-model source sentence; multi-unit
reuse/Stop/stale/failure invocation counts are established by API fake-engine
tests, not presented as a multi-human acoustic quality result.

This round publishes verified clips only. No new output is applied yet. Human
listening, identity, measured word anchors and browser/native UAT remain open;
CUA returned apps[]/browsers[]. Next: VM-FIX-02 composition/application.
