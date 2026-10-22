import json
import pytest
import runpy
from pathlib import Path
import zipfile

from app.workers.subtitle_mfa_worker import (
    map_word_intervals,
    parse_mfa_json,
    resolve_project_audio,
    sha256_file,
    verify_source_hash,
    write_diagnostic_artifacts,
)

SETUP = runpy.run_path(str(Path(__file__).resolve().parents[3] / "scripts" / "setup-subtitle-mfa.py"))


def test_mfa_json_parser_reads_word_tier_and_ignores_phone_tier():
    aligned = parse_mfa_json({
        "start": 0,
        "end": 2,
        "tiers": {
            "words": {"type": "interval", "entries": [[0.2, 0.7, "xin"], [0.8, 1.4, "chào"]]},
            "phones": {"type": "interval", "entries": [[0.2, 0.3, "s"]]},
        },
    })
    assert aligned == [(0.2, 0.7, "xin"), (0.8, 1.4, "chào")]


def test_mfa_json_parser_ignores_only_explicit_eps_gap_intervals():
    aligned = parse_mfa_json({
        "tiers": {"words": {"entries": [[0.0, 0.2, "xin"], [0.2, 0.4, "<eps>"],
                                                [0.4, 0.8, "chào"]]}}
    })
    assert aligned == [(0.0, 0.2, "xin"), (0.4, 0.8, "chào")]


def test_mapping_preserves_original_text_and_indices_on_exact_alignment():
    words = [{"text": "Xin,"}, {"text": "chào!"}]
    mapped, diagnostics = map_word_intervals(words, [(0.1, 0.5, "xin"), (0.6, 1.0, "chào")])
    assert [row["text"] for row in mapped] == ["Xin,", "chào!"]
    assert [(row["start"], row["end"]) for row in mapped] == [(0.1, 0.5), (0.6, 1.0)]
    assert diagnostics == []


def test_mapping_fails_closed_without_shifting_indices_after_token_mismatch():
    words = [{"text": "một"}, {"text": "hai"}, {"text": "ba"}]
    mapped, diagnostics = map_word_intervals(words, [(0.1, 0.3, "một"), (0.4, 0.6, "ba")])
    assert [row["start"] for row in mapped] == [None, None, None]
    assert [row["end"] for row in mapped] == [None, None, None]
    assert diagnostics[0]["status"] == "token-mismatch"
    assert diagnostics[0]["unmatchedOriginalIndexes"] == [1, 2]


def test_unknown_spoken_marker_is_not_treated_as_a_gap_or_mapped():
    words = [{"text": "xin"}, {"text": "chào"}]
    mapped, diagnostics = map_word_intervals(words, [(0.0, 0.2, "xin"), (0.3, 0.5, "<unk>")])
    assert [row["start"] for row in mapped] == [None, None]
    assert diagnostics[0]["status"] == "token-mismatch"


def test_bad_intervals_are_rejected_and_audio_cannot_escape_project(tmp_path):
    with pytest.raises(ValueError, match="interval"):
        parse_mfa_json({"tiers": {"words": {"entries": [[0.4, 0.2, "bad"]]}}})
    project = tmp_path / "project"
    project.mkdir()
    outside = tmp_path / "outside.wav"
    outside.write_bytes(b"audio")
    with pytest.raises(ValueError, match="escapes project"):
        resolve_project_audio(project, "../outside.wav")


def test_setup_accepts_only_complete_manifest_owned_runtime_on_rerun(tmp_path):
    runtime = tmp_path / "mfa"
    runtime.mkdir()
    (runtime / "unexpected.bin").write_bytes(b"preserve")
    with pytest.raises(SETUP["SetupError"], match="unowned"):
        SETUP["inspect_owned_runtime"](runtime)
    (runtime / "unexpected.bin").unlink()

    models = {}
    for language in ("vi", "en"):
        model_dir = runtime / "models" / language
        model_dir.mkdir(parents=True)
        acoustic = model_dir / "acoustic.zip"
        dictionary = model_dir / "dictionary.dict"
        acoustic.write_bytes((language + "-acoustic").encode())
        dictionary.write_bytes((language + "-dictionary").encode())
        models[language] = {"acousticSha256": SETUP["sha256_file"](acoustic),
                            "dictionarySha256": SETUP["sha256_file"](dictionary)}
    (runtime / "manifest.json").write_text(
        json.dumps({"schema": 1, "engine": "mfa", "platform": "win-64", "models": models}),
        encoding="utf-8")
    SETUP["inspect_owned_runtime"](runtime)

    (runtime / "models" / "vi" / "dictionary.dict").write_bytes(b"changed")
    with pytest.raises(SETUP["SetupError"], match="ownership receipt"):
        SETUP["inspect_owned_runtime"](runtime)


def test_setup_plan_records_pinned_cpu_and_ffmpeg_license_profile(tmp_path):
    plan = SETUP["plan"](tmp_path)
    assert SETUP["MICROMAMBA_VERSION"] == "2.9.0-0"
    assert len(SETUP["MICROMAMBA_SHA256"]) == 64
    assert plan["mfaVersion"] == "3.4.3"
    assert plan["pytorchCpuVersion"] == "2.14.1"
    assert plan["ffmpegBuild"].startswith("lgpl_")


def _write_fake_conda_profile(runtime, *, kaldi_build="cpu_fake_0",
                              ffmpeg_build="lgpl_h468c918_611",
                              ffmpeg_license="LGPL-2.1-or-later"):
    metadata = runtime / "conda-meta"
    metadata.mkdir(parents=True, exist_ok=True)
    records = [
        {"name": "montreal-forced-aligner", "version": "3.4.3", "build": "py_fake_0", "license": "MIT"},
        {"name": "pytorch-cpu", "version": "2.14.1", "build": "cpu_fake_0", "license": "BSD-3-Clause"},
        {"name": "kaldi", "version": "5.5.1172", "build": kaldi_build, "license": "Apache-2.0"},
        {"name": "ffmpeg", "version": "7.1.1", "build": ffmpeg_build, "license": ffmpeg_license},
    ]
    for record in records:
        filename = f"{record['name']}-{record['version']}-{record['build']}.json"
        (metadata / filename).write_text(json.dumps(record), encoding="utf-8")


def test_setup_accepts_exact_installed_cpu_conda_profile(tmp_path):
    _write_fake_conda_profile(tmp_path)
    profile = SETUP["validate_conda_profile"](tmp_path)
    assert profile["kaldi"]["build"].startswith("cpu")
    assert profile["ffmpeg"]["build"] == "lgpl_h468c918_611"
    assert SETUP["package_license"](profile, "ffmpeg") == "LGPL-2.1-or-later"


@pytest.mark.parametrize(
    ("kaldi_build", "ffmpeg_build", "ffmpeg_license", "message"),
    [
        ("cuda129_fake_0", "lgpl_h468c918_611", "LGPL-2.1-or-later", "CPU Kaldi"),
        ("cpu_fake_0", "gpl_he3062b8_911", "GPL-3.0-or-later", "Unsupported ffmpeg build"),
        ("cpu_fake_0", "lgpl_h468c918_611", "GPL-3.0-or-later", "LGPL FFmpeg"),
    ],
)
def test_setup_rejects_gpu_kaldi_or_gpl_ffmpeg_profile(
    tmp_path, kaldi_build, ffmpeg_build, ffmpeg_license, message
):
    _write_fake_conda_profile(tmp_path, kaldi_build=kaldi_build,
                              ffmpeg_build=ffmpeg_build, ffmpeg_license=ffmpeg_license)
    with pytest.raises(SETUP["SetupError"], match=message):
        SETUP["validate_conda_profile"](tmp_path)


def test_runtime_identity_hashes_required_small_entrypoints_and_packages(tmp_path):
    runtime = tmp_path / "mfa"
    files = [
        "python.exe", "Scripts/mfa.exe",
        "Lib/site-packages/montreal_forced_aligner/__init__.py",
        "Lib/site-packages/montreal_forced_aligner/command_line/align.py",
        "Lib/site-packages/kalpy/__init__.py",
        "Lib/site-packages/_kalpy.cp311-win_amd64.pyd",
        "Lib/site-packages/montreal_forced_aligner-3.4.3.dist-info/METADATA",
        "Lib/site-packages/kalpy_kaldi-0.10.5.dist-info/METADATA",
    ]
    for relative in files:
        path = runtime / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(relative, encoding="utf-8")
    result = SETUP["runtime_file_hashes"](runtime)
    assert "Scripts/mfa.exe" in result
    assert "Lib/site-packages/kalpy/__init__.py" in result
    assert any(name.endswith("montreal_forced_aligner-3.4.3.dist-info/METADATA") for name in result)


def test_setup_rejects_truncated_or_corrupt_model_assets(tmp_path):
    archive = tmp_path / "acoustic.zip"
    with zipfile.ZipFile(archive, "w") as handle:
        handle.writestr("model/final.mdl", b"model")
    digest = SETUP["verify_model_file"](archive, archive.stat().st_size, zip_archive=True)
    assert len(digest) == 64
    with pytest.raises(SETUP["SetupError"], match="length"):
        SETUP["verify_model_file"](archive, archive.stat().st_size + 1, zip_archive=True)
    archive.write_bytes(b"not a zip")
    with pytest.raises(SETUP["SetupError"], match="ZIP"):
        SETUP["verify_model_file"](archive, archive.stat().st_size, zip_archive=True)


def test_mfa_raw_output_and_logs_are_retained_as_job_diagnostics(tmp_path):
    raw = tmp_path / "temporary-mfa.json"
    raw.write_text('{"raw":true}', encoding="utf-8")
    output = tmp_path / "jobs" / "job-1" / "result.json"
    write_diagnostic_artifacts(output, raw, "mfa stdout", "mfa stderr")
    assert (output.parent / "mfa-raw.json").read_text(encoding="utf-8") == '{"raw":true}'
    process_log = (output.parent / "mfa-process.txt").read_text(encoding="utf-8")
    assert "mfa stdout" in process_log
    assert "mfa stderr" in process_log
    with pytest.raises(FileExistsError):
        write_diagnostic_artifacts(output, raw, "", "")


def test_worker_rechecks_source_hash_after_inference(tmp_path):
    source = tmp_path / "source.wav"
    source.write_bytes(b"original")
    expected = sha256_file(source)
    verify_source_hash(source, expected)
    source.write_bytes(b"changed")
    with pytest.raises(ValueError, match="changed during alignment"):
        verify_source_hash(source, expected)
