from copy import deepcopy
import json
from pathlib import Path
import threading

import pytest

from test_subtitle_alignment import setup, url
from app.adapters.activity_center import CENTER


class Engines:
    def catalog(self):
        return {"engines": [{"id": name, "label": name, "license": "MIT", "available": True,
            "reason": "", "models": []} for name in ("mfa", "stable-ts", "easyaligner")]}

    def report(self, engine, settings):
        return {"status": "available", "engine": engine, "model": "test", "license": "MIT"}

    def identity(self, engine, settings):
        return {"engine": engine, "settings": settings}

    def run(self, root, audio, words, folder, indexes, engine, settings, **kwargs):
        return {"status": "complete", "engine": engine, "model": "test", "words": [
            {"text": word["text"], "start": word["start"] + .1, "end": word["end"] + .15, "score": None}
            for word in words]}


def test_catalog_and_engine_preview_are_source_bound_ghosts_with_manual_locks(tmp_path):
    _, project, media, asset, audio, store, client = setup(tmp_path)
    store.engines = Engines()
    base = url(project, asset)
    response = client.get(base + "/engines")
    assert response.status_code == 200, response.text
    assert [row["id"] for row in response.json()["engines"]] == ["mfa", "stable-ts", "easyaligner"]
    before = deepcopy(media.get(project.id, asset.id).words)
    original_bytes = audio.read_bytes()
    result = client.post(base + "/engine-preview", json={"engineId": "easyaligner"})
    assert result.status_code == 200, result.text
    proposal = result.json()
    assert proposal["mode"] == "pipeline"
    assert proposal["aligner"]["engine"] == "easyaligner"
    assert proposal["engineSettings"] == {"language": "vi", "windowSeconds": 30, "paddingSeconds": 1}
    assert proposal["rows"][0]["after"] == {"start": .3, "end": .55}
    assert proposal["rows"][1]["status"] == "locked"
    assert media.get(project.id, asset.id).words == before
    assert audio.read_bytes() == original_bytes
    applied = client.post(base + f"/{proposal['id']}/apply-preview")
    assert applied.status_code == 200, applied.text
    assert applied.json()["asset"]["words"][1] == before[1]
    restored = client.post(base + f"/{proposal['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["asset"]["words"] == before


def test_alignment_activity_is_visible_during_inference_and_completes_after_proposal(tmp_path):
    _, project, _, asset, _, store, _ = setup(tmp_path)
    store.engines = Engines()
    entered, release = threading.Event(), threading.Event()
    original_run = store.engines.run

    def held_run(*args, **kwargs):
        progress = kwargs.get("progress")
        if progress:
            progress({"detail": "Aligned context groups 1/2", "fraction": .5})
        entered.set()
        assert release.wait(5)
        return original_run(*args)

    store.engines.run = held_run
    CENTER.reset()
    result = {}
    failure = []
    thread = threading.Thread(target=lambda: _capture(result, failure, store, project.id, asset.id))
    thread.start()
    try:
        assert entered.wait(2)
        task = next(task for task in CENTER.tasks() if task.kind == "alignment")
        assert task.status == "running"
        assert task.project_id == project.id
        assert task.asset_id == asset.id
        assert task.footage_id == asset.id
        assert task.fraction == .5
    finally:
        release.set()
        thread.join(5)
    assert not thread.is_alive()
    assert not failure
    assert result["value"]["state"] == "proposed"
    assert next(task for task in CENTER.tasks() if task.kind == "alignment").status == "complete"


def _capture(result, failure, store, project_id, asset_id):
    try:
        result["value"] = store.analyze_engine(project_id, asset_id, engine="easyaligner",
            settings={"language": "vi", "windowSeconds": 30, "paddingSeconds": 1})
    except Exception as exc:  # make thread errors visible to the test
        failure.append(exc)


@pytest.mark.parametrize("engine, settings", [
    ("unknown", {}), ("mfa", {"beam": 40, "retryBeam": 10}),
    ("mfa", {"language": "vi", "dictionary": "../../outside"}),
    ("stable-ts", {"model": "../../outside"}), ("stable-ts", {"refine": "yes"}),
    ("easyaligner", {"windowSeconds": 1000}), ("easyaligner", {"paddingSeconds": -1}),
])
def test_engine_settings_fail_before_dispatch(tmp_path, engine, settings):
    _, project, _, asset, _, store, client = setup(tmp_path)
    store.engines = Engines()
    result = client.post(url(project, asset) + "/engine-preview", json={"engineId": engine, "settings": settings})
    assert result.status_code == 422, result.text


def test_failed_or_mismatched_engine_cannot_publish_successful_preview(tmp_path):
    _, project, media, asset, _, store, client = setup(tmp_path)
    CENTER.reset()
    engines = Engines()
    store.engines = engines
    engines.run = lambda *_args, **_kwargs: {"status": "complete", "words": [{"text": "wrong", "start": 0, "end": .1}]}
    result = client.post(url(project, asset) + "/engine-preview", json={"engineId": "mfa", "settings": {}})
    assert result.status_code == 422
    assert not (Path(project.project_path) / "jobs/subtitle-alignment" / asset.id / "latest.json").exists()
    assert media.get(project.id, asset.id).words == asset.words
    assert next(task for task in CENTER.tasks() if task.kind == "alignment").status == "failed"


def test_engine_catalog_never_reports_missing_runtime_as_ready(tmp_path):
    from app.adapters.subtitle_alignment_engines import SubtitleAlignmentEngines
    engines = SubtitleAlignmentEngines(tmp_path)
    entries = engines.catalog()["engines"]
    assert len(entries) == 3
    assert all(not entry["available"] and entry["reason"] for entry in entries)


def test_source_change_during_inference_cannot_publish_or_apply(tmp_path):
    _, project, media, asset, _, store, client = setup(tmp_path)
    engines = Engines()
    original_run = engines.run
    def run(*args, **kwargs):
        words = deepcopy(asset.words)
        words[0]["start"] = .25
        media.update_script(project.id, asset.id, asset.text, "user", words)
        return original_run(*args)
    engines.run = run
    store.engines = engines
    result = client.post(url(project, asset) + "/engine-preview", json={"engineId": "mfa"})
    assert result.status_code == 409, result.text
    assert store.latest(project.id, asset.id) is None


def test_missing_boundaries_and_large_moves_stay_put_collisions_are_visible():
    from app.domain.subtitle_engine_refinement import compose_engine_refinement
    words = [{"text": text, "start": start, "end": end} for text, start, end in (
        ("a", .2, .4), ("b", .5, .7), ("c", .8, 1.), ("d", 1.1, 1.3))]
    aligned = [{"text": "a", "start": .45, "end": .6, "score": .9},
               {"text": "b", "start": None, "end": None},
               {"text": "c", "start": 3., "end": 3.2},
               {"text": "d", "start": 1.11, "end": 1.4}]
    result = compose_engine_refinement(words, aligned, 4, engine="easyaligner", max_move_ms=500)
    assert result["diagnostics"]["conflictIndexes"] == [0, 1]
    for i in (1, 2):
        assert result["rows"][i]["after"] == result["rows"][i]["before"]
    assert result["rows"][2]["reasons"] == ["engine-move-exceeds-limit"]
    assert words[0]["start"] == .2


def test_scoped_engine_preview_keeps_unselected_and_manual_words():
    from app.domain.subtitle_engine_refinement import compose_engine_refinement
    words = [{"text": "a", "start": .2, "end": .4},
             {"text": "b", "start": .5, "end": .7, "timingSource": "manual"},
             {"text": "c", "start": .8, "end": 1.}]
    aligned = [{"text": w["text"], "start": w["start"] + .1, "end": w["end"] + .1} for w in words]
    result = compose_engine_refinement(words, aligned, 2, engine="mfa", indexes=[0, 1])
    assert result["rows"][0]["after"]["start"] == .3
    assert result["rows"][1]["status"] == "locked"
    assert result["rows"][2]["after"] == result["rows"][2]["before"]


def test_common_movement_limit_also_bounds_optional_methods():
    from app.domain.subtitle_engine_refinement import compose_engine_refinement
    words = [{"text": "a", "start": .2, "end": .4}]
    aligned = [{"text": "a", "start": .21, "end": .41}]
    result = compose_engine_refinement(words, aligned, 2, engine="mfa", max_move_ms=0,
        methods=[{"mode": "offset", "start_offset_ms": 500, "end_offset_ms": 500}])
    assert result["rows"][0]["after"] == result["rows"][0]["before"]


def test_all_manual_words_can_be_compared_without_being_moved():
    from app.domain.subtitle_engine_refinement import compose_engine_refinement
    words = [{"text": "a", "start": .2, "end": .4, "timingSource": "manual"}]
    result = compose_engine_refinement(words, [{"text": "a", "start": .3, "end": .5}], 2, engine="mfa")
    assert result["summary"]["locked"] == 1
    assert result["diagnostics"]["measuredWords"] == 1
    assert result["diagnostics"]["changedWords"] == 0
    assert result["rows"][0]["after"] == result["rows"][0]["before"]


def test_dispatch_identity_rejects_modified_weights_and_catalog_rejects_stale_packages(tmp_path):
    import hashlib
    from app.adapters.subtitle_alignment_engines import SubtitleAlignmentEngines
    runtime = tmp_path / ".runtime/subtitle-alignment"
    environment = runtime / "neural"
    python = environment / "Scripts/python.exe"
    python.parent.mkdir(parents=True)
    python.write_bytes(b"test interpreter placeholder; never executed")
    weights = runtime / "models/stable-ts/base.pt"
    weights.parent.mkdir(parents=True)
    weights.write_bytes(b"original weights")
    metadata = environment / "Lib/site-packages/stable_ts.dist-info/METADATA"
    metadata.parent.mkdir(parents=True)
    metadata.write_bytes(b"Version: pinned")
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = {"schema": 1, "engine": "subtitle-neural", "software": {"stable-ts": "test"},
                "runtimeFiles": {metadata.relative_to(environment).as_posix(): sha(metadata)},
                "models": {"stable-ts/base": {"license": "MIT", "sha256": sha(weights), "fileStats": {
                    "base.pt": {"size": weights.stat().st_size, "mtimeNs": weights.stat().st_mtime_ns}}}}}
    (environment / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    engines = SubtitleAlignmentEngines(tmp_path)
    settings = {"model": "base", "language": "vi"}
    assert engines.identity("stable-ts", settings)["engine"] == "stable-ts"
    weights.write_bytes(b"modified weights")
    with pytest.raises(ValueError, match="đã đổi"):
        engines.identity("stable-ts", settings)
    metadata.unlink()
    entry = next(e for e in engines.catalog()["engines"] if e["id"] == "stable-ts")
    assert not entry["available"] and entry["reason"]
