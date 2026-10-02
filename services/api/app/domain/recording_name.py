from datetime import datetime
import re


def recording_name(started_at: datetime | None, project_name: str, source: str, recording_id: str) -> str:
    """Stable local start time and provenance, suitable for a media filename."""
    project = re.sub(r"[^\w.-]+", "-", project_name.strip(), flags=re.UNICODE).strip("-") or "project"
    timestamp = started_at.astimezone().strftime("%Y-%m-%d_%H-%M-%S") if started_at else "unknown-time"
    return f"{timestamp}_{project}_{source}_{recording_id[:8]}"
