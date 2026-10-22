# Subtitle alignment engines

## Input workflow

1. Select finalized footage with a completed transcript in Media Pool.
2. In Input's right column, choose **MFA**, **stable-ts** or **EasyAligner** under
   **Tinh chỉnh subtitle**. Parameters are remembered separately while mounted.
3. Choose the language/model and parameters. **Giới hạn dịch tối đa (ms)** bounds
   each edge's total movement from the current word interval (0 keeps it still).
   Optionally restrict the scope to selected Script/Timeline words.
4. Press **Bắt đầu tinh chỉnh**. The engine runs against existing text. Ghosts
   appear above original subtitles; play the Timeline against its waveform.
5. Change parameters and run again, or choose **Apply New Timing**. Only changed
   words are written. Manually edited words remain locked. Red ghosts/conflicts
   indicate overlaps, including overlaps with words that stay still.
6. **Khôi phục timing** restores the source-bound state before that Apply. Later
   text/timing/audio changes require another preview and can invalidate Restore.

Changing the selector or a parameter clears a pending ghost. It does not run a
model or edit the script. Extra offset/waveform rules are available in collapsed
advanced settings and initially disabled. A preview is an estimate to listen to;
neither a high CTC score nor a waveform corner proves a correct word boundary.

## Parameters

| Engine | Parameters | Meaning |
| --- | --- | --- |
| MFA | Language, Beam, Retry beam | Select dictionary/acoustic model. A wider search can take longer. Retry beam is used if the initial search fails and must be at least Beam. |
| stable-ts | Language, Model, Refine, Precision, Max word duration, Window | Whisper aligns the existing text. Refine adjusts boundaries; smaller precision searches more finely. Window groups words around their current timings. |
| EasyAligner | Language, Window, Padding | Select the fixed CTC model. Window limits each speech group; padding adds audio context around its existing timings. Unknown vocabulary does not shift later word identities. |

## Machine setup (developer)

From the repository root with Windows x64 Python 3.11:

```powershell
.venv/Scripts/python.exe scripts/setup-subtitle-mfa.py --plan
.venv/Scripts/python.exe scripts/setup-subtitle-mfa.py
.venv/Scripts/python.exe scripts/setup-subtitle-neural.py --plan
.venv/Scripts/python.exe scripts/setup-subtitle-neural.py
```

The neural default downloads multilingual Whisper tiny/base and Vietnamese/English
CTC profiles. Additional Whisper choices can be installed explicitly using
`--stable-models small`, `medium` or `large-v3`; their absence is shown in the UI.
Restart/reopen the Input view after setup. Inference runs offline and never
replaces a missing engine with another engine. Private dependencies and weights
are machine-local and are not in the application Git commit or thin update.

Setup writes manifests only after model verification and import checks. Inference
creates `alignment-input.json`, `alignment-output.json`, `alignment.log` within a
project's `jobs/subtitle-alignment/<asset-id>/<proposal-id>/` folder. The proposal
records model/worker/runtime identity, source binding and nullable measured words.

## Model attribution

- [MFA Vietnamese acoustic model v3](https://mfa-models.readthedocs.io/en/latest/acoustic/Vietnamese/Vietnamese%20MFA%20acoustic%20model%20v3_0_0.html)
  and [Vietnamese dictionary v3](https://mfa-models.readthedocs.io/en/latest/dictionary/Vietnamese/Vietnamese%20MFA%20dictionary%20v3_0_0.html):
  Montreal Corpus Tools/MFA model authors, CC-BY-4.0; retain their model cards and
  citations. English MFA v3 equivalents use the same model family/license.
- [Official OpenAI Whisper](https://github.com/openai/whisper): code and weights MIT.
- [dragonSwing Vietnamese Wav2Vec2](https://huggingface.co/dragonSwing/wav2vec2-base-vietnamese/tree/2d658ec1a90820fee04e9d2edc3cf31ededa4886)
  and [Facebook English Wav2Vec2 base 960h](https://huggingface.co/facebook/wav2vec2-base-960h/tree/22aad52d435eb6dbaf354bdad9b0da84ce7d6156):
  Apache-2.0 model cards; retain notices. They have independent data/model quality
  limits. Selecting Apache-licensed weights is not an accuracy guarantee.

See ADR0137 and the round gate for the actual installed/inference evidence.
