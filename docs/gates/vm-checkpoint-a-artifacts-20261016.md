# Checkpoint A — rounds21–25 artifact evidence

This report separates implemented code and reproducible artifacts from the
independent perceptual/UI acceptance gates. It does not close all of Checkpoint A.

## Real natural-speech source

The private project copies existing models without new training or downloads.
Natural Vietnamese input is the existing LoRA reference: mono PCM16,24kHz,8s.
Its192000 PCM frames exactly equal source analysis frames2524560–2716560
(105.19–113.19s) from project test-6-fe93c66c, asset-25ed7814eb14.
PCM SHA256:1683a20bad642ed35108f48f6c9a1044c458a50f8b695d1cbaecb82e7d7696ed.

Source word indices321–345 retain persisted faster-whisper DTW timings, shifted
by the measured crop offset. No per-word intervals are invented. The imported
profile speaker-e0e174235270 is linked to original speaker-093ddbbc-2c4, Anh Vũ,
by the Voice Collection provenance. This is automatic alignment evidence, not
human word-boundary truth. Fixture review acknowledgement is automated and is
not recorded as human listening acceptance.

Target local words17–19 occupy frames98880–150720,4.12–6.28s. Replacement text
is `giọng nói mẫu`; each strategy requests native2.16s/51840frames. Source,
target, replacement text and duration policy match, yielding one comparison key.

| Strategy | Accepted output | Composite PCM | WAV SHA256 |
| --- | --- | --- | --- |
| Context clone | output-19c33d154a69 | 192000frames/8s | 8df7b33eda41137d9a4e587d69cb225fb8a5687016867522eebd62ab6453e327 |
| Trained LoRA + saved clean reference | output-c90492f8af9a | 192000frames/8s | 1ba1641d2689398b288dc00a32c8b158093e7f772d5b7f9b49ff4b9c39adde77 |
| Trained LoRA + source context | output-001b3b13ad2d | 192000frames/8s | 7ce42091902990adbc37160ed51d1d45568be06d70ab543ef5beba2a4127a4de |

All native replacements exactly51840frames, zero padding/trim/clipping,
delta0. Outside-target PCM is byte-identical, source SHA unchanged, splice
step<=0.05FS. Separate preview/Apply, repeated Apply and owned lease cleanup pass.
The clean model reference and metadata equal the original private source copy.
Elapsed23.72s context,118.61s trained,131.31s hybrid include startup and integrity
reads; these are not interactive latency measurements. CUDA device0 was configured;
no observed-device telemetry is used to claim an acceleration result.

## HTTP export and portability

Production routes return byte-identical WAVs and correct206 Range responses for
all three accepted outputs. Line SRT exports three ordered cues inside0–8s.
Word SRT excludes three estimated replacement cues and reports
`X-Pro4Bro-Skipped-Cues: 3`. CSV retains text and structurally valid times. Sentence
SRT correctly returns400 when no fully trusted sentence remains. No alignment
quality claim is made from CSV or line assembly boundaries.

The project moved within its dedicated scratch workspace to
`.scratch/vm-rounds21-25/Đối chiếu giọng Việt`. HTTP Open Existing restores its
same project ID. After a fresh API lifespan, all three history entries, comparison
keys, downloads and exports pass again with identical audio hashes. Manifest
`projectPath` and `location` remain `.`. Model metadata/reference and source hashes
remain unchanged. No new generation is triggered by history or reopening.

Local receipts: `natural22-receipt.json`, `context23-receipt.json`,
`trained-media24-receipt.json`, `hybrid24-receipt.json`,
`checkpoint25-receipt.json` under `.scratch/vm-rounds21-25/`.
The round21 assembly-based hybrid receipt remains separate from natural-word
evidence. Model artifacts and local speech are not committed to Git.

## Independent acceptance still open

- Human A/B/C identity, prosody and splice listening; no strategy ranked best.
- Acoustic review of naturally spoken word anchors and individual word constraints.
- Browser layout, interaction and actual playback; native Save/cancel workflow.
- Verified expressive whisper/shout/emotion/random conditioning and current
  preview performance budgets described by earlier ledgers.

Both Windows Computer Use (`node_repl` with `@oai/sky`) and browser CUA inventory
failed with `failed to write kernel assets ... os error3`. No browser or native
dialog result is inferred from component tests or HTTP downloads.

## Regression verification

Initial unconstrained frontend run:888/890 passed. ChannelScript's long-scroll
test exceeded its unchanged5s timeout; an isolated two-worker run passed that
file. The OBS draft-caption test still failed: its module-level recording time
aged before execution, crossing the existing4s live-caption display window.
Recording time is now refreshed within that test. Assertions and thresholds are
unchanged; no tests are skipped. All890 tests in108 files then pass with
`npm test -- --maxWorkers=2` (154.18s). Typecheck and build pass168 modules.
The original failing run remains recorded, rather than being relabeled a pass.

API source/tests stayed frozen at3370096 during the full API suite:1056 passed
in690.63s. Three warnings are two existing deprecations (Starlette/httpx and
audioop) and an intentionally duplicate ZIP-entry test warning. The frontend
fixture correction is independent of that Python snapshot. No product source or
API test changed during the run. The final diff check passes.

Remain on Checkpoint A acceptance work. No new Voice Changer, Isolator or Dubber
processor, portable publication, push or phase completion is included.

## Manual continuation

1. Open Existing on the moved private project above. In Voice Manipulator,
   expand Voice Patch → Lịch sử và so sánh bản vá → Đọc lịch sử bản vá.
2. Find source `asset-natural-reference`,4.120–6.280s, `giọng nói mẫu`,
   Giữ thời lượng. Audition all three variants and the source. Check perceived
   identity, missing/extra syllables and both splice boundaries; retain ratings.
3. Open a revision on Timeline and Script. Confirm the selected variant's words
   and8s total duration. Reopen and confirm history does not create another job.
4. Select a fresh STT word/waveform span and navigate to Voice Manipulator.
   Verify whole-word bounds, listen and confirm them. Changing those bounds must
   remove confirmation. A disjoint selection must not silently select its hull.
5. Choose each media strategy explicitly. Strategy1 must work without context;
   strategy2/3 require a selected reference. Switching duration policy or text
   must disable Apply of a mismatching preview. Test Stop/retry before Apply.
6. Use actual browser/native Save and cancel for WAV/SRT. Record the destination
   and downloaded hash. HTTP results above do not substitute for this step.

The private fixture's existing confirmation was automated. These steps must not
be marked accepted until performed and recorded with the actual UI/audio.
