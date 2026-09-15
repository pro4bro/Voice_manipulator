"""Live voice conversion on this machine's own audio devices.

Run by a Voice Changer runtime Python that has numpy and sounddevice; it must
not import `app`. The browser is only a control surface: this process opens the
microphone and the outputs itself (plan 05-01, "native loop"), so the stream
does not depend on a tab staying in front and nothing is buffered twice.

Audio path, one block at a time:

    microphone -> input callback -> queue -> processing thread
        -> silence gate -> engine -> ring buffer per output -> output callbacks
                                  \\-> meters, spectra, two-channel recorder

Protocol: JSON requests on stdin, replies on stdout after REPLY_PREFIX, the same
as the other engine workers.
"""

from __future__ import annotations

import json
import queue
import sys
import threading
import time
import traceback
from pathlib import Path

REPLY_PREFIX = "@@PRO4BRO@@"


def main() -> None:
    replies = sys.stdout
    sys.stdout = sys.stderr

    import numpy as np
    import sounddevice as sd

    from voice_stream import ENGINES, RingBuffer, TwoChannelRecorder, gate, level_db, resample_linear, spectrum_bands

    def reply(payload: dict) -> None:
        replies.write(REPLY_PREFIX + json.dumps(payload, ensure_ascii=False) + "\n")
        replies.flush()

    def devices() -> list[dict]:
        hostapis = sd.query_hostapis()
        found = []
        for index, device in enumerate(sd.query_devices()):
            found.append({
                "index": index,
                "name": device["name"],
                "hostApi": hostapis[device["hostapi"]]["name"],
                "maxInputChannels": int(device["max_input_channels"]),
                "maxOutputChannels": int(device["max_output_channels"]),
                "defaultSampleRate": float(device["default_samplerate"]),
            })
        return found

    class Session:
        def __init__(self, request: dict) -> None:
            parameters = request.get("parameters") or {}
            engine_class = ENGINES.get(request["engine"])
            if engine_class is None:
                raise ValueError(f"Worker chưa có engine {request['engine']}.")
            info = sd.query_devices(request["inputDevice"], "input")
            self.sample_rate = int(request.get("sampleRate") or info["default_samplerate"])
            self.block = max(64, int(self.sample_rate * float(parameters.get("block_ms") or 40) / 1000))
            self.gate_db = float(parameters.get("silence_gate_db") if parameters.get("silence_gate_db") is not None else -60)
            self.engine = engine_class(self.sample_rate, parameters, request.get("target"))
            self.inbox: queue.Queue = queue.Queue(maxsize=64)
            self.dropped = 0
            self.outputs: list[dict] = []
            self.recorder: TwoChannelRecorder | None = None
            self.meters = {"in": (-120.0, -120.0), "out": (-120.0, -120.0)}
            self.recent_in = np.zeros(2048, dtype=np.float32)
            self.recent_out = np.zeros(2048, dtype=np.float32)
            self.lock = threading.Lock()
            self.running = True
            self.error: str | None = None
            self.started = time.time()

            def on_input(indata, frames, _time, status):
                if status.input_overflow:
                    self.dropped += 1
                try:
                    self.inbox.put_nowait(indata[:, 0].copy())
                except queue.Full:
                    self.dropped += 1

            self.input = sd.InputStream(device=request["inputDevice"], channels=1, samplerate=self.sample_rate, blocksize=self.block, dtype="float32", callback=on_input)

            for output in request.get("outputs") or []:
                self._open_output(output)
            self.worker = threading.Thread(target=self._process, daemon=True)
            self.worker.start()
            self.input.start()

        def _open_output(self, output: dict) -> None:
            device = output["device"]
            info = sd.query_devices(device, "output")
            rate = self.sample_rate
            try:
                sd.check_output_settings(device=device, samplerate=rate, channels=1, dtype="float32")
            except Exception:
                rate = int(info["default_samplerate"])
            ring = RingBuffer(rate * 2)
            ring.write(np.zeros(int(rate * self.block / self.sample_rate), dtype=np.float32))
            channels = min(2, max(1, int(info["max_output_channels"])))

            def on_output(outdata, frames, _time, _status):
                samples = ring.read(frames)
                outdata[:] = np.repeat(samples[:, None], channels, axis=1)

            stream = sd.OutputStream(device=device, channels=channels, samplerate=rate, blocksize=int(rate * self.block / self.sample_rate), dtype="float32", callback=on_output)
            stream.start()
            self.outputs.append({"role": output["role"], "device": device, "rate": rate, "ring": ring, "stream": stream})

        def _process(self) -> None:
            while self.running:
                try:
                    block = self.inbox.get(timeout=0.2)
                except queue.Empty:
                    continue
                try:
                    converted = np.zeros_like(block) if gate(block, self.gate_db) else self.engine.process(block)
                    for output in self.outputs:
                        output["ring"].write(resample_linear(converted, self.sample_rate, output["rate"]))
                    recorder = self.recorder
                    if recorder is not None:
                        recorder.append(block, converted)
                    with self.lock:
                        self.meters = {"in": level_db(block), "out": level_db(converted)}
                        self.recent_in = np.concatenate([self.recent_in, block])[-2048:]
                        self.recent_out = np.concatenate([self.recent_out, converted])[-2048:]
                except Exception as exc:  # reported through status, the stream keeps its devices closed
                    self.error = f"{type(exc).__name__}: {exc}"
                    self.running = False

        def status(self) -> dict:
            with self.lock:
                meters, recent_in, recent_out = self.meters, self.recent_in.copy(), self.recent_out.copy()
            device_ms = float(self.input.latency) * 1000 + max((float(o["stream"].latency) * 1000 for o in self.outputs), default=0.0)
            return {
                "state": "running" if self.running else "error",
                "sampleRate": self.sample_rate,
                "blockMs": round(self.block / self.sample_rate * 1000, 1),
                "algorithmicLatencyMs": round((self.block + self.engine.delay_samples) / self.sample_rate * 1000, 1),
                "deviceLatencyMs": round(device_ms, 1),
                "inputLevelDb": meters["in"][0], "inputPeakDb": meters["in"][1],
                "outputLevelDb": meters["out"][0], "outputPeakDb": meters["out"][1],
                "inputSpectrum": spectrum_bands(recent_in, self.sample_rate),
                "outputSpectrum": spectrum_bands(recent_out, self.sample_rate),
                "underruns": sum(o["ring"].underruns for o in self.outputs),
                "overruns": self.dropped + sum(o["ring"].overruns for o in self.outputs),
                "recording": self.recorder is not None,
                "recordingSeconds": round(self.recorder.seconds, 1) if self.recorder else 0.0,
                "outputs": [{"role": o["role"], "device": o["device"], "sampleRate": o["rate"]} for o in self.outputs],
                "error": self.error,
            }

        def record_start(self) -> None:
            self.recorder = TwoChannelRecorder(self.sample_rate)

        def record_stop(self, path: str) -> dict:
            recorder, self.recorder = self.recorder, None
            if recorder is None:
                raise ValueError("Chưa ghi âm.")
            return recorder.finish(Path(path), self.engine.delay_samples)

        def close(self) -> None:
            self.running = False
            for stream in [self.input, *(o["stream"] for o in self.outputs)]:
                try:
                    stream.stop()
                    stream.close()
                except Exception:
                    pass

    session: Session | None = None
    reply({"ready": True})
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        request_id = None
        try:
            request = json.loads(raw)
            request_id = request.get("id")
            command = request.get("command")
            if command == "shutdown":
                if session:
                    session.close()
                reply({"id": request_id, "ok": True})
                break
            if command == "devices":
                reply({"id": request_id, "ok": True, "devices": devices()})
            elif command == "start":
                if session:
                    session.close()
                session = None
                session = Session(request)
                reply({"id": request_id, "ok": True, "status": session.status()})
            elif command == "status":
                reply({"id": request_id, "ok": True, "status": session.status() if session else {"state": "idle"}})
            elif command == "record_start":
                if not session:
                    raise ValueError("Voice Changer chưa chạy.")
                session.record_start()
                reply({"id": request_id, "ok": True, "status": session.status()})
            elif command == "record_stop":
                if not session:
                    raise ValueError("Voice Changer chưa chạy.")
                reply({"id": request_id, "ok": True, "recording": session.record_stop(request["path"])})
            elif command == "stop":
                recording = None
                if session:
                    if session.recorder is not None and request.get("path"):
                        recording = session.record_stop(request["path"])
                    session.close()
                session = None
                reply({"id": request_id, "ok": True, "status": {"state": "idle"}, "recording": recording})
            else:
                raise ValueError(f"Lệnh không hợp lệ: {command}")
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            reply({"id": request_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
