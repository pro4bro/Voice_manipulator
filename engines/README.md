# Engines

`OmniVoice/` is a read-only upstream Git submodule for `k2-fsa/OmniVoice`. The
parent repository records only the upstream revision, never engine runtime data.

Application code must reach it through `services/api/app/adapters`. Never add
product UI, scripts, checkpoints, datasets, or generated audio inside the
upstream checkout.

Use `scripts/update-omnivoice.ps1` to fetch and fast-forward it safely.
