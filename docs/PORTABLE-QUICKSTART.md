# Pro4Bro portable test bundle

## Host requirements

- 64-bit Windows 10 or 11.
- A compatible NVIDIA display driver for CUDA transcription and training.
- OBS Studio 32.2.2 for the included bridge plugin build.
- About 118 GiB of free space when this folder is copied to another drive.

Python, Python packages, FFmpeg, model weights, and application services are
already stored inside this folder. Do not install Python or run `npm install`.

## First run on another machine

1. Copy the whole bundle folder. Do not copy only the executable or `scripts`.
2. Run `VERIFY-PORTABLE.bat`. Continue only after it reports zero failures.
3. Run `open-pro4bro-console.bat`, open Preferences and use the OBS LiveLink plugin
   card to install or repair. The app asks for Windows elevation only if the
   normal write is denied. Restart OBS when Preferences says it is required.
4. Open the Speech to Text page.
5. Open an existing portable project or create a project inside the app's
   `data` folder. Never edit an absolute project path into `project.json`.

The installer places the bridge DLL and locale in the standard OBS plugin
directory, or inside a selected OBS portable root. It keeps installation
identity and token in the Windows user's OBS profile. From alpha 0.5.9,
close OBS and double-click `INSTALL-OBS-PLUGIN.bat` to install, update or repair
automatically using the same validated installer. Repair keeps existing pairing;
reopen OBS afterward. Explicit `-Action repair` and `-Action remove` remain
available. The current plugin still uses v2
`config.json` for live capture; source UUID and project setup remain manual
until LIVELINK-03. Tokens are absent from the portable bundle.

## App updates

For app updates from installed alpha 0.5.7 or earlier, copy the whole numbered
pack into `updates` and click its `APPLY-UPDATE.bat` once. This installs the
updater that stops the controller, API and Studio before replacing app files.
Alpha 0.5.8 and newer can use root `UPDATE-PORTABLE.bat` for later packs.

## Acceptance recording

In OBS, add one microphone source and one application-audio source. Start the
Pro4Bro app, pair the project, select both source UUIDs, then record, pause,
resume, and stop. Confirm that OBS keeps a playable MKV and Pro4Bro receives
separate live stems. PORT-03 clean-machine acceptance also requires the `All`
audit and app health checks from the copied path.
