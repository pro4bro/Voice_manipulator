"""Track imports/downloads immediately and otherwise unreported slow requests."""
import asyncio
import json
import re
from urllib.parse import unquote, parse_qs

from app.adapters.activity_center import CENTER, REQUEST_ACTIVITY


class ImportReservationConflict(Exception):
    pass


class ProjectOperationActivity:
    def __init__(self, app, projects, media, delay=5.0):
        self.app, self.projects, self.media, self.delay = app, projects, media, delay

    async def __call__(self, scope, receive, send):
        match = re.match(r"^/api/projects/([^/]+)/(.+)$", scope.get("path", ""))
        if scope["type"] != "http" or not match:
            return await self.app(scope, receive, send)
        project_id, route = map(unquote, match.groups())
        headers = dict(scope.get("headers", []))
        query = parse_qs(scope.get("query_string", b"").decode("utf-8", errors="replace"))
        export = headers.get(b"x-queue-export") == b"1" or query.get("queue_export") == ["1"] or route.endswith(("/subtitles", "/hard-subtitle", "/export"))
        importing = route in {"media/import", "media/import-local"} or bool(re.search(r"/audio-tracks/[^/]+/import$", route))
        # Polls, playback and alignment (which reports precise worker stages)
        # cannot recursively create monitoring work.
        excluded = route.startswith("queue") or "subtitle-alignment" in route or route.endswith(("-status", "/status"))
        if excluded or not (export or importing or scope["method"] in {"POST", "PUT", "PATCH", "DELETE"}):
            return await self.app(scope, receive, send)
        kind = "import" if importing else "export" if export else "other"
        trace = {"project_id": project_id, "kind": kind, "task_ids": set(), "primary_task_id": None}
        token = REQUEST_ACTIVITY.set(trace)
        task_id = None
        status = 500
        body = bytearray()
        sent_bytes, content_length = 0, 0
        finished = False
        triggered = False
        received_bytes = 0
        try:
            upload_length = int(headers.get(b"content-length", 0))
        except ValueError:
            upload_length = 0

        async def start():
            nonlocal task_id
            if trace["task_ids"]:
                return
            def describe():
                self.projects.get(project_id)
                reserved_id = headers.get(b"x-queue-task-id", b"").decode("utf-8", errors="replace")
                if reserved_id and importing:
                    claimed = CENTER.claim_queued_task(reserved_id, project_id, kind, detail="Đang nhập media")
                    if claimed is None:
                        raise ImportReservationConflict()
                    return claimed
                asset_match = re.match(r"media/([^/]+)(?:/|$)", route)
                asset = None
                if asset_match and not importing:
                    try:
                        asset = self.media.get(project_id, asset_match[1])
                    except KeyError:
                        pass
                name = unquote(headers.get(b"x-queue-label", b"").decode("utf-8", errors="replace"))
                if asset:
                    name = asset.name
                return CENTER.start_task(kind, name or {"import": "Import media", "export": "Export", "other": "Xử lý project"}[kind],
                    project_id=project_id, asset_id=asset.id if asset else None,
                    footage_id=(asset.source_archive_asset_id or asset.id) if asset else None,
                    group_label=name or None, detail={"import": "Đang nhập media", "export": "Đang xuất file", "other": "Đang xử lý"}[kind])
            try:
                task_id = await asyncio.to_thread(describe)
                trace["primary_task_id"] = task_id
            except KeyError:
                return

        async def delayed():
            nonlocal triggered
            await asyncio.sleep(0 if importing or export else self.delay)
            triggered = True
            await start()

        if importing or export:
            try:
                await start()
            except ImportReservationConflict:
                from starlette.responses import JSONResponse
                REQUEST_ACTIVITY.reset(token)
                return await JSONResponse({"detail": "Import reservation is no longer queued"}, status_code=409)(scope, receive, send)
            timer = asyncio.create_task(asyncio.sleep(0))
        else:
            timer = asyncio.create_task(delayed())

        async def settle_timer():
            # Cancelling to_thread cannot stop its filesystem write. Once
            # dispatch has begun, retain its identity and terminal receipt.
            if not triggered:
                timer.cancel()
            await asyncio.gather(timer, return_exceptions=True)

        async def tracked_send(message):
            nonlocal status, sent_bytes, content_length, finished
            if message["type"] == "http.response.start":
                status = message["status"]
                response_headers = dict(message.get("headers", []))
                try:
                    content_length = int(response_headers.get(b"content-length", 0))
                except ValueError:
                    content_length = 0
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                sent_bytes += len(chunk)
                if importing and len(body) + len(chunk) <= 2_000_000:
                    body.extend(chunk)
                if task_id and export and content_length:
                    await asyncio.to_thread(CENTER.update_task, task_id,
                        fraction=min(.999, sent_bytes / content_length), detail=f"{sent_bytes}/{content_length} bytes")
                finished = not message.get("more_body", False)
            elif message["type"] == "http.response.pathsend":
                finished = True
            await send(message)

        async def tracked_receive():
            nonlocal received_bytes
            message = await receive()
            if task_id and importing and message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if message.get("more_body", False) and upload_length:
                    await asyncio.to_thread(CENTER.update_task, task_id,
                        fraction=min(.999, received_bytes / upload_length), detail=f"Upload · {received_bytes}/{upload_length} bytes")
                else:
                    await asyncio.to_thread(CENTER.update_task, task_id, fraction=None, detail="Kiểm tra và xử lý media")
            return message

        try:
            await self.app(scope, tracked_receive, tracked_send)
            await settle_timer()
            if task_id:
                if importing and 200 <= status < 300:
                    try:
                        asset = json.loads(body).get("asset", {})
                        if asset.get("id"):
                            await asyncio.to_thread(CENTER.update_task, task_id, asset_id=asset["id"],
                                footage_id=asset.get("sourceArchiveAssetId") or asset["id"],
                                label=asset.get("name"), group_label=asset.get("name"))
                    except (ValueError, AttributeError):
                        pass
                await asyncio.to_thread(CENTER.finish_task, task_id,
                    status="complete" if 200 <= status < 300 and finished else "failed",
                    error=None if 200 <= status < 300 and finished else f"HTTP {status}")
        except BaseException as exc:
            await settle_timer()
            if task_id:
                await asyncio.to_thread(CENTER.finish_task, task_id,
                    status="cancelled" if isinstance(exc, asyncio.CancelledError) else "failed", error=str(exc))
            raise
        finally:
            await settle_timer()
            REQUEST_ACTIVITY.reset(token)
