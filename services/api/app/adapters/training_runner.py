from __future__ import annotations

import hashlib
import json
import os
import subprocess
import threading
from pathlib import Path

from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuBusy, GpuLease
from app.adapters.omnivoice_dataset_export import (
    DatasetExportError,
    OmniVoiceDatasetExporter,
)
from app.adapters.project_dataset_compiler import ProjectDatasetCompiler
from app.adapters.training_process import (
    OmniVoiceTrainingCommands,
    TrainingProcess,
    run_tokenize,
    run_training,
    spawn_in_thread,
)
from app.adapters.training_runtime import TrainingRuntime
from app.domain.models import (
    TrainingCheckpoint,
    TrainingProgressLine,
    TrainingRun,
    TrainingRunConfig,
)
from app.domain.ports import ProjectRepository


class TrainingNotReady(RuntimeError):
    """The machine must be provisioned before a run can consume the GPU."""


class TrainingRunner:
    """Orchestrates the project-owned part of an OmniVoice training run.

    The engine remains an unmodified checkout. This adapter owns the run
    folder, process lifetime, progress journal and GPU lease around it.
    """

    def __init__(
        self,
        projects: ProjectRepository,
        compiler: ProjectDatasetCompiler,
        catalogs: FileTrainingCatalog,
        runs: FileTrainingRuns,
        runtime: TrainingRuntime,
        gpu_lease: GpuLease,
        engine_root: Path,
        ffmpeg_path: str | None = None,
    ) -> None:
        self.projects = projects
        self.compiler = compiler
        self.catalogs = catalogs
        self.runs = runs
        self.runtime = runtime
        self.gpu_lease = gpu_lease
        self.engine_root = engine_root
        self.exporter = OmniVoiceDatasetExporter(ffmpeg_path)
        self._active: dict[str, TrainingProcess] = {}
        self._lock = threading.Lock()

    def start(
        self,
        project_id: str,
        manifest_id: str,
        config: TrainingRunConfig | None = None,
        resume_run_id: str | None = None,
    ) -> TrainingRun:
        report = self.runtime.report()
        if not report.ready:
            missing = ", ".join(report.missing) or "training runtime"
            raise TrainingNotReady(f"Training runtime chưa sẵn sàng; còn thiếu: {missing}.")

        manifest = self.compiler.load(project_id, manifest_id)
        self.runs.reconcile(project_id)
        live = [run for run in self.runs.list(project_id) if run.status in {"pending", "running"}]
        if live:
            raise TrainingBusyError("Project này đã có một training run đang chạy.")

        if resume_run_id:
            run = self.runs.get(project_id, resume_run_id)
            if run.manifest_id != manifest.id:
                raise ValueError("Run resume không dùng cùng Dataset Manifest.")
            if run.status not in {"interrupted", "cancelled", "failed"}:
                raise ValueError("Run này chưa ở trạng thái có thể resume.")
        else:
            run = self.runs.create(
                project_id,
                manifest.id,
                manifest_hash=self._manifest_hash(project_id, manifest.id),
                config=config,
                engine_revision=self._engine_revision(),
            )

        # Until the sidecar child exists, the API process is the owner of this
        # short preparation window. This prevents a fast polling request from
        # reconciling a just-created pending run as interrupted.
        run = self.runs.update(
            project_id,
            run.model_copy(update={"status": "running", "process_id": os.getpid()}),
        )
        spawn_in_thread(lambda: self._execute(run))
        return self.runs.get(project_id, run.id)

    def cancel(self, project_id: str, run_id: str) -> TrainingRun:
        run = self.runs.get(project_id, run_id)
        if run.status not in {"pending", "running"}:
            raise ValueError("Run này không còn đang chạy.")
        with self._lock:
            process = self._active.get(run_id)
        if process is not None:
            process.cancel()
        return self.runs.update(
            project_id,
            run.model_copy(update={"status": "cancelled", "process_id": None}),
        )

    def _execute(self, initial: TrainingRun) -> None:
        run = initial
        lease_token: str | None = None
        try:
            if self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            lease = self.gpu_lease.acquire(f"training:{run.id}")
            lease_token = lease.token
            if self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            run = self._set_run(run, status="running", step_id="read-manifest")
            manifest = self.compiler.load(run.project_id, run.manifest_id)
            project = self.projects.get(run.project_id)
            run_dir = self.runs.run_dir(run.project_id, run.id)
            catalog = self.catalogs.get(run.project_id)

            self._append(run, "read-manifest", f"Đã đọc Dataset Manifest {manifest.id}.")
            run = self._set_run(run, step_id="write-jsonl")
            export = self.exporter.export(
                manifest,
                Path(project.project_path),
                run_dir,
                catalog.speakers,
                project.language,
            )
            self._append(run, "write-jsonl", f"Đã ghi {export.train_samples} train và {export.dev_samples} dev samples.")

            token_dir = run_dir / "data" / "tokens"
            train_lst = token_dir / "data.lst"
            dev_lst = token_dir / "dev" / "data.lst"
            if not train_lst.is_file() or not dev_lst.is_file():
                run = self._set_run(run, step_id="tokenize")
                commands = OmniVoiceTrainingCommands(self.runtime.python, self.engine_root)
                process = self._process_for(run)
                code = run_tokenize(process, commands.tokenize(Path(export.train_jsonl), token_dir))
                if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                    return
                if code != 0:
                    raise RuntimeError(f"OmniVoice tokenizer thất bại với mã {code}.")

                dev_dir = run_dir / "data" / "dev-tokens"
                dev_process = self._process_for(run)
                code = run_tokenize(dev_process, commands.tokenize(Path(export.dev_jsonl), dev_dir))
                if dev_process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                    return
                if code != 0:
                    raise RuntimeError(f"OmniVoice tokenizer cho dev thất bại với mã {code}.")
                dev_lst = dev_dir / "data.lst"
            data_config = self.exporter.write_data_config(run_dir, train_lst, dev_lst)

            run = self._set_run(run, step_id="load-model")
            train_config = self._write_train_config(run, run_dir)
            commands = OmniVoiceTrainingCommands(self.runtime.python, self.engine_root)
            process = self._process_for(run)
            code = run_training(
                process,
                commands.train(train_config, data_config, run_dir / "checkpoints"),
            )
            if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            if code != 0:
                raise RuntimeError(f"OmniVoice training thất bại với mã {code}.")

            latest = self._refresh_checkpoints(run)
            if not latest:
                raise RuntimeError("Training kết thúc nhưng không tạo checkpoint nào.")
            self._set_run(run, status="complete", step_id="checkpoint", process_id=None)
            self._append(run, "checkpoint", f"Đã tạo checkpoint tại {latest.path}.")
        except GpuBusy as exc:
            self._fail(run, str(exc))
        except (DatasetExportError, KeyError, OSError, RuntimeError, ValueError) as exc:
            self._fail(run, str(exc))
        finally:
            if lease_token:
                self.gpu_lease.release(lease_token)
            with self._lock:
                self._active.pop(run.id, None)

    def _process_for(self, run: TrainingRun) -> TrainingProcess:
        process = TrainingProcess(
            lambda line: self._on_progress(run, line),
            lambda pid: self._on_started(run, pid),
        )
        with self._lock:
            self._active[run.id] = process
        return process

    def _on_started(self, run: TrainingRun, pid: int) -> None:
        current = self.runs.get(run.project_id, run.id)
        self.runs.update(run.project_id, current.model_copy(update={"process_id": pid, "status": "running"}))

    def _on_progress(self, run: TrainingRun, line: TrainingProgressLine) -> None:
        self.runs.append_progress(run.project_id, run.id, line)
        current = self.runs.get(run.project_id, run.id)
        update: dict[str, object] = {"step_id": line.step_id}
        if line.global_step is not None:
            update["global_step"] = line.global_step
        self.runs.update(run.project_id, current.model_copy(update=update))

    def _append(self, run: TrainingRun, step_id: str, message: str) -> None:
        self.runs.append_progress(run.project_id, run.id, TrainingProgressLine(step_id=step_id, message=message))

    def _set_run(self, run: TrainingRun, **updates: object) -> TrainingRun:
        current = self.runs.get(run.project_id, run.id)
        return self.runs.update(run.project_id, current.model_copy(update=updates))

    def _fail(self, run: TrainingRun, message: str) -> None:
        current = self.runs.get(run.project_id, run.id)
        if current.status == "cancelled":
            return
        self.runs.update(run.project_id, current.model_copy(update={"status": "failed", "process_id": None, "error": message}))

    def _write_train_config(self, run: TrainingRun, run_dir: Path) -> Path:
        template_name = "train_config_finetune_lora.json" if run.config.use_lora else "train_config_finetune_sdpa.json"
        template = self.engine_root / "examples" / "config" / template_name
        if not template.is_file():
            raise FileNotFoundError(f"Không tìm thấy config OmniVoice: {template_name}")
        payload = json.loads(template.read_text(encoding="utf-8"))
        payload.update(
            {
                "init_from_checkpoint": run.config.base_model,
                "use_lora": run.config.use_lora,
                "lora_r": run.config.lora_r,
                "lora_alpha": run.config.lora_alpha,
                "learning_rate": run.config.learning_rate,
                "steps": run.config.steps,
                "save_steps": run.config.save_steps,
                "batch_tokens": run.config.batch_tokens,
                "attn_implementation": run.config.attn_implementation,
            }
        )
        checkpoints = sorted(
            self.runs.run_dir(run.project_id, run.id).joinpath("checkpoints").glob("checkpoint-*"),
            key=lambda path: int(path.name.rsplit("-", 1)[1]) if path.name.rsplit("-", 1)[1].isdigit() else -1,
        )
        if checkpoints:
            payload["resume_from_checkpoint"] = str(checkpoints[-1])
        path = run_dir / "data" / "train_config.json"
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    def _refresh_checkpoints(self, run: TrainingRun):
        checkpoints: list[TrainingCheckpoint] = []
        project_root = Path(self.projects.get(run.project_id).project_path)
        for path in sorted(
            self.runs.run_dir(run.project_id, run.id).joinpath("checkpoints").glob("checkpoint-*"),
            key=lambda item: int(item.name.rsplit("-", 1)[1]) if item.name.rsplit("-", 1)[1].isdigit() else -1,
        ):
            try:
                step = int(path.name.rsplit("-", 1)[1])
            except ValueError:
                continue
            size = sum(item.stat().st_size for item in path.rglob("*") if item.is_file())
            checkpoints.append(
                TrainingCheckpoint(
                    step=step,
                    path=str(path.relative_to(project_root)),
                    bytes=size,
                )
            )
        current = self.runs.get(run.project_id, run.id)
        self.runs.update(run.project_id, current.model_copy(update={"checkpoints": checkpoints}))
        return checkpoints[-1] if checkpoints else None

    def _manifest_hash(self, project_id: str, manifest_id: str) -> str:
        path = Path(self.projects.get(project_id).project_path) / "assets" / "training" / "datasets" / f"{manifest_id}.json"
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _engine_revision(self) -> str:
        try:
            return subprocess.run(
                ["git", "-C", str(self.engine_root), "rev-parse", "HEAD"],
                capture_output=True,
                check=True,
                text=True,
                timeout=5,
            ).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""


class TrainingBusyError(RuntimeError):
    pass
