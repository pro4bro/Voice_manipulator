from __future__ import annotations

import pytest

from app.adapters.training_log_parser import (
    parse_tokenize_line,
    parse_train_line,
    split_carriage_returns,
)

# Recorded from the shapes the engine actually writes:
#   omnivoice/training/checkpoint.py:105  -> "Step {n} | k: v | ..."
#   omnivoice/training/trainer.py:244     -> "Eval Loss: {v}"
#   omnivoice/training/trainer.py:213     -> "Resumed from step {n}"
STEP_LINE = (
    "Step 1500 | train/loss: 2.3145 | train/learning_rate: 1.00e-04 | "
    "train/grad_norm: 0.8421 | train/epoch: 2 | train/steps_per_sec: 1.2345"
)


class TestTrainLines:
    def test_a_step_line_yields_the_numbers_that_matter(self):
        line = parse_train_line(STEP_LINE)

        assert line.step_id == "train"
        assert line.global_step == 1500
        assert line.loss == pytest.approx(2.3145)
        assert line.learning_rate == pytest.approx(1e-4)
        assert line.steps_per_second == pytest.approx(1.2345)

    def test_scientific_notation_survives_the_parse(self):
        """The trainer switches to `%.2e` when a value rounds to 0.0000."""
        line = parse_train_line("Step 20 | train/loss: 0.0012 | train/learning_rate: 3.00e-06")

        assert line.learning_rate == pytest.approx(3e-6)

    def test_eval_loss_is_kept_apart_from_train_loss(self):
        """Two curves diverging is the overfit signal; merging them hides it."""
        line = parse_train_line("Eval Loss: 2.9013")

        assert line.dev_loss == pytest.approx(2.9013)
        assert line.loss is None

    def test_a_resume_reports_the_step_it_came_back_at(self):
        line = parse_train_line("Resumed from step 4000")

        assert line.global_step == 4000

    def test_the_trainable_params_line_is_where_lora_is_confirmed(self):
        line = parse_train_line(
            "trainable params: 19,316,736 || all params: 631,894,016 || trainable%: 3.0570"
        )

        assert line.step_id == "load-model"
        assert "3.0570" in line.message

    @pytest.mark.parametrize(
        "noise",
        [
            "",
            "   ",
            "Some warning from a library nobody asked about",
            "Loaded Config: TrainingConfig(steps=5000)",
            "Step but not really",
        ],
    )
    def test_an_unrecognised_line_reports_nothing_rather_than_a_guess(self, noise):
        """A plausible wrong number on the deciding screen is worse than silence."""
        assert parse_train_line(noise) is None


class TestTokenizeLines:
    def test_the_bar_reports_shards_not_a_percentage_of_the_run(self):
        line = parse_tokenize_line(
            "Extracting Audio Tokens:  45%|####      | 450/1000 [02:13<02:42,  3.4it/s]"
        )

        assert line.step_id == "tokenize"
        assert (line.done, line.total) == (450, 1000)

    def test_the_written_manifest_closes_the_step(self):
        line = parse_tokenize_line(
            "Manifest written to: /data/tokens/train/data.lst (32 shards)"
        )

        assert (line.done, line.total) == (32, 32)

    def test_a_bar_belonging_to_something_else_is_ignored(self):
        assert parse_tokenize_line("Downloading model:  10%| | 5/50 [00:01<00:09]") is None

    def test_tokenize_ignores_a_training_line(self):
        assert parse_tokenize_line(STEP_LINE) is None


def test_a_single_read_can_hold_many_redrawn_bar_states():
    """tqdm redraws with \r, so one chunk is not one line."""
    chunk = (
        "Extracting Audio Tokens:  10%| | 100/1000 [\r"
        "Extracting Audio Tokens:  20%| | 200/1000 [\r"
        "Extracting Audio Tokens:  30%| | 300/1000 ["
    )

    parts = split_carriage_returns(chunk)
    lines = [parse_tokenize_line(part) for part in parts]

    assert len(parts) == 3
    assert [line.done for line in lines] == [100, 200, 300]
