import hashlib
import importlib.util
import json
from pathlib import Path
import re
import wave

import pytest


path = Path(__file__).resolve().parents[3] / "scripts/profiling/stt_timing_anchor_packet.py"
spec = importlib.util.spec_from_file_location("anchor_packet", path)
packet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packet)


def prepare(tmp_path, text="xin"):
    source = tmp_path / "input.wav"
    with wave.open(str(source), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(b"\0\0" * 24000)
    protocol = {"cases": [{"id": "case", "label": "Test", "audioFile": source.name,
                          "inputSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                          "duration": 1, "startSeconds": 10}],
                "targets": [{"id": "case-000", "case": "case", "text": text,
                             "start": 10.123, "end": 10.789}]}
    (tmp_path / "protocol.json").write_text(json.dumps(protocol), encoding="utf-8")
    (tmp_path / "native.json").write_text(json.dumps({"case": [{"id": "case-000", "text": text,
                                                                 "start": 10.123, "end": 10.789}]}), encoding="utf-8")


def test_listening_packet_does_not_prefill_model_anchors(tmp_path):
    prepare(tmp_path)
    packet.build(tmp_path)
    html = (tmp_path / "review-anchors.html").read_text(encoding="utf-8")
    payload = json.loads(re.search(r'id="payload">(.*?)</script>', html, re.S).group(1))
    assert payload["targets"] == [{"id": "case-000", "case": "case", "text": "xin"}]
    review = json.loads((tmp_path / "anchors-template.json").read_text(encoding="utf-8"))
    assert review["anchors"][0]["start"] is None and review["anchors"][0]["end"] is None
    assert review["independentlyHeard"] is False
    assert payload["cases"][0]["audio"].startswith("data:audio/wav;base64,")


def test_transcript_cannot_close_the_inline_payload_script(tmp_path):
    text = "</script><img src=x onerror=alert(1)>"
    prepare(tmp_path, text)
    packet.build(tmp_path)
    html = (tmp_path / "review-anchors.html").read_text(encoding="utf-8")
    payload = json.loads(re.search(r'id="payload">(.*?)</script>', html, re.S).group(1))
    assert payload["targets"][0]["text"] == text
    assert text not in html


def test_changed_audio_is_rejected_before_creating_a_review(tmp_path):
    prepare(tmp_path)
    (tmp_path / "input.wav").write_bytes(b"tampered")
    with pytest.raises(ValueError, match="Frozen"):
        packet.build(tmp_path)
    assert not (tmp_path / "review-anchors.html").exists()


def test_existing_review_packet_is_preserved(tmp_path):
    prepare(tmp_path)
    (tmp_path / "review-anchors.html").write_text("existing review", encoding="utf-8")
    with pytest.raises(ValueError, match="overwrite"):
        packet.build(tmp_path)
    assert (tmp_path / "review-anchors.html").read_text(encoding="utf-8") == "existing review"
