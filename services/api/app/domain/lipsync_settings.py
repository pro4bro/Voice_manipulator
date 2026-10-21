"""Native inference controls, resolved without importing an upstream engine."""
from app.domain.training_parameters import resolve_parameters


def resolve_lipsync_settings(option, overrides: dict) -> dict:
    if "lip-sync" not in option.tasks:
        raise ValueError("Engine không hỗ trợ LipSync.")
    values = resolve_parameters(option, overrides)
    pipeline = values.pop("pipeline", "offline")
    if option.engine == "musetalk":
        if pipeline == "realtime":
            values.pop("use_float16", None)
            if "batch_size" not in overrides:
                values["batch_size"] = 20
        else:
            values.pop("skip_save_images", None)
    arguments = []
    if option.engine == "wav2lip":
        for key in ("pads", "crop", "box"):
            vector = [values.pop(f"{key}.{edge}") for edge in ("top", "bottom", "left", "right")]
            if key == "crop" and (vector[0] < 0 or vector[2] < 0):
                raise ValueError("Crop top/left không được âm.")
            if key == "box" and vector != [-1] * 4 and any(v < 0 for v in vector):
                raise ValueError("Box cần đủ bốn tọa độ hoặc bốn giá trị -1.")
            if key != "pads" and vector != [-1] * 4:
                for start, end in ((vector[0], vector[1]), (vector[2], vector[3])):
                    if end != -1 and end <= start:
                        raise ValueError(f"{key}: biên cuối phải lớn hơn biên đầu.")
            values[key] = vector
    for key, value in values.items():
        if isinstance(value, bool):
            if value:
                arguments.extend([f"--{key}"] + (["True"] if key == "static" else []))
        else:
            arguments.append(f"--{key}")
            arguments.extend(str(item) for item in value) if isinstance(value, list) else arguments.append(str(value))
    return {"engineId": option.id, "pipeline": pipeline, "parameters": values, "arguments": arguments}
