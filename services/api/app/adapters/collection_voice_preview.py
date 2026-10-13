from __future__ import annotations

from array import array
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import threading
from typing import Literal
from uuid import uuid4
import wave

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.adapters.file_voice_collections import FileVoiceCollections
from app.adapters.engine_worker import EngineWorkerProcess
from app.adapters.omnivoice_generator import VoiceGenerator
from app.domain.models import DomainModel, VoiceCollectionEntry

MIN_SAMPLE_SECONDS = 15
MAX_SAMPLE_BYTES = 64 * 1024 * 1024
MAX_METADATA_BYTES = 16 * 1024 * 1024


class CollectionVoicePreview(DomainModel):
    status: Literal["missing", "queued", "running", "ready", "error", "unsupported"]
    script: str
    duration: float | None = None
    audio_url: str | None = None
    error: str | None = None
    training_seconds: float | None = None
    emotion_support: str = "Chưa có thông tin"


def _read_json(path: Path) -> dict:
    FileVoiceCollections._resolve_tree_member(path.parent, path)
    if path.stat().st_size > MAX_METADATA_BYTES:
        raise ValueError("Preview metadata exceeds the size limit.")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Preview metadata is invalid.")
    return value


def preview_fingerprint(entry: VoiceCollectionEntry, lineage: dict) -> str:
    # Collection/entry IDs change when a package travels; the immutable inputs do not.
    snapshot = entry.model_dump(mode="json", by_alias=True, exclude={"id"})
    data = json.dumps([snapshot, lineage], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def probe_sample(audio: Path) -> dict:
    if audio.is_symlink() or not audio.is_file() or not 0 < audio.stat().st_size <= MAX_SAMPLE_BYTES:
        raise ValueError("Không có WAV mẫu hợp lệ.")
    try:
        with wave.open(str(audio), "rb") as wav:
            rate, channels, width, frames = wav.getframerate(), wav.getnchannels(), wav.getsampwidth(), wav.getnframes()
            if not 8000 <= rate <= 192000 or channels not in (1, 2) or width != 2 or wav.getcomptype() != "NONE":
                raise ValueError("Mẫu phải là WAV PCM 16-bit, mono hoặc stereo.")
            if frames / rate < MIN_SAMPLE_SECONDS:
                raise ValueError("Audio được tạo ngắn hơn 15 giây; chưa công bố mẫu.")
            read_frames, peak = 0, 0
            while chunk := wav.readframes(65536):
                samples = array("h")
                samples.frombytes(chunk)
                peak = max(peak, max(abs(value) for value in samples))
                read_frames += len(samples) // channels
            if read_frames != frames or peak == 0:
                raise ValueError("WAV mẫu bị cắt hoặc không có tín hiệu.")
    except (wave.Error, EOFError, OSError) as exc:
        raise ValueError("Không đọc được WAV mẫu.") from exc
    return {"duration": frames / rate, "sampleRate": rate, "channels": channels, "sampleWidth": width,
            "peak": peak / 32768, "sha256": hashlib.sha256(audio.read_bytes()).hexdigest()}


def verified_preview(folder: Path, entry: VoiceCollectionEntry, lineage: dict) -> dict | None:
    preview = folder / "preview"
    if not preview.exists():
        return None
    FileVoiceCollections._resolve_tree_member(folder, preview)
    record = _read_json(preview / "preview.json")
    audio = FileVoiceCollections._safe_relative_source(folder, "preview/sample.wav")
    actual = probe_sample(audio)
    info = record.get("audio")
    numeric = ("duration", "peak")
    integer = ("sampleRate", "channels", "sampleWidth")
    if (type(record.get("schemaVersion")) is not int or record["schemaVersion"] != 1
            or not isinstance(info, dict)
            or any(type(info.get(key)) is not int for key in integer)
            or any(type(info.get(key)) not in (int, float) or info[key] != actual[key] or not math.isfinite(info[key]) for key in numeric)
            or record.get("fingerprint") != preview_fingerprint(entry, lineage)
            or not isinstance(record.get("script"), str) or not record["script"].strip()
            or record.get("audio") != actual):
        raise ValueError("Mẫu giọng không khớp model hoặc checksum.")
    return record


def introduction(entry: VoiceCollectionEntry, lineage: dict, store: FileVoiceCollections) -> tuple[str, float | None, str]:
    speaker, voice = entry.speaker, entry.voice
    seconds = store.training_seconds(lineage)
    duration = "chưa có thông tin" if seconds is None else f"{seconds:.1f} giây"
    gender = {"male": "nam", "female": "nữ", "unspecified": "chưa có thông tin"}.get(speaker.gender, speaker.gender)
    age = {"adult": "trưởng thành", "young adult": "thanh niên", "child": "trẻ em", "senior": "cao tuổi"}.get(speaker.age, speaker.age)
    kind = {"lora": "LoRA", "full": "train full", "vc": "chuyển đổi giọng RVC"}.get(voice.kind, voice.kind)
    engine = {"omnivoice": "OmniVoice", "vibevoice": "VibeVoice", "rvc": "RVC"}.get(voice.engine, voice.engine)
    provenance = lineage.get("provenance")
    if not isinstance(provenance, dict):
        raise ValueError("Collection source provenance is invalid.")
    source_set = provenance.get("sourceModelSet")
    emotion = "Chưa có thông tin về khả năng chọn cảm xúc của model này"
    if source_set:
        if (not isinstance(source_set, dict) or not isinstance(source_set.get("members"), list)
                or any(not isinstance(member, dict) for member in source_set["members"])):
            raise ValueError("Voice Model Set metadata is invalid.")
        matches = [member for member in source_set.get("members", []) if member.get("voiceId") == lineage["provenance"].get("sourceVoiceId")]
        if matches:
            emotion = f"Model đã được công bố cho cảm xúc {matches[0].get('emotion', 'normal')} trong Voice Model Set"
    created = speaker.created_at.astimezone()
    date = f"ngày {created.day:02d} tháng {created.month:02d} năm {created.year}"
    text = (f"Xin chào, đây là mẫu giọng giới thiệu của profile {speaker.name}. "
            f"Giới tính {gender}. Vùng miền {speaker.region or 'chưa có thông tin'}. "
            f"Độ tuổi {age or 'chưa có thông tin'}. Profile được khởi tạo vào {date}. "
            f"Thời lượng audio dùng để train là {duration}. "
            f"Model có tên {voice.name}, thuộc dạng {kind}, sử dụng engine {engine}. {emotion}. "
            "Đoạn giới thiệu này được tạo bằng chính model trong profile để bạn nghe thử giọng nói trước khi sử dụng. "
            "Bạn có thể đối chiếu âm thanh với nội dung script hiển thị bên cạnh và lựa chọn model phù hợp.")
    return text, seconds, emotion


class CollectionVoicePreviews:
    """Serial, collection-owned synthesis with explicit receipts and measured artifacts."""

    def __init__(self, collections: FileVoiceCollections, generator: VoiceGenerator) -> None:
        self.collections, self.generator = collections, generator
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="collection-preview")
        self._lock = threading.RLock()
        self._jobs: dict[tuple[str, str], CollectionVoicePreview] = {}
        self._verified_signatures: dict[tuple[str, str], tuple] = {}
        self._workers: dict[tuple[str, str], tuple[EngineWorkerProcess, str]] = {}
        self._closed = False

    def _verify_archived(self, cid: str, eid: str, entry: VoiceCollectionEntry, folder: Path) -> None:
        """Hash immutable payloads once per observed filesystem revision, not per UI poll."""
        with self.collections._lock:
            signature = []
            for current, directories, filenames in os.walk(folder / "payload", followlinks=False):
                for name in [*directories, *filenames]:
                    member = Path(current) / name
                    self.collections._resolve_tree_member(folder, member)
                    stat = member.stat()
                    signature.append((member.relative_to(folder).as_posix(), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
            for name in ("entry.json", "lineage.json"):
                member = self.collections._safe_relative_source(folder, name)
                stat = member.stat()
                signature.append((name, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
            observed = tuple(sorted(signature))
            key = (cid, eid)
            if self._verified_signatures.get(key) != observed:
                self.collections._verified_entry_lineage(cid, eid, entry)
                self._verified_signatures[key] = observed

    def _snapshot(self, cid: str, eid: str) -> tuple[VoiceCollectionEntry, Path, dict, CollectionVoicePreview]:
        self.collections.get(cid)
        entry = self.collections._read_entry(cid, eid)
        folder = self.collections._entry_folder(cid, eid)
        lineage = _read_json(folder / "lineage.json")
        script, seconds, emotion = introduction(entry, lineage, self.collections)
        state = CollectionVoicePreview(status="missing", script=script, training_seconds=seconds, emotion_support=emotion)
        return entry, folder, lineage, state

    def get(self, cid: str, eid: str) -> CollectionVoicePreview:
        entry, folder, lineage, state = self._snapshot(cid, eid)
        with self._lock:
            job = self._jobs.get((cid, eid))
            if job and job.status in {"queued", "running", "error", "unsupported"}:
                return job.model_copy()
        try:
            cached = verified_preview(folder, entry, lineage)
            if cached:
                try:
                    self._verify_archived(cid, eid, entry, folder)
                except (OSError, ValueError) as exc:
                    return state.model_copy(update={"status": "error", "error": str(exc)})
                return state.model_copy(update={"status": "ready", "script": cached["script"],
                                               "duration": cached["audio"]["duration"], "audio_url": self._audio_url(cid, eid)})
        except (OSError, ValueError, KeyError):
            pass  # Invalid/old cache can be regenerated, never served as a success.
        if self.generator.generator_for(entry.voice.engine) is None:
            return state.model_copy(update={"status": "unsupported", "error": "Engine này chưa hỗ trợ tạo mẫu từ script."})
        return state

    def start(self, cid: str, eid: str) -> CollectionVoicePreview:
        state = self.get(cid, eid)
        with self._lock:
            if self._closed:
                raise ValueError("Dịch vụ mẫu giọng đang đóng.")
            current = self._jobs.get((cid, eid))
            if current and current.status in {"queued", "running"}:
                return current.model_copy()
            if state.status in {"ready", "unsupported"}:
                return state
            if sum(job.status in {"queued", "running"} for job in self._jobs.values()) >= 100:
                return state.model_copy(update={"status": "error", "error": "Hàng đợi mẫu giọng đã đầy; thử lại sau."})
            receipt = state.model_copy(update={"status": "queued", "error": None})
            self._jobs[(cid, eid)] = receipt
            self._executor.submit(self._render, cid, eid)
            return receipt.model_copy()

    def _render(self, cid: str, eid: str) -> None:
        key, stage, lease = (cid, eid), None, None
        with self._lock:
            self._jobs[key] = self._jobs[key].model_copy(update={"status": "running"})
        try:
            entry, folder, lineage, state = self._snapshot(cid, eid)
            with self.collections._lock:
                self.collections._verified_entry_lineage(cid, eid, entry)
            generator_id = self.generator.generator_for(entry.voice.engine)
            plan = self.generator.prepare_archived(entry.voice, folder / "payload", generator_id, {})
            cancellation_id = f"collection-preview-{uuid4().hex}"
            worker = getattr(getattr(plan, "engine_speech", None), "worker", None)
            with self._lock:
                if self._closed:
                    raise ValueError("Đã hủy tạo mẫu khi đóng ứng dụng.")
                if isinstance(worker, EngineWorkerProcess):
                    worker.register_request(cancellation_id)
                    self._workers[key] = (worker, cancellation_id)
            lease = self.generator.gpu_lease.acquire(f"collection-preview:{eid}")
            stage = folder / f".preview-{uuid4().hex}.tmp"
            stage.mkdir()
            audio = stage / "sample.wav"
            self.generator.speak(plan, state.script, audio, cancellation_id=cancellation_id)
            measured = probe_sample(audio)
            record = {"schemaVersion": 1, "fingerprint": preview_fingerprint(entry, lineage), "script": state.script, "audio": measured}
            (stage / "preview.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            with self.collections._lock:
                if self._closed:
                    raise ValueError("Đã hủy tạo mẫu khi đóng ứng dụng.")
                self.collections._verified_entry_lineage(cid, eid, entry)
                destination = folder / "preview"
                if destination.exists():
                    self.collections._resolve_tree_member(folder, destination)
                    shutil.rmtree(destination)
                stage.replace(destination)
                stage = None
            with self._lock:
                self._jobs.pop(key, None)
        except Exception as exc:
            with self._lock:
                self._jobs[key] = self._jobs[key].model_copy(update={"status": "error", "error": str(exc)})
        finally:
            with self._lock:
                tracked = self._workers.pop(key, None)
            if tracked:
                tracked[0].abandon_request(tracked[1])
            if lease:
                self.generator.gpu_lease.release(lease.token)
            if stage:
                shutil.rmtree(stage, ignore_errors=True)

    def audio(self, cid: str, eid: str) -> Path:
        state = self.get(cid, eid)
        if state.status != "ready":
            raise ValueError("Mẫu giọng chưa sẵn sàng.")
        return self.collections._safe_relative_source(self.collections._entry_folder(cid, eid), "preview/sample.wav")

    @staticmethod
    def _audio_url(cid: str, eid: str) -> str:
        return f"/api/voice-collections/{cid}/entries/{eid}/preview/audio"

    def close(self) -> None:
        with self._lock:
            self._closed = True
            workers = list(self._workers.values())
            for key, job in self._jobs.items():
                if job.status == "queued":
                    self._jobs[key] = job.model_copy(update={"status": "error", "error": "Đã hủy khi đóng ứng dụng."})
        for worker, cancellation_id in workers:
            worker.cancel_request(cancellation_id)
        self._executor.shutdown(wait=True, cancel_futures=True)


def make_collection_preview_router(previews: CollectionVoicePreviews) -> APIRouter:
    router = APIRouter(tags=["collection-model-preview"])
    prefix = "/api/voice-collections/{collection_id}/entries/{entry_id}/preview"

    def call(operation, cid, eid):
        try:
            return operation(cid, eid)
        except KeyError as exc:
            raise HTTPException(404, "Collection entry not found") from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get(prefix, response_model=CollectionVoicePreview)
    def get_preview(collection_id: str, entry_id: str):
        return call(previews.get, collection_id, entry_id)

    @router.post(prefix, response_model=CollectionVoicePreview)
    def start_preview(collection_id: str, entry_id: str):
        return call(previews.start, collection_id, entry_id)

    @router.get(prefix + "/audio")
    def preview_audio(collection_id: str, entry_id: str):
        state = call(previews.get, collection_id, entry_id)
        if state.status != "ready":
            raise HTTPException(409, "Mẫu giọng chưa sẵn sàng.")
        return FileResponse(call(previews.audio, collection_id, entry_id), media_type="audio/wav")

    return router
