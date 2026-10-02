import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { ProjectMediaAsset, TimelineEditRange, WaveformPoint } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { TimelineLaneLabel } from "./TimelineLaneLabel";
import { publishPlaybackWords, subscribePlaybackSeek } from "../../domain/playback-sync";
import type { WordSelection } from "../../domain/word-selection";

const MAX_WAVEFORM_PIXELS_PER_SECOND = 1000;
type Layout = "layers" | "columns";
type Envelope = { duration: number; points: WaveformPoint[]; start?: number; end?: number };

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function intervalStyle(start: number, end: number, windowStart: number, span: number): CSSProperties | null {
  const left = Math.max(0, (start - windowStart) / span);
  const right = Math.min(1, (end - windowStart) / span);
  return right > left ? { left: `${left * 100}%`, width: `${(right - left) * 100}%` } : null;
}

function waveformPath(envelope: Envelope | undefined, windowStart: number, span: number): string {
  if (!envelope?.points.length || !envelope.duration) return "";
  const sourceStart = envelope.start ?? 0;
  const sourceSpan = (envelope.end ?? envelope.duration) - sourceStart;
  if (sourceSpan <= 0) return "";
  const first = Math.max(0, Math.floor((windowStart - sourceStart) / sourceSpan * envelope.points.length));
  const last = Math.min(envelope.points.length, Math.ceil((windowStart + span - sourceStart) / sourceSpan * envelope.points.length));
  const step = Math.max(1, Math.ceil((last - first) / 1200));
  const upper: string[] = [];
  const lower: string[] = [];
  for (let index = first; index < last; index += step) {
    let minimum = 0;
    let maximum = 0;
    for (let sample = index; sample < Math.min(last, index + step); sample += 1) {
      minimum = Math.min(minimum, envelope.points[sample]?.min ?? 0);
      maximum = Math.max(maximum, envelope.points[sample]?.max ?? 0);
    }
    const x = (sourceStart + index / envelope.points.length * sourceSpan - windowStart) / span * 1000;
    upper.push(`${x.toFixed(2)} ${(30 - maximum * 27).toFixed(2)}`);
    lower.push(`${x.toFixed(2)} ${(30 - minimum * 27).toFixed(2)}`);
  }
  if (!upper.length) return "";
  if (upper.length === 1) return `M${upper[0]}L${lower[0]}`;
  return `M${upper.join("L")}L${lower.reverse().join("L")}Z`;
}

interface Props {
  parent: ProjectMediaAsset;
  tracks: ProjectMediaAsset[];
  selectedTrackId: string | null;
  singleTrackView?: boolean;
  onSelectTrack: (assetId: string) => void;
  onCutsChange: (assetIds: string[], ranges: TimelineEditRange[]) => Promise<boolean>;
  readOnly?: boolean;
  wordSelection?: WordSelection;
}

export function ImportedMultitrackTimeline({ parent, tracks, selectedTrackId, singleTrackView = false, onSelectTrack, onCutsChange, readOnly = false, wordSelection }: Props) {
  const [layout, setLayout] = useState<Layout>("layers");
  const [windowSeconds, setWindowSeconds] = useState<number>(Number.POSITIVE_INFINITY);
  const [windowStart, setWindowStart] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [stagedCut, setStagedCut] = useState<TimelineEditRange | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [gains, setGains] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [envelopes, setEnvelopes] = useState<Record<string, Envelope>>({});
  const [detailEnvelopes, setDetailEnvelopes] = useState<Record<string, Envelope>>({});
  const [error, setError] = useState<string | null>(null);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const audioGraphRef = useRef<{ context: AudioContext; nodes: Map<string, { element: HTMLAudioElement; gain: GainNode }> } | null>(null);
  const scrubbingRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedWaveRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(220);
  const [viewportWidth, setViewportWidth] = useState(1000);
  const [measuredWaveWidth, setMeasuredWaveWidth] = useState(0);
  const duration = Math.max(parent.duration, ...tracks.map((track) => track.duration), 0);
  const selected = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];
  const estimatedWaveWidth = layout === "columns"
    ? columnWidths[selected?.id] ?? Math.max(240, (viewportWidth - 12 - Math.max(0, tracks.length - 1) * 6) / Math.max(1, tracks.length))
    : Math.max(240, viewportWidth - 140);
  const waveWidth = measuredWaveWidth || estimatedWaveWidth;
  const minSpan = Math.min(Math.max(duration, 0.01), Math.max(0.01, waveWidth / MAX_WAVEFORM_PIXELS_PER_SECOND));
  const span = duration > 0 ? Math.min(duration, Math.max(minSpan, windowSeconds)) : 1;
  const sharedCuts = tracks[0]?.removedRanges ?? [];
  const orderedTracks = useMemo(() => [...tracks].sort((a, b) => (a.sourceArchiveStreamIndex ?? 0) - (b.sourceArchiveStreamIndex ?? 0)), [tracks]);
  const visibleTracks = singleTrackView && selectedTrackId ? orderedTracks.filter((track) => track.id === selectedTrackId) : orderedTracks;
  const trackSources = orderedTracks.map((track) => `${track.id}:${track.url}:${track.updatedAt}`).join("|");
  const ids = orderedTracks.map((track) => track.id);

  useEffect(() => {
    publishPlaybackWords(Object.fromEntries(orderedTracks.map((track) => [track.id,
      track.words.findIndex((word) => word.start <= currentTime && word.end > currentTime)])));
  }, [orderedTracks, currentTime]);
  useEffect(() => () => publishPlaybackWords({}), []);
  useEffect(() => subscribePlaybackSeek((assetId, seconds) => {
    if (ids.includes(assetId)) seek(seconds);
  }));
  useEffect(() => {
    const anchor = wordSelection?.anchor;
    if (singleTrackView && anchor != null && selected?.words[anchor]) seek(selected.words[anchor].start);
  // Selection changes seek once; transcript polling must not rewind playback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordSelection?.anchor, selectedTrackId]);

  useEffect(() => {
    setWindowSeconds(Number.POSITIVE_INFINITY);
    setCurrentTime(0); setWindowStart(0); setMarkIn(null); setMarkOut(null); setStagedCut(null);
    setPlaying(false); setEnvelopes({}); setDetailEnvelopes({}); setError(null);
    audioRefs.current.forEach((audio) => audio.pause());
  }, [parent.id]);

  useEffect(() => () => {
    if (audioGraphRef.current) void audioGraphRef.current.context.close();
    audioGraphRef.current = null;
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { setViewportHeight(element.clientHeight); setViewportWidth(element.clientWidth || 1000); });
    observer.observe(element);
    setViewportHeight(element.clientHeight); setViewportWidth(element.clientWidth || 1000);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = selectedWaveRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setMeasuredWaveWidth(element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [layout, selected?.id, columnWidths]);

  useEffect(() => {
    const controller = new AbortController();
    setDetailEnvelopes({});
    for (const track of orderedTracks) {
      if (!track.url) continue;
      const url = track.url.replace(/\/audio(?:\?.*)?$/u, "/waveform");
      if (url === track.url) continue;
      void fetch(url, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`Không đọc được waveform ${track.name}`);
        return response.json() as Promise<Envelope>;
      }).then((envelope) => setEnvelopes((current) => ({ ...current, [track.id]: envelope })))
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không đọc được waveform."); });
    }
    return () => controller.abort();
  // The workspace refreshes transcript text frequently; that must not restart waveform requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSources]);

  const overviewSignature = orderedTracks.map((track) => envelopes[track.id]?.points.length ?? 0).join("|");
  useEffect(() => {
    if (!duration || !orderedTracks.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      for (const track of orderedTracks) {
        const overview = envelopes[track.id];
        if (!overview?.points.length || !track.url) continue;
        const width = layout === "columns" ? columnWidths[track.id] ?? waveWidth : waveWidth;
        if (overview.points.length * span / overview.duration >= width * .8) continue;
        const url = track.url.replace(/\/audio(?:\?.*)?$/u, "/waveform");
        if (url === track.url) continue;
        const query = new URLSearchParams({ start: String(windowStart), end: String(Math.min(duration, windowStart + span)), points: String(Math.min(16000, Math.max(64, Math.round(width * 1.5)))) });
        void fetch(`${url}?${query}`, { signal: controller.signal }).then((response) => {
          if (!response.ok) throw new Error(`Không đọc được PCM waveform ${track.name}`);
          return response.json() as Promise<Envelope>;
        }).then((detail) => { if (!controller.signal.aborted) setDetailEnvelopes((current) => ({ ...current, [track.id]: detail })); })
          .catch(() => { /* The overview remains usable if detail decoding is unavailable. */ });
      }
    }, 80);
    return () => { window.clearTimeout(timer); controller.abort(); };
  // The signature changes only when an overview arrives; transcript refreshes do not refetch PCM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSources, windowStart, span, overviewSignature, layout, viewportWidth, columnWidths]);

  useEffect(() => {
    audioRefs.current.forEach((audio, id) => {
      audio.playbackRate = rate;
      const gain = muted[id] ? 0 : (gains[id] ?? 100) / 100;
      const node = audioGraphRef.current?.nodes.get(id);
      if (node?.element === audio) { node.gain.gain.value = gain; audio.volume = 1; }
      else audio.volume = Math.min(1, gain);
    });
  }, [rate, gains, muted, trackSources]);

  async function preparePlayback() {
    if (typeof AudioContext === "undefined") return;
    try {
      if (!audioGraphRef.current) audioGraphRef.current = { context: new AudioContext(), nodes: new Map() };
      const graph = audioGraphRef.current;
      audioRefs.current.forEach((audio, id) => {
        if (graph.nodes.get(id)?.element === audio) return;
        const source = graph.context.createMediaElementSource(audio);
        const gain = graph.context.createGain();
        gain.gain.value = muted[id] ? 0 : (gains[id] ?? 100) / 100;
        source.connect(gain); gain.connect(graph.context.destination);
        graph.nodes.set(id, { element: audio, gain });
        audio.volume = 1;
      });
      await graph.context.resume();
    } catch {
      // Browsers without Web Audio still play at the regular 0–100% media volume.
    }
  }

  useEffect(() => {
    setWindowStart((value) => Math.max(0, Math.min(value, duration - span)));
  }, [duration, span]);

  function seek(seconds: number) {
    const next = Math.max(0, Math.min(duration, seconds));
    setCurrentTime(next);
    audioRefs.current.forEach((audio) => { audio.currentTime = Math.min(next, Number.isFinite(audio.duration) ? audio.duration : next); });
    if (next < windowStart || next > windowStart + span) setWindowStart(Math.max(0, Math.min(duration - span, next - span / 2)));
  }

  function seekFrom(event: PointerEvent<HTMLElement>, full = false) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width) seek((full ? 0 : windowStart) + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (full ? duration : span));
  }

  function beginScrub(event: PointerEvent<HTMLElement>, full = false) {
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekFrom(event, full);
  }

  function endScrub(event: PointerEvent<HTMLElement>, full = false) {
    if (!scrubbingRef.current) return;
    seekFrom(event, full);
    scrubbingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  async function saveCuts(next: TimelineEditRange[]) {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      if (await onCutsChange(ids, next)) { setStagedCut(null); setMarkIn(null); setMarkOut(null); }
    } finally { setBusy(false); }
  }

  function resizeColumn(trackId: string, event: PointerEvent<HTMLDivElement>) {
    const start = event.clientX;
    const width = columnWidths[trackId] ?? Math.max(240, viewportRef.current?.clientWidth ? (viewportRef.current.clientWidth - 12 - 6 * Math.max(0, tracks.length - 1)) / tracks.length : 360);
    const move = (next: globalThis.PointerEvent) => setColumnWidths((current) => ({ ...current, [trackId]: Math.max(240, width + next.clientX - start) }));
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  }

  function selectZoom(next: number) {
    const nextSpan = Math.max(minSpan, Math.min(duration, next));
    setWindowSeconds(nextSpan);
    setWindowStart(Math.max(0, Math.min(duration - nextSpan, currentTime - nextSpan / 2)));
  }

  const zoomRatio = duration > minSpan ? Math.log(duration / span) / Math.log(duration / minSpan) : 0;
  const zoomValue = Math.round(Math.max(0, Math.min(1, zoomRatio)) * 1000);
  const secondsPerTenPixels = span / waveWidth * 10;
  const zoomResolution = `${secondsPerTenPixels >= 1 ? secondsPerTenPixels.toFixed(1) : secondsPerTenPixels.toFixed(2)}s / 10px`;

  const playhead = (currentTime - windowStart) / span * 100;
  return <ModuleFrame title="Timeline" eyebrow={`${orderedTracks.length} CHANNEL · ${parent.name}`} index="A1" tone="dark" className="timeline-module obs-timeline imported-timeline"
    action={<div className="timeline-header-actions obs-timeline__header-actions">
      <div aria-label="Kiểu hiển thị Timeline" className="obs-timeline__layout" role="group">
        <button aria-pressed={layout === "columns"} onClick={() => setLayout("columns")} type="button">CỘT</button>
        <button aria-pressed={layout === "layers"} onClick={() => setLayout("layers")} type="button">LAYER</button>
      </div>
      <div className="timeline-edit-actions" role="group" aria-label="Timeline edit actions">
        <button disabled={readOnly || !duration} onClick={() => { setMarkIn(currentTime); setStagedCut(null); }} type="button">MARK IN</button>
        <button disabled={readOnly || !duration} onClick={() => { setMarkOut(currentTime); setStagedCut(null); }} type="button">MARK OUT</button>
        <button disabled={readOnly || markIn === null || markOut === null || Math.abs(markOut - markIn) < .05} onClick={() => setStagedCut({ id: "preview", start: Math.min(markIn!, markOut!), end: Math.max(markIn!, markOut!) })} type="button">CUT</button>
        <button disabled={readOnly || busy || (!stagedCut && !sharedCuts.length)} onClick={() => stagedCut ? setStagedCut(null) : void saveCuts(sharedCuts.slice(0, -1))} type="button">UNCUT</button>
        <button className="is-delete" disabled={readOnly || busy || !stagedCut} onClick={() => { if (stagedCut) void saveCuts([...sharedCuts, { ...stagedCut, id: `cut-${crypto.randomUUID()}` }].sort((a, b) => a.start - b.start)); }} type="button">DELETE</button>
        <button disabled={readOnly || busy || (!sharedCuts.length && !stagedCut && markIn === null && markOut === null)} onClick={() => sharedCuts.length ? void saveCuts([]) : (setStagedCut(null), setMarkIn(null), setMarkOut(null))} type="button">RESET</button>
      </div>
      <div aria-label="Zoom Timeline" className="timeline-zoom obs-timeline__zoom" role="group">
        <button aria-label="Thu nhỏ Timeline" disabled={!duration || span >= duration} onClick={() => selectZoom(span * 2)} type="button">−</button>
        <input aria-label="Zoom timeline" aria-valuetext={zoomResolution} disabled={!duration || duration <= minSpan} max={1000} min={0} onChange={(event) => {
          const fraction = Number(event.target.value) / 1000;
          selectZoom(duration / (duration / minSpan) ** fraction);
        }} type="range" value={zoomValue} />
        <span>{span >= 10 ? span.toFixed(0) : span.toFixed(2)}s</span>
        <button aria-label="Phóng to Timeline" disabled={!duration || span <= minSpan} onClick={() => selectZoom(span / 2)} type="button">+</button>
      </div>
    </div>}>
    <div className="obs-timeline__main">
      {error ? <p className="obs-timeline__error" role="alert">{error}</p> : null}
      <div className="obs-timeline__viewport" ref={viewportRef}>
        <div aria-label="Timeline đa kênh import" className={`obs-timeline__track-scroll is-${layout}`}
          style={{ "--obs-layer-height": `${Math.max(110, Math.round(viewportHeight * .6))}px` } as CSSProperties}>
          {layout === "layers" ? <><div className="obs-timeline__label-spacer" /><div aria-label="Ruler chung" className="obs-timeline__ruler"
            onPointerDown={(event) => beginScrub(event)} onPointerMove={(event) => { if (scrubbingRef.current) seekFrom(event); }} onPointerUp={(event) => endScrub(event)}>
            {[0, 1, 2, 3, 4].map((part) => <span key={part} style={{ left: `${part * 25}%` }}>{clock(windowStart + part * span / 4)}</span>)}
          </div></> : null}
          {visibleTracks.map((track) => {
            const index = orderedTracks.findIndex((item) => item.id === track.id);
            const trackName = track.name.startsWith(`${parent.name} · `) ? track.name.slice(parent.name.length + 3) : track.name;
            const overview = envelopes[track.id];
            const detail = detailEnvelopes[track.id];
            const envelope = detail && (detail.start ?? 0) <= windowStart + .01 && (detail.end ?? detail.duration) >= windowStart + span - .01 ? detail : overview;
            const point = overview?.points[Math.min((overview.points.length || 1) - 1, Math.floor(currentTime / (overview.duration || 1) * overview.points.length))];
            const level = Math.round(Math.max(Math.abs(point?.min ?? 0), Math.abs(point?.max ?? 0)) * 100);
            return <div className="obs-timeline__lane" key={track.id} style={layout === "columns" ? { width: columnWidths[track.id] ?? `max(240px, calc((100% - 12px - ${(visibleTracks.length - 1) * 6}px) / ${visibleTracks.length}))` } : undefined}>
              <button aria-pressed={selected?.id === track.id} className="obs-timeline__lane-label" onClick={() => onSelectTrack(track.id)} type="button">
                <TimelineLaneLabel text={`Channel ${index + 1} - ${trackName}`} title={track.name} />
              </button>
              {layout === "columns" ? <div className="obs-timeline__column-ruler obs-timeline__ruler" onPointerDown={(event) => beginScrub(event)} onPointerMove={(event) => { if (scrubbingRef.current) seekFrom(event); }} onPointerUp={(event) => endScrub(event)}>{[0, 1, 2, 3, 4].map((part) => <span key={part} style={{ left: `${part * 25}%` }}>{clock(windowStart + part * span / 4)}</span>)}</div> : null}
              <div aria-label={`Waveform Channel ${index + 1}`} className="obs-timeline__wave" ref={selected?.id === track.id ? selectedWaveRef : undefined} onPointerDown={(event) => beginScrub(event)} onPointerMove={(event) => { if (scrubbingRef.current) seekFrom(event); }} onPointerUp={(event) => endScrub(event)}>
                <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1000 60"><path d={waveformPath(envelope, windowStart, span)} /></svg>
                {sharedCuts.map((cut) => { const style = intervalStyle(cut.start, cut.end, windowStart, span); return style ? <i aria-label="Đoạn đã loại" className="obs-timeline__removed-range" key={cut.id} style={style} /> : null; })}
                {stagedCut && intervalStyle(stagedCut.start, stagedCut.end, windowStart, span) ? <i className="obs-timeline__removed-range is-staged" style={intervalStyle(stagedCut.start, stagedCut.end, windowStart, span)!} /> : null}
                {layout === "columns" && playhead >= 0 && playhead <= 100 ? <i aria-label={`Playhead Channel ${index + 1}`} className="obs-timeline__playhead obs-timeline__column-playhead" style={{ left: `${playhead}%` }} /> : null}
                {markIn !== null ? <i aria-label="Mark In" className="obs-timeline__mark" style={{ left: `${(markIn - windowStart) / span * 100}%` }} /> : null}
                {markOut !== null ? <i aria-label="Mark Out" className="obs-timeline__mark" style={{ left: `${(markOut - windowStart) / span * 100}%` }} /> : null}
              </div>
              <div aria-label={`Subtitle Channel ${index + 1}`} className="obs-timeline__caption imported-timeline__words">
                {track.words.length ? track.words.map((word, wordIndex) => {
                  const style = intervalStyle(word.start, word.end, windowStart, span);
                  return style ? <button key={wordIndex} type="button" style={style}
                    aria-label={`${word.text} · ${clock(word.start)}–${clock(word.end)}`}
                    title={`${word.text} · ${word.start.toFixed(3)}–${word.end.toFixed(3)}s${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`}
                    className={`imported-timeline__word ${word.start <= currentTime && word.end > currentTime ? "is-active" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""}`}
                    onClick={() => seek(word.start)}>{word.text}</button> : null;
                }) : <span>{track.text ? "Transcript chưa có word timestamp" : "Chưa có lời nói"}</span>}
              </div>
              <div className="obs-timeline__lane-controls">
                <div className="obs-timeline__gain"><div className="obs-timeline__gain-label"><span>GAIN</span><button aria-label={`${muted[track.id] ? "Bật tiếng" : "Tắt tiếng"} Channel ${index + 1}`} aria-pressed={Boolean(muted[track.id])} className="obs-timeline__mute" onClick={() => setMuted((current) => ({ ...current, [track.id]: !current[track.id] }))} title={muted[track.id] ? "Bật tiếng track" : "Tắt tiếng track"} type="button">M</button></div><input aria-label={`Gain Channel ${index + 1}`} max="200" min="0" onChange={(event) => setGains((current) => ({ ...current, [track.id]: Number(event.target.value) }))} type="range" value={gains[track.id] ?? 100} /><output>{gains[track.id] ?? 100}%</output></div>
                <div aria-label={`Level Channel ${index + 1}`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={level} className="obs-timeline__level" role="meter"><span>LEVEL</span><div><i style={{ "--source-level": `${level}%` } as CSSProperties} /></div><output>{level}%</output></div>
              </div>
              {layout === "columns" && visibleTracks.indexOf(track) < visibleTracks.length - 1 ? <div aria-label={`Đổi độ rộng Channel ${index + 1}`} className="obs-timeline__column-resizer" onPointerDown={(event) => { event.stopPropagation(); resizeColumn(track.id, event); }} role="separator" tabIndex={0} /> : null}
            </div>;
          })}
          {layout === "layers" && playhead >= 0 && playhead <= 100 ? <div className="obs-timeline__playhead-layer"><i aria-label="Playhead chung" className="obs-timeline__playhead" style={{ left: `${playhead}%` }} /></div> : null}
        </div>
      </div>
      <div className="transport-bar obs-timeline__transport">
        <button aria-label={playing ? "Tạm dừng footage" : "Phát footage"} className="transport-button" disabled={!selected?.url} onClick={() => {
          if (playing) { audioRefs.current.forEach((audio) => audio.pause()); setPlaying(false); }
          else {
            audioRefs.current.forEach((audio) => { audio.currentTime = currentTime; audio.playbackRate = rate; });
            void preparePlayback().then(() => Promise.all([...audioRefs.current.values()].map((audio) => audio.play()))).then(() => setPlaying(true))
              .catch(() => { audioRefs.current.forEach((audio) => audio.pause()); setError("Không phát được các channel cùng lúc."); });
          }
        }} type="button"><Icon name={playing ? "pause" : "play"} /></button>
        <code>{clock(currentTime)}</code>
        <div aria-label="Thanh tiến trình Timeline — bấm hoặc kéo để tua" className="transport-progress obs-timeline__scrub" onPointerDown={(event) => beginScrub(event, true)} onPointerMove={(event) => { if (scrubbingRef.current) seekFrom(event, true); }} onPointerUp={(event) => endScrub(event, true)}><i style={{ width: `${duration ? currentTime / duration * 100 : 0}%` }} /><b style={{ left: `${duration ? currentTime / duration * 100 : 0}%` }} /></div>
        <code>{clock(duration)}</code>
        <label className="transport-rate"><span>RATE</span><select aria-label="Tốc độ phát" onChange={(event) => setRate(Number(event.target.value))} value={rate}>{[.5, .75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
        <div className="obs-timeline__transport-extras"><span>{selected?.name ?? "Chưa có channel"}</span></div>
      </div>
    </div>
    {orderedTracks.map((track) => track.url ? <audio key={track.id} onEnded={() => {
      if (track.id === orderedTracks[0]?.id) { audioRefs.current.forEach((audio) => audio.pause()); setPlaying(false); }
    }} onTimeUpdate={(event) => {
      if (track.id !== orderedTracks[0]?.id) return;
      const time = event.currentTarget.currentTime;
      setCurrentTime(time);
      setWindowStart((start) => time <= start + span ? start : Math.min(Math.max(0, duration - span), time - span / 2));
      audioRefs.current.forEach((audio, id) => { if (id !== track.id && Math.abs(audio.currentTime - time) > .08) audio.currentTime = time; });
    }} onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(currentTime, event.currentTarget.duration || currentTime); }}
      preload="none" ref={(element) => { if (element) audioRefs.current.set(track.id, element); else audioRefs.current.delete(track.id); }} src={track.url} /> : null)}
  </ModuleFrame>;
}
