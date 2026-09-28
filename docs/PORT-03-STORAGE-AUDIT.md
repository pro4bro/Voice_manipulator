# PORT-03 storage audit

Date: 2026-09-23

## Question

Windows Explorer reports 322,374,976,159 bytes (shown as 300 GB) and 436,472
files for the whole repository folder, while the PORT-03 report describes a
117.60 GiB portable bundle. This audit distinguishes path-visible size from
unique NTFS allocation and checks for real duplicate content.

## Measured result

The Explorer number is correct for the whole repository. Windows labels the
value as GB but displays binary GiB: 322,374,976,159 bytes is 300.235 GiB. The
audit-time full scan found 436,460 regular files and 322,374,957,010 logical
bytes, also 300.235 GiB. The 19,149-byte size difference is 0.000006% and the
12-file count difference is consistent with the workspace changing while the
screenshot and scan were taken plus Explorer's reparse-point accounting.

| Measurement | Result |
| --- | ---: |
| Paths visible under repository | 436,460 regular files |
| Screenshot logical bytes | 322,374,976,159 bytes |
| Audit-time logical bytes | 322,374,957,010 bytes |
| Logical size | 300.235 GiB |
| Unique NTFS file identities | 193,453 |
| Unique file content | 152.528 GiB |
| Estimated unique 4 KiB cluster allocation | 152.958 GiB |
| Logical bytes avoided by existing hard links | 147.707 GiB |

There are no sparse or NTFS-compressed regular files. NTFS metadata is not
included in the allocation estimate. Explorer's **Size on disk** also counts
each hard-link path, so it is not a measurement of the physical space consumed
by this folder.

`fsutil hardlink list` confirmed the identity relationship. For example, the
4.654 GiB VibeVoice ASR shard has two names: its runtime path and its PORT-03
bundle path. The 2.166 GiB STT `dnnl.lib` has three names: the old Studio venv,
the portable STT runtime, and the bundle.

## Where the 300.235 GiB comes from

| Top-level tree | Logical size | Unique inside tree | Exclusive physical content |
| --- | ---: | ---: | ---: |
| `.runtime` | 157.002 GiB | 126.984 GiB | 14.086 GiB outside links to other top-level trees |
| `.scratch` | 117.794 GiB | 117.794 GiB | 0.201 GiB |
| `data` | 20.470 GiB | 20.470 GiB | 20.470 GiB |
| `.cache` | 4.502 GiB | 4.502 GiB | 0.053 GiB outside links to other top-level trees |
| `.tools` | 0.246 GiB | 0.246 GiB | effectively 0 GiB outside bundle link |
| Remaining source/build trees | about 0.221 GiB | about 0.221 GiB | about 0.221 GiB |

The PORT-03 staging bundle at
`.scratch/portable-release/Pro4Bro-Portable-20260923-port03b` is 117.597 GiB
when every path is summed. It shares 117.595 GiB with source runtime/model files
through hard links and contributes only about 0.002 GiB of exclusive manifest,
documentation, and audit data. Deleting or moving this staging path removes
117.597 GiB from Explorer's repository total but frees only about 0.002 GiB on
this volume.

The 20.470 GiB `data` tree is project-owned content rather than runtime
duplication. Its largest projects are `test-6` (10.83 GiB),
`conviction-voice-over` (7.19 GiB), and `pdca-cldndd-k4` (2.10 GiB). It must not
be removed as runtime cleanup.

## Redundant or removable content

### Build/test material with real allocation

| Path | Logical size | Physical bytes released if removed | Meaning |
| --- | ---: | ---: | --- |
| `.runtime/smoke` | 9.803 GiB | 9.803 GiB | Old training/smoke checkpoints and debug outputs |
| `.runtime/omnivoice-studio/installer-cache` | 3.224 GiB | 3.224 GiB | Re-downloadable installer cache |
| Six old `.venv` trees | 31.023 GiB | about 1.005 GiB | Most package files are linked to portable runtimes; useful only for rebuilding/updating runtimes |
| `.cache/obs-studio-32.2.2` | 0.053 GiB | 0.053 GiB | OBS build source cache |
| `.runtime/python/.base` and `.downloads` | 0.030 GiB | 0.030 GiB | Runtime builder cache |
| `.scratch/obs-speech-to-text` | 0.196 GiB | 0.196 GiB | Test fixtures and round evidence; retain until no longer needed |

No content was deleted during this audit. Removing the obvious smoke and
installer caches would release about 13.0 GiB. Removing every listed build-only
tree would release about 14.3 GiB, but deleting the old venvs also removes the
prepared inputs used to rebuild the portable runtimes.

### Byte-identical copies that are not hard links

SHA-256 verification of distinct file identities at least 10 MiB found 38
duplicate groups and 22.252 GiB of theoretically reclaimable allocation. Most
are identical PyTorch/CUDA libraries repeated across four intentionally
isolated Python profiles. Two Vietnamese alignment-model snapshots are also
present in both Hugging Face cache layouts and the Studio model layout.

These are real duplicate bytes, but replacing files inside mutable development
runtimes with hard links would make a later `pip` update capable of modifying
another profile. A safe reduction requires an immutable release layout or a
post-copy deduplication step with hash verification. Standard Explorer copy
does not preserve the existing hard-link topology, so a physical copy of the
current bundle should still be budgeted at the full 117.60 GiB.

Machine-readable evidence is stored in ignored workspace files:

- `.scratch/port03-storage-audit.json`
- `.scratch/port03-content-duplicates.json`

## Conclusion

- The earlier **117.60 GiB** number is accurate for one portable bundle.
- The Explorer **300.235 GiB** number is accurate for all paths in the source
  repository plus the staging bundle.
- The repository consumes roughly **152.96 GiB** of unique allocated file data,
  plus NTFS metadata, rather than 301 GiB of distinct file data.
- There is about **13 GiB** of clear build/test cache cleanup and **22.252 GiB**
  of verified duplicate large-file content that can be addressed in a separate
  footprint optimization round.
