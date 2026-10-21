from pathlib import Path

from app.adapters.training_model_catalog import FileTrainingModelCatalog


def test_lipsync_candidates_report_source_installed_but_not_render_ready(tmp_path):
    resources = Path(__file__).resolve().parents[1] / "app" / "resources" / "provider-catalog"
    for repo, script in (("MuseTalk", "scripts/inference.py"), ("LatentSync", "scripts/inference.py"), ("Wav2Lip", "inference.py")):
        entrypoint = tmp_path / repo / script
        entrypoint.parent.mkdir(parents=True)
        entrypoint.write_text("# source fixture", encoding="utf-8")
    catalog = FileTrainingModelCatalog(resources, {"lipsync": tmp_path})
    choices = catalog.options(task="lip-sync")
    assert [option.id for option in choices] == ["musetalk-lipsync", "latentsync-lipsync", "wav2lip-lipsync"]
    assert all(option.installed and not option.available for option in choices)
    assert choices[0].runnable and choices[0].readiness_required
    assert all(not option.runnable for option in choices[1:])
    assert "runtime/model" in choices[0].status
    assert "thương mại" in choices[-1].blocked_reason
