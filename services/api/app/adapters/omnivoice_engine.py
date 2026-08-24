from __future__ import annotations

import re
import subprocess
from pathlib import Path

from app.domain.models import EngineProfileSchema, EngineStatus, ProfileChoice, ProfileFacet


class OmniVoiceEngine:
    CAPABILITIES = [
        "text-to-speech",
        "voice-training",
        "voice-cloning",
        "lora-finetuning",
        "voice-design",
    ]
    _VOICE_DESIGN_FACETS = [
        ProfileFacet(
            id="gender",
            label="Giới tính",
            options=[ProfileChoice(id="male", label="Nam"), ProfileChoice(id="female", label="Nữ")],
        ),
        ProfileFacet(
            id="age",
            label="Độ tuổi",
            options=[
                ProfileChoice(id="child", label="Trẻ em"),
                ProfileChoice(id="teenager", label="Thiếu niên"),
                ProfileChoice(id="young adult", label="Thanh niên"),
                ProfileChoice(id="middle-aged", label="Trung niên"),
                ProfileChoice(id="elderly", label="Cao tuổi"),
            ],
        ),
        ProfileFacet(
            id="pitch",
            label="Cao độ",
            options=[
                ProfileChoice(id="very low pitch", label="Rất trầm"),
                ProfileChoice(id="low pitch", label="Trầm"),
                ProfileChoice(id="moderate pitch", label="Trung bình"),
                ProfileChoice(id="high pitch", label="Cao"),
                ProfileChoice(id="very high pitch", label="Rất cao"),
            ],
        ),
        ProfileFacet(
            id="style",
            label="Phong cách",
            options=[ProfileChoice(id="whisper", label="Thì thầm")],
        ),
        ProfileFacet(
            id="accent",
            label="English accent",
            hint="OmniVoice chỉ áp dụng cho câu nói tiếng Anh.",
            options=[
                ProfileChoice(id=f"{name} accent", label=f"{name.title()} accent")
                for name in (
                    "american", "british", "australian", "canadian", "indian",
                    "chinese", "korean", "japanese", "portuguese", "russian",
                )
            ],
        ),
        ProfileFacet(
            id="dialect",
            label="Chinese dialect",
            hint="OmniVoice chỉ áp dụng cho câu nói tiếng Trung.",
            options=[
                ProfileChoice(id=value, label=label)
                for value, label in (
                    ("河南话", "Henan"), ("陕西话", "Shaanxi"), ("四川话", "Sichuan"),
                    ("贵州话", "Guizhou"), ("云南话", "Yunnan"), ("桂林话", "Guilin"),
                    ("济南话", "Jinan"), ("石家庄话", "Shijiazhuang"), ("甘肃话", "Gansu"),
                    ("宁夏话", "Ningxia"), ("青岛话", "Qingdao"), ("东北话", "Northeast"),
                )
            ],
        ),
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

    def profile_schema(self) -> EngineProfileSchema:
        return EngineProfileSchema(
            engine_id="omnivoice",
            engine_name="OmniVoice",
            languages=self._languages(),
            facets=[facet.model_copy(deep=True) for facet in self._VOICE_DESIGN_FACETS],
        )

    def _languages(self) -> list[ProfileChoice]:
        language_file = self.root / "docs" / "languages.md"
        if not language_file.is_file():
            return []
        choices: list[ProfileChoice] = []
        row = re.compile(r"^\|\s*\d+\s*\|\s*(?P<label>[^|]+?)\s*\|\s*(?P<id>[^|]+?)\s*\|")
        try:
            for line in language_file.read_text(encoding="utf-8").splitlines():
                match = row.match(line)
                if not match:
                    continue
                label = match.group("label").strip()
                language_id = match.group("id").strip()
                if label and language_id:
                    choices.append(ProfileChoice(id=language_id, label=label))
        except OSError:
            return []
        return choices

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