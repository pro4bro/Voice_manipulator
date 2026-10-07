from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

MARKER = "@@PRO4BRO_JOB@@"


class ChildProgress:
    progress_id = ""

    def set(self, job_id: str, value: float) -> None:
        if not job_id:
            return
        print(MARKER + json.dumps({
            "kind": "progress", "progress_id": self.progress_id, "value": value,
        }), file=sys.stdout, flush=True)

    def get(self, job_id: str) -> float | None:
        return None


def _release_models(server: Any) -> None:
    server.loaded_models.clear()
    server.loaded_model_names = ()
    server.loaded_model = None
    server.loaded_model_name = None
    server.loaded_diarization = None
    server.loaded_diarization_model = None
    server.gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def main() -> int:
    from studio_app import server

    progress = ChildProgress()
    server.progress = progress
    for line in sys.stdin:
        try:
            arguments = json.loads(line)
        except ValueError:
            continue
        kind = str(arguments.pop("kind", ""))
        progress.progress_id = str(arguments.get("progress_id") or "")
        result_path = Path(arguments["result_path"]) if arguments.get("result_path") else None
        try:
            if kind == "shutdown":
                return 0
            if kind == "release":
                _release_models(server)
                result: dict[str, Any] = {"released": True}
            elif kind == "transcribe":
                result = server._transcribe(
                    Path(arguments["path"]),
                    arguments["progress_id"],
                    arguments["model"],
                    arguments.get("language"),
                )
            elif kind == "diarize":
                result = server._diarize(
                    Path(arguments["path"]),
                    arguments["progress_id"],
                    arguments["model"],
                    arguments["token"],
                    arguments.get("expected_speakers", 0),
                )
            else:
                raise ValueError("Unknown inference kind.")
            if result_path is not None:
                result_path.write_text(json.dumps({"result": result}, ensure_ascii=False), encoding="utf-8")
        except BaseException as exc:
            if result_path is not None:
                try:
                    result_path.write_text(
                        json.dumps({"error": f"{exc}\n{traceback.format_exc()}"}, ensure_ascii=False),
                        encoding="utf-8",
                    )
                except OSError:
                    pass
        print(MARKER + json.dumps({"kind": "done", "progress_id": progress.progress_id}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
