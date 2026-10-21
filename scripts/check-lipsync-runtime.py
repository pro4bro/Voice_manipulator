"""Run inside the isolated environment after pip check; emits a readiness probe."""
import importlib.metadata
import json
import sys
from pathlib import Path

import cv2
import torch
from diffusers import AutoencoderKL, UNet2DConditionModel
from transformers import WhisperModel
import librosa

root = Path(__file__).resolve().parents[1]
cuda = torch.cuda.is_available()
if cuda:
    assert (torch.ones(1, device="cuda") + 1).item() == 2
report = {"python": sys.version, "cuda": cuda, "torch": torch.__version__, "opencv": cv2.__version__,
          "packages": {name: importlib.metadata.version(name) for name in ("torch", "torchvision", "diffusers", "transformers", "numpy", "librosa")}}
path = Path(sys.prefix) / "pro4bro-ready.json"
path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
