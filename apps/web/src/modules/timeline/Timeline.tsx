import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type UIEvent } from "react";

import { publishPlaybackWord } from "../../domain/playback-sync";
import { buildAutoCalibrationKeyframes, dbToLinear, gainAtTime } from "./gain-automation";
import type { RecordingWaveformPreview, SpeakerProfile, StudioWord, TimelineEditRange, TimelineGainKeyframe } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

export interface ActiveTake {
  id?: string;
  name: string;
  url?: string;
  duration: number;
  text?: string;
  words?: StudioWord[];
  wordTimingQuality?: "unverified" | "source" | "needs-alignment";
  wordTimingNote?: string | null;
}

interface EnvelopePoint {
  min: number;
  max: number;
}

interface WaveformDetail {
  start: number;
  end: number;
  resolution: number;
  points: EnvelopePoint[];
}

interface DetailWaveformRequest {
  start: number;
  end: number;
  viewportStart: number;
  viewportEnd: number;
  points: number;
}

interface TimelineProps {
  take: ActiveTake | null;
  gain: number;
  recordingPreview?: RecordingWaveformPreview | null;
  removedRanges?: TimelineEditRange[];
  gainKeyframes?: TimelineGainKeyframe[];
  onGainChange: (value: number) => void;
  onRemovedRangesChange?: (ranges: TimelineEditRange[]) => void;
  onGainKeyframesChange?: (keyframes: TimelineGainKeyframe[]) => void;
  speakers?: SpeakerProfile[];
  onWordsChange?: (words: StudioWord[]) => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];
const PATH_WIDTH = 12000;
const PATH_HEIGHT = 100;
const GAIN_PREVIEW_DIVISIONS = 12;
const GAIN_PREVIEW_PARTS = [1, 5, 9];
const AUTO_CALIBRATE_CEILING = 10 ** (-1 / 20);
const MAX_GAIN_RANGES = 96;
const CLOCK_STATE_INTERVAL_MS = 80;
const MAX_TIMELINE_PIXELS_PER_SECOND = 1000;
const WORD_TRACK_BUFFER_SECONDS = 2;
const DETAIL_WAVEFORM_DEBOUNCE_MS = 160;
const DETAIL_WAVEFORM_MAX_POINTS = 12_000;

interface WaveformRange {
  start: number;
  end: number;
}

function timecode(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe - hours * 3600 - minutes * 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(3).padStart(6, "0")}`;
}

function paintEnvelopeRange(
  context: CanvasRenderingContext2D,
  points: EnvelopePoint[],
  gain: number,
  range: WaveformRange,
  autoCalibrate: boolean,
) {
  const start = Math.max(0, Math.floor(range.start));
  const end = Math.min(points.length, Math.ceil(range.end));
  if (end <= start) return;
  const center = PATH_HEIGHT / 2;
  const amplitude = PATH_HEIGHT * 0.46;
  const coordinate = (point: EnvelopePoint, index: number, edge: "min" | "max") => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * PATH_WIDTH;
    const peak = Math.max(Math.abs(point.min * gain), Math.abs(point.max * gain));
    const calibration = autoCalibrate && peak > AUTO_CALIBRATE_CEILING
      ? AUTO_CALIBRATE_CEILING / peak
      : 1;
    const value = Math.max(-1, Math.min(1, point[edge] * gain * calibration));
    return { x, y: center - value * amplitude };
  };
  const first = coordinate(points[start], start, "max");
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let index = start + 1; index < end; index += 1) {
    const point = coordinate(points[index], index, "max");
    context.lineTo(point.x, point.y);
  }
  for (let index = end - 1; index >= start; index -= 1) {
    const point = coordinate(points[index], index, "min");
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fill();
}

function paintEnvelope(
  canvas: HTMLCanvasElement,
  points: EnvelopePoint[],
  gain: number,
  previewGain: number | null,
  autoCalibrate: boolean,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.width = PATH_WIDTH;
  canvas.height = PATH_HEIGHT;
  const styles = getComputedStyle(canvas);
  context.fillStyle = styles.getPropertyValue("--surface-audio").trim() || "#151714";
  context.fillRect(0, 0, PATH_WIDTH, PATH_HEIGHT);
  if (!points.length) return;
  context.fillStyle = styles.color || "#ff6745";
  context.globalAlpha = 0.84;
  paintEnvelopeRange(context, points, gain, { start: 0, end: points.length }, autoCalibrate);
  if (previewGain !== null) {
    context.fillStyle = styles.getPropertyValue("--lime").trim() || "#b9ff38";
    context.globalAlpha = 0.94;
    for (const range of gainPreviewRanges(points.length)) {
      paintEnvelopeRange(context, points, previewGain, range, autoCalibrate);
    }
  }
  context.globalAlpha = 1;
}

function gainPreviewRanges(pointCount: number): WaveformRange[] {
  return GAIN_PREVIEW_PARTS.map((part) => ({
    start: Math.floor((part / GAIN_PREVIEW_DIVISIONS) * pointCount),
    end: Math.ceil(((part + 1) / GAIN_PREVIEW_DIVISIONS) * pointCount),
  }));
}

function overflowRanges(points: EnvelopePoint[], gain: number): WaveformRange[] {
  if (!points.length || gain <= 0) return [];
  const threshold = 1 / gain;
  const ranges: WaveformRange[] = [];
  const permittedGap = Math.max(1, Math.floor(points.length / 1600));
  let start = -1;
  let lastOver = -1;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const over = Math.max(Math.abs(point.min), Math.abs(point.max)) > threshold;
    if (over) {
      if (start < 0) start = index;
      lastOver = index;
    } else if (start >= 0 && index - lastOver > permittedGap) {
      ranges.push({ start, end: lastOver + 1 });
      start = -1;
    }
  }
  if (start >= 0) ranges.push({ start, end: lastOver + 1 });
  if (ranges.length <= MAX_GAIN_RANGES) return ranges;
  const stride = Math.ceil(ranges.length / MAX_GAIN_RANGES);
  return Array.from({ length: Math.ceil(ranges.length / stride) }, (_, index) => {
    const group = ranges.slice(index * stride, (index + 1) * stride);
    return { start: group[0].start, end: group[group.length - 1].end };
  });
}

function liveEnvelope(samples: EnvelopePoint[]): EnvelopePoint[] {
  return samples;
}

export function normalizeWordTimings(words: StudioWord[], duration: number): StudioWord[] {
  const safeDuration = Math.max(0.001, duration);
  return words.map((word) => {
    const start = Number.isFinite(word.start) ? Math.min(safeDuration, Math.max(0, word.start)) : 0;
    const rawEnd = Number.isFinite(word.end) ? word.end : start;
    const end = Math.min(safeDuration, Math.max(start, rawEnd));
    return { ...word, start, end };
  });
}

function activeWordAt(words: StudioWord[], time: number) {
  if (!words.length) return -1;
  let low = 0;
  let high = words.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (words[middle].start <= time) { candidate = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (candidate < 0) return -1;
  const word = words[candidate];
  return time >= word.start && time <= word.end ? candidate : -1;
}

export function Timeline({
  take,
  gain,
  recordingPreview = null,
  removedRanges = [],
  gainKeyframes = [],
  onGainChange,
  onRemovedRangesChange,
  onGainKeyframesChange,
  speakers = [],
  onWordsChange,
}: TimelineProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [detailEnvelope, setDetailEnvelope] = useState<WaveformDetail | null>(null);
  const [detailWaveformState, setDetailWaveformState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [decodedDuration, setDecodedDuration] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [signalDb, setSignalDb] = useState(-60);
  const [peakDb, setPeakDb] = useState(-60);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [stagedCut, setStagedCut] = useState<TimelineEditRange | null>(null);
  const [draftGain, setDraftGain] = useState(gain);
  const [isGainPreviewing, setIsGainPreviewing] = useState(false);
  const [autoCalibrate, setAutoCalibrate] = useState(false);
  const [timelineCanvasWidth, setTimelineCanvasWidth] = useState(0);
  const [timelineViewport, setTimelineViewport] = useState({ left: 0, width: 0 });
  const [speakerMenu, setSpeakerMenu] = useState<{ indexes: number[]; x: number; y: number } | null>(null);
  const [selectedWordIndexes, setSelectedWordIndexes] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    if (!speakerMenu) return undefined;
    const closeOutside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".timeline-speaker-menu")) return;
      setSpeakerMenu(null);
    };
    window.addEventListener("pointerdown", closeOutside, true);
    return () => window.removeEventListener("pointerdown", closeOutside, true);
  }, [speakerMenu]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineCanvasRef = useRef<HTMLDivElement>(null);
  const wordTrackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const transportProgressRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const detailWaveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelinePixelWidthRef = useRef(0);
  const playheadDragRef = useRef(false);
  const transportScrubRef = useRef(false);
  const timelineNavigatorDraggingRef = useRef(false);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const lastMeterStateUpdateRef = useRef(0);
  const playbackClockFrameRef = useRef<number | null>(null);
  const lastClockStateUpdateRef = useRef(0);
  const scrubbingRef = useRef(false);
  const gainInteractionRef = useRef(false);
  const wordSelectionAnchorRef = useRef<number | null>(null);
  const wordSelectionDraggingRef = useRef(false);
  const isRecording = Boolean(recordingPreview?.active);
  const words = take?.words ?? [];
  const lastWordEnd = words.length ? Math.max(...words.map((word) => word.end)) : 0;
  const sourceDuration = isRecording
    ? Math.max(0.1, recordingPreview?.duration ?? 0)
    : mediaDuration || decodedDuration || take?.duration || lastWordEnd;
  const duration = sourceDuration || 10;
  const timingNeedsAlignment = take?.wordTimingQuality === "needs-alignment";
  // A recognizer fallback must never masquerade as source-aligned subtitles.
  // Keeping those boxes hidden prevents users from making edits against wrong timing.
  const displayWords = useMemo(() => normalizeWordTimings(words, duration), [duration, words]);
  const speakerById = useMemo(() => new Map(speakers.map((speaker) => [speaker.id, speaker])), [speakers]);
  const detailRequest = useMemo(() => {
    if (isRecording || !timelineCanvasWidth || !timelineViewport.width) return null;
    const fullWidth = Math.max(timelineCanvasWidth, timelineViewport.width);
    const viewportStart = (timelineViewport.left / fullWidth) * duration;
    const viewportDuration = (timelineViewport.width / fullWidth) * duration;
    const buffer = viewportDuration * 0.4;
    const start = Math.max(0, viewportStart - buffer);
    const end = Math.min(duration, viewportStart + viewportDuration + buffer);
    if (end - start <= 0.001) return null;
    const deviceScale = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
    return {
      start,
      end,
      viewportStart,
      viewportEnd: viewportStart + viewportDuration,
      points: Math.max(1_024, Math.min(DETAIL_WAVEFORM_MAX_POINTS, Math.ceil(timelineViewport.width * deviceScale * 1.5))),
    } satisfies DetailWaveformRequest;
  }, [duration, isRecording, timelineCanvasWidth, timelineViewport, zoom]);
  const visualGain = 10 ** (gain / 20);
  const draftVisualGain = 10 ** (draftGain / 20);
  const visibleEnvelope = isRecording ? liveEnvelope(recordingPreview?.samples ?? []) : detailEnvelope?.points ?? [];
  const waveformPreviewGain = !isRecording && isGainPreviewing ? draftVisualGain : null;
  const gainWindowStart = isRecording ? 0 : detailEnvelope?.start ?? 0;
  const gainWindowDuration = isRecording ? duration : Math.max(0.001, (detailEnvelope?.end ?? duration) - gainWindowStart);
  const gainOverflows = useMemo(
    () => isRecording ? [] : overflowRanges(visibleEnvelope, visualGain),
    [isRecording, visibleEnvelope, visualGain],
  );
  const latestPreview = visibleEnvelope[visibleEnvelope.length - 1];
  const latestPreviewPeak = latestPreview ? Math.max(Math.abs(latestPreview.min), Math.abs(latestPreview.max)) : 0;
  const previewDb = latestPreviewPeak > 0.0001 ? Math.min(96, Math.max(-96, 20 * Math.log10(latestPreviewPeak) + gain)) : -96;
  const activeSignalDb = isRecording ? previewDb : signalDb;
  const activePeakDb = isRecording ? Math.max(peakDb, previewDb) : peakDb;
  const meterPercent = Math.min(100, Math.max(0, ((activeSignalDb + 96) / 192) * 100));
  const peakPercent = Math.min(100, Math.max(0, ((activePeakDb + 96) / 192) * 100));
  const activeWordIndex = isRecording ? -1 : activeWordAt(displayWords, currentTime);
  const wordTrackIndexes = useMemo(() => {
    if (displayWords.length <= 1400) return displayWords.map((_, index) => index);
    if (!timelineCanvasWidth) return displayWords.slice(0, 240).map((_, index) => index);
    const canvasWidth = timelineCanvasWidth || 1000;
    const viewportWidth = timelineViewport.width || Math.min(canvasWidth, 1000);
    const start = Math.max(0, ((timelineViewport.left / canvasWidth) * duration) - WORD_TRACK_BUFFER_SECONDS);
    const end = Math.min(duration, (((timelineViewport.left + viewportWidth) / canvasWidth) * duration) + WORD_TRACK_BUFFER_SECONDS);
    let low = 0; let high = displayWords.length;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (displayWords[middle].end < start) low = middle + 1; else high = middle; }
    const indexes: number[] = [];
    for (let index = Math.max(0, low - 1); index < displayWords.length && displayWords[index].start <= end; index += 1) indexes.push(index);
    if (activeWordIndex >= 0 && !indexes.includes(activeWordIndex)) indexes.push(activeWordIndex);
    return indexes.sort((left, right) => left - right);
  }, [activeWordIndex, displayWords, duration, timelineCanvasWidth, timelineViewport]);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));
  const timelineNavigator = useMemo(() => {
    const visible = Math.max(0, timelineViewport.width);
    const total = Math.max(visible, timelineCanvasWidth);
    const maxScroll = Math.max(0, total - visible);
    const width = total > 0 ? Math.min(100, (visible / total) * 100) : 100;
    const left = maxScroll > 0 ? Math.max(0, Math.min(100 - width, (timelineViewport.left / maxScroll) * (100 - width))) : 0;
    return { left, width, enabled: maxScroll > 0.5 };
  }, [timelineCanvasWidth, timelineViewport]);

  useEffect(() => {
    setSelectedWordIndexes(new Set());
    wordSelectionAnchorRef.current = null;
    wordSelectionDraggingRef.current = false;
  }, [take?.id, take?.url]);

  useEffect(() => {
    const moveWordSelection = (event: globalThis.PointerEvent) => extendWordSelectionAtPoint(event.clientX, event.clientY);
    const endWordSelection = () => { wordSelectionDraggingRef.current = false; };
    window.addEventListener("pointermove", moveWordSelection, true);
    window.addEventListener("pointerup", endWordSelection);
    window.addEventListener("pointercancel", endWordSelection);
    return () => {
      window.removeEventListener("pointermove", moveWordSelection, true);
      window.removeEventListener("pointerup", endWordSelection);
      window.removeEventListener("pointercancel", endWordSelection);
    };
  }, []);

  useEffect(() => {
    if (!gainInteractionRef.current) setDraftGain(gain);
  }, [gain]);

  useEffect(() => {
    setAutoCalibrate(gainKeyframes.length > 0);
  }, [gainKeyframes.length, take?.id]);

  useLayoutEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !isRecording) return undefined;
    const repaint = () => paintEnvelope(canvas, visibleEnvelope, visualGain, waveformPreviewGain, autoCalibrate);
    repaint();
    const observer = new MutationObserver(repaint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [autoCalibrate, isRecording, visibleEnvelope, visualGain, waveformPreviewGain]);
  useLayoutEffect(() => {
    const canvas = detailWaveformCanvasRef.current;
    if (!canvas || !detailEnvelope?.points.length) return undefined;
    const repaint = () => paintEnvelope(canvas, detailEnvelope.points, visualGain, waveformPreviewGain, autoCalibrate);
    repaint();
    const observer = new MutationObserver(repaint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [autoCalibrate, detailEnvelope, visualGain, waveformPreviewGain]);

  useLayoutEffect(() => {
    const canvas = timelineCanvasRef.current;
    if (!canvas) return;
    const update = () => {
      const width = canvas.getBoundingClientRect().width;
      timelinePixelWidthRef.current = width;
      setTimelineCanvasWidth((current) => Math.abs(current - width) > 0.5 ? width : current);
      const scroller = timelineScrollRef.current;
      if (scroller) setTimelineViewport((current) => current.width !== scroller.clientWidth ? { left: scroller.scrollLeft, width: scroller.clientWidth } : current);
      paintPlayhead(currentTime);
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [duration, zoom]);

  useLayoutEffect(() => {
    if (isRecording || playheadDragRef.current) return;
    followPlayhead();
  }, [currentTime, duration, zoom, isRecording]);

  useEffect(() => {
    stopPlaybackClock();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setCurrentTime(0);
    setPlaying(false);
    setDecodedDuration(0);
    setMediaDuration(0);
    setDetailEnvelope(null);
    setDetailWaveformState("idle");
    setDetailEnvelope(null);
    setDetailWaveformState("idle");
    setMarkIn(null);
    setMarkOut(null);
    setStagedCut(null);
  }, [take?.id, take?.url]);

  useEffect(() => {
    if (!isRecording) return;
    setPlaying(false);
    setCurrentTime(recordingPreview?.duration ?? 0);
  }, [isRecording, recordingPreview?.duration]);

  useEffect(() => {
    publishPlaybackWord(take?.id, activeWordIndex);
  }, [activeWordIndex, take?.id]);

  useEffect(() => () => publishPlaybackWord(null, -1), []);

  useEffect(() => {
    scheduleGainAutomation();
  }, [autoCalibrate, gain, gainKeyframes, playbackRate]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (!isRecording) return;
    setSignalDb(previewDb);
    setPeakDb((current) => Math.max(previewDb, current - 0.3));
  }, [isRecording, previewDb]);

  function paintPlayhead(time: number) {
    const percent = Math.min(100, Math.max(0, (time / Math.max(duration, 0.001)) * 100));
    const node = playheadRef.current;
    if (!node) return;
    const width = timelinePixelWidthRef.current || node.parentElement?.getBoundingClientRect().width || 0;
    node.style.transform = `translate3d(${(width * percent) / 100}px, 0, 0)`;
  }

  function syncPlaybackClock(audio = audioRef.current, forceState = true) {
    if (!audio) return;
    const nextTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    paintPlayhead(nextTime);
    const now = performance.now();
    if (!forceState && now - lastClockStateUpdateRef.current < CLOCK_STATE_INTERVAL_MS) return;
    lastClockStateUpdateRef.current = now;
    setCurrentTime((current) => Math.abs(current - nextTime) >= 0.004 ? nextTime : current);
  }

  function syncPlaybackDuration(audio: HTMLAudioElement) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) setMediaDuration(audio.duration);
    syncPlaybackClock(audio);
  }

  function stopPlaybackClock() {
    if (playbackClockFrameRef.current !== null) cancelAnimationFrame(playbackClockFrameRef.current);
    playbackClockFrameRef.current = null;
  }

  function startPlaybackClock() {
    stopPlaybackClock();
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;
      syncPlaybackClock(audio, false);
      playbackClockFrameRef.current = requestAnimationFrame(tick);
    };
    playbackClockFrameRef.current = requestAnimationFrame(tick);
  }

  function stopSignalMeter() {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
  }

  function startSignalMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const values = new Float32Array(analyser.fftSize);
    stopSignalMeter();
    const tick = () => {
      analyser.getFloatTimeDomainData(values);
      let peak = 0;
      for (const value of values) peak = Math.max(peak, Math.abs(value));
      const nextDb = peak > 0.0001 ? Math.min(96, Math.max(-96, 20 * Math.log10(peak))) : -96;
      const now = performance.now();
      if (now - lastMeterStateUpdateRef.current >= CLOCK_STATE_INTERVAL_MS) {
        lastMeterStateUpdateRef.current = now;
        setSignalDb(nextDb);
        setPeakDb((current) => Math.max(nextDb, current - 0.85));
      }
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  useEffect(() => () => {
    stopSignalMeter();
    stopPlaybackClock();
    void playbackContextRef.current?.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!take?.url || !detailRequest) {
      setDetailEnvelope(null);
      setDetailWaveformState("idle");
      return undefined;
    }
    const requiredDensity = detailRequest.points / Math.max(0.001, detailRequest.end - detailRequest.start);
    const sourceDensity = detailEnvelope ? 1 / Math.max(0.000001, detailEnvelope.resolution) : 0;
    const targetDensity = Math.min(requiredDensity, sourceDensity || requiredDensity);
    const cachedDensity = detailEnvelope ? detailEnvelope.points.length / Math.max(0.001, detailEnvelope.end - detailEnvelope.start) : 0;
    const cacheCoversViewport = detailEnvelope
      && detailEnvelope.start <= detailRequest.viewportStart
      && detailEnvelope.end >= detailRequest.viewportEnd
      && cachedDensity >= targetDensity * 0.75;
    if (cacheCoversViewport) {
      setDetailWaveformState("ready");
      return undefined;
    }
    const waveformUrl = take.url.replace(/\/audio(?:\?.*)?$/u, "/waveform");
    if (waveformUrl === take.url) {
      setDetailEnvelope(null);
      setDetailWaveformState("error");
      return undefined;
    }
    const controller = new AbortController();
    setDetailWaveformState("loading");
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        start: detailRequest.start.toFixed(6),
        end: detailRequest.end.toFixed(6),
        points: String(detailRequest.points),
      });
      void (async () => {
        try {
          const response = await fetch(`${waveformUrl}?${query.toString()}`, { signal: controller.signal });
          if (!response.ok) throw new Error("Detailed waveform request failed");
          const payload = await response.json() as { start?: number; end?: number; resolution?: number; points?: Array<{ min?: number; max?: number }> };
          const start = Number(payload.start);
          const end = Number(payload.end);
          const resolution = Number(payload.resolution);
          const points = (payload.points ?? []).map((point) => ({
            min: Number.isFinite(point.min) ? Number(point.min) : 0,
            max: Number.isFinite(point.max) ? Number(point.max) : 0,
          }));
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(resolution) || resolution <= 0 || !points.length) throw new Error("Detailed waveform empty");
          setDetailEnvelope({ start, end, resolution, points });
          setDetailWaveformState("ready");
        } catch {
          if (!controller.signal.aborted) {
            setDetailEnvelope(null);
            setDetailWaveformState("error");
          }
        }
      })();
    }, DETAIL_WAVEFORM_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [detailEnvelope, detailRequest, take?.url]);
  function scheduleGainAutomation(audio = audioRef.current) {
    const node = gainNodeRef.current;
    if (!node) return;
    const now = node.context.currentTime;
    const sourceTime = audio?.currentTime ?? 0;
    const playbackSpeed = Math.max(0.01, audio?.playbackRate ?? playbackRate);
    const keyframes = autoCalibrate ? gainKeyframes : [];
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(dbToLinear(gainAtTime(keyframes, sourceTime, gain)), now);
    for (const frame of keyframes) {
      if (frame.time <= sourceTime + 0.0005) continue;
      const when = now + (frame.time - sourceTime) / playbackSpeed;
      node.gain.linearRampToValueAtTime(dbToLinear(frame.gainDb), when);
    }
  }

  async function preparePlayback(audio: HTMLAudioElement) {
    let context = playbackContextRef.current;
    if (!context) {
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const gainNode = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(gainNode).connect(analyser).connect(context.destination);
      playbackContextRef.current = context;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;
      scheduleGainAutomation(audio);
    }
    if (context.state === "suspended") await context.resume();
  }
  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !take?.url || isRecording) return;
    if (audio.paused) {
      try {
        await preparePlayback(audio);
      } catch {
        // Native playback remains available if Web Audio is unavailable.
      }
      audio.playbackRate = playbackRate;
      await audio.play();
    } else audio.pause();
  }

  function clampGain(value: number) {
    return Math.max(-96, Math.min(96, Number.isFinite(value) ? value : 0));
  }

  function buildVisibleAutoCalibration(baseGain: number) {
    return buildAutoCalibrationKeyframes(visibleEnvelope, gainWindowDuration, baseGain)
      .map((frame) => ({ ...frame, time: gainWindowStart + frame.time }));
  }

  function beginGainPreview() {
    gainInteractionRef.current = true;
    setIsGainPreviewing(true);
  }

  function previewGain(value: number) {
    if (!gainInteractionRef.current) beginGainPreview();
    setDraftGain(clampGain(value));
  }

  function commitGain(value = draftGain) {
    const nextGain = clampGain(value);
    gainInteractionRef.current = false;
    setDraftGain(nextGain);
    setIsGainPreviewing(false);
    if (nextGain !== gain) onGainChange(nextGain);
    if (autoCalibrate && visibleEnvelope.length) onGainKeyframesChange?.(buildVisibleAutoCalibration(nextGain));
  }

  function toggleAutoCalibration() {
    if (autoCalibrate) {
      setAutoCalibrate(false);
      onGainKeyframesChange?.([]);
      return;
    }
    const frames = buildVisibleAutoCalibration(gain);
    setAutoCalibrate(true);
    onGainKeyframesChange?.(frames);
  }

  function markTimelinePoint(kind: "in" | "out") {
    if (isRecording || !take?.url) return;
    if (kind === "in") setMarkIn(currentTime);
    else setMarkOut(currentTime);
    setStagedCut(null);
  }

  function cutMarkedRange() {
    if (markIn === null || markOut === null || Math.abs(markOut - markIn) < 0.05) return;
    const start = Math.min(markIn, markOut);
    const end = Math.max(markIn, markOut);
    setStagedCut({ id: `cut-preview-${start}-${end}`, start, end });
  }

  function uncut() {
    if (stagedCut) {
      setStagedCut(null);
      return;
    }
    if (removedRanges.length) onRemovedRangesChange?.(removedRanges.slice(0, -1));
  }

  function deleteStagedCut() {
    if (!stagedCut) return;
    const next = [...removedRanges, { ...stagedCut, id: `cut-${crypto.randomUUID().slice(0, 12)}` }]
      .sort((left, right) => left.start - right.start);
    onRemovedRangesChange?.(next);
    setStagedCut(null);
    setMarkIn(null);
    setMarkOut(null);
  }

  function resetTimelineEdits() {
    setStagedCut(null);
    setMarkIn(null);
    setMarkOut(null);
    onRemovedRangesChange?.([]);
  }

  function updateTimelineViewport(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    setTimelineViewport((current) => current.left === target.scrollLeft && current.width === target.clientWidth ? current : { left: target.scrollLeft, width: target.clientWidth });
  }

  function seekTimelineNavigator(clientX: number) {
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    const track = scroller.parentElement?.querySelector<HTMLElement>(".timeline-navigator");
    if (!track || scroller.scrollWidth <= scroller.clientWidth) return;
    const bounds = track.getBoundingClientRect();
    const visibleRatio = scroller.clientWidth / scroller.scrollWidth;
    const pointerRatio = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(bounds.width, 1)));
    const travel = Math.max(0.0001, 1 - visibleRatio);
    const targetRatio = Math.max(0, Math.min(1, (pointerRatio - visibleRatio / 2) / travel));
    scroller.scrollLeft = targetRatio * (scroller.scrollWidth - scroller.clientWidth);
    setTimelineViewport({ left: scroller.scrollLeft, width: scroller.clientWidth });
  }

  function beginTimelineNavigator(event: PointerEvent<HTMLDivElement>) {
    if (!timelineNavigator.enabled) return;
    event.preventDefault();
    timelineNavigatorDraggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekTimelineNavigator(event.clientX);
  }

  function moveTimelineNavigator(event: PointerEvent<HTMLDivElement>) {
    if (!timelineNavigatorDraggingRef.current) return;
    event.preventDefault();
    seekTimelineNavigator(event.clientX);
  }

  function endTimelineNavigator(event: PointerEvent<HTMLDivElement>) {
    if (!timelineNavigatorDraggingRef.current) return;
    event.preventDefault();
    seekTimelineNavigator(event.clientX);
    timelineNavigatorDraggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
  function baseTimelinePixelsPerSecond() {
    return timelinePixelWidthRef.current / Math.max(duration * zoom, 0.001);
  }
  function maxTimelineZoom() {
    return Math.max(1, MAX_TIMELINE_PIXELS_PER_SECOND / Math.max(baseTimelinePixelsPerSecond(), 0.001));
  }
  function zoomResolutionLabel() {
    const secondsPerTenPixels = 10 / Math.max(0.001, baseTimelinePixelsPerSecond() * zoom);
    return (secondsPerTenPixels >= 1 ? secondsPerTenPixels.toFixed(1) : secondsPerTenPixels.toFixed(2)) + "s / 10px";
  }
  function zoomSliderValue() {
    const maximum = maxTimelineZoom();
    if (maximum <= 1) return 0;
    const ratio = Math.log(Math.max(1, Math.min(maximum, zoom))) / Math.log(maximum);
    return Math.round(Math.max(0, Math.min(1, ratio)) * 1000);
  }
  function setZoomFromSlider(value: number) {
    const maximum = maxTimelineZoom();
    if (maximum <= 1) {
      setZoom(1);
      return;
    }
    setZoom(Math.max(1, Math.min(maximum, maximum ** (Math.max(0, Math.min(1000, value)) / 1000))));
  }

  function wordIndexRange(first: number, last: number) {
    const start = Math.min(first, last);
    const end = Math.max(first, last);
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  }

  function beginWordSelection(event: PointerEvent<HTMLElement>, index: number) {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    event.stopPropagation();
    wordSelectionDraggingRef.current = true;
    const anchor = wordSelectionAnchorRef.current;
    if (event.shiftKey && anchor !== null) {
      setSelectedWordIndexes(new Set(wordIndexRange(anchor, index)));
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedWordIndexes((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      wordSelectionAnchorRef.current = index;
      return;
    }
    wordSelectionAnchorRef.current = index;
    setSelectedWordIndexes(new Set([index]));
  }

  function extendWordSelection(index: number) {
    const anchor = wordSelectionAnchorRef.current;
    if (!wordSelectionDraggingRef.current || anchor === null) return;
    setSelectedWordIndexes(new Set(wordIndexRange(anchor, index)));
  }

  function wordIndexAtTimelinePoint(clientX: number, clientY: number) {
    const track = wordTrackRef.current;
    const canvas = timelineCanvasRef.current;
    if (!track || !canvas || !displayWords.length) return -1;
    const trackRect = track.getBoundingClientRect();
    if (clientX < trackRect.left || clientX > trackRect.right || clientY < trackRect.top || clientY > trackRect.bottom) return -1;
    const canvasRect = canvas.getBoundingClientRect();
    const time = Math.min(duration, Math.max(0, ((clientX - canvasRect.left) / Math.max(canvasRect.width, 1)) * duration));
    const current = activeWordAt(displayWords, time);
    if (current >= 0) return current;
    let low = 0;
    let high = displayWords.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (displayWords[middle].start < time) low = middle + 1;
      else high = middle;
    }
    const after = Math.min(displayWords.length - 1, low);
    const before = Math.max(0, after - 1);
    const distance = (word: StudioWord) => time < word.start ? word.start - time : Math.max(0, time - word.end);
    return distance(displayWords[before]) <= distance(displayWords[after]) ? before : after;
  }

  function extendWordSelectionAtPoint(clientX: number, clientY: number) {
    if (!wordSelectionDraggingRef.current) return;
    const index = wordIndexAtTimelinePoint(clientX, clientY);
    if (index >= 0) extendWordSelection(index);
  }

  function openSpeakerMenu(index: number, x: number, y: number) {
    const indexes = selectedWordIndexes.has(index) ? [...selectedWordIndexes] : [index];
    if (!selectedWordIndexes.has(index)) {
      wordSelectionAnchorRef.current = index;
      setSelectedWordIndexes(new Set(indexes));
    }
    setSpeakerMenu({ indexes: indexes.sort((left, right) => left - right), x, y });
  }

  function assignSpeakerToSelectedWords(profileId: string | null) {
    if (!speakerMenu?.indexes.length) return;
    const indexes = new Set(speakerMenu.indexes);
    onWordsChange?.(words.map((word, index) => indexes.has(index) ? { ...word, speakerId: profileId ?? undefined } : word));
    setSpeakerMenu(null);
  }

  function followPlayhead() {
    const scroller = timelineScrollRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const playheadX = (currentTime / Math.max(duration, 0.001)) * scroller.scrollWidth;
    const visibleRatio = (playheadX - scroller.scrollLeft) / Math.max(scroller.clientWidth, 1);
    if (visibleRatio >= 0.1 && visibleRatio <= 0.9) return;
    const nextLeft = Math.max(0, Math.min(scroller.scrollWidth - scroller.clientWidth, playheadX - scroller.clientWidth * 0.1));
    scroller.scrollLeft = nextLeft;
  }

  function seekToClientX(clientX: number) {
    const canvas = timelineCanvasRef.current;
    if (isRecording || !take?.url || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nextTime = Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
      syncPlaybackClock(audioRef.current);
    }
  }

  function seek(event: PointerEvent<HTMLDivElement>) {
    seekToClientX(event.clientX);
  }

  function seekTransportToClientX(clientX: number) {
    const transport = transportProgressRef.current;
    if (isRecording || !take?.url || !transport) return;
    const rect = transport.getBoundingClientRect();
    const nextTime = Math.min(duration, Math.max(0, ((clientX - rect.left) / Math.max(rect.width, 1)) * duration));
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
      syncPlaybackClock(audioRef.current);
    }
  }

  function beginTransportScrub(event: PointerEvent<HTMLDivElement>) {
    if (isRecording || !take?.url) return;
    event.preventDefault();
    transportScrubRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekTransportToClientX(event.clientX);
  }

  function dragTransportScrub(event: PointerEvent<HTMLDivElement>) {
    if (!transportScrubRef.current) return;
    event.preventDefault();
    seekTransportToClientX(event.clientX);
  }

  function endTransportScrub(event: PointerEvent<HTMLDivElement>) {
    if (!transportScrubRef.current) return;
    event.preventDefault();
    seekTransportToClientX(event.clientX);
    transportScrubRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function beginPlayheadDrag(event: PointerEvent<HTMLDivElement>) {
    if (isRecording || !take?.url) return;
    event.preventDefault();
    event.stopPropagation();
    playheadDragRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekToClientX(event.clientX);
  }

  function dragPlayhead(event: PointerEvent<HTMLDivElement>) {
    if (!playheadDragRef.current) return;
    event.preventDefault();
    seekToClientX(event.clientX);
  }

  function endPlayheadDrag(event: PointerEvent<HTMLDivElement>) {
    if (!playheadDragRef.current) return;
    event.preventDefault();
    seekToClientX(event.clientX);
    playheadDragRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    requestAnimationFrame(followPlayhead);
  }

  function beginScrub(event: PointerEvent<HTMLDivElement>) {
    if (isRecording || !take?.url) return;
    event.preventDefault();
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seek(event);
  }

  function scrubTimeline(event: PointerEvent<HTMLDivElement>) {
    if (!scrubbingRef.current) return;
    event.preventDefault();
    seek(event);
  }

  function endScrub(event: PointerEvent<HTMLDivElement>) {
    if (!scrubbingRef.current) return;
    seek(event);
    scrubbingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <ModuleFrame
      eyebrow={isRecording ? "REC LIVE · WAVEFORM" : take?.name ?? "CHƯA CÓ AUDIO"}
      title="Timeline"
      index="A1"
      tone="dark"
      className="timeline-module"
      action={
        <div className="timeline-header-actions">
          <div className="timeline-edit-actions" role="group" aria-label="Timeline edit actions">
            <button disabled={isRecording || !take?.url} onClick={() => markTimelinePoint("in")} type="button">MARK IN</button>
            <button disabled={isRecording || !take?.url} onClick={() => markTimelinePoint("out")} type="button">MARK OUT</button>
            <button disabled={markIn === null || markOut === null || isRecording} onClick={cutMarkedRange} type="button">CUT</button>
            <button disabled={(!stagedCut && !removedRanges.length) || isRecording} onClick={uncut} type="button">UNCUT</button>
            <button className="is-delete" disabled={!stagedCut || isRecording} onClick={deleteStagedCut} type="button">DELETE</button>
            <button disabled={!removedRanges.length && !stagedCut && markIn === null && markOut === null} onClick={resetTimelineEdits} type="button">RESET</button>
          </div>
          <button aria-pressed={autoCalibrate} className={`timeline-auto-calibrate ${autoCalibrate ? "is-active" : ""}`} disabled={isRecording || !visibleEnvelope.length} onClick={toggleAutoCalibration} type="button">AUTO CAL</button>
          <div className="timeline-zoom">
            <button aria-label="Thu nhỏ timeline" onClick={() => setZoom((current) => Math.max(1, current / 2))} type="button">−</button>
            <input
              aria-label="Zoom timeline"
              aria-valuetext={zoomResolutionLabel()}
              disabled={maxTimelineZoom() <= 1}
              max="1000"
              min="0"
              onChange={(event) => setZoomFromSlider(Number(event.currentTarget.value))}
              step="1"
              type="range"
              value={zoomSliderValue()}
            />
            <span title="Mật độ hiển thị timeline">{zoomResolutionLabel()}</span>
            <button aria-label="Phóng to timeline" onClick={() => setZoom((current) => Math.min(maxTimelineZoom(), current * 2))} type="button">+</button>
          </div>
        </div>
      }
    >
      <div className="timeline-stage">
        <div className="timeline-controls">
          <label className="timeline-gain">
            <span>GAIN</span>
            <input
              aria-label="Nhập gain dB"
              className="timeline-gain__number"
              max="96"
              min="-96"
              onBlur={(event) => commitGain(Number(event.currentTarget.value))}
              onChange={(event) => previewGain(Number(event.currentTarget.value))}
              onFocus={beginGainPreview}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  gainInteractionRef.current = false;
                  setDraftGain(gain);
                  setIsGainPreviewing(false);
                  event.currentTarget.blur();
                }
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              step="0.5"
              type="number"
              value={draftGain}
            />
            <input
              aria-label="Source gain"
              max="96"
              min="-96"
              onBlur={(event) => commitGain(Number(event.currentTarget.value))}
              onChange={(event) => previewGain(Number(event.currentTarget.value))}
              onKeyDown={beginGainPreview}
              onKeyUp={(event) => commitGain(Number(event.currentTarget.value))}
              onPointerCancel={(event) => commitGain(Number(event.currentTarget.value))}
              onPointerDown={beginGainPreview}
              onPointerUp={(event) => commitGain(Number(event.currentTarget.value))}
              step="0.5"
              type="range"
              value={draftGain}
            />
          </label>
          <div aria-label={`Sound level ${activeSignalDb.toFixed(1)} dB, peak ${activePeakDb.toFixed(1)} dB`} className="timeline-signal">
            <span>LEVEL</span>
            <div className="timeline-signal__meter"><i style={{ height: `${meterPercent}%` }} /><b style={{ bottom: `${peakPercent}%` }} /></div>
            <output>{activeSignalDb.toFixed(0)}</output>
            <small>PK {activePeakDb.toFixed(0)}</small>
          </div>
        </div>
        <div className="timeline-scroll-shell">
          <div className="timeline-scroll" onScroll={updateTimelineViewport} ref={timelineScrollRef}>
          <div className="timeline-canvas" ref={timelineCanvasRef} style={{ "--zoom": zoom } as CSSProperties}>
            <div className="timeline-ruler">
              {Array.from({ length: 9 }, (_, index) => {
                const seconds = (duration * index) / 8;
                return <span key={index} style={{ left: `${index * 12.5}%` }}>{seconds.toFixed(duration < 8 ? 1 : 0)}s</span>;
              })}
            </div>
            <div
              className="waveform"
              aria-label="Waveform timeline"
              onPointerCancel={endScrub}
              onPointerDown={beginScrub}
              onPointerMove={scrubTimeline}
              onPointerUp={endScrub}
            >
              {isRecording && visibleEnvelope.length ? <canvas aria-label="Natural audio waveform" className="waveform-shape" ref={waveformCanvasRef} /> : null}
              {detailEnvelope?.points.length ? <canvas aria-label="PCM waveform at zoom" className="waveform-shape waveform-shape--detail" ref={detailWaveformCanvasRef} style={{ left: `${(detailEnvelope.start / duration) * 100}%`, width: `${((detailEnvelope.end - detailEnvelope.start) / duration) * 100}%` }} /> : null}
              {take && !isRecording && detailWaveformState === "loading" ? <div className="timeline-waveform-status">Đang đọc PCM waveform theo vùng nhìn…</div> : null}
              {detailWaveformState === "loading" && detailEnvelope?.points.length ? <span className="timeline-waveform-detail-status">PCM PEAK · đang cập nhật vùng nhìn</span> : null}
              {take && !isRecording && detailWaveformState === "error" ? <div className="timeline-waveform-status is-error">Không tải được PCM waveform của footage này.</div> : null}
              {gainOverflows.map((range, index) => { const start = gainWindowStart + (range.start / Math.max(visibleEnvelope.length, 1)) * gainWindowDuration; const end = gainWindowStart + (range.end / Math.max(visibleEnvelope.length, 1)) * gainWindowDuration; return <i aria-label={autoCalibrate ? "Vùng đã auto calibrate" : "Vùng gain bị clipping"} className={`timeline-gain-range ${autoCalibrate ? "is-calibrated" : ""}`} key={`${range.start}-${range.end}-${index}`} style={{ left: `${(start / duration) * 100}%`, width: `${Math.max(0.08, ((end - start) / Math.max(duration, 0.001)) * 100)}%` }} />; })}
              {autoCalibrate ? gainKeyframes.map((frame) => <i aria-label={`Gain keyframe ${frame.gainDb.toFixed(1)} dB tại ${frame.time.toFixed(2)} giây`} className="timeline-gain-keyframe" key={frame.id} style={{ left: `${(frame.time / Math.max(duration, 0.001)) * 100}%` }} />) : null}
              {removedRanges.map((range) => <i aria-label={`Đoạn đã loại ${range.start.toFixed(2)} đến ${range.end.toFixed(2)} giây`} className="timeline-removed-range" key={range.id} style={{ left: `${(range.start / duration) * 100}%`, width: `${((range.end - range.start) / duration) * 100}%` }} />)}
              {stagedCut ? <i aria-label="Đoạn đã cắt, sẵn sàng xóa" className="timeline-removed-range is-staged" style={{ left: `${(stagedCut.start / duration) * 100}%`, width: `${((stagedCut.end - stagedCut.start) / duration) * 100}%` }} /> : null}
              {markIn !== null ? <i className="timeline-mark timeline-mark--in" style={{ left: `${(markIn / duration) * 100}%` }}>IN</i> : null}
              {markOut !== null ? <i className="timeline-mark timeline-mark--out" style={{ left: `${(markOut / duration) * 100}%` }}>OUT</i> : null}
              {!take && !isRecording ? <div className="timeline-empty"><Icon name="waveform" /><b>Import, thu âm hoặc chọn một Take</b><span>Audio lineage sẽ bắt đầu tại đây</span></div> : null}
            </div>
            <div className="word-track" onContextMenu={(event) => { const index = wordIndexAtTimelinePoint(event.clientX, event.clientY); if (index < 0) return; event.preventDefault(); event.stopPropagation(); openSpeakerMenu(index, event.clientX, event.clientY); }} onPointerDown={(event) => { const index = wordIndexAtTimelinePoint(event.clientX, event.clientY); if (index >= 0) beginWordSelection(event, index); }} onPointerMove={(event) => extendWordSelectionAtPoint(event.clientX, event.clientY)} onPointerUp={() => { wordSelectionDraggingRef.current = false; }} ref={wordTrackRef}>
              {displayWords.length && !isRecording && !timingNeedsAlignment ? wordTrackIndexes.map((index) => { const word = displayWords[index];
                const start = Math.min(duration, Math.max(0, word.start));
                const end = Math.min(duration, Math.max(start, word.end));
                return (
                  <button
                    aria-label={`Subtitle word ${word.text}`}
                    aria-pressed={selectedWordIndexes.has(index)}
                    className={`timeline-word ${index === activeWordIndex ? "is-active" : currentTime >= end ? "is-past" : ""} ${selectedWordIndexes.has(index) ? "is-selected" : ""}`}
                    data-timeline-word-index={index}
                    key={`${word.text}-${index}`}
                    style={{ left: `${(start / duration) * 100}%`, width: `${Math.max(0, ((end - start) / Math.max(duration, 0.001)) * 100)}%`, color: speakerById.get(word.speakerId ?? "")?.color }}
                    title="Kéo quét nhiều từ, sau đó chuột phải để gán Speaker Profile"
                    type="button"
                  >
                    {word.text}
                  </button>
                );
              }) : <em className={timingNeedsAlignment ? "is-warning" : ""}>{isRecording ? "REC LIVE · waveform đang cập nhật" : timingNeedsAlignment ? take?.wordTimingNote ?? "WORD TIMING · cần căn chỉnh trước khi sync subtitle" : "WORD SYNC · subtitle sẽ khớp theo timestamp"}</em>}
            </div>
            <div aria-label="Playhead indicator" className={`timeline-playhead ${isRecording ? "is-recording" : ""}`} ref={playheadRef} onPointerCancel={endPlayheadDrag} onPointerDown={beginPlayheadDrag} onPointerMove={dragPlayhead} onPointerUp={endPlayheadDrag}  />
          </div>
          </div>
          <div aria-label="Thanh cuộn timeline" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(timelineNavigator.left)} className={`timeline-navigator ${timelineNavigator.enabled ? "" : "is-static"}`} onPointerCancel={endTimelineNavigator} onPointerDown={beginTimelineNavigator} onPointerMove={moveTimelineNavigator} onPointerUp={endTimelineNavigator} role="scrollbar" tabIndex={0}>
            <i style={{ left: `${timelineNavigator.left}%`, width: `${timelineNavigator.width}%` }} />
          </div>
        </div>
      </div>
      {speakerMenu ? <div className="timeline-speaker-menu" role="menu" style={{ left: speakerMenu.x, top: speakerMenu.y }}><strong>ĐỔI SPEAKER · {speakerMenu.indexes.length} TỪ</strong><button onClick={() => assignSpeakerToSelectedWords(null)} role="menuitem" type="button">Chưa gán Profile</button>{speakers.map((speaker) => <button key={speaker.id} onClick={() => assignSpeakerToSelectedWords(speaker.id)} role="menuitem" style={{ borderLeftColor: speaker.color }} type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>)}</div> : null}      <div className="transport-bar">
        <button aria-label={playing ? "Tạm dừng" : "Phát"} className="transport-button" disabled={!take?.url || isRecording} onClick={togglePlay} type="button">
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <code>{timecode(currentTime)}</code>
        <div
          aria-label="Thanh tiến trình Timeline — bấm hoặc kéo để tua"
          className="transport-progress"
          onPointerCancel={endTransportScrub}
          onPointerDown={beginTransportScrub}
          onPointerMove={dragTransportScrub}
          onPointerUp={endTransportScrub}
          ref={transportProgressRef}
        >
          <i style={{ width: `${playheadPercent}%` }} />
          <b aria-hidden="true" style={{ left: `${playheadPercent}%` }} />
        </div>
        <code>{timecode(duration)}</code>
        <label className="transport-rate">
          <span>RATE</span>
          <select aria-label="Tốc độ phát" onChange={(event) => setPlaybackRate(Number(event.target.value))} value={playbackRate}>
            {PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
          </select>
        </label>
        <span className={`gain-badge ${isGainPreviewing ? "is-preview" : ""}`}>{isGainPreviewing ? "PREVIEW 3/12 · " : ""}{draftGain > 0 ? "+" : ""}{draftGain.toFixed(1)} dB</span>
        {gainOverflows.length ? <span className={`gain-warning ${autoCalibrate ? "is-calibrated" : ""}`}>{autoCalibrate ? "AUTO CAL" : "CLIP"} · {gainOverflows.length} vùng</span> : null}
      </div>
      {take?.url ? (
        <audio
          onEnded={(event) => { syncPlaybackClock(event.currentTarget); setPlaying(false); stopSignalMeter(); stopPlaybackClock(); }}
          onLoadedMetadata={(event) => {
            syncPlaybackDuration(event.currentTarget);
          }}
          onDurationChange={(event) => syncPlaybackDuration(event.currentTarget)}
          onPause={() => { setPlaying(false); stopSignalMeter(); stopPlaybackClock(); }}
          onPlay={() => { setPlaying(true); syncPlaybackClock(); startSignalMeter(); startPlaybackClock(); }}
          onSeeking={(event) => { scheduleGainAutomation(event.currentTarget); syncPlaybackClock(event.currentTarget); }}
          onSeeked={(event) => { scheduleGainAutomation(event.currentTarget); syncPlaybackClock(event.currentTarget); }}
          onTimeUpdate={(event) => syncPlaybackClock(event.currentTarget)}
          preload="metadata"
          ref={audioRef}
          src={take.url}
        />
      ) : null}
    </ModuleFrame>
  );
}
