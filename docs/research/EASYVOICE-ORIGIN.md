# EasyVoice repository origin check

**Question:** Is `XavierChuu/EasyVoice` a fork or copy of another public repository also named EasyVoice?

**Assessment:** The public evidence supports `XavierChuu/EasyVoice` being an independently initialized project, assembled by Xavier Chu with substantial AI-assisted implementation and integrations of upstream voice/model projects. It is not a GitHub fork, and its public Git history has no shared commits with the examined same-name candidates. This cannot rule out unattributed snippets or code copied without Git history.

## Candidates and comparison

| Repository | Relevant overlap | Origin and implementation evidence | Relation to XavierChuu/EasyVoice |
|---|---|---|---|
| [XavierChuu/EasyVoice](https://github.com/XavierChuu/EasyVoice) | Target: desktop voice studio with voice creation, F5-TTS, RVC conversion, transcription and multitrack audio editing. | GitHub metadata says `fork: false`, created 2026-10-04. Its first commit is [866c1bc](https://github.com/XavierChuu/EasyVoice/commit/866c1bc32df9f63cd6cafe0d97d6b9060ba8bfc0), authored by Xavier Chu, titled “Initial commit: project spec and UI mockup.” The inspected `main` history has 26 commits through [af299a5](https://github.com/XavierChuu/EasyVoice/commit/af299a5cce44c6f877047bff54496fc1a823c090). Many implementation commits are attributed to `Claude <noreply@anthropic.com>`; later commits are attributed to Xavier Chu. Its tree is an Electron + React desktop app, Python/FastAPI engine, generated API types, packaging/docs, plus vendored/adapted RVC code and third-party integrations. | The project's own public history starts here; implementation is AI-assisted and relies on upstream components, so “independent” means no evidence of being forked/copied from the examined EasyVoice-named repos, not that all code is original. |
| [sparrow2015/EasyVoice](https://github.com/sparrow2015/EasyVoice) | Its README lists the same broad categories: text-to-speech, speech-to-text, audio format conversion and editing. It is the strongest name-and-feature-description match. | Created 2026-09-19; its only commit is [4212d7e](https://github.com/sparrow2015/EasyVoice/commit/4212d7eee040bf705591e21d0b59f9a04260850b), “Initial commit.” At the inspected `main` HEAD the repository contains only `README.md`; no implementation, dependency manifest, or model/source tree is available to compare. | Predates the target by about two weeks, but provides no code or history establishing it as the source. The short generic feature sentence is insufficient to establish copying or common authorship. |
| [rockbenben/easyvoice](https://github.com/rockbenben/easyvoice) | Same name and voice-cloning/TTS purpose; subtitle dubbing overlaps some output workflows. | Created 2026-06-24. README and tree describe a Python/Gradio local app built around Qwen3-TTS, with subtitle dubbing, voice library and presets. Its own code is MIT-licensed. Its initial commit [1cf1dd4](https://github.com/rockbenben/easyvoice/commit/1cf1dd4afb9f3368eed0ab29ca98daf6c580737b) predates the target. | Different implementation and product scope. No shared commits with the target. It does not document RVC conversion, live voice changing, or the target's Electron/FastAPI desktop architecture. |
| [cosin2077/easyVoice](https://github.com/cosin2077/easyVoice) | Same name; TTS, multilingual voices, long text, character voices and subtitles. | Created 2025-03-15. README/tree show a Node/pnpm web monorepo, with backend TTS engines including Edge-TTS and Kokoro, streaming and subtitle generation. Its first commit is [b205eb5](https://github.com/cosin2077/easyVoice/commit/b205eb56763eda466dbb558e459bcad15dd3cc9b). | Different web TTS product and architecture. No shared commits with the target; no evidence it supplied the target's code. |
| [randermin/easyVoice](https://github.com/randermin/easyVoice) | Same name; related to the cosin2077 TTS project. | GitHub metadata reports `fork: false`, but its history begins with the exact same commit [b205eb5](https://github.com/cosin2077/easyVoice/commit/b205eb56763eda466dbb558e459bcad15dd3cc9b) and subsequent shared commits. Its history includes a merge from `cosin2077/easyVoice`. | A useful counterexample: GitHub's `fork` flag alone misses copied/imported repository history. It is related to cosin2077, but neither repository shares commits with XavierChuu/EasyVoice. |

## Methods and direct evidence

- Queried GitHub's first-party [repository search API](https://api.github.com/search/repositories?q=EasyVoice%20in%3Aname&per_page=100), plus searches for `easy-voice in:name` and `Evoice in:name`. The exact-name query returned 39 repositories; candidates above were selected for relevant voice-product descriptions or broad feature overlap. Many other hits are unrelated projects using the common name.
- Checked GitHub repository metadata (`created_at`, `default_branch`, `fork`, `parent`, `license`) and repository commit/tree endpoints. Example first-party endpoints: [target metadata](https://api.github.com/repos/XavierChuu/EasyVoice), [target commits](https://api.github.com/repos/XavierChuu/EasyVoice/commits?per_page=100), [target tree](https://api.github.com/repos/XavierChuu/EasyVoice/git/trees/main?recursive=1); equivalent endpoints were checked for each comparison repository.
- Cloned the target and four relevant candidates and inspected full available Git histories, root trees, and READMEs. The target has 26 commits. No commit SHA from its history exists in the histories of `sparrow2015/EasyVoice`, `rockbenben/easyvoice`, `cosin2077/easyVoice`, or `randermin/easyVoice`; `git merge-base` found no common ancestor for any of those pairs. `randermin` and `cosin2077` do share history with each other.
- Compared the documented stacks and repository layouts: target Electron/React + Python/FastAPI; rockbenben Python/Gradio + Qwen3-TTS; cosin2077 Node/pnpm web monorepo; sparrow2015 README-only. Matching broad product categories and integrating the same upstream projects/models do not by themselves indicate a fork.

## Limits

This is a public-repository check, not a proof of authorship. Git history cannot detect code copied into a new repository without commit ancestry; the README-only sparrow repository also does not expose implementation code to compare. GitHub name search is not exhaustive of deleted, private, unindexed, or differently named repositories. The examined evidence supports independent initialization and AI-assisted development for XavierChuu/EasyVoice, but cannot establish who wrote every line or exclude uncredited reuse.

## Direct source-content comparison

A content-level check was run against the cloned `main` snapshots at the time of inspection:

| Compared repo | Eligible nontrivial source files | Exact Git blob matches with target |
|---|---:|---:|
| [rockbenben/easyvoice](https://github.com/rockbenben/easyvoice) | 21 | 0 |
| [cosin2077/easyVoice](https://github.com/cosin2077/easyVoice) | 61 | 0 |
| [randermin/easyVoice](https://github.com/randermin/easyVoice) | 61 | 0 |
| [sparrow2015/EasyVoice](https://github.com/sparrow2015/EasyVoice) | 0 | 0 |
| XavierChuu/EasyVoice target | 160 | — |

The scan used Git blob object IDs from each `HEAD` tree and considered `.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.html`, and `.css` files of at least 200 bytes. It excluded lock/license/notice-named files, build/dist/coverage paths, `node_modules`, and vendored/third-party paths (including the target's vendored RVC sources). Tests were included when they matched the source extensions. The result is **zero exact full-file matches**, including across renamed paths.

I also inspected the closest TTS/subtitle implementation areas. The target's `engine/easyvoice_engine/services/tts/pipeline.py` defines `text_language`, `plan_sentences`, `plan_parts`, `TtsRender`, and `run_tts`; rockbenben's `app/tts_engine.py` instead contains Qwen model loading, `_raw_synthesize`, subtitle parsing, cue generation, and timeline assembly. The target's API/UI sits in FastAPI plus Electron/React; cosin2077's TTS flow is Node services (`generateTTS`, LLM segmentation, concurrent tasks) and a separate frontend. Spot checks found no identical substantive source lines (>45 characters after whitespace normalization) in the selected cross-project file pairs. A rough `SequenceMatcher` check on selected TTS files scored 0.6–2.3%; this is only a weak diagnostic because the files have different APIs and languages, not a proof of non-copying.

`randermin/easyVoice` is itself content/history-related to cosin2077: 59 of 61 eligible source blobs match; the two changed files are its vendored `node-edge-tts` implementation files. The target matches neither repo. `sparrow2015/EasyVoice` has no eligible source code to inspect.

**Local clones used:** `C:\Users\vuhoang\AppData\Local\Temp\easyvoice-origin-check\XavierChuu__EasyVoice`, `...\rockbenben__easyvoice`, `...\cosin2077__easyVoice`, `...\randermin__easyVoice`, and `...\sparrow2015__EasyVoice`.

This strengthens the public-evidence case for independent implementation, but exact-file hashing and selected-file inspection do not detect rewritten, translated, or partial copied code, and cannot cover private/deleted repositories.
