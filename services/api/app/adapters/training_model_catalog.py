from __future__ import annotations

import json
import logging
import threading
import time
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
READINESS_PENDING_PREFIX = "Đang kiểm tra runtime/model"
READINESS_PENDING_STATUS = f"{READINESS_PENDING_PREFIX}…"


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

    def _descriptors(self) -> dict[str, tuple[TrainingModelDescriptor, str]]:
        """Merge descriptor sources before machine-specific readiness checks."""
        found: dict[str, tuple[TrainingModelDescriptor, str]] = {}
        for origin, folder in (("shipped", self.shipped_root), ("local", self.local_root)):
            if not folder or not folder.is_dir():
                continue
            for path in sorted(folder.glob("*.json")):
                descriptor = self._read(path)
                if descriptor is None:
                    continue
                if descriptor.id in found:
                    logger.info("Training model '%s' from %s replaces an earlier descriptor", descriptor.id, path.name)
                found[descriptor.id] = (descriptor, origin)
        return found

    def options(
        self,
        task: str | None = None,
        *,
        check_readiness: bool = True,
    ) -> list[TrainingModelOption]:
        found = self._descriptors()
        descriptors = [
            (descriptor, origin)
            for descriptor, origin in found.values()
            if not task or task in descriptor.tasks
        ]
        options = [
            self._describe(descriptor, origin, check_readiness=check_readiness)
            for descriptor, origin in descriptors
        ]
        return sorted(options, key=lambda option: (option.order, option.family, option.label))

    def get(self, model_id: str) -> TrainingModelOption:
        match = self._descriptors().get(model_id)
        if match is None:
            raise KeyError(model_id)
        descriptor, origin = match
        return self._describe(descriptor, origin)

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

    def _describe(
        self,
        descriptor: TrainingModelDescriptor,
        origin: str,
        *,
        check_readiness: bool = True,
    ) -> TrainingModelOption:
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
            if not check_readiness and (descriptor.readiness_required or descriptor.engine in self.readiness):
                available = False
                status = READINESS_PENDING_STATUS
            else:
                check = self.readiness.get(descriptor.engine)
                reason = check(descriptor) if check else ("Chưa cấu hình kiểm tra runtime/model cho adapter." if descriptor.readiness_required else None)
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


class BackgroundTrainingModelOptions:
    """Serve quick descriptor metadata while runtime readiness probes run in one daemon thread."""

    def __init__(
        self,
        catalog: FileTrainingModelCatalog,
        *,
        ttl_seconds: float = 60.0,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.catalog = catalog
        self.ttl_seconds = ttl_seconds
        self._monotonic = monotonic
        self._lock = threading.Lock()
        self._refreshing = False
        self._checked_at: float | None = None
        self._results: dict[str, tuple[bool, str]] = {}

    def options(self, task: str | None = None) -> list[TrainingModelOption]:
        # Reading descriptor files and checking repository paths is bounded; do
        # not invoke engine-specific imports/model checks on the request thread.
        options = self.catalog.options(task=task, check_readiness=False)
        pending_ids = {
            option.id for option in options
            if option.status.startswith(READINESS_PENDING_PREFIX)
        }
        if not pending_ids:
            return options
        now = self._monotonic()
        with self._lock:
            fresh = self._checked_at is not None and now - self._checked_at < self.ttl_seconds
            missing = pending_ids.difference(self._results) if fresh else pending_ids
            if not fresh or missing:
                self._start_refresh_locked(pending_ids)
            results = self._results.copy() if fresh else {}

        described: list[TrainingModelOption] = []
        for option in options:
            if not option.status.startswith(READINESS_PENDING_PREFIX):
                described.append(option)
                continue
            result = results.get(option.id)
            if result is None:
                described.append(option.model_copy(update={
                    "available": False,
                    "status": READINESS_PENDING_STATUS,
                }))
                continue
            available, status = result
            described.append(option.model_copy(update={"available": available, "status": status}))
        return described

    def _start_refresh_locked(self, pending_ids: set[str]) -> None:
        if self._refreshing:
            return
        self._refreshing = True
        thread = threading.Thread(
            target=self._refresh,
            name="voice-generator-readiness",
            daemon=True,
        )
        try:
            thread.start()
        except Exception as exc:
            self._refreshing = False
            self._checked_at = self._monotonic()
            message = f"Không kiểm tra được runtime/model: {exc or 'lỗi không xác định.'}"
            self._results = {model_id: (False, message) for model_id in pending_ids}

    def _refresh(self) -> None:
        try:
            options = self.catalog.options()
            results = {
                option.id: (option.available, option.status)
                for option in options
                if (option.readiness_required or option.engine in self.catalog.readiness) and option.runnable
            }
        except Exception as exc:
            logger.exception("Voice generator readiness refresh failed")
            results = self._failed_results(str(exc))
        with self._lock:
            self._results = results
            self._checked_at = self._monotonic()
            self._refreshing = False

    def _failed_results(self, reason: str) -> dict[str, tuple[bool, str]]:
        try:
            pending = self.catalog.options(check_readiness=False)
        except Exception:
            logger.exception("Could not enumerate voice generators after readiness failure")
            return {}
        message = f"Không kiểm tra được runtime/model: {reason or 'lỗi không xác định.'}"
        return {
            option.id: (False, message)
            for option in pending
            if option.status.startswith(READINESS_PENDING_PREFIX)
        }
