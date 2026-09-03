# Remote Access Over Tailscale

## What the stack binds to today

| Port | Process | Bind address | Set in |
| --- | --- | --- | --- |
| 18119 | Runtime controller — serves the built UI and proxies `/api` | `127.0.0.1` | `scripts/pro4bro-console.ps1:328` |
| 18120 | Business API | `127.0.0.1` | `services/api/app/__main__.py` |
| 18081 | STT Studio | `127.0.0.1` | `scripts/pro4bro-workloads.ps1:198` |

All three are loopback-only, so a Tailscale address reaches none of them as
shipped. Only 18119 ever needs to be reachable: the browser talks to it alone,
and it proxies `/api` to 18120 server-side, so the API and Studio stay private
even when the UI is remote.

## Use Tailscale Serve, not a wider bind

```powershell
tailscale serve --bg 18119
```

`tailscaled` terminates the connection on the tailnet and forwards to
`127.0.0.1:18119`. Nothing in this repository changes, every process keeps its
loopback bind, and the workspace becomes reachable at the node's MagicDNS name
over HTTPS.

Check and undo:

```powershell
tailscale serve status
tailscale serve reset
```

Serve is tailnet-only — the devices signed into the same Tailscale account and
nothing else. `tailscale funnel` would publish to the open internet; this
application has no login of any kind, so do not use it.

### Two gates, measured on 2026-09-03

**Serve itself needed enabling once.** The first `tailscale serve --bg 18119`
printed

```
Serve is not enabled on your tailnet.
To enable, visit: https://login.tailscale.com/f/serve?node=...
```

and then blocked waiting for that approval. This gate is now passed; serve
works. A fresh tailnet will meet it again.

**HTTPS certificates are still unavailable.** `tailscale cert
may-01-pc-1.tail9cd5e0.ts.net` answers

```
500 Internal Server Error: your Tailscale account does not support getting TLS certs
```

so the HTTPS form of serve cannot obtain a certificate. Enable **HTTPS
Certificates** on the DNS page of the Tailscale admin console, then
`tailscale serve --bg 18119` works and the origin becomes a secure context.
MagicDNS is already on — `tailscale status --json` reports the suffix
`tail9cd5e0.ts.net`.

### The HTTP fallback, and what it costs

Until certificates are enabled:

```powershell
tailscale serve --bg --http=18119 http://127.0.0.1:18119
tailscale serve --http=18119 off      # to undo
```

This serves `http://may-01-pc-1.tail9cd5e0.ts.net:18119/` inside the tailnet.
Verified end to end: the UI, `/assets`, the controller's own endpoints, and the
proxied business API all answer 200.

It is still **not a secure context**, so Recorder cannot open the microphone and
monitor output selection is unavailable. Everything that does not need the
microphone — reviewing footage, editing Script, running transcription, watching
jobs — works. Treat it as read-and-review access until the certificate toggle is
on.

## Do not bind the controller to 0.0.0.0

`app.runtime_controller` accepts `--host`, so `--host 0.0.0.0` looks like the
obvious shortcut. Two reasons it is the wrong one:

**The application has no authentication.** Binding wide puts the whole
workspace — every project, every recording, the job controls, the delete
actions — in front of every machine on the LAN, not just the tailnet.

**The microphone stops working.** `getUserMedia` and `setSinkId` require a
secure context. `http://100.71.196.87:18119` is not one, and a bare IP cannot be
one. The UI would load and Recorder would refuse to open the microphone, which
removes the reason to reach the app remotely at all. Tailscale Serve's HTTPS
origin is a secure context, so recording works normally.

If a direct bind is ever unavoidable, bind the tailnet address specifically
(`--host 100.71.196.87`) rather than `0.0.0.0`, and accept that recording will
not work over plain HTTP.

## Router ports

None. Tailscale is a WireGuard mesh that negotiates a direct path through NAT
and falls back to its DERP relays when it cannot. Port forwarding on the home
router is neither needed nor helpful, and no inbound Windows Firewall rule is
required for the app: the inbound connection belongs to `tailscaled`, which then
connects to loopback like any local client.

## What to expect over a remote link

- **Playback and scrubbing** stream the project WAV from the server; a slow link
  shows up as slow seeking.
- **Import** uploads the whole source file to the machine at home.
- **Recording** captures in the remote browser and uploads the take. The capture
  itself is local to the laptop, so a slow link delays the upload but does not
  degrade the audio.
- **Transcription and training** already run on the machine at home. Remote
  access moves the interface, never the workload.
