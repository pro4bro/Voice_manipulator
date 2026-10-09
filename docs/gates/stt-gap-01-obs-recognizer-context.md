# STT-GAP-01 — OBS recognizer gap and bounded request context

Started 2026-10-09; completed 2026-10-10. One bounded round. No owner
transcript replacement or word-accuracy gate is claimed.
Product commit: `2ebada4`.

## Reproduced symptom and attribution

Owner project `test-obs-9-f4e60d5e`, recording
`13b6cb03-2dfc-4b75-a05e-dd795c70d549`, Channel1
`3D2DCFD1-4FE8-4C10-A8E8-A08D5B2E96B5`, asset
`asset-live-05d3d2248f2d`. The saved 1,094-word detailed transcript has no
words between 240.352 and 269.020s. Its job reports complete/100/null error.
The source has durable, continuous PCM and final realtime text in this region.
Historical detailed-STT checkpoints are absent; the original runner cannot be
identified conclusively. Their absence and the ordinary queue artifact support
the ordinary archived-footage STT path, which submitted the entire analysis WAV.

The read-only collector was retained in `.scratch/stt-gap-01/transcript-evidence.*`.
An assertion against the owner words reproduced zero words in this interval.
Ranked probes distinguished recognizer omission, overlap merge loss and project
publication loss. Replaying real full native PCM through the product OBS adapter
and existing Studio reproduced **1,094 words, zero gap words** before merging;
merged and stored results also had 1,094. An isolated trace of actual
Faster-Whisper segments reproduced the same text/timing; it emitted no speech
segment in the gap. Six other raw word records lacked valid timing, but they do
not explain the missing 28.668-second segment. Phrase-edge refinement does not
remove words. This replay attributes the large gap to recognition, before merge
or project persistence; it does not establish the recognizer's internal decoder
failure mechanism or reconstruct the missing historical checkpoints.

Silero's default speech intervals include 245.584–301.584s, so VAD removal does
not explain the entire gap. A full-recording private candidate disabling only
`hallucination_silence_threshold` returned identical text and word timings and
was rejected. Production VAD, decoding, language detection and guard settings
remain unchanged.

## Accepted repair and real evidence

The common `MediaImportProcessor` now splits Studio recognition into **60s owned
intervals with 2s source padding on either side** (normally at most64s/request).
The former89.1min threshold was a transport ceiling, not an adequate recognition
context policy. Initial OBS snapshots still freeze and publish their whole
committed interval per ADR0025; their internal recognizer requests are bounded.
Ordinary archived footage uses the same change. Other engine adapters and the
provisional live recognition path retain their settings.

| Replay | Total stored words | Words in reported gap | Requests |
| --- | ---: | ---: | ---: |
| Original/full-context baseline | 1,094 | 0 | 1 |
| Private60s common importer | 1,177 | 77 | 7 |
| Production detailed snapshot copy | 1,177 | 77 | 7 |
| Production ordinary `transcribe_existing` copy | 1,177 | 77 | 7 |

The private importer took68.765s wall/63.83s summed Studio time; ordinary archive
production replay took68.609s/63.86s. Cold full-context baseline took141.219s/
138.83s. Cache/load state differs, so these are retained observations, not a
controlled speed improvement claim. All runs use existing cached large-v3,
CUDA/float16, Faster-Whisper1.2.1, CTranslate2 4.8.1, Torch2.8.0+cu128 and
Transformers4.57.6. No engine/model download or upstream edits occurred.

Raw context words are owned by their primary interval. Padding can recover a
missed word only when it does not overlap an existing owning interval. Owning
words win conflicting text; recovered words are sorted globally before text/SRT
assembly. Untimed recognized segment text cannot safely be assigned to overlap
intervals: a text-bearing `needs-alignment`/empty-word result fails clearly
instead of silently publishing only other timed chunks. This does not fabricate
word timing or relax the existing alignment/quality gates.

Final merge replay of the seven retained real archive responses preserves exactly
the same1,177 word records/timings and text as the accepted context candidate.
Publication has **zero overlapping or nonpositive intervals**. Existing timing
warnings remain: three untrusted words on the native-rendered snapshot and four
on the exact analysis-WAV archive route; the recovered77 words are retained.

## Isolation, artifacts and validation

`scripts/profiling/stt_gap_01_obs_replay.py` makes a minimal independent copy of
the selected project/media index, analysis/words and acknowledged channel PCM.
It uses a fresh output directory, local cached model and loopback Studio only;
each submitted WAV, raw recognizer response, aggregate and final words are
retained. It supports detailed and ordinary archive routes. Example:

```powershell
.venv/Scripts/python.exe scripts/profiling/stt_gap_01_obs_replay.py --source data/projects/test-obs-9 --output .scratch/stt-gap-01/new-archive-replay --recording 13b6cb03-2dfc-4b75-a05e-dd795c70d549 --channel 3D2DCFD1-4FE8-4C10-A8E8-A08D5B2E96B5 --asset asset-live-05d3d2248f2d --window-start 240.352 --window-end 269.020 --route archive
```

Retained evidence is under `.scratch/stt-gap-01`: `snapshot-*`, `guard-*`,
`vad-probe.json`, `inner-chunks`, `production-replay`, `archive-production-replay`,
`audio-audit.json`, `final-merge-audit.json` and test logs. It is private ignored
diagnostic data, not a model publication or portable owner project substitute.
Both production copies hash **1,325 source files unchanged** before/after.
The original still has1,094 words and zero gap words after all probes.

Each request is PCM16 mono24kHz and matches the corresponding source PCM slice
byte for byte. Native rendering has9,753,726 frames; the original analysis WAV
has9,753,731 (five extra tail samples). Both routes were tested independently.
Request slices contain five existing full-scale samples; no new clipping,
silence or boundary samples were introduced. Original MKA and both analysis WAV
hashes also passed the initial read-only source audit.

- Caller regression failed before the context fix: a long recognizer response
  omitted the gap word. It uses real FFmpeg and a synthetic recognizer response
  pattern; real audio/model runs above provide the recognition evidence.
- Legacy actual-method probe reproduces untimed text disappearing from merge.
  Two parameter cases now reject it explicitly.
- Leading recovery and ordering regressions failed before their fixes; trailing
  recovery and conflicting owner-word checks pass. The old duplicate fixture
  used disjoint intervals, so its context timestamp now actually overlaps the
  owning word while retaining its original expected output.
- Focused media/OBS/timing suite:31 passed, two existing deprecation warnings.
- Final full API suite: **718 passed**, two existing deprecation warnings,
  194.26s; `.venv/Scripts/python.exe -m pytest services/api/tests -q`.
- Intermediate full suites:713 and715 passed with two existing warnings before
  the subsequent merge review repairs; they are not the final gate.
- Frontend source is unchanged. USER-FEEDBACK-15's696/77, typecheck/build are the
  carried frontend baseline, not new checks in this API round.
- Final diff check and replay-script compilation pass. No product debug tracing
  remains; private recognizer instrumentation lives only under `.scratch/`.

An initially drafted outer-snapshot block test was removed after ADR0025 and the
ordinary caller were verified; changing that contract would not fix this owner
path. No browser workaround, new physical capture or service restart was used.
Owned inference requests reused Studio's queue; the isolated recognizer probe
finished and released its process without terminating owner runtimes.
Closure controller reports running/API running/Studio running, busy=false;
API and Studio health are ok. The running API still needs restart for new code.

## Remaining gap and exact next round

**STT-GAP-02**: review the recovered77 words against this audio and screen the
60s policy on other long speech/silence and boundary samples before claiming
general lexical accuracy. New text being present is not CER/WER or reviewed
word-IN/OUT truth. STT-TIMING-ACCURACY-01 and existing Phase03 budgets remain open;
Phase03 stays60%. Normal app restart is required to load the changed API module.
The owner must explicitly rerun the selected footage to replace its old STT.
Native/audible/UI acceptance remains UX-EDITING-DEVICE-01.
