"""Allowlisted OBS plugin installation; project media and pairing secrets stay separate."""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Callable, Literal


class ObsPluginInstallError(ValueError):
    pass


Layout = Literal["standard", "portable"]
Action = Literal["install", "repair", "remove"]
_FILES = {
    "bin/64bit/pro4bro-obs-bridge.dll": (
        "bin/64bit/pro4bro-obs-bridge.dll",
        "obs-plugins/64bit/pro4bro-obs-bridge.dll",
    ),
    "data/locale/en-US.ini": (
        "data/locale/en-US.ini",
        "data/obs-plugins/pro4bro-obs-bridge/locale/en-US.ini",
    ),
    "data/brand/pro4bro-livelink.svg": (
        "data/brand/pro4bro-livelink.svg",
        "data/obs-plugins/pro4bro-obs-bridge/brand/pro4bro-livelink.svg",
    ),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _obs_running() -> bool:
    if os.name != "nt":
        return False
    result = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq obs64.exe", "/FO", "CSV", "/NH"],
        capture_output=True, text=True, check=False, timeout=5,
    )
    return '"obs64.exe"' in result.stdout.lower()


def _obs_file_version(executable: Path) -> str | None:
    if os.name != "nt":
        return None
    import ctypes

    class VersionInfo(ctypes.Structure):
        _fields_ = [(name, ctypes.c_uint32) for name in (
            "signature", "struct_version", "file_version_ms", "file_version_ls",
            "product_version_ms", "product_version_ls", "flags_mask", "flags",
            "os", "file_type", "subtype", "date_ms", "date_ls",
        )]

    version = ctypes.windll.version
    size = version.GetFileVersionInfoSizeW(str(executable), None)
    if not size:
        return None
    buffer = ctypes.create_string_buffer(size)
    pointer = ctypes.c_void_p()
    length = ctypes.c_uint()
    if not version.GetFileVersionInfoW(str(executable), 0, size, buffer):
        return None
    if not version.VerQueryValueW(buffer, "\\", ctypes.byref(pointer), ctypes.byref(length)) or length.value < ctypes.sizeof(VersionInfo):
        return None
    info = ctypes.cast(pointer, ctypes.POINTER(VersionInfo)).contents
    parts = (info.file_version_ms >> 16, info.file_version_ms & 0xffff,
             info.file_version_ls >> 16, info.file_version_ls & 0xffff)
    return ".".join(map(str, parts))


class ObsPluginInstallation:
    def __init__(
        self,
        app_root: Path,
        data_root: Path,
        *,
        program_files: Path | None = None,
        program_data: Path | None = None,
        app_data: Path | None = None,
        running: Callable[[], bool] = _obs_running,
    ) -> None:
        self.app_root = app_root.resolve()
        self.data_root = data_root.resolve()
        self.program_files = (program_files or Path(os.environ.get("ProgramFiles", "C:/Program Files"))).resolve()
        self.program_data = (program_data or Path(os.environ.get("ProgramData", "C:/ProgramData"))).resolve()
        self.app_data = (app_data or Path(os.environ.get("APPDATA", str(data_root)))).resolve()
        self.running = running

    @property
    def package(self) -> Path:
        bundled = self.app_root / "obs-plugin-package"
        return bundled if bundled.is_dir() else self.app_root / "build" / "obs-plugin-package"

    @property
    def target_record(self) -> Path:
        return self.data_root / "obs-livelink-install-target.json"

    @property
    def user_config(self) -> Path:
        return self.app_data / "obs-studio" / "plugin_config" / "pro4bro-obs-bridge" / "livelink-install.json"

    def _pairing_ready(self) -> bool:
        try:
            config = json.loads(self.user_config.read_text(encoding="utf-8"))
            uuid.UUID(config["installId"])
            return config["schemaVersion"] == 1 and isinstance(config["token"], str) and len(config["token"]) >= 32
        except (OSError, ValueError, KeyError, TypeError):
            return False

    def _manifest(self) -> dict:
        manifest_path = self.package / "manifest.json"
        if not manifest_path.is_file():
            raise ObsPluginInstallError("Chưa có OBS plugin package. Hãy build plugin trước khi cài.")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
            if (manifest.get("schemaVersion"), manifest.get("pluginId"), manifest.get("architecture")) != (1, "pro4bro-obs-bridge", "x64"):
                raise ValueError("manifest identity")
            files = manifest["files"]
            if not isinstance(files, list) or {entry["source"] for entry in files} != set(_FILES):
                raise ValueError("manifest file set")
            for entry in files:
                standard, portable = _FILES[entry["source"]]
                if entry["standard"] != standard or entry["portable"] != portable:
                    raise ValueError("manifest destination")
                if not isinstance(entry["sha256"], str) or len(entry["sha256"]) != 64:
                    raise ValueError("manifest hash")
                source = self.package / entry["source"]
                if not source.is_file() or _sha256(source) != entry["sha256"].lower():
                    raise ValueError(f"package hash: {entry['source']}")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ObsPluginInstallError(f"OBS plugin package không hợp lệ: {exc}") from exc
        return manifest

    def _root(self, requested: str | None) -> tuple[Path, Layout]:
        stored = None
        if not requested and self.target_record.is_file():
            try:
                stored = json.loads(self.target_record.read_text(encoding="utf-8"))["obsRoot"]
            except (OSError, ValueError, KeyError):
                pass
        root = Path(requested or stored or self.program_files / "obs-studio").resolve()
        executable = root / "bin" / "64bit" / "obs64.exe"
        if not executable.is_file():
            raise ObsPluginInstallError("Hãy chọn thư mục OBS chứa bin/64bit/obs64.exe.")
        if root == (self.program_files / "obs-studio").resolve():
            return root, "standard"
        if not any((root / marker).exists() for marker in ("portable_mode", "portable_mode.txt", "obs_portable_mode.txt")):
            raise ObsPluginInstallError("Thư mục OBS tự chọn phải bật portable mode trước khi cài plugin.")
        if not (root / "obs-plugins").is_dir() or not (root / "data").is_dir():
            raise ObsPluginInstallError("Thư mục OBS portable thiếu obs-plugins hoặc data.")
        return root, "portable"

    def _targets(self, root: Path, layout: Layout) -> tuple[dict[str, Path], Path]:
        if layout == "standard":
            base = self.program_data / "obs-studio" / "plugins" / "pro4bro-obs-bridge"
            targets = {source: base / standard for source, (standard, _) in _FILES.items()}
            record = base / "install-manifest.json"
        else:
            targets, record = (
                {source: root / portable for source, (_, portable) in _FILES.items()},
                root / "data" / "obs-plugins" / "pro4bro-obs-bridge" / "install-manifest.json",
            )
        allowed = (self.program_data / "obs-studio" / "plugins").resolve() if layout == "standard" else root
        for target in (*targets.values(), record):
            if not target.resolve().is_relative_to(allowed):
                raise ObsPluginInstallError("Đường dẫn plugin OBS vượt khỏi thư mục cài đặt hợp lệ.")
        return targets, record

    def _installed_state(self, manifest: dict, targets: dict[str, Path], record: Path) -> str:
        present = [target.exists() for target in targets.values()]
        if not any(present) and not record.exists():
            return "not-installed"
        expected = {entry["source"]: entry["sha256"].lower() for entry in manifest["files"]}
        actual = {source: _sha256(target) for source, target in targets.items() if target.is_file()}
        if actual == expected:
            return "installed"
        if record.is_file():
            try:
                previous = json.loads(record.read_text(encoding="utf-8"))
                previous_hashes = previous.get("hashes")
                if isinstance(previous_hashes, dict) and previous_hashes == actual:
                    return "update-available"
            except (OSError, ValueError):
                pass
        return "damaged"

    def status(self, obs_root: str | None = None) -> dict:
        running = self.running()
        try:
            root, layout = self._root(obs_root)
        except ObsPluginInstallError as exc:
            return {"state": "obs-unavailable", "message": str(exc), "obsRoot": obs_root,
                    "layout": None, "obsRunning": running, "pairingReady": self._pairing_ready()}
        try:
            manifest = self._manifest()
        except ObsPluginInstallError as exc:
            return {"state": "package-unavailable", "message": str(exc), "obsRoot": str(root),
                    "layout": layout, "obsRunning": running, "pairingReady": self._pairing_ready()}
        targets, record = self._targets(root, layout)
        state = self._installed_state(manifest, targets, record)
        obs_version = _obs_file_version(root / "bin" / "64bit" / "obs64.exe")
        restart_pending = False
        if self.target_record.is_file():
            try:
                target_info = json.loads(self.target_record.read_text(encoding="utf-8"))
                restart_pending = target_info.get("obsRoot") == str(root) and bool(target_info.get("restartPending"))
            except (OSError, ValueError):
                pass
        if restart_pending and not running:
            self._atomic_write(self.target_record, json.dumps({"obsRoot": str(root), "restartPending": False}).encode("utf-8"))
        return {"state": state, "message": "", "obsRoot": str(root), "layout": layout,
                "obsRunning": running, "pairingReady": self._pairing_ready(),
                "pluginVersion": manifest["pluginVersion"], "obsBuildVersion": manifest["obsBuildVersion"],
                "detectedObsVersion": obs_version,
                "compatibilityWarning": bool(obs_version and not obs_version.startswith(manifest["obsBuildVersion"] + ".")),
                "restartObsRequired": running and restart_pending}

    @staticmethod
    def _atomic_write(target: Path, content: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(content)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def _pairing(self, *, reset: bool = False) -> None:
        if self.user_config.exists() and not reset:
            return
        self._atomic_write(self.user_config, json.dumps({
            "schemaVersion": 1, "installId": str(uuid.uuid4()),
            "token": secrets.token_urlsafe(32), "apiBase": "http://127.0.0.1:18120",
            "launcherPath": str(self.app_root / "start-pro4bro.bat"),
        }, indent=2).encode("utf-8"))

    def reset_pairing(self, obs_root: str | None = None) -> dict:
        self._pairing(reset=True)
        return self.status(obs_root)

    def apply(self, action: Action, obs_root: str | None = None, *, remove_pairing: bool = False) -> dict:
        root, layout = self._root(obs_root)
        manifest = self._manifest()
        obs_version = _obs_file_version(root / "bin" / "64bit" / "obs64.exe")
        if action != "remove" and obs_version and not obs_version.startswith(manifest["obsBuildVersion"] + "."):
            raise ObsPluginInstallError(f"Plugin được build cho OBS {manifest['obsBuildVersion']}; OBS hiện tại là {obs_version}.")
        targets, record = self._targets(root, layout)
        state = self._installed_state(manifest, targets, record)
        if action == "install" and state == "installed":
            self._pairing()
            self.target_record.parent.mkdir(parents=True, exist_ok=True)
            self._atomic_write(self.target_record, json.dumps({"obsRoot": str(root), "restartPending": False}).encode("utf-8"))
            return self.status(str(root))
        if action == "install" and state == "damaged":
            raise ObsPluginInstallError("Plugin bị hỏng hoặc khác manifest; dùng Repair sau khi đóng OBS.")
        if self.running() and (action != "install" or state != "not-installed"):
            raise ObsPluginInstallError("Đóng OBS trước khi cập nhật, sửa hoặc gỡ plugin.")
        if action == "repair" and state == "not-installed":
            raise ObsPluginInstallError("Plugin chưa được cài; dùng Install.")
        if action == "remove" and state == "not-installed":
            if remove_pairing:
                self.user_config.unlink(missing_ok=True)
            return self.status(str(root))
        try:
            self._apply_binary(action, manifest, targets, record)
        except PermissionError:
            if os.name != "nt":
                raise
            self._elevate_binary(action, root)
        if action != "remove":
            self._pairing()
        elif remove_pairing:
            self.user_config.unlink(missing_ok=True)
        self.target_record.parent.mkdir(parents=True, exist_ok=True)
        self._atomic_write(self.target_record, json.dumps({"obsRoot": str(root), "restartPending": self.running() and action == "install" and state == "not-installed"}).encode("utf-8"))
        return self.status(str(root))

    def _apply_binary(self, action: Action, manifest: dict, targets: dict[str, Path], record: Path) -> None:
        modifications: dict[Path, bytes | None] = {target: target.read_bytes() if target.exists() else None for target in targets.values()}
        modifications[record] = record.read_bytes() if record.exists() else None
        changed: list[Path] = []
        try:
            if action == "remove":
                for target in modifications:
                    if target.exists():
                        target.unlink()
                        changed.append(target)
            else:
                for source, target in targets.items():
                    self._atomic_write(target, (self.package / source).read_bytes())
                    changed.append(target)
                hashes = {source: _sha256(target) for source, target in targets.items()}
                self._atomic_write(record, json.dumps({"schemaVersion": 1, "pluginVersion": manifest["pluginVersion"], "hashes": hashes}).encode("utf-8"))
                changed.append(record)
                if hashes != {entry["source"]: entry["sha256"].lower() for entry in manifest["files"]}:
                    raise ObsPluginInstallError("Hash plugin sau cài đặt không khớp package.")
        except (OSError, ObsPluginInstallError):
            for target in reversed(changed):
                original = modifications[target]
                if original is None:
                    target.unlink(missing_ok=True)
                else:
                    self._atomic_write(target, original)
            raise

    def _elevate_binary(self, action: Action, root: Path) -> None:
        """Request UAC only after an ordinary write fails; helper repeats validation."""
        import ctypes

        folder = self.data_root / ".obs-install-elevation"
        folder.mkdir(parents=True, exist_ok=True)
        nonce = uuid.uuid4().hex
        request = folder / f"{nonce}.request.json"
        result = folder / f"{nonce}.result.json"
        try:
            request.write_text(json.dumps({"appRoot": str(self.app_root), "dataRoot": str(self.data_root),
                                           "obsRoot": str(root), "action": action}), encoding="utf-8")
            arguments = subprocess.list2cmdline(["-m", "app.adapters.obs_plugin_installation", "--elevated", str(request), str(result)])
            workdir = self.app_root / "services" / "api"
            code = ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, arguments, str(workdir), 1)
            if code <= 32:
                raise ObsPluginInstallError("Windows không cấp quyền Administrator cho OBS plugin installer.")
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                if result.is_file():
                    outcome = json.loads(result.read_text(encoding="utf-8"))
                    if not outcome.get("ok"):
                        raise ObsPluginInstallError(f"Cài plugin bằng quyền Administrator thất bại: {outcome.get('error', 'unknown')}")
                    return
                time.sleep(0.2)
            raise ObsPluginInstallError("Hết thời gian chờ Windows hoàn tất cài OBS plugin.")
        finally:
            request.unlink(missing_ok=True)
            result.unlink(missing_ok=True)

    def open_obs(self, obs_root: str | None = None) -> dict:
        root, _ = self._root(obs_root)
        if not self.running():
            executable = root / "bin" / "64bit" / "obs64.exe"
            subprocess.Popen([str(executable)], cwd=executable.parent)
        return self.status(str(root))


if __name__ == "__main__":
    if len(sys.argv) == 7 and sys.argv[1] == "--cli":
        _, _, app_root, data_root, action, obs_root, remove_pairing = sys.argv
        manager = ObsPluginInstallation(Path(app_root), Path(data_root))
        print(json.dumps(manager.apply(action, obs_root or None, remove_pairing=remove_pairing == "true"), ensure_ascii=False))
    elif len(sys.argv) == 4 and sys.argv[1] == "--elevated":
        request_path, result_path = Path(sys.argv[2]), Path(sys.argv[3])
        try:
            payload = json.loads(request_path.read_text(encoding="utf-8"))
            if payload["action"] not in ("install", "repair", "remove"):
                raise ObsPluginInstallError("Unknown action")
            manager = ObsPluginInstallation(Path(payload["appRoot"]), Path(payload["dataRoot"]))
            root, layout = manager._root(payload["obsRoot"])
            manifest = manager._manifest()
            targets, record = manager._targets(root, layout)
            state = manager._installed_state(manifest, targets, record)
            if manager.running() and (payload["action"] != "install" or state != "not-installed"):
                raise ObsPluginInstallError("Close OBS before changing the plugin")
            manager._apply_binary(payload["action"], manifest, targets, record)
            outcome = {"ok": True}
        except Exception as exc:
            outcome = {"ok": False, "error": str(exc)}
        result_path.write_text(json.dumps(outcome), encoding="utf-8")
    else:
        raise SystemExit(2)
