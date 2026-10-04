from __future__ import annotations

import subprocess
import sys
from unittest.mock import patch

import pytest

from app.adapters.native_folder_picker import NativeFolderPicker


def test_folder_picker_uses_windows_dialog_without_tkinter(tmp_path):
    selected = tmp_path / "dự án"
    selected.mkdir()
    with patch.dict(sys.modules, {"tkinter": None}), patch(
        "app.adapters.native_folder_picker.subprocess.run",
        return_value=subprocess.CompletedProcess([], 0, str(selected), ""),
    ) as run:
        assert NativeFolderPicker().pick(str(tmp_path)) == str(selected.resolve())
    assert run.call_args.args[0][:3] == ["powershell.exe", "-NoProfile", "-STA"]
    assert run.call_args.kwargs["env"]["PRO4BRO_FOLDER_PICK_INITIAL"] == str(tmp_path)


def test_folder_picker_cancel_returns_none_without_tkinter(tmp_path):
    with patch.dict(sys.modules, {"tkinter": None}), patch(
        "app.adapters.native_folder_picker.subprocess.run",
        return_value=subprocess.CompletedProcess([], 0, "", ""),
    ):
        assert NativeFolderPicker().pick(str(tmp_path)) is None


def test_folder_picker_reports_windows_dialog_error_without_tkinter(tmp_path):
    with patch.dict(sys.modules, {"tkinter": None}), patch(
        "app.adapters.native_folder_picker.subprocess.run",
        return_value=subprocess.CompletedProcess([], 1, "", "dialog failed"),
    ):
        with pytest.raises(RuntimeError, match="dialog failed"):
            NativeFolderPicker().pick(str(tmp_path))
