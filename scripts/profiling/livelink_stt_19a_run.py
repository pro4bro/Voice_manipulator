"""Read-only curated speech -> owned two-track LiveLink/MKV recognizer baseline.

Start an isolated, current Studio separately and pass its loopback URL. This is
an adapter/recognizer gate, not a physical OBS or capture-to-browser latency gate.
No model/decoder/padding settings are overridden. Each output root must be new.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from uuid import uuid4
import wave

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_growing_mkv_follower import FileGrowingMkvFollower
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.obs_livelink_transcription import ObsLiveLinkTranscription
from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt
from app.adapters.growing_mkv_transcription import GrowingMkvTranscription
from app.adapters.growing_mkv import scan_committed
from app.domain.models import ProjectCreate
from livelink_stt_19a_score import BUDGETS, score_tracks

RATE = 24000


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def wav(path, pcm):
    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        audio.writeframes(pcm)


def prepare(directory):
    source = ROOT / ".runtime/smoke/rvc-gate/set"
    labels = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    labels = [row for row in labels if row["group"] == "self"]
    assert len(labels) == 16
    tracks = []
    for index in range(2):
        pcm = bytearray(b"\0\0" * RATE * (2 + 4 * index))
        turns = []
        for label in labels[index::2]:
            path = source / label["source"]
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            assert digest.startswith(label["sha256"]), "Curated source changed"
            with wave.open(str(path), "rb") as audio:
                assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) == (1, 2, RATE)
                data = audio.readframes(audio.getnframes())
            start = len(pcm) / (2 * RATE)
            pcm.extend(data)
            turns.append({"id": label["id"], "text": label["text"], "start": start,
                          "end": len(pcm) / (2 * RATE), "source": str(path), "sha256": digest})
            pcm.extend(b"\0\0" * (RATE * 3 // 2))
        tracks.append({"track": index + 1, "turns": turns, "pcm": pcm})
    # At least initial 20s + one full 60s block + a nonempty Stop tail.
    frames = max(100 * RATE, max(len(track["pcm"]) // 2 for track in tracks) + 3 * RATE)
    for track in tracks:
        track["pcm"].extend(b"\0\0" * (frames - len(track["pcm"]) // 2))
        track["pcm"] = bytes(track["pcm"])
        track["reference"] = " ".join(turn["text"] for turn in track["turns"])
        track["duration"] = frames / RATE
        path = directory / f"track-{track['track']}.wav"
        wav(path, track["pcm"])
        track["wav"] = path
    manifest = [{key: value for key, value in track.items() if key not in ("pcm", "wav")} for track in tracks]
    save(directory / "frozen-corpus.json", {"budgets": BUDGETS, "tracks": manifest,
        "review": "Historical curated utterance labels; no reviewed word anchors",
        "frozenAtUtc": datetime.now(timezone.utc).isoformat()})
    return tracks, frames


def chunk(folder, channel, source, sequence, start, pcm):
    target = folder / "channels" / channel / "chunks" / f"{sequence:012d}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.with_suffix(".pcm").write_bytes(pcm)
    save(target.with_suffix(".json"), {"sequence": sequence, "firstSampleIndex": start,
        "frameCount": len(pcm) // 2, "sampleRate": RATE, "channels": 1,
        "sourceUuid": source, "pluginMonotonicNs": round(start * 1e9 / RATE),
        "sha256": hashlib.sha256(pcm).hexdigest(),
        "receivedAtUtc": datetime.now(timezone.utc).isoformat()})


async def run(arguments):
    directory = arguments.output.resolve()
    directory.mkdir(parents=True, exist_ok=False)
    tracks, frames = prepare(directory)
    projects = FileProjectRepository(directory / "data/projects")
    project = projects.create(ProjectCreate(name="19A Vietnamese track baseline", language="vi"))
    library = FileMediaLibrary(projects)
    importer = MediaImportProcessor(arguments.studio, library, shutil.which("ffmpeg"))
    recording = str(uuid4())
    channels, sources = [str(uuid4()) for _ in tracks], [str(uuid4()) for _ in tracks]
    folder = Path(project.project_path) / "assets/obs-livelink" / recording
    journal = {"recording": {"recordingId": recording, "projectId": project.id,
        "status": "recording", "archiveStatus": "pending", "startedMonotonicNs": 0,
        "endedMonotonicNs": None, "capturePauseIntervals": [], "channelIntervals": []},
        "channels": [{"channelId": channel, "relayLabel": f"Track {i+1}"}
                     for i, channel in enumerate(channels)]}
    save(folder / "recording.json", journal)
    live = ObsLiveLinkTranscription(projects, arguments.studio, lambda: False)
    step = RATE // 4
    epoch = time.monotonic()
    for sequence, start in enumerate(range(0, frames, step)):
        if arguments.real_cadence:
            await asyncio.sleep(max(0, epoch + (start + step) / RATE - time.monotonic()))
        for i, track in enumerate(tracks):
            pcm = track["pcm"][start * 2:(start + step) * 2]
            chunk(folder, channels[i], sources[i], sequence, start, pcm)
            live.offer(project_id=project.id, recording_id=recording, channel_id=channels[i],
                source_uuid=sources[i], alias=f"Track {i+1}", sequence=sequence,
                first_sample=start, sample_rate=RATE, channels=1,
                plugin_monotonic_ns=round(start * 1e9 / RATE), recording_started_ns=0, pcm=pcm)
        await asyncio.sleep(0)
    live.finish(recording)
    await asyncio.wait_for(asyncio.gather(*list(live._tasks.values())), 600)
    events = live.snapshot(project.id, recording)["events"]
    live_tracks = [{**{key: track[key] for key in ("track", "reference", "duration")},
        "text": " ".join(event["text"] for event in events
            if event["channelId"] == channels[i] and event["status"] == "final")}
        for i, track in enumerate(tracks)]
    save(directory / "livelink-live.json", {"score": score_tracks(live_tracks, "live"),
        "events": events, "elapsedSeconds": time.monotonic() - epoch,
        "cadence": "real adapter cadence" if arguments.real_cadence else "accelerated replay"})
    print("LiveLink live finished", flush=True)

    # A second owned journal freezes the button-time prefix, then receives growth.
    detail_id = str(uuid4())
    detail_folder = folder.with_name(detail_id)
    journal["recording"]["recordingId"] = detail_id
    save(detail_folder / "recording.json", journal)
    detail = ObsLiveLinkDetailedStt(library, importer)
    calls = []
    async def timed_recognize(path, model, recognize, phase):
        started = time.monotonic()
        try:
            item = await recognize(path, model)
            calls.append({"phase": phase, "model": model, "path": str(path),
                          "elapsedSeconds": time.monotonic() - started,
                          "wordCount": len(item.get("words", []))})
            return item
        finally:
            save(directory / "recognizer-calls.json", calls)
    detail_recognize = detail.recognizer
    detail.recognizer = lambda path, model: timed_recognize(path, model, detail_recognize, "livelink-detailed")
    initial = 20 * RATE
    for i, track in enumerate(tracks):
        chunk(detail_folder, channels[i], sources[i], 0, 0, track["pcm"][:initial*2])
    detail.configure(project, detail_id, 60, channels)
    await detail.process_once(project, detail_id)
    for i, track in enumerate(tracks):
        chunk(detail_folder, channels[i], sources[i], 1, initial, track["pcm"][initial*2:])
    await detail.process_once(project, detail_id)
    journal["recording"].update(status="stopped", endedMonotonicNs=round(frames*1e9/RATE))
    save(detail_folder / "recording.json", journal)
    await detail.process_once(project, detail_id)
    detail_tracks, blocks = [], {}
    for i, channel in enumerate(channels):
        results = [json.loads(path.read_text(encoding="utf-8"))
                   for path in sorted((detail_folder / "detailed-stt" / channel).glob("*.json"))]
        combined = GrowingMkvTranscription._combine(results, frames/RATE)
        detail_tracks.append({**{key: tracks[i][key] for key in ("track", "reference", "duration")}, **combined})
        blocks[channel] = [{key: value for key, value in result.items() if key != "item"} for result in results]
    save(directory / "livelink-detailed.json", {"score": score_tracks(detail_tracks, "detailed"),
        "tracks": detail_tracks, "blocks": blocks, "state": detail.status(project, detail_id)})
    print("LiveLink detailed finished", flush=True)

    closed = directory / "closed.mkv"
    subprocess.run([importer.ffmpeg_path, "-y", "-v", "error", "-i", str(tracks[0]["wav"]),
        "-i", str(tracks[1]["wav"]), "-map", "0:a", "-map", "1:a", "-c:a", "flac",
        "-cluster_time_limit", "5000", str(closed)], check=True, capture_output=True)
    scan = scan_committed(closed, final=True)
    growing = directory / "growing.mkv"
    payload = closed.read_bytes()
    # Publish existing complete clusters before import, then append, never rewrite.
    cut = scan.clusters[max(1, len(scan.clusters)//5)-1].end
    growing.write_bytes(payload[:cut])
    follower = FileGrowingMkvFollower(library, LocalMediaSourceRegistry(directory / "machine"),
                                      importer.ffmpeg_path, importer.ffprobe_path)
    result = follower.start(project, str(growing), [0, 1], [0, 1], 60)
    follower.poll(project, result.asset.id)
    mkv = GrowingMkvTranscription(library, importer)
    mkv_recognize = mkv.recognizer
    mkv.recognizer = lambda path, model: timed_recognize(path, model, mkv_recognize, "mkv")
    # Measure live-only initial backlog before the detailed button, then freeze it.
    state = follower.status(project, result.asset.id)
    for _ in range(20):
        progress = await mkv.process_once(project, result.asset.id)
        if all(progress["tracks"][track["assetId"]]["liveFrame"] + 3*RATE > track["frames"]
               for track in state["tracks"]):
            break
    mkv_live = []
    for i, asset_id in enumerate(result.track_asset_ids):
        asset = library.get(project.id, asset_id)
        prefix = state["tracks"][i]["frames"] / RATE
        reference = " ".join(turn["text"] for turn in tracks[i]["turns"] if turn["end"] <= prefix)
        mkv_live.append({"track": i+1, "reference": reference, "text": asset.text,
                         "words": asset.words, "duration": prefix})
    # Prefix can cut an utterance: report output without claiming its CER is valid.
    save(directory / "mkv-live-prefix.json", {"tracks": mkv_live,
        "qualityScorable": False, "reason": "Prefix may bisect a curated utterance; needs reviewed prefix labels"})
    follower.configure_detailed_stt(project, result.asset.id, 60)
    await mkv.process_once(project, result.asset.id)
    with growing.open("ab") as output:
        output.write(payload[cut:]); output.flush(); os.fsync(output.fileno())
    follower.poll(project, result.asset.id)
    await mkv.process_once(project, result.asset.id)
    follower.finish(project, result.asset.id)
    for _ in range(10):
        progress = await mkv.process_once(project, result.asset.id)
        if progress["done"]:
            break
    assert progress["done"], "MKV detailed cursor did not drain"
    mkv_tracks = []
    for i, asset_id in enumerate(result.track_asset_ids):
        asset = library.get(project.id, asset_id)
        mkv_tracks.append({**{key: tracks[i][key] for key in ("track", "reference", "duration")},
                           "text": asset.text, "words": asset.words})
    save(directory / "mkv-detailed.json", {"score": score_tracks(mkv_tracks, "detailed"),
        "tracks": mkv_tracks, "state": progress, "parentId": result.asset.id,
        "projectId": project.id, "growingBytesAtImport": cut})
    # Separate live-only follow: full reviewed text, no prefix cutting a label.
    live_result = follower.start(project, str(growing), [0, 1], [0, 1], 60)
    follower.poll(project, live_result.asset.id)
    live_status = follower.status(project, live_result.asset.id)
    for _ in range(100):
        progress = await mkv.process_once(project, live_result.asset.id)
        if all(progress["tracks"][track["assetId"]]["liveFrame"] + 3*RATE > track["frames"]
               for track in live_status["tracks"]):
            break
    full_live_tracks = []
    for i, asset_id in enumerate(live_result.track_asset_ids):
        asset = library.get(project.id, asset_id)
        full_live_tracks.append({**{key: tracks[i][key] for key in ("track", "reference", "duration")},
                                 "text": asset.text, "words": asset.words})
    save(directory / "mkv-live.json", {"score": score_tracks(full_live_tracks, "live"),
        "tracks": full_live_tracks, "state": progress,
        "cadence": "Initial backlog catch-up, not capture latency"})
    await mkv.close()
    for track in tracks:
        for turn in track["turns"]:
            assert hashlib.sha256(Path(turn["source"]).read_bytes()).hexdigest() == turn["sha256"]
    print("MKV detailed finished; source hashes unchanged", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--real-cadence", action="store_true")
    asyncio.run(run(parser.parse_args()))
