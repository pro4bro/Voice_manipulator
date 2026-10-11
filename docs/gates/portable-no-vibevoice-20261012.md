# PORT-NOVIBE-01 — portable without VibeVoice

Date: 2026-10-12. This bounded round adds a `NoVibeVoice` packaging profile
and builds a transferable folder at
`.scratch/portable-release/Pro4Bro-Portable-20261012-NoVibeVoice`.

## Artifact and evidence

- `.portable-bundle.json`: `profile=NoVibeVoice`, 97,646 files,
  38,637,652,433 logical bytes = 35.98 GiB. `HardLink` staging shares physical
  blocks with the source; a normal copy to another volume uses the full size.
- The VibeVoice source/weights tree and private Python runtime are absent.
  Their product descriptors remain in the API resources.
- `k2-fsa/OmniVoice` revision
  `c5fdb5ccb189668d56333f77ba2629f4cd7535f4` was copied from an existing
  local cache into the project cache. `snapshot_download(local_files_only=True)`
  resolved both this checkpoint (2,450,344,112 bytes) and the required Higgs
  Audio tokenizer (805,665,628 bytes) from the built folder. The OmniVoice
  checkpoint SHA-256 is a critical file in the bundle manifest.
- Source `test-portable-runtime.ps1 -Profile NoVibeVoice`: 22 passed, 0 failed.
  Built folder `-Profile Auto`: 27 passed, 0 failed.
- `apps/web`: `npm run build` passed (includes TypeScript project build).
  Focused backend catalog/settings tests: 19 passed.
- Starting `scripts/pro4bro-workloads.ps1 -Action start -SkipWebBuild` from the
  built folder brought both Studio and API to `running`; `/api/health` returned
  `status=ok`. The four VibeVoice training choices, one generator and one STT
  choice remained listed with `installed=false`, `available=false`. Three
  OmniVoice training choices reported available. Workloads were stopped and
  smoke-test logs were removed from the staged folder.

## Limit and next round

This verifies packaging and service startup on the build machine. No actual
audio inference, training, OBS capture, physical copy, or clean-machine GPU
acceptance was performed. Copy the whole folder to the target machine, run
`VERIFY-PORTABLE.bat`, then benchmark the bundled STT models and OmniVoice on a
fixed media set. The faster-whisper Small option is listed but its weights are
not in this bundle; install them separately before an offline Small comparison.
Do not treat the EasyVoice F5/ViVoice or Demucs candidates as installed engines.
