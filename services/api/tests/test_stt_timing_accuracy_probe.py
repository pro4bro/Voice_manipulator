import importlib.util
from pathlib import Path

import pytest


path = Path(__file__).resolve().parents[3] / "scripts/profiling/stt_timing_accuracy_probe.py"
spec = importlib.util.spec_from_file_location("timing_probe", path)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def test_expected_words_keep_source_clock_and_unmatched_words_have_no_times():
    native = [{"id": "obs.w0", "text": "xin"}]
    source_words = [{"id": "obs.w0", "text": "xin", "start": 236.08, "end": 236.16}]
    assert probe.expected_native_words(native, source_words, True)[0]["start"] == 236.08
    assert probe.expected_native_words(native, source_words, True)[0]["end"] == 236.16
    assert probe.expected_native_words(native, [], False)[0]["start"] is None


@pytest.mark.parametrize("existing", ["aligned.json", "results.json", "alignment-started.json"])
def test_replay_refuses_retained_or_partial_candidate_before_model_configuration(tmp_path, monkeypatch, existing):
    monkeypatch.setattr(probe, "RUN", tmp_path)
    (tmp_path / existing).write_text("retained evidence", encoding="utf-8")
    monkeypatch.setattr(probe, "configure_offline_cpu", lambda: pytest.fail("Model configuration must not begin"))
    with pytest.raises(FileExistsError):
        probe.align()
    assert (tmp_path / existing).read_text(encoding="utf-8") == "retained evidence"
