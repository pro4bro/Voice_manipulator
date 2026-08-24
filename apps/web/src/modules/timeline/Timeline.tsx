import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import type { RecordingWaveformPreview, StudioWord, TimelineEditRange } from "../../domain/types";
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
  onGainChange: (value: number) => void;
  onRemovedRangesChange?: (ranges: TimelineEditRange[]) => void;
  onActiveWordChange?: (index: number) => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];
const PATH_WIDTH = 12000;
const PATH_HEIGHT = 100;

function timecode(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function waveformPath(points: EnvelopePoint[], gain: number) {
  if (!points.length) return "";
  const center = PATH_HEIGHT / 2;
  const amplitude = PATH_HEIGHT * 0.46;
  const coordinate = (point: EnvelopePoint, index: number, edge: "min" | "max") => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * PATH_WIDTH;
    const value = Math.max(-1, Math.min(1, point[edge] * gain));
    return `${x.toFixed(2)},${(center - value * amplitude).toFixed(2)}`;
  };
  const top = points.map((point, index) => coordinate(point, index, "max"));
  const bottom = points.map((_, reverseIndex) => {
    const index = points.length - reverseIndex - 1;
    return coordinate(points[index], index, "min");
  });
  return `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
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
  onGainChange,
  onRemovedRangesChange,
  onActiveWordChange,
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineCanvasRef = useRef<HTMLDivElement>(null);
  const playheadDragRef = useRef(false);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const playbackClockFrameRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const isRecording = Boolean(recordingPreview?.active);
  const words = take?.words ?? [];
  const lastWordEnd = words.length ? Math.max(...words.map((word) => word.end)) : 0;
  const sourceDuration = isRecording
    ? Math.max(0.1, recordingPreview?.duration ?? 0)
    : mediaDuration || decodedDuration || take?.duration || lastWordEnd;
  const duration = sourceDuration || 10;
  const visualGain = Math.min(63.1, Math.max(0.0000158, 10 ** (gain / 20)));
  const visibleEnvelope = isRecording ? liveEnvelope(recordingPreview?.samples ?? []) : envelope;
  const path = waveformPath(visibleEnvelope, visualGain);
  const latestPreview = visibleEnvelope[visibleEnvelope.length - 1];
  const latestPreviewPeak = latestPreview ? Math.max(Math.abs(latestPreview.min), Math.abs(latestPreview.max)) : 0;
  const previewDb = latestPreviewPeak > 0.0001 ? Math.min(96, Math.max(-96, 20 * Math.log10(latestPreviewPeak) + gain)) : -96;
  const activeSignalDb = isRecording ? previewDb : signalDb;
  const activePeakDb = isRecording ? Math.max(peakDb, previewDb) : peakDb;
  const meterPercent = Math.min(100, Math.max(0, ((activeSignalDb + 96) / 192) * 100));
  const peakPercent = Math.min(100, Math.max(0, ((activePeakDb + 96) / 192) * 100));
  const activeWordIndex = isRecording ? -1 : activeWordAt(words, currentTime);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

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
    onActiveWordChange?.(activeWordIndex);
  }, [activeWordIndex, onActiveWordChange]);

  useEffect(() => () => onActiveWordChange?.(-1), [onActiveWordChange]);

  useEffect(() => {
    const node = gainNodeRef.current;
    if (node) node.gain.setTargetAtTime(10 ** (gain / 20), node.context.currentTime, 0.01);
  }, [gain]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (!isRecording) return;
    setSignalDb(previewDb);
    setPeakDb((current) => Math.max(previewDb, current - 0.3));
  }, [isRecording, previewDb]);

  function syncPlaybackClock(audio = audioRef.current) {
    if (!audio) return;
    const nextTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
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
      syncPlaybackClock(audio);
      playbackClockFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
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
      const nextDb = peak > 0.0001 ? Math.min(96, Math.max(-96, 20 * Math.log10(peak) + gain)) : -96;
      setSignalDb(nextDb);
      setPeakDb((current) => Math.max(nextDb, current - 0.17));
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
        const pointCount = Math.min(24000, Math.max(2400, Math.ceil(buffer.duration * 180)));
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

  async function preparePlayback(audio: HTMLAudioElement) {
    let context = playbackContextRef.current;
    if (!context) {
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const gainNode = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      gainNode.gain.value = 10 ** (gain / 20);
      source.connect(gainNode).connect(analyser).connect(context.destination);
      playbackContextRef.current = context;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;
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
              onChange={(event) => onGainChange(Math.max(-96, Math.min(96, Number(event.currentTarget.value) || 0)))}
              step="0.5"
              type="number"
              value={gain}
            />
            <input
              aria-label="Source gain"
              max="96"
              min="-96"
              onInput={(event) => onGainChange(Number(event.currentTarget.value))}
              step="0.5"
              type="range"
              value={gain}
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
                </svg>
              ) : null}
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
            <div aria-label="Playhead indicator" className={`timeline-playhead ${isRecording ? "is-recording" : ""}`} onPointerCancel={endPlayheadDrag} onPointerDown={beginPlayheadDrag} onPointerMove={dragPlayhead} onPointerUp={endPlayheadDrag} style={{ left: `${playheadPercent}%` }} />
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
        <span className="gain-badge">{gain > 0 ? "+" : ""}{gain.toFixed(1)} dB</span>
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
          onSeeking={(event) => syncPlaybackClock(event.currentTarget)}
          onSeeked={(event) => syncPlaybackClock(event.currentTarget)}
          onTimeUpdate={(event) => syncPlaybackClock(event.currentTarget)}
          preload="metadata"
          ref={audioRef}
          src={take.url}
        />
      ) : null}
    </ModuleFrame>
  );
}
