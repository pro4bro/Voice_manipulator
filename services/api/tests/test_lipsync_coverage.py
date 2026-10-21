from types import SimpleNamespace
from app.domain.lipsync import LipSyncDocument, LipSyncScope
from app.domain.lipsync_coverage import coverage


def setup():
    doc = LipSyncDocument.model_validate({"layers": [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}], "clips": [
        {"id": "bottom", "assetId": "src-b", "layerId": "b", "start": 0, "inPoint": 2, "outPoint": 12},
        {"id": "top", "assetId": "src-a", "layerId": "a", "start": 3, "inPoint": 1, "outPoint": 4}]})
    return doc, {"src-a": SimpleNamespace(duration=8), "src-b": SimpleNamespace(duration=20)}


def test_visibility_respects_unselected_occluders_and_range_source_mapping():
    doc, assets = setup()
    scope = LipSyncScope.model_validate({"layerIds": ["b"], "range": {"start": 2, "end": 8}})
    parts = coverage(doc, assets, scope)
    assert [(p["timelineStart"], p["timelineEnd"], p["sourceStart"], p["sourceEnd"]) for p in parts] == [(2, 3, 4, 5), (6, 8, 8, 10)]
    scope.mode = "placed"
    assert [(p["timelineStart"], p["timelineEnd"]) for p in coverage(doc, assets, scope)] == [(2, 8)]
    scope.all_layers = False
    scope.layer_ids = []
    assert coverage(doc, assets, scope) == []
    scope.layer_ids = ["b"]
    doc.layers[0].enabled = False
    scope.mode = "visible"
    assert [(p["timelineStart"], p["timelineEnd"]) for p in coverage(doc, assets, scope)] == [(2, 8)]
    scope.layer_ids = ["a"]
    assert coverage(doc, assets, scope) == []
    scope.mode = "placed"
    assert [(p["timelineStart"], p["timelineEnd"]) for p in coverage(doc, assets, scope)] == [(3, 6)]
    scope.mode = "source"
    assert coverage(doc, assets, scope)[0]["sourceEnd"] == 8


def test_source_detection_deduplicates_but_sync_keeps_distinct_audio_anchors():
    doc, assets = setup()
    doc.clips.append(doc.clips[0].model_copy(update={"id": "duplicate", "start": 12}))
    scope = LipSyncScope.model_validate({"mode": "source", "layerIds": ["b"], "range": {"start": 0, "end": 20}})
    detection = coverage(doc, assets, scope)
    assert len(detection) == 1 and detection[0]["occurrences"] == ["bottom", "duplicate"]
    assert detection[0]["timelineStart"] is None and detection[0]["sourceEnd"] == 20
    sync = coverage(doc, assets, scope, "sync")
    assert len(sync) == 2 and sync[0]["timelineStart"] == -2 and sync[1]["timelineStart"] == 10
