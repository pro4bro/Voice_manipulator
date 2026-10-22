import ctypes
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.adapters import desktop_reveal


def windows_shell(monkeypatch, result=0):
    ole = SimpleNamespace(CoInitializeEx=Mock(return_value=0), CoUninitialize=Mock(), CoTaskMemFree=Mock())
    def parse(_name, _context, pidl, _attributes, _out):
        pidl._obj.value = 1234
        return 0
    shell = SimpleNamespace(SHParseDisplayName=Mock(side_effect=parse), SHOpenFolderAndSelectItems=Mock(return_value=result))
    monkeypatch.setattr(ctypes, "WinDLL", lambda name: ole if name == "ole32" else shell, raising=False)
    monkeypatch.setattr(desktop_reveal, "sys", SimpleNamespace(platform="win32"))
    command = Mock()
    monkeypatch.setattr(desktop_reveal.subprocess, "run", command)
    return ole, shell, command


def test_windows_reveal_selects_exact_unicode_path_without_command_line_parsing(tmp_path, monkeypatch):
    target = tmp_path / "Phỏng vấn, buổi 1 & voice.mkv"
    target.touch()
    ole, shell, command = windows_shell(monkeypatch)
    desktop_reveal.reveal(target)
    assert shell.SHParseDisplayName.call_args.args[0] == str(target.resolve())
    assert shell.SHOpenFolderAndSelectItems.call_args.args[0].value == 1234
    assert shell.SHOpenFolderAndSelectItems.call_args.args[1:] == (0, None, 0)
    ole.CoTaskMemFree.assert_called_once()
    ole.CoUninitialize.assert_called_once()
    command.assert_not_called()


def test_windows_reveal_reports_shell_failure_and_frees_resources(tmp_path, monkeypatch):
    target = tmp_path / "source.wav"
    target.touch()
    ole, _, command = windows_shell(monkeypatch, -2147467259)
    with pytest.raises(OSError, match="SHOpenFolderAndSelectItems"):
        desktop_reveal.reveal(target)
    ole.CoTaskMemFree.assert_called_once()
    ole.CoUninitialize.assert_called_once()
    command.assert_not_called()


@pytest.mark.parametrize("initialized, cleanup", [(1, True), (-2147417850, False)])
def test_reveal_balances_existing_com_apartment(tmp_path, monkeypatch, initialized, cleanup):
    target = tmp_path / "source.wav"
    target.touch()
    ole, shell, _ = windows_shell(monkeypatch)
    ole.CoInitializeEx.return_value = initialized
    desktop_reveal.reveal(target)
    shell.SHOpenFolderAndSelectItems.assert_called_once()
    assert ole.CoUninitialize.called == cleanup


def test_reveal_parse_failure_cleans_up_com_without_opening_default_folder(tmp_path, monkeypatch):
    target = tmp_path / "source.wav"
    target.touch()
    ole, shell, command = windows_shell(monkeypatch)
    shell.SHParseDisplayName.side_effect = None
    shell.SHParseDisplayName.return_value = -2147024894
    with pytest.raises(OSError, match="SHParseDisplayName"):
        desktop_reveal.reveal(target)
    ole.CoUninitialize.assert_called_once()
    shell.SHOpenFolderAndSelectItems.assert_not_called()
    command.assert_not_called()
