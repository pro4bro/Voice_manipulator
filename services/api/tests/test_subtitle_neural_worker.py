import hashlib
import wave

import pytest

from app.workers.subtitle_neural_worker import (
    lexical_token,
    make_groups,
    map_exact_group,
    configure_alignment_heads,
    read_pcm16_mono,
    resolve_project_audio,
    run_window,
    run_worker,
    split_supported_runs,
    alignment_token,
    validate_indexes,
)


def test_groups_keep_lexical_context_within_window_and_split_invalid_or_distant_words():
    words = [
        {"text": "one", "start": 0.5, "end": 0.8},
        {"text": "two", "start": 4, "end": 4.2},
        {"text": "bad", "start": None, "end": None},
        {"text": "three", "start": 6, "end": 6.3},
        {"text": "four", "start": 29, "end": 29.5},
    ]
    assert make_groups(words, 30, window_seconds=20, padding_seconds=0.5) == [
        {"indexes": [0, 1], "start": 0.0, "end": 4.7},
        {"indexes": [3], "start": 5.5, "end": 6.8},
        {"indexes": [4], "start": 28.5, "end": 30},
    ]


def test_vocabulary_unknowns_split_runs_without_reindexing_following_words():
    words = [{"text": "Xin,"}, {"text": "☃"}, {"text": "chào!"}, {"text": "world"}]
    runs, unknown = split_supported_runs([0, 1, 2, 3], words, set("xinchàoworld"))
    assert runs == [[0], [2, 3]]
    assert unknown == [1]
    assert [lexical_token(words[index]["text"]) for run in runs for index in run] == ["xin", "chào", "world"]


def test_uppercase_english_vocab_maps_lowercase_transcript_to_model_case():
    words = [{"text": "Hello,"}, {"text": "WORLD!"}]
    runs, unknown = split_supported_runs([0, 1], words, set("ABCDEFGHIJKLMNOPQRSTUVWXYZ|"))
    assert runs == [[0, 1]]
    assert unknown == []
    assert [alignment_token(words[i]["text"], "upper") for i in runs[0]] == ["HELLO", "WORLD"]


def test_unsupported_middle_word_creates_run_local_windows():
    words = [
        {"text": "one", "start": 1.0, "end": 1.3},
        {"text": "☃", "start": 8.0, "end": 8.4},
        {"text": "three", "start": 15.0, "end": 15.5},
    ]
    group = {"indexes": [0, 1, 2], "start": 0.5, "end": 16.0}
    assert run_window(group, [0], words, 0.5) == (0.5, 1.8)
    assert run_window(group, [2], words, 0.5) == (14.5, 16.0)


def test_local_stable_model_configures_official_alignment_heads():
    class Model:
        configured = None

        def set_alignment_heads(self, heads):
            self.configured = heads

    model = Model()
    expected = object()
    configure_alignment_heads(model, "base", {"base": expected})
    assert model.configured is expected
    with pytest.raises(RuntimeError, match="alignment heads"):
        configure_alignment_heads(Model(), "base", {})


def test_exact_mapping_preserves_source_spelling_and_rejects_mismatch_or_wrong_count():
    words = [{"text": "Xin,"}, {"text": "chào!"}]
    rows, status = map_exact_group(words, [0, 1], [
        {"text": "xin", "start": 0.1, "end": 0.3, "score": None},
        {"text": "chào", "start": 0.4, "end": 0.7, "score": 0.82},
    ])
    assert status == "aligned"
    assert [words[index]["text"] for index in [0, 1]] == ["Xin,", "chào!"]
    assert rows == [{"start": 0.1, "end": 0.3, "score": None}, {"start": 0.4, "end": 0.7, "score": 0.82}]
    assert map_exact_group(words, [0, 1], [{"text": "xin", "start": 0, "end": 0.2}])[1] == "word-count-mismatch"
    assert map_exact_group(words, [0, 1], [
        {"text": "xin", "start": 0, "end": 0.2}, {"text": "world", "start": 0.3, "end": 0.5},
    ]) == (None, "token-mismatch")


def test_indexes_are_validated_and_duplicate_indexes_rejected():
    assert validate_indexes(None, 3) is None
    assert validate_indexes([2, 0], 3) == [2, 0]
    with pytest.raises(ValueError, match="indexes"):
        validate_indexes([0, 0], 3)
    with pytest.raises(ValueError, match="indexes"):
        validate_indexes([True], 3)


def test_project_audio_path_and_hash_are_fenced_before_model_loading(tmp_path):
    project = tmp_path / "project"
    runtime = tmp_path / "runtime"
    project.mkdir()
    runtime.mkdir()
    audio = project / "analysis.wav"
    audio.write_bytes(b"immutable source bytes")
    assert resolve_project_audio(project, "analysis.wav") == audio.resolve()
    with pytest.raises(ValueError, match="escapes project"):
        resolve_project_audio(project, "../outside.wav")
    payload = {"engineId": "stable-ts", "settings": {"model": "base", "language": "en"},
               "audioPath": "analysis.wav", "audioSha256": "0" * 64,
               "words": [{"text": "hello", "start": 0, "end": 0.5}]}
    with pytest.raises(ValueError, match="Audio changed"):
        run_worker(payload, project, runtime)


def test_worker_rejects_bad_count_and_settings_before_model_loading(tmp_path):
    project = tmp_path / "project"
    runtime = tmp_path / "runtime"
    project.mkdir()
    runtime.mkdir()
    audio = project / "analysis.wav"
    audio.write_bytes(b"input")
    base = {"engineId": "stable-ts", "settings": {"model": "../../outside", "language": "en"},
            "audioPath": "analysis.wav", "audioSha256": hashlib.sha256(b"input").hexdigest(),
            "words": [{"text": "hello", "start": 0, "end": 0.5}]}
    with pytest.raises(ValueError, match="stable-ts settings"):
        run_worker(base, project, runtime)
    with pytest.raises(ValueError, match="word indexes"):
        run_worker({**base, "settings": {"model": "base", "language": "en"}, "indexes": [4]}, project, runtime)


def test_reads_pcm16_mono_wav_without_modifying_source(tmp_path):
    audio = tmp_path / "audio.wav"
    with wave.open(str(audio), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(16000)
        target.writeframes(b"\0\0" * 16000)
    original_hash = hashlib.sha256(audio.read_bytes()).hexdigest()
    samples, duration, source_rate = read_pcm16_mono(audio)
    assert len(samples) == 16000
    assert duration == 1.0
    assert source_rate == 16000
    assert hashlib.sha256(audio.read_bytes()).hexdigest() == original_hash
