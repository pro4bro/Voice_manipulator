from __future__ import annotations

import subprocess
import sys
import threading
from collections.abc import Callable, Iterable
from pathlib import Path

from app.adapters.training_log_parser import (
    parse_tokenize_line,
    parse_train_line,
    split_carriage_returns,
)
from app.domain.models import TrainingProgressLine

# Windows only: lets the runner signal or kill a whole tree rather than the one
# process it started. `accelerate` spawns a worker per GPU and each worker spawns
# dataloader workers, so the thing to stop is never the process we hold.
_NEW_PROCESS_GROUP = 0x00000200


class TrainingProcess:
    """Runs one engine command and turns its output into progress lines.

    Deliberately outside `engines/OmniVoice`, which stays read-only, so nothing
    is hooked into the engine. The engine prints; this reads.

    Output is merged and split on both newlines and carriage returns, because
    tqdm redraws its bar with `\\r` and a single read otherwise arrives as one
    unreadable blob of every bar state since the last newline.
    """

    def __init__(
        self,
        on_progress: Callable[[TrainingProgressLine], None],
        on_started: Callable[[int], None] | None = None,
    ) -> None:
        self.on_progress = on_progress
        self.on_started = on_started
        self._process: subprocess.Popen[str] | None = None
        self._cancelled = False

    @property
    def pid(self) -> int | None:
        return self._process.pid if self._process else None

    def run(
        self,
        command: list[str],
        parse: Callable[[str], TrainingProgressLine | None],
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
    ) -> int:
        self._cancelled = False
        creation = _NEW_PROCESS_GROUP if sys.platform == "win32" else 0
        self._process = subprocess.Popen(
            command,
            cwd=str(cwd) if cwd else None,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=creation,
        )
        if self.on_started is not None:
            self.on_started(self._process.pid)
        assert self._process.stdout is not None
        try:
            for chunk in self._process.stdout:
                for line in split_carriage_returns(chunk):
                    parsed = parse(line)
                    if parsed is not None:
                        self.on_progress(parsed)
        finally:
            code = self._process.wait()
            self._process = None
        return code

    def cancel(self) -> bool:
        """Stop the whole tree, not the process this object happens to hold.

        A cancelled run keeps its checkpoints: at step 4,000 it is a resumable
        run, not a mistake to clean up.
        """
        process = self._process
        if process is None or process.poll() is not None:
            return False
        self._cancelled = True
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                check=False,
            )
        else:
            process.terminate()
        return True

    @property
    def cancelled(self) -> bool:
        return self._cancelled


class OmniVoiceTrainingCommands:
    """The two commands a run shells out to, built from a provisioned runtime."""

    def __init__(self, python: Path, engine_root: Path) -> None:
        self.python = python
        self.engine_root = engine_root

    def tokenize(
        self,
        input_jsonl: Path,
        token_dir: Path,
        tokenizer_path: str = "eustlb/higgs-audio-v2-tokenizer",
        min_seconds: float = 2.0,
        max_seconds: float = 15.0,
    ) -> list[str]:
        # min/max mirror the compiler's own window. Passing them again means a
        # hand-edited manifest is filtered here rather than becoming a shard of
        # samples the trainer will silently drop.
        return [
            str(self.python), "-m", "omnivoice.scripts.extract_audio_tokens",
            "--input_jsonl", str(input_jsonl),
            "--tar_output_pattern", str(token_dir / "audios" / "shard-%06d.tar"),
            "--jsonl_output_pattern", str(token_dir / "txts" / "shard-%06d.jsonl"),
            "--tokenizer_path", tokenizer_path,
            "--min_length", str(min_seconds),
            "--max_length", str(max_seconds),
        ]

    def train(
        self,
        train_config: Path,
        data_config: Path,
        output_dir: Path,
        gpu_ids: str = "0",
        processes: int = 1,
    ) -> list[str]:
        return [
            str(self.python), "-m", "accelerate.commands.launch",
            "--gpu_ids", gpu_ids,
            "--num_processes", str(processes),
            "-m", "omnivoice.cli.train",
            "--train_config", str(train_config),
            "--data_config", str(data_config),
            "--output_dir", str(output_dir),
        ]


def run_tokenize(process: TrainingProcess, command: list[str], cwd: Path | None = None) -> int:
    return process.run(command, parse_tokenize_line, cwd)


def run_training(process: TrainingProcess, command: list[str], cwd: Path | None = None) -> int:
    return process.run(command, parse_train_line, cwd)


def collect(lines: Iterable[TrainingProgressLine]) -> list[TrainingProgressLine]:
    return list(lines)


def spawn_in_thread(target: Callable[[], None]) -> threading.Thread:
    """A run lasts hours; the request that started it must not wait for it."""
    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    return thread
