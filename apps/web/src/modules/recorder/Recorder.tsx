import { useEffect, useRef, useState } from "react";

import { EMOTION_OPTIONS, emotionLabel } from "../../domain/emotions";
import { formatDuration, needsBreak } from "../../domain/reading-plan";
import type { EmotionCoverage, ReadingMode, ReadingPlanCard } from "../../domain/reading-plan";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { TrainingScriptDialog } from "./TrainingScriptDialog";
import type { EmotionLabel, ReadingPackSummary, RecordingWaveformPreview, StudioWord, WaveformPoint } from "../../domain/types";
import { api } from "../../api/client";
import { liveTranscriptWords, type LiveSegment } from "./live-words";
import { downsample, encodeWav, int16FrameCount, isSilent, toInt16, wavFromInt16 } from "./pcm-chunk";

export interface CapturedAudio {
  name: string;
  url: string;
  duration: number;
  file: File;
  origin: "record" | "import";
  realtimeText: string;
  /** What live recognition heard, timed off the clock. Never trusted timings. */
  words: StudioWord[];
  /** Set only in HQ mode: the card this take answers. */
  readingCardId?: string | null;
  /** The card's exact text. In HQ mode this is ground truth, not a guess. */
  knownText?: string;
}

/** What Recorder needs to show about a live session. The session itself is owned upstream. */
export interface ReadingSessionView {
  packTitle: string;
  mode: ReadingMode;
  card: ReadingPlanCard | null;
  cardNumber: number;
  cardTotal: number;
  coverage: EmotionCoverage[];
  secondsSinceBreak: number;
}

interface RecorderProps {
  onRecordingReady: (take: CapturedAudio) => void;
  onRecordingPreview?: (preview: RecordingWaveformPreview) => void;
  onLiveTranscript?: (text: string, active: boolean) => void;
  /** The project's language code, so live passes need not guess it. */
  projectLanguage?: string | null;
  readingPacks?: ReadingPackSummary[];
  readingSession?: ReadingSessionView | null;
  readingBusy?: boolean;
  onStartReadingSession?: (packId: string, emotions: EmotionLabel[], mode: ReadingMode) => void;
  onEndReadingSession?: () => void;
  onSkipCard?: () => void;
}

const PERFORMABLE_EMOTIONS = EMOTION_OPTIONS.filter((option) => option.id !== "mix");

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type SinkAudioElement = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
type RecorderStatus = "idle" | "recording" | "finalizing" | "error";
type CaptureSource = "microphone" | "display";

function friendlyDeviceName(device: MediaDeviceInfo, index: number, kind: "input" | "output") {
  return device.label || `${kind === "input" ? "Microphone" : "Audio output"} ${index + 1}`;
}

function mergeWaveform(points: WaveformPoint[]): WaveformPoint[] {
  const reduced: WaveformPoint[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const next = points[index + 1];
    const current = points[index];
    reduced.push(next ? { min: Math.min(current.min, next.min), max: Math.max(current.max, next.max) } : current);
  }
  return reduced;
}

function speechConstructor(): SpeechRecognitionConstructor | null {
  const browser = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

export function Recorder({
  onRecordingReady,
  onRecordingPreview,
  onLiveTranscript,
  projectLanguage = null,
  readingPacks = [],
  readingSession = null,
  readingBusy = false,
  onStartReadingSession,
  onEndReadingSession,
  onSkipCard,
}: RecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [captureMode, setCaptureMode] = useState<"normal" | "hq">("normal");
  const [packId, setPackId] = useState("");
  const [wantedEmotions, setWantedEmotions] = useState<EmotionLabel[]>(["normal"]);
  const [readingMode, setReadingMode] = useState<ReadingMode>("flow");
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("Chọn thiết bị và bắt đầu thu");
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [captureSource, setCaptureSource] = useState<CaptureSource>("microphone");
  const [inputDeviceId, setInputDeviceId] = useState("");
  const [outputDeviceId, setOutputDeviceId] = useState("");
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  // One number, not a row of bars: the question while recording is only "is the
  // level right", and a single lit strip answers it at a glance.
  const [level, setLevel] = useState(0);
  /** Input gain as a percentage. 0 is silence; 600 is the ceiling for a quiet mic. */
  const [inputGain, setInputGain] = useState(100);
  const gainNodeRef = useRef<GainNode | null>(null);
  // PCM tapped off the gain node, held until there is a chunk worth sending.
  const chunkTapRef = useRef<ScriptProcessorNode | null>(null);
  const chunkBufferRef = useRef<Float32Array[]>([]);
  const chunkSamplesRef = useRef(0);
  const chunkBusyRef = useRef(false);
  const liveSessionRef = useRef<string | null>(null);
  const [peakDb, setPeakDb] = useState(-60);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const monitorRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  // Recognition reports text with no timings, so the moment each phrase is
  // finalised is the only clock there is. Kept to give the recording a
  // subtitle before anyone runs STT over it.
  const liveSegmentsRef = useRef<LiveSegment[]>([]);
  const finalisedCountRef = useRef(0);
  const liveSamplesRef = useRef<WaveformPoint[]>([]);
  const lastPreviewAtRef = useRef(0);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechFinalRef = useRef("");
  const speechInterimRef = useRef("");
  // `recorder.onstop` closes over the render that started the take, so the card
  // has to reach it through a ref or a fast reader would file it under the next one.
  const cardRef = useRef<ReadingPlanCard | null>(null);
  // The take itself, tapped losslessly off the graph. MediaRecorder stays as a
  // fallback for a browser that gives us no audio graph at all.
  const takePcmRef = useRef<Int16Array[]>([]);
  const takeRateRef = useRef(0);
  const takeTapRef = useRef<ScriptProcessorNode | null>(null);
  const session = captureMode === "hq" ? readingSession : null;
  cardRef.current = session?.card ?? null;
  const busy = status === "recording" || status === "finalizing";
  const packEmotions = readingPacks.find((pack) => pack.packId === packId)?.emotions ?? [];
  const chosenEmotions = wantedEmotions.filter((emotion) => packEmotions.includes(emotion));

  function toggleEmotion(emotion: EmotionLabel, wanted: boolean) {
    setWantedEmotions((current) =>
      wanted ? [...current.filter((item) => item !== emotion), emotion] : current.filter((item) => item !== emotion),
    );
  }

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

  function stopLiveTranscript() {
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch { /* browser may have already stopped */ }
    }
  }

  function startLiveTranscript() {
    const Recognition = speechConstructor();
    speechFinalRef.current = "";
    speechInterimRef.current = "";
    liveSegmentsRef.current = [];
    finalisedCountRef.current = 0;
    if (!Recognition) {
      onLiveTranscript?.("", true);
      return;
    }
    const recognition = new Recognition();
    speechRecognitionRef.current = recognition;
    recognition.lang = document.documentElement.lang || "vi-VN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        if (result.isFinal) finalText += `${text} `;
        else interimText += `${text} `;
      }
      const results = Array.from({ length: event.results.length }, (_, at) => event.results[at]);
      const finalised = results.filter((result) => result.isFinal).length;
      if (finalised > finalisedCountRef.current) {
        const spoken = results.slice(finalisedCountRef.current)
          .filter((result) => result.isFinal)
          .map((result) => result[0]?.transcript?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        if (spoken) {
          liveSegmentsRef.current.push({ text: spoken, endedAt: (performance.now() - startedAtRef.current) / 1000 });
        }
        finalisedCountRef.current = finalised;
      }
      speechFinalRef.current = finalText.trim();
      speechInterimRef.current = interimText.trim();
      onLiveTranscript?.([speechFinalRef.current, speechInterimRef.current].filter(Boolean).join(" "), true);
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") setMessage("Live Speech Transcript tạm thời không khả dụng; audio vẫn được thu.");
    };
    recognition.onend = () => {
      if (status === "recording") onLiveTranscript?.([speechFinalRef.current, speechInterimRef.current].filter(Boolean).join(" "), true);
    };
    try { recognition.start(); } catch { /* browser can reject duplicate start */ }
  }

  function stopResources() {
    takeTapRef.current?.disconnect();
    takeTapRef.current = null;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    stopLiveTranscript();
    if (chunkTapRef.current) {
      chunkTapRef.current.onaudioprocess = null;
      chunkTapRef.current.disconnect();
      chunkTapRef.current = null;
    }
    chunkBufferRef.current = [];
    chunkSamplesRef.current = 0;
    chunkBusyRef.current = false;
    if (liveSessionRef.current) {
      // Take whatever the last pass had but never got a second opinion on.
      void api.endLiveTranscribe(liveSessionRef.current)
        .then(({ text }) => { if (text) speechFinalRef.current = text; })
        .catch(() => undefined);
      liveSessionRef.current = null;
    }
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    gainNodeRef.current = null;
    analyserRef.current = null;
    setLevel(0);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    captureStreamRef.current?.getTracks().forEach((track) => track.stop());
    captureStreamRef.current = null;
    if (monitorRef.current) {
      monitorRef.current.pause();
      monitorRef.current.srcObject = null;
    }
  }

  /**
   * Put the captured audio through a gain stage and record what comes out.
   *
   * The recorder reads the processed stream rather than the raw one, so the
   * slider changes the file itself and not merely what the meter shows - a mic
   * that records too quietly is the problem being solved, and a level that only
   * looked right would not solve it.
   */
  function buildAudioGraph(raw: MediaStream): MediaStream {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return raw;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.value = inputGain / 100;
    const analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.18;
    const destination = context.createMediaStreamDestination();
    context.createMediaStreamSource(raw).connect(gain);
    gain.connect(analyser);
    gain.connect(destination);
    audioContextRef.current = context;
    gainNodeRef.current = gain;
    analyserRef.current = analyser;
    startTakeCapture(context, gain);
    return destination.stream;
  }

  /**
   * Accumulate the take at the device's own rate, after input gain.
   *
   * This runs for every source, because any recording can end up in a training
   * set and Opus is not something a dataset can be talked out of afterwards.
   */
  function startTakeCapture(context: AudioContext, gain: GainNode) {
    takePcmRef.current = [];
    takeRateRef.current = context.sampleRate;
    const tap = context.createScriptProcessor(4096, 1, 1);
    tap.onaudioprocess = (event) => {
      takePcmRef.current.push(toInt16(event.inputBuffer.getChannelData(0)));
    };
    gain.connect(tap);
    // Silent sink: a ScriptProcessor only runs while it reaches a destination.
    const mute = context.createGain();
    mute.gain.value = 0;
    tap.connect(mute).connect(context.destination);
    takeTapRef.current = tap;
  }

  /** Seconds of audio per chunk: long enough to be a phrase, short enough to feel live. */
  const CHUNK_SECONDS = 4;

  /**
   * Transcribe the captured audio itself, in chunks, through the local studio.
   *
   * Used when the source is a tab, a window or the desktop, because the browser's
   * own recogniser cannot be pointed at anything but the default microphone. A
   * warm `tiny` model turns a 3 s chunk around in about 1.3 s here, so the text
   * lands a beat behind the speech rather than not at all.
   */
  function startCapturedTranscript(context: AudioContext, gain: GainNode) {
    const tap = context.createScriptProcessor(4096, 1, 1);
    const needed = context.sampleRate * CHUNK_SECONDS;
    tap.onaudioprocess = (event) => {
      chunkBufferRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      chunkSamplesRef.current += event.inputBuffer.length;
      if (chunkSamplesRef.current < needed || chunkBusyRef.current) return;
      const merged = new Float32Array(chunkSamplesRef.current);
      let at = 0;
      for (const part of chunkBufferRef.current) { merged.set(part, at); at += part.length; }
      chunkBufferRef.current = [];
      chunkSamplesRef.current = 0;
      void sendChunk(merged, context.sampleRate);
    };
    gain.connect(tap);
    // A ScriptProcessor only runs while it is connected to a destination; the
    // gain of zero keeps it silent so the monitor path is unaffected.
    const mute = context.createGain();
    mute.gain.value = 0;
    tap.connect(mute).connect(context.destination);
    chunkTapRef.current = tap;
  }

  async function sendChunk(samples: Float32Array, sampleRate: number) {
    const session = liveSessionRef.current;
    const reduced = downsample(samples, sampleRate);
    if (!session || isSilent(reduced)) return;
    chunkBusyRef.current = true;
    try {
      const { committed, text, pending } = await api.liveTranscribeChunk(session, encodeWav(reduced), projectLanguage ?? "");
      // `text` is settled and will not be rewritten; `pending` still might be,
      // so it rides in the interim slot the microphone path already uses.
      speechFinalRef.current = text;
      speechInterimRef.current = pending;
      if (committed) {
        liveSegmentsRef.current.push({ text: committed, endedAt: (performance.now() - startedAtRef.current) / 1000 });
      }
      onLiveTranscript?.([text, pending].filter(Boolean).join(" "), true);
    } catch {
      // A dropped chunk is a gap in the live text, never a failed recording.
    } finally {
      chunkBusyRef.current = false;
    }
  }

  function startMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const values = new Float32Array(analyser.fftSize);

    const draw = () => {
      analyser.getFloatTimeDomainData(values);
      let peak = 0;
      let liveMin = 0;
      let liveMax = 0;
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index] ?? 0;
        peak = Math.max(peak, Math.abs(value));
        liveMin = Math.min(liveMin, value);
        liveMax = Math.max(liveMax, value);
      }
      setLevel(Math.min(1, peak * 1.6));
      setPeakDb(peak > 0.0001 ? Math.max(-60, 20 * Math.log10(peak)) : -60);
      const now = performance.now();
      if (now - lastPreviewAtRef.current >= 20) {
        lastPreviewAtRef.current = now;
        liveSamplesRef.current.push({
          min: Math.min(-0.004, liveMin),
          max: Math.max(0.004, liveMax),
        });
        if (liveSamplesRef.current.length > 4096) liveSamplesRef.current = mergeWaveform(liveSamplesRef.current);
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
      const recorded = buildAudioGraph(stream);
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(recorded, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const prefix = captureSource === "display" ? "system-recording" : "mic-recording";
        const frames = int16FrameCount(takePcmRef.current);
        const rate = takeRateRef.current;
        // Lossless when the audio graph gave us PCM, which is every browser that
        // has AudioContext. The encoded fallback exists so a recording is never
        // lost to a missing graph, not because it is good enough for training.
        const lossless = frames > 0 && rate > 0;
        const blob = lossless
          ? wavFromInt16(takePcmRef.current, rate)
          : new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const extension = lossless ? "wav" : recorder.mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `${prefix}-${Date.now()}.${extension}`, { type: blob.type });
        const url = URL.createObjectURL(blob);
        // Sample count is the exact length; the wall clock includes the moment
        // between pressing stop and the graph going quiet.
        const duration = lossless
          ? frames / rate
          : Math.max(0, (performance.now() - startedAtRef.current) / 1000);
        const realtimeText = [speechFinalRef.current, speechInterimRef.current].filter(Boolean).join(" ").trim();
        const card = cardRef.current;
        stopResources();
        onRecordingReady({
          name: card ? `${card.cardId}.${extension}` : file.name,
          url,
          duration,
          file,
          origin: "record",
          realtimeText,
          words: liveTranscriptWords(liveSegmentsRef.current, duration),
          readingCardId: card?.cardId ?? null,
          knownText: card?.text,
        });
        onRecordingPreview?.({ active: false, duration, samples: liveSamplesRef.current.slice() });
        onLiveTranscript?.(realtimeText, false);
        setStatus("idle");
        setMessage("Đã thu xong · STT kỹ và AI review đang chạy nền");
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
      startMeter();
      // Browser speech recognition always listens to the default microphone, so
      // it is right for a microphone and wrong for anything else. A captured tab
      // or window is transcribed from its own audio instead, through the studio.
      if (captureSource === "microphone") startLiveTranscript();
      else {
        const context = audioContextRef.current;
        const gain = gainNodeRef.current;
        speechFinalRef.current = "";
        speechInterimRef.current = "";
        onLiveTranscript?.("", true);
        liveSessionRef.current = `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        if (context && gain) startCapturedTranscript(context, gain);
      }
      await refreshDevices();
    } catch (error) {
      stopResources();
      onRecordingPreview?.({ active: false, duration: 0, samples: [] });
      onLiveTranscript?.("", false);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Không mở được microphone");
    }
  }

  useEffect(() => {
    const gain = gainNodeRef.current;
    if (gain) gain.gain.value = inputGain / 100;
  }, [inputGain]);

  function stop() {
    if (recorderRef.current?.state === "recording") {
      setStatus("finalizing");
      setMessage("Đang hoàn tất audio...");
      recorderRef.current.stop();
    }
  }

  return (
    <ModuleFrame
      eyebrow={captureMode === "hq" ? "RECORDER · HIGH QUALITY" : "RECORDER"}
      title="Thu âm"
      index="01"
      tone="dark"
      className="recorder-module"
      action={
        <div className="capture-mode-toggle" role="group" aria-label="Chế độ thu">
          <button aria-pressed={captureMode === "normal"} className={captureMode === "normal" ? "is-active" : ""} disabled={busy || Boolean(readingSession)} onClick={() => setCaptureMode("normal")} type="button">Thường</button>
          <button aria-pressed={captureMode === "hq"} className={captureMode === "hq" ? "is-active" : ""} disabled={busy} onClick={() => setCaptureMode("hq")} type="button">HQ</button>
        </div>
      }
    >
      {captureMode === "hq" && !session ? (
        <div className="hq-setup">
          <p className="hq-intro">Chọn bộ bài đọc và cảm xúc. Script sẽ hiện bài để bạn đọc theo, và highlight chạy theo từng từ.</p>
          <label><span>READING PACK</span><select aria-label="Bộ bài đọc" onChange={(event) => setPackId(event.target.value)} value={packId}><option value="">Chưa chọn</option>{readingPacks.map((pack) => <option key={pack.packId} value={pack.packId}>{pack.title} · {pack.cardCount} thẻ</option>)}</select></label>
          <label><span>CÁCH ĐỌC</span><select aria-label="Cách đọc" onChange={(event) => setReadingMode(event.target.value as ReadingMode)} value={readingMode}><option value="flow">Liền mạch · đọc cả bài, app tự cắt</option><option value="take">Từng thẻ · mỗi câu một lần bấm</option></select></label>
          <div className="hq-emotions"><span>CẢM XÚC</span><div>{PERFORMABLE_EMOTIONS.map((option) => <label aria-disabled={!packEmotions.includes(option.id)} key={option.id}><input checked={chosenEmotions.includes(option.id)} disabled={!packEmotions.includes(option.id)} onChange={(event) => toggleEmotion(option.id, event.target.checked)} type="checkbox" /><span>{option.label}</span></label>)}</div></div>
          <button className="button button--accent button--full" disabled={!packId || !chosenEmotions.length || readingBusy} onClick={() => onStartReadingSession?.(packId, chosenEmotions, readingMode)} type="button">{readingBusy ? "Đang mở phiên..." : "Bắt đầu phiên đọc"}</button>
          <button className="button button--quiet button--full" onClick={() => setAuthoringOpen(true)} type="button">Add Training Script</button>
        </div>
      ) : null}
      {authoringOpen ? <TrainingScriptDialog onClose={() => setAuthoringOpen(false)} onSaved={(note) => setMessage(note)} /> : null}
      {session ? (
        <div className="hq-session">
          <div className="hq-session__head"><b>{session.packTitle}</b><span>{session.mode === "flow" ? "LIỀN MẠCH" : "TỪNG THẺ"} · THẺ {session.cardNumber}/{session.cardTotal}</span></div>
          {session.card ? <p className="hq-direction"><b>{emotionLabel(session.card.emotion)}</b>{session.card.direction}</p> : <p className="hq-direction">Đã thu hết thẻ trong phiên này.</p>}
          <ul className="hq-coverage">{session.coverage.map((item) => <li key={item.emotion}><span>{emotionLabel(item.emotion)}</span><i><b style={{ width: `${Math.round(item.progress * 100)}%` }} /></i><small>còn {formatDuration(item.remainingSeconds)}</small></li>)}</ul>
          {needsBreak(session.secondsSinceBreak) ? <p className="hq-warning">Đã thu {formatDuration(session.secondsSinceBreak)} liên tục. Nghỉ một lát — giọng mệt sẽ lệch so với phần đã thu.</p> : null}
          <div className="hq-session__actions"><button className="button button--quiet" disabled={busy || !session.card} onClick={() => onSkipCard?.()} type="button">Bỏ thẻ này</button><button className="button button--quiet" disabled={busy} onClick={() => onEndReadingSession?.()} type="button">Kết thúc phiên</button></div>
        </div>
      ) : null}
      <div className="recorder-device-grid" hidden={Boolean(session)}>
        <label><span>CAPTURE SOURCE</span><select aria-label="Nguồn thu âm" disabled={status === "recording" || status === "finalizing"} onChange={(event) => setCaptureSource(event.target.value as CaptureSource)} value={captureSource}><option value="microphone">Microphone / audio input</option><option value="display">Tab trình duyệt / cửa sổ / âm thanh hệ thống</option></select></label>
        {captureSource === "microphone" ? <label><span>MIC INPUT</span><select aria-label="Micro thu âm" disabled={status === "recording" || status === "finalizing"} onChange={(event) => setInputDeviceId(event.target.value)} value={inputDeviceId}>{inputs.length ? inputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{friendlyDeviceName(device, index, "input")}</option>) : <option value="">Microphone mặc định</option>}</select></label> : <div className="capture-source-note"><b>BROWSER SHARE PICKER</b><span>Khi bấm Record, chọn tab/cửa sổ và bật Share audio. Các tab được trình duyệt tự nhóm theo browser.</span><span>Live transcript cho nguồn này chạy bằng chính audio đang bắt, qua OmniVoice Studio (model tiny), nên đúng tiếng tab chứ không phải tiếng phòng. Text hiện chậm hơn lời nói khoảng một nhịp.</span><span>Độ to đầu vào theo volume của chính tab/cửa sổ đó; volume hệ thống không ảnh hưởng.</span></div>}
        <label><span>MONITOR OUTPUT</span><select aria-label="Thiết bị phát monitor" disabled={status === "recording" && monitorEnabled} onChange={(event) => setOutputDeviceId(event.target.value)} value={outputDeviceId}>{outputs.length ? outputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{friendlyDeviceName(device, index, "output")}</option>) : <option value="">Thiết bị mặc định</option>}</select></label>
      </div>
      <label className="monitor-toggle"><input aria-label="Nghe tiếng đang thu" checked={monitorEnabled} onChange={(event) => setMonitorEnabled(event.target.checked)} type="checkbox" /><span><i />Nghe tiếng đang thu</span><small>Nên dùng tai nghe để tránh feedback</small></label>
      <label className="recorder-gain">
        <span>INPUT VOLUME</span>
        <input aria-label="Âm lượng đầu vào khi thu" max={600} min={0} onChange={(event) => setInputGain(Number(event.target.value))} step={5} type="range" value={inputGain} />
        <b>{inputGain}%</b>
      </label>
      <div className={`recorder-level ${status === "recording" ? "is-live" : ""}`} aria-label={`Mức tín hiệu, đỉnh ${peakDb.toFixed(1)} dB`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        <i style={{ width: `${Math.round(level * 100)}%` }} />
        <output>PK {peakDb.toFixed(1)} dB</output>
      </div>
      <div className="recorder-time"><strong>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{(elapsed % 60).toFixed(3).padStart(6, "0")}</strong><span className={`status-pill status-pill--${status}`}>{status.toUpperCase()}</span></div>
      <p>{message}</p>
      <div className="recorder-actions recorder-actions--single">
        <button className={`record-button ${status === "recording" ? "is-live" : ""}`} disabled={status === "finalizing" || (captureMode === "hq" && !session?.card)} onClick={status === "recording" ? stop : start} type="button"><span />{status === "recording" ? "Dừng thu" : session?.card ? `Thu thẻ ${session.cardNumber}` : "Bắt đầu thu"}</button>
      </div>
      <audio ref={monitorRef} hidden />
    </ModuleFrame>
  );
}
