from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.adapters.context_patch_processor import ContextVoicePatchProcessor
from app.adapters.voice_script_speaker import _Step
from app.domain.models import ProjectVoice, VoiceScriptRow


_OMNIVOICE_BASE = "k2-fsa/OmniVoice"


class HybridVoicePatchProcessor(ContextVoicePatchProcessor):
    """Patch imported media using its selected context and a trained OmniVoice."""

    def __init__(self, store, speaker, bindings=None, schedules=None):
        super().__init__(store, speaker, bindings, schedules)
        self.storage_namespace = "hybrid-patch"
        self.route_prefix = "/api/projects/{project_id}/voice-patch/hybrid"

    def _trained_voice(self, project_id: str, capture: dict[str, Any], voice_id: str) -> ProjectVoice:
        draft = capture["draft"]
        voice = self.speaker.generator.voices.get(project_id, voice_id)
        if voice.kind not in {"lora", "full"}:
            raise ValueError("Hybrid Patch supports trained LoRA or full voices only.")
        if voice.engine != "omnivoice" or voice.base_model != _OMNIVOICE_BASE:
            raise ValueError("Selected trained voice must use the compatible OmniVoice base family.")
        if voice.speaker_profile_id != draft.speaker_profile_id:
            raise ValueError("Selected trained voice must match the imported target Speaker Profile.")
        original_reference = self._project_relative(self._root(project_id), voice.reference_audio)
        if not original_reference.is_file():
            raise ValueError("Selected trained voice is missing its original clean reference artifact.")
        if voice.kind == "lora" and (not voice.adapter_path or voice.model_path):
            raise ValueError("Selected LoRA voice must have one trained adapter and no full checkpoint.")
        if voice.kind == "full" and (not voice.model_path or voice.adapter_path):
            raise ValueError("Selected full voice must have one trained checkpoint and no LoRA adapter.")
        return voice

    @staticmethod
    def _has_weights(path: Path | None) -> bool:
        weight_extensions = {".bin", ".ckpt", ".msgpack", ".pt", ".pth", ".safetensors"}
        return bool(path and path.is_dir() and any(
            item.is_file() and item.suffix.lower() in weight_extensions for item in path.rglob("*")))

    def _hybrid_voice(self, project_id: str, capture: dict[str, Any], voice_id: str) -> ProjectVoice:
        context_voice = self._context_voice(project_id, capture)
        trained = self._trained_voice(project_id, capture, voice_id)
        root = self._root(project_id)
        absolute = lambda relative: self._project_relative(root, relative)
        artifact = absolute(trained.adapter_path if trained.kind == "lora" else trained.model_path)
        if not self._has_weights(artifact):
            label = "adapter" if trained.kind == "lora" else "checkpoint"
            raise ValueError(f"Selected trained voice is missing its trained {label} weights.")
        reference = self._project_relative(root, context_voice.reference_audio)
        if not reference.is_file() or self._sha(reference) != capture["context"].get("audio_sha256"):
            raise ValueError("Selected hybrid context reference is missing or failed its checksum.")
        return trained.model_copy(update={
            "reference_audio": context_voice.reference_audio,
            "reference_text": context_voice.reference_text,
            "reference_seconds": context_voice.reference_seconds,
            "reference_segment_id": context_voice.reference_segment_id,
        })

    def _voice_for(self, project_id: str, capture: dict[str, Any], voice_id: str):
        return self._hybrid_voice(project_id, capture, voice_id)

    def _make_step(self, project_id: str, capture: dict[str, Any], voice_id: str, text: str):
        capture["voiceId"] = voice_id
        if capture["blockers"]:
            raise ValueError(" ".join(capture["blockers"]))
        draft, row = capture["draft"], capture["row"]
        voice = self._hybrid_voice(project_id, capture, voice_id)
        if voice.speaker_profile_id != draft.speaker_profile_id:
            raise ValueError("Hybrid Patch context and trained voice must match the target Speaker Profile.")
        generator_id = self.speaker.generator.generator_for("omnivoice")
        if not generator_id:
            raise ValueError("The existing OmniVoice generator is unavailable for hybrid Patch.")
        parameters = capture["output"].parameters.get("generators", {})
        if not isinstance(parameters, dict):
            parameters = {}
        generation = parameters.get(generator_id, {})
        if not isinstance(generation, dict):
            raise ValueError("Saved OmniVoice generation parameters are invalid.")
        root = self._root(project_id)
        plan = self.speaker.generator._prepare_voice(voice, generator_id, generation,
            lambda relative: self._project_relative(root, relative))
        material = self._extra_key_material(capture, voice_id)
        plan.artifact_fingerprint = hashlib.sha256(json.dumps({
            "base": plan.artifact_fingerprint, "hybrid": material,
        }, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
        request_row = VoiceScriptRow(
            id=draft.row_id, segment_id=row.segment_id, voice_id=voice.id, text=text,
            origin_ids=row.origin_ids, tags=row.tags,
            settings=row.settings.model_dump(by_alias=True, exclude_none=True),
        )
        return _Step(request_row, text, plan)

    def _extra_key_material(self, capture: dict[str, Any], voice_id: str | None = None) -> dict[str, Any]:
        selected = capture["draft"].selected_context
        if selected is None:
            raise ValueError("Select one same-speaker context utterance before processing.")
        voice_id = voice_id or capture.get("voiceId")
        if not voice_id:
            raise ValueError("Select a trained OmniVoice voice before processing.")
        voice = self._trained_voice(capture["projectId"], capture, voice_id)
        return {
            **super()._extra_key_material(capture),
            "strategy": "trained-model-with-context-reference",
            "trainedVoiceId": voice.id,
            "trainedVoiceKind": voice.kind,
            "trainedVoiceEngine": voice.engine,
            "trainedVoiceBaseModel": voice.base_model,
            "trainedVoiceModelPath": voice.model_path,
            "trainedVoiceAdapterPath": voice.adapter_path,
            "trainedVoiceSourceRunId": voice.source_run_id,
            "trainedVoiceMetadataSha256": self._hash_json(voice.model_dump(mode="json", by_alias=True)),
            "trainedVoiceReferenceSha256": self._sha(self._project_relative(
                self._root(capture["projectId"]), voice.reference_audio)),
        }

    def _extra_lineage(self, capture: dict[str, Any]) -> dict[str, Any]:
        return {**super()._extra_lineage(capture),
            "hybridStrategy": "trained-model-with-context-reference"}

    def _extra_report(self, capture: dict[str, Any]) -> dict[str, Any]:
        report = super()._extra_report(capture)
        step = capture.get("step")
        return {**report,
            "modelStrategy": "trained-model-with-context-reference",
            "trainedVoiceId": step.plan.voice.id if step else capture.get("voiceId"),
            "trainedVoiceKind": step.plan.voice.kind if step else None,
            "voicePublication": "none-existing-trained-voice-reference-replaced-temporarily"}

    def _compose_output(self, project_id: str, capture: dict[str, Any], job, *args, **kwargs):
        capture["voiceId"] = job.voice_id
        pcm, output, report = super()._compose_output(project_id, capture, job, *args, **kwargs)
        output = output.model_copy(update={"generator_id": "voice-patch-hybrid"})
        return pcm, output, report

    def _build(self, project_id: str, request):
        snapshot = super()._build(project_id, request)
        snapshot["voiceId"] = request.voice_id
        return snapshot

    def plan(self, project_id: str) -> dict[str, Any]:
        document = self.store.get(project_id)
        latest = self.latest_job(project_id)
        draft = document.draft
        if draft is None:
            return {"processingAvailable": False, "draftRevision": document.revision,
                "blockers": ["Transfer one imported-media source row and select a context utterance."],
                "voiceChoices": [], "latestJob": latest}
        try:
            capture = self._capture(project_id, document.revision)
            context = draft.selected_context
            blockers = list(capture["blockers"])
            if context is None:
                blockers.append("Select one same-speaker context utterance before processing.")
            choices = []
            for voice in self.speaker.generator.voices.list(project_id):
                if (voice.kind not in {"lora", "full"} or voice.engine != "omnivoice"
                        or voice.base_model != _OMNIVOICE_BASE
                        or voice.speaker_profile_id != draft.speaker_profile_id):
                    continue
                relative = voice.adapter_path if voice.kind == "lora" else voice.model_path
                artifact = self._project_relative(self._root(project_id), relative) if relative else None
                if self._has_weights(artifact):
                    choices.append({"voiceId": voice.id, "name": voice.name, "kind": voice.kind,
                        "speakerProfileId": voice.speaker_profile_id, "baseModel": voice.base_model})
            if not choices:
                blockers.append("No trained compatible OmniVoice voice with available weights matches the source Speaker Profile.")
            if not self.speaker.generator.generator_for("omnivoice"):
                blockers.append("The existing OmniVoice generator is unavailable for hybrid Patch.")
            return {"processingAvailable": not blockers, "draftRevision": document.revision,
                "scriptRevision": draft.script_revision, "editRevision": draft.edit_revision,
                "rowId": draft.row_id, "sourceOutputId": draft.output_id,
                "replacementText": draft.replacement_text, "voiceChoices": choices,
                "context": ({"contextId": context.id, "text": context.text,
                    "audioSha256": context.artifact_sha256, "speakerProfileId": context.speaker_profile_id}
                    if context else None),
                "blockers": sorted(set(blockers)), "latestJob": latest}
        except (KeyError, OSError, ValueError, RuntimeError) as exc:
            return {"processingAvailable": False, "draftRevision": document.revision,
                "rowId": draft.row_id, "sourceOutputId": draft.output_id,
                "voiceChoices": [], "blockers": [str(exc)], "latestJob": latest}
