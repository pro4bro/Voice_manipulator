# VM-MERGED-SCRIPT-SAVE-01 — verification

Date: 2026-10-25
Scope: fix the owner's whole-turn highlights and flashing save warning/Reset.

Implementation commits: `3df428f` (exact long-turn highlights), `da01c40`
(normalized Script acknowledgement and stable autosave failure).

## Feedback

> bây giờ khi nó gộp lại thì nó đang highligh tất cả.
>
> Anh thấy cái 2 vị trí anh khoanh green thì nó hay bị chớp tắt, chỗ Script chưa lưu hoặc Version không còn được chọn nó cứ ẩn hiện liên tục, cùng với đó thì nút Reset cũng chớp tắt liên tục. Em hãy chỉnh sửa lại.

The supplied screenshot identifies the `conviction-voice-over` project. This
round only reads its files; the owner project is not directly repaired or edited
by a diagnostic script. The normal app save path persists normalization on load.

## Reproduction and cause

- Its current Script and active Version Script match at revision112; both have
  two rows but120 segment definitions, only two of which are used. Generated and
  Full snapshots are already grouped into two rows. This is not an identity or
  snapshot-row lookup failure.
- Row1 has1159 words, versus1158 generated words. Row2 has961 unchanged words.
  The old diff's one-million-pair cutoff marks the entire first row pending.
  The new long-turn regression failed with1600 pending tokens instead of the two
  scattered changed words (`npx vitest run src/modules/script/script-highlight-diff.test.ts`).
- `migrateScript` removes unused segments. The Script hook formerly set its
  persisted signature to this normalized draft, so `flush()` skipped the real
  write. The Version API correctly refused the unsaved normalized document.
  The new normalization test failed with zero writes instead of one.
- Version autosave did not stop on its own error. A regression with an actual
  delayed409 reproduced a second automatic request after the first failure;
  the warning clears when enqueue starts, and `busy` disables Reset. A synchronous
  mock hid the extra busy render; adding a25ms response boundary exposed the loop.

## Repair

- Exact word matching for long turns uses rolling scores plus packed direction
  bits, retaining deterministic ties and deletion anchors with about32x less
  matrix memory. Unchanged words are not marked merely because the turn is long.
- Persisted signatures compare the actual acknowledged server document before
  normalization, with recursive key sorting. Both initial load and Version
  checkout now save normalization before reporting the draft saved.
- Autosave retains a failure until an explicit retry. Reset retains its existing
  write guard; no conflict check, assertion, timeout or error is suppressed.
- ADR0147 records the decision. No backend product source or format is changed.

## Evidence

- Focused frontend: three files /24 tests passed,5.02s. Covers the original
  red cases, long pending/fixed separation, repeated-word deletion, server key
  order, normalization on checkout and explicit retry after the idle error state.
- Typecheck and build pass;233 modules transformed.
- Final standard `npm test`: **167 files /1350 tests passed**,213.65s, exit0.
  Log: `.scratch/vm-merged-script-save-01-frontend.log`. No test configuration,
  assertion, timeout or required case was weakened. Lead diff review and
  `git diff --check` pass.
- Backend relevant suites:23 passed, two existing warnings,8.40s.
  Log: `.scratch/vm-merged-script-save-01-api-focused.log`. The previous full API
  baseline remains1626 passed; it was not rerun for these frontend-only changes.
- Actual API contract probe with two synthetic turns and120 segments: unsaved
  normalization returns409; saving the normalized Script first returns200;
  subsequent Version save and unchanged repeat both return200. The repeated
  request leaves the book revision unchanged. Two rows/two used segments remain;
  the synthetic source WAV hash is unchanged. The first probe used an empty
  Script; the final two-turn probe supersedes it.
  Evidence: `.scratch/vm-merged-script-save-01/api-contract.json`.
- Read-only evaluation of the production highlight function on the reported
  project's real current/generated/Full rows gives **two pending words in row1,
  zero in row2**, no completed fixes. Both rows together took38.36ms in this
  single diagnostic invocation; this is not a browser frame-time benchmark.
  Script and Session-book SHA256 values are unchanged during the probe.
  Evidence: `.scratch/vm-merged-script-save-01/real-project-readonly.json`.

## Browser and remaining acceptance

CUA inventory returns no browsers and `Local browser use is disabled in Work
settings`, before any tab opens. No alternate automation channel is used.
The final no-flicker visual behavior and post-fix screenshot are not claimed.
The earlier literal-text/history final native UAT also remains open under its
existing two-round closure gate; this round does not mark that work accepted.

When access returns, reload the build, open the same Version, verify only the
actual edits are blue, wait idle through several autosave intervals and check
that the warning/Reset remain stable. Edit one word, save, reopen, then verify
Version switching and Reset still operate normally. Phase03 stays60%, Phase06 open.
