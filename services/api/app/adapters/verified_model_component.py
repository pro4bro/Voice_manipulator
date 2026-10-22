"""Check the pinned download receipt without importing a GPU runtime."""
from __future__ import annotations

import json
import hashlib
from pathlib import Path, PurePosixPath
import re


def verified_component(folder: Path, model_id: str, revision: str, required: tuple[str, ...], *, hash_contents: bool = False) -> dict:
    try:
        receipt = json.loads((folder / ".pro4bro-model-receipt.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"{model_id}: chưa có receipt xác minh model.") from exc
    if (not isinstance(receipt, dict) or receipt.get("schemaVersion") != 1
            or receipt.get("modelId") != model_id or receipt.get("revision") != revision):
        raise ValueError(f"{model_id}: receipt không khớp model/revision.")
    files = receipt.get("files")
    if not isinstance(files, list):
        raise ValueError(f"{model_id}: receipt không hợp lệ.")
    seen = set()
    for item in files:
        if not isinstance(item, dict):
            raise ValueError(f"{model_id}: receipt không hợp lệ.")
        name, digest = item.get("path"), item.get("hash")
        if (not isinstance(name, str) or not name or "\\" in name or ":" in name
                or any(part in {"", ".", ".."} for part in name.split("/"))
                or PurePosixPath(name).is_absolute() or name in seen
                or not isinstance(digest, str)
                or not re.fullmatch(r"(?:sha256:[0-9a-f]{64}|git-sha1:[0-9a-f]{40})", digest)):
            raise ValueError(f"{model_id}: receipt chứa file/hash không hợp lệ.")
        seen.add(name)
        path = (folder / name).resolve()
        if not path.is_relative_to(folder.resolve()):
            raise ValueError(f"{model_id}: file nằm ngoài thư mục model.")
        try:
            stat = path.stat()
        except OSError as exc:
            raise ValueError(f"{model_id}: thiếu file {name}.") from exc
        if (not path.is_file() or stat.st_size <= 0
                or type(item.get("size")) is not int or type(item.get("mtimeNs")) is not int
                or item["size"] != stat.st_size or item["mtimeNs"] != stat.st_mtime_ns):
            raise ValueError(f"{model_id}: file thay đổi sau khi xác minh: {name}.")
        if hash_contents:
            kind, expected = digest.split(":", 1)
            hasher = hashlib.sha256() if kind == "sha256" else hashlib.sha1()
            if kind == "git-sha1":
                hasher.update(f"blob {stat.st_size}\0".encode())
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
                    hasher.update(chunk)
            after = path.stat()
            if (hasher.hexdigest() != expected or after.st_mtime_ns != stat.st_mtime_ns
                    or after.st_size != stat.st_size):
                raise ValueError(f"{model_id}: hash không khớp file đã tải: {name}.")
    if not set(required) <= seen:
        raise ValueError(f"{model_id}: thiếu files đã xác minh: {', '.join(sorted(set(required) - seen))}.")
    return receipt
