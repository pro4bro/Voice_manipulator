import json
import wave
from pathlib import Path

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.obs_retained_live_script import retain_live_script
from app.domain.models import MediaAssetCreate, ProjectCreate


def test_stopped_obs_draft_survives_archive_reopen_clear_and_final_stt(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="retained live", location=str(tmp_path)))
    root = Path(project.project_path)
    audio = root / "audio.wav"
    with wave.open(str(audio), "wb") as output:
        output.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        output.writeframes(b"\0\0" * 24000)
    media = FileMediaLibrary(projects)
    asset = media.create(project.id, MediaAssetCreate(name="Mic", source_extension=".wav", media_kind="audio", source_path="audio.wav", analysis_path="audio.wav",
        duration=1, origin="record", transcription_status="skipped"))
    folder = root / "assets/obs-livelink/recording"
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text(json.dumps({"sourceStems": [{"channelId": "mic", "assetId": asset.id}]}))
    events = [{"channelId": "mic", "utteranceId": "speech", "revision": 1, "startSeconds": 0, "text": "Live draft", "pending": "", "status": "partial"}]
    (folder / "transcript-events.jsonl").write_text("\n".join(json.dumps(event) for event in events), encoding="utf-8")
    retain_live_script(media, project.id, folder)
    reopened = FileMediaLibrary(projects)
    assert reopened.get(project.id, asset.id).text == "Live draft"
    assert reopened.get(project.id, asset.id).transcription_status == "skipped"
    assert reopened.get(project.id, asset.id).words == []  # segment timing is not invented word timing
    reopened.update_script(project.id, asset.id, "", "user", [])
    retain_live_script(reopened, project.id, folder)
    assert reopened.get(project.id, asset.id).text == ""
    reopened.apply_transcription(project.id, asset.id, {"text": "Detailed STT", "words": []}, 1)
    retain_live_script(reopened, project.id, folder)
    assert reopened.get(project.id, asset.id).text == "Detailed STT"
