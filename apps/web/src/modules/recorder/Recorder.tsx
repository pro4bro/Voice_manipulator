import { useEffect, useRef, useState } from "react";

import { ModuleFrame } from "../../ui/ModuleFrame";
import type { RecordingWaveformPreview } from "../../domain/types";

export interface CapturedAudio {
  name: string;
  url: string;
  duration: number;
  file: File;
  origin: "record" | "import";
}

interface RecorderProps {
  onRecordingReady: (take: CapturedAudio) => void;
  onRecordingPreview?: (preview: RecordingWaveformPreview) => void;
}

type RecorderStatus = "idle" | "recording" | "finalizing" | "error";
type CaptureSource = "microphone" | "display";
type SinkAudioElement = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

function friendlyDeviceName(device: MediaDeviceInfo, index: number, kind: "input" | "output") {
  return device.label || `${kind === "input" ? "Microphone" : "Audio output"} ${index + 1}`;
}

export function Recorder({ onRecordingReady, onRecordingPreview }: RecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("Chọn thiết bị và bắt đầu thu");
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [captureSource, setCaptureSource] = useState<CaptureSource>("microphone");
  const [inputDeviceId, setInputDeviceId] = useState("");
  const [outputDeviceId, setOutputDeviceId] = useState("");
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [meter, setMeter] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.08));
  const [peakDb, setPeakDb] = useState(-60);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const monitorRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const liveSamplesRef = useRef<number[]>([]);
  const lastPreviewAtRef = useRef(0);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextInputs = devices.filter((device) => device.kind === "audioinput");
    const nextOutputs = devices.filter((device) => device.kind === "audiooutput");
    setInputs(nextInputs);
    setOutputs(nextOutputs);
    setInputDeviceId((current) => nextInputs.some((device) => device.deviceId === current) ? current : nextInputs[0]?.deviceId ?? "");
    setOutputDeviceId((current) => nextOutputs.some((device) => device.deviceId === current) ? current : nextOutputs[0]?.deviceId ?? "");
  }

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    void refreshDevices();
    const handleDeviceChange = () => void refreshDevices();
    mediaDevices.addEventListener?.("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener?.("devicechange", handleDeviceChange);
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 40);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const monitor = monitorRef.current as SinkAudioElement | null;
    const stream = streamRef.current;
    if (!monitor) return;
    if (!monitorEnabled || !stream || status !== "recording") {
      monitor.pause();
      monitor.srcObject = null;
      return;
    }

    monitor.srcObject = stream;
    const route = outputDeviceId && monitor.setSinkId ? monitor.setSinkId(outputDeviceId) : Promise.resolve();
    void route.then(() => monitor.play()).catch((error: unknown) => {
      setMessage(error instanceof Error ? `Không mở được monitor: ${error.message}` : "Không mở được monitor");
      setMonitorEnabled(false);
    });
  }, [monitorEnabled, outputDeviceId, status]);

  useEffect(() => () => stopResources(), []);

  function stopResources() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    captureStreamRef.current?.getTracks().forEach((track) => track.stop());
    captureStreamRef.current = null;
    if (monitorRef.current) {
      monitorRef.current.pause();
      monitorRef.current.srcObject = null;
    }
  }

  function startMeter(stream: MediaStream) {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(stream).connect(analyser);
    const values = new Float32Array(analyser.fftSize);
    audioContextRef.current = context;

    const draw = () => {
      analyser.getFloatTimeDomainData(values);
      let peak = 0;
      const bars = Array.from({ length: 24 }, (_, bar) => {
        const start = Math.floor((bar / 24) * values.length);
        const end = Math.floor(((bar + 1) / 24) * values.length);
        let localPeak = 0;
        for (let index = start; index < end; index += 1) localPeak = Math.max(localPeak, Math.abs(values[index]));
        peak = Math.max(peak, localPeak);
        return Math.max(0.06, Math.min(1, localPeak * 3.6));
      });
      setMeter(bars);
      setPeakDb(peak > 0.0001 ? Math.max(-60, 20 * Math.log10(peak)) : -60);
      const now = performance.now();
      if (now - lastPreviewAtRef.current >= 70) {
        lastPreviewAtRef.current = now;
        liveSamplesRef.current.push(Math.max(0.008, peak));
        if (liveSamplesRef.current.length > 3000) {
          liveSamplesRef.current = liveSamplesRef.current.filter((_, index) => index % 2 === 0);
        }
        onRecordingPreview?.({
          active: true,
          duration: Math.max(0, (now - startedAtRef.current) / 1000),
          samples: liveSamplesRef.current.slice(),
        });
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  async function start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus("error");
      setMessage("Trình duyệt không hỗ trợ MediaRecorder");
      return;
    }
    try {
      let stream: MediaStream;
      let sourceLabel = "Microphone";
      if (captureSource === "display") {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error("Trình duyệt không hỗ trợ thu âm thanh tab/hệ thống");
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        const audioTracks = displayStream.getAudioTracks();
        if (!audioTracks.length) {
          displayStream.getTracks().forEach((track) => track.stop());
          throw new Error("Nguồn đã chọn không chia sẻ audio. Hãy bật Share audio trong cửa sổ chọn tab/màn hình.");
        }
        captureStreamRef.current = displayStream;
        stream = new MediaStream(audioTracks);
        sourceLabel = audioTracks[0]?.label || "System / Browser audio";
        displayStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            if (recorderRef.current?.state === "recording") stop();
          };
        });
      } else {
        if (!navigator.mediaDevices.getUserMedia) throw new Error("Trình duyệt không hỗ trợ microphone");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
          },
        });
        sourceLabel = stream.getAudioTracks()[0]?.label || "Microphone";
      }
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm";
        const prefix = captureSource === "display" ? "system-recording" : "mic-recording";
        const file = new File([blob], `${prefix}-${Date.now()}.${extension}`, { type: blob.type });
        const url = URL.createObjectURL(blob);
        const duration = Math.max(0, (performance.now() - startedAtRef.current) / 1000);
        stopResources();
        onRecordingReady({ name: file.name, url, duration, file, origin: "record" });
        onRecordingPreview?.({ active: false, duration, samples: liveSamplesRef.current.slice() });
        setStatus("idle");
        setMessage("Đã thu xong · đang sẵn sàng cho STT kỹ");
        setPeakDb(-60);
      };
      recorder.start(250);
      startedAtRef.current = performance.now();
      liveSamplesRef.current = [];
      lastPreviewAtRef.current = 0;
      onRecordingPreview?.({ active: true, duration: 0, samples: [] });
      setElapsed(0);
      setStatus("recording");
      setMessage(`REC LIVE · ${sourceLabel}${monitorEnabled ? " · monitor ON" : ""}`);
      startMeter(stream);
      await refreshDevices();
    } catch (error) {
      stopResources();
      onRecordingPreview?.({ active: false, duration: 0, samples: [] });
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Không mở được microphone");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      setStatus("finalizing");
      setMessage("Đang hoàn tất audio...");
      recorderRef.current.stop();
    }
  }

  return (
    <ModuleFrame eyebrow="RECORDER" title="Thu âm" index="01" tone="dark" className="recorder-module">
      <div className="recorder-device-grid">
        <label><span>CAPTURE SOURCE</span><select aria-label="Nguồn thu âm" disabled={status === "recording" || status === "finalizing"} onChange={(event) => setCaptureSource(event.target.value as CaptureSource)} value={captureSource}><option value="microphone">Microphone / audio input</option><option value="display">Tab trình duyệt / cửa sổ / âm thanh hệ thống</option></select></label>
        {captureSource === "microphone" ? <label><span>MIC INPUT</span><select aria-label="Micro thu âm" disabled={status === "recording" || status === "finalizing"} onChange={(event) => setInputDeviceId(event.target.value)} value={inputDeviceId}>{inputs.length ? inputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{friendlyDeviceName(device, index, "input")}</option>) : <option value="">Microphone mặc định</option>}</select></label> : <div className="capture-source-note"><b>BROWSER SHARE PICKER</b><span>Khi bấm Record, chọn tab/cửa sổ và bật Share audio. Các tab được trình duyệt tự nhóm theo browser.</span></div>}
        <label><span>MONITOR OUTPUT</span><select aria-label="Thiết bị phát monitor" disabled={status === "recording" && monitorEnabled} onChange={(event) => setOutputDeviceId(event.target.value)} value={outputDeviceId}>{outputs.length ? outputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{friendlyDeviceName(device, index, "output")}</option>) : <option value="">Thiết bị mặc định</option>}</select></label>
      </div>
      <label className="monitor-toggle"><input aria-label="Nghe tiếng đang thu" checked={monitorEnabled} onChange={(event) => setMonitorEnabled(event.target.checked)} type="checkbox" /><span><i />Nghe tiếng đang thu</span><small>Nên dùng tai nghe để tránh feedback</small></label>
      <div className={`recorder-visualizer ${status === "recording" ? "is-live" : ""}`} aria-label={`Peak ${peakDb.toFixed(1)} dB`}>
        {meter.map((height, index) => <i key={index} style={{ height: `${height * 100}%` }} />)}
        <output>PK {peakDb.toFixed(1)} dB</output>
      </div>
      <div className="recorder-time"><strong>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{(elapsed % 60).toFixed(3).padStart(6, "0")}</strong><span className={`status-pill status-pill--${status}`}>{status.toUpperCase()}</span></div>
      <p>{message}</p>
      <div className="recorder-actions recorder-actions--single">
        <button className={`record-button ${status === "recording" ? "is-live" : ""}`} disabled={status === "finalizing"} onClick={status === "recording" ? stop : start} type="button"><span />{status === "recording" ? "Dừng thu" : "Bắt đầu thu"}</button>
      </div>
      <audio ref={monitorRef} hidden />
    </ModuleFrame>
  );
}
