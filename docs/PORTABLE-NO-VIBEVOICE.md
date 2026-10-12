# Pro4Bro portable — without VibeVoice

This bundle includes the Pro4Bro UI and API, FFmpeg, OBS bridge, STT models,
OmniVoice code and checkpoint, and the existing RVC/Applio runtime. The
VibeVoice runtime, source and weights are omitted to keep the folder smaller.
VibeVoice remains in the model lists with an unavailable/not-installed status;
select an installed model for actual processing. No model should be reported as
successful until its output artifact exists.

## Move and verify

1. Copy the **whole** folder to a 64-bit Windows 10/11 machine with enough free
   space. The exact size is recorded as `bytes` in `.portable-bundle.json`.
   A `HardLink` staging build occupies less extra space on this drive; copying
   it to a different drive materializes the full size.
2. Run `VERIFY-PORTABLE.bat`. It reads the bundle profile and checks the local
   runtimes, model files, OBS plugin hashes and the absence of VibeVoice files.
3. Run `start-pro4bro.bat`. NVIDIA GPU features require a compatible driver.
   OBS Studio 32.2.2 is needed for the included bridge plugin build.
4. Open or create a project under this folder's `data` directory, or use Open
   Existing for a project carried beside it. Keep `project.json` and its assets
   together. Do not edit absolute paths into the project file.

## Update the app without copying models again

On the development machine, double-click `MAKE-PORTABLE-UPDATE.bat` in the
source repository. It builds the latest web UI and writes a small app update
folder under `.scratch/portable-updates`. Copy that **whole update folder** to
this portable folder as `updates/app-current`. Then double-click
`UPDATE-PORTABLE.bat` here. If this portable folder still sits inside the
source checkout, `UPDATE-PORTABLE.bat` finds the source and builds a fresh
update automatically; no copying is needed.

The updater checks each app file, replaces only app-owned paths, runs
`VERIFY-PORTABLE` checks and rolls back app files if verification fails. If this
portable instance was running, it stops and restarts its services. Another
instance using the same ports is left alone. Python runtimes, upstream engine
code, model caches and checkpoints stay in the separate base layer. Changes to
those require a new base/runtime package; an app update cannot install a new
model or Python dependency. The two inventories are
`.portable-app-layer.json` and `.portable-model-layer.json`. Existing runtime
paths remain in place so model loaders and copied projects stay portable.

The bundled OmniVoice base checkpoint is from
[`k2-fsa/OmniVoice`](https://huggingface.co/k2-fsa/OmniVoice), revision recorded
in `.cache/huggingface/hub/models--k2-fsa--OmniVoice/refs/main`. The upstream
code is Apache-2.0; the pretrained checkpoint is **CC-BY-NC**. Use and sharing
of that checkpoint must follow its non-commercial terms. Other bundled model
files have their own upstream terms. No user recordings, projects or tokens are
included.

For a direct offline comparison, start with the bundled faster-whisper Tiny,
Base, Medium and Large-v3 selections on the same audio and keep language/device
settings fixed. Small remains listed but its weights are not in this bundle;
choosing it on an offline machine will require a separate model install. The
optional EasyVoice-core candidates and a measurement protocol are in
`docs/research/EASYVOICE-INTEGRATION-CANDIDATES.md` in the development repo;
they are recommendations, not extra runnable engines in this bundle.
