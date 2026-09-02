# Reading Packs

App-level reading material for High Quality Voice Training. A pack is read-only
reference content shipped with the application; it is **not** project data and
never lives under `data/`.

When a project uses a pack, the Reading Studio copies the cards it actually
recorded into the project's session ledger. A project that moves to another
machine therefore keeps its own ground-truth text even if the app later ships a
different pack version. The pack here stays the catalogue, not the record.

## Schema

```jsonc
{
  "packId": "vi-core-v1",          // stable; bump the suffix, never edit in place
  "language": "vi",                 // BCP-47 primary subtag
  "languageName": "Tiếng Việt",
  "title": "...",
  "version": 1,
  "license": "pro4bro-original",   // every card must be original or licence-clear
  "passages": [
    {
      "id": "vi-exciting-01",
      "kind": "coverage" | "drill" | "emotion",
      "emotion": "exciting",       // one of the app's EmotionLabel values, never "mix"
      "title": "...",
      "direction": "...",          // acting note shown above the teleprompter
      "cards": [
        { "id": "vi-exciting-01-c01", "text": "...", "tags": ["numbers"] }
      ]
    }
  ]
}
```

Word count and estimated duration are **derived at read time**, not stored, so a
text edit can never leave a stale number behind.

## Card rules

- One card is one recorded take. Keep it inside 2–15 seconds of speech, which is
  the window both OmniVoice and VibeVoice datasets are comfortable with.
- A card must be a complete thought. Never split a sentence across two cards: the
  segment boundary becomes a training sample boundary, and a half sentence
  teaches the model a truncated prosody contour.
- No proper names of real people, no brands, no dictated punctuation.
- `tags` are content hints (`numbers`, `dates`, `acronym`, `foreign`, `drill`,
  `question`, `long`), used for coverage reporting. They are not phonetic claims.

## Adding a language

Add one `<lang>-core-v1.json` file. A pack is complete when it carries, at
minimum, one `coverage` passage, one `drill` passage, and one `emotion` passage
per app emotion label except `mix`.
