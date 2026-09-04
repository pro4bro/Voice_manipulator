from __future__ import annotations

import sys
import time
from pathlib import Path

from app.adapters.training_process import (
    OmniVoiceTrainingCommands,
    TrainingProcess,
    run_tokenize,
    run_training,
)
from app.domain.models import TrainingProgressLine


def script(tmp_path: Path, body: str) -> list[str]:
    """A real subprocess, so streaming and decoding are actually exercised."""
    path = tmp_path / "fake_engine.py"
    path.write_text(body, encoding="utf-8")
    return [sys.executable, str(path)]


def test_it_reads_real_subprocess_output_into_progress_lines(tmp_path):
    captured: list[TrainingProgressLine] = []
    command = script(
        tmp_path,
        "print('Step 100 | train/loss: 3.2100 | train/learning_rate: 1.00e-04')\n"
        "print('Step 200 | train/loss: 2.8400 | train/learning_rate: 9.00e-05')\n"
        "print('Eval Loss: 2.9500')\n",
    )

    code = run_training(TrainingProcess(captured.append), command)

    assert code == 0
    assert [line.global_step for line in captured] == [100, 200, None]
    assert captured[-1].dev_loss == 2.95


def test_a_redrawn_progress_bar_is_split_rather_than_swallowed(tmp_path):
    captured: list[TrainingProgressLine] = []
    command = script(
        tmp_path,
        # chr(13) rather than a written escape. This string crosses the test
        # file and then a generated script, and an escape does not survive both.
        "import sys" + chr(10)
        + "for done in (100, 200, 300):" + chr(10)
        + "    sys.stdout.write('Extracting Audio Tokens: |  %d/900 [00:01<00:05]' % done"
        + " + chr(13))" + chr(10)
        + "sys.stdout.write(chr(10))" + chr(10),
    )

    run_tokenize(TrainingProcess(captured.append), command)

    assert [line.done for line in captured] == [100, 200, 300]
    assert all(line.total == 900 for line in captured)


def test_engine_chatter_between_measurements_is_not_reported(tmp_path):
    captured: list[TrainingProgressLine] = []
    command = script(
        tmp_path,
        "print('Loaded Config: TrainingConfig(steps=5000)')\n"
        "print('some warning nobody asked for')\n"
        "print('Step 50 | train/loss: 4.0000')\n",
    )

    run_training(TrainingProcess(captured.append), command)

    assert len(captured) == 1
    assert captured[0].global_step == 50


def test_stderr_is_read_too_because_tqdm_writes_there(tmp_path):
    captured: list[TrainingProgressLine] = []
    command = script(
        tmp_path,
        "import sys\n"
        "sys.stderr.write('Extracting Audio Tokens: | 42/100 [00:01<00:02]\n')\n",
    )

    run_tokenize(TrainingProcess(captured.append), command)

    assert [line.done for line in captured] == [42]


def test_a_failing_command_returns_its_code_rather_than_raising(tmp_path):
    command = script(tmp_path, "import sys\nprint('Step 1 | train/loss: 1.0')\nsys.exit(3)\n")

    code = run_training(TrainingProcess(lambda _line: None), command)

    assert code == 3


def test_cancel_stops_a_long_run_and_reports_that_it_did(tmp_path):
    captured: list[TrainingProgressLine] = []
    process = TrainingProcess(captured.append)
    command = script(
        tmp_path,
        "import sys, time\n"
        "print('Step 10 | train/loss: 5.0', flush=True)\n"
        "time.sleep(60)\n",
    )

    import threading

    result: dict[str, int] = {}
    runner = threading.Thread(target=lambda: result.update(code=run_training(process, command)))
    runner.start()
    for _ in range(100):
        if captured:
            break
        time.sleep(0.05)

    assert process.cancel() is True
    runner.join(timeout=20)

    assert not runner.is_alive()
    assert process.cancelled is True
    assert captured[0].global_step == 10


def test_cancelling_nothing_is_not_an_error():
    assert TrainingProcess(lambda _line: None).cancel() is False


class TestCommands:
    def setup_method(self):
        self.commands = OmniVoiceTrainingCommands(Path("py.exe"), Path("engines/OmniVoice"))

    def test_tokenize_passes_the_same_window_the_compiler_cut_to(self):
        command = self.commands.tokenize(Path("train.jsonl"), Path("tokens"))

        assert command[1:3] == ["-m", "omnivoice.scripts.extract_audio_tokens"]
        assert "--min_length" in command and "2.0" in command
        assert "--max_length" in command and "15.0" in command

    def test_tokenize_names_both_shard_patterns(self):
        command = self.commands.tokenize(Path("train.jsonl"), Path("tokens"))

        assert any("shard-%06d.tar" in part for part in command)
        assert any("shard-%06d.jsonl" in part for part in command)

    def test_training_goes_through_accelerate_not_python_directly(self):
        command = self.commands.train(Path("t.json"), Path("d.json"), Path("exp"))

        assert "accelerate.commands.launch" in command
        assert command[command.index("-m", 3) + 1] == "omnivoice.cli.train"
        assert "--output_dir" in command
