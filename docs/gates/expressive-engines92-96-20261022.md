# Expressive engines — rounds92–96, 2026-10-22

Owner explicitly requested five more rounds. Baseline `97f0ad5` on
`codex/expressive-engines`; the working tree was clean. The updated scope and
acceptance live in the emotion/delivery research plan. Upstream checkouts are
read-only and project media is preserved. New model/runtime files stay ignored.

Closure: five bounded implementation slices92–96 and real-artifact checks are
complete; stop96. This is not full production readiness or acoustic acceptance.
Fish cold catalog readiness, the existing full-API import timeout and the quality/
training execution gaps remain explicit below. Phase03 stays60%, Phase06 open.

## Round92 / ED-RUNTIME-01 — installed and import verified

Added isolated embedded CPython3.11.9 setup for shared F5/ViVoice, separate Index
and separate Fish targets. Official Python archive SHA256 is verified. Source
revision/tracked cleanliness, existing ownership/partial receipts and disk space
are checked before installation. Relative paths retain source/API access after
moving the application. A failed install cannot leave a stale ready receipt.

Torch/Torchaudio use official2.8.0/cu128 Windows cp311 URLs with pinned hashes.
PyPI handles other dependencies. Local wheel cache transport verifies the same
official hashes and does not edit the logical requirements. Ready receipts require
the actual product import probe and include installed distributions and the
requirements hash; declared requirements are not proof of a working runtime.

Provisioner focused tests21 pass; smoke-evidence tests5 pass. All three private
profiles now have successful import probes and ready receipts. The first attempt
was deliberately stopped after metadata proved
cached_path1.6.7's Hub<0.28 conflicted with Transformers4.52.1's Hub>=0.30. Pin1.8.0
has an intersecting constraint. A subsequent slow Torch transfer was stopped only
at its owned installer child PID; the same-byte ranged cache download was later
verified and installed.
Index OpenCV4.12 replaces upstream4.9 to match NumPy2.2.6's ABI; deviations remain
product-owned requirements, never edits to upstream.

## Evidence boundaries for93–95

`scripts/check-expressive-inference.py` uses product adapters/private workers,
the shared GPU lease and immutable reference hashes. It retains settings/source/
model identity and measures decoded rate/channels/frames, peak/RMS/full-scale
fraction and first/last20ms RMS. It never normalizes away peaks or reports acoustic
acceptance. Empty/silent/stereo/non-finite output is rejected. Existing evidence
paths cannot be overwritten. WAVs and reports are retained under
`.scratch/expressive92/` with exact source URLs and hashes.

F5's pinned basic EN sample is a24k mono5.333s source. Vietnamese engineering
reference: `nguyenthienhy/F5-TTS-Vietnamese` at
`e74db9d5a5e521bb930490e7cd7912438bf7ae84`, `ref.wav`, with transcript from the
same commit's `infer.sh`; SHA256
`714c92c7bc742ef8173ecd9aa60bac68b0e932981edb80e6d4f7ae12e2880152`.
It is a short1.883s public engineering fixture, not a reviewed owner corpus or a
production identity benchmark. It is not included in a release or project.

## Round96 / ED-VARIANT-PREP-01 — read-only API verified

Read-only preview endpoint and domain/adapter are implemented; ADR0136 records
the boundaries. Focused preview/training API/catalog36 pass; compiler34 pass.
These checks prove planning invariants and no project writes, not actual model
training, GPU inference or publication. Live API evidence is recorded below.

## Provisioning recovery and regression gates

PyPI source transfer was measured at34kB/s (EnCodec3.7MB in110.42s). Official
PyPI uv0.8.14 and unidic-lite1.0.8 are now direct SHA256 pins with the same-byte
cache transport; source hashes/URLs remain in the installer. Private uv performs
all dependency resolution/downloads with the exact embedded Python and site target.
Fish alone supplies the protobuf override declared by its pinned upstream.
[uv override semantics](https://docs.astral.sh/uv/pip/compile/) and
[CLI flags](https://docs.astral.sh/uv/reference/cli/) were checked. Tool version,
requirements hash, actual distribution inventory and Fish override hash are kept
in ready receipts only after a successful product import probe. The actual uv
wheel places its Windows executable under `bin`, which was corrected after the
first real bootstrap exposed the assumed `Scripts` path. Initial concurrent
network requests returned Winsock10013; a bounded/native-TLS probe succeeded,
and subsequent installs bound concurrent downloads/builds to4/1. No TLS check,
model check, test expectation or timeout was weakened.

Frontend intermediate1227/151files pass185.71s; typecheck/build pass. The original full
run had one transient source-meter assertion (37 expected,0 before the separate
async waveform state arrived). `waitFor` retains37 and the gain checks; full file
65 pass and the complete rerun passes. Full API1411 pass/1 fail/3 warnings788.89s:
the same pre-existing VibeVoice embedded-import60s timeout as87–91. This is not a
green full API gate. Full collection predates the final installer refactor;
current focused installer/preview gates are reported separately. No new runtime
or model operation modifies the VibeVoice runtime.

The final integrated checkout (including independently committed subtitle work)
passes frontend1230/151files in177.11s, typecheck and build214 modules/25.09s;
served bundle target is `index-MluSWaJ8.js`. Logs:
`.scratch/expressive92/frontend-integrated-final.log`,
`typecheck-integrated-final.log`, `build-integrated-final.log`.
Current related API setup21 + expressive41 + smoke evidence5 + variant preview12
passes79/2 warnings/52.31s (`related-final-current.log`). Publication correction
tests are recorded separately below because they followed this run.

Live managed preview succeeded on the task-owned scratch project with explicit
engineering metadata only: angry/loud + sad/soft, shared ordinary neutral anchor,
`dryRun=true`, `executable=false`, `baseIdentityVerified=false` and the sole
`base-fingerprint-unverified` blocker. This does not prove real corpus quality.
The final route parses and hashes one byte snapshot. Independent read-only review
found no actionable acceptance/lineage/storage findings. The endpoint has no UI
or execution scheduler yet.

## Real installation findings (continued 2026-10-23)

Embedded `_pth` initially omitted the script directory, so the import probe could
not resolve its sibling worker. The probe now adds its trusted product directory.
Enabling `import site` also added the Windows user's Python311 site directory;
new runtimes now list all import roots explicitly and keep site disabled. The
product probe rejects a runtime with site enabled. Source/requirements receipts
(including Fish's override hash) must match before any catalog import probe;
partial installs without a ready receipt stay unavailable. Receipt tests include
shared F5/ViVoice ownership and invalid/missing/stale fields before probing.

Actual resolution/import caught additional incompatibilities: Fish requires
Safetensors0.8+, Hub1.31+ requires Click8.4.2+, and TensorBoard2.21 generated protobuf6
code incompatible with upstream's protobuf<6 override. Pins0.8.0/8.4.2/2.20.0
resolve these. Arrow26's binary requires NumPy2 despite F5's NumPy1.26 profile;
Arrow21.0.0 is now explicit. These are verified installation corrections, not
claims inferred from declared dependencies.

The workspace volume reports WDC WD40EFRX-68N32N0/RAID. Parallel cold imports
created HDD contention. Import-time/faulthandler evidence shows progress through
Torch/Numba/Wandb rather than a completed probe. Task-owned import-only children
were stopped and retried serially; no owner/model process was terminated. Model
hash checks and the existing timeouts remain unchanged. Fish and F5 private
runtime probes now pass, including Index.

### Round95 first real artifact

Product worker, shared GPU lease and offline pinned model components generated
`.scratch/expressive92/fish-en-whisper-01.wav`:135168frames, mono FLOAT44.1kHz,
3.065034s, peak0.5390625, RMS0.101686, full/near-full-scale fractions0. The
instruction is `whispering`, seed42, max_new_tokens512, other native defaults.
Reference hash is unchanged. Worker elapsed828.096s, total857.562s, within the
unchanged900s worker budget. This is a cold HDD/VRAM-loaded engineering run,
not a latency guarantee. The original report is preserved; a separate
`.analysis.json` binds its SHA256 and adds adjacent-sample/edge metrics without
rewriting WAV/report. No acoustic identity/emotion/effort acceptance or training
is claimed. Vietnamese Fish inference and the72-sentence benchmark remain open.

### Round93 real F5/ViVoice artifacts

F5 v1 Base EN produced86528frames/3.605333s/mono FLOAT24kHz, peak0.980762,
RMS0.149872, full/near-full-scale fractions0; total73.657s, worker54.331s.
ViVoice's distinct F5TTS_Base architecture, custom vocabulary and `model_last.pt`
produced a Vietnamese WAV through the same product protocol. Reports retain
native defaults/seed42, reference/source/model identity, worker diagnostics,
rate/channels/format/frames/peaks/RMS and boundary/adjacent-sample measurements.
Both original reference hashes are unchanged. These are actual pretrained
inference paths, not synthetic test doubles or fine-tuning runs. High-frequency
or boundary artifacts still require listening; decoded non-silent audio alone
cannot certify intelligibility, speaker identity, emotion or effort.

Direct requirements are pinned and successful receipts inventory actual
transitive versions. This is not a cross-machine immutable transitive lock;
release/packaging hardening remains Phase06 work.

### Round94 real Index emotion artifacts

Both real runs use the pinned IndexTTS2.5 model and required auxiliary weights,
native22,050Hz mono FLOAT, the same immutable English reference and seed42.

| Case | Frames / seconds | Peak / RMS | Full-scale fraction | Total elapsed |
|---|---|---|---|---|
| `index-en-sad-vector-01` |92416 /4.191202|1.0 /0.170459|0.000400364|164.343s|
| `index-en-happy-text-01` |70400 /3.192744|1.0 /0.309705|0.005568182|96.250s|

Vector mode logs the requested sad0.7 scaled by alpha0.8 to0.5599. Text mode
loads QwenEmotion and logs `Speak happily.` interpreted as happy0.97,
surprised0.02 and calm0.01, scaled by0.8. These confirm both native control paths
executed; they do not establish that a listener accepts the intended emotion.
The two outputs hit full scale (~0.04% and0.557% of samples); near-full-scale
fractions are0.000703341 and0.008139205. Text mode begins at-0.156555 with first20ms
RMS0.409346. Original WAVs and reports retain these clipping/boundary concerns;
no normalization is used to hide them. Listening and the full benchmark remain
open. Reference hashes are unchanged in both runs.

### Publication integration correction — verified

Read-only integration review found that direct Voice Output discarded the native
sample rate and published FLOAT WAVs into an editor requiring mono PCM16/24kHz.
The existing mocked inference fixture always wrote24k PCM16, so it masked this
failure. Script composition already converted its clips. ADR0138 records the
chosen direct-publication boundary: preserve exact native audio and relative
provenance, convert an editable copy, measure its actual header, then publish.
Direct generation now preserves native audio, publishes PCM16 mono24k audio and
measures the actual published header before saving. Relative sidecar metadata
retains both hashes/headers, artifact identity and the worker-reported duration.
Configured tools have bounded subprocess timeouts. Converter failure becomes a
VoiceGenerationError (HTTP502), and failure/cancellation discard the whole output
reservation. No public Voice Output schema migration is introduced.

Focused publication/generation/script99 pass/2 warnings/11.14s. Lead review then
proved two additional failures: truncated RIFF payload and inconsistent frame
alignment were accepted through permissive metadata fallback. Both regressions
failed before the guard; recognized RIFF now must pass payload/header checks
before copy/conversion. Updated related publication/generation70 pass/7.23s.
Final combined installer/catalog/F5/Index/Fish worker/evidence/variant/direct-
generation/script/edit/render gate: **175 pass/2 warnings/22.74s** in
`.scratch/expressive92/backend-integrated-current.log`. Full API remains non-green
as recorded above; this targeted gate does not replace it.

Retained real-media replay: `.scratch/expressive92/publication-check-02/report.json`
and `run_publication_check.py`. Five native WAVs are bound to original smoke-report
and WAV hashes, copied unchanged into synthetic product edit/render fixtures,
converted through the product normalizer, opened by FileVoiceEdits and rendered
through the HTTP TestClient route. All five renders return200; output WAVs,
project state and sidecars remain on disk. This is product plumbing evidence,
not a new GPU run, a public managed API Generate call or acoustic acceptance.

| Native case | Canonical frames at24kHz | Canonical seconds | Edit / render |
|---|---|---|---|
|F5 EN|86528|3.605333|pass /200|
|ViVoice VI|59392|2.474667|pass /200|
|Index sad|100589|4.191208|pass /200|
|Index happy|76626|3.192750|pass /200|
|Fish whisper|73561|3.065042|pass /200|

Replay02 uses the shared smoke measurement function: full-scale means abs>=1,
near-full-scale means abs>=32767/32768; RMS/edges/adjacent deltas are retained for
native, canonical and render audio. Replay01 is preserved as historical evidence;
its differently named0.9999 threshold and placeholder engine labels are corrected
in02. Resampling/quantization can alter peaks and frame counts; original native
clipping measurements remain authoritative for what the engine produced.

## Retained artifact identities

All native WAVs below remain under `.scratch/expressive92/`, with same-stem
`.report.json`; Fish also has a separate immutable-report-bound `.analysis.json`.
None is declared acoustically accepted or included in a portable release.

| Native WAV | Rate / frames / seconds | SHA256 |
|---|---|---|
|`f5-en-normal-01.wav`|24000 /86528 /3.605333|`d4ed1459c054ed2229a18c6dca3357580df9aba2c9adfd98e98f2406f4a49744`|
|`vivoice-vi-normal-01.wav`|24000 /59392 /2.474667|`2e3761e500cad327026774570de75ec8755bcd180029e3d2336e02da4d23417b`|
|`index-en-sad-vector-01.wav`|22050 /92416 /4.191202|`fde158486ff5bb0407cd5761926a375a3cc1ce0f1926926311cd970159cfabbf`|
|`index-en-happy-text-01.wav`|22050 /70400 /3.192744|`ed8f016b851340110c454bcf8a0d48a1d0e6a1c5adddf5938a3c00e903e86088`|
|`fish-en-whisper-01.wav`|44100 /135168 /3.065034|`bc5d713dc1812585eb799e4c3067a8e9d280dd8599272fffe3800c2dfcac6117`|

Ready runtime receipts and installed-distribution counts, verified unchanged at
closure preparation (snapshots retained in the same evidence directory):

| Profile | Distributions | Receipt SHA256 |
|---|---|---|
|`f5-tts` (also ViVoice)|123|`40ca66b4e59f4f1f48a40a338ad31cb50ebeffae13a647aa14b3a40b5cd2adfd`|
|`index-tts`|129|`8bd3c0da0f73f4eae6773142a6327fa138472508c3057a014bb2d3fcbc3f2fd7`|
|`fish-speech`|131|`aa9a76061f43891f49f5badf4256bb6d8cdccab2a0ec41855d59c78d9207e684`|

Reproduction uses the development interpreter for installer orchestration:
`scripts/setup-expressive-runtime.py --engine ENGINE`; model components use
`scripts/provision-open-engines.py --model MODEL`. The engineering smoke command
is `scripts/check-expressive-inference.py --engine ENGINE --reference WAV
--reference-source URL --ref-text TEXT --text TEXT --language LANG --options JSON
--output NEW_WAV`. Reports retain the exact resolved options; outputs must use
fresh paths. These commands do not execute fine-tuning. Source revisions/pins are
in ADR0135 and the research plan; all five upstream tracked working trees,
including OmniVoice, were clean at the final source audit.

## Managed app verification and remaining gaps

Restored through `scripts/start-pro4bro.ps1 -Command start` in a hidden process.
The first Windows PowerShell launch rejected script execution; the retry used
the same process-scoped `-ExecutionPolicy Bypass` already used by the repository's
canonical BAT launcher. No persistent system execution policy was changed. The
controller remains owned by the canonical console/job. After loading the final
audio guard, workloads were restarted through `/api/runtime/actions`; health,
controller/API/Studio state and live read-only preview succeeded. Initial API
readiness had transient timeouts/no-listener observations; preserved runtime logs
record the recovery. No active model request or owner Training Run was stopped.

Saved live evidence under `.scratch/expressive92/`:

- `app-health-final.json`, `app-runtime-final.json`: healthy managed stack.
- `variant-live-final-response.json`: dryRun true, executable false, reviewed
  engineering draft with base-fingerprint-unverified blocker; no owner corpus.
- `app-trainers-final.json`: reference-clone entries visible and available;
  F5/ViVoice/Index/Fish deep trainers still blocked with engine-specific reasons.
- `app-generators-resolved-final.json`, `catalog-refresh-observations.jsonl`:
  completed background readiness snapshot at2026-10-23 01:19:57 Asia/Saigon.
  F5, ViVoice and Index are available. Fish remains unavailable because its real
  import exceeds45s. Earlier cold checks also timed out F5; a later F5 check
  passed. Fish's real pretrained inference WAV and successful installation probe
  do not override a failing live catalog check. The45s gate is unchanged. The
  serial background catalog can take several minutes while other engines probe;
  cold-start reliability needs diagnosis before calling all engines ready in UI.

Browser verification was attempted through the supported IAB tool and rejected
because local browser use is disabled in Work settings. No live UI screenshot or
click-through UAT is claimed for this continuation. The built frontend and HTTP
contracts are verified; prior87–91 UI evidence remains historical.

Remaining after96: cold-start readiness reliability;72-sentence/listening checks
for identity, intelligibility, emotion and effort (including observed Index
clipping/boundaries); Fish Vietnamese inference; persistent reviewed effort labels
and verified base lineage; scheduler execution and new native trainers/exporters;
portable runtime/transitive-lock validation. OmniVoice's existing trainer is
unchanged. No owner footage was trained, new trainer activated or Model Set
published in these rounds.
