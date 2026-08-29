# ADR 0009: Use A Persistent Runtime Control Plane

## Status

Accepted

## Context

The user must be able to stop and restart API, STT, model workers, and
background processing from the app after a code-fix round. A web button cannot
start the process that serves that same button after that process has already
been terminated.

## Decision

Run a small control plane on `127.0.0.1:18119`. It serves the built React app,
proxies normal `/api/*` traffic to the business API on port 18120, and exposes a
three-command lifecycle interface: start, stop, restart. Studio remains on port
18081. The lifecycle script verifies process command lines before stopping a
listener, refuses to kill a foreign process, and synchronizes the ignored
Studio runtime from product source before every launch.

Windows → Preferences is followed by Turn on all, Restart all, and Turn off
all. Turn off stops all functional workloads but deliberately retains the
controller and static recovery UI. `start-pro4bro.bat stop` is the explicit
literal-zero-process shutdown; `start-pro4bro.bat` is the reboot bootstrap.

## Consequences

- The recovery UI remains usable while API/STT are completely unavailable.
- Restart reliably loads code changes in both API and Studio without editing
  upstream `engines/OmniVoice`.
- One lightweight Python controller remains after UI Turn off; this is the
  necessary cost of an in-app Turn on operation.
- Runtime session/log files remain ignored machine-local state and do not
  weaken the project-relative portability contract.
