from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path

from pydantic import ValidationError

from app.domain.models import (
    TrainingModelDescriptor,
    TrainingModelOption,
    TrainingRunConfig,
)
from app.domain.training_parameters import apply_to_run_config

logger = logging.getLogger(__name__)


class TrainingModelUnavailable(ValueError):
    """The chosen option exists but cannot run on this machine."""


class FileTrainingModelCatalog:
    """Training options read from descriptor files.

    Shipped descriptors live in the application's resources; descriptors under
    `local_root` are this machine's own additions, and one with the same id as a
    shipped descriptor replaces it. A malformed descriptor is skipped with a log
    line: one bad file must not take the Train module down with it.

    `installed` only says the trainer's entrypoint file exists under its root.
    It does not say the weights are downloaded or the Python environment can
    import it; `available` additionally needs a Pro4Bro runner for the option.
    """

    def __init__(
        self,
        shipped_root: Path,
        roots: dict[str, Path | None],
        local_root: Path | None = None,
        readiness: dict[str, Callable[[TrainingModelDescriptor], str | None]] | None = None,
    ) -> None:
        self.shipped_root = shipped_root
        self.local_root = local_root
        self.roots = roots
        # Per-engine checks only the engine's own adapter can make: whether its
        # Python imports what this option needs. Returns why not, or None.
        self.readiness = readiness or {}

    def options(self) -> list[TrainingModelOption]:
        found: dict[str, TrainingModelOption] = {}
        for origin, folder in (("shipped", self.shipped_root), ("local", self.local_root)):
            if not folder or not folder.is_dir():
                continue
            for path in sorted(folder.glob("*.json")):
                descriptor = self._read(path)
                if descriptor is None:
                    continue
                if descriptor.id in found:
                    logger.info("Training model '%s' from %s replaces an earlier descriptor", descriptor.id, path.name)
                found[descriptor.id] = self._describe(descriptor, origin)
        return sorted(found.values(), key=lambda option: (option.order, option.family, option.label))

    def get(self, model_id: str) -> TrainingModelOption:
        for option in self.options():
            if option.id == model_id:
                return option
        raise KeyError(model_id)

    def resolve(self, config: TrainingRunConfig) -> TrainingRunConfig:
        """The run config for a start request, checked against its descriptor.

        A request without a model id is a client from before descriptors, and
        passes through as it always did.
        """
        if not config.model_id:
            return config
        try:
            option = self.get(config.model_id)
        except KeyError as exc:
            raise ValueError(f"Không có Model Training '{config.model_id}'.") from exc
        if not option.available:
            raise TrainingModelUnavailable(f"{option.label}: {option.status}")
        return apply_to_run_config(option, config)

    def _read(self, path: Path) -> TrainingModelDescriptor | None:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return TrainingModelDescriptor.model_validate(payload)
        except (OSError, ValueError, ValidationError) as exc:
            logger.warning("Skipping training model descriptor %s: %s", path.name, exc)
            return None

    def _describe(self, descriptor: TrainingModelDescriptor, origin: str) -> TrainingModelOption:
        repository = descriptor.repository
        root = self.roots.get(repository.root)
        entrypoint = (root / repository.path / repository.entrypoint) if root else None
        missing = [
            requirement.label or requirement.path
            for requirement in descriptor.requires
            if not (self.roots.get(requirement.root) and (self.roots[requirement.root] / requirement.path).exists())
        ]
        installed = bool(entrypoint and entrypoint.is_file()) and not missing
        available = installed and descriptor.runnable
        if not root:
            status = f"Chưa cấu hình thư mục '{repository.root}'."
        elif not (entrypoint and entrypoint.is_file()):
            status = f"Chưa thấy {repository.path}/{repository.entrypoint} trong thư mục '{repository.root}'."
        elif missing:
            status = "Chưa có " + ", ".join(missing) + "."
        elif not descriptor.runnable:
            status = descriptor.blocked_reason or "Đã có repo, chưa có adapter chạy thật trong Pro4Bro."
        else:
            status = "Sẵn sàng."
            check = self.readiness.get(descriptor.engine)
            reason = check(descriptor) if check else None
            if reason:
                available = False
                status = reason
        return TrainingModelOption(
            **descriptor.model_dump(),
            origin=origin,
            installed=installed,
            available=available,
            status=status,
        )
