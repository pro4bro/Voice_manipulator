import json
import subprocess
from app.adapters.lipsync_preflight import digest_file


def verify_render(runtime, project, result):
    """Decode every frame/audio packet. Structural QC is not lip/identity quality."""
    artifacts = []
    for item in [result] + result.get("derivatives", []):
        path = (project / item["path"]).resolve()
        if not path.is_relative_to(project.resolve()) or not path.is_file() or not path.stat().st_size:
            raise ValueError("Render artifact missing/outside project")
        probe = subprocess.run([str(runtime.ffprobe), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, text=True, check=True)
        info = json.loads(probe.stdout)
        video = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
        audio = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
        if not video or not audio or video["width"] != result["width"] or video["height"] != result["height"] or abs(float(info["format"]["duration"]) - item["duration"]) > .15:
            raise ValueError("Render dimensions/duration/audio QC failed")
        decode = subprocess.run([str(runtime.ffmpeg), "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"], capture_output=True)
        if decode.returncode:
            raise ValueError("Render decode QC failed")
        artifacts.append({"path": item["path"], **digest_file(path), "duration": float(info["format"]["duration"]),
                          "mtimeNs": path.stat().st_mtime_ns, "sampleRate": int(audio["sample_rate"]), "channels": audio["channels"], "fps": video["avg_frame_rate"]})
    return {"structuralPassed": True, "qualityAccepted": False, "artifacts": artifacts}
