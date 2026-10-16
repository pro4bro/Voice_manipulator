# 0098 — Measure preview publication without weakening durability

Accepted 2026-10-17, round41.

The preview artifact stage previously combined checksum, atomic report write and
final PCM verification. Split those request timings. An optional diagnostics
argument on the existing atomic writer measures create, write/flush, fsync,
context-managed close, replacement, and retry count/wait. Existing two-argument
callers retain the same behavior. Timings are milliseconds, reset per request,
zero for work skipped by a cache hit, and never stored in the artifact report.

The writer still flushes and fsyncs before atomic replacement; bounded Windows
sharing retries and temporary-file cleanup remain intact. The renderer still
hashes and validates the completed WAV. These measurements describe elapsed
stages, including OS scheduling and storage contention; they do not identify
which filesystem filter, hardware, or other process caused a slow fsync.

Twelve actual suffix renders on the private eight-second speech fixture all
produce the same WAV. Server render-call median is336.98ms (173.49–536.24ms),
with atomic fsync median127.41ms. No retry occurred. This is a diagnostic sample,
not a before/after optimization or proof of the250ms browser gate. Keep the
gate open and address avoidable scheduling/lock delay independently.
