"""Portable output packaging and transactional removal of explicitly owned paths."""
import json
import re
import shutil
import zipfile
from pathlib import Path
from uuid import uuid4


def checked_path(root, path):
    root, path = Path(root).resolve(), Path(path)
    resolved = path.resolve()
    if resolved == root or not resolved.is_relative_to(root):
        raise ValueError("Đường dẫn thành phẩm nằm ngoài thư mục được quản lý.")
    for part in (path, *path.parents):
        if part == root or not part.is_relative_to(root):
            break
        if part.exists() and (part.is_symlink() or getattr(part.lstat(), "st_file_attributes", 0) & 0x400):
            raise ValueError("Không xử lý liên kết thư mục trong thành phẩm.")
    return resolved


def purge_owned(project_root, paths, commit):
    """Stage moves first; rollback on commit failure. Inputs are adapter-owned."""
    root = Path(project_root).resolve()
    targets = [checked_path(root, path) for path in paths if Path(path).exists()]
    targets = sorted(set(targets), key=lambda path: len(path.parts))
    targets = [path for i, path in enumerate(targets) if not any(path.is_relative_to(parent) for parent in targets[:i])]
    staging = root / "cache" / "output-purge" / uuid4().hex
    staging.mkdir(parents=True)
    moved = []
    try:
        for index, source in enumerate(targets):
            destination = staging / str(index)
            source.replace(destination)
            moved.append((source, destination))
        result = commit()
    except Exception:
        for source, destination in reversed(moved):
            source.parent.mkdir(parents=True, exist_ok=True)
            destination.replace(source)
        raise
    finally:
        # Both staging and its target have been resolved inside this project.
        if staging.exists() and not any(staging.iterdir()):
            staging.rmdir()
    checked_path(root / "cache" / "output-purge", staging)
    shutil.rmtree(staging, ignore_errors=True)
    return result


def export_owned(project_root, kind, name, manifest, paths):
    root = Path(project_root).resolve()
    label = re.sub(r"[^\w .-]", "_", name).strip(" .")[:90] or kind
    destination = root / "exports" / "output-slots" / f"{label}--{uuid4().hex[:10]}.zip"
    destination.parent.mkdir(parents=True, exist_ok=True)
    files = {}
    for path in paths:
        path = checked_path(root, path)
        if not path.exists():
            raise ValueError(f"Thiếu thành phẩm: {path.relative_to(root).as_posix()}")
        for item in (path.rglob("*") if path.is_dir() else [path]):
            if item.is_file():
                resolved = checked_path(root, item)
                files[resolved.relative_to(root).as_posix()] = resolved
    try:
        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            for relative, path in sorted(files.items()):
                archive.write(path, relative)
        return destination
    except Exception:
        destination.unlink(missing_ok=True)
        raise
