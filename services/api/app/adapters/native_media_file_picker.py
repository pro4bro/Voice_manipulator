from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import subprocess


_WINDOWS_PICK_SCRIPT = r"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Chọn audio/video để import vào Pro4Bro'
$dialog.Filter = 'Media|*.wav;*.mp3;*.m4a;*.flac;*.ogg;*.opus;*.aac;*.wma;*.aif;*.aiff;*.ac3;*.mp4;*.mov;*.mkv;*.avi;*.webm;*.mxf;*.h264;*.h265;*.hevc;*.av1;*.prores|All files|*.*'
$dialog.Multiselect = $true
if ($env:PRO4BRO_MEDIA_PICK_INITIAL) { $dialog.InitialDirectory = $env:PRO4BRO_MEDIA_PICK_INITIAL }
try {
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    ConvertTo-Json -InputObject @($dialog.FileNames) -Compress
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
"""


class NativeMediaFilePicker:
    def pick(self, initial_path: str | None = None) -> str | None:
        selected = self.pick_many(initial_path)
        return selected[0] if selected else None

    def pick_many(self, initial_path: str | None = None) -> list[str]:
        try:
            import tkinter as tk
            from tkinter import filedialog
        except ImportError:
            return self._pick_windows_many(initial_path)

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else None
            selected = filedialog.askopenfilenames(
                parent=root,
                initialdir=initial_directory,
                title="Chọn audio/video để import vào Pro4Bro",
                filetypes=[
                    ("Media", "*.wav *.mp3 *.m4a *.flac *.ogg *.opus *.aac *.wma *.aif *.aiff *.ac3 *.mp4 *.mov *.mkv *.avi *.webm *.mxf *.h264 *.h265 *.hevc *.av1 *.prores"),
                    ("All files", "*.*"),
                ],
            )
            return [str(Path(path).resolve()) for path in selected]
        finally:
            root.destroy()

    @staticmethod
    def _pick_windows(initial_path: str | None) -> str | None:
        selected = NativeMediaFilePicker._pick_windows_many(initial_path)
        return selected[0] if selected else None

    @staticmethod
    def _pick_windows_many(initial_path: str | None) -> list[str]:
        if os.name != "nt":
            raise RuntimeError("Trình chọn media cần tkinter hoặc Windows Forms.")
        initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else ""
        command = base64.b64encode(_WINDOWS_PICK_SCRIPT.encode("utf-16-le")).decode("ascii")
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-STA", "-EncodedCommand", command],
            capture_output=True,
            text=True,
            encoding="utf-8",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            timeout=300,
            env={**os.environ, "PRO4BRO_MEDIA_PICK_INITIAL": initial_directory},
            check=False,
        )
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "Windows không mở được trình chọn file.")
        selected = result.stdout.strip()
        if not selected:
            return []
        try:
            paths = json.loads(selected)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Windows trả về danh sách file media không hợp lệ.") from exc
        if not isinstance(paths, list) or not all(isinstance(path, str) for path in paths):
            raise RuntimeError("Windows trả về danh sách file media không hợp lệ.")
        return [str(Path(path).resolve()) for path in paths]
