from pathlib import Path
import pytest
from app.adapters.training_model_catalog import FileTrainingModelCatalog
from app.domain.lipsync_settings import resolve_lipsync_settings


def option(engine):
    return FileTrainingModelCatalog(Path(__file__).resolve().parents[1] / "app/resources/provider-catalog", {}).get(f"{engine}-lipsync")


def test_native_settings_reject_foreign_controls_and_resolve_mode_defaults():
    with pytest.raises(ValueError, match="guidance_scale"):
        resolve_lipsync_settings(option("musetalk"), {"guidance_scale": 2})
    normal = resolve_lipsync_settings(option("musetalk"), {})
    realtime = resolve_lipsync_settings(option("musetalk"), {"pipeline": "realtime", "use_float16": True})
    assert normal["parameters"]["batch_size"] == 8
    assert realtime["parameters"]["batch_size"] == 20
    assert "use_float16" not in realtime["parameters"]
    assert "skip_save_images" not in normal["parameters"]
    assert set(resolve_lipsync_settings(option("latentsync"), {})["parameters"]) == {"inference_steps", "guidance_scale", "seed", "enable_deepcache"}


def test_wav2lip_native_vector_order_and_invalid_crop():
    result = resolve_lipsync_settings(option("wav2lip"), {"static": True, "pads.bottom": 12})
    assert result["parameters"]["pads"] == [0, 12, 0, 0]
    assert result["arguments"][result["arguments"].index("--pads") + 1:][:4] == ["0", "12", "0", "0"]
    assert result["arguments"][result["arguments"].index("--static") + 1] == "True"
    with pytest.raises(ValueError, match="Box"):
        resolve_lipsync_settings(option("wav2lip"), {"box.top": 2})
    with pytest.raises(ValueError, match="biên cuối"):
        resolve_lipsync_settings(option("wav2lip"), {"crop.top": 20, "crop.bottom": 10})
