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


def test_folder_picker_timeout_is_recoverable_and_next_attempt_can_succeed(tmp_path):
    with patch.dict(sys.modules, {"tkinter": None}), patch(
        "app.adapters.native_folder_picker.subprocess.run",
        side_effect=[subprocess.TimeoutExpired("powershell.exe", 300),
                     subprocess.CompletedProcess([], 0, str(tmp_path), "")],
    ):
        picker = NativeFolderPicker()
        with pytest.raises(RuntimeError, match="hết thời gian"):
            picker.pick(str(tmp_path))
        assert picker.pick(str(tmp_path)) == str(tmp_path.resolve())


def test_windows_picker_does_not_create_tk_on_an_api_worker_thread(tmp_path):
    from types import ModuleType
    tkinter = ModuleType("tkinter")
    tkinter.Tk = lambda: pytest.fail("Windows must use the isolated STA dialog")
    tkinter.filedialog = ModuleType("tkinter.filedialog")
    with patch.dict(sys.modules, {"tkinter": tkinter}), patch(
        "app.adapters.native_folder_picker.os.name", "nt"
    ), patch("app.adapters.native_folder_picker.subprocess.run",
             return_value=subprocess.CompletedProcess([], 0, "", "")):
        assert NativeFolderPicker().pick(str(tmp_path)) is None
