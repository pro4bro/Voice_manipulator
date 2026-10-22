"""Import the concrete engine classes without loading weights or starting a service."""
from pathlib import Path
import sys

from expressive_worker import configure

configure(Path(sys.argv[2]).resolve())
if sys.argv[1] == "f5-tts":
    from f5_tts.api import F5TTS
    from vocos import Vocos
elif sys.argv[1] == "index-tts":
    from indextts.infer_v2_5 import IndexTTS2
elif sys.argv[1] == "fish-speech":
    from tools.server.model_manager import ModelManager
    from fish_speech.utils.schema import ServeTTSRequest
else:
    raise ValueError("Unknown expressive runtime")
