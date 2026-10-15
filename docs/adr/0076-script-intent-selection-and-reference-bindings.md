# ADR 0076 — Portable Script intent, selection and reference assignments

Accepted for the owner's first five Voice Manipulator rounds, 2026-10-15.

## Decisions

- Keep editable clip/segment/sentence intent in project-owned
  `scripts/voice-over.json`. Browser storage is a legacy migration/temporary
  recovery source. Serialize saves and reject stale document revisions; never
  overwrite a newer draft with an earlier asynchronous save response.
- Preserve sentence IDs, source lineage, tags and exact original text across
  split/join, generated-output metadata and reopening. Generation normalizes
  whitespace for speech/cache identity, while original text must normalize to
  the same words. Intl sentence segmentation supports the owner's five languages.
- Resolve settings sentence → segment → clip, with ancestor locks. Persist
  duration, emotion/mood/intensity, delivery, gain and note as requested intent.
  Until native duration/delivery/gain rounds are implemented, reject unsupported
  synthesis intent instead of claiming it was applied to audio.
- Reference is an independent asset role, not training/STT selection, target
  voice identity or a duplicated source file. Mixed containers require an
  imported audio track. Selecting a Library row never decodes audio.
- A production selection carries source identity/revision, stable sentence and
  immutable-output word IDs, explicit time ranges and UTF16 text spans. Preserve
  silence/disjoint ranges. Cancellation restores the gesture snapshot; multiple
  ranges do not trigger implicit seeking/scrolling. Display measured word bounds
  for text selection when only word timing exists; never invent sub-word timing.
- Store requested per-source properties/spans/strength/priority in
  `scripts/reference-bindings.json`. One logical target has one binding ID across
  Script saves; revision is validated provenance, not a duplicate slot identity.
  Output IDs distinguish immutable output revisions. Apply validates every target
  and source, then writes atomically with optimistic revision checks. Cancel
  creates no binding; late reads cannot reopen a cancelled editor.
- Keep marked/unmarked/missing/stale reference information distinct. Hash the
  actual selected audio and preserve original media. An assignment remains
  `requested`, not proof of extracted features or successful voice generation.
  Resolve/locks/conflicts/random schedules/rendering and Reference Detail belong
  to their later rounds. Reference Detail content-click must navigate both Script
  and Timeline; its expand button must not navigate.
- Snapshot each distinct output/Script once per request, and hash each distinct
  source once; many targets must not repeatedly parse the same transcript/media
  index. Generation cache identity includes voice artifacts/reference content and
  worker revision. Validate cached PCM/hash and recover into a separate revision;
  repaired clips remain reusable without overwriting old output lineage.

## Acceptance boundary

Automated/component and live local-API PCM fixtures validate contracts,
portability and failure paths. They do not replace real trained model inference,
listening, native dialogs or browser geometry. CPU and sandbox GPU smokes timed
out; native Windows GPU execution produced an actual full-model2.2s PCM WAV.
Actual full/clone/LoRA Script then passed edit/reuse, Stop/retry and move/reopen,
including unchanged hashes and PCM/boundaries. Words were estimated, not STT
measured; subjective identity/listening and browser/native gates remain separate.
Browser provider was unavailable in this session. No
Phase03 percentage or portable version advances from these fixtures.
