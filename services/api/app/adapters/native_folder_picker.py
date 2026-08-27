from __future__ import annotations

from pathlib import Path


class NativeFolderPicker:
    def pick(self, initial_path: str | None = None) -> str | None:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else None
            selected = filedialog.askdirectory(
                parent=root,
                initialdir=initial_directory,
                mustexist=True,
                title="Chọn thư mục project Pro4Bro (chứa project.json)",
            )
            return str(Path(selected).resolve()) if selected else None
        finally:
            root.destroy()
