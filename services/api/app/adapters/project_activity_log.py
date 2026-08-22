from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ProjectActivityLog:
    """Keeps human and machine-readable project history inside the project."""

    def append(
        self,
        project_path: str | Path,
        event: str,
        summary: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        root = Path(project_path).resolve()
        timestamp = datetime.now(timezone.utc).isoformat()
        payload = {
            "timestamp": timestamp,
            "event": event,
            "summary": summary,
            "details": details or {},
        }

        events_path = root / "activity" / "events.jsonl"
        events_path.parent.mkdir(parents=True, exist_ok=True)
        with events_path.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(payload, ensure_ascii=False) + "\n")

        notes_path = root / "notes" / "ACTIVITY.md"
        notes_path.parent.mkdir(parents=True, exist_ok=True)
        if not notes_path.is_file():
            notes_path.write_text(
                "# Project Activity\n\n"
                "Nhật ký này đi cùng project. Đường dẫn file trong project luôn tính từ folder chứa `project.json`.\n\n",
                encoding="utf-8",
            )
        detail_text = ""
        if details:
            compact = ", ".join(f"{key}={value}" for key, value in details.items())
            detail_text = f" ({compact})"
        with notes_path.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(f"- `{timestamp}` **{event}**: {summary}{detail_text}\n")

    def ensure_handoff(self, project_path: str | Path) -> None:
        handoff = Path(project_path).resolve() / "notes" / "PROJECT_HANDOFF.md"
        if handoff.is_file():
            return
        handoff.parent.mkdir(parents=True, exist_ok=True)
        handoff.write_text(
            "# Project Handoff\n\n"
            "Project này là một folder tự chứa và có thể di chuyển nguyên folder.\n\n"
            "- `project.json`: metadata chuẩn; `projectPath` và `location` dùng `.`.\n"
            "- `assets/media/index.json`: Media Pool, transcript, word timing và revision.\n"
            "- `assets/media/<asset-id>/`: source gốc và `analysis.wav`.\n"
            "- `activity/events.jsonl`: lịch sử máy đọc được.\n"
            "- `notes/ACTIVITY.md`: lịch sử tóm tắt cho người và session sau.\n"
            "- `jobs/`, `exports/`, `cache/`: trạng thái job, thành phẩm và cache riêng của project.\n\n"
            "Sau khi move folder, dùng **Open existing** trong Project Hub và chọn folder này.\n",
            encoding="utf-8",
        )
