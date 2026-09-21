# Voice Conversion Engines

Survey for the Voice Changer mode: same language in, same language out, a
different voice, fast enough to use live. Gathered 2026-09-13. Licence, stars,
archive state and last push were read from the GitHub REST API on that date;
latency figures are the projects' own claims until plan 05-01 measures them here.

## Candidates

| Project | Target voice | Claimed latency | Runs on | Licence | State on 2026-09-13 | Vietnamese risk |
| --- | --- | --- | --- | --- | --- | --- |
| [RVC WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI) | Trained per speaker, ≤10 min audio | ~170 ms end to end, ~90 ms with ASIO | GPU; CPU possible | MIT | Active, 38k stars | Low–medium |
| [Applio](https://github.com/IAHispano/Applio) | Trained per speaker (RVC) | Same model as RVC | GPU; CPU possible | MIT | Active | Low–medium |
| [Seed-VC](https://github.com/Plachtaa/seed-vc) | Zero-shot, 1–30 s reference; optional fine-tune | ~300 ms algorithmic + ~100 ms device (~430 ms on RTX 3060) | GPU | **GPL-3.0** | **Archived**, read-only | Low–medium |
| [MeanVC2](https://github.com/ASLP-lab/MeanVC2) | Zero-shot; optional speaker fine-tune | 110 ms end to end (40 ms chunk + 40 ms lookahead); RTF < 0.633 on one CPU core | CPU or GPU, 18M params | Apache-2.0 per README badge; **no LICENSE file detected** | Very active (pushed today) | **High** |
| [MeanVC](https://github.com/ASLP-lab/MeanVC) | Zero-shot | — | CPU or GPU | Apache-2.0 | Superseded by MeanVC2 | High |
| [LLVC](https://github.com/KoeAI/LLVC) | One fixed target, retarget by training | < 20 ms; 2.8× realtime on consumer CPU | CPU | MIT | Untouched since 2023-11 | Medium |
| [Beatrice v2](https://project-beatrice-v2.github.io/Beatrice-website/) ([trainer](https://huggingface.co/fierce-cats/beatrice-trainer)) | Trained per speaker | RTF < 0.2 single-threaded on i7-1165G7 | CPU; GPU for training | Trainer on HF; runtime ships as VST — **licence unverified** | Active | Medium |

### Applications, not engines

| Project | What it is | Licence |
| --- | --- | --- |
| [w-okada/voice-changer](https://github.com/w-okada/voice-changer) | Complete realtime client/server app hosting RVC, MMVC, So-VITS-SVC, Beatrice v2 | MIT, plus a notice that bundled vocoders and the Beatrice JVS edition carry their own licences |
| [deiteris/voice-changer](https://github.com/deiteris/voice-changer) | w-okada fork, RVC only, tuned for performance | Inherits w-okada; no SPDX detected |

These are whole products with their own server, device handling and UI. Hosting
one would put a second app behind the adapter seam and duplicate Recorder. They
are useful as **reference implementations of the realtime loop** — block size,
crossfade, SOLA alignment, silence gating — and as a benchmark to compare our
own streamer against.

### Papers without code worth adopting

[StreamVC](https://arxiv.org/pdf/2401.03078), [StreamVoice](https://arxiv.org/pdf/2401.11053),
[RT-VC](https://aclanthology.org/2025.acl-demo.37.pdf) and
[Zero-VC](https://arxiv.org/pdf/2606.20218) describe low-latency streaming
designs; none has an official release we could run. Tracked through
[awesome-voice-conversion](https://github.com/JeffC0628/awesome-voice-conversion).

## Why Vietnamese changes the ranking

Vietnamese tone is lexical: the same syllable with a different tone is a
different word. A converter that sounds natural in English can still turn
*mà* into *má*. What matters is how each engine carries **content** and **pitch**:

- **RVC** extracts content with HuBERT/ContentVec, which is largely
  language-agnostic, and carries the source F0 contour (RMVPE) through to the
  output, shifted by a semitone key. Tone survives as contour shape. Lowest risk.
- **Seed-VC** encodes content with Whisper, which was trained on Vietnamese.
  Its speech model does not take F0 explicitly, so tone rides on the content
  features. Low–medium risk, but GPL and archived.
- **MeanVC2** encodes content with WeNet Fast-U2++ bottleneck features from a
  Chinese lab; the README does not say what languages the recogniser saw.
  Mandarin is tonal too, which may help, but Vietnamese phoneme coverage is
  unknown. Best latency and CPU story of the group, highest content risk — and
  exactly the kind of claim to measure rather than assume.

## Licence consequences for a shipped build

Plan 07-01 packages a Windows installer. That makes licence a selection
criterion, not a footnote:

- **MIT / Apache-2.0** (RVC, Applio, LLVC, MeanVC): can be fetched and run by the
  shipped app.
- **MeanVC2**: the README badge says Apache-2.0 but the repository has no
  LICENSE file. Ask upstream or wait for one before the installer fetches it.
- **Seed-VC**: GPL-3.0 and archived. Usable as a local benchmark; distributing it
  with, or fetching it from, a shipped build needs its own licence decision, and
  nobody will fix it when it breaks.
- **Pretrained weights** carry their own terms separately from code (HuBERT,
  ContentVec, RMVPE, vocoders, the Beatrice JVS corpus edition). Each goes into
  a `ModelDescriptor.licence` field, per 07-01.
