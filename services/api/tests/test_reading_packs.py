from __future__ import annotations

import json

import pytest

from app.adapters.file_reading_packs import (
    CARD_MAX_SECONDS,
    CARD_MIN_SECONDS,
    FileReadingPacks,
    ReadingPackError,
)
from app.settings import Settings

# Every delivery the app can label, minus the `mix` rollup, which is a state an
# asset ends up in and never something a person is asked to perform.
PERFORMABLE_EMOTIONS = {
    "exciting",
    "funny",
    "good",
    "normal",
    "low-energy",
    "sad",
    "cry",
    "angry",
    "critical",
}


def shipped_packs() -> FileReadingPacks:
    return FileReadingPacks(Settings.from_env().reading_packs_root)


def write_pack(root, name, packs_payload):
    root.mkdir(parents=True, exist_ok=True)
    (root / name).write_text(json.dumps(packs_payload), encoding="utf-8")


def minimal_pack(pack_id="test-pack", cards=None):
    return {
        "packId": pack_id,
        "language": "vi",
        "languageName": "Tiếng Việt",
        "title": "Test pack",
        "version": 1,
        "license": "pro4bro-original",
        "passages": [
            {
                "id": f"{pack_id}-p1",
                "kind": "emotion",
                "emotion": "angry",
                "title": "Passage",
                "direction": "Read it angrily.",
                "cards": cards
                or [{"id": f"{pack_id}-p1-c01", "text": "Một hai ba bốn năm sáu.", "tags": []}],
            }
        ],
    }


def test_shipped_packs_cover_every_performable_emotion_in_both_languages():
    library = shipped_packs()
    summaries = {pack.pack_id: pack for pack in library.list()}

    assert set(summaries) == {"en-core-v1", "vi-core-v1"}
    for pack_id in summaries:
        assert set(library.get(pack_id).emotions) == PERFORMABLE_EMOTIONS


def test_shipped_cards_stay_inside_the_training_duration_window():
    library = shipped_packs()
    for pack_id in ("vi-core-v1", "en-core-v1"):
        assert library.out_of_range_cards(pack_id) == []


def test_counts_are_derived_rather_than_read_from_the_file(tmp_path):
    write_pack(tmp_path, "a.json", minimal_pack())
    pack = FileReadingPacks(tmp_path).get("test-pack")
    card = pack.passages[0].cards[0]

    assert card.word_count == 6
    assert CARD_MIN_SECONDS <= card.estimated_seconds <= CARD_MAX_SECONDS
    assert pack.card_count == 1
    assert pack.word_count == card.word_count
    assert pack.passages[0].estimated_seconds == card.estimated_seconds


def test_a_malformed_pack_is_skipped_without_taking_the_others_down(tmp_path):
    write_pack(tmp_path, "good.json", minimal_pack("good-pack"))
    (tmp_path / "broken.json").write_text("{ not json", encoding="utf-8")
    write_pack(tmp_path, "no-passages.json", {**minimal_pack("empty-pack"), "passages": []})

    library = FileReadingPacks(tmp_path)

    assert [pack.pack_id for pack in library.list()] == ["good-pack"]


def test_duplicate_card_ids_reject_the_pack(tmp_path):
    duplicated = [
        {"id": "dup-p1-c01", "text": "Một hai ba bốn năm sáu.", "tags": []},
        {"id": "dup-p1-c01", "text": "Bảy tám chín mười mười một.", "tags": []},
    ]
    write_pack(tmp_path, "dup.json", minimal_pack("dup", duplicated))

    assert FileReadingPacks(tmp_path).list() == []


def test_mix_is_refused_as_a_delivery(tmp_path):
    payload = minimal_pack("mixed")
    payload["passages"][0]["emotion"] = "mix"
    write_pack(tmp_path, "mixed.json", payload)

    assert FileReadingPacks(tmp_path).list() == []


def test_an_unknown_pack_id_is_a_lookup_failure(tmp_path):
    write_pack(tmp_path, "a.json", minimal_pack())

    with pytest.raises(ReadingPackError):
        FileReadingPacks(tmp_path).get("nope")


def test_a_missing_pack_folder_is_empty_rather_than_fatal(tmp_path):
    assert FileReadingPacks(tmp_path / "absent").list() == []


def api_client(tmp_path, packs_root):
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from app.main import create_app

    settings = replace(
        Settings.from_env(), data_root=tmp_path / "data", reading_packs_root=packs_root
    )
    return TestClient(create_app(settings=settings))


def test_the_list_endpoint_summarises_without_shipping_every_card(tmp_path):
    with api_client(tmp_path, Settings.from_env().reading_packs_root) as client:
        response = client.get("/api/reading-packs")

    assert response.status_code == 200
    packs = response.json()
    assert [pack["packId"] for pack in packs] == ["en-core-v1", "vi-core-v1"]
    assert "passages" not in packs[0]
    assert packs[0]["cardCount"] > 0
    assert packs[0]["estimatedSeconds"] > 0


def test_the_detail_endpoint_returns_cards_and_directions(tmp_path):
    with api_client(tmp_path, Settings.from_env().reading_packs_root) as client:
        response = client.get("/api/reading-packs/vi-core-v1")

    assert response.status_code == 200
    pack = response.json()
    angry = next(item for item in pack["passages"] if item["emotion"] == "angry")
    assert angry["direction"]
    assert angry["cards"][0]["text"]


def test_an_unknown_pack_is_a_404(tmp_path):
    with api_client(tmp_path, Settings.from_env().reading_packs_root) as client:
        response = client.get("/api/reading-packs/does-not-exist")

    assert response.status_code == 404
