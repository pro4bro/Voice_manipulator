from __future__ import annotations

import logging
import re
from typing import Any

# Endpoints the UI polls on a timer. A successful poll says nothing that a later
# reader needs; 97% of one real log (2,043 of 2,104 lines) was these two routes,
# which buries the lines that do matter. Failures are always kept - a poll that
# starts returning 500 is exactly the signal worth seeing.
POLLED_ROUTES = (
    "/api/system/status",
    "/api/runtime/status",
    "/api/runtime/health",
    "/api/health",
    "/media/transcription-status",
    "/media/diarization-status",
)

_ACCESS_LINE = re.compile(r'"(?:GET|HEAD) (?P<path>[^ ?]+)[^"]*" (?P<status>\d{3})')


class QuietPollFilter(logging.Filter):
    """Drop successful polls from the access log, keep everything else."""

    def filter(self, record: logging.LogRecord) -> bool:
        match = _ACCESS_LINE.search(record.getMessage())
        if not match:
            return True
        if not match.group("status").startswith("2"):
            return True
        path = match.group("path")
        return not any(route in path for route in POLLED_ROUTES)


# One logger for things an operator would want to reconstruct afterwards: what a
# job did, how long it took, and why it stopped.
activity = logging.getLogger("pro4bro.activity")


def job_started(kind: str, project_id: str, asset_id: str, **detail: Any) -> None:
    activity.info("%s START  %s/%s%s", kind.upper(), project_id, asset_id, _suffix(detail))


def job_progress(kind: str, project_id: str, asset_id: str, percent: float, **detail: Any) -> None:
    """Log at coarse milestones only; the caller decides when to call this."""
    activity.info(
        "%s %5.1f%%  %s/%s%s", kind.upper(), percent, project_id, asset_id, _suffix(detail)
    )


def job_finished(kind: str, project_id: str, asset_id: str, seconds: float, **detail: Any) -> None:
    activity.info(
        "%s DONE   %s/%s in %.1fs%s", kind.upper(), project_id, asset_id, seconds, _suffix(detail)
    )


def job_failed(kind: str, project_id: str, asset_id: str, error: BaseException) -> None:
    activity.error(
        "%s FAILED %s/%s  %s: %s",
        kind.upper(),
        project_id,
        asset_id,
        type(error).__name__,
        error,
        exc_info=error,
    )


def _suffix(detail: dict[str, Any]) -> str:
    if not detail:
        return ""
    return "  " + " ".join(f"{key}={value}" for key, value in detail.items() if value is not None)
