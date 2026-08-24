import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { publishPlaybackWord } from "../../domain/playback-sync";
import { buildAutoCalibrationKeyframes, dbToLinear, gainAtTime } from "./gain-automation";
import type { RecordingWaveformPreview, StudioWord, TimelineEditRange, TimelineGainKeyframe } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

export interface ActiveTake {
  id?: string;
  name: string;
  url?: string;
  duration: number;
  text?: string;
  words?: StudioWord[];
}

interface EnvelopePoint {
  min: number;
  max: number;
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

}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];
const PATH_WIDTH = 12000;
const PATH_HEIGHT = 100;
const GAIN_PREVIEW_DIVISIONS = 12;
const GAIN_PREVIEW_PARTS = [1, 5, 9];
const AUTO_CALIBRATE_CEILING = 10 ** (-1 / 20);
const MAX_GAIN_RANGES = 96;
const CLOCK_STATE_INTERVAL_MS = 80;

interface WaveformRange {
  start: number;
  end: number;
}

function timecode(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function waveformPath(
  points: EnvelopePoint[],
  gain: number,
  ranges: WaveformRange[] = [{ start: 0, end: points.length }],
  autoCalibrate = false,
) {
  if (!points.length) return "";
  const center = PATH_HEIGHT / 2;
  const amplitude = PATH_HEIGHT * 0.46;
  const coordinate = (point: EnvelopePoint, index: number, edge: "min" | "max") => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * PATH_WIDTH;
    const peak = Math.max(Math.abs(point.min * gain), Math.abs(point.max * gain));
    const calibration = autoCalibrate && peak > AUTO_CALIBRATE_CEILING
      ? AUTO_CALIBRATE_CEILING / peak
      : 1;
    const value = Math.max(-1, Math.min(1, point[edge] * gain * calibration));
    return `${x.toFixed(2)},${(center - value * amplitude).toFixed(2)}`;
  };
  return ranges
    .filter((range) => range.end - range.start > 0)
    .map((range) => {
      const start = Math.max(0, Math.floor(range.start));
      const end = Math.min(points.length, Math.ceil(range.end));
      const top = Array.from({ length: end - start }, (_, offset) => {
        const index = start + offset;
        return coordinate(points[index], index, "max");
      });
      const bottom = Array.from({ length: end - start }, (_, reverseIndex) => {
        const index = end - reverseIndex - 1;
        return coordinate(points[index], index, "min");
      });
      return `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
    })
    .join(" ");
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

function activeWordAt(words: StudioWord[], time: number) {
  if (!words.length || time < words[0].start - 0.08) return -1;
  let low = 0;
  let high = words.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (words[middle].start <= time) { candidate = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (candidate < 0) return -1;
  const nextStart = words[candidate + 1]?.start;
  const holdUntil = nextStart ?? words[candidate].end + 0.14;
  return time <= Math.max(words[candidate].end, holdUntil) ? candidate : -1;
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
}: TimelineProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [envelope, setEnvelope] = useState<EnvelopePoint[]>([]);
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineCanvasRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timelinePixelWidthRef = useRef(0);
  const playheadDragRef = useRef(false);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const lastMeterStateUpdateRef = useRef(0);
  const playbackClockFrameRef = useRef<number | null>(null);
  const lastClockStateUpdateRef = useRef(0);
  const scrubbingRef = useRef(false);
  const gainInteractionRef = useRef(false);
  const isRecording = Boolean(recordingPreview?.active);
  const words = take?.words ?? [];
  const lastWordEnd = words.length ? Math.max(...words.map((word) => word.end)) : 0;
  const sourceDuration = isRecording
    ? Math.max(0.1, recordingPreview?.duration ?? 0)
    : mediaDuration || decodedDuration || take?.duration || lastWordEnd;
  const duration = sourceDuration || 10;
  const visualGain = 10 ** (gain / 20);
  const draftVisualGain = 10 ** (draftGain / 20);
  const visibleEnvelope = isRecording ? liveEnvelope(recordingPreview?.samples ?? []) : envelope;
  const path = useMemo(
    () => waveformPath(visibleEnvelope, visualGain, undefined, autoCalibrate),
    [autoCalibrate, visibleEnvelope, visualGain],
  );
  const previewPath = useMemo(() => {
    if (isRecording || !isGainPreviewing) return "";
    return waveformPath(envelope, draftVisualGain, gainPreviewRanges(envelope.length), autoCalibrate);
  }, [autoCalibrate, draftVisualGain, envelope, isGainPreviewing, isRecording]);
  const gainOverflows = useMemo(
    () => isRecording ? [] : overflowRanges(envelope, visualGain),
    [envelope, isRecording, visualGain],
  );
  const latestPreview = visibleEnvelope[visibleEnvelope.length - 1];
  const latestPreviewPeak = latestPreview ? Math.max(Math.abs(latestPreview.min), Math.abs(latestPreview.max)) : 0;
  const previewDb = latestPreviewPeak > 0.0001 ? Math.min(96, Math.max(-96, 20 * Math.log10(latestPreviewPeak) + gain)) : -96;
  const activeSignalDb = isRecording ? previewDb : signalDb;
  const activePeakDb = isRecording ? Math.max(peakDb, previewDb) : peakDb;
  const meterPercent = Math.min(100, Math.max(0, ((activeSignalDb + 96) / 192) * 100));
  const peakPercent = Math.min(100, Math.max(0, ((activePeakDb + 96) / 192) * 100));
  const activeWordIndex = isRecording ? -1 : activeWordAt(words, currentTime);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  useEffect(() => {
    if (!gainInteractionRef.current) setDraftGain(gain);
  }, [gain]);

  useEffect(() => {
    setAutoCalibrate(gainKeyframes.length > 0);
  }, [gainKeyframes.length, take?.id]);

  useLayoutEffect(() => {
    const canvas = timelineCanvasRef.current;
    if (!canvas) return;
    const update = () => {
      timelinePixelWidthRef.current = canvas.getBoundingClientRect().width;
      paintPlayhead(currentTime);
    };
    update();
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
    if (!take?.url) {
      setEnvelope([]);
      setDecodedDuration(0);
      return;
    }
    const controller = new AbortController();
    let context: AudioContext | null = null;
    void (async () => {
      try {
        const response = await fetch(take.url!, { signal: controller.signal });
        if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        context = new AudioContext();
        const buffer = await context.decodeAudioData(bytes.slice(0));
        const pointCount = Math.min(7200, Math.max(1800, Math.ceil(buffer.duration * 72)));
        const samplesPerPoint = Math.max(1, Math.floor(buffer.length / pointCount));
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
        const nextEnvelope = Array.from({ length: pointCount }, (_, pointIndex) => {
          const start = pointIndex * samplesPerPoint;
          const end = Math.min(buffer.length, start + samplesPerPoint);
          let min = 0;
          let max = 0;
          for (let sample = start; sample < end; sample += 1) {
            for (const channel of channels) {
              const value = channel[sample] ?? 0;
              min = Math.min(min, value);
              max = Math.max(max, value);
            }
          }
          return { min, max };
        });
        setEnvelope(nextEnvelope);
        setDecodedDuration(buffer.duration);
      } catch {
        if (!controller.signal.aborted) {
          setEnvelope([]);
          setDecodedDuration(0);
        }
      } finally {
        await context?.close().catch(() => undefined);
      }
    })();
    return () => controller.abort();
  }, [take?.url]);

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
    if (autoCalibrate && envelope.length) onGainKeyframesChange?.(buildAutoCalibrationKeyframes(envelope, duration, nextGain));
  }

  function toggleAutoCalibration() {
    if (autoCalibrate) {
      setAutoCalibrate(false);
      onGainKeyframesChange?.([]);
      return;
    }
    const frames = buildAutoCalibrationKeyframes(envelope, duration, gain);
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
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seek(event);
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
          <button aria-pressed={autoCalibrate} className={`timeline-auto-calibrate ${autoCalibrate ? "is-active" : ""}`} disabled={isRecording || !envelope.length} onClick={toggleAutoCalibration} type="button">AUTO CAL</button>
          <div className="timeline-zoom">
            <button aria-label="Thu nhỏ timeline" onClick={() => setZoom(Math.max(1, zoom - 0.5))} type="button">−</button>
            <span>{zoom.toFixed(1)}×</span>
            <button aria-label="Phóng to timeline" onClick={() => setZoom(Math.min(16, zoom + 0.5))} type="button">+</button>
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
        <div className="timeline-scroll" ref={timelineScrollRef}>
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
              onPointerDown={beginScrub}
              onPointerMove={(event) => { if (scrubbingRef.current) seek(event); }}
              onPointerUp={() => { scrubbingRef.current = false; }}
            >
              {path ? (
                <svg aria-label="Natural audio waveform" className="waveform-shape" preserveAspectRatio="none" viewBox={`0 0 ${PATH_WIDTH} ${PATH_HEIGHT}`}>
                  <path d={path} />
                  {previewPath ? <path className="waveform-shape__gain-preview" d={previewPath} /> : null}
                </svg>
              ) : null}
              {gainOverflows.map((range, index) => <i aria-label={autoCalibrate ? "Vùng đã auto calibrate" : "Vùng gain bị clipping"} className={`timeline-gain-range ${autoCalibrate ? "is-calibrated" : ""}`} key={`${range.start}-${range.end}-${index}`} style={{ left: `${(range.start / Math.max(envelope.length, 1)) * 100}%`, width: `${Math.max(0.08, ((range.end - range.start) / Math.max(envelope.length, 1)) * 100)}%` }} />)}
              {autoCalibrate ? gainKeyframes.map((frame) => <i aria-label={`Gain keyframe ${frame.gainDb.toFixed(1)} dB tại ${frame.time.toFixed(2)} giây`} className="timeline-gain-keyframe" key={frame.id} style={{ left: `${(frame.time / Math.max(duration, 0.001)) * 100}%` }} />) : null}
              {removedRanges.map((range) => <i aria-label={`Đoạn đã loại ${range.start.toFixed(2)} đến ${range.end.toFixed(2)} giây`} className="timeline-removed-range" key={range.id} style={{ left: `${(range.start / duration) * 100}%`, width: `${((range.end - range.start) / duration) * 100}%` }} />)}
              {stagedCut ? <i aria-label="Đoạn đã cắt, sẵn sàng xóa" className="timeline-removed-range is-staged" style={{ left: `${(stagedCut.start / duration) * 100}%`, width: `${((stagedCut.end - stagedCut.start) / duration) * 100}%` }} /> : null}
              {markIn !== null ? <i className="timeline-mark timeline-mark--in" style={{ left: `${(markIn / duration) * 100}%` }}>IN</i> : null}
              {markOut !== null ? <i className="timeline-mark timeline-mark--out" style={{ left: `${(markOut / duration) * 100}%` }}>OUT</i> : null}
              {!take && !isRecording ? <div className="timeline-empty"><Icon name="waveform" /><b>Import, thu âm hoặc chọn một Take</b><span>Audio lineage sẽ bắt đầu tại đây</span></div> : null}
            </div>
            <div className="word-track">
              {words.length && !isRecording ? words.map((word, index) => {
                const start = Math.min(duration, Math.max(0, word.start));
                const end = Math.min(duration, Math.max(start, word.end));
                return (
                  <span
                    className={index === activeWordIndex ? "is-active" : currentTime >= end ? "is-past" : ""}
                    key={`${word.text}-${index}`}
                    style={{ left: `${(start / duration) * 100}%`, width: `${Math.max(0.04, ((end - start) / duration) * 100)}%` }}
                  >
                    {word.text}
                  </span>
                );
              }) : <em>{isRecording ? "REC LIVE · waveform đang cập nhật" : "WORD SYNC · subtitle sẽ khớp theo timestamp"}</em>}
            </div>
            <div aria-label="Playhead indicator" className={`timeline-playhead ${isRecording ? "is-recording" : ""}`} ref={playheadRef} onPointerCancel={endPlayheadDrag} onPointerDown={beginPlayheadDrag} onPointerMove={dragPlayhead} onPointerUp={endPlayheadDrag}  />
          </div>
        </div>
      </div>
      <div className="transport-bar">
        <button aria-label={playing ? "Tạm dừng" : "Phát"} className="transport-button" disabled={!take?.url || isRecording} onClick={togglePlay} type="button">
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <code>{timecode(currentTime)}</code>
        <div className="transport-progress"><i style={{ width: `${playheadPercent}%` }} /></div>
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
