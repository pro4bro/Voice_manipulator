from __future__ import annotations

import subprocess
from pathlib import Path

from app.domain.models import EngineStatus


class OmniVoiceEngine:
    CAPABILITIES = [
        "text-to-speech",
        "voice-training",
        "voice-cloning",
        "lora-finetuning",
    ]

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def status(self) -> EngineStatus:
        installed = self.root.is_dir() and (self.root / "README.md").is_file()
        revision = self._git("rev-parse", "--short=12", "HEAD") if installed else None
        branch = self._git("branch", "--show-current") if installed else None
        dirty = bool(self._git("status", "--porcelain")) if installed else False
        return EngineStatus(
            id="omnivoice",
            name="OmniVoice",
            path=str(self.root),
            installed=installed,
            revision=revision,
            branch=branch,
            dirty=dirty,
            capabilities=self.CAPABILITIES.copy(),
        )

    def _git(self, *args: str) -> str | None:
        if not (self.root / ".git").exists():
            return None
        try:
            completed = subprocess.run(
                ["git", "-C", str(self.root), *args],
                capture_output=True,
                check=True,
                text=True,
                timeout=5,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        return completed.stdout.strip() or None
