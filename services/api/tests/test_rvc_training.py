from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path


from app.adapters.rvc_training import RvcPaths, finished_model, link_experiment, rvc_commands, rvc_line_parser, unlink_experiment
from app.adapters.rvc_training import SITE_DIR
from app.adapters.training_runner import SUPPORTED_MODES


def applio_tree(root: Path) -> RvcPaths:
    for relative in ("rvc/train/train.py", "rvc/models/pretraineds/hifi-gan/f0G40k.pth", "rvc/models/pretraineds/hifi-gan/f0D40k.pth",
                     "rvc/models/predictors/rmvpe.pt", "rvc/models/embedders/contentvec/pytorch_model.bin"):
        (root / "Applio" / relative).parent.mkdir(parents=True, exist_ok=True)
        (root / "Applio" / relative).write_bytes(b"x")
    (root / "Applio" / "assets").mkdir(parents=True, exist_ok=True)
    (root / "Applio" / "assets" / "config_template.json").write_text('{"discord_presence": true, "precision": "fp16"}', encoding="utf-8")
    python = root / "runtime" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    python.parent.mkdir(parents=True)
    python.write_bytes(b"")
    return RvcPaths(root / "Applio", root / "runtime")


def test_epoch_lines_become_progress_with_a_step_count_learned_from_the_first_epoch():
    parse = rvc_line_parser(total_epoch=100)

    line = parse("pro4bro-run-1 | epoch=2 | step=188 | time=12:51:42 | training_speed=0:01:10 | lowest_value=20.719 (epoch 2 and step 155)")

    assert line.step_id == "train" and line.global_step == 188 and line.total == 9400 and line.loss == 20.719
    assert line.message == "Epoch 2/100 · generator loss thấp nhất 20.719"
    assert parse("Pitch extraction completed in 60.35 seconds.").step_id == "tokenize"
    assert parse(" 45%|████▌     | 45/100 [00:01<00:01]") is None


def test_the_commands_follow_applio_s_argument_order(tmp_path):
    paths = applio_tree(tmp_path)

    steps = rvc_commands(paths, "pro4bro-run-1", tmp_path / "dataset", {"total_epoch": 150, "batch_size": 6, "cpu_cores": 4})

    assert [step for step, _ in steps] == ["tokenize", "tokenize", "train", "checkpoint"]
    preprocess, extract, train, index = (command for _, command in steps)
    assert preprocess[1:5] == ["rvc/train/preprocess/preprocess.py", "logs/pro4bro-run-1", str(tmp_path / "dataset"), "40000"]
    assert extract[2:8] == ["logs/pro4bro-run-1", "rmvpe", "4", "0", "40000", "contentvec"]
    assert train[2:5] == ["pro4bro-run-1", "25", "150"] and train[8:10] == ["6", "40000"]
    assert index[1:] == ["rvc/train/process/extract_index.py", "logs/pro4bro-run-1", "Auto"]
    assert paths.environment()["PRO4BRO_RVC_SINGLE_GPU_GROUP"] == "1"


def test_readiness_names_what_is_missing_and_the_config_is_seeded_once(tmp_path):
    paths = applio_tree(tmp_path)
    assert paths.missing() == []
    (paths.applio / "rvc/models/predictors/rmvpe.pt").unlink()
    assert paths.missing() == ["rvc/models/predictors/rmvpe.pt"]

    paths.ensure_config()
    config = paths.applio / "assets" / "config.json"
    assert '"discord_presence": false' in config.read_text(encoding="utf-8")
    config.write_text("{}", encoding="utf-8")
    paths.ensure_config()
    assert config.read_text(encoding="utf-8") == "{}"


def test_the_experiment_folder_is_a_link_into_the_run_and_only_the_link_is_removed(tmp_path):
    paths = applio_tree(tmp_path)
    target = tmp_path / "project" / "jobs" / "run-1" / "rvc"

    link = link_experiment(paths, "pro4bro-run-1", target)
    (link / "written-by-trainer.txt").write_text("ok", encoding="utf-8")
    unlink_experiment(link)

    assert not link.exists()
    assert (target / "written-by-trainer.txt").read_text(encoding="utf-8") == "ok"


def test_the_published_model_is_the_newest_weight_file_not_the_resumable_state(tmp_path):
    for name in ("G_2333333.pth", "D_2333333.pth", "run_25e_2350s.pth", "added_IVF.index"):
        (tmp_path / name).write_bytes(b"x")
        time.sleep(0.01)
    (tmp_path / "run_50e_4700s.pth").write_bytes(b"x")

    model, index = finished_model(tmp_path)

    assert model.name == "run_50e_4700s.pth" and index.name == "added_IVF.index"


def test_rvc_training_is_a_supported_runner_mode():
    assert SUPPORTED_MODES["rvc"] == {"vc-train"}


def test_portable_runtime_registers_startup_patch_for_spawned_workers(tmp_path, monkeypatch):
    site = tmp_path / "services" / "api" / "app" / "workers" / "rvc_site"
    monkeypatch.setattr("app.adapters.rvc_training.SITE_DIR", site)
    paths = applio_tree(tmp_path)
    path_file = paths.runtime / "python311._pth"
    original = "python311.zip\n.\nsite-packages\nimport site\n"
    path_file.write_text(original, encoding="utf-8")
    paths.ensure_bootstrap()
    entries = path_file.read_text(encoding="utf-8").splitlines()
    assert sum((paths.runtime / entry).resolve() == site.resolve() for entry in entries if not entry.startswith("import ")) == 1
    assert any((paths.runtime / entry).resolve() == (paths.applio / "rvc" / "train").resolve() for entry in entries)
    assert "import site" in entries
    assert not any(Path(entry).is_absolute() for entry in entries)
    assert all(line in entries for line in original.splitlines())
    stamp = path_file.stat().st_mtime_ns
    paths.ensure_bootstrap()
    assert path_file.stat().st_mtime_ns == stamp


def test_standard_virtualenv_bootstrap_keeps_using_pythonpath_without_creating_pth(tmp_path):
    paths = applio_tree(tmp_path)
    paths.ensure_bootstrap()
    assert not list(paths.runtime.glob("*._pth"))


def test_runtime_bootstrap_enables_site_when_portable_distribution_left_it_commented(tmp_path, monkeypatch):
    monkeypatch.setattr("app.adapters.rvc_training.SITE_DIR", tmp_path / "rvc_site")
    paths = applio_tree(tmp_path)
    path_file = paths.runtime / "python311._pth"
    path_file.write_text("python311.zip\n.\n# import site\n", encoding="utf-8")
    paths.ensure_bootstrap()
    assert "import site" in path_file.read_text(encoding="utf-8").splitlines()


def test_spawned_isolated_worker_flushes_epoch_output_before_applio_hard_exit():
    command = [sys.executable, "-I", "-c", "import os,runpy; "
               f"runpy.run_path({str(SITE_DIR / 'sitecustomize.py')!r}); "
               "print('experiment | epoch=1 | step=8 | done'); os._exit(0)"]
    result = subprocess.run(command, env={**os.environ, "PRO4BRO_RVC_SINGLE_GPU_GROUP": "1"},
                            capture_output=True, text=True, encoding="utf-8", timeout=15)
    assert result.returncode == 0
    assert "epoch=1 | step=8" in result.stdout
