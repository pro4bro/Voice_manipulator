"""Durable local analysis/render jobs. A completed render requires decoded media."""
import json
import os
import subprocess
from datetime import datetime, timezone
from threading import RLock, Thread
from uuid import uuid4
from app.adapters.activity_center import CENTER
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.file_lipsync_faces import FileLipSyncFaces, analysis_inputs
from app.adapters.lipsync_preflight import digest_file
from app.adapters.listening_ports import process_is_alive
from app.domain.lipsync_coverage import coverage
from app.domain.lipsync_preflight import speech_intersections, needs_more_detection, conflicting_source_anchors
from app.domain.lipsync_faces import schedule_faces
from app.domain.lipsync_settings import resolve_lipsync_settings


def now():
    return datetime.now(timezone.utc).isoformat()


class LipSyncJobs:
    _lock = RLock()

    def __init__(self, store, runtime, speakers, gpu_lease=None):
        self.store, self.runtime, self.gpu_lease = store, runtime, gpu_lease
        self.faces = FileLipSyncFaces(store, speakers)
        self.active = {}

    def _write(self, directory, name, value):
        with self._lock:
            FileProjectRepository._atomic_write(directory / name, json.dumps(value, ensure_ascii=False, indent=2))

    def list(self, project_id):
        directory = self.store.jobs_root(project_id)
        jobs = []
        for path in directory.glob("*/status.json"):
            try:
                jobs.append(self.get(project_id, path.parent.name))
            except (ValueError, KeyError, OSError):
                continue
        return sorted(jobs, key=lambda item: item["createdAt"], reverse=True)

    def get(self, project_id, job_id):
        with self._lock:
            return self._get(project_id, job_id)

    def _get(self, project_id, job_id):
        directory = self.faces.directory(project_id, job_id)
        path = directory / "status.json"
        if not path.is_file():
            raise KeyError("Không có job")
        value = json.loads(path.read_text(encoding="utf-8"))
        if value["status"] in ("queued", "running") and not process_is_alive(value["ownerPid"]):
            value.update(status="interrupted", error="API đã dừng; kiểm tra và chạy lại", updatedAt=now())
            self._write(directory, "status.json", value)
        return value

    def plan(self, project_id, analysis_id):
        document = self.store.get(project_id)
        inputs = analysis_inputs(self.store, project_id, document)
        analysis, review = self.faces.get(project_id, analysis_id)
        directory = self.faces.directory(project_id, analysis_id)
        original = json.loads((directory / "request.json").read_text(encoding="utf-8"))
        blockers = []
        if inputs["key"] != original["key"]:
            blockers.append("Nguồn/phạm vi nhận diện đã đổi; phân tích lại")
        assets = self.store.validate_sources(project_id, document)
        parts = coverage(document, assets, document.sync_scope, "sync")
        output = self.store.outputs.get(project_id, document.audio.output_id) if document.audio else None
        candidates = speech_intersections(document, parts, output)
        tasks = schedule_faces(candidates, analysis, review)
        available_speakers = {speaker.id for speaker in self.faces.speakers.get(project_id).speakers}
        if any(task["speakerProfileId"] not in available_speakers for task in tasks):
            blockers.append("Speaker Profile đã bị xóa; gán lại khuôn mặt")
        if not tasks:
            blockers.append("Chưa có lượt thoại được gán mặt đã duyệt")
        if needs_more_detection(tasks, inputs["coverage"]):
            blockers.append("Phạm vi nhận diện chưa phủ đủ phần LipSync")
        if document.sync_scope.mode == "source" and conflicting_source_anchors(tasks):
            blockers.append("Cùng source/time có nhiều audio anchor; chọn lại phạm vi")
        engine = self.store.catalog.get(document.engine_id) if document.engine_id else None
        resolved = resolve_lipsync_settings(engine, document.engine_settings.get(engine.id, {})) if engine else None
        if not engine or engine.id != "musetalk-lipsync":
            blockers.append("Adapter hiện hỗ trợ MuseTalk offline v1.5; engine khác chưa có đường chạy đã kiểm chứng")
        elif resolved["pipeline"] != "offline" or resolved["parameters"].get("version") != "v15":
            blockers.append("Chọn MuseTalk Offline v1.5 cho adapter hiện tại")
        if resolved and any(resolved["parameters"].get(key) for key in ("use_saved_coord", "saved_coord")):
            blockers.append("Adapter dùng face review; không dùng cache toạ độ tự chọn mặt của upstream")
        blockers.extend(self.runtime.report()["blockers"])
        return {"ready": not blockers, "blockers": blockers, "tasks": tasks, "skippedTurns": len(candidates) - len({(t['clipId'], t['rowId'], t['timelineStart'], t['timelineEnd']) for t in tasks}),
                "revision": document.revision, "analysisRevision": review.revision,
                "engine": resolved, "inputs": inputs}

    def start(self, project_id, kind, revision, analysis_id=None, analysis_revision=None):
        with self._lock, self.store._lock:
            document = self.store.get(project_id)
            if document.revision != revision:
                raise ScriptRevisionConflict("Lưu/tải lại bố cục trước khi chạy")
            if any(job["status"] in ("queued", "running") for job in self.list(project_id)):
                raise ValueError("Project đang có job LipSync chạy")
            if kind == "analysis":
                report = self.runtime.report(analysis=True)
                if not report["ready"]:
                    raise ValueError("; ".join(report["blockers"]))
                request = {"kind": kind, **analysis_inputs(self.store, project_id, document)}
                if not request["coverage"]:
                    raise ValueError("Phạm vi nhận diện không có video")
            elif kind == "render":
                plan = self.plan(project_id, analysis_id)
                if not plan["ready"]:
                    raise ValueError("; ".join(plan["blockers"]))
                if plan["analysisRevision"] != analysis_revision:
                    raise ScriptRevisionConflict("Face review đã đổi; kiểm tra kế hoạch lại")
                analysis, review = self.faces.get(project_id, analysis_id)
                reviewed = {o.id: o for o in review.observations}
                observations = [{**o, "faceId": reviewed[o["id"]].face_id, "reviewed": reviewed[o["id"]].reviewed} for o in analysis["observations"]]
                audio_path = self.store.outputs.audio_path(project_id, document.audio.output_id)
                # All composition sources are needed even when detection targets a subset.
                sources = dict(plan["inputs"]["sources"])
                for clip in document.clips:
                    path = self.store.media.resolve_video_path(project_id, clip.asset_id)
                    sources[clip.asset_id] = {"path": path.relative_to(self.store.root(project_id)).as_posix(), **digest_file(path)}
                request = {"kind": kind, "composition": document.model_dump(by_alias=True), "tasks": plan["tasks"],
                    "key": plan["inputs"]["key"], "sources": sources, "analysisId": analysis_id, "analysisRevision": analysis_revision,
                    "observations": observations, "engine": plan["engine"], "audio": {"path": audio_path.relative_to(self.store.root(project_id)).as_posix(), **digest_file(audio_path)}}
            else:
                raise ValueError("Loại job không hợp lệ")
            identifier = str(uuid4())
            directory = self.faces.directory(project_id, identifier)
            lease = self.gpu_lease.acquire(f"LipSync:{identifier}") if kind == "render" and self.gpu_lease else None
            state = {"id": identifier, "kind": kind, "status": "queued", "ownerPid": os.getpid(), "revision": revision,
                     "analysisId": analysis_id, "analysisRevision": analysis_revision, "createdAt": now(), "updatedAt": now(), "error": None}
            CENTER.queue_task("lipsync", "Lip Sync · " + ("Phân tích khuôn mặt" if kind == "analysis" else "Dựng video"),
                task_id=f"lipsync:{identifier}", project_id=project_id)
            try:
                self._write(directory, "request.json", request)
                self._write(directory, "status.json", state)
                self.active[identifier] = {"cancel": False, "process": None}
                Thread(target=self._run, args=(project_id, directory, state, lease), daemon=True).start()
            except Exception as exc:
                CENTER.finish_task(f"lipsync:{identifier}", status="failed", error=str(exc))
                if lease:
                    self.gpu_lease.release(lease.token)
                raise
            return state

    def cancel(self, project_id, job_id):
        with self._lock:
            state = self.get(project_id, job_id)
            active = self.active.get(job_id)
            if state["status"] in ("queued", "running"):
                if not active:
                    raise ValueError("Job thuộc API khác; hủy tại instance đã chạy job")
                active["cancel"] = True
                if active["process"]:
                    process = active["process"]
                    if os.name == "nt" and process.poll() is None:
                        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                    elif process.poll() is None:
                        process.terminate()
            return state

    def _run(self, project_id, directory, state, lease):
        active = self.active[state["id"]]
        task_id = CENTER.start_task("lipsync", "Lip Sync · " + ("Phân tích khuôn mặt" if state["kind"] == "analysis" else "Dựng video"),
            task_id=f"lipsync:{state['id']}", project_id=project_id, detail="Kiểm tra model và nguồn")
        try:
            request = json.loads((directory / "request.json").read_text(encoding="utf-8"))
            if not self.runtime.report(analysis=state["kind"] == "analysis", verify=True)["ready"]:
                raise ValueError("Model verification failed")
            with self._lock:
                if active["cancel"]:
                    raise InterruptedError("Đã hủy")
                state.update(status="running", updatedAt=now())
                CENTER.update_task(task_id, detail="Đang xử lý video", fraction=None)
                self._write(directory, "status.json", state)
                with (directory / "worker.log").open("w", encoding="utf-8") as log:
                    process = subprocess.Popen([str(self.runtime.python), str(self.runtime.worker), "--root", str(self.runtime.root),
                        "--project", str(self.store.root(project_id)), "--job", str(directory)], stdout=log, stderr=subprocess.STDOUT,
                        env={**os.environ, "PYTHONUTF8": "1"},
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                active["process"] = process
            code = process.wait()
            if active["cancel"]:
                raise InterruptedError("Đã hủy")
            if code != 0 or not (directory / "result.json").is_file():
                raise ValueError(f"Worker thất bại (exit {code}); xem worker.log")
            # Inputs must still be the exact bytes processed, regardless of later UI edits.
            for source in list(request["sources"].values()) + ([request["audio"]] if request.get("audio") else []):
                if digest_file(self.store.root(project_id) / source["path"])["sha256"] != source["sha256"]:
                    raise ValueError("Nguồn đổi trong lúc xử lý; không chấp nhận kết quả")
            result = json.loads((directory / "result.json").read_text(encoding="utf-8"))
            CENTER.update_task(task_id, detail="Kiểm tra kết quả và artifact", fraction=None)
            if state["kind"] == "render":
                from app.adapters.lipsync_video_qc import verify_render
                result["qc"] = verify_render(self.runtime, self.store.root(project_id), result)
                self._write(directory, "result.json", result)
                state["artifacts"] = [{"index": index, "label": "Composition" if index == 0 else f"Source · {result['derivatives'][index-1]['clipId']}"} for index in range(len(result["qc"]["artifacts"]))]
            with self._lock:
                if active["cancel"]:
                    raise InterruptedError("Đã hủy")
                state.update(status="completed", updatedAt=now(), summary={k: result[k] for k in ("sampledFrames", "appliedFaces", "skippedFaces") if k in result})
        except Exception as exc:
            state.update(status="cancelled" if isinstance(exc, InterruptedError) else "failed", error=str(exc), updatedAt=now())
        finally:
            try:
                self._write(directory, "status.json", state)
                CENTER.finish_task(task_id, status="complete" if state["status"] == "completed" else state["status"], error=state.get("error"))
            except Exception as exc:
                CENTER.finish_task(task_id, status="failed", error=str(exc))
                raise
            finally:
                with self._lock:
                    self.active.pop(state["id"], None)
                if lease:
                    self.gpu_lease.release(lease.token)
