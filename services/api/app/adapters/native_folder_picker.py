from __future__ import annotations

import base64
import os
from pathlib import Path
import subprocess


_WINDOWS_PICK_SCRIPT = r"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Chọn thư mục project Pro4Bro (chứa project.json)'
$dialog.ShowNewFolderButton = $false
if ($env:PRO4BRO_FOLDER_PICK_INITIAL) { $dialog.SelectedPath = $env:PRO4BRO_FOLDER_PICK_INITIAL }
try {
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($dialog.SelectedPath)
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
"""


class NativeFolderPicker:
    def pick(self, initial_path: str | None = None) -> str | None:
        try:
            import tkinter as tk
            from tkinter import filedialog
        except ImportError:
            return self._pick_windows(initial_path)

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else None
            selected = filedialog.askdirectory(
                parent=root,
                initialdir=initial_directory,
                mustexist=True,
                title="Chọn thư mục project Pro4Bro (chứa project.json)",
            )
            return str(Path(selected).resolve()) if selected else None
        finally:
            root.destroy()

    @staticmethod
    def _pick_windows(initial_path: str | None) -> str | None:
        if os.name != "nt":
            raise RuntimeError("Trình chọn thư mục cần tkinter hoặc Windows Forms.")
        initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else ""
        command = base64.b64encode(_WINDOWS_PICK_SCRIPT.encode("utf-16-le")).decode("ascii")
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-STA", "-EncodedCommand", command],
            capture_output=True,
            text=True,
            encoding="utf-8",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            timeout=300,
            env={**os.environ, "PRO4BRO_FOLDER_PICK_INITIAL": initial_directory},
            check=False,
        )
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "Windows không mở được trình chọn thư mục.")
        selected = result.stdout.strip()
        return str(Path(selected).resolve()) if selected else None
