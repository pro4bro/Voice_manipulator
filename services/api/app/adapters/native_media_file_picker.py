from __future__ import annotations

from pathlib import Path


class NativeMediaFilePicker:
    def pick(self, initial_path: str | None = None) -> str | None:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            initial_directory = initial_path if initial_path and Path(initial_path).is_dir() else None
            selected = filedialog.askopenfilename(
                parent=root,
                initialdir=initial_directory,
                title="Chọn audio/video để import vào Pro4Bro",
                filetypes=[
                    ("Media", "*.wav *.mp3 *.m4a *.flac *.ogg *.opus *.aac *.wma *.aif *.aiff *.ac3 *.mp4 *.mov *.mkv *.avi *.webm *.mxf *.h264 *.h265 *.hevc *.av1 *.prores"),
                    ("All files", "*.*"),
                ],
            )
            return str(Path(selected).resolve()) if selected else None
        finally:
            root.destroy()
