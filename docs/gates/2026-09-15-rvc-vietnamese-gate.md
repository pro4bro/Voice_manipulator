# RVC (Applio) — Vietnamese gate, first run

Plan `05-01`, measurements 1, 2 and 4. Run 2026-09-15 on this machine (RTX 3090 24 GB,
Windows 11). The gate numbers are the plan's provisional ones; the owner decides.

## What was measured

| | |
| --- | --- |
| Engine | Applio `aeb69bf` (RVC v2, HiFi-GAN, 40 kHz), runtime `.runtime/rvc` (Python 3.11, torch 2.8 cu128) |
| Target | Anh Vũ — trained on `my_voice_auto` (27.5 min, 24 kHz), RMVPE + ContentVec, batch 8 |
| Checkpoints | 25 and 100 epochs (≈45 s per epoch; 100 epochs 75 min) |
| Test set A — other speaker | 20 utterances, 4–8 s, 127.8 s, a different male speaker from the PDCA livestream; reference text = Speech to Text words (not ground truth) |
| Test set B — self | 16 held-out utterances of the target's own dataset, 172.7 s; reference text = curated labels (ground truth) |
| CER | Faster-Whisper large-v3, `language=vi`, beam 5, VAD; on source and on output, against the same reference |
| F0 | librosa pYIN, contour correlation in semitones over frames voiced in both |
| RTF | offline conversion time / duration (`VoiceConverter.convert_audio`, RMVPE) |

Not measured yet: speaker similarity (no `SpeakerEmbedder` in the app), a female or
cross-gender pair (no such audio with consent), live end-to-end latency by loopback
(the Windows Audio service stopped during the live test, see below), owner blind A/B.

## Results

Mean CER over each set; "Δ" is output minus source, in percentage points.

| Model | index_rate / protect | Set | Source CER | Output CER | Δ | Median Δ | Within 3 pts | F0 corr. (median) | RTF (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 epochs* | 0.75 / 0.5 | A other speaker | 19.0% | 34.4% | +15.4 | — | — | 0.982 | 0.37 |
| 25 epochs* | 0.75 / 0.5 | B self | 8.9% | 14.4% | +5.6 | — | — | 0.984 | 0.21 |
| 100 epochs | 0.75 / 0.5 | A other speaker | 19.0% | 34.9% | +15.9 | — | — | 0.986 | 0.34 |
| 100 epochs | 0.75 / 0.5 | B self | 8.9% | 12.4% | +3.5 | — | — | 0.919 | 0.17 |
| 100 epochs | 0.3 / 0.33 | A other speaker | 19.0% | 32.8% | +13.8 | +11.6 | 6 / 20 | 0.983 | 0.33 |
| 100 epochs | 0.3 / 0.33 | B self | 8.9% | 11.9% | +3.1 | +0.7 | 10 / 16 | 0.962 | 0.19 |

\* measured while training was still using the GPU; its RTF is pessimistic.

Durations are preserved exactly (output length equals input length on every utterance).

## Reading

- **Tone contour survives.** F0 correlation stays at 0.92–0.99; RVC carries the performer's pitch.
- **Own voice into own model: close to the gate.** Median change +0.7 points, mean +3.1 against a 3-point gate.
- **Another speaker into the target: fails the provisional gate.** Mean +13.8 points at best. Two
  of the worst utterances are Whisper hallucinating a "subscribe" outro on the converted audio,
  which inflates the mean, but even the median is +11.6 points. The source is a noisy livestream
  recording, harder than a close microphone, so a live microphone may do better — that needs its
  own measurement.
- **Offline speed is ample** (RTF 0.17–0.34). Live, one 250 ms block took about 100–150 ms of GPU
  time with training running alongside; the end-to-end live latency is not measured yet.

## Live test interruption

During the live RVC test on the VB-Audio cable, opening an input stream hung, and the Windows
Audio service (`Audiosrv`) was then found **stopped**, leaving only WDM-KS devices. Pro4Bro
does not restart system services; the owner has to start it (or restart Windows). A second
finding from the same session: PortAudio device indices change as devices come and go, so the
app now picks devices by name and host API, not by index.

## Files

`.runtime/smoke/rvc-gate/set/` (not in git): `manifest.json` (the frozen set with hashes),
`*.src.wav` / `*.rvc.wav` pairs for listening, `gate-25e.json`, `gate-100e.json`,
`gate-100e-index03.json` with every utterance's reference, heard text and numbers.
