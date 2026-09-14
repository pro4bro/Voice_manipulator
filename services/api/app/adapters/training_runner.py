from __future__ import annotations

import hashlib
import json
import os
import subprocess
import threading
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4

from app.adapters.file_project_voices import FileProjectVoices
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
    DatasetManifest,
    TrainingCheckpoint,
    TrainingProgressLine,
    TrainingRun,
    TrainingRunConfig,
)
from app.domain.ports import ProjectRepository
from app.domain.voice_reference import NoReferenceSegment, choose_reference


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
        voices: FileProjectVoices | None = None,
        engine_env: dict[str, str] | None = None,
        before_gpu_work: Callable[[], None] | None = None,
    ) -> None:
        self.projects = projects
        self.compiler = compiler
        self.catalogs = catalogs
        self.runs = runs
        self.runtime = runtime
        self.gpu_lease = gpu_lease
        self.engine_root = engine_root
        self.exporter = OmniVoiceDatasetExporter(ffmpeg_path)
        self.voices = voices
        # Environment for engine processes, such as an offline model cache.
        self.engine_env = engine_env or {}
        # Frees whatever else holds the GPU (a warm generation worker) before a
        # run needs all of it.
        self.before_gpu_work = before_gpu_work
        self._active: dict[str, TrainingProcess] = {}
        self._lock = threading.Lock()

    def start(
        self,
        project_id: str,
        manifest_id: str,
        config: TrainingRunConfig | None = None,
        resume_run_id: str | None = None,
        speaker_profile_ids: list[str] | None = None,
    ) -> TrainingRun:
        """Start one run, resume one, or start one run per voice target.

        With voice targets, each Speaker Profile becomes its own run trained on
        that person's segments only, queued behind the one before it. The first
        run of the batch is returned; the rest are listed with it.
        """
        if config and config.engine != "omnivoice":
            raise ValueError("VibeVoice đã có trong danh sách lựa chọn nhưng chưa được cài adapter chạy thật.")
        if config and config.mode not in {"lora-finetune", "full-finetune", "zero-shot-clone"}:
            raise ValueError("Mode training này chưa được runner OmniVoice hỗ trợ trên Dataset Manifest hiện tại.")
        report = self.runtime.report()
        if not report.ready:
            missing = ", ".join(report.missing) or "training runtime"
            raise TrainingNotReady(f"Training runtime chưa sẵn sàng; còn thiếu: {missing}.")

        manifest = self.compiler.load(project_id, manifest_id)
        self.runs.reconcile(project_id)
        live = [run for run in self.runs.list(project_id) if run.status in {"pending", "running"}]
        if live:
            raise TrainingBusyError("Project này đã có một training run đang chạy.")

        targets = list(dict.fromkeys(speaker_profile_ids or []))
        if targets and not resume_run_id:
            return self._start_batch(project_id, manifest, config, targets)

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

    def _start_batch(
        self,
        project_id: str,
        manifest: DatasetManifest,
        config: TrainingRunConfig | None,
        targets: list[str],
    ) -> TrainingRun:
        catalog = self.catalogs.get(project_id)
        names = {speaker.id: speaker.name for speaker in catalog.speakers}
        problems: list[str] = []
        for target in targets:
            if target not in names:
                problems.append(f"Speaker Profile '{target}' không tồn tại")
                continue
            mine = [segment for segment in manifest.segments if segment.speaker_profile_id == target]
            splits = {segment.split for segment in mine}
            if not {"train", "dev"} <= splits:
                problems.append(f"{names[target]} chỉ có {len(mine)} đoạn, cần ít nhất 1 train và 1 dev")
        # Refused before any run exists: a batch that fails on its third voice
        # after two hours spent on the first two is worse than no batch.
        if problems:
            raise ValueError("Không bắt đầu được: " + "; ".join(problems) + ".")

        batch_id = f"batch-{uuid4().hex[:12]}"
        manifest_hash = self._manifest_hash(project_id, manifest.id)
        revision = self._engine_revision()
        runs: list[TrainingRun] = []
        for index, target in enumerate(targets):
            run = self.runs.create(
                project_id,
                manifest.id,
                manifest_hash=manifest_hash,
                config=config,
                engine_revision=revision,
                speaker_profile_id=target,
                batch_id=batch_id,
                batch_index=index,
                batch_size=len(targets),
            )
            # Queued runs are owned by the API process until their turn: a poll
            # does not reconcile them as interrupted while they wait, and does
            # if the app stops before reaching them.
            runs.append(self.runs.update(project_id, run.model_copy(update={"process_id": os.getpid()})))
        spawn_in_thread(lambda: self._execute_batch(runs))
        return self.runs.get(project_id, runs[0].id)

    def _execute_batch(self, runs: list[TrainingRun]) -> None:
        for queued in runs:
            current = self.runs.get(queued.project_id, queued.id)
            if current.status != "pending":
                continue
            self._execute(current)

    def cancel(self, project_id: str, run_id: str) -> TrainingRun:
        """Cancel a run, and with it every voice still queued behind it."""
        run = self.runs.get(project_id, run_id)
        if run.status not in {"pending", "running"}:
            raise ValueError("Run này không còn đang chạy.")
        with self._lock:
            process = self._active.get(run_id)
        if process is not None:
            process.cancel()
        if run.batch_id:
            for sibling in self.runs.list(project_id):
                if sibling.batch_id == run.batch_id and sibling.id != run.id and sibling.status == "pending":
                    self.runs.update(
                        project_id,
                        sibling.model_copy(update={"status": "cancelled", "process_id": None}),
                    )
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
            if run.config.mode == "zero-shot-clone":
                self._build_clone_voice(run)
                return
            if self.before_gpu_work is not None:
                self.before_gpu_work()
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
            if run.speaker_profile_id:
                name = next(
                    (speaker.name for speaker in catalog.speakers if speaker.id == run.speaker_profile_id),
                    run.speaker_profile_id,
                )
                mine = [segment for segment in manifest.segments if segment.speaker_profile_id == run.speaker_profile_id]
                manifest = manifest.model_copy(update={"segments": mine})
                minutes = sum(segment.duration for segment in mine) / 60
                self._append(
                    run,
                    "read-manifest",
                    f"Voice target {run.batch_index + 1}/{run.batch_size}: {name} · {len(mine)} đoạn · {minutes:.1f} phút.",
                )
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
                command = commands.tokenize(Path(export.train_jsonl), token_dir)
                self._append_command(run, "tokenize", command)
                code = run_tokenize(process, command, env=self._engine_environment())
                if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                    return
                if code != 0:
                    raise RuntimeError(f"OmniVoice tokenizer thất bại với mã {code}.")

                dev_dir = run_dir / "data" / "dev-tokens"
                dev_process = self._process_for(run)
                command = commands.tokenize(Path(export.dev_jsonl), dev_dir)
                self._append_command(run, "tokenize", command)
                code = run_tokenize(dev_process, command, env=self._engine_environment())
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
            command = commands.train(train_config, data_config, run_dir / "checkpoints")
            self._append_command(run, "load-model", command)
            code = run_training(process, command, env=self._engine_environment())
            if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            if code != 0:
                raise RuntimeError(f"OmniVoice training thất bại với mã {code}.")

            latest = self._refresh_checkpoints(run)
            if not latest:
                raise RuntimeError("Training kết thúc nhưng không tạo checkpoint nào.")
            self._append(run, "checkpoint", f"Đã tạo checkpoint tại {latest.path}.")
            self._publish_voice(run, manifest, kind="lora", adapter_dir=Path(project.project_path) / latest.path)
            self._set_run(run, status="complete", step_id="checkpoint", process_id=None)
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

    def _build_clone_voice(self, run: TrainingRun) -> None:
        """A voice with no training: pick the reference clip and publish it.

        The same steps as a run, minus the GPU. The flow still reads manifest,
        chooses from this target's own segments and publishes, so a cloned voice
        is found and used exactly where a trained one is.
        """
        try:
            run = self._set_run(run, status="running", step_id="read-manifest", process_id=None)
            manifest = self.compiler.load(run.project_id, run.manifest_id)
            if run.speaker_profile_id:
                manifest = manifest.model_copy(
                    update={"segments": [s for s in manifest.segments if s.speaker_profile_id == run.speaker_profile_id]}
                )
            self._append(run, "read-manifest", f"Đã đọc {len(manifest.segments)} đoạn của voice target.")
            run = self._set_run(run, step_id="write-jsonl")
            voice = self._publish_voice(run, manifest, kind="clone", adapter_dir=None, required=True)
            run = self._set_run(run, step_id="publish")
            self._append(run, "publish", f"Đã tạo voice nhái giọng {voice.name} ({voice.id}). Không cần train.")
            self._set_run(run, status="complete", step_id="publish", process_id=None)
        except (DatasetExportError, KeyError, OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
            self._fail(run, str(exc))

    def _publish_voice(
        self,
        run: TrainingRun,
        manifest: DatasetManifest,
        *,
        kind: str,
        adapter_dir: Path | None,
        required: bool = False,
    ):
        """Make the run usable in Voice Manipulation. A trained run that cannot
        find a reference clip still completes; its checkpoint is the result."""
        if self.voices is None or not run.speaker_profile_id:
            if required:
                raise RuntimeError("Chưa cấu hình kho voice của project.")
            return None
        parameters = run.config.parameters
        try:
            reference = choose_reference(
                manifest.segments,
                float(parameters.get("reference_min_seconds", 3.0)),
                float(parameters.get("reference_max_seconds", 10.0)),
            )
        except NoReferenceSegment as exc:
            if required:
                raise
            self._append(run, "publish", f"Chưa tạo voice: {exc}")
            return None
        catalog = self.catalogs.get(run.project_id)
        speaker = next((item for item in catalog.speakers if item.id == run.speaker_profile_id), None)
        project = self.projects.get(run.project_id)
        name = speaker.name if speaker else run.speaker_profile_id
        self._append(
            run,
            "write-jsonl" if kind == "clone" else "publish",
            f"Giọng mẫu: {reference.duration:.1f}s · \u201c{reference.text.strip()}\u201d",
        )
        return self.voices.publish(
            run.project_id,
            name=f"{name} · {'nhái giọng' if kind == 'clone' else 'LoRA'}",
            speaker_profile_id=run.speaker_profile_id,
            kind=kind,  # type: ignore[arg-type]
            reference=reference,
            language=(speaker.language_id if speaker else None) or reference.language_id or project.language,
            model_id=run.config.model_id,
            base_model=run.config.base_model,
            adapter_dir=adapter_dir,
            source_run_id=run.id,
        )

    def _append_command(self, run: TrainingRun, step_id: str, command: list[str]) -> None:
        """The command a step runs, as a line in the run's log.

        The journal lives inside the project, which moves between machines, so
        machine paths are written as placeholders rather than as they are here.
        """
        replacements = [
            (str(self.runs.run_dir(run.project_id, run.id)), "<run>"),
            (str(self.engine_root), "<omnivoice>"),
            (str(self.runtime.python), "python"),
        ]
        shown: list[str] = []
        for argument in command:
            for original, placeholder in replacements:
                if original and argument.startswith(original):
                    argument = placeholder + argument[len(original):].replace("\\", "/")
                    break
            shown.append(f'"{argument}"' if " " in argument else argument)
        self._append(run, step_id, "$ " + " ".join(shown))

    def _engine_environment(self) -> dict[str, str] | None:
        if not self.engine_env:
            return None
        return {**os.environ, **self.engine_env}

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
        # Descriptor values are keyed by OmniVoice's own config names, so they
        # go in as they are. The catalog already checked them against the
        # descriptor; OmniVoice itself ignores any key its TrainingConfig lacks.
        payload.update(
            {key: value for key, value in run.config.parameters.items() if value is not None}
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
