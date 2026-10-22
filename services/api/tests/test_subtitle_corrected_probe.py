from __future__ import annotations

import sys
import hashlib
from pathlib import Path
import subprocess
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.profiling import subtitle_corrected_alignment_probe as probe


def test_reference_text_metadata_never_changes_crop_assignment():
    seeds = [
        {"text": "xin", "start": .5, "end": 1, "timingSource": "faster-whisper-dtw"},
        {"text": "chào", "start": 1, "end": 2},
        {"text": "bạn", "start": 3.5, "end": 4},
        {"text": "nhé", "start": 4, "end": 5},
    ]
    reference = [{"text": "xin", "start": 999, "end": 1000},
                 {"text": "chào", "start": -10, "end": -9},
                 {"text": "bạn", "start": 5, "end": 6},
                 {"text": "nhé", "start": 0, "end": 0}]
    first_groups = probe._fixed_seed_groups(seeds, 6, "stable-ts", {"windowSeconds": 2,
                                                                         "paddingSeconds": .5})
    first = probe.assign_corrected_words(reference, seeds, first_groups)
    changed_reference = [{**word, "start": index * 123.0, "end": index * -88.0}
                         for index, word in enumerate(reference)]
    changed_seed_metadata = [{**word, "reviewState": "manual", "timingSource": "manual",
                              "sourceTiming": {"start": -900, "end": 900}}
                             for word in seeds]
    second_groups = probe._fixed_seed_groups(changed_seed_metadata, 6, "stable-ts", {
        "windowSeconds": 2, "paddingSeconds": .5})
    second = probe.assign_corrected_words(changed_reference, changed_seed_metadata, second_groups)
    assert first_groups == second_groups
    assert first == second
    assert first[0]["indexes"] == [0, 1]
    assert first[1]["indexes"] == [2, 3]


def test_repeated_ambiguous_words_do_not_steal_anchor_and_gap_uses_group_midpoint():
    seeds = [{"text": "xin", "start": 0, "end": .5},
             {"text": "đi", "start": 2, "end": 2.5},
             {"text": "đi", "start": 4, "end": 4.5},
             {"text": "đi", "start": 5, "end": 5.5},
             {"text": "cuối", "start": 6, "end": 6.5}]
    groups = [
        {"indexes": [0], "start": 0, "end": 1, "seedStart": 0, "seedEnd": .5},
        {"indexes": [1], "start": 1.5, "end": 3, "seedStart": 2, "seedEnd": 2.5},
        {"indexes": [2], "start": 3.5, "end": 5, "seedStart": 4, "seedEnd": 4.5},
        {"indexes": [3], "start": 4.5, "end": 6, "seedStart": 5, "seedEnd": 5.5},
        {"indexes": [4], "start": 5.5, "end": 7, "seedStart": 6, "seedEnd": 6.5},
    ]
    reference = ["xin", "đi", "thêm", "cuối"]
    assigned = probe.assign_corrected_words(reference, seeds, groups)
    mapping = [item for group in assigned for item in group["indexes"]]
    assert mapping == [0, 1, 2, 3]
    assert assigned[0]["indexes"] == [0]
    # The corrected single `đi` has three possible source partners, so it is
    # not used as an anchor. The run uses the midpoint of groups 0 and 4.
    assert assigned[1]["indexes"] == [1, 2]
    assert assigned[1]["sourceSeedIndexes"] == [2]
    assert assigned[1]["mappingRule"]["unanchoredIndexes"] == [1, 2]
    assert assigned[2]["indexes"] == [3]


def test_no_unique_lexical_anchor_abstains():
    seeds = [{"text": "đi", "start": 0, "end": .5}, {"text": "đi", "start": 1, "end": 1.5},
             {"text": "đi", "start": 2, "end": 2.5}]
    groups = [{"indexes": [0, 1, 2], "start": 0, "end": 3, "seedStart": 0, "seedEnd": 2.5}]
    try:
        probe.assign_corrected_words(["đi", "đi"], seeds, groups)
    except ValueError as error:
        assert "No unique lexical anchors" in str(error)
    else:
        raise AssertionError("unanchored corrected transcript must not fabricate placements")


def test_easyaligner_seed_bounds_reproduce_fixed_padded_crop():
    group = {"indexes": [4, 5], "start": 9.5, "end": 15.0,
             "seedStart": 10.0, "seedEnd": 14.5}
    words = [{"text": "first"}, {"text": "last"}]
    probe.set_easyaligner_crop_context(words, [0, 1], group, padding_seconds=.5)
    assert probe.run_window(group, [0, 1], words, padding_seconds=.5) == (9.5, 15.0)
    assert words == [{"text": "first", "start": 10.0, "end": 14.5},
                     {"text": "last", "start": 10.0, "end": 14.5}]


def test_probe_passes_only_assigned_corrected_indexes_and_persists_measured_output(tmp_path, monkeypatch):
    project = tmp_path / "project"
    project.mkdir()
    audio = project / "audio.wav"
    audio.write_bytes(b"frozen-source-audio")
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    (runtime / "neural").mkdir()
    payload = {
        "engineId": "stable-ts", "audioPath": "audio.wav",
        "audioSha256": hashlib.sha256(audio.read_bytes()).hexdigest(),
        "correctedWords": ["xin", "extra", "a", "last"],
        "seedWords": [{"text": "xin", "start": .5, "end": .9},
                      {"text": "a", "start": 1, "end": 1.4},
                      {"text": "gap", "start": 8, "end": 8.5},
                      {"text": "last", "start": 9, "end": 9.5}],
        "settings": {"language": "vi", "windowSeconds": 3, "paddingSeconds": .5},
    }
    samples = np.zeros(100, dtype=np.float32)
    monkeypatch.setattr(probe, "read_pcm16_mono", lambda _path: (samples, 12.0, 24000))
    captured = {}

    def align(worker_payload, _samples, groups, _runtime):
        captured["payload"] = worker_payload
        captured["groups"] = groups
        captured["runtime"] = _runtime
        words = [{"text": word["text"], "start": .1 + index, "end": .2 + index, "score": .9}
                 for index, word in enumerate(worker_payload["words"])]
        return words, [{"status": "aligned"}], "base"

    monkeypatch.setattr(probe, "_stable_align", align)
    monkeypatch.setattr(probe, "_version", lambda name: f"test-{name}")
    output_path = tmp_path / "result.json"
    result = probe.run_probe(payload, output_path, project, runtime)
    assert captured["payload"]["words"] == [
        {"text": "xin", "start": None, "end": None, "score": None},
        {"text": "extra", "start": None, "end": None, "score": None},
        {"text": "a", "start": None, "end": None, "score": None},
        {"text": "last", "start": None, "end": None, "score": None},
    ]
    assert [group["indexes"] for group in captured["groups"]] == [[0, 1, 2], [3]]
    assert result["derivedCropManifest"][0]["cropProvenance"] == "frozen STT seed times only"
    assert result["words"][1]["start"] == 1.1  # returned as mock measured evidence
    assert captured["runtime"] == runtime.resolve()
    assert result["versions"]["stable-ts"] == "test-stable-ts"
    assert result["workerResult"]["audio"]["alignmentPcmSha256"] == hashlib.sha256(
        samples.astype("<f4", copy=False).tobytes()).hexdigest()
    assert output_path.is_file()

    timed_reference = [{"text": word, "start": 10_000 + index, "end": -10_000 - index}
                       for index, word in enumerate(payload["correctedWords"])]
    metadata_payload = {**payload, "correctedWords": timed_reference}
    metadata_result = probe.run_probe(metadata_payload, tmp_path / "result-with-reference-metadata.json",
                                      project, runtime)
    assert metadata_result["derivedCropManifest"] == result["derivedCropManifest"]
    assert metadata_result["inputSha256"] == result["inputSha256"]


def test_probe_abstains_without_artifact_when_unique_anchors_are_absent(tmp_path, monkeypatch):
    project = tmp_path / "project"
    project.mkdir()
    audio = project / "audio.wav"
    audio.write_bytes(b"frozen-source-audio")
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    payload = {
        "engineId": "stable-ts", "audioPath": "audio.wav",
        "audioSha256": hashlib.sha256(audio.read_bytes()).hexdigest(),
        "correctedWords": ["x", "x"],
        "seedWords": [{"text": "x", "start": 0, "end": .2},
                      {"text": "x", "start": 1, "end": 1.2},
                      {"text": "x", "start": 2, "end": 2.2}],
        "settings": {"language": "vi", "windowSeconds": 20},
    }
    monkeypatch.setattr(probe, "read_pcm16_mono", lambda _path: ([0.0] * 100, 3.0, 24000))
    monkeypatch.setattr(probe, "_stable_align", lambda *_: (_ for _ in ()).throw(AssertionError("must not infer")))
    output_path = tmp_path / "result.json"
    try:
        probe.run_probe(payload, output_path, project, runtime)
    except ValueError as error:
        assert "No unique lexical anchors" in str(error)
    else:
        raise AssertionError("probe must abstain without lexical anchors")
    assert not output_path.exists()


def test_direct_script_entrypoint_imports_repo_helpers_outside_repository_cwd(tmp_path):
    script = ROOT / "scripts" / "profiling" / "subtitle_corrected_alignment_probe.py"
    process = subprocess.run([sys.executable, str(script)], cwd=tmp_path, capture_output=True,
                             text=True, encoding="utf-8", errors="replace", check=False)
    assert process.returncode != 0
    assert "Research-only corrected-text alignment" in process.stderr
    assert "ModuleNotFoundError" not in process.stderr


def test_mfa_subprocess_has_timeout_and_retains_timeout_diagnostics(tmp_path, monkeypatch):
    runtime = tmp_path / "runtime"
    mfa = runtime / "mfa"
    mfa.mkdir(parents=True)
    python = mfa / "python.exe"
    python.write_bytes(b"stub")
    output_path = tmp_path / "result.json"
    project = tmp_path / "project"
    project.mkdir()
    seen = {}

    def timeout_run(_command, **kwargs):
        seen["timeout"] = kwargs["timeout"]
        raise subprocess.TimeoutExpired(_command, kwargs["timeout"], output=b"partial out",
                                        stderr=b"partial err")

    monkeypatch.setattr(probe.subprocess, "run", timeout_run)
    try:
        probe._run_mfa({"words": [{"text": "xin"}]}, output_path, project, runtime)
    except TimeoutError as error:
        assert "1800 seconds" in str(error)
    else:
        raise AssertionError("MFA subprocess timeout must fail closed")
    assert seen["timeout"] == 1800
    diagnostic = (tmp_path / "result.mfa-worker-process.txt").read_text(encoding="utf-8")
    assert "partial out" in diagnostic and "partial err" in diagnostic


@pytest.mark.parametrize("bad_end", [1.1, float("inf")])
def test_measured_result_rejects_nonfinite_or_beyond_source_duration(tmp_path, monkeypatch, bad_end):
    project = tmp_path / "project"
    project.mkdir()
    audio = project / "audio.wav"
    audio.write_bytes(b"frozen-source-audio")
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    payload = {
        "engineId": "stable-ts", "audioPath": "audio.wav",
        "audioSha256": hashlib.sha256(audio.read_bytes()).hexdigest(),
        "correctedWords": ["xin"],
        "seedWords": [{"text": "xin", "start": .5, "end": .9}],
        "settings": {"language": "vi", "windowSeconds": 20},
    }
    samples = np.zeros(100, dtype=np.float32)
    monkeypatch.setattr(probe, "read_pcm16_mono", lambda _path: (samples, 1.0, 24000))
    monkeypatch.setattr(probe, "_stable_align", lambda *_: (
        [{"text": "xin", "start": .1, "end": bad_end, "score": .9}], [], "base"))
    try:
        probe.run_probe(payload, tmp_path / "bad-result.json", project, runtime)
    except RuntimeError as error:
        assert "invalid measured coordinates" in str(error)
    else:
        raise AssertionError("out-of-source alignment coordinates must be rejected")
    assert not (tmp_path / "bad-result.json").exists()
