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

## Round88 / ED-CATALOG-01

Added four reference-clone choices, four distinct deep-training descriptors and
four generator descriptors. Deep choices are visible but blocked until their
trainer is implemented; F5 exposes sourced CLI training parameters, while
Index/Fish do not invent unsupported training settings. F5/ViVoice have distinct
IDs so their base/vocab/language and stored parameters cannot be interchanged.

Frontend permits selecting an unavailable engine to inspect its exact controls,
notes, language coverage and readiness reason; Generate stays disabled. Existing
Train category separation and per-model saved values are covered by new regressions.
Fish normalize was removed after source review found its field is not consumed;
repetition_penalty is also omitted because upstream ignores it. ADR0135 records
the capability and artifact boundaries.

Focused frontend **31 passed / 3 files**, typecheck passed. Backend catalog groups
**25 passed**. These are catalog/UI checks; no pretrained engine generated audio.

## Round89 / ED-F5-01

Connected F5 v1 and ViVoice with separate model architectures, exact checkpoint
and vocabulary paths and shared local Vocos. Their reference voices use the
existing immutable project publication path. Shared private worker protocol
retains Stop/GPU lease, fingerprinting, offline network refusal and real decoded
artifact checks. Model receipts/stats are checked for catalog readiness; full
file digests are recomputed before loading weights. Cache keys reset after a
failed load so an earlier engine can recover.

Focused related API groups **85 passed / 53.11s**, two existing dependency
deprecation warnings. The worker subprocess test uses a deliberately fake F5
class with real 24k FLOAT WAV I/O; it proves protocol/artifact/error recovery,
not pretrained inference quality. Initial fixture lacked soundfile; the new
`services/api/requirements-test.txt` declares it and development installation
succeeded. A fixture missing production's UTF-8 pipe environment was corrected;
EngineWorkerProcess already configures UTF-8 in production.

Full frontend **1223 passed / 150 files / 172.90s**, typecheck/build passed
(213 modules, build779ms). No new model weights/private engine runtime installed.
