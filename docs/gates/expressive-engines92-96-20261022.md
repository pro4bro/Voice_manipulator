# Expressive engines — rounds92–96, 2026-10-22

Owner explicitly requested five more rounds. Baseline `97f0ad5` on
`codex/expressive-engines`; the working tree was clean. The updated scope and
acceptance live in the emotion/delivery research plan. Upstream checkouts are
read-only and project media is preserved. New model/runtime files stay ignored.

## Round92 / ED-RUNTIME-01 — in progress

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

Provisioner focused tests14 pass; smoke-evidence tests4 pass. Actual installation
is in progress. The first attempt was deliberately stopped after metadata proved
cached_path1.6.7's Hub<0.28 conflicted with Transformers4.52.1's Hub>=0.30. Pin1.8.0
has an intersecting constraint. A subsequent slow Torch transfer was stopped only
at its owned installer child PID; same-byte ranged cache download is in progress.
Index OpenCV4.12 replaces upstream4.9 to match NumPy2.2.6's ABI; deviations remain
product-owned requirements, never edits to upstream.

## Planned evidence boundaries for93–95

`scripts/check-expressive-inference.py` uses product adapters/private workers,
the shared GPU lease and immutable reference hashes. It retains settings/source/
model identity and measures decoded rate/channels/frames, peak/RMS/full-scale
fraction and first/last20ms RMS. It never normalizes away peaks or reports acoustic
acceptance. Empty/silent/stereo/non-finite output is rejected. Existing evidence
paths cannot be overwritten. WAVs and reports will be retained under
`.scratch/expressive92/` with exact source URLs and hashes.

F5's pinned basic EN sample is a24k mono5.333s source. Vietnamese engineering
reference: `nguyenthienhy/F5-TTS-Vietnamese` at
`e74db9d5a5e521bb930490e7cd7912438bf7ae84`, `ref.wav`, with transcript from the
same commit's `infer.sh`; SHA256
`714c92c7bc742ef8173ecd9aa60bac68b0e932981edb80e6d4f7ae12e2880152`.
It is a short1.883s public engineering fixture, not a reviewed owner corpus or a
production identity benchmark. It is not included in a release or project.

## Round96 / ED-VARIANT-PREP-01 — code ready, integration pending

Read-only preview endpoint and domain/adapter are implemented; ADR0136 records
the boundaries. Focused preview/training API/catalog36 pass; compiler34 pass.
These checks prove planning invariants and no project writes, not actual model
training, GPU inference or publication. Runtime/API integration checks remain.
