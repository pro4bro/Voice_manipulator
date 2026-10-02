from __future__ import annotations

import subprocess
import sys
from unittest.mock import patch

from app.adapters.native_media_file_picker import NativeMediaFilePicker


def test_media_picker_uses_windows_dialog_when_tkinter_is_unavailable(tmp_path):
    selected = tmp_path / "đang ghi.mkv"
    selected.touch()
    with patch.dict(sys.modules, {"tkinter": None}), patch(
        "app.adapters.native_media_file_picker.subprocess.run",
        return_value=subprocess.CompletedProcess([], 0, str(selected), ""),
    ) as run:
        assert NativeMediaFilePicker().pick(str(tmp_path)) == str(selected.resolve())
    command = run.call_args.args[0]
    assert command[:3] == ["powershell.exe", "-NoProfile", "-STA"]
    assert run.call_args.kwargs["env"]["PRO4BRO_MEDIA_PICK_INITIAL"] == str(tmp_path)
