"""Import the concrete engine classes without loading weights or starting a service."""
from pathlib import Path
import faulthandler
import sys

# Embedded Python's _pth isolation does not add the script directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from expressive_worker import configure

if not sys.flags.no_site:
    raise RuntimeError("Private expressive runtime must use explicit paths without site/user-site imports.")

faulthandler.dump_traceback_later(60, repeat=True)
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
faulthandler.cancel_dump_traceback_later()
