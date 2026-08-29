from app.adapters.media_import_processor import MediaImportProcessor


def test_stt_srt_artifact_is_canonical_input_for_the_script(tmp_path):
    result = MediaImportProcessor._write_and_read_stt_artifacts(
        tmp_path,
        {
            "id": "stt-001",
            "text": "ignored free text",
            "words": [
                {"text": "Xin", "start": 0.125, "end": 0.45},
                {"text": "chào", "start": 0.45, "end": 0.8},
            ],
            "word_timing_quality": "source",
        },
    )

    srt = tmp_path / "stt" / "transcript.stt.srt"
    payload = tmp_path / "stt" / "transcript.stt.json"
    assert srt.read_text(encoding="utf-8") == "1\n00:00:00,125 --> 00:00:00,450\nXin\n\n2\n00:00:00,450 --> 00:00:00,800\nchào\n"
    assert payload.is_file()
    assert result["text"] == "Xin chào"
    assert result["words"] == [
        {"text": "Xin", "start": 0.125, "end": 0.45},
        {"text": "chào", "start": 0.45, "end": 0.8},
    ]
