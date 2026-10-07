from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import uuid4


class ProcessingStopped(Exception):
    """A queued processor was explicitly stopped before publication."""


class ProcessingStopError(RuntimeError):
    """The engine did not confirm that an active processor stopped."""


CancelHandler = Callable[[], Awaitable[None]]


class ProcessingCancellation:
    """Per-job cancellation signal shared by a queue and its processor adapter."""

    def __init__(self) -> None:
        self.id = uuid4().hex
        self.cancelled = False
        self.cancel_confirmed = False
        self.cancel_error: str | None = None
        self._handler: CancelHandler | None = None

    def check(self) -> None:
        if self.cancelled:
            raise ProcessingStopped("Processing was stopped.")

    def request(self) -> None:
        """Set the fence synchronously so no concurrent callback can publish."""
        self.cancelled = True

    async def install_cancel_handler(self, handler: CancelHandler) -> None:
        self._handler = handler
        if self.cancelled:
            await self._run_cancel_handler(handler)

    async def cancel(self) -> None:
        self.request()
        if self._handler is not None:
            await self._run_cancel_handler(self._handler)
        else:
            # The importer has not dispatched into a cancellable engine yet; its
            # next cancellation check prevents the engine call from starting.
            self.cancel_confirmed = True

    async def _run_cancel_handler(self, handler: CancelHandler) -> None:
        try:
            await handler()
        except ProcessingStopError as exc:
            self.cancel_error = str(exc)
            raise
        except Exception as exc:
            self.cancel_error = str(exc)
            raise ProcessingStopError(
                "Cannot confirm the engine stopped. Restart the owning runtime before retrying."
            ) from exc
        self.cancel_confirmed = True
