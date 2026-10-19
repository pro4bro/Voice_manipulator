"""Import the pinned CosyVoice3 configuration dependencies without loading weights."""

from pathlib import Path
import sys


def probe(repo: str) -> None:
    root = Path(repo).resolve()
    sys.path[:0] = [str(root), str(root / "third_party/Matcha-TTS")]
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.flow.DiT.dit import DiT
    from cosyvoice.flow.flow_matching import CausalConditionalCFM
    from cosyvoice.dataset import processor
    from cosyvoice.hifigan.hifigan import HiFiGan
    from cosyvoice.llm.llm import CosyVoice3LM

    print("CosyVoice3 configuration imports OK", flush=True)


if __name__ == "__main__":
    probe(sys.argv[1])
