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