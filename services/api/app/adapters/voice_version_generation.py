"""Bind real generation jobs to their captured Version and place local Fix clips."""
import array
import copy
import json
import math
import wave
from datetime import datetime, timezone
from uuid import uuid4

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_stretch_audio import render_stretch
from app.domain.models import VoiceScriptJob, VoiceScriptRequest, VoiceScriptRow

RATE = 24000


class VoiceVersionGeneration:
    def __init__(self, sessions, speaker):
        self.sessions, self.speaker, self.outputs = sessions, speaker, speaker.outputs

    def _ticket(self, project_id, job_id, value):
        path = self.sessions.root(project_id) / "jobs/voice-versions" / f"{job_id}.json"
        FileProjectRepository._atomic_write(path, json.dumps(value, ensure_ascii=False, default=str))

    def bind_full(self, project_id, request, job_id):
        if not request.version_id:
            return
        if self.sessions.get(project_id)["activeVersionId"] != request.version_id:
            raise ScriptRevisionConflict("Chọn Version trước khi Generate Full.")
        state = self.sessions.state(project_id, request.version_id)
        current = self.sessions.scripts.get(project_id)
        if state.revision != request.version_revision or request.script_revision != current.revision:
            raise ScriptRevisionConflict("Version/Script đã đổi trước Generate Full.")
        if [row.id for row in request.rows] != [row.id for row in current.rows if row.text.strip()] or not request.force_regenerate:
            raise ValueError("Generate Full phải tạo lại toàn bộ Script hiện tại.")
        ticket = {"kind": "full", "versionId": request.version_id, "revision": state.revision,
            "script": current.model_dump(by_alias=True, mode="json"), "config": state.config}
        self._ticket(project_id, job_id, ticket)
        self.speaker.bind_publisher(project_id, job_id, lambda output, stopped: self._publish(project_id, job_id, ticket, output, stopped))

    def start_fix(self, project_id, version_id, revision, *, background=True):
        from app.domain.voice_version_fix import plan_version_fix
        if self.sessions.get(project_id)["activeVersionId"] != version_id:
            raise ScriptRevisionConflict("Chọn Version trước khi Generate Fix Only.")
        state = self.sessions.state(project_id, version_id)
        if state.revision != revision or not state.output_id or not state.composition:
            raise ScriptRevisionConflict("Chọn Version có bản Full đã tạo trước khi Generate Fix Only.")
        plan = plan_version_fix(state.script, state.generated_script, state.config, state.generated_config,
            self.outputs.get(project_id, state.output_id))
        if plan["blockers"]:
            raise ValueError(" ".join(plan["blockers"]))
        if not plan["regions"]:
            raise ValueError("Không có đoạn mới sửa cần Generate Fix Only.")
        for region in plan["regions"]:
            end = region["startFrame"] + region["frameCount"]
            actual = state.composition["durationFrames"]
            if end > actual:
                if end - actual > 12:
                    raise ValueError("Vùng Fix vượt ra ngoài WAV thực tế; cần kiểm tra timing.")
                region["frameCount"] = actual - region["startFrame"]
        ticket = {"kind": "fix", "versionId": version_id, "revision": state.revision,
            "sourceOutputId": state.output_id, "script": state.script.model_dump(by_alias=True, mode="json"),
            "config": state.config, "composition": state.composition, "regions": plan["regions"]}
        regions = [region for region in plan["regions"] if region["text"].strip()]
        parameters = copy.deepcopy(state.config.get("generatorParameters", {}))
        for region in regions:
            voice = self.speaker.generator.voices.get(project_id, region["voiceId"])
            if region.get("speakerProfileId") and voice.speaker_profile_id != region["speakerProfileId"]:
                raise ValueError("Voice không thuộc Speaker Profile của đoạn Fix.")
            if state.config.get("generationEngine") and state.config["generationEngine"] != voice.engine:
                raise ValueError("Engine đang chọn không khớp voice của đoạn Fix.")
            generator_id = self.speaker.generator.generator_for(voice.engine)
            option = self.speaker.generator.generators.get(generator_id)
            if any(spec.key == "speed" for spec in option.parameters):
                parameters.setdefault(generator_id, {})["speed"] = state.config.get("speed", 1)
        if not regions:
            job_id = f"version-fix-{uuid4().hex[:16]}"
            self._ticket(project_id, job_id, ticket)
            output = self._publish_fix(project_id, ticket, None)
            return VoiceScriptJob(id=job_id, project_id=project_id, status="complete", total=0, done=0, output=output)
        request = VoiceScriptRequest(rows=[VoiceScriptRow(id=region["id"], voice_id=region["voiceId"], text=region["text"],
            settings={key: value for key, value in region.get("settings", {}).items() if key not in {"duration", "locked"}})
            for region in regions], parameters=parameters, gap_seconds=0, force_regenerate=True)
        job_id = self.speaker.reserve(project_id, request)
        self._ticket(project_id, job_id, ticket)
        self.speaker.bind_publisher(project_id, job_id, lambda output, stopped: self._publish(project_id, job_id, ticket, output, stopped))
        return self.speaker.start(project_id, request, reserved_job_id=job_id, background=background)

    def _publish(self, project_id, job_id, ticket, candidate, stopped):
        if stopped:
            # A partial Full/Fix must never remove the current completed audio.
            raise ValueError("Generate đã dừng trước khi hoàn tất; Version giữ audio hiện tại.")
        state = self.sessions.state(project_id, ticket["versionId"])
        if ticket["kind"] == "full" and (state.revision != ticket["revision"] or
                {**state.script.model_dump(by_alias=True, mode="json"), "revision": 0} != {**ticket["script"], "revision": 0}):
            raise ScriptRevisionConflict("Version đã sửa trong lúc Generate; không thay audio hiện tại.")
        if ticket["kind"] == "fix":
            self.outputs.save(project_id, candidate)
            return self._publish_fix(project_id, ticket, candidate)
        actual_frames = len(self._read(self.sessions.root(project_id) / candidate.audio_path)) // 2
        duration = actual_frames / RATE
        candidate = candidate.model_copy(update={"duration": duration,
            "segments": [segment.model_copy(update={"end": min(segment.end, duration)}) for segment in candidate.segments],
            "words": [{**word, "start": min(float(word["start"]), duration), "end": min(float(word["end"]), duration)} for word in candidate.words],
            "parameters": {**candidate.parameters,
            "voiceVersion": {"versionId": ticket["versionId"], "jobId": job_id, "kind": "full"}}})
        saved = self.outputs.save(project_id, candidate)
        try:
            self.sessions.publish(project_id, ticket["versionId"], ticket["revision"], saved, ticket["script"], ticket["config"], full=True, expected_script=ticket["script"])
            return saved
        except Exception:
            self.outputs.discard(project_id, saved.id)
            raise

    @staticmethod
    def _read(path):
        with wave.open(str(path), "rb") as pcm:
            frames = pcm.getnframes()
            data = pcm.readframes(frames)
            if (pcm.getnchannels(), pcm.getsampwidth(), pcm.getframerate(), pcm.getcomptype()) != (1, 2, RATE, "NONE") or len(data) != frames * 2:
                raise ValueError("Fix source WAV is incomplete or has an unsupported format.")
            return data

    @staticmethod
    def _write(path, data):
        with wave.open(str(path), "wb") as pcm:
            pcm.setnchannels(1); pcm.setsampwidth(2); pcm.setframerate(RATE); pcm.writeframes(data)

    def _local_output(self, project_id, ticket, region, candidate, candidate_pcm, reference_pcm):
        source = self.outputs.get(project_id, ticket["sourceOutputId"])
        output_id, audio = self.outputs.reserve(project_id)
        try:
            desired = region["frameCount"]
            start = region["startFrame"]
            words, report = [], {"method": "silence-deletion", "targetFrames": desired}
            if region["text"].strip():
                index, segment = next((i, s) for i, s in enumerate(candidate.segments) if s.row_id == region["id"])
                first, last = round(segment.start * RATE), round(segment.end * RATE)
                raw = candidate_pcm[first * 2:last * 2]
                frames = len(raw) // 2
                if not frames or not .5 <= desired / frames <= 2:
                    raise ValueError("Đoạn Fix lệch thời lượng quá 0.5–2×; cần sửa vùng rộng hơn hoặc Generate Full.")
                raw_path = audio.parent / "generated-source.wav"
                self._write(raw_path, raw)
                if frames != desired:
                    report = render_stretch(raw_path, audio, [{"startFrame": 0, "endFrame": frames, "targetFrames": desired}])
                    raw = self._read(audio)
                else:
                    self._write(audio, raw)
                    report = {"method": "native-frames", "actualFrames": frames}
                for word in candidate.words:
                    if word.get("segmentIndex") == index:
                        item = {**word, "start": max(0, (float(word["start"]) - segment.start) * desired / frames),
                            "end": min(desired / RATE, (float(word["end"]) - segment.start) * desired / frames), "segmentIndex": 0}
                        words.append(item)
                # Match local level with a bounded gain. This preserves voice/
                # delivery settings and reports the actual amplitude adjustment.
                samples, nearby = array.array("h"), array.array("h")
                samples.frombytes(raw); nearby.frombytes(reference_pcm[start * 2:(start + desired) * 2])
                rms = math.sqrt(sum(x * x for x in samples) / max(1, len(samples)))
                target = math.sqrt(sum(x * x for x in nearby) / max(1, len(nearby)))
                gain = min(2.0, max(.5, target / rms)) if target > 0 and rms > 0 else 1.0
                peak = max((abs(x) for x in samples), default=0)
                gain = min(gain, 32000 / peak) if peak else gain
                self._write(audio, array.array("h", [round(x * gain) for x in samples]).tobytes())
                report["appliedGainDb"] = 20 * math.log10(gain)
            else:
                self._write(audio, b"\0\0" * desired)
            base_segment = next(s for s in source.segments if s.row_id == region["rowId"])
            segment = base_segment.model_copy(update={"text": region["text"], "start": 0, "end": desired / RATE,
                "voice_id": region["voiceId"], "clip": None})
            local = source.model_copy(update={"id": output_id, "name": f"Fix · {region['text'][:36] or 'xoá lời'}",
                "text": region["text"], "duration": desired / RATE, "audio_path": f"assets/voice-output/{output_id}/audio.wav",
                "words": words, "segments": [segment], "created_at": datetime.now(timezone.utc),
                "parameters": {**source.parameters, "voiceVersion": {"versionId": ticket["versionId"], "kind": "fix-clip", "sourceOutputId": source.id,
                    "startFrame": start, "frameCount": desired, "fit": report, "quality": "needs-listening"}}})
            self._read(audio)
            return self.outputs.save(project_id, local)
        except Exception:
            self.outputs.discard(project_id, output_id)
            raise

    def _publish_fix(self, project_id, ticket, candidate):
        from app.domain.voice_composition import VoiceComposition, VoiceCompositionClip, add_fix_clip
        from app.adapters.voice_layer_compositor import VoiceLayerCompositor
        composition = VoiceComposition.model_validate(ticket["composition"])
        reference = self._read(self.outputs.audio_path(project_id, ticket["sourceOutputId"]))
        candidate_pcm = self._read(self.outputs.audio_path(project_id, candidate.id)) if candidate else b""
        created = []
        try:
            for region in ticket["regions"]:
                output = self._local_output(project_id, ticket, region, candidate, candidate_pcm, reference)
                created.append(output.id)
                clip = VoiceCompositionClip(id=uuid4().hex, output_id=output.id, start_frame=region["startFrame"],
                    source_start_frame=0, frame_count=region["frameCount"])
                composition = add_fix_clip(composition, composition.layers[0].id, clip)
            rendered = VoiceLayerCompositor(self.outputs).render(project_id, composition, ticket["sourceOutputId"])
            created.append(rendered.id)
            rows = {row["id"]: row for row in ticket["script"]["rows"]}
            rendered = rendered.model_copy(update={"text": "\n".join(row["text"] for row in ticket["script"]["rows"]),
                "segments": [segment.model_copy(update={"text": rows[segment.row_id]["text"], "script_row": rows[segment.row_id]}) for segment in rendered.segments],
                "parameters": {**rendered.parameters, "voiceVersion": {"versionId": ticket["versionId"], "kind": "fix", "regions": ticket["regions"]}}})
            self.outputs.save(project_id, rendered)
            self.sessions.publish(project_id, ticket["versionId"], ticket["revision"], rendered, ticket["script"], ticket["config"],
                composition.model_dump(by_alias=True, mode="json"), expected_script=ticket["script"],
                allow_script_edits=True, expected_composition=ticket["composition"],
                expected_output_id=ticket["sourceOutputId"])
            if candidate:
                self.outputs.discard(project_id, candidate.id)
            return rendered
        except Exception:
            for output_id in created:
                self.outputs.discard(project_id, output_id)
            raise
