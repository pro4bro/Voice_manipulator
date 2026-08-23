import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import type { RecordingWaveformPreview, StudioWord } from "../../domain/types";
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
  onGainChange: (value: number) => void;
  onActiveWordChange?: (index: number) => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];
const PATH_WIDTH = 1200;
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

function liveEnvelope(samples: number[]): EnvelopePoint[] {
  return samples.map((sample) => ({ min: -sample, max: sample }));
}

export function Timeline({
  take,
  gain,
  recordingPreview = null,
  onGainChange,
  onActiveWordChange,
}: TimelineProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [envelope, setEnvelope] = useState<EnvelopePoint[]>([]);
  const [decodedDuration, setDecodedDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const scrubbingRef = useRef(false);
  const isRecording = Boolean(recordingPreview?.active);
  const words = take?.words ?? [];
  const lastWordEnd = words.length ? Math.max(...words.map((word) => word.end)) : 0;
  const sourceDuration = isRecording
    ? Math.max(0.1, recordingPreview?.duration ?? 0)
    : decodedDuration || take?.duration || lastWordEnd;
  const duration = sourceDuration || 10;
  const visualGain = Math.min(4, Math.max(0.025, 10 ** (gain / 20)));
  const visibleEnvelope = isRecording ? liveEnvelope(recordingPreview?.samples ?? []) : envelope;
  const path = waveformPath(visibleEnvelope, visualGain);
  const sourcePeak = visibleEnvelope.reduce((peak, point) => Math.max(peak, Math.abs(point.min), Math.abs(point.max)), 0);
  const peakDb = sourcePeak > 0.0001 ? Math.min(12, 20 * Math.log10(sourcePeak) + gain) : -60;
  const activeWordIndex = isRecording ? -1 : words.findIndex((word) => currentTime >= word.start && currentTime < word.end);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
    setDecodedDuration(0);
  }, [take?.name]);

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

  useEffect(() => () => {
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
        const pointCount = Math.min(900, Math.max(240, Math.floor(buffer.duration * 30)));
        const samplesPerPoint = Math.max(1, Math.floor(buffer.length / pointCount));
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
        const nextEnvelope = Array.from({ length: pointCount }, (_, pointIndex) => {
          const start = pointIndex * samplesPerPoint;
          const end = Math.min(buffer.length, start + samplesPerPoint);
          const stride = Math.max(1, Math.floor(samplesPerPoint / 120));
          let min = 0;
          let max = 0;
          for (let sample = start; sample < end; sample += stride) {
            for (const channel of channels) {
              min = Math.min(min, channel[sample] ?? 0);
              max = Math.max(max, channel[sample] ?? 0);
            }
          }
          return { min: Math.min(-0.006, min), max: Math.max(0.006, max) };
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
      gainNode.gain.value = 10 ** (gain / 20);
      source.connect(gainNode).connect(context.destination);
      playbackContextRef.current = context;
      gainNodeRef.current = gainNode;
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

  function seek(event: PointerEvent<HTMLDivElement>) {
    if (isRecording || !take?.url) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTime = Math.min(duration, Math.max(0, ((event.clientX - rect.left) / rect.width) * duration));
    setCurrentTime(nextTime);
    if (audioRef.current) audioRef.current.currentTime = nextTime;
  }

  function beginScrub(event: PointerEvent<HTMLDivElement>) {
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seek(event);
  }

  return (
    <ModuleFrame
      eyebrow="TIMELINE"
      title={isRecording ? "REC LIVE · waveform trực tiếp" : take?.name ?? "Chưa có audio trong timeline"}
      index="A1"
      tone="dark"
      className="timeline-module"
      action={
        <div className="timeline-zoom">
          <button aria-label="Thu nhỏ timeline" onClick={() => setZoom(Math.max(1, zoom - 0.5))} type="button">−</button>
          <span>{zoom.toFixed(1)}×</span>
          <button aria-label="Phóng to timeline" onClick={() => setZoom(Math.min(16, zoom + 0.5))} type="button">+</button>
        </div>
      }
    >
      <div className="timeline-stage">
        <label className="timeline-gain">
          <span>GAIN</span>
          <output>{gain > 0 ? "+" : ""}{gain.toFixed(1)}</output>
          <input
            aria-label="Source gain"
            max="12"
            min="-24"
            onInput={(event) => onGainChange(Number(event.currentTarget.value))}
            step="0.5"
            type="range"
            value={gain}
          />
          <small>PK {peakDb.toFixed(1)}</small>
        </label>
        <div className="timeline-scroll">
          <div className="timeline-canvas" style={{ "--zoom": zoom } as CSSProperties}>
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
            <div aria-label="Playhead indicator" className={`timeline-playhead ${isRecording ? "is-recording" : ""}`} style={{ left: `${playheadPercent}%` }} />
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
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) setDecodedDuration(event.currentTarget.duration);
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          ref={audioRef}
          src={take.url}
        />
      ) : null}
    </ModuleFrame>
  );
}
