from pathlib import Path

from app.runtime_layout import python_executable, site_packages


def test_private_windows_layout_wins_over_legacy_venv(tmp_path, monkeypatch):
    monkeypatch.setattr("app.runtime_layout.os.name", "nt")
    (tmp_path / "python.exe").write_bytes(b"")
    (tmp_path / "Scripts").mkdir()
    (tmp_path / "Scripts" / "python.exe").write_bytes(b"")
    (tmp_path / "site-packages").mkdir()

    assert python_executable(tmp_path) == tmp_path / "python.exe"
    assert site_packages(tmp_path) == tmp_path / "site-packages"


def test_legacy_windows_venv_remains_inspectable(tmp_path, monkeypatch):
    monkeypatch.setattr("app.runtime_layout.os.name", "nt")
    (tmp_path / "Scripts").mkdir()
    (tmp_path / "Scripts" / "python.exe").write_bytes(b"")
    (tmp_path / "Lib" / "site-packages").mkdir(parents=True)

    assert python_executable(tmp_path) == tmp_path / "Scripts" / "python.exe"
    assert site_packages(tmp_path) == tmp_path / "Lib" / "site-packages"
