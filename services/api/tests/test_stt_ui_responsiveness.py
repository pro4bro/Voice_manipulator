import asyncio
import threading
from types import SimpleNamespace

from app.adapters.media_import_processor import MediaImportProcessor


def test_publication_of_other_transcript_does_not_block_api_event_loop(tmp_path, monkeypatch):
    events = []
    entered = threading.Event()
    released = threading.Event()
    source = tmp_path / "analysis.wav"
    source.write_bytes(b"fixture")
    asset = SimpleNamespace(id="other", analysis_path="analysis.wav", duration=1, origin="import", text="", removed_ranges=[], working_range=None)

    def publish(*args):
        events.append("publish-start")
        entered.set()
        released.wait(.3)
        events.append("publish-end")
        return asset

    processor = MediaImportProcessor("http://unused", SimpleNamespace(apply_transcription=publish), "ffmpeg")
    monkeypatch.setattr(processor, "_prepare_processing_audio", lambda *_: (source, None))
    monkeypatch.setattr(processor, "_attach_timing_quality", lambda item, _: item)
    monkeypatch.setattr(processor, "_write_and_read_stt_artifacts", lambda _, item: item)
    async def recognize(*args, **kwargs):
        return {"text": "test", "words": []}, 0
    monkeypatch.setattr(processor, "_run_studio_import", recognize)

    async def exercise():
        task = asyncio.create_task(processor.transcribe_existing(SimpleNamespace(id="p", project_path=str(tmp_path)), asset))
        await asyncio.to_thread(entered.wait, 1)
        events.append("other-ui-request")
        released.set()
        await task
    asyncio.run(exercise())
    assert events.index("other-ui-request") < events.index("publish-end")
