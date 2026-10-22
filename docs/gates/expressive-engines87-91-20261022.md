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

## Round90 / ED-INDEX-01

Registered IndexTTS2.5's isolated worker and reference voice path. Language is
restricted to EN/ZH/JA/ES/AR. Emotion follows the current speaker reference,
an explicit eight-value vector, or a text description; contradictory inactive
mode values fail before inference. Text mode explicitly loads the local Qwen
emotion model. Relative duration_factor is distinct from native duration/speed.

Preflight requires separate pinned receipts for W2v-BERT, CAMPPlus and BigVGAN,
along with Index's own codec/tokenizer/weights. Worker seeding, exact upstream
call signatures and actual22.05k WAV decode are covered with fake model classes.
Focused Index/adapter/catalog group **33 passed / 3.70s**, two existing warnings.
No real Index model or emotional quality claim; required weights/runtime absent.

## Round91 / ED-FISH-01

Registered Fish S2 Pro's isolated worker, local reference transcript/audio,
natural-language instruction prefix and preserved inline tags. Sampling controls
map to the pinned request schema. Loader rejects Drama3's incompatible backbone
and requires S2's `fish_qwen3_omni` config plus `modded_dac_vq` codec. A model error
even after a partial/final response cannot publish success.

Latest Fish/Index/adapter/catalog group **37 passed / 3.71s**, two existing
dependency warnings. Fish contract tests use fake upstream classes; common worker
and project dispatch tests use real WAV files and fake model workers. No new
engine weights/private runtime or acoustic quality is validated by these tests.

### Full backend containment and remaining runtime check

Round84's updater process fixture now fences Stop-Process to its exact fixture
launcher/child PIDs before native termination. An unrelated live sentinel proves
the fence refuses unowned termination; source listener PIDs remain protected.
Production stop functions and all prior success/rollback/foreign-controller
assertions remain. Timeout diagnostics retain the PowerShell output.

Focused updater cases: **5 passed / 68.84s**. Full API run:
**1372 passed, 1 failed, 3 warnings / 662.71s**. Updater containment passes in the
full run. The remaining failure is VibeVoice's existing embedded-runtime import
test timing out after 60s; this full run is not green. The exact same test passes
alone in **35.26s** with the original timeout. Its heavy PyTorch/Transformers import
is timing-sensitive under suite conditions (also recorded in round62); the exact
transient cause is not established. No timeout/skip or test assertion was changed.
Logs: `.scratch/expressive87/updater-containment-final.log`, `backend-full.log`.
Standalone import log: `.scratch/expressive87/vibevoice-import-serial.log`.

### Browser and final build

The idle managed stack was restarted through its controller after full tests
finished and after checking there were no active tasks/OBS recording. Controller,
API and Studio report healthy/running. `/api/voice-generators` reports seven
entries; all four new entries have installed=true, available=false and the exact
missing model receipt. An automatic approval review rejected a separate scratch
API launch; the ordinary existing controller restart provided the managed path.

Browser inspection uses only the separately created scratch project. It confirms
all training choices, F5 fine-tune controls and blocked trainer status, generator
selection without existing voices and Fish's instruction/sampling fields with
Generate disabled. Initial cold readiness probes exceeded the UI read deadline and erased the
optional catalog. This was reproduced after cache expiry and fixed within91:
`?background=true` returns metadata/pending unavailable states immediately; a
single daemon checks readiness while the UI polls until completion. Default HTTP
and job validation remain synchronous. Cold request after managed restart:
**23ms, seven entries, six pending**; the full list is present during checks.
New background/catalog API groups **32 passed / 20.92s**. Final integrated
Fish/Index/adapter/catalog/background group **42 passed / 4.40s** (two existing
warnings). UI polling/cancellation plus WorkspaceShell/control groups **116 passed
/6 files /17.25s**; read-timeout/polling group3 passed; final typecheck/build pass
(213 modules/380ms, JS `index-Cx6RXNn3.js`).

Browser inspection found the shared F5/ViVoice family label ambiguous; explicit
engine labels now distinguish them. Shared reading speed is disabled for an
explicit engine without a speed parameter (Fish/Index); generator notes agree.
New speed regression failed before the fix and passes afterwards. Index emotion
mode now shows only its active vector/text controls and clears conflicting fields
on mode changes; its regression proves a mode switch cannot submit stale values. Intermediate related
frontend **47 passed / 4 files / 6.22s**, typecheck/build pass, 213 modules/387ms.
The earlier full frontend run was **1223 passed** before this final UI correction.

### Scope boundary

OmniVoice's existing LoRA/full trainer remains. New reference/generation adapters
are connected, with missing source/runtime/model reasons and per-engine controls.
New deep trainers remain blocked; Index/Fish have no invented training parameters.
Private environment/model provisioning, pretrained inference/listening benchmark,
F5 trainer/exporter and multi-state LoRA scheduling/publication are next rounds.
The plan and ADR0135 retain that boundary. Phase03 remains60%, Phase06 open.


### Final review and closure

Source/API review of Fish has no remaining actionable finding; no review pretends
fake models establish pretrained quality. Lead reviewed the background readiness
path and corrected coverage for registered checks whose descriptor flag is false.
Jobs and the default HTTP catalog retain strict checks; only the UI snapshot is
cached. All four cloned source HEADs were rechecked clean at their pinned SHAs.
No owner audio, existing project media or OmniVoice upstream was changed.

Browser proof is retained under `.scratch/expressive87/` in the dedicated test
project. Runtime is left healthy on the final served frontend build. Five rounds
stop at91; new pretrained inference/deep training remains explicitly unverified.

Final browser checks on JS `index-Cx6RXNn3.js`: distinct F5-TTS/ViVoice labels,
Fish speed disabled/Generate unavailable, Index reference mode hides vector,
vector mode reveals eight controls, and no console errors. Screenshot:
`.scratch/expressive87/fish-ui-final.jpg`. The scratch test project remains
available for review; existing owner projects were not edited.
