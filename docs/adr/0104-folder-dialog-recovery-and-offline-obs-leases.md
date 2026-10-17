# 0104 — Recover folder dialogs and preserve offline OBS state

Accepted 2026-10-17, stabilization round46.

The owner reported Browse staying at "Đang mở..." without a visible folder
dialog until an app restart. The last folder-picker source change was64f2db4
(2026-10-04), before the recent timing rounds. The exact intermittent Windows
focus failure is not conclusively reproduced; do not attribute it to a recent
Voice Manipulator change. Existing picker tests mocked successful subprocess
results and did not prove native window visibility.

Two defects are reproduced independently: a folder child timeout escaped the
recoverable API error contract, and a rejected picker promise was not reported
in Project setup. A late selection also overwrote a newer typed location.
Normalize TimeoutExpired to RuntimeError after subprocess.run has terminated
and waited for its owned child. Show errors in the relevant Hub/form, release
the UI picker guard on error/cancel, preserve the name/draft, and apply a folder
reply only if its location has not been edited in the meantime.

On Windows always use the isolated STA subprocess, including development Python
installations with Tk: FastAPI worker threads must not own Windows Tk roots.
The WinForms owner now has an explicitly shown/activated handle before the
modal opens. This is a focus mitigation, not proof of native acceptance. Keep
the300-second native selection limit; stdin is disconnected and PowerShell
errors stop rather than continuing silently. No client-only timeout is added:
aborting HTTP alone would leave a native dialog orphaned and allow duplicates.

Live logs also exposed repeated offline OBS lease errors. The connection layer
deliberately reports null connection identity when disconnected, while a project
lease can remain valid. sync_current previously built a connection-bound lease
from that null ID, causing500; releasing offline could persist an invalid null
connection ID. Return the current disconnected snapshot without mutating the
last valid durable connection-bound checkpoint. Keep obsRecording unknown while
offline and retain the app recording state. A new connected hello rebinds the
lease normally. This is independently reproduced, not a demonstrated cause of
the Browse symptom.

Full regression must include Project Hub/create/open, the real picker error
contract, offline claim/release/checkpoint integrity, and normal OBS reconnection.
Mocked dialog results and forced child failure cannot close the actual Windows
foreground/selection/cancel gate or the unrelated audio-quality gates.
