from fastapi import APIRouter, HTTPException
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.voice_edits import VoiceEditCommand


def make_voice_edit_router(store):
    router = APIRouter(prefix="/api/projects/{project_id}/voice-outputs/{output_id}/edit")

    def packet(project_id, output_id, doc):
        return {"document": doc.model_dump(by_alias=True), "duration": doc.frames / doc.sample_rate,
                "output": store.mapped_output(project_id, output_id, doc).model_dump(mode="json", by_alias=True)}

    @router.get("")
    def get(project_id: str, output_id: str):
        try:
            return packet(project_id, output_id, store.get(project_id, output_id))
        except KeyError as exc:
            raise HTTPException(404, "Output không tồn tại") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("")
    def change(project_id: str, output_id: str, command: VoiceEditCommand):
        try:
            return packet(project_id, output_id, store.change(project_id, output_id, command))
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(404, "Output không tồn tại") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc
    return router
