from __future__ import annotations

from app.adapters.file_app_preferences import FileAppPreferences
from app.domain.models import AIReviewPreferences, AppPreferences


def test_preferences_keep_api_key_machine_local_and_hide_it_from_the_api_shape(tmp_path):
    preferences = FileAppPreferences(tmp_path / "runtime")
    public = preferences.save(
        AppPreferences(
            ai_review=AIReviewPreferences(
                enabled=True,
                base_url="https://example.test/v1",
                model="review-model",
                api_key="secret-key",
            )
        )
    )

    assert public.ai_review.api_key is None
    assert public.ai_review.api_key_configured is True
    assert "secret-key" in (tmp_path / "runtime" / "preferences.json").read_text(encoding="utf-8")

    preserved = preferences.save(
        AppPreferences(
            ai_review=AIReviewPreferences(
                enabled=True,
                base_url="https://example.test/v1",
                model="review-model",
                api_key=None,
            )
        )
    )
    assert preserved.ai_review.api_key_configured is True


def test_preferences_keep_huggingface_token_local_and_hide_it_from_api_shape(tmp_path):
    from app.domain.models import DiarizationPreferences

    preferences = FileAppPreferences(tmp_path / "runtime")
    public = preferences.save(
        AppPreferences(diarization=DiarizationPreferences(huggingface_token="hf-secret"))
    )

    assert public.diarization.huggingface_token is None
    assert public.diarization.huggingface_token_configured is True
    assert "hf-secret" in (tmp_path / "runtime" / "preferences.json").read_text(encoding="utf-8")


def test_preferences_persist_the_selected_speaker_embedder(tmp_path):
    from app.domain.models import SpeakerSimilarityPreferences

    preferences = FileAppPreferences(tmp_path / "runtime")
    preferences.save(AppPreferences(
        speaker_similarity=SpeakerSimilarityPreferences(embedder_id="wespeaker-resnet34-lm")
    ))

    assert preferences.get().speaker_similarity.embedder_id == "wespeaker-resnet34-lm"


def test_timeline_preferences_default_to_persistent_clipping_highlights_and_roundtrip(tmp_path):
    from app.domain.models import TimelinePreferences

    preferences = FileAppPreferences(tmp_path / "runtime")
    assert preferences.get().timeline.clipping_highlight_auto_hide is False

    saved = preferences.save(AppPreferences(
        timeline=TimelinePreferences(clipping_highlight_auto_hide=True),
    ))
    assert saved.timeline.clipping_highlight_auto_hide is True
    assert preferences.get().timeline.clipping_highlight_auto_hide is True


def test_saving_preferences_preserves_unrecognized_existing_fields_and_secrets(tmp_path):
    import json

    preferences = FileAppPreferences(tmp_path / "runtime")
    preferences.path.parent.mkdir(parents=True)
    preferences.path.write_text(json.dumps({
        "futurePreference": {"enabled": True},
        "timeline": {"clippingHighlightAutoHide": False, "futureTimelineOption": "keep"},
        "aiReview": {"apiKey": "stored-secret", "futureAiOption": 17},
    }), encoding="utf-8")

    preferences.save(AppPreferences())
    saved = json.loads(preferences.path.read_text(encoding="utf-8"))

    assert saved["futurePreference"] == {"enabled": True}
    assert saved["timeline"]["futureTimelineOption"] == "keep"
    assert saved["aiReview"]["futureAiOption"] == 17
    assert saved["aiReview"]["apiKey"] == "stored-secret"
