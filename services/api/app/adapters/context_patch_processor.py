from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.adapters.voice_patch_processor import VoicePatchProcessor
from app.adapters.voice_script_speaker import _Step
from app.domain.models import ProjectVoice, VoiceScriptRow


class ContextVoicePatchProcessor(VoicePatchProcessor):
    """Context-clone Patch jobs over an imported media source, without publishing a voice."""

    def __init__(self, store, speaker, bindings=None, schedules=None):
        super().__init__(store, speaker, bindings, schedules, storage_namespace="context-patch",
            route_prefix="/api/projects/{project_id}/voice-patch/context")

    def _transaction_locks(self, project_id: str, snapshot: dict[str, Any]):
        # The context document and Script are both project-local durable inputs.
        return (self.store._lock, self.store.scripts._lock)

    def _context_voice(self, project_id: str, capture: dict[str, Any]) -> ProjectVoice:
        draft, context = capture["draft"], capture["context"]
        if draft.source_kind != "media" or not draft.selected_context or context.get("mode") != "clone-only-context":
            raise ValueError("Context Patch requires one explicitly selected imported-media reference.")
        reference = Path(context["audio_path"]).resolve()
        root = self._root(project_id).resolve()
        relative = reference.relative_to(root).as_posix()
        if not reference.is_file() or self._sha(reference) != context.get("audio_sha256"):
            raise ValueError("Selected Context Patch reference is missing or failed its checksum.")
        return ProjectVoice(
            id="context-clone", name="Temporary imported-media context clone",
            speaker_profile_id=draft.speaker_profile_id, engine="omnivoice", kind="clone",
            base_model="k2-fsa/OmniVoice", reference_audio=relative,
            reference_text=str(context["text"]),
            reference_seconds=float(context["frames"]) / 24000,
            reference_segment_id=draft.selected_context.id,
        )

    @staticmethod
    def _project_relative(root: Path, relative: str) -> Path:
        candidate = Path(relative)
        if candidate.is_absolute():
            raise ValueError("Context Patch reference path must be project-relative.")
        resolved_root = root.resolve()
        resolved = (resolved_root / candidate).resolve()
        if resolved != resolved_root and resolved_root not in resolved.parents:
            raise ValueError("Context Patch reference path escapes its project.")
        return resolved

    def _voice_for(self, project_id: str, capture: dict[str, Any], voice_id: str):
        if voice_id != "context-clone":
            raise ValueError("Imported-media Patch uses only its temporary context clone.")
        return self._context_voice(project_id, capture)

    def _make_step(self, project_id: str, capture: dict[str, Any], voice_id: str, text: str):
        if voice_id != "context-clone":
            raise ValueError("Imported-media Patch uses only its temporary context clone.")
        if capture["blockers"]:
            raise ValueError(" ".join(capture["blockers"]))
        draft, row = capture["draft"], capture["row"]
        voice = self._context_voice(project_id, capture)
        if voice.speaker_profile_id != draft.speaker_profile_id:
            raise ValueError("Selected context clone must match the imported target Speaker Profile.")
        generator_id = self.speaker.generator.generator_for("omnivoice")
        if not generator_id:
            raise ValueError("The existing OmniVoice generator is unavailable for context Patch.")
        parameters = capture["output"].parameters.get("generators", {})
        if not isinstance(parameters, dict):
            parameters = {}
        generation = parameters.get(generator_id, {})
        if not isinstance(generation, dict):
            raise ValueError("Saved OmniVoice generation parameters are invalid.")
        root = self._root(project_id)
        plan = self.speaker.generator._prepare_voice(voice, generator_id, generation,
            lambda relative: self._project_relative(root, relative))
        context_material = self._extra_key_material(capture)
        plan.artifact_fingerprint = hashlib.sha256(json.dumps({
            "base": plan.artifact_fingerprint, "context": context_material,
        }, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
        request_row = VoiceScriptRow(
            id=draft.row_id, segment_id=row.segment_id, voice_id=voice.id, text=text,
            origin_ids=row.origin_ids, tags=row.tags,
            settings=row.settings.model_dump(by_alias=True, exclude_none=True),
        )
        return _Step(request_row, text, plan)

    def _extra_key_material(self, capture: dict[str, Any]) -> dict[str, Any]:
        draft, selected, context = capture["draft"], capture["draft"].selected_context, capture["context"]
        if selected is None:
            raise ValueError("Select one same-speaker context utterance before processing.")
        return {
            "sourceKind": "media", "sourceOrigin": draft.source_origin, "sourceAssetId": draft.asset_id,
            "contextId": selected.id, "contextText": context.get("text"),
            "contextAudioSha256": context.get("audio_sha256"),
            "contextSourceAudioSha256": selected.source_audio_sha256,
            "contextStartFrame": selected.start_frame, "contextEndFrame": selected.end_frame,
            "contextSampleRate": 24000, "contextSpeakerProfileId": selected.speaker_profile_id,
        }

    def _extra_lineage(self, capture: dict[str, Any]) -> dict[str, Any]:
        draft = capture["draft"]
        asset = self.store.media.get(capture["projectId"], draft.asset_id)
        return {**self._extra_key_material(capture),
            "sourceTranscriptText": asset.text,
            "sourceTranscriptWords": asset.words or [],
            "sourceTranscriptTimingQuality": asset.word_timing_quality}

    def _extra_report(self, capture: dict[str, Any]) -> dict[str, Any]:
        return {
            "sourceKind": "media", "sourceOrigin": capture["draft"].source_origin,
            "sourceAssetId": capture["draft"].asset_id,
            "contextId": capture["draft"].selected_context.id,
            "contextAudioSha256": capture["context"]["audio_sha256"],
            "contextReferenceText": capture["context"]["text"],
            "voicePublication": "none-temporary-clone-only",
        }

    def _compose_output(self, *args, **kwargs):
        pcm, output, report = super()._compose_output(*args, **kwargs)
        output = output.model_copy(update={"engine": "mixed-source-omnivoice",
            "generator_id": "voice-patch-context"})
        return pcm, output, report

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
            if not self.speaker.generator.generator_for("omnivoice"):
                blockers.append("The existing OmniVoice generator is unavailable for context Patch.")
            return {"processingAvailable": not blockers, "draftRevision": document.revision,
                "scriptRevision": draft.script_revision, "editRevision": draft.edit_revision,
                "rowId": draft.row_id, "sourceOutputId": draft.output_id,
                "replacementText": draft.replacement_text,
                "voiceChoices": ([{"voiceId": "context-clone", "name": "Selected media context",
                    "kind": "temporary-clone", "speakerProfileId": draft.speaker_profile_id}]
                    if context else []),
                "context": ({"contextId": context.id, "text": context.text,
                    "audioSha256": context.artifact_sha256, "speakerProfileId": context.speaker_profile_id}
                    if context else None),
                "blockers": sorted(set(blockers)), "latestJob": latest}
        except (KeyError, OSError, ValueError, RuntimeError) as exc:
            return {"processingAvailable": False, "draftRevision": document.revision,
                "rowId": draft.row_id, "sourceOutputId": draft.output_id, "voiceChoices": [],
                "blockers": [str(exc)], "latestJob": latest}

