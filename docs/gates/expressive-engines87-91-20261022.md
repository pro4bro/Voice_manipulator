# Expressive engine connections — rounds87–91, 2026-10-22

Owner requested five rounds in one invocation. Updated scope/acceptance lives in
`docs/research/EMOTION-DELIVERY-TRAINING-PLAN-20261022.md`. Baseline `ca0a825`;
implementation branch `codex/expressive-engines`. Existing two research notes
are retained. No owner media or OmniVoice upstream code is changed.

## Round87 / ED-CONNECT-01

Pinned source checkouts added to the existing provisioner, with source-pin
refusal for differing existing checkouts. New clone/fetch/checkout set
`GIT_LFS_SKIP_SMUDGE=1`. Models are separate, explicit on-demand selections;
their file downloads use existing hash verification and pinned receipts.

Actual `--repos-only --repo EasyVoice --repo F5-TTS --repo IndexTTS --repo FishSpeech`
created/reused clean checkouts under ignored `.runtime/engines/research`:

| Checkout | Verified HEAD |
|---|---|
| EasyVoice | `af299a5cce44c6f877047bff54496fc1a823c090` |
| F5-TTS | `2f866649b779881af8bd644e76b9a6d95053da29` |
| IndexTTS | `d9e41aac89fd00b3d71497fddb287b7f24613712` |
| FishSpeech | `541566932abbaebcb0a40e562a1f846738383f38` |

Receipt: `.runtime/open-engines-install.json`. All four source Git statuses clean.
Focused provisioning tests **24 passed**; py_compile/diff check passed. Initial
Windows cp1252 Git-output decoder exception was fixed by explicit UTF-8 replacement;
the same provisioning command then completed successfully. No model weights or
private Python environments were installed; repo presence is not inference readiness.
