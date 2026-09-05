from __future__ import annotations

from pathlib import Path

from app.domain.models import TrainingEngineOption, TrainingModeOption


class TrainingEngineCatalog:
    """Describes selectable engines without pretending an absent engine runs."""

    def __init__(self, omnivoice_root: Path, vibevoice_root: Path | None = None) -> None:
        self.omnivoice_root = omnivoice_root
        self.vibevoice_root = vibevoice_root

    def options(self) -> list[TrainingEngineOption]:
        omnivoice_installed = self.omnivoice_root.is_dir()
        return [
            TrainingEngineOption(
                id="omnivoice",
                label="OmniVoice",
                description="High-quality multilingual voice cloning and fine-tuning.",
                installed=omnivoice_installed,
                modes=[
                    TrainingModeOption(
                        id="lora-finetune",
                        label="LoRA fine-tune",
                        description="Khuyến nghị: adapter nhẹ, phù hợp voice riêng/emotion.",
                        available=omnivoice_installed,
                    ),
                    TrainingModeOption(
                        id="full-finetune",
                        label="Full fine-tune",
                        description="Fine-tune toàn bộ model, cần nhiều VRAM và disk hơn.",
                        available=False,
                    ),
                    TrainingModeOption(
                        id="from-scratch",
                        label="Training từ đầu (Emilia)",
                        description="Pipeline dữ liệu Emilia để huấn luyện model mới.",
                        available=False,
                    ),
                ],
            ),
            TrainingEngineOption(
                id="vibevoice",
                label="VibeVoice",
                description="Long-form conversational TTS và ASR fine-tuning.",
                installed=bool(self.vibevoice_root and self.vibevoice_root.is_dir()),
                modes=[
                    TrainingModeOption(
                        id="tts-single-speaker-lora",
                        label="TTS single-speaker LoRA",
                        description="Community implementation, experimental, một speaker.",
                        available=False,
                    ),
                    TrainingModeOption(
                        id="asr-lora",
                        label="ASR LoRA",
                        description="Microsoft VibeVoice-ASR LoRA fine-tuning.",
                        available=False,
                    ),
                ],
            ),
        ]
