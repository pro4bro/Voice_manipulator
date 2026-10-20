# Portable alpha 0.5.18 release — 2026-10-20

Packaging follow-up to round62; no new product round or Phase03 progress.

## Artifacts

- Full portable: `releases/Pro4Bro-Portable-alpha-0.5.18-NoVibeVoice/`.
  Clean source `f185bb5e9c674b71eacd4351085369826022b337`, including the round62
  fix `1ee57da6439be30416465d6565dcaa5f31de2069`. Contains 82,208 files,
  44,019,963,564 bytes (41.00 GiB); base runtime/model layers are present.
- App pack: `releases/updates/App-alpha-0.5.18-NoVibeVoice/` and the matching ZIP.
  Created by the official generator from clean source `1ee57da`; 221 payload
  files / 5,026,523 bytes. ZIP has 226 files / 1,472,178 bytes.
- ZIP SHA256:
  `9d8011cb67bf583867b8cd61fb5d9e111eb7396bca12af0f5f58975b9d2de07c`.
  The adjacent `.zip.sha256` records the same hash and archive name.

`APP-VERSION.json` was advanced automatically to alpha 0.5.18. The later version
commit changes release metadata only. Every app payload file also matches the
full portable byte for byte. Artifacts remain under the ignored `releases/`
folder; source and release evidence are committed to Git.

## Compatibility and migration

API requirements gained `websockets>=15,<18` after the 0.5.17 pack. The runtime
manifest hash remains unchanged, but the API requirements hash differs:

- Previous: `F2F0E850647213545E120D34179957A8185E2B2069FE9FA896BD6E7956F19F65`.
- Current: `9A28789612BCB47C94071BEDFC09DBD49FFA261A125493B0B2B1C726E0130E8A`.

The existing updater rejects the app pack on the old 0.5.16/0.5.17 base before
replacing app files. That dependency guard was retained. Following
`docs/PORTABLE-APP-UPDATES.md`, a new full bundle was built for this migration.
Its own core Python has websockets 17.0.1, including the asyncio client import,
and all probed Python/API modules resolve inside the bundle.

Use the full 0.5.18 folder when migrating from the old base. Copy the entire
folder to another machine, run `VERIFY-PORTABLE.bat`, then
`open-pro4bro-console.bat`. Open existing projects through Open Existing with
their project.json and media kept together. The small app ZIP includes
`COMPATIBILITY.txt` and requires a base with the matching requirements/runtime
inventory.

The full local staging folder uses hardlinks for base files. Copying the folder
to another drive or machine materializes independent files and needs about
41 GiB. User projects, recordings and developer virtual environments are excluded.

## Verification

| Check | Result |
| --- | --- |
| Official app generator, rebuilding the web UI | Pass, 191 modules |
| Capture/plugin package audit | 5 passed, 0 failed |
| Source NoVibeVoice runtime audit | 24 passed, 0 failed |
| Official full builder, HardLink / NoVibeVoice | Ready, no pending base components |
| Full bundle `test-portable-runtime.ps1 -Profile Auto` | 33 passed, 0 failed |
| Payload bytes, hashes, source mapping and inventory | All 221 files match |
| ZIP CRC, inventory and uncompressed bytes | All 226 files pass |
| App payload parity with the full bundle | All 221 files match |
| Bundle core Python / websockets | Local imports, version 17.0.1 satisfies the requirement |
| Bundle API health through ASGI TestClient | HTTP 200, status ok |
| Bundle built UI through ASGI TestClient | HTTP 200 |
| Bundle STT catalog through ASGI TestClient | faster-whisper available |

Raw evidence is in `releases/portable-0.5.18-{capture-audit,source-audit,bundle-audit,
update-verification,bundle-verification}.json`. Packaging and probe scripts/logs
remain under `.scratch/`. All verifiers ran without changing their assertions,
dependency guard or timeout policies.

The existing round62 regression results are carried forward: frontend 1138
passed / 136 files, typecheck and build passed, full API 1207 passed on retry.
Those suites were not rerun for release metadata and documentation changes.

Second-device startup and native held-drag acceptance remain unverified. The
ASGI probe does not claim an installed console/API/Studio stack or new acoustic
acceptance. Phase03 remains at 60% with its separate provider/processor gates.
