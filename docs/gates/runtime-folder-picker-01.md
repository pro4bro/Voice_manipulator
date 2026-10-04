# RUNTIME-FOLDER-PICKER-01 — portable Open Existing fallback

2026-10-04. The running Project Hub's Open Existing action returned HTTP 503:
`No module named 'tkinter'`. The isolated embedded core Python intentionally
does not include Tk, while the existing media file picker already falls back
to Windows Forms.

`NativeFolderPicker` now falls back on Windows to an STA PowerShell
`FolderBrowserDialog`. It uses the same UTF-8 process-result and hidden helper
pattern as the media picker, passes an existing initial directory, disables
new-folder creation, resolves a selected path, and returns `None` on cancel.
Non-Windows installations without Tk continue to report a clear error.

Three focused tests cover selected Unicode paths, cancel, and dialog failure
when `tkinter` is unavailable; the existing media-picker fallback test also
passes. A local Windows Forms construction smoke created and disposed a
`FolderBrowserDialog`. Full backend: 564 passed, two existing dependency
warnings; frontend: 477 passed/56 files; typecheck and build passed. After
workload restart, controller, API and Studio health endpoints returned `ok`.

The actual native folder selection in a running portable process was not
automated. The UI gate remains open until a human selects a copied/moved
project folder and confirms Open Existing resumes it. The repair does not
change project metadata or portability paths.
