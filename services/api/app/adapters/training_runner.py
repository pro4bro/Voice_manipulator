from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4

from app.adapters.activity_center import CENTER
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.file_asr_adapters import FileAsrAdapters
from app.adapters.gpu_lease import GpuBusy, GpuLease
from app.adapters.hf_trainer_log_parser import parse_hf_trainer_line
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
from app.adapters.vibevoice_training import (
    ASR_PACKAGES,
    TTS_PACKAGES,
    VibeVoicePaths,
    VibeVoiceRuntime,
    asr_command,
    export_asr_dataset,
    export_tts_jsonl,
    tts_command,
    write_processor_dir,
)
from app.domain.models import (
    DatasetManifest,
    OwnedItem,
    ProjectAsrAdapter,
    TrainingCheckpoint,
    TrainingProgressLine,
    TrainingRun,
    TrainingRunConfig,
    TrainingRunFootprint,
)
from app.domain.ports import ProjectRepository
from app.domain.training_passes import StepPlan, plan_steps
from app.domain.voice_reference import NoReferenceSegment, choose_reference


from app.adapters.rvc_training import RvcPaths, export_rvc_dataset, finished_model, link_experiment, rvc_commands, rvc_line_parser, unlink_experiment

ASR_LORA_WRAPPER = Path(__file__).resolve().parents[1] / "workers" / "vibevoice_asr_lora_train.py"
EPOCH_SIZE_WORKER = Path(__file__).resolve().parents[1] / "workers" / "omnivoice_epoch_size.py"
REPLY_PREFIX = "@@PRO4BRO@@"

logger = logging.getLogger("pro4bro.training")

# The step names a person reads in the log; the same words as the page's flow.
STEP_LABELS = {
    "provision": "môi trường",
    "resolve-model": "model",
    "read-manifest": "đọc dataset",
    "write-jsonl": "xuất dữ liệu",
    "tokenize": "tokenize audio",
    "load-model": "nạp model",
    "train": "train",
    "checkpoint": "checkpoint",
    "publish": "tạo voice",
}


# Where each step sits on the bar; training is nearly the whole wall clock.
STEP_START = {
    "provision": 0.0, "resolve-model": 0.0, "read-manifest": 0.01, "write-jsonl": 0.03,
    "tokenize": 0.06, "load-model": 0.12, "train": 0.15, "checkpoint": 0.96, "publish": 0.98,
}

STATUS_WORDS = {"complete": "Xong", "failed": "Lỗi", "cancelled": "Đã huỷ", "interrupted": "Bị ngắt"}


def run_fraction(step_id: str, step: int, steps: int, done: int | None = None, total: int | None = None) -> float:
    """How far a run has come, as one number between 0 and 1."""
    if step_id == "train" or (step and step_id not in {"checkpoint", "publish"}):
        return min(1.0, STEP_START["train"] + (STEP_START["checkpoint"] - STEP_START["train"]) * min(1.0, step / max(1, steps)))
    if step_id == "tokenize" and total:
        return STEP_START["tokenize"] + (STEP_START["load-model"] - STEP_START["tokenize"]) * min(1.0, (done or 0) / total)
    return STEP_START.get(step_id, 0.0)


def format_seconds(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours} giờ {minutes:02d} phút"
    if minutes:
        return f"{minutes} phút {secs:02d} giây"
    return f"{secs} giây"

# What each engine's runner can do. A mode missing here is refused before any
# run exists, whatever a descriptor claims.
SUPPORTED_MODES: dict[str, set[str]] = {
    # Fine-tuning only: the product makes voice profiles on top of a base model
    # and has no need to train a base model again.
    "omnivoice": {"lora-finetune", "full-finetune", "zero-shot-clone"},
    "vibevoice": {"tts-lora", "asr-lora", "zero-shot-clone"},
    "rvc": {"vc-train"},
}

# A trainer's bar redraws every step. The run's step follows it closely; the
# journal keeps one of them now and then, so the last few hundred lines the page
# reads still reach back over the loss curve instead of being all bar redraws.
COUNTER_UPDATE_SECONDS = 1.0
COUNTER_JOURNAL_SECONDS = 30.0
COUNTER_JOURNAL_SECONDS_BY_STEP = {"tokenize": 5.0}


def is_counter(line: TrainingProgressLine) -> bool:
    """A position in the loop and nothing else: no message, loss or rate schedule."""
    return (
        line.step_id in {"train", "tokenize"}
        and not line.message
        and line.loss is None
        and line.dev_loss is None
        and line.learning_rate is None
    )


WINDOWS_GOPEN_REWRITE = ";".join(
    f"{letter}:=file:{letter}:" for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

OMNIVOICE_TEMPLATES = {
    "lora-finetune": "train_config_finetune_lora.json",
    "full-finetune": "train_config_finetune_sdpa.json",
}


class TrainingNotReady(RuntimeError):
    """The machine must be provisioned before a run can consume the GPU."""



def _failed(message: str, process: TrainingProcess) -> str:
    """A failure message with the process's own last word on why."""
    detail = process.failure_detail() if hasattr(process, "failure_detail") else None
    return f"{message} {detail}" if detail else message


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
        vibevoice_paths: VibeVoicePaths | None = None,
        vibevoice_runtime: VibeVoiceRuntime | None = None,
        asr_adapters: FileAsrAdapters | None = None,
        rvc_paths: RvcPaths | None = None,
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
        self.vibevoice_paths = vibevoice_paths
        self.vibevoice_runtime = vibevoice_runtime
        self.asr_adapters = asr_adapters
        self.rvc_paths = rvc_paths
        self._active: dict[str, TrainingProcess] = {}
        self._lock = threading.Lock()
        # run id -> [last journalled counter, last applied counter], monotonic seconds
        self._counter_marks: dict[str, list[float]] = {}
        # run id -> (step id, monotonic seconds it started), for "done in" lines
        self._step_marks: dict[str, tuple[str, float]] = {}
        # run id -> the last rate the trainer reported, for the time left
        self._rates: dict[str, float] = {}

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
        if config:
            modes = SUPPORTED_MODES.get(config.engine)
            if modes is None:
                raise ValueError(f"Engine {config.engine} chưa có runner trong Pro4Bro.")
            if config.mode not in modes:
                raise ValueError(f"Mode {config.mode} chưa được runner {config.engine} hỗ trợ.")
        self._check_ready(config)

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

    def vibevoice_missing(self, mode: str) -> list[str]:
        """What the VibeVoice Python still lacks for a mode; empty when ready."""
        if mode == "zero-shot-clone":
            return []
        if self.vibevoice_paths is None or self.vibevoice_runtime is None:
            return ["thư mục VibeVoice"]
        if mode == "tts-lora":
            return self.vibevoice_runtime.missing(TTS_PACKAGES, self.vibevoice_paths.community)
        return self.vibevoice_runtime.missing(ASR_PACKAGES, self.vibevoice_paths.microsoft)

    def _check_ready(self, config: TrainingRunConfig | None) -> None:
        engine = config.engine if config else "omnivoice"
        mode = config.mode if config else "lora-finetune"
        if mode == "zero-shot-clone":
            # Picking a reference clip needs no training environment.
            return
        if engine == "rvc":
            missing = self.rvc_paths.missing() if self.rvc_paths else ["repo Applio"]
            if missing:
                raise TrainingNotReady(f"RVC chưa sẵn sàng; còn thiếu: {', '.join(missing)}.")
            return
        if engine == "vibevoice":
            missing = self.vibevoice_missing(mode)
            if missing:
                raise TrainingNotReady(f"Môi trường VibeVoice chưa sẵn sàng; còn thiếu: {', '.join(missing)}.")
            return
        report = self.runtime.report()
        if not report.ready:
            missing = ", ".join(report.missing) or "training runtime"
            raise TrainingNotReady(f"Training runtime chưa sẵn sàng; còn thiếu: {missing}.")

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

    # ---------- delete ----------

    def footprint(self, project_id: str, run_id: str) -> TrainingRunFootprint:
        """What deleting a run removes: its folder's bytes and what it published."""
        run = self.runs.get(project_id, run_id)
        run_dir = self.runs.run_dir(project_id, run.id)
        voices = self.voices.made_by_run(project_id, run.id, run_dir) if self.voices is not None else []
        adapters = self.asr_adapters.made_by_run(project_id, run.id, run_dir) if self.asr_adapters is not None else []
        return TrainingRunFootprint(
            run_id=run.id,
            bytes=self.runs.size(project_id, run.id),
            voices=[OwnedItem(id=voice.id, name=voice.name) for voice in voices],
            asr_adapters=[OwnedItem(id=adapter.id, name=adapter.name) for adapter in adapters],
        )

    def delete_run(self, project_id: str, run_id: str, with_outputs: bool = False) -> TrainingRunFootprint:
        """Delete a finished run's folder, and the voices and adapters it made when asked.

        A live run is refused: its process still writes into the folder. A run
        that published something is refused unless `with_outputs`, because those
        voices read weights from inside the run folder.
        """
        run = self.runs.get(project_id, run_id)
        self.runs.reconcile(project_id)
        run = self.runs.get(project_id, run_id)
        if run.status in {"pending", "running"}:
            raise ValueError("Run đang chạy. Huỷ run trước rồi mới xoá.")
        footprint = self.footprint(project_id, run_id)
        if (footprint.voices or footprint.asr_adapters) and not with_outputs:
            raise RunHasOutputs(footprint)
        for voice in footprint.voices:
            self.voices.delete(project_id, voice.id)  # type: ignore[union-attr]
        for adapter in footprint.asr_adapters:
            self.asr_adapters.delete(project_id, adapter.id)  # type: ignore[union-attr]
        self.runs.delete(project_id, run_id)
        with self._lock:
            self._counter_marks.pop(run_id, None)
        self.prune_manifests(project_id)
        return footprint

    def prune_manifests(self, project_id: str, keep: str | None = None) -> list[str]:
        """Delete dataset manifests no run uses, except the newest (or `keep`).

        Compiling writes a new manifest every time; without this the old ones
        piled up with nothing pointing at them.
        """
        ids = self.compiler.manifest_ids(project_id)
        if not ids:
            return []
        used = {run.manifest_id for run in self.runs.list(project_id)}
        newest = keep or max(ids, key=lambda manifest_id: self._manifest_time(project_id, manifest_id))
        removed = []
        for manifest_id in ids:
            if manifest_id == newest or manifest_id in used:
                continue
            self.compiler.delete(project_id, manifest_id)
            removed.append(manifest_id)
        return removed

    def _manifest_time(self, project_id: str, manifest_id: str) -> float:
        path = Path(self.projects.get(project_id).project_path) / "assets" / "training" / "datasets" / f"{manifest_id}.json"
        try:
            return path.stat().st_mtime
        except OSError:
            return 0.0

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
        self._append(run, run.step_id, f"Người dùng bấm huỷ ở step {run.global_step}.", level="warning")
        return self.runs.update(
            project_id,
            run.model_copy(update={"status": "cancelled", "process_id": None}),
        )

    def _execute(self, initial: TrainingRun) -> None:
        """Run one voice, and say in its log how it began and how it ended.

        Any exception is caught here: a bug in a runner must end as a failed run
        with its reason in the log, never as a run that says "running" forever.
        """
        run = initial
        began = time.monotonic()
        if self.runs.get(run.project_id, run.id).status == "cancelled":
            return
        try:
            self._announce(run)
            if run.config.mode == "zero-shot-clone":
                self._build_clone_voice(run)
            elif run.config.engine == "vibevoice":
                self._execute_vibevoice(run)
            elif run.config.engine == "rvc":
                self._execute_rvc(run)
            else:
                self._execute_omnivoice(run)
        except Exception as exc:  # noqa: BLE001 - the log is the place for it
            logger.exception("Training run %s stopped on an unexpected error", run.id)
            self._fail(run, f"Lỗi không lường trước trong Pro4Bro: {type(exc).__name__}: {exc}")
        finally:
            self._summarize(run, began)
            self._step_marks.pop(run.id, None)

    def _execute_omnivoice(self, initial: TrainingRun) -> None:
        run = initial
        lease_token: str | None = None
        try:
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
                self._append(run, "tokenize", "Chuyển audio thành audio token bằng higgs-audio-v2 (chạy trên GPU).")
                commands = OmniVoiceTrainingCommands(self.runtime.python, self.engine_root)
                process = self._process_for(run, "tokenize")
                command = commands.tokenize(Path(export.train_jsonl), token_dir)
                self._append_command(run, "tokenize", command)
                code = run_tokenize(process, command, env=self._engine_environment())
                if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                    return
                if code != 0:
                    raise RuntimeError(_failed(f"OmniVoice tokenizer thất bại với mã {code}.", process))

                dev_dir = run_dir / "data" / "dev-tokens"
                dev_process = self._process_for(run, "tokenize")
                command = commands.tokenize(Path(export.dev_jsonl), dev_dir)
                self._append_command(run, "tokenize", command)
                code = run_tokenize(dev_process, command, env=self._engine_environment())
                if dev_process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                    return
                if code != 0:
                    raise RuntimeError(_failed(f"OmniVoice tokenizer cho dev thất bại với mã {code}.", dev_process))
                dev_lst = dev_dir / "data.lst"
            else:
                self._append(run, "tokenize", "Đã có audio token từ lần chạy trước, bỏ qua tokenize.")
            data_config = self.exporter.write_data_config(run_dir, train_lst, dev_lst)

            run = self._set_run(run, step_id="load-model")
            train_config = self._write_train_config(run, run_dir)
            run = self._plan_passes(run, train_config, data_config, export.train_samples)
            commands = OmniVoiceTrainingCommands(self.runtime.python, self.engine_root)
            process = self._process_for(run, "load-model")
            command = commands.train(train_config, data_config, run_dir / "checkpoints")
            self._append(run, "load-model", "Nạp OmniVoice và gắn adapter; lần đầu có thể mất 1-2 phút trước step đầu tiên.")
            self._append_command(run, "load-model", command)
            code = run_training(process, command, env=self._engine_environment())
            if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            if code != 0:
                raise RuntimeError(_failed(f"OmniVoice training thất bại với mã {code}.", process))

            latest = self._refresh_checkpoints(run)
            if not latest:
                raise RuntimeError("Training kết thúc nhưng không tạo checkpoint nào.")
            self._append(run, "checkpoint", f"Đã tạo checkpoint step {latest.step} · {latest.bytes / 1024 / 1024:.0f} MB · {self._portable(run, latest.path)}.")
            checkpoint_dir = Path(project.project_path) / latest.path
            run = self._set_run(run, step_id="publish")
            if run.config.mode == "lora-finetune":
                voice = self._publish_voice(run, manifest, kind="lora", adapter_dir=checkpoint_dir)
            else:
                # A full fine-tune checkpoint is a whole model.
                voice = self._publish_voice(run, manifest, kind="full", adapter_dir=None, model_dir=checkpoint_dir)
            if voice is not None:
                self._append(run, "publish", f"Đã tạo voice {voice.name} ({voice.id}); dùng được ở Voice Manipulator.")
            self._set_run(run, status="complete", step_id="publish", process_id=None)
        except GpuBusy as exc:
            self._fail(run, str(exc))
        except (DatasetExportError, KeyError, OSError, RuntimeError, ValueError) as exc:
            self._fail(run, str(exc))
        finally:
            if lease_token:
                self.gpu_lease.release(lease_token)
            with self._lock:
                self._active.pop(run.id, None)

    def _process_for(self, run: TrainingRun, step_id: str | None = None) -> TrainingProcess:
        process = TrainingProcess(
            lambda line: self._on_progress(run, line),
            lambda pid: self._on_started(run, pid),
        )
        process.step_id = step_id or run.step_id
        process.rewrite = lambda text: self._portable(run, text)
        try:
            process.log_path = self.runs.run_dir(run.project_id, run.id) / "process.log"
        except (AttributeError, KeyError):
            process.log_path = None
        with self._lock:
            self._active[run.id] = process
        return process

    def _on_started(self, run: TrainingRun, pid: int) -> None:
        current = self.runs.get(run.project_id, run.id)
        self.runs.update(run.project_id, current.model_copy(update={"process_id": pid, "status": "running"}))

    def _on_progress(self, run: TrainingRun, line: TrainingProgressLine) -> None:
        if is_counter(line):
            now = time.monotonic()
            marks = self._counter_marks.setdefault(run.id, [float("-inf"), float("-inf")])
            final = line.total is not None and line.done == line.total
            if not final and now - marks[1] < COUNTER_UPDATE_SECONDS:
                return
            marks[1] = now
            interval = COUNTER_JOURNAL_SECONDS_BY_STEP.get(line.step_id, COUNTER_JOURNAL_SECONDS)
            if final or now - marks[0] >= interval:
                marks[0] = now
                self.runs.append_progress(run.project_id, run.id, line)
        else:
            self.runs.append_progress(run.project_id, run.id, line)
        current = self._mark_step(run, line.step_id)
        self._report_task(run, current, line)
        update: dict[str, object] = {"step_id": line.step_id}
        if line.global_step is not None:
            update["global_step"] = line.global_step
        # Epoch-based trainers only learn their step count once the loop starts;
        # the bar's total is that count, and the progress bar needs it.
        if line.step_id == "train" and line.total and current.config.steps != line.total:
            update["config"] = current.config.model_copy(update={"steps": line.total})
        self.runs.update(run.project_id, current.model_copy(update=update))

    def _execute_vibevoice(self, initial: TrainingRun) -> None:
        """Train a VibeVoice adapter: TTS LoRA (community fork) or ASR LoRA (Microsoft).

        Same steps and journal as an OmniVoice run. VibeVoice trainers read audio
        directly, so there is no tokenize step: manifest, export, load and
        train, then publish what the run made where the app can use it.
        """
        run = initial
        lease_token: str | None = None
        paths = self.vibevoice_paths
        try:
            if paths is None:
                raise RuntimeError("Chưa cấu hình thư mục VibeVoice.")
            if self.before_gpu_work is not None:
                self.before_gpu_work()
            lease_token = self.gpu_lease.acquire(f"training:{run.id}").token
            if self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            run = self._set_run(run, status="running", step_id="read-manifest")
            manifest = self._target_manifest(run)
            project_root = Path(self.projects.get(run.project_id).project_path)
            run_dir = self.runs.run_dir(run.project_id, run.id)
            data_dir = run_dir / "data"
            output_dir = run_dir / "checkpoints"
            parameters = dict(run.config.parameters)

            run = self._set_run(run, step_id="write-jsonl")
            if run.config.mode == "tts-lora":
                model_dir = paths.resolve_model(str(parameters.get("model_name_or_path") or run.config.base_model))
                tokenizer = paths.tokenizer_for(model_dir, "Qwen/Qwen2.5-1.5B")
                processor_dir = write_processor_dir(model_dir, tokenizer, data_dir / "processor")
                prompt = self._voice_prompt_clip(run, manifest, project_root, data_dir)
                train_jsonl, dev_jsonl, counts = export_tts_jsonl(
                    manifest.segments, project_root, data_dir, self.exporter._slice, prompt
                )
                self._append(run, "write-jsonl", f"Đã ghi {counts.train} train và {counts.dev} dev mẫu cho VibeVoice.")
                command = tts_command(
                    paths, model_dir, processor_dir, train_jsonl, dev_jsonl if counts.dev else None, output_dir,
                    {key: value for key, value in parameters.items() if key != "model_name_or_path"},
                )
                repository = paths.community
                env = {**os.environ, **paths.environment(repository)}
            elif run.config.mode == "asr-lora":
                model_dir = paths.resolve_model(str(parameters.get("model_path") or "microsoft/VibeVoice-ASR"))
                tokenizer = paths.resolve_model("Qwen/Qwen2.5-7B")
                asr_dir, count = export_asr_dataset(manifest.segments, project_root, data_dir, self.exporter._slice)
                self._append(run, "write-jsonl", f"Đã ghi {count} mẫu audio + nhãn JSON cho VibeVoice-ASR.")
                command = asr_command(
                    paths, ASR_LORA_WRAPPER, model_dir, asr_dir, output_dir,
                    {key: value for key, value in parameters.items() if key != "model_path"},
                )
                repository = paths.microsoft
                env = {
                    **os.environ,
                    **paths.environment(repository),
                    "PRO4BRO_ASR_FINETUNE_DIR": str(paths.microsoft / "finetuning-asr"),
                    "PRO4BRO_ASR_TOKENIZER": str(tokenizer),
                }
            else:
                raise ValueError(f"Mode {run.config.mode} chưa có runner VibeVoice.")

            run = self._set_run(run, step_id="load-model")
            process = self._process_for(run)
            self._append_command(run, "load-model", command, extra=[(str(paths.root), "<vibevoice>")])
            code = process.run(command, parse_hf_trainer_line, repository, env)
            if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            if code != 0:
                raise RuntimeError(_failed(f"VibeVoice training thất bại với mã {code}.", process))

            latest = self._refresh_checkpoints(run)
            finished = output_dir / "lora" if run.config.mode == "tts-lora" else output_dir
            finished_ok = (finished / "adapter_config.json").is_file() or (finished / "diffusion_head_full.bin").is_file()
            if not latest and not finished_ok:
                raise RuntimeError("Training kết thúc nhưng không thấy adapter nào được lưu.")
            self._append(run, "checkpoint", f"Adapter lưu tại {output_dir.relative_to(project_root).as_posix()}.")

            run = self._set_run(run, step_id="publish")
            adapter_root = output_dir if finished_ok else project_root / latest.path
            if run.config.mode == "tts-lora":
                self._publish_voice(run, manifest, kind="lora", adapter_dir=adapter_root, base_model=str(model_dir.relative_to(paths.models).as_posix()))
            else:
                self._publish_asr_adapter(run, model_dir, adapter_root, project_root, paths)
            self._set_run(run, status="complete", step_id="publish", process_id=None)
        except GpuBusy as exc:
            self._fail(run, str(exc))
        except (DatasetExportError, FileNotFoundError, KeyError, OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
            self._fail(run, str(exc))
        finally:
            if lease_token:
                self.gpu_lease.release(lease_token)
            with self._lock:
                self._active.pop(run.id, None)

    def _execute_rvc(self, initial: TrainingRun) -> None:
        """Train an RVC voice-conversion model with Applio and publish it as a `vc` voice.

        Applio's experiment folder is linked into the run directory for the
        run's lifetime, so preprocessing, features, checkpoints, the model and
        its index are all written inside the project.
        """
        run = initial
        lease_token: str | None = None
        paths = self.rvc_paths
        link: Path | None = None
        try:
            if paths is None:
                raise RuntimeError("Chưa cấu hình Applio (RVC).")
            if self.before_gpu_work is not None:
                self.before_gpu_work()
            lease_token = self.gpu_lease.acquire(f"training:{run.id}").token
            if self.runs.get(run.project_id, run.id).status == "cancelled":
                return
            run = self._set_run(run, status="running", step_id="read-manifest")
            manifest = self._target_manifest(run)
            project_root = Path(self.projects.get(run.project_id).project_path)
            run_dir = self.runs.run_dir(run.project_id, run.id)
            parameters = dict(run.config.parameters)
            total_epoch = int(parameters.get("total_epoch") or 200)

            run = self._set_run(run, step_id="write-jsonl")
            count, seconds = export_rvc_dataset(manifest.segments, project_root, run_dir / "data" / "rvc-dataset", self.exporter._slice)
            self._append(run, "write-jsonl", f"Đã xuất {count} đoạn · {seconds / 60:.1f} phút audio cho RVC.")

            paths.ensure_config()
            name = f"pro4bro-{run.id}"
            model_folder = run_dir / "rvc"
            link = link_experiment(paths, name, model_folder)
            env = {**os.environ, **paths.environment()}
            parser = rvc_line_parser(total_epoch)
            for step_id, command in rvc_commands(paths, name, run_dir / "data" / "rvc-dataset", parameters):
                run = self._set_run(run, step_id=step_id)
                process = self._process_for(run)
                self._append_command(run, step_id, command, extra=[(str(paths.applio), "<applio>")])
                code = process.run(command, parser, paths.applio, env)
                if process.cancelled or self.runs.get(run.project_id, run.id).status == "cancelled":
                    return
                if code != 0:
                    raise RuntimeError(_failed(f"RVC {step_id} thất bại với mã {code}.", process))
                if step_id == "train" and finished_model(model_folder)[0] is None:
                    # The trainer's parent exits 0 even when its worker died.
                    raise RuntimeError(_failed("RVC train kết thúc nhưng không có model nào được lưu.", process))

            model, index = finished_model(model_folder)
            if model is None:
                raise RuntimeError("RVC không tạo ra model.")
            current = self.runs.get(run.project_id, run.id)
            self.runs.update(run.project_id, current.model_copy(update={"checkpoints": [TrainingCheckpoint(
                step=current.global_step, path=str(model.relative_to(project_root)), bytes=model.stat().st_size,
            )]}))
            self._append(run, "checkpoint", f"Model {model.name}" + (f" · index {index.name}" if index else " · không có index"))

            run = self._set_run(run, step_id="publish")
            self._publish_voice(run, manifest, kind="vc", adapter_dir=index, model_dir=model, base_model="rvc-hifigan-40k", required=True)
            self._set_run(run, status="complete", step_id="publish", process_id=None)
        except GpuBusy as exc:
            self._fail(run, str(exc))
        except (DatasetExportError, FileNotFoundError, KeyError, OSError, RuntimeError, ValueError, NoReferenceSegment, subprocess.CalledProcessError) as exc:
            self._fail(run, str(exc))
        finally:
            if link is not None:
                unlink_experiment(link)
            if lease_token:
                self.gpu_lease.release(lease_token)
            with self._lock:
                self._active.pop(run.id, None)

    def _target_manifest(self, run: TrainingRun) -> DatasetManifest:
        manifest = self.compiler.load(run.project_id, run.manifest_id)
        self._append(run, "read-manifest", f"Đã đọc Dataset Manifest {manifest.id}.")
        if not run.speaker_profile_id:
            return manifest
        catalog = self.catalogs.get(run.project_id)
        name = next((speaker.name for speaker in catalog.speakers if speaker.id == run.speaker_profile_id), run.speaker_profile_id)
        mine = [segment for segment in manifest.segments if segment.speaker_profile_id == run.speaker_profile_id]
        minutes = sum(segment.duration for segment in mine) / 60
        self._append(
            run,
            "read-manifest",
            f"Voice target {run.batch_index + 1}/{run.batch_size}: {name} · {len(mine)} đoạn · {minutes:.1f} phút.",
        )
        return manifest.model_copy(update={"segments": mine})

    def _voice_prompt_clip(self, run: TrainingRun, manifest: DatasetManifest, project_root: Path, data_dir: Path) -> Path | None:
        """The reference clip every training row uses as its voice prompt."""
        try:
            reference = choose_reference(manifest.segments)
        except NoReferenceSegment as exc:
            self._append(run, "write-jsonl", f"Không có đoạn mẫu, train không kèm voice prompt: {exc}")
            return None
        clip = data_dir / "voice_prompt.wav"
        self.exporter._slice((project_root / reference.audio_path).resolve(), clip, reference.start, reference.end)
        return clip

    def _publish_asr_adapter(self, run: TrainingRun, model_dir: Path, adapter_dir: Path, project_root: Path, paths: VibeVoicePaths) -> None:
        if self.asr_adapters is None:
            return
        catalog = self.catalogs.get(run.project_id)
        speaker = next((item for item in catalog.speakers if item.id == run.speaker_profile_id), None)
        adapter = self.asr_adapters.publish(
            run.project_id,
            ProjectAsrAdapter(
                name=f"{speaker.name if speaker else 'Dataset'} · VibeVoice-ASR LoRA",
                base_model=model_dir.relative_to(paths.models).as_posix(),
                adapter_path=adapter_dir.resolve().relative_to(project_root.resolve()).as_posix(),
                speaker_profile_id=run.speaker_profile_id,
                source_run_id=run.id,
            ),
        )
        self._append(run, "publish", f"Đã thêm {adapter.name} vào lựa chọn Speech to Text.")

    def _append(self, run: TrainingRun, step_id: str, message: str, level: str = "info") -> None:
        """One line in the run's journal, and the same line in its process.log.

        process.log then reads as the whole story in order - Pro4Bro's steps
        between the engine's own output - for whoever opens it after a failure.
        """
        line = TrainingProgressLine(step_id=step_id, message=message, level=level)  # type: ignore[arg-type]
        self.runs.append_progress(run.project_id, run.id, line)
        CENTER.log("training", message, level, task_id=f"training:{run.id}")
        try:
            path = self.runs.run_dir(run.project_id, run.id) / "process.log"
            if path.parent.is_dir():
                stamp = line.at.astimezone().strftime("%Y-%m-%d %H:%M:%S")
                with path.open("a", encoding="utf-8") as handle:
                    handle.write(f"\n[{stamp}] [PRO4BRO] [{level.upper()}] [{step_id}] {message}\n")
        except (OSError, AttributeError, KeyError):
            pass

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
        model_dir: Path | None = None,
        base_model: str | None = None,
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
        engine_label = {"vibevoice": "VibeVoice ", "rvc": "RVC "}.get(run.config.engine, "")
        kind_label = {"clone": "nhái giọng", "lora": "LoRA", "full": "full fine-tune", "vc": "đổi giọng"}.get(kind, kind)
        return self.voices.publish(
            run.project_id,
            name=f"{name} · {engine_label}{kind_label}",
            speaker_profile_id=run.speaker_profile_id,
            kind=kind,  # type: ignore[arg-type]
            reference=reference,
            language=(speaker.language_id if speaker else None) or reference.language_id or project.language,
            model_id=run.config.model_id,
            base_model=base_model or run.config.base_model,
            adapter_dir=adapter_dir,
            model_dir=model_dir,
            engine=run.config.engine,
            source_run_id=run.id,
        )

    def _append_command(
        self, run: TrainingRun, step_id: str, command: list[str], extra: list[tuple[str, str]] | None = None
    ) -> None:
        """The command a step runs, as a line in the run's log.

        The journal lives inside the project, which moves between machines, so
        machine paths are written as placeholders rather than as they are here.
        """
        replacements = self._replacements(run, extra)
        shown: list[str] = []
        for argument in command:
            for original, placeholder in replacements:
                if original and argument.startswith(original):
                    argument = placeholder + argument[len(original):].replace("\\", "/")
                    break
            shown.append(f'"{argument}"' if " " in argument else argument)
        self._append(run, step_id, "$ " + " ".join(shown))

    def _engine_environment(self) -> dict[str, str] | None:
        extra = dict(self.engine_env)
        if os.name == "nt":
            # webdataset reads `C:\...` as a URL with scheme "c" and refuses to
            # open it, so OmniVoice's tokenizer could not write a single shard on
            # Windows. Its own rewrite hook turns drive paths into file: URLs.
            extra.setdefault("GOPEN_REWRITE", WINDOWS_GOPEN_REWRITE)
        if not extra:
            return None
        return {**os.environ, **extra}

    def _set_run(self, run: TrainingRun, **updates: object) -> TrainingRun:
        if isinstance(updates.get("step_id"), str):
            self._mark_step(run, updates["step_id"])  # type: ignore[arg-type]
        current = self.runs.get(run.project_id, run.id)
        return self.runs.update(run.project_id, current.model_copy(update=updates))

    def _fail(self, run: TrainingRun, message: str) -> None:
        current = self.runs.get(run.project_id, run.id)
        if current.status == "cancelled":
            return
        message = self._portable(run, message)
        self.runs.update(run.project_id, current.model_copy(update={"status": "failed", "process_id": None, "error": message}))
        label = STEP_LABELS.get(current.step_id, current.step_id)
        self._append(run, current.step_id, f"Thất bại ở bước {label}: {message}", level="error")

    def _announce(self, run: TrainingRun) -> None:
        """The run's first lines: what trains, on what, with which settings."""
        config = run.config
        CENTER.start_task(
            "training", f"Training · {self._speaker_name(run)}",
            task_id=f"training:{run.id}", detail=f"{config.model_id or config.engine} · chuẩn bị",
            fraction=0.0, project_id=run.project_id,
        )
        target = f" · voice {run.batch_index + 1}/{run.batch_size}" if run.batch_size > 1 else ""
        self._append(run, "provision", f"Bắt đầu run {run.id}: {config.model_id or config.engine} ({config.engine} · {config.mode}){target}.")
        if config.parameters:
            shown = " · ".join(f"{key}={value}" for key, value in sorted(config.parameters.items()) if value is not None)
            self._append(run, "provision", f"Tham số: {shown}")
        logger.info("Training run %s started: %s %s", run.id, config.engine, config.mode)

    def _summarize(self, run: TrainingRun, began: float) -> None:
        """The run's last line: how it ended and how long it took."""
        try:
            current = self.runs.get(run.project_id, run.id)
        except KeyError:
            return
        elapsed = format_seconds(time.monotonic() - began)
        label = STEP_LABELS.get(current.step_id, current.step_id)
        CENTER.finish_task(
            f"training:{run.id}",
            status="complete" if current.status == "complete" else "cancelled" if current.status == "cancelled" else "failed",
            error=current.error,
        )
        if current.status == "complete":
            self._append(run, current.step_id, f"Hoàn tất sau {elapsed}.")
        elif current.status == "cancelled":
            self._append(run, current.step_id, f"Đã huỷ ở bước {label} sau {elapsed}. Checkpoint đã lưu vẫn còn.", level="warning")
        elif current.status == "failed":
            self._append(run, current.step_id, f"Dừng sau {elapsed}. Toàn bộ output của engine nằm trong process.log (nút Log đầy đủ).", level="error")
        logger.info("Training run %s ended %s after %s", run.id, current.status, elapsed)

    def _report_task(self, run: TrainingRun, current: TrainingRun, line: TrainingProgressLine) -> None:
        """Keep the status bar's copy of this run in step with its journal."""
        if line.steps_per_second:
            self._rates[run.id] = line.steps_per_second
        step = line.global_step if line.global_step is not None else current.global_step
        steps = max(1, current.config.steps or 1)
        rate = self._rates.get(run.id)
        left = max(0, steps - step)
        detail = f"{STEP_LABELS.get(line.step_id, line.step_id)}"
        eta = None
        if line.step_id == "train" and step:
            detail = f"step {step}/{steps}"
            if rate:
                eta = left / rate
                detail += f" · {rate:.2f} step/s · còn ~{format_seconds(eta)}"
        elif line.total:
            detail += f" · {line.done or 0}/{line.total}"
        CENTER.update_task(
            f"training:{run.id}",
            detail=f"{self._speaker_name(run)} · {detail}" if run.batch_size > 1 else detail,
            fraction=run_fraction(line.step_id, step, steps, line.done, line.total),
            eta_seconds=eta,
        )

    def _speaker_name(self, run: TrainingRun) -> str:
        try:
            catalog = self.catalogs.get(run.project_id)
        except (KeyError, OSError):
            return run.speaker_profile_id or "Toàn bộ dataset"
        return next(
            (speaker.name for speaker in catalog.speakers if speaker.id == run.speaker_profile_id),
            run.speaker_profile_id or "Toàn bộ dataset",
        )

    def _mark_step(self, run: TrainingRun, step_id: str) -> TrainingRun:
        """Note when the run moves to another step, with how long the last one took."""
        current = self.runs.get(run.project_id, run.id)
        now = time.monotonic()
        previous = self._step_marks.get(run.id)
        if previous is None:
            self._step_marks[run.id] = (step_id, now)
        elif previous[0] != step_id:
            self._step_marks[run.id] = (step_id, now)
            if previous[0] != "provision":
                label = STEP_LABELS.get(previous[0], previous[0])
                self._append(run, previous[0], f"Xong {label} sau {format_seconds(now - previous[1])}.")
        return current

    def _plan_passes(self, run: TrainingRun, train_config: Path, data_config: Path, train_samples: int) -> TrainingRun:
        """Measure one pass over the data, then cap the steps at the allowed passes."""
        parameters = dict(run.config.parameters)
        max_epochs = int(parameters.get("max_epochs") or 0)
        requested = int(parameters.get("steps") or run.config.steps)
        self._append(run, "load-model", f"Đo xem 1 vòng dữ liệu ({train_samples} đoạn train) bằng bao nhiêu step, bằng đúng dataloader của training (không dùng GPU).")
        measured: dict = {}

        def read_reply(raw: str) -> None:
            if raw.startswith(REPLY_PREFIX):
                measured.update(json.loads(raw[len(REPLY_PREFIX):]))
            return None

        process = self._process_for(run, "load-model")
        command = [str(self.runtime.python), str(EPOCH_SIZE_WORKER), "--train_config", str(train_config), "--data_config", str(data_config)]
        try:
            code = process.run(command, read_reply, env=self._engine_environment())
        except OSError as exc:
            code, measured = -1, {}
            self._append(run, "load-model", f"Không chạy được bước đo vòng dữ liệu: {exc}", level="warning")
        if process.cancelled:
            return self.runs.get(run.project_id, run.id)
        steps_per_epoch = float(measured.get("stepsPerEpoch") or 0)
        if code != 0 or steps_per_epoch <= 0:
            detail = process.failure_detail() if code != 0 else "không có kết quả"
            self._append(run, "load-model", f"Không đo được 1 vòng dữ liệu ({self._portable(run, detail or '')}); train đúng {requested} step như đã đặt, không giới hạn số lần đọc lại.", level="warning")
            return self.runs.get(run.project_id, run.id)

        plan = plan_steps(requested, steps_per_epoch, max_epochs)
        batches = ", ".join(str(count) for count in measured.get("batchesPerEpoch") or [])
        self._append(run, "load-model", f"1 vòng dữ liệu = {steps_per_epoch:.1f} step (đo {len(measured.get('batchesPerEpoch') or [])} vòng: {batches} batch) · đo mất {measured.get('seconds', 0)} giây.")
        payload = json.loads(train_config.read_text(encoding="utf-8"))
        if plan.capped:
            self._append(
                run,
                "load-model",
                f"Max steps {plan.requested_steps} sẽ đọc lại mỗi đoạn khoảng {plan.requested_epochs:.0f} lần, quá giới hạn {plan.max_epochs} lần. "
                f"Train {plan.steps} step (khoảng {plan.epochs:.0f} lần). Đổi \u201cTối đa số lần đọc lại dữ liệu\u201d nếu muốn khác.",
                level="warning",
            )
        else:
            limit = f"giới hạn {plan.max_epochs} lần" if plan.max_epochs else "không đặt giới hạn"
            self._append(run, "load-model", f"Train {plan.steps} step: mỗi đoạn được đọc lại khoảng {plan.epochs:.1f} lần ({limit}).")
        changes = self._fit_schedule(payload, plan)
        for change in changes:
            self._append(run, "load-model", change)
        if plan.capped or changes:
            train_config.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        current = self.runs.get(run.project_id, run.id)
        parameters.update({key: payload[key] for key in ("steps", "eval_steps") if key in payload})
        config = current.config.model_copy(update={"steps": plan.steps, "parameters": parameters})
        return self.runs.update(run.project_id, current.model_copy(update={"config": config}))

    @staticmethod
    def _fit_schedule(payload: dict, plan: StepPlan) -> list[str]:
        """Keep evaluation reachable after the steps were capped."""
        payload["steps"] = plan.steps
        changes = []
        eval_steps = int(payload.get("eval_steps") or 0)
        if eval_steps > plan.steps:
            payload["eval_steps"] = plan.steps
            changes.append(f"Đánh giá dev mỗi {eval_steps} step sẽ không bao giờ tới; đánh giá ở step {plan.steps}.")
        return changes

    def _portable(self, run: TrainingRun, text: str) -> str:
        """Machine paths as placeholders, as in the command lines of the log."""
        if not text:
            return text
        for original, placeholder in self._replacements(run):
            if not original:
                continue
            for variant in {original, original.replace("\\", "/")}:
                text = text.replace(variant, placeholder)
        return text

    def _replacements(self, run: TrainingRun, extra: list[tuple[str, str]] | None = None) -> list[tuple[str, str]]:
        pairs = [
            (str(self.runs.run_dir(run.project_id, run.id)), "<run>"),
            (str(self.engine_root), "<omnivoice>"),
            (str(self.runtime.python), "python"),
            # Pro4Bro's own workers, which the training command runs through.
            (str(Path(__file__).resolve().parents[1]), "<pro4bro>"),
        ]
        try:
            pairs.append((str(Path(self.projects.get(run.project_id).project_path)), "<project>"))
        except (KeyError, AttributeError):
            pass
        if self.rvc_paths is not None:
            pairs.append((str(self.rvc_paths.applio), "<applio>"))
        return [*(extra or []), *pairs]

    def _write_train_config(self, run: TrainingRun, run_dir: Path) -> Path:
        template_name = OMNIVOICE_TEMPLATES.get(run.config.mode)
        if template_name is None:
            template_name = "train_config_finetune_lora.json" if run.config.use_lora else "train_config_finetune_sdpa.json"
        template = self.engine_root / "examples" / "config" / template_name
        if not template.is_file():
            raise FileNotFoundError(f"Không tìm thấy config OmniVoice: {template_name}")
        payload = json.loads(template.read_text(encoding="utf-8"))
        payload.update(
            {
                "init_from_checkpoint": run.config.base_model,
                "use_lora": run.config.use_lora and run.config.mode == "lora-finetune",
                "lora_r": run.config.lora_r,
                "lora_alpha": run.config.lora_alpha,
            }
        )
        payload.update(
            {
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


class RunHasOutputs(RuntimeError):
    """Deleting the run would take voices or adapters with it; the caller must say so."""

    def __init__(self, footprint: TrainingRunFootprint) -> None:
        names = [voice.name for voice in footprint.voices] + [adapter.name for adapter in footprint.asr_adapters]
        super().__init__("Run này đã tạo: " + ", ".join(names) + ". Xoá run sẽ xoá luôn các mục này.")
        self.footprint = footprint
