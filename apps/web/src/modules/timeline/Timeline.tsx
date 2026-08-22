import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import type { StudioWord } from "../../domain/types";

export interface ActiveTake {
  id?: string;
  name: string;
  url?: string;
  duration: number;
  text?: string;
  words?: StudioWord[];
}

interface TimelineProps {
  take: ActiveTake | null;
  gain: number;
  onGainChange: (value: number) => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];

function timecode(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

export function Timeline({ take, gain, onGainChange }: TimelineProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [peaks, setPeaks] = useState<number[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const duration = take?.duration || 12.4;
  const visualGain = Math.min(2.5, Math.max(0.08, 10 ** (gain / 20)));

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
  }, [take?.name]);

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
      setPeaks([]);
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
        const barCount = 240;
        const samplesPerBar = Math.max(1, Math.floor(buffer.length / barCount));
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
        const nextPeaks = Array.from({ length: barCount }, (_, bar) => {
          const start = bar * samplesPerBar;
          const end = Math.min(buffer.length, start + samplesPerBar);
          let peak = 0;
          for (let sample = start; sample < end; sample += Math.max(1, Math.floor(samplesPerBar / 80))) {
            for (const channel of channels) peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
          }
          return Math.max(0.015, peak);
        });
        setPeaks(nextPeaks);
      } catch (error) {
        if (!controller.signal.aborted) setPeaks([]);
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
    if (!audio || !take?.url) return;
    if (audio.paused) {
      try {
        await preparePlayback(audio);
      } catch {
        // Native playback remains available if Web Audio is unavailable.
      }
      audio.playbackRate = playbackRate;
      await audio.play();
    }
    else audio.pause();
  }

  function scrub(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTime = Math.min(duration, Math.max(0, ((event.clientX - rect.left) / rect.width) * duration));
    setCurrentTime(nextTime);
    if (audioRef.current) audioRef.current.currentTime = nextTime;
  }

  return (
    <ModuleFrame
      eyebrow="TIMELINE"
      title={take?.name ?? "Chưa có audio trong timeline"}
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
          <input
            aria-label="Source gain"
            max="12"
            min="-24"
            onInput={(event) => onGainChange(Number(event.currentTarget.value))}
            step="0.5"
            type="range"
            value={gain}
          />
          <output>{gain > 0 ? "+" : ""}{gain.toFixed(1)}</output>
        </label>
        <div className="timeline-scroll">
          <div className="timeline-canvas" style={{ "--zoom": zoom, "--gain": visualGain } as CSSProperties}>
            <div className="timeline-ruler">
              {Array.from({ length: 9 }, (_, index) => {
                const seconds = (duration * index) / 8;
                return <span key={index} style={{ left: `${index * 12.5}%` }}>{seconds.toFixed(duration < 8 ? 1 : 0)}s</span>;
              })}
            </div>
            <div className="waveform" aria-label="Waveform timeline" onPointerDown={scrub}>
              {peaks.map((amplitude, index) => <i key={index} style={{ height: `${Math.min(1, amplitude * 1.7) * 100}%` }} />)}
              <div className="timeline-playhead" style={{ left: `${(currentTime / duration) * 100}%` }} />
              {!take ? <div className="timeline-empty"><Icon name="waveform" /><b>Import, thu âm hoặc chọn một Take</b><span>Audio lineage sẽ bắt đầu tại đây</span></div> : null}
            </div>
            <div className="word-track">
              {take?.words?.length ? take.words.map((word, index) => (
                <span className={currentTime >= word.end ? "is-past" : ""} key={`${word.text}-${index}`} style={{ left: `${(word.start / duration) * 100}%`, width: `${Math.max(1.5, ((word.end - word.start) / duration) * 100)}%` }}>{word.text}</span>
              )) : <em>WORD SYNC · subtitle sẽ khớp theo timestamp</em>}
            </div>
          </div>
        </div>
      </div>
      <div className="transport-bar">
        <button aria-label={playing ? "Tạm dừng" : "Phát"} className="transport-button" disabled={!take?.url} onClick={togglePlay} type="button">
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <code>{timecode(currentTime)}</code>
        <div className="transport-progress"><i style={{ width: `${(currentTime / duration) * 100}%` }} /></div>
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
