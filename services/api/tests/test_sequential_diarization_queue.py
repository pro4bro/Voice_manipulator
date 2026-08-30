from __future__ import annotations

from app.adapters.sequential_diarization_queue import assign_spans_to_words


def test_assigns_stable_diarization_labels_by_word_overlap_without_replacing_profile() -> None:
    words = [
        {"text": "Xin", "start": 0.1, "end": 0.4, "speakerId": "profile-lan"},
        {"text": "chào", "start": 0.4, "end": 0.8},
        {"text": "bạn", "start": 1.1, "end": 1.6},
    ]
    spans = [
        {"speaker": "SPEAKER_01", "start": 1.0, "end": 2.0},
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 0.9},
    ]

    assigned = assign_spans_to_words(words, spans)

    assert [word["diarizationSpeakerId"] for word in assigned] == ["speaker-1", "speaker-1", "speaker-2"]
    assert assigned[0]["speakerId"] == "profile-lan"


def test_word_on_span_boundary_uses_midpoint_and_keeps_unmatched_words() -> None:
    words = [{"text": "Một", "start": 2.0, "end": 2.2}, {"text": "ngoài", "start": 3.0, "end": 3.1}]
    assigned = assign_spans_to_words(words, [{"speaker": "A", "start": 1.5, "end": 2.1}])

    assert assigned[0]["diarizationSpeakerId"] == "speaker-1"
    assert "diarizationSpeakerId" not in assigned[1]

def test_smooths_an_isolated_short_speaker_flip_but_preserves_word_timings() -> None:
    words = [
        {"text": "A", "start": 0.0, "end": 0.2},
        {"text": "lỗi", "start": 0.2, "end": 0.35},
        {"text": "B", "start": 0.35, "end": 0.6},
    ]
    spans = [
        {"speaker": "first", "start": 0.0, "end": 0.2},
        {"speaker": "second", "start": 0.2, "end": 0.35},
        {"speaker": "first", "start": 0.35, "end": 0.6},
    ]

    assigned = assign_spans_to_words(words, spans)

    assert [word["diarizationSpeakerId"] for word in assigned] == ["speaker-1", "speaker-1", "speaker-1"]
    assert [(word["start"], word["end"]) for word in assigned] == [(0.0, 0.2), (0.2, 0.35), (0.35, 0.6)]

def test_api_exposes_diarization_progress_snapshots_for_the_whole_project(tmp_path) -> None:
    """The UI must be able to poll diarization progress without pulling transcripts."""
    import dataclasses

    from fastapi.testclient import TestClient

    from app.adapters.file_media_library import FileMediaLibrary
    from app.adapters.file_project_repository import FileProjectRepository
    from app.domain.models import MediaAssetCreate, ProjectCreate
    from app.main import create_app
    from app.settings import Settings

    settings = dataclasses.replace(Settings.from_env(), data_root=tmp_path / "data")
    projects = FileProjectRepository(settings.data_root / "projects")
    project = projects.create(ProjectCreate(name="Diarization polling"))
    library = FileMediaLibrary(projects)
    library.create(
        project.id,
        MediaAssetCreate(
            name="clip.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/asset-poll/source.wav",
            duration=3,
            origin="import",
        ),
        "asset-poll",
    )
    library.set_diarization_state(project.id, "asset-poll", "processing", progress=0)
    library.set_diarization_progress(project.id, "asset-poll", 37.5)

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        response = client.get(f"/api/projects/{project.id}/media/diarization-status")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "asset-poll",
            "diarizationStatus": "processing",
            "diarizationProgress": 37.5,
            "diarizationError": None,
        }
    ]


def test_a_word_in_a_gap_between_spans_takes_the_neighbouring_speaker() -> None:
    """Words landing between spans came back unlabelled: 39 of 665 on a real sample."""
    words = [
        {"text": "Xin", "start": 1.00, "end": 1.30},
        {"text": "chao", "start": 1.30, "end": 1.55},  # falls in the gap
        {"text": "ban", "start": 1.60, "end": 2.00},
    ]
    spans = [
        {"speaker": "A", "start": 0.90, "end": 1.32},
        {"speaker": "A", "start": 1.58, "end": 2.10},
    ]

    assigned = assign_spans_to_words(words, spans)

    assert [word["diarizationSpeakerId"] for word in assigned] == ["speaker-1"] * 3


def test_a_word_stranded_in_real_silence_is_left_unlabelled() -> None:
    """Inheritance covers boundary artefacts, not guesses across genuine silence."""
    words = [
        {"text": "Mot", "start": 1.0, "end": 1.4},
        {"text": "xa", "start": 4.0, "end": 4.3},
    ]

    assigned = assign_spans_to_words(words, [{"speaker": "A", "start": 0.9, "end": 1.5}])

    assert assigned[0]["diarizationSpeakerId"] == "speaker-1"
    assert "diarizationSpeakerId" not in assigned[1]


def test_a_short_run_wedged_into_continuous_speech_is_not_a_turn() -> None:
    """Alternating speakers leaves a boundary; a mid-sentence flip does not.

    Both flips left on the two-speaker sample were this shape: a 1.07s span wedged
    inside one sentence, and a 0.46s span splitting a two-word phrase. Each ran
    longer than the old 0.7s duration cap, so neither was smoothed.
    """
    words = [
        {"text": "cong", "start": 10.00, "end": 10.40},
        {"text": "ty", "start": 10.40, "end": 10.80},
        {"text": "that", "start": 10.80, "end": 12.10},  # 1.3s, no gap either side
        {"text": "su", "start": 12.10, "end": 12.50},
        {"text": "ma", "start": 12.50, "end": 12.90},
    ]
    spans = [
        {"speaker": "A", "start": 9.80, "end": 10.80},
        {"speaker": "B", "start": 10.80, "end": 12.10},
        {"speaker": "A", "start": 12.10, "end": 13.00},
    ]

    assigned = assign_spans_to_words(words, spans)

    assert [word["diarizationSpeakerId"] for word in assigned] == ["speaker-1"] * 5


def test_a_short_turn_with_silence_around_it_is_preserved() -> None:
    """The counterpart: a real short turn is bounded by silence and must survive."""
    words = [
        {"text": "roi", "start": 10.0, "end": 10.4},
        {"text": "Dung", "start": 11.0, "end": 11.6},  # 0.6s of silence either side
        {"text": "vay", "start": 12.2, "end": 12.6},
    ]
    spans = [
        {"speaker": "A", "start": 9.8, "end": 10.5},
        {"speaker": "B", "start": 10.9, "end": 11.7},
        {"speaker": "A", "start": 12.1, "end": 12.7},
    ]

    assigned = assign_spans_to_words(words, spans)

    assert [word["diarizationSpeakerId"] for word in assigned] == ["speaker-1", "speaker-2", "speaker-1"]
