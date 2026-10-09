"""Create a self-contained blind listening worksheet from frozen timing inputs.

Audio stays inside the HTML. No model timestamps or VAD edges are placed in the
review payload; targets have empty IN/OUT until a listener marks them.
"""
from __future__ import annotations

import argparse
import array
import base64
import hashlib
import json
from pathlib import Path
import sys
import wave


def build(run: Path) -> None:
    template_path = run / "anchors-template.json"
    html_path = run / "review-anchors.html"
    if template_path.exists() or html_path.exists():
        raise ValueError("Refusing to overwrite an existing anchor packet/review")
    protocol_path = run / "protocol.json"
    protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
    digest = hashlib.sha256(protocol_path.read_bytes()).hexdigest()
    native_data = json.loads((run / "native.json").read_text(encoding="utf-8"))
    native = native_data.get("cases", native_data)
    payload = {"protocolSha256": digest,
               "targets": [{key: target[key] for key in ("id", "case", "text")} for target in protocol["targets"]],
               "cases": []}
    for case in protocol["cases"]:
        source = (run / case["audioFile"]).resolve()
        if not source.is_relative_to(run) or hashlib.sha256(source.read_bytes()).hexdigest() != case["inputSha256"]:
            raise ValueError("Frozen review audio changed")
        with wave.open(str(source), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 24000):
                raise ValueError("Expected exact mono PCM16/24kHz review audio")
            if abs(audio.getnframes() / 24000 - case["duration"]) > 1 / 24000:
                raise ValueError("Review audio duration changed")
            values = array.array("h", audio.readframes(audio.getnframes()))
        if sys.byteorder != "little":
            values.byteswap()
        width = max(1, len(values) // 3000)
        peaks = [[round(min(values[i:i + width]) / 32768, 5),
                  round(max(values[i:i + width]) / 32768, 5)] for i in range(0, len(values), width)]
        row = native[case["id"]]
        context = row.get("transcript", " ".join(word["text"] for word in row["words"])) if isinstance(row, dict) else " ".join(word["text"] for word in row)
        payload["cases"].append({"id": case["id"], "label": case["label"],
                                 "startSeconds": case["startSeconds"], "duration": case["duration"],
                                 "audio": "data:audio/wav;base64," + base64.b64encode(source.read_bytes()).decode("ascii"),
                                 "peaks": peaks, "context": context})
    template = Path(__file__).with_name("stt_timing_anchor_review.html").read_text(encoding="utf-8")
    encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False).replace("</", "<\\/")
    html_path.write_text(template.replace("__BLIND_REVIEW_PAYLOAD__", encoded), encoding="utf-8")
    review = {"schema": 1, "protocolSha256": digest, "reviewer": None,
              "independentlyHeard": False, "anchors": [
                  {"id": target["id"], "text": target["text"], "status": "unreviewed", "start": None, "end": None}
                  for target in protocol["targets"]]}
    template_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Blind packet ready: {len(protocol['targets'])} targets; no prefilled model timing")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    args = parser.parse_args()
    run = args.run.resolve()
    root = Path(__file__).resolve().parents[2] / ".scratch/stt-timing-accuracy-01"
    if not run.is_relative_to(root.resolve()):
        raise ValueError("Packet output must be in the owned timing scratch directory")
    build(run)


if __name__ == "__main__":
    main()
