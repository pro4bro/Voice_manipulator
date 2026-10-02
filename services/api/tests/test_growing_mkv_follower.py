import asyncio
import json
import shutil
import subprocess
import time
import wave
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_growing_mkv_follower import FileGrowingMkvFollower
from app.adapters.growing_mkv_transcription import GrowingMkvTranscription
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.growing_mkv import scan_committed
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.domain.models import ProjectCreate
from app.main import create_app
from app.settings import Settings


@pytest.fixture
def two_track_mkv(tmp_path):
    root = Path(__file__).resolve().parents[3]
    bundled = root / ".tools" / "ffmpeg" / "ffmpeg.exe"
    ffmpeg = str(bundled) if bundled.is_file() else shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("FFmpeg is not installed")
    path = tmp_path / "closed.mkv"
    subprocess.run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=4", "-map", "0:a", "-map", "1:a",
        "-c:a", "aac", "-cluster_time_limit", "500", "-f", "matroska", str(path),
    ], check=True, capture_output=True)
    return ffmpeg, path


def _frames(path):
    with wave.open(str(path), "rb") as source:
        return source.getnframes()


def test_overlap_replaces_previous_tail_in_absolute_time_without_duplicate_words():
    results = [
        {"startFrame": 0, "endFrame": 1790 * 24000, "item": {"text": "old tail", "words": [
            {"text": "keep", "start": 1784, "end": 1784.5},
            {"text": "old", "start": 1786, "end": 1787}]}},
        {"startFrame": 1790 * 24000, "audioStartFrame": 1780 * 24000,
         "mergeStartFrame": 1785 * 24000, "endFrame": 1850 * 24000,
         "item": {"text": "context replacement next", "words": [
             {"text": "context", "start": 1, "end": 2},
             {"text": "replacement", "start": 6, "end": 7},
             {"text": "next", "start": 12, "end": 13}]}}
    ]
    item = GrowingMkvTranscription._combine(results, 1850)
    assert [word["start"] for word in item["words"]] == [1784, 1786, 1792]
    assert item["text"] == "keep replacement next"


def test_detailed_button_snapshots_committed_frames_and_waits_for_next_full_block(tmp_path, two_track_mkv, monkeypatch):
    ffmpeg, closed = two_track_mkv
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Snapshot"))
    library = FileMediaLibrary(projects)
    follower = FileGrowingMkvFollower(library, LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
        str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")))
    result = follower.start(project, str(closed), [0, 1], [0, 1], 60)
    directory = Path(project.project_path) / "assets/media" / result.asset.id
    follow_path = directory / "follow-state.json"

    def grow(seconds):
        state = json.loads(follow_path.read_text(encoding="utf-8"))
        for track in state["tracks"]:
            asset = library.get(project.id, track["assetId"])
            with wave.open(str(Path(project.project_path) / asset.analysis_path), "wb") as audio:
                audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                audio.writeframes(b"\0\0" * (seconds * 24000))
            track["frames"] = seconds * 24000
        follow_path.write_text(json.dumps(state), encoding="utf-8")

    calls = []
    async def recognize(segment, model):
        if model == "large-v3":
            calls.append(_frames(segment) / 24000)
        return {"text": "hello", "words": [{"text": "hello", "start": 6, "end": 6.5}]}
    worker = GrowingMkvTranscription(library, MediaImportProcessor("http://127.0.0.1:1", library, ffmpeg), recognize)
    grow(110)
    asyncio.run(worker.process_once(project, result.asset.id))
    assert calls == []  # Selecting STT tracks enables live preview, not detailed recognition.
    # A decoder publishes more audio while the start request waits for its lock.
    class DecoderLock:
        def __enter__(self):
            grow(150)
        def __exit__(self, *_args):
            pass
    with monkeypatch.context() as patch:
        patch.setattr(follower, "_lock", lambda _parent: DecoderLock())
        follower.configure_detailed_stt(project, result.asset.id, 60)
    follower.configure_detailed_stt(project, result.asset.id, 60)
    with pytest.raises(ValueError, match="không thể đổi"):
        follower.configure_detailed_stt(project, result.asset.id, 90)
    asyncio.run(worker.process_once(project, result.asset.id))
    assert calls == [110, 110]
    asyncio.run(worker.process_once(project, result.asset.id))
    assert calls == [110, 110]
    grow(170)
    restarted = GrowingMkvTranscription(library, worker.importer, recognize)
    asyncio.run(restarted.process_once(project, result.asset.id))
    assert calls == [110, 110, 70, 70]
    for asset_id in result.track_asset_ids:
        asset = library.get(project.id, asset_id)
        assert [word["start"] for word in asset.words if word["text"] == "hello"][:2] == [6, 106]
        assert (directory / "stt-segments" / asset_id / "transcript.stt.srt").is_file()

    # A long detailed request must not hold live recognition or the follower cursor.
    async def live_while_detailed_is_pending():
        gate = asyncio.Event()
        entered = asyncio.Event()
        live_calls = []
        async def slow_recognize(segment, model):
            if model == "large-v3":
                entered.set()
                await gate.wait()
            else:
                live_calls.append(segment)
            return {"text": "speech", "words": [{"text": "speech", "start": 1, "end": 1.5}]}
        grow(230)
        concurrent = GrowingMkvTranscription(library, worker.importer, slow_recognize)
        await concurrent.process_once(project, result.asset.id, wait_for_detail=False)
        await asyncio.wait_for(entered.wait(), 1)
        await asyncio.wait_for(concurrent.process_once(project, result.asset.id, wait_for_detail=False), 1)
        assert len(live_calls) == 4  # two live passes on both channels while detail waits
        gate.set()
        await asyncio.sleep(0)
        await concurrent.close()
    asyncio.run(live_while_detailed_is_pending())


def test_start_registers_footage_before_decoding_existing_clusters(tmp_path, two_track_mkv, monkeypatch):
    ffmpeg, source = two_track_mkv
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Nonblocking follow"))
    library = FileMediaLibrary(projects)
    follower = FileGrowingMkvFollower(
        library, LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
        str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")),
    )
    def fail_if_decoding(*_args, **_kwargs):
        raise AssertionError("Starting a follow must not decode the entire existing file")
    monkeypatch.setattr(follower, "poll", fail_if_decoding)

    result = follower.start(project, str(source), [1], [1], 60)
    assert library.get(project.id, result.asset.id).growing_mkv_follow
    assert follower.status(project, result.asset.id)["clusters"] == 0
    assert len(result.track_asset_ids) == 1


def test_scanner_limits_existing_backlog_to_one_committed_cluster(two_track_mkv):
    _, source = two_track_mkv
    full = scan_committed(source)
    first = scan_committed(source, max_clusters=1)
    assert len(full.clusters) > 1
    assert first.clusters == full.clusters[:1]
    second = scan_committed(source, from_offset=first.committed_end, max_clusters=1)
    assert second.clusters == full.clusters[1:2]


def test_follows_only_complete_clusters_and_recovers_without_replay(tmp_path, two_track_mkv):
    ffmpeg, closed = two_track_mkv
    original = closed.read_bytes()
    clusters = scan_committed(closed).clusters
    assert len(clusters) >= 3
    growing = tmp_path / "recording.mkv"
    growing.write_bytes(original[:clusters[1].start + 7])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Following"))
    library = FileMediaLibrary(projects)
    registry = LocalMediaSourceRegistry(tmp_path / "machine")
    follower = FileGrowingMkvFollower(library, registry, ffmpeg,
                                     str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")))

    result = follower.start(project, str(growing))
    parent_id = result.asset.id
    follower.poll(project, parent_id)
    first = follower.status(project, parent_id)
    assert len(first["tracks"]) == 2
    assert first["clusters"] == 1
    assert first["committedBytes"] == clusters[0].end
    assert first["visibleBytes"] > first["committedBytes"]
    assert all(track["frames"] > 0 for track in first["tracks"])
    assert follower.poll(project, parent_id)["clusters"] == 1

    # Crash after a WAV append but before the next checkpoint: recovery truncates it.
    first_child = library.get(project.id, result.track_asset_ids[0])
    first_path = Path(project.project_path) / first_child.analysis_path
    with first_path.open("ab") as output:
        output.write(b"orphan")
    growing.write_bytes(original[:clusters[2].start + 5])
    restarted = FileGrowingMkvFollower(library, registry, ffmpeg, follower.ffprobe)
    second = restarted.poll(project, parent_id)
    assert second["clusters"] == 2
    assert first_path.stat().st_size == 44 + second["tracks"][0]["frames"] * 2
    assert _frames(first_path) == second["tracks"][0]["frames"]
    assert restarted.poll(project, parent_id)["tracks"] == second["tracks"]

    growing.write_bytes(original)
    final = restarted.finish(project, parent_id)
    assert final["finished"]
    assert final["clusters"] == len(clusters)
    assert restarted.finish(project, parent_id) == final
    assert final["committedBytes"] == clusters[-1].end
    assert final["visibleBytes"] == len(original)
    assert len({track["streamIndex"] for track in final["tracks"]}) == 2
    root = Path(project.project_path)
    for child_id, track in zip(result.track_asset_ids, final["tracks"]):
        child = library.get(project.id, child_id)
        assert child.analysis_path.startswith(f"assets/media/{parent_id}/final/")
        assert _frames(root / child.analysis_path) == track["frames"]
        assert child.duration == pytest.approx(track["frames"] / 24000)
    state = json.loads((root / result.asset.source_path).parent.joinpath("follow-state.json").read_text())
    assert "sourcePath" not in json.dumps(state)
    assert state["finalSourceSha256"]
    assert all(abs(track["frames"] - track["finalFrames"]) < 24000 // 4
               for track in state["tracks"])
    parent = library.get(project.id, parent_id)
    assert parent.source_path.endswith("source-final.mkv")
    assert (root / parent.source_path).read_bytes() == original
    # A finished project's status no longer depends on the machine-local locator.
    registry.remove(project.id, parent_id)
    assert restarted.status(project, parent_id)["finished"]


def _restore_legacy_automatic_detail(project, parent_id):
    """Existing pre-MKV-STT-02 checkpoints must retain their automatic queue."""
    path = Path(project.project_path) / "assets/media" / parent_id / "follow-state.json"
    state = json.loads(path.read_text(encoding="utf-8"))
    state.pop("sttDetailedEnabled", None)
    path.write_text(json.dumps(state), encoding="utf-8")


def test_selected_track_live_preview_and_final_stt_resume_without_duplicate_recognition(tmp_path, two_track_mkv):
    ffmpeg, closed = two_track_mkv
    original = closed.read_bytes()
    first_cluster = scan_committed(closed).clusters[0]
    growing = tmp_path / "recording.mkv"
    growing.write_bytes(original[:first_cluster.end])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="STT follow"))
    library = FileMediaLibrary(projects)
    follower = FileGrowingMkvFollower(
        library, LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
        str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")),
    )
    result = follower.start(project, str(growing), [1], [1], 10)
    _restore_legacy_automatic_detail(project, result.asset.id)
    assert len(result.track_asset_ids) == 1
    calls = []

    async def recognize(segment, model):
        calls.append((segment.name, model, _frames(segment)))
        return {"text": model, "words": [{"text": model, "start": 0.1, "end": 0.3}]}

    importer = MediaImportProcessor("http://127.0.0.1:1", library, ffmpeg)
    worker = GrowingMkvTranscription(library, importer, recognize)
    growing.write_bytes(original)
    follower.poll(project, result.asset.id)
    live = asyncio.run(worker.process_once(project, result.asset.id))
    assert not live["done"]
    assert calls[0][1] == "tiny"
    child = library.get(project.id, result.track_asset_ids[0])
    assert child.text == "tiny"
    state_path = Path(project.project_path) / result.asset.source_path
    stt_state = state_path.parent / "stt-state.json"
    saved = json.loads(stt_state.read_text(encoding="utf-8"))
    saved["tracks"][child.id]["liveFrame"] = 0
    stt_state.write_text(json.dumps(saved), encoding="utf-8")
    restarted = GrowingMkvTranscription(library, importer, recognize)
    library.set_import_selected(project.id, child.id, False)
    withdrawn = asyncio.run(restarted.process_once(project, result.asset.id))
    assert withdrawn["selectedAssetIds"] == []
    assert len(calls) == 1
    library.set_import_selected(project.id, child.id, True)
    asyncio.run(restarted.process_once(project, result.asset.id))
    assert len(calls) == 1  # the committed result is reused after a cursor rollback
    follower.finish(project, result.asset.id)
    finished = asyncio.run(restarted.process_once(project, result.asset.id))
    assert finished["done"]
    assert [model for _, model, _ in calls] == ["tiny", "large-v3"]
    child = library.get(project.id, child.id)
    assert child.transcription_status == "complete"
    assert child.text == "large-v3"
    assert child.words[0]["start"] == pytest.approx(0.1)
    asyncio.run(restarted.process_once(project, result.asset.id))
    assert len(calls) == 2


def test_final_stt_drains_the_last_short_segment_after_finish(tmp_path, two_track_mkv):
    ffmpeg, _ = two_track_mkv
    closed = tmp_path / "long.mkv"
    subprocess.run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=12",
        "-c:a", "aac", "-cluster_time_limit", "500", "-f", "matroska", str(closed),
    ], check=True, capture_output=True)
    growing = tmp_path / "growing.mkv"
    growing.write_bytes(closed.read_bytes()[:scan_committed(closed).clusters[0].end])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Final tail"))
    library = FileMediaLibrary(projects)
    follower = FileGrowingMkvFollower(
        library, LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
        str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")),
    )
    result = follower.start(project, str(growing), [0], [0], 10)
    _restore_legacy_automatic_detail(project, result.asset.id)
    growing.write_bytes(closed.read_bytes())
    follower.finish(project, result.asset.id)
    calls = []

    async def recognize(segment, model):
        calls.append((_frames(segment), model))
        return {"text": f"đoạn {len(calls)}", "words": [
            {"text": f"đoạn {len(calls)}", "start": 0.1, "end": 0.3},
        ]}

    worker = GrowingMkvTranscription(
        library, MediaImportProcessor("http://127.0.0.1:1", library, ffmpeg), recognize,
    )
    first = asyncio.run(worker.process_once(project, result.asset.id))
    assert not first["done"]
    second = asyncio.run(worker.process_once(project, result.asset.id))
    assert second["done"]
    assert [model for _, model in calls] == ["large-v3", "large-v3"]
    assert calls[0][0] == 10 * 24000
    assert 0 < calls[1][0] < 10 * 24000
    child = library.get(project.id, result.track_asset_ids[0])
    assert child.transcription_status == "complete"
    assert len(child.words) == 2
    assert child.words[1]["start"] == pytest.approx(10.1)


def test_detailed_stt_runs_on_all_channels_before_mkv_finishes_and_keeps_word_offsets(tmp_path, two_track_mkv):
    ffmpeg, _ = two_track_mkv
    closed = tmp_path / "long-two-track.mkv"
    subprocess.run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=12",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=12", "-map", "0:a", "-map", "1:a",
        "-c:a", "aac", "-cluster_time_limit", "500", "-f", "matroska", str(closed),
    ], check=True, capture_output=True)
    clusters = scan_committed(closed).clusters
    growing = tmp_path / "still-recording.mkv"
    growing.write_bytes(closed.read_bytes()[:clusters[0].end])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Two channel live STT"))
    library = FileMediaLibrary(projects)
    follower = FileGrowingMkvFollower(
        library, LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
        str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")),
    )
    result = follower.start(project, str(growing), [0, 1], [0, 1], 10)
    _restore_legacy_automatic_detail(project, result.asset.id)
    growing.write_bytes(closed.read_bytes())
    follower.poll(project, result.asset.id)
    assert not follower.status(project, result.asset.id)["finished"]
    recognized = []

    async def recognize(segment, model):
        recognized.append((segment.parent.parent.name, segment.parent.name, model, _frames(segment)))
        return {"text": f"word-{len(recognized)}", "words": [
            {"text": f"word-{len(recognized)}", "start": 0.25, "end": 0.45},
        ]}

    worker = GrowingMkvTranscription(
        library, MediaImportProcessor("http://127.0.0.1:1", library, ffmpeg), recognize,
    )
    first = asyncio.run(worker.process_once(project, result.asset.id))
    assert not first["finished"] and not first["done"]
    assert len([call for call in recognized if call[2] == "large-v3"]) == 2
    for child_id in result.track_asset_ids:
        child = library.get(project.id, child_id)
        assert child.transcription_status == "processing"
        assert child.words and child.words[0]["start"] == pytest.approx(0.25)
        assert first["tracks"][child_id]["finalFrame"] == 10 * 24000
    # The completed detailed interval is not recognized again while waiting
    # for the recorder to close, even after a worker restart.
    restarted = GrowingMkvTranscription(library, worker.importer, recognize)
    asyncio.run(restarted.process_once(project, result.asset.id))
    assert len([call for call in recognized if call[2] == "large-v3"]) == 2
    follower.finish(project, result.asset.id)
    last = asyncio.run(restarted.process_once(project, result.asset.id))
    assert last["done"]
    assert len([call for call in recognized if call[2] == "large-v3"]) == 4
    for child_id in result.track_asset_ids:
        child = library.get(project.id, child_id)
        assert child.transcription_status == "complete"
        assert len(child.words) == 2
        assert child.words[1]["start"] == pytest.approx(10.25)
        assert child.words[0]["end"] < child.words[1]["start"]


def test_detailed_stt_keeps_user_script_in_review_after_finish(tmp_path, two_track_mkv):
    ffmpeg, closed = two_track_mkv
    growing = tmp_path / "edited.mkv"
    growing.write_bytes(closed.read_bytes()[:scan_committed(closed).clusters[0].end])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Edited Script"))
    library = FileMediaLibrary(projects)
    follower = FileGrowingMkvFollower(
        library, LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
        str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")),
    )
    result = follower.start(project, str(growing), [0], [0], 10)
    _restore_legacy_automatic_detail(project, result.asset.id)
    library.update_script(project.id, result.track_asset_ids[0], "Lời sửa của người dùng", "user")
    growing.write_bytes(closed.read_bytes())
    follower.finish(project, result.asset.id)

    async def recognize(segment, model):
        return {"text": "Lời STT", "words": [{"text": "STT", "start": 0.1, "end": 0.3}]}

    worker = GrowingMkvTranscription(
        library, MediaImportProcessor("http://127.0.0.1:1", library, ffmpeg), recognize,
    )
    assert asyncio.run(worker.process_once(project, result.asset.id))["done"]
    child = library.get(project.id, result.track_asset_ids[0])
    assert child.text == "Lời sửa của người dùng"
    assert child.transcription_status == "reviewing"
    assert any(revision.source == "stt" and revision.text == "Lời STT" for revision in child.revisions)


def test_reads_a_file_while_a_real_mkv_writer_is_still_running(tmp_path, two_track_mkv):
    ffmpeg, _ = two_track_mkv
    growing = tmp_path / "active-writer.mkv"
    writer = subprocess.Popen([
        ffmpeg, "-y", "-re", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=25",
        "-re", "-f", "lavfi", "-i", "sine=frequency=880:duration=25",
        "-map", "0:a", "-map", "1:a", "-c:a", "aac", "-cluster_time_limit", "500",
        "-flush_packets", "1", "-f", "matroska", str(growing),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if growing.is_file():
                try:
                    if scan_committed(growing).clusters:
                        break
                except (OSError, ValueError):
                    pass
            time.sleep(0.1)
        else:
            pytest.fail("The live MKV writer did not commit its first Cluster")
        projects = FileProjectRepository(tmp_path / "projects")
        project = projects.create(ProjectCreate(name="Active writer"))
        library = FileMediaLibrary(projects)
        follower = FileGrowingMkvFollower(
            library, LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
            str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")),
        )
        result = follower.start(project, str(growing), [0, 1], [0, 1], 10)
        _restore_legacy_automatic_detail(project, result.asset.id)
        calls = []

        async def recognize(segment, model):
            calls.append((model, _frames(segment), writer.poll() is None))
            return {"text": "đang ghi", "words": [{"text": "ghi", "start": 0.2, "end": 0.4}]}

        worker = GrowingMkvTranscription(
            library, MediaImportProcessor("http://127.0.0.1:1", library, ffmpeg), recognize,
        )
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and writer.poll() is None:
            follower.poll(project, result.asset.id)
            asyncio.run(worker.process_once(project, result.asset.id))
            if all(worker.status(project, result.asset.id)["tracks"].get(asset_id, {}).get("finalFrame", 0) >= 10 * 24000
                   for asset_id in result.track_asset_ids):
                break
            time.sleep(0.2)
        assert len([model for model, _, _ in calls if model == "large-v3"]) == 2
        assert all(active for model, _, active in calls if model == "large-v3"), (
            "Detailed STT started only after the source writer stopped; "
            f"follow={follower.status(project, result.asset.id)}, "
            f"stt={worker.status(project, result.asset.id)}, calls={calls}"
        )
        assert not follower.status(project, result.asset.id)["finished"]
        assert writer.wait(timeout=25) == 0
        follower.finish(project, result.asset.id)
        for _ in range(5):
            progress = asyncio.run(worker.process_once(project, result.asset.id))
            if progress["done"]:
                break
        assert progress["done"]
        assert all(library.get(project.id, asset_id).transcription_status == "complete"
                   for asset_id in result.track_asset_ids)
    finally:
        if writer.poll() is None:
            writer.kill()
            writer.wait(timeout=5)


def test_rejects_source_truncation(tmp_path, two_track_mkv):
    ffmpeg, closed = two_track_mkv
    original = closed.read_bytes()
    clusters = scan_committed(closed).clusters
    growing = tmp_path / "recording.mkv"
    growing.write_bytes(original[:clusters[0].end])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Following"))
    follower = FileGrowingMkvFollower(FileMediaLibrary(projects),
                                     LocalMediaSourceRegistry(tmp_path / "machine"), ffmpeg,
                                     str(Path(ffmpeg).with_name("ffprobe.exe" if Path(ffmpeg).suffix else "ffprobe")))
    result = follower.start(project, str(growing))
    follower.poll(project, result.asset.id)
    growing.write_bytes(original[:clusters[0].start])
    with pytest.raises(ValueError, match="truncated"):
        follower.poll(project, result.asset.id)


def test_unknown_size_cluster_waits_for_next_element(tmp_path, two_track_mkv):
    _, closed = two_track_mkv
    clusters = scan_committed(closed).clusters
    assert len(clusters) >= 2
    modified = bytearray(closed.read_bytes())
    size_at = clusters[0].start + 4
    first = modified[size_at]
    mask, width = 0x80, 1
    while not first & mask:
        mask >>= 1
        width += 1
    modified[size_at] = mask | (mask - 1)
    modified[size_at + 1:size_at + width] = b"\xff" * (width - 1)
    growing = tmp_path / "unknown.mkv"
    growing.write_bytes(modified[:clusters[1].start - 1])
    assert scan_committed(growing).clusters == ()
    growing.write_bytes(modified[:clusters[1].start + 8])
    found = scan_committed(growing).clusters
    assert len(found) == 1
    assert found[0].start == clusters[0].start
    assert found[0].end == clusters[1].start


def test_follow_api_exposes_start_poll_finish(tmp_path, two_track_mkv):
    ffmpeg, closed = two_track_mkv
    original = closed.read_bytes()
    first_cluster = scan_committed(closed).clusters[0]
    growing = tmp_path / "recording.mkv"
    growing.write_bytes(original[:first_cluster.end])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="API follow"))
    with TestClient(create_app(project_repository=projects, settings=replace(
            Settings.from_env(), data_root=tmp_path / "machine", ffmpeg_path=ffmpeg))) as client:
        base = f"/api/projects/{project.id}/media"
        inspected = client.post(f"{base}/inspect-local", json={"sourcePath": str(growing)})
        assert inspected.status_code == 200, inspected.text
        assert [track["streamIndex"] for track in inspected.json()["tracks"]] == [0, 1]
        response = client.post(f"{base}/follow-mkv", json={
            "sourcePath": str(growing), "streamIndexes": [1], "transcribeStreamIndexes": [1],
            "sttSegmentSeconds": 75,
        })
        assert response.status_code == 201, response.text
        payload = response.json()
        assert len(payload["trackAssetIds"]) == 1
        selected = client.get(base).json()
        assert next(item for item in selected if item["id"] == payload["trackAssetIds"][0])["transcriptionSelected"]
        parent_id = payload["asset"]["id"]
        assert client.get(f"{base}/{parent_id}/follow/status").json()["stt"]["segmentSeconds"] == 75
        configured = client.post(f"{base}/{parent_id}/follow/detailed-stt", json={"segmentSeconds": 90})
        assert configured.status_code == 200, configured.text
        assert configured.json()["segmentSeconds"] == 90
        assert client.get(f"{base}/{parent_id}/follow/status").json()["sttSegmentSeconds"] == 90
        assert client.post(f"{base}/{parent_id}/follow/poll").json()["clusters"] == 1
        growing.write_bytes(original)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if client.get(f"{base}/{parent_id}/follow/status").json()["clusters"] > 1:
                break
            time.sleep(0.1)
        assert client.get(f"{base}/{parent_id}/follow/status").json()["clusters"] > 1
        finish = client.post(f"{base}/{parent_id}/follow/finish")
        assert finish.status_code == 200, finish.text
        assert finish.json()["finished"]
        assert len(finish.json()["tracks"]) == 1
        assert client.get(f"{base}/{parent_id}/follow/status").json()["finished"]


def test_api_restart_resumes_unfinished_follow(tmp_path, two_track_mkv):
    ffmpeg, closed = two_track_mkv
    original = closed.read_bytes()
    clusters = scan_committed(closed).clusters
    growing = tmp_path / "recording.mkv"
    growing.write_bytes(original[:clusters[0].end])
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Resume follow"))
    settings = replace(Settings.from_env(), data_root=tmp_path / "machine", ffmpeg_path=ffmpeg)
    base = f"/api/projects/{project.id}/media"
    with TestClient(create_app(project_repository=projects, settings=settings)) as first:
        response = first.post(f"{base}/follow-mkv", json={"sourcePath": str(growing)})
        assert response.status_code == 201, response.text
        parent_id = response.json()["asset"]["id"]
    growing.write_bytes(original[:clusters[2].end])
    with TestClient(create_app(project_repository=projects, settings=settings)) as second:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            status = second.get(f"{base}/{parent_id}/follow/status").json()
            if status["clusters"] >= 3:
                break
            time.sleep(0.1)
        assert status["clusters"] == 3
        assert not status["finished"]
