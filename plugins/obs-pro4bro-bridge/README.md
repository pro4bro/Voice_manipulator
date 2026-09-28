# Pro4Bro OBS Bridge

This OBS 32 Windows plugin captures each configured audio source while OBS records. Every source has its own bounded queue, worker, sequence space, reconnect loop, app stem, and provisional transcript. It converts OBS float planar audio to PCM16 in the capture callback and performs all HTTP and disk dependent work on source-specific workers.

## Runtime configuration

Place `config.json` in OBS' `plugin_config/pro4bro-obs-bridge` directory. Copy `config.example.json`, then set:

- `apiBase`: loopback Pro4Bro API URL.
- `projectId`: open Pro4Bro project ID.
- `token`: token returned by `GET /api/projects/{projectId}/obs-live/pairing`.
- `sources`: explicit OBS source UUID objects. Missing sources fail independently and never fall back to a different source.
- `overlayEnabled`: when true, the plugin adds an owned **Pro4Bro Live Captions**
  Text (GDI+) source to the current scene, and to any scene entered while
  recording. The app supplies a UTF-8 caption file in the project cache. OBS
  reads that file; a failed caption update never blocks the audio bridge.

The source contains `[LIVE DRAFT]` and is provisional. It is recorded into the
video only when visible in the active scene. OBS can reposition/style the owned
Text source after the plugin creates it. The source persists in the scene
collection and becomes blank when the session stops. For scenes saved across
machines, re-pair the project so the plugin updates the machine-local file path.

The plugin can begin while the app is unavailable. It retains a bounded in-memory backlog, reports overflow as a sequence gap, and resumes the same source session when the local API returns.

The Tools > Pro4Bro Voice Manipulator LiveLink dialog connects through
`livelink-install.json`, written per Windows user by the app installer. It
shows connection, OBS recording and active-project status and can launch the local app. New
installs no longer need `config.json` for pairing or to open the dialog.
The old `config.json` remains a one-release v2 recording fallback; source
selection, peak meters, forward flags and aliases are stored locally in
`livelink-channels.json` by scene collection. The dialog shows the default
visible OBS Audio Mixer sources and retains a selected missing source for
review. Version 0.6 synchronizes the source inventory, meters and Forward
selection with the app through v3 commands and applied ACKs. It also captures
enabled sources as bounded per-source PCM queues while an app recording is
active, uploads hashed chunks, sends OBS lifecycle events, and finalizes a
project-owned recording after app Stop. The worker remains active when the
dialog is hidden. The API creates transitional per-channel WAV stems for the
Media Pool; LIVELINK-07A now packages their verified source tracks into one
audio-only MKA with an embedded session manifest.
The dialog is an
OBS-owned Win32 modeless window; this Windows-only build does not need a Qt
development package. Do not run a second copy of this DLL through
`OBS_PLUGINS_PATH` during recording because both copies would receive events.

The Tools dialog follows OBS' dark/light theme with DPI-scaled panels, source
meters and a Pro4Bro header. The header mark is rendered from the supplied
Pro4Bro logo embedded in the DLL; the package also includes
`data/brand/pro4bro-livelink.svg`. Forward and alias
controls support keyboard focus; the app installer checks hashes for the DLL,
locale and logo in both standard and portable layouts.

## Local Windows build

Run `scripts/build-obs-plugin.ps1`. It reads the installed OBS DLL exports to create local import libraries, builds against the matching OBS source headers, and places the DLL under `build/obs-plugin`. The script does not write to the OBS installation.

For a smoke test, set `OBS_PLUGINS_PATH` to the output directory and `OBS_PLUGINS_DATA_PATH` to this plugin's `data` directory before starting OBS.
