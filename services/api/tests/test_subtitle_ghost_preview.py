from copy import deepcopy
import pytest
from app.domain.subtitle_refinement import compose_refinement
from test_subtitle_alignment import setup, url


def test_composes_enabled_methods_without_mutating_source_or_moving_manual_words():
    words = [{"text": "a", "start": .2, "end": .4}, {"text": "b", "start": .6, "end": .8, "timingSource": "manual"}]
    before = deepcopy(words)
    result = compose_refinement(words, None, 2, methods=[{"mode": "offset", "start_offset_ms": 100, "end_offset_ms": 200, "strength": 50}])
    assert result["rows"][0]["after"] == pytest.approx({"start": .25, "end": .5})
    assert result["rows"][1]["status"] == "locked"
    assert result["rows"][1]["after"] == result["rows"][1]["before"]
    assert words == before


def test_ghost_apply_all_retains_conflict_coordinates_and_restore(tmp_path):
    _, project, media, asset, _, _, client = setup(tmp_path)
    before = deepcopy(media.get(project.id, asset.id).words)
    response = client.post(url(project, asset) + "/preview", json={"methods": [{"mode": "offset", "startOffsetMs": 350, "endOffsetMs": 350}]})
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["diagnostics"]["conflictIndexes"] == [0, 1]
    assert media.get(project.id, asset.id).words == before
    applied = client.post(url(project, asset) + f"/{preview['id']}/apply-preview")
    assert applied.status_code == 200, applied.text
    after = media.get(project.id, asset.id).words
    assert after[0]["start"] == pytest.approx(.55)
    assert after[0]["end"] == pytest.approx(.75)
    assert after[0]["subtitleTimingConflict"] is True
    assert {key: value for key, value in after[1].items() if key != "timingTrusted"} == {key: value for key, value in before[1].items() if key != "timingTrusted"}
    assert after[1]["timingTrusted"] is False  # overlap warning never moves the locked word
    restored = client.post(url(project, asset) + f"/{preview['id']}/restore")
    assert restored.status_code == 200
    assert media.get(project.id, asset.id).words == before


def test_ghost_rejects_invalid_methods_and_stale_apply(tmp_path):
    _, project, media, asset, _, _, client = setup(tmp_path)
    base = url(project, asset)
    assert client.post(base + "/preview", json={"methods": []}).status_code == 422
    assert client.post(base + "/preview", json={"methods": [{}]}).status_code == 422
    assert client.post(base + "/preview", json={"methods": [{"mode": "offset", "indexes": [0]}]}).status_code == 422
    assert client.post(base + "/preview", json={"methods": [{"mode": "offset", "strength": 101}]}).status_code == 422
    preview = client.post(base + "/preview", json={"methods": [{"mode": "offset", "startOffsetMs": 100}]}).json()
    media.update_script(project.id, asset.id, "Changed", "user", asset.words)
    assert client.post(base + f"/{preview['id']}/apply-preview").status_code == 409
