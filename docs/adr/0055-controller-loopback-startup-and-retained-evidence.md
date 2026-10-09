# ADR0055 — controller loopback startup and retained failure evidence

2026-10-09. Accepted for USER-FEEDBACK-08.

## Context

The owner reported controller PID25916 alive after the60-second deadline, with
no18119 listener. That process exited before inspection. A later attempt48216
passed controller readiness in8.196 seconds and overwrote the previous stdout/
stderr. Historical PCM recovery/API fixes cannot establish this controller's
cause: its lifetime, health and import path are separate.

The controller's startup created an HTTPX AsyncClient with default certificate
loading and environment proxy discovery, although its upstream URL is fixed HTTP
loopback. A deterministic real-Uvicorn fixture holds certificate loading and
reproduces startup waiting before binding; an unavailable SSL_CERT_FILE also
prevented startup. These are verified defects, not proof of PID25916's exact stack.

## Decision

- Controller proxy and observer clients ignore system proxy/CA settings and do
  not load verification certificates. Their destinations are fixed HTTP loopback
  URLs. This setting applies only to these clients; external HTTPS clients and
  browser/LAN/Tailscale transport retain their own behavior. No HTTPS verification
  is disabled for an external service, and redirect following is not enabled.
- The canonical `-m app.runtime_controller` identity remains. Before HTTPX,
  FastAPI or Pydantic imports, arm the existing StartupDiagnostics watcher and
  record boot PID/import phase. Record imports-complete elapsed time. The CLI
  keeps this logger configuration through Uvicorn so its bind event cancels the
  watcher; samples remain bounded to15/30/45 seconds, with frame locations only.
- Before redirecting a new controller/Studio/API process to existing logs,
  preserve nonempty previous output in `data/logs/startup-history`. Unique UTC/GUID
  names prevent retry collisions. Copy originals; do not delete or move them.
  Missing/empty files and archive failures cannot block launch. The helper stays
  in the existing portable-packaged readiness script.
- Keep controller60/API60/Studio150-second health deadlines. Readiness remains
  actual HTTP health plus launched-process life, separate from inference/artifact
  success. No automatic retry, model dispatch or accepted quality-budget change.

## Limits

The original failed process's stack was unavailable and overwritten logs cannot
be reconstructed. Before-Python loader stalls and a native call holding the GIL
may evade the Python watcher. Archival is best-effort and history is not pruned
automatically. These changes remove verified blocking dependencies and retain
future evidence; isolated/warm launches cannot prove cold-start reliability under
all system/disk conditions.
