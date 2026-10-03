"""Read-only UX-10B input, fresh owned outputs; no production instrumentation.

Run from the checkout with its project Python. Local HTTP fixture intentionally
omits pairing, background STT and OBS callbacks: those are separate live gates.
"""
import argparse
import asyncio
from collections import defaultdict
from datetime import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import socket
import statistics
import sys
import threading
import time
from types import SimpleNamespace
from uuid import uuid4
import wave

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
import httpx
from fastapi import FastAPI, Request
import uvicorn
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from app.adapters.obs_livelink_runtime import ObsLiveLinkRuntime
from app.adapters import obs_livelink_archive as archive_module
from app.domain.models import ProjectCreate
from app.domain.obs_livelink_state import ObsCaptureRecording, ObsChannel, ObsLiveLinkState

SOURCE = ROOT / ".scratch/ux-10b/projects/ux10b-six-live-sources/assets/obs-livelink/f9495cf6-1881-51ce-9f46-f01bb6d18d1c"


def summary(values):
    if not values:
        return {"count": 0}
    ordered = sorted(values)
    return {"count": len(values), "totalMs": sum(values), "p50Ms": statistics.median(values),
            "p95Ms": ordered[math.ceil(len(values) * .95) - 1], "maxMs": max(values)}


def load():
    journal = json.loads((SOURCE / "recording.json").read_text(encoding="utf-8"))
    entries = []
    gaps = defaultdict(list)
    for folder in sorted((SOURCE / "channels").iterdir()):
        previous = None
        for path in sorted((folder / "chunks").glob("*.json")):
            item = json.loads(path.read_text(encoding="utf-8"))
            pcm = path.with_suffix(".pcm").read_bytes()
            assert len(pcm) == item["frameCount"] * item["channels"] * 2
            assert hashlib.sha256(pcm).hexdigest() == item["sha256"]
            assert item["sequence"] == (previous["sequence"] + 1 if previous else 0)
            if previous:
                end = previous["firstSampleIndex"] + previous["frameCount"]
                assert item["firstSampleIndex"] >= end
                if item["firstSampleIndex"] != end:
                    gaps[item["sourceUuid"]].append([end, item["firstSampleIndex"]])
            entries.append((folder.name, item, pcm, path))
            previous = item
    acceptance = json.loads((ROOT / ".scratch/ux-10b/media-acceptance.json").read_text())
    for track in acceptance["tracks"]:
        assert gaps[track["sourceUuid"]] == track["sampleGaps"]
        assert len(track["declaredGaps"]) == len(track["sampleGaps"])
        assert all(gap["classification"] == "app-paused" for gap in track["declaredGaps"])
    entries.sort(key=lambda entry: (entry[1]["pluginMonotonicNs"], entry[0], entry[1]["sequence"]))
    return journal, entries, dict(gaps)


def retained(journal, entries):
    rec = journal["recording"]
    start = datetime.fromisoformat(rec["startedAtUtc"].replace("Z", "+00:00")).timestamp()
    duration = (rec["endedMonotonicNs"] - rec["startedMonotonicNs"]) / 1e9
    arrivals, ages = [], []
    for _, item, _, _ in entries:
        received = datetime.fromisoformat(item["receivedAtUtc"]).timestamp() - start
        end = (item["pluginMonotonicNs"] - rec["startedMonotonicNs"]) / 1e9 + item["frameCount"] / item["sampleRate"]
        arrivals.append(received)
        ages.append((received - end) * 1000)
    log = (ROOT / ".scratch/ux-10b/obs/config/obs-studio/logs/2026-10-03 18-53-38.txt").read_text(encoding="utf-8")
    spool = []
    pattern = r"(\d\d):(\d\d):(\d\d\.\d+): .*PCM disk spool pending=(\d+) volatile=(\d+) sends=(\d+) http_avg_ms=(\d+) http_max_ms=(\d+) ack_commits=(\d+) ack_total_ms=(\d+)"
    for match in re.finditer(pattern, log):
        h, m, sec, *values = match.groups()
        spool.append({"localSeconds": int(h)*3600+int(m)*60+float(sec), **dict(zip(
            ("pending", "volatile", "sends", "httpAvgMs", "httpMaxMs", "ackCommits", "ackTotalMs"), map(int, values)))})
    recording_overflow = re.findall(r"PCM queue overflow recording=" + rec["recordingId"] + r" .*", log)
    idle_overflow = re.findall(r"PCM queue overflow recording= channel=.*", log)
    waits = [int(v) / 1e6 for v in re.findall(r"max_callback_wait_ns=(\d+)", log)]
    peak = [int(v) for v in re.findall(r"peak_frames=(\d+)", log)]
    stop_local = (start + duration + 7*3600) % 86400
    live_spool = [v for v in spool if (start + 7*3600) % 86400 <= v["localSeconds"] <= stop_local]
    # Regression of all live samples, plus the pre-pause active window, in chunks/s.
    def slope(rows):
        if len(rows) < 2:
            return None
        xs = [v["localSeconds"] for v in rows]
        ys = [v["pending"] for v in rows]
        xm, ym = statistics.mean(xs), statistics.mean(ys)
        return sum((x-xm)*(y-ym) for x,y in zip(xs,ys)) / sum((x-xm)**2 for x in xs)
    pre_pause_end = stop_local
    if rec["capturePauseIntervals"]:
        pre_pause_end = (start + 7*3600) % 86400 + (rec["capturePauseIntervals"][0]["startMonotonicNs"]-rec["startedMonotonicNs"])/1e9
    ready_time = (SOURCE / "recording.json").stat().st_mtime - start
    return {"durationSeconds": duration, "receiveAgeApproxMs": summary(ages),
            "stopToLastReceiveSeconds": max(arrivals)-duration,
            "lastReceiveToJournalMtimeReadyApproxSeconds": ready_time-max(arrivals),
            "clockCaveat": "receivedAtUtc is ingress time before fsync, not a durable ACK; journal mtime is retained-file evidence, not a logged ready event",
            "spoolSamples": live_spool, "peakPending": max(v["pending"] for v in live_spool),
            "prePausePendingSlopeChunksPerSecond": slope([v for v in live_spool if v["localSeconds"] < pre_pause_end]),
            "wholeTakePendingSlopeChunksPerSecond": slope(live_spool),
            "recordingOverflowLogCount": len(recording_overflow), "excludedIdleOverflowLogCount": len(idle_overflow),
            "callbackWaitMaximumMsHistoricalIncludingIdle": max(waits, default=0),
            "callbackPeakFramesHistoricalIncludingIdle": max(peak, default=0),
            "callbackQueueAge": None, "callbackQueueAgeReason": "Old log has only peak/counts, no per-chunk enqueue/dequeue clock",
            "httpSamplesAreWindowAveragesNotPercentiles": True}


def run(entries, journal, target, instrument, finalize):
    target.mkdir(parents=True, exist_ok=False)
    projects = FileProjectRepository(target / "projects")
    project = projects.create(ProjectCreate(name="18A isolated six-source replay"))
    media = FileMediaLibrary(projects)
    # Auth is outside this storage/HTTP fixture; no real pairing files are read.
    connection = SimpleNamespace(require_connection=lambda *args: None)
    runtime = ObsLiveLinkRuntime(connection, projects, target / "machine")
    rec_data = {**journal["recording"], "projectId": project.id, "archiveStatus": "pending", "sourceArchive": None}
    recording = ObsCaptureRecording.model_validate(rec_data)
    channels = [ObsChannel.model_validate(v) for v in journal["channels"]]
    runtime._state = ObsLiveLinkState(connection_id=recording.connection_id, install_id=str(uuid4()),
                                    process_instance_id=str(uuid4()), completed_recordings=[recording], channels=channels)
    folder = Path(project.project_path) / "assets/obs-livelink" / recording.recording_id
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text(json.dumps({**journal, "recording": rec_data, "sourceStems": [], "archiveSha256": None}), encoding="utf-8")
    runtime._capture_recording_id = recording.recording_id
    audio = FileObsLiveLinkAudio(connection, runtime, projects, media, str(ROOT / ".tools/ffmpeg/ffmpeg.exe"), str(ROOT / ".tools/ffmpeg/ffprobe.exe"))
    measurements = defaultdict(list)
    restores = []
    def wrap(obj, name, label):
        original = getattr(obj, name)
        def timed(*args, **kwargs):
            begin = time.perf_counter_ns()
            try:
                return original(*args, **kwargs)
            finally:
                measurements[label].append((time.perf_counter_ns()-begin)/1e6)
        setattr(obj, name, timed)
        restores.append((obj, name, original))
    if instrument:
        wrap(audio, "_write_chunk_pair", "pcmAndMetadataDurable")
        wrap(audio.waveform, "note_chunk", "waveformComputeAndAtomicPublish")
        wrap(runtime, "note_durable_chunk", "captureCheckpointPersistence")
        wrap(audio, "chunk", "apiChunkTotal")
        wrap(os, "fsync", "fsyncCallsOverlappingNotAdditive")
        wrap(os, "replace", "atomicPublish")
    app = FastAPI()
    @app.put("/chunk/{channel}/{sequence}")
    async def chunk(channel: str, sequence: int, request: Request):
        metadata = json.loads(request.headers["x-profile-metadata"])
        pcm = await request.body()
        return await asyncio.to_thread(audio.chunk, "fixture", install_id="fixture", connection_id="fixture", epoch="fixture",
            recording_id=recording.recording_id, channel_id=channel, source_uuid=metadata["sourceUuid"], sequence=sequence,
            first_sample_index=metadata["firstSampleIndex"], frame_count=metadata["frameCount"], sample_rate=metadata["sampleRate"],
            channels=metadata["channels"], obs_audio_timestamp_ns=metadata["obsAudioTimestampNs"],
            plugin_monotonic_ns=metadata["pluginMonotonicNs"], sha256=metadata["sha256"], pcm=pcm)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error", access_log=False))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    deadline = time.monotonic()+10
    while not server.started:
        if not thread.is_alive() or time.monotonic() > deadline:
            raise RuntimeError("Owned HTTP fixture failed startup")
        time.sleep(.01)
    acks = []
    started = time.perf_counter()
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=60) as client:
            for index, (channel, item, pcm, _) in enumerate(entries):
                before = time.perf_counter()
                response = client.put(f"/chunk/{channel}/{item['sequence']}", content=pcm,
                                      headers={"x-profile-metadata": json.dumps(item, separators=(",", ":"))})
                response.raise_for_status()
                assert response.json() == {"sequence": item["sequence"], "durable": True, "duplicate": False}
                after = time.perf_counter()
                measurements["httpDurableAck"].append((after-before)*1000)
                # Verify data exists immediately after ACK, not only after finalize.
                path = folder / "channels" / channel / "chunks" / f"{item['sequence']:012d}.pcm"
                assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]
                acks.append(after-started)
                if index % 250 == 0:
                    print(f"{target.name}: {index+1}/{len(entries)} ACKs", flush=True)
    finally:
        server.should_exit = True
        thread.join(10)
        sock.close()
        if thread.is_alive():
            raise RuntimeError("Owned HTTP server did not stop")
    ingress_seconds = acks[-1]
    tail = None
    finalize_seconds = None
    if finalize:
        # Attribute subprocess stages without modifying the production module.
        original_run = archive_module.subprocess.run
        def subprocess_run(command, *args, **kwargs):
            begin = time.perf_counter()
            try:
                return original_run(command, *args, **kwargs)
            finally:
                name = ("mkaMux" if "matroska" in command else "analysisFromMka" if str(command[-1]).endswith("analysis.wav.part")
                        else "analysisFromStem" if str(command[-1]).endswith("analysis.wav") else "archiveProbeAttachment")
                measurements[name].append((time.perf_counter()-begin)*1000)
        wrap(audio.archiver, "_verify", "mkaVerificationIncludingDecode")
        wrap(archive_module, "_decoded_hash", "mkaDecodedHash")
        archive_module.subprocess.run = subprocess_run
        begin = time.perf_counter()
        try:
            result = audio._finalize(recording.recording_id, recording, channels, update_runtime=False)
            finalize_seconds = time.perf_counter()-begin
            tail = time.perf_counter()-started-ingress_seconds
        finally:
            archive_module.subprocess.run = original_run
        assert result["artifactReady"]
        assert len(result["sourceArchive"]["tracks"]) == 6
        assert (Path(project.project_path) / result["sourceArchive"]["sourcePath"]).is_file()
        for track in result["sourceArchive"]["tracks"]:
            with wave.open(str(Path(project.project_path) / track["analysisPath"]), "rb") as wav:
                assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (24000, 1, 2)
                assert abs(wav.getnframes()/24000 - (recording.ended_monotonic_ns-recording.started_monotonic_ns)/1e9) < .01
    for obj, name, original in reversed(restores):
        setattr(obj, name, original)
    report = {"chunkCount": len(entries), "inputBytes": sum(len(v[2]) for v in entries), "instrumented": instrument,
              "ingressSeconds": ingress_seconds, "replayDrainToLastAckSeconds": ingress_seconds,
              "stopToLastAckSeconds": None,
              "stopDefinition": "All source input and stopped journal pre-exist. Drain clock starts before first upload; hardware Stop-to-ACK is unavailable",
              "lastAckToReadySeconds": tail,
              "finalizeSeconds": finalize_seconds,
              "stages": {name: summary(values) for name, values in measurements.items()},
              "ackTimesSeconds": acks, "projectPath": project.project_path,
              "exclusions": ["OBS callback", "native scheduling", "pairing", "STT/background workers", "WinHTTP client"]}
    (target / "report.json").write_text(json.dumps(report, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--control", action="store_true")
    parser.add_argument("--finalize", action="store_true")
    args = parser.parse_args()
    journal, entries, gaps = load()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    manifest = args.output.parent / "native-manifest.txt"
    manifest.write_text("\n".join('"' + path.with_suffix(".pcm").as_posix() + '" ' + " ".join(map(str, [
        channel, item["sourceUuid"], item["sequence"], item["firstSampleIndex"], item["obsAudioTimestampNs"],
        item["pluginMonotonicNs"], item["frameCount"], item["sampleRate"], item["channels"]]))
        for channel,item,_,path in entries), encoding="utf-8")
    print(json.dumps({"validatedChunks": len(entries), "tracks": len(gaps), "pauseGaps": gaps}), flush=True)
    report = run(entries[:args.limit] if args.limit else entries, journal, args.output.resolve(), not args.control, args.finalize)
    report["retainedTake"] = retained(journal, entries)
    report["inputCatalogSha256"] = hashlib.sha256(b"".join(path.read_bytes() for _,_,_,path in entries)).hexdigest()
    report["sourceSampleGaps"] = gaps
    report["sourceContinuityPassed"] = True
    (args.output / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ("ackTimesSeconds", "retainedTake")}, indent=2), flush=True)


if __name__ == "__main__":
    main()
