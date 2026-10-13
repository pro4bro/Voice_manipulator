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
identity and token in the Windows user's OBS profile. `INSTALL-OBS-PLUGIN.bat`
is a fallback using the same installer. The current plugin still uses v2
`config.json` for live capture; source UUID and project setup remain manual
until LIVELINK-03. Tokens are absent from the portable bundle.

## Acceptance recording

In OBS, add one microphone source and one application-audio source. Start the
Pro4Bro app, pair the project, select both source UUIDs, then record, pause,
resume, and stop. Confirm that OBS keeps a playable MKV and Pro4Bro receives
separate live stems. PORT-03 clean-machine acceptance also requires the `All`
audit and app health checks from the copied path.
