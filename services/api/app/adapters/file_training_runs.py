from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.domain.models import (
    TrainingProgressLine,
    TrainingRun,
    TrainingRunConfig,
    TrainingRunStatus,
)
from app.domain.ports import ProjectRepository

# Statuses a process can still be behind. Anything here found at startup was
# interrupted, because the process that owned it is gone.
LIVE_STATUSES: set[TrainingRunStatus] = {"pending", "running"}


class FileTrainingRuns:
    """Run records under the project, one folder per run.

    ```
    <project>/jobs/training/<run-id>/
      run.json          config, status, step - rewritten atomically
      progress.jsonl    one line per logging step - append-only
      data/             manifests and shards for this run
      checkpoints/      as accelerate writes them
    ```

    `progress.jsonl` is never rewritten. A run lasting hours will be killed
    mid-write at some point, and an append-only file loses at most its last line
    where a rewritten one can lose all of it.
    """

    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects

    # ---------- paths ----------

    def root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "jobs" / "training"

    def run_dir(self, project_id: str, run_id: str) -> Path:
        return self.root(project_id) / run_id

    # ---------- lifecycle ----------

    def create(
        self,
        project_id: str,
        manifest_id: str,
        *,
        manifest_hash: str = "",
        config: TrainingRunConfig | None = None,
        speaker_profile_id: str | None = None,
        emotion: str = "normal",
        engine_revision: str = "",
    ) -> TrainingRun:
        run = TrainingRun(
            id=f"run-{uuid4().hex[:12]}",
            project_id=project_id,
            manifest_id=manifest_id,
            manifest_hash=manifest_hash,
            engine_revision=engine_revision,
            speaker_profile_id=speaker_profile_id,
            emotion=emotion,  # type: ignore[arg-type]
            config=config or TrainingRunConfig(),
        )
        directory = self.run_dir(project_id, run.id)
        for child in ("data", "checkpoints"):
            (directory / child).mkdir(parents=True, exist_ok=True)
        self._write(project_id, run)
        return run

    def get(self, project_id: str, run_id: str) -> TrainingRun:
        path = self.run_dir(project_id, run_id) / "run.json"
        if not path.is_file():
            raise KeyError(run_id)
        return TrainingRun.model_validate_json(path.read_text(encoding="utf-8"))

    def list(self, project_id: str) -> list[TrainingRun]:
        root = self.root(project_id)
        if not root.is_dir():
            return []
        runs: list[TrainingRun] = []
        for directory in sorted(root.iterdir()):
            record = directory / "run.json"
            if not record.is_file():
                continue
            try:
                runs.append(TrainingRun.model_validate_json(record.read_text(encoding="utf-8")))
            except ValueError:
                continue     # a half-written record is not a reason to hide the rest
        return sorted(runs, key=lambda run: run.created_at, reverse=True)

    def update(self, project_id: str, run: TrainingRun) -> TrainingRun:
        updated = run.model_copy(update={"updated_at": datetime.now(timezone.utc)})
        self._write(project_id, updated)
        return updated

    def mark_interrupted(self, project_id: str) -> list[TrainingRun]:
        """Called at startup: no training process survives an app restart.

        A run left saying `running` would report progress that stopped hours ago,
        and one wrong number on that screen makes every other number suspect.
        """
        recovered: list[TrainingRun] = []
        for run in self.list(project_id):
            if run.status in LIVE_STATUSES:
                recovered.append(
                    self.update(
                        project_id,
                        run.model_copy(update={"status": "interrupted", "process_id": None}),
                    )
                )
        return recovered

    # ---------- progress ----------

    def append_progress(
        self, project_id: str, run_id: str, line: TrainingProgressLine
    ) -> TrainingProgressLine:
        path = self.run_dir(project_id, run_id) / "progress.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line.model_dump_json(by_alias=True) + "\n")
        return line

    def progress(
        self, project_id: str, run_id: str, limit: int | None = None
    ) -> list[TrainingProgressLine]:
        path = self.run_dir(project_id, run_id) / "progress.jsonl"
        if not path.is_file():
            return []
        lines = path.read_text(encoding="utf-8").splitlines()
        if limit is not None:
            lines = lines[-limit:]
        parsed: list[TrainingProgressLine] = []
        for raw in lines:
            if not raw.strip():
                continue
            try:
                parsed.append(TrainingProgressLine.model_validate(json.loads(raw)))
            except ValueError:
                # The last line of a killed run is routinely half written.
                continue
        return parsed

    # ---------- internals ----------

    def _write(self, project_id: str, run: TrainingRun) -> None:
        path = self.run_dir(project_id, run.id) / "run.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(run.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(path)
