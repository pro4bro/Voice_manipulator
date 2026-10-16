import asyncio
from time import perf_counter
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse
from app.adapters.voice_edit_preview import VoiceEditPreview
from app.adapters.audio_waveform_envelope import AudioWaveformEnvelope
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.voice_edits import VoiceEditCommand


def make_voice_edit_router(store):
    router = APIRouter(prefix="/api/projects/{project_id}/voice-outputs/{output_id}/edit")
    previews, envelopes = VoiceEditPreview(store), AudioWaveformEnvelope()

    def packet(project_id, output_id, doc):
        started = perf_counter()
        diagnostics = {}
        url, report = previews.render(project_id, output_id, doc, diagnostics=diagnostics)
        mapped = store.mapped_output(project_id, output_id, doc).model_dump(mode="json", by_alias=True)
        diagnostics["totalPacketMs"] = (perf_counter() - started) * 1000
        return {"document": doc.model_dump(by_alias=True), "duration": doc.frames / doc.sample_rate, "audioUrl": url, "report": report,
                "output": mapped, "previewDiagnostics": diagnostics}

    @router.get("")
    def get(project_id: str, output_id: str):
        try:
            return packet(project_id, output_id, store.get(project_id, output_id))
        except KeyError as exc:
            raise HTTPException(404, "Output không tồn tại") from exc
        except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("")
    def change(project_id: str, output_id: str, command: VoiceEditCommand):
        try:
            candidate = store.change(project_id, output_id, command, persist=False)
            result = packet(project_id, output_id, candidate)
            store.change(project_id, output_id, command)
            return result
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(404, "Output không tồn tại") from exc
        except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/preview")
    def preview(project_id: str, output_id: str, command: VoiceEditCommand, response: Response):
        try:
            started = perf_counter()
            candidate = store.change(project_id, output_id, command, persist=False)
            candidate_ms = (perf_counter() - started) * 1000
            result = packet(project_id, output_id, candidate)
            current = store.get(project_id, output_id)
            if current.revision != command.revision or store.scripts.get(project_id).revision != command.script_revision:
                raise ScriptRevisionConflict("Preview đã cũ; không áp dụng.")
            result["previewDiagnostics"].update(candidateMs=candidate_ms, totalHandlerMs=(perf_counter() - started) * 1000)
            response.headers["Server-Timing"] = f"candidate;dur={candidate_ms:.3f}, preview;dur={result['previewDiagnostics']['totalPacketMs']:.3f}, handler;dur={result['previewDiagnostics']['totalHandlerMs']:.3f}"
            return result
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(404, "Output không tồn tại") from exc
        except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/previews/{key}/audio")
    def audio(project_id: str, output_id: str, key: str):
        try:
            path = previews.path(project_id, output_id, key)
            if not path.is_file():
                raise KeyError(key)
            previews.validate(path, store.get(project_id, output_id).source_sha256)
            return FileResponse(path, media_type="audio/wav", filename="voice-preview.wav")
        except (KeyError, ValueError, OSError, EOFError) as exc:
            raise HTTPException(404, "Preview không tồn tại") from exc

    @router.get("/previews/{key}/waveform")
    async def waveform(project_id: str, output_id: str, key: str, start: float | None = None, end: float | None = None, points: int | None = None):
        try:
            path = previews.path(project_id, output_id, key)
            previews.validate(path, store.get(project_id, output_id).source_sha256)
            cache = path.with_suffix(".peaks.json")
            if start is None and end is None and points is None:
                return await asyncio.to_thread(envelopes.read, path, cache)
            if start is None or end is None or points is None:
                raise ValueError("Thiếu khoảng waveform.")
            return await asyncio.to_thread(envelopes.read_detail, path, cache, start, end, points)
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(404, "Preview không tồn tại") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    return router
