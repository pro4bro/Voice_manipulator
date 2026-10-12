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

If this portable folder is still under the source checkout on the development
machine, double-click **`UPDATE-PORTABLE.bat` in this folder** after each code
change. It finds the source, builds the web UI, applies the latest app code and
leaves a small transfer pack at `updates/app-current`. Wait for the window to
show `updated: true` and `gateFailed: 0`.

For the first move to another machine, copy this **whole portable folder**
(about 36 GiB), run `VERIFY-PORTABLE.bat` there, then start the app with
`start-pro4bro.bat`. For later code-only updates, copy only the development
portable's `updates/app-current` folder (about 4 MiB) into the other portable
at the same path, replacing the complete older pack. On the other machine,
double-click its `UPDATE-PORTABLE.bat`, run `VERIFY-PORTABLE.bat`, then start.

If this portable is not under the source checkout, first double-click
`MAKE-PORTABLE-UPDATE.bat` in the source repository. Copy its resulting whole
update folder into this portable as `updates/app-current`, then double-click
`UPDATE-PORTABLE.bat` here.

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
