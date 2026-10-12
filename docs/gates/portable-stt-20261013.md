# PORT-STT-01 — portable STT catalog and numbered update

Owner reported that Speech to text was greyed out on the other machine.
Phase03 remains60%; this round repairs portable eligibility, not STT timing
accuracy or the remaining training phases.

## Reproduction and cause

The installed alpha 0.5.3 portable was served using its embedded core Python
and production API, with isolated diagnostic data on port18130. Its real
`GET /api/stt-engines` returned faster-whisper `installed:false`,
`available:false`, status `Chưa thấy ./studio_app/server.py trong thư mục
'studio'.` The source API returned both flags true. The portable UI showed
`1 TO STT`, the footage's STT checkbox checked, every Whisper choice marked
unavailable, and `Speech to text (1)` disabled. Screenshot:
`.scratch/portable-stt-debug/before.png`.

The production catalog hardcoded `services/stt_studio`. Portable app packs
deliberately ship that sidecar under `.runtime/omnivoice-studio/studio_app`.
The presence/import-only gate previously passed without querying the catalog
that disables the UI. No extra model download is needed to repair this bug.

Settings now resolves the bundled service first, with a source-tree fallback;
the API uses that root. Five production-endpoint regressions cover source,
portable, both, absent and moved Unicode-folder layouts. Before the fix:
3failed/2passed (two missing-portable availability assertions and the absent
new resolver property). After: all5pass.

The portable gate now also executes the production catalog with embedded core
Python and requires faster-whisper availability. The first actual alpha 0.5.4
BAT exposed Windows PowerShell stripping double quotes from Python `-c`; the
gate rejected it and the updater restored alpha 0.5.3. A native Windows
PowerShell/embedded-core regression failed before repair, then passed with
single-quoted Python literals. The published successor is alpha 0.5.5, issued
automatically without reusing the rejected version. Product commits:
`6624e24` and `3984245`.

## Automated checks

- `.venv/Scripts/python.exe -m pytest services/api/tests/test_portable_stt_catalog.py services/api/tests/test_settings.py services/api/tests/test_training_model_catalog.py services/api/tests/test_stt_restart_recovery.py -q`: **34passed**, two existing deprecation warnings.
- Full backend: **755passed/3failed**, 361.84seconds. Failures were
  `test_reads_a_file_while_a_real_mkv_writer_is_still_running`,
  `test_api_restart_resumes_unfinished_follow`, and
  `test_readiness_deadline_retains_live_process_and_listener_evidence`.
  Allthree passed on a separate unchanged rerun in39.72seconds. No assertions
  or deadlines were changed; the initial full run is not reported as green.
- Media Pool frontend: **56passed**, 52.45seconds, threads/twoworkers.
- `npm run typecheck`, creator's `npm run build`, PowerShell parse and
  `git diff --check` passed. UI source was unchanged in this round.

## Installed portable inference

Diagnostic API and Studio use the bundle's own core/STT Python and shipped
service code, local FFmpeg and model caches. Only the native chooser returns a
fixture path because the available browser tool cannot operate Windows native
dialogs. The isolated controller shim reads the actual sidecar's health.
Inference, job queue and transcript persistence are production implementations.
Ports18130/18131 avoid the owner's running source services; no source workloads
or GPU inference were stopped or replaced.

Explicit CPU/int8 with `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` exercises
local model inference without CUDA or downloading weights. A cached native
4second Vietnamese speech WAV was imported through the real UI, ticked STT
and submitted with the now-enabled button. **Large v3 completed with21words**:
`Mà thực ra là với mọi người thì cũng như vậy Bây giờ một người thì cũng đã có
rất nhiều`. Numeric timestamps were finite, ordered per word and within4seconds.
The original fixture, local selected file and cached project source have
identical SHA256. Relative paths persist. The analysis is24kHz monoPCM16,
4seconds, peak24235/32768, without clipping. Detailed result:
`.scratch/portable-stt-debug/after/result-large-v3.json`.

The actual alpha 0.5.5 pack's `APPLY-UPDATE.bat < nul` completed successfully:

```json
{
  "updated": true,
  "release": "alpha 0.5.5",
  "sourceRevision": "398424504284eeec0e7ff5e94953f4328b8e462f",
  "createdFromSource": false,
  "appFiles": 153,
  "modelLayerChanged": false,
  "gatePassed": 31,
  "gateFailed": 0
}
```

Installed manifests report0.5.5. The base manifest SHA256 remains
`E789A4C7625FAC21FCE647D889C36EE52CC2DA11D94E7478EDCDBBB5719E0D96`.
Rejected0.5.4 artifacts were moved to the explicitly named debug/rejected folder
and removed from discoverable `updates`; that version was not delivered.
Fresh embedded-core API after installation reports faster-whisper available
and VibeVoice unavailable. **Medium completed with21words**, the same text as
Largev3, through the actual fresh alpha0.5.5 UI. The source hash and24k mono
PCM16 analysis checks also pass; result:
`.scratch/portable-stt-debug/after/result-medium.json`.
Selecting the footage displays21words/87characters in Script and source word
intervals on Timeline; the STT button is enabled. Screenshot:
`.scratch/portable-stt-debug/after.png`. Diagnostic workloads are stopped after
verification; cleanup targeted only the recorded embedded-bundle diagnostic
PIDs and their children. The final netstat snapshot has no listeners on the
five observed ports. The initial source PIDs were not targeted by our stop
commands; the reason their state changed is not established in this round.

## Transfer artifact

`.scratch/portable-updates/Pro4Bro-AppUpdate-alpha-0.5.5-NoVibeVoice.zip`:
**1,213,340bytes**,157archive entries; all153payload files verified against
manifest SHA256 and size. Contains the whole numbered pack folder. Copy it to
the other portable's `updates` and run its `APPLY-UPDATE.bat`, or the root
`UPDATE-PORTABLE.bat` to auto-select the highest compatible version.

## Remaining gap and exact next round

Apply alpha 0.5.5 on the owner's D-drive machine, restart from the full portable
root, tick STT on imported footage and run Medium/Large v3. This local CPU
smoke proves a real transcript artifact, not independent Vietnamese recognition
accuracy, word-boundary accuracy or the other machine's GPU/driver performance.
The planned STT-TIMING-ACCURACY-01 reference review remains separate.
