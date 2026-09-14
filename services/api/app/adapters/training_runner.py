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
    ProjectAsrAdapter,
    TrainingCheckpoint,
    TrainingProgressLine,
    TrainingRun,
    TrainingRunConfig,
)
from app.domain.ports import ProjectRepository
from app.domain.voice_reference import NoReferenceSegment, choose_reference


ASR_LORA_WRAPPER = Path(__file__).resolve().parents[1] / "workers" / "vibevoice_asr_lora_train.py"

# What each engine's runner can do. A mode missing here is refused before any
# run exists, whatever a descriptor claims.
SUPPORTED_MODES: dict[str, set[str]] = {
    "omnivoice": {"lora-finetune", "full-finetune", "from-scratch", "zero-shot-clone"},
    "vibevoice": {"tts-lora", "asr-lora", "zero-shot-clone"},
}

WINDOWS_GOPEN_REWRITE = ";".join(
    f"{letter}:=file:{letter}:" for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

OMNIVOICE_TEMPLATES = {
    "lora-finetune": "train_config_finetune_lora.json",
    "full-finetune": "train_config_finetune_sdpa.json",
    "from-scratch": "train_config_emilia.json",
}


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
        vibevoice_paths: VibeVoicePaths | None = None,
        vibevoice_runtime: VibeVoiceRuntime | None = None,
        asr_adapters: FileAsrAdapters | None = None,
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
            if run.config.engine == "vibevoice":
                self._execute_vibevoice(run)
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
            checkpoint_dir = Path(project.project_path) / latest.path
            if run.config.mode == "lora-finetune":
                self._publish_voice(run, manifest, kind="lora", adapter_dir=checkpoint_dir)
            else:
                # Full and from-scratch checkpoints are whole models.
                self._publish_voice(run, manifest, kind="full", adapter_dir=None, model_dir=checkpoint_dir)
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
                raise RuntimeError(f"VibeVoice training thất bại với mã {code}.")

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
        engine_label = "VibeVoice " if run.config.engine == "vibevoice" else ""
        kind_label = {"clone": "nhái giọng", "lora": "LoRA", "full": "full fine-tune"}.get(kind, kind)
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
        replacements = [
            (str(self.runs.run_dir(run.project_id, run.id)), "<run>"),
            (str(self.engine_root), "<omnivoice>"),
            (str(self.runtime.python), "python"),
            *(extra or []),
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
        current = self.runs.get(run.project_id, run.id)
        return self.runs.update(run.project_id, current.model_copy(update=updates))

    def _fail(self, run: TrainingRun, message: str) -> None:
        current = self.runs.get(run.project_id, run.id)
        if current.status == "cancelled":
            return
        self.runs.update(run.project_id, current.model_copy(update={"status": "failed", "process_id": None, "error": message}))

    def _write_train_config(self, run: TrainingRun, run_dir: Path) -> Path:
        template_name = OMNIVOICE_TEMPLATES.get(run.config.mode)
        if template_name is None:
            template_name = "train_config_finetune_lora.json" if run.config.use_lora else "train_config_finetune_sdpa.json"
        template = self.engine_root / "examples" / "config" / template_name
        if not template.is_file():
            raise FileNotFoundError(f"Không tìm thấy config OmniVoice: {template_name}")
        payload = json.loads(template.read_text(encoding="utf-8"))
        if run.config.mode != "from-scratch":
            # Training from scratch starts from the language model the recipe
            # names, not from an OmniVoice checkpoint, and has no LoRA.
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
