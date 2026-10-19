"""Import-only w-okada check, run with cwd at the upstream server directory."""

import importlib.util
import json
from pathlib import Path
import sys

import faiss
import fastapi
import onnxruntime
import socketio
import sounddevice
import torch
import torchaudio
import uvicorn

from voice_changer.RVC.RVCModelSlotGenerator import RVCModelSlotGenerator
from voice_changer.RVC.pipeline.PipelineGenerator import createPipeline


server_entry = Path.cwd() / "MMVCServerSIO.py"
spec = importlib.util.spec_from_file_location("MMVCServerSIOImportProbe", server_entry)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not prepare import-only server probe for {server_entry}")
server_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = server_module
spec.loader.exec_module(server_module)

print(json.dumps({
    "python": sys.version.split()[0],
    "torch": torch.__version__,
    "torchaudio": torchaudio.__version__,
    "onnxruntime": onnxruntime.__version__,
    "faiss": getattr(faiss, "__version__", "imported"),
    "fastapi": fastapi.__version__,
    "uvicorn": uvicorn.__version__,
    "rvc_slot_generator": RVCModelSlotGenerator.__name__,
    "rvc_pipeline_factory": createPipeline.__name__,
    "server_module": spec.name,
}, sort_keys=True))
