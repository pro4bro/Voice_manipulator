from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import subprocess


_WINDOWS_OPEN_SCRIPT = r"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Chọn gói voice Pro4Bro'
$dialog.Filter = 'Voice package (*.zip)|*.zip'
$dialog.Multiselect = $true
if ($env:PRO4BRO_VOICE_PACKAGE_INITIAL) { $dialog.InitialDirectory = $env:PRO4BRO_VOICE_PACKAGE_INITIAL }
try {
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    ConvertTo-Json -InputObject @($dialog.FileNames) -Compress
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
"""

_WINDOWS_FOLDER_SCRIPT = r"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Chọn thư mục lưu gói voice Pro4Bro'
$dialog.ShowNewFolderButton = $true
if ($env:PRO4BRO_VOICE_EXPORT_INITIAL) { $dialog.SelectedPath = $env:PRO4BRO_VOICE_EXPORT_INITIAL }
try {
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($dialog.SelectedPath)
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
"""


class NativeVoicePackagePicker:
    """Native ZIP open and destination-folder dialogs for Voice Collection."""

    def pick_zip_files(self, initial_path: str | None = None) -> list[str]:
        try:
            import tkinter as tk
            from tkinter import filedialog
        except ImportError:
            return self._pick_windows_zip_files(initial_path)

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else None
            selected = filedialog.askopenfilenames(
                parent=root,
                initialdir=initial_directory,
                title="Chọn gói voice Pro4Bro",
                filetypes=[("Voice package", "*.zip")],
            )
            return [str(Path(path).resolve()) for path in selected]
        finally:
            root.destroy()

    def choose_export_folder(self, initial_path: str | None = None) -> str | None:
        try:
            import tkinter as tk
            from tkinter import filedialog
        except ImportError:
            return self._choose_windows_export_folder(initial_path)

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else None
            selected = filedialog.askdirectory(
                parent=root,
                initialdir=initial_directory,
                mustexist=True,
                title="Chọn thư mục lưu gói voice Pro4Bro",
            )
            return str(Path(selected).resolve()) if selected else None
        finally:
            root.destroy()

    @staticmethod
    def _windows_command(script: str, initial_variable: str, initial_path: str | None) -> subprocess.CompletedProcess[str]:
        if os.name != "nt":
            raise RuntimeError("Native voice package dialogs need tkinter or Windows Forms.")
        encoded_script = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
        try:
            return subprocess.run(
                ["powershell.exe", "-NoProfile", "-STA", "-EncodedCommand", encoded_script],
                capture_output=True,
                text=True,
                encoding="utf-8",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                timeout=300,
                env={**os.environ, initial_variable: initial_path or ""},
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Windows voice package picker timed out.") from exc

    @staticmethod
    def _pick_windows_zip_files(initial_path: str | None) -> list[str]:
        result = NativeVoicePackagePicker._windows_command(
            _WINDOWS_OPEN_SCRIPT, "PRO4BRO_VOICE_PACKAGE_INITIAL", initial_path,
        )
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "Windows could not open the ZIP file picker.")
        output = result.stdout.strip()
        if not output:
            return []
        try:
            paths = json.loads(output)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Windows returned an invalid ZIP file selection.") from exc
        if isinstance(paths, str):
            paths = [paths]
        if not isinstance(paths, list) or not all(isinstance(path, str) for path in paths):
            raise RuntimeError("Windows returned an invalid ZIP file selection.")
        return [str(Path(path).resolve()) for path in paths]

    @staticmethod
    def _choose_windows_export_folder(initial_path: str | None) -> str | None:
        result = NativeVoicePackagePicker._windows_command(
            _WINDOWS_FOLDER_SCRIPT, "PRO4BRO_VOICE_EXPORT_INITIAL", initial_path,
        )
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "Windows could not open the destination folder picker.")
        selected = result.stdout.strip()
        return str(Path(selected).resolve()) if selected else None
