from __future__ import annotations

import sys
from pathlib import Path

from app.domain.models import TrainingRuntimePackage, TrainingRuntimeReport

# What `omnivoice.cli.train` needs beyond what the STT sidecar already carries.
TRAINING_PACKAGES = ["omnivoice", "accelerate", "peft", "webdataset", "transformers"]

# torch is the expensive one and it is already on disk twice over: as an
# installed package in the STT runtime, and as the wheel that installed it.
HEAVY_PACKAGES = ["torch", "torchaudio"]


class TrainingRuntime:
    """A separate environment for training, provisioned from local wheels.

    Separate from the STT sidecar on purpose. They are two long-lived processes
    with different dependency pressure, and a version bump that suits one has no
    business breaking the other while it is mid-transcription.

    Separate does not mean downloaded twice. `installer-cache/` already holds the
    3.4 GB torch wheel and pip's own cache holds the rest, so the isolation costs
    disk and copy time rather than bandwidth.

    Copying the STT venv instead would look cheaper and is not: on Windows the
    `Scripts/*.exe` launchers embed an absolute path to their interpreter, and
    `__pycache__` embeds the source path it was compiled from. This project has
    already spent a session on stale paths inside a copied environment.
    """

    def __init__(self, root: Path, wheel_cache: Path | None = None) -> None:
        self.root = root
        self.wheel_cache = wheel_cache

    @property
    def python(self) -> Path:
        return self.root / "Scripts" / "python.exe" if sys.platform == "win32" else self.root / "bin" / "python"

    def report(self) -> TrainingRuntimeReport:
        """What provisioning would do, before it does any of it.

        Multi-gigabyte work must never begin behind a spinner that says nothing.
        The caller shows this, and the user decides.
        """
        exists = self.python.is_file()
        site = self._site_packages()
        packages = [
            TrainingRuntimePackage(
                name=name,
                installed=self._installed(site, name),
                wheel_path=self._wheel_for(name),
            )
            for name in TRAINING_PACKAGES + HEAVY_PACKAGES
        ]
        return TrainingRuntimeReport(
            root=str(self.root),
            exists=exists,
            python=str(self.python) if exists else None,
            packages=packages,
            cached_wheels=[str(path.name) for path in self._wheels()],
            ready=exists and all(package.installed for package in packages),
        )

    # ---------- inspection ----------

    def _site_packages(self) -> Path | None:
        candidate = self.root / ("Lib" if sys.platform == "win32" else "lib") / "site-packages"
        if candidate.is_dir():
            return candidate
        for lib in sorted((self.root / "lib").glob("python*")) if (self.root / "lib").is_dir() else []:
            if (lib / "site-packages").is_dir():
                return lib / "site-packages"
        return None

    @staticmethod
    def _installed(site: Path | None, name: str) -> bool:
        if site is None:
            return False
        # A dist-info directory is the record an install leaves; an importable
        # folder alone can be a stray source tree someone copied in.
        return any(site.glob(f"{name.replace('-', '_')}-*.dist-info")) or any(
            site.glob(f"{name}-*.dist-info")
        )

    def _wheels(self) -> list[Path]:
        if not self.wheel_cache or not self.wheel_cache.is_dir():
            return []
        return sorted(self.wheel_cache.glob("*.whl"))

    def _wheel_for(self, name: str) -> str | None:
        prefix = f"{name.replace('-', '_')}-"
        for wheel in self._wheels():
            if wheel.name.lower().startswith(prefix.lower()):
                return str(wheel)
        return None

    # ---------- the command a caller runs ----------

    def install_plan(self) -> list[list[str]]:
        """The exact commands provisioning would run, in order.

        Returned rather than executed so they can be shown, logged and approved.
        A cached wheel is installed from disk; everything else comes from the
        index, and pip's own cache decides whether that touches the network.
        """
        report = self.report()
        commands: list[list[str]] = []
        if not report.exists:
            commands.append([sys.executable, "-m", "venv", str(self.root)])

        local = [
            package.wheel_path
            for package in report.packages
            if not package.installed and package.wheel_path
        ]
        if local:
            commands.append([str(self.python), "-m", "pip", "install", *local])

        remote = [
            package.name
            for package in report.packages
            if not package.installed and not package.wheel_path
        ]
        if remote:
            commands.append([str(self.python), "-m", "pip", "install", *remote])
        return commands
