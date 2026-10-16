from __future__ import annotations

from pathlib import Path
from typing import Any

from app.adapters.context_patch_processor import ContextVoicePatchProcessor
from app.adapters.voice_patch_processor import VoicePatchProcessor
from app.domain.models import ProjectVoice


_OMNIVOICE_BASE = "k2-fsa/OmniVoice"


class TrainedMediaPatchProcessor(ContextVoicePatchProcessor):
    """Patch imported media with a trained voice's saved clean reference."""

    def __init__(self, store, speaker, bindings=None, schedules=None):
        super().__init__(store, speaker, bindings, schedules)
        self.storage_namespace = "trained-media-patch"
        self.route_prefix = "/api/projects/{project_id}/voice-patch/trained-media"

    def _source_snapshot(self, project_id: str, draft_revision: int) -> dict[str, Any]:
        return self.store.validate(project_id, draft_revision, require_context=False)

    def _trained_voice(self, project_id: str, capture: dict[str, Any], voice_id: str) -> ProjectVoice:
        draft = capture["draft"]
        voice = self.speaker.generator.voices.get(project_id, voice_id)
        if voice.kind not in {"lora", "full"}:
            raise ValueError("Trained media Patch supports LoRA or full voices only.")
        if voice.engine != "omnivoice" or voice.base_model != _OMNIVOICE_BASE:
            raise ValueError("Selected trained voice must use the compatible OmniVoice base family.")
        if voice.speaker_profile_id != draft.speaker_profile_id:
            raise ValueError("Selected trained voice must match the imported target Speaker Profile.")
        if voice.kind == "lora" and (not voice.adapter_path or voice.model_path):
            raise ValueError("Selected LoRA voice must have one trained adapter and no full checkpoint.")
        if voice.kind == "full" and (not voice.model_path or voice.adapter_path):
            raise ValueError("Selected full voice must have one trained checkpoint and no LoRA adapter.")
        reference = self._project_relative(self._root(project_id), voice.reference_audio)
        if not reference.is_file():
            raise ValueError("Selected trained voice is missing its saved clean reference audio.")
        artifact_relative = voice.adapter_path if voice.kind == "lora" else voice.model_path
        artifact = self._project_relative(self._root(project_id), artifact_relative or "")
        if not self._has_weights(artifact):
            raise ValueError("Selected trained voice is missing its trained weights.")
        return voice

    @staticmethod
    def _has_weights(path: Path) -> bool:
        weight_extensions = {".bin", ".ckpt", ".msgpack", ".pt", ".pth", ".safetensors"}
        return path.is_dir() and any(
            item.is_file() and item.suffix.lower() in weight_extensions for item in path.rglob("*"))

    def _voice_for(self, project_id: str, capture: dict[str, Any], voice_id: str):
        return self._trained_voice(project_id, capture, voice_id)

    def _make_step(self, project_id: str, capture: dict[str, Any], voice_id: str, text: str):
        capture["voiceId"] = voice_id
        self._trained_voice(project_id, capture, voice_id)
        return VoicePatchProcessor._make_step(self, project_id, capture, voice_id, text)

    def _extra_key_material(self, capture: dict[str, Any]) -> dict[str, Any]:
        voice_id = capture.get("voiceId")
        if not voice_id:
            raise ValueError("Select a trained OmniVoice voice before processing.")
        voice = self._trained_voice(capture["projectId"], capture, voice_id)
        return {
            "strategy": "trained-model-with-saved-reference",
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
            "reviewKey": capture.get("reviewKey"),
            "reviewedTarget": capture["draft"].reviewed_target.model_dump(mode="json", by_alias=True),
        }

    def _extra_lineage(self, capture: dict[str, Any]) -> dict[str, Any]:
        return {**super()._extra_lineage(capture),
            "mediaPatchStrategy": "trained-model-with-saved-reference"}

    def _extra_report(self, capture: dict[str, Any]) -> dict[str, Any]:
        voice_id = capture.get("voiceId")
        voice = self._trained_voice(capture["projectId"], capture, voice_id) if voice_id else None
        draft = capture["draft"]
        return {
            "sourceKind": "media", "sourceOrigin": draft.source_origin,
            "sourceAssetId": draft.asset_id,
            "modelStrategy": "trained-model-with-saved-reference",
            "trainedVoiceId": voice.id if voice else None,
            "trainedVoiceKind": voice.kind if voice else None,
            "reviewKey": capture.get("reviewKey"),
            "reviewedTarget": draft.reviewed_target.model_dump(mode="json", by_alias=True),
            "voicePublication": "none-existing-trained-voice-reference-used-read-only",
        }

    def _compose_output(self, project_id: str, capture: dict[str, Any], job, *args, **kwargs):
        capture["voiceId"] = job.voice_id
        pcm, output, report = VoicePatchProcessor._compose_output(
            self, project_id, capture, job, *args, **kwargs)
        output = output.model_copy(update={"engine": "mixed-source-omnivoice",
            "generator_id": "voice-patch-trained-media"})
        return pcm, output, report

    def _build(self, project_id: str, request):
        snapshot = super()._build(project_id, request)
        snapshot["voiceId"] = request.voice_id
        return snapshot

    def plan(self, project_id: str) -> dict[str, Any]:
        plan = VoicePatchProcessor.plan(self, project_id)
        draft = self.store.get(project_id).draft
        if draft is None:
            return plan
        choices = []
        for choice in plan.get("voiceChoices", []):
            try:
                voice = self._trained_voice(project_id, {"draft": draft}, choice["voiceId"])
            except (KeyError, OSError, ValueError):
                continue
            choices.append({"voiceId": voice.id, "name": voice.name, "kind": voice.kind,
                "speakerProfileId": voice.speaker_profile_id, "baseModel": voice.base_model})
        blockers = [item for item in plan.get("blockers", [])
            if not item.startswith("No trained LoRA/full OmniVoice")]
        if not choices:
            blockers.append("No trained compatible OmniVoice voice with available weights matches the source Speaker Profile.")
        plan.update({"voiceChoices": choices, "processingAvailable": not blockers,
            "blockers": sorted(set(blockers))})
        return plan
