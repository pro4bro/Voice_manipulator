import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useAudioScrubber } from "./audio-scrubbing";
import { usePreviewMixer } from "./preview-mixer";
import type { ProjectMediaAsset, SpeakerProfile, TimelineEditRange, WaveformPoint } from "../../domain/types";
import type { TimelineEditState } from "../../domain/timeline-editing";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { useScriptShortcuts } from "../script/script-shortcuts";
import { TimelineLaneLabel } from "./TimelineLaneLabel";
import { notifyPlaybackInteraction, publishPlaybackWords, subscribePlaybackSeek } from "../../domain/playback-sync";
import { TIMESTAMP_PROMOTION_EVENT, type TimestampPromotion } from "../../domain/timestamp-promotion";
import { excludedTimelineRanges, nextPlayableTime, restoreTimelineSections, timelineSections } from "../../domain/timeline-editing";
import type { WordSelection } from "../../domain/word-selection";
import { EMPTY_SELECTION } from "../../domain/word-selection";
import { hasMultipleSelectionRanges, productionRanges, rangeReadoutBounds, selectProductionTime, selectProductionWord } from "../../domain/production-selection";
import { waveformEnvelopePath } from "./waveform-path";
import { visibleRulerMarks } from "./ruler";
import { subtitleIndexAtTime, visibleSubtitleWordLayout } from "./subtitle-density";
import { Timeline } from "./Timeline";
import { previewDbToPercent, previewPercentToDb } from "./gain-automation";
import { minimumTimelineSpan, timelineSpanAtZoomPosition, timelineZoomPosition, timelineZoomResolution,
  TIMELINE_ZOOM_STEPS } from "./zoom";
import "./waveform.css";
import "./subtitle-density.css";

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

function waveformPath(envelope: Envelope | undefined, windowStart: number, span: number, gain = 1): string {
  if (!envelope?.points.length || !envelope.duration) return "";
  const sourceStart = envelope.start ?? 0;
  const sourceSpan = (envelope.end ?? envelope.duration) - sourceStart;
  if (sourceSpan <= 0) return "";
  const first = Math.max(0, Math.floor((windowStart - sourceStart) / sourceSpan * envelope.points.length));
  const last = Math.min(envelope.points.length, Math.ceil((windowStart + span - sourceStart) / sourceSpan * envelope.points.length));
  const step = Math.max(1, Math.ceil((last - first) / 1200));
  const visible: Array<{ x: number; min: number; max: number }> = [];
  for (let index = first; index < last; index += step) {
    let minimum = 0;
    let maximum = 0;
    for (let sample = index; sample < Math.min(last, index + step); sample += 1) {
      minimum = Math.min(minimum, envelope.points[sample]?.min ?? 0);
      maximum = Math.max(maximum, envelope.points[sample]?.max ?? 0);
    }
    const x = (sourceStart + index / envelope.points.length * sourceSpan - windowStart) / span * 1000;
    visible.push({ x, min: minimum, max: maximum });
  }
  return waveformEnvelopePath(visible, 60, gain);
}

interface Props {
  parent: ProjectMediaAsset;
  tracks: ProjectMediaAsset[];
  selectedTrackId: string | null;
  singleTrackView?: boolean;
  visibleTrackIds?: string[] | null;
  onSelectTrack: (assetId: string) => void;
  onCutsChange: (assetIds: string[], ranges: TimelineEditRange[]) => Promise<boolean>;
  readOnly?: boolean;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
  speakers?: SpeakerProfile[];
  onAssetWordsChange?: (assetId: string, words: ProjectMediaAsset["words"], text?: string) => void;
  onAssetTimelineStateChange?: (assetId: string, state: TimelineEditState) => Promise<void>;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function ImportedMultitrackTimeline({ parent, tracks, selectedTrackId, singleTrackView = false, visibleTrackIds = null, onSelectTrack, onCutsChange, readOnly = false, wordSelection, onWordSelectionChange, speakers = [], onAssetWordsChange, onAssetTimelineStateChange, onUndo, onRedo }: Props) {
  const [layout, setLayout] = useState<Layout>("layers");
  const [windowSeconds, setWindowSeconds] = useState<number>(Number.POSITIVE_INFINITY);
  const [windowStart, setWindowStart] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [markIn, setMarkIn] = useState<number | null>(tracks[0]?.workingRange?.start ?? null);
  const [markOut, setMarkOut] = useState<number | null>(tracks[0]?.workingRange?.end ?? null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const { gains, setGains, muted, setMuted, solo, setSolo } = usePreviewMixer();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [envelopes, setEnvelopes] = useState<Record<string, Envelope>>({});
  const [detailEnvelopes, setDetailEnvelopes] = useState<Record<string, Envelope>>({});
  const [error, setError] = useState<string | null>(null);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const playbackRevision = useRef(0);
  const audioCallbacks = useRef(new Map<string, (element: HTMLAudioElement | null) => void>());
  const audioGraphRef = useRef<{ context: AudioContext; nodes: Map<string, { element: HTMLAudioElement; gain: GainNode }> } | null>(null);
  function audioCallback(id: string) {
    let callback = audioCallbacks.current.get(id);
    if (!callback) {
      callback = (element) => {
        if (element) audioRefs.current.set(id, element);
        else {
          audioRefs.current.get(id)?.pause();
          audioRefs.current.delete(id);
          audioGraphRef.current?.nodes.get(id)?.gain.disconnect();
          audioGraphRef.current?.nodes.delete(id);
        }
      };
      audioCallbacks.current.set(id, callback);
    }
    return callback;
  }
  const scrubbingRef = useRef(false);
  const rangeDragRef = useRef<{ assetId: string; start: number; startX: number; base: WordSelection; moved: boolean } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedWaveRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(220);
  const [viewportWidth, setViewportWidth] = useState(1000);
  const [measuredWaveWidth, setMeasuredWaveWidth] = useState(0);
  const [editFocus, setEditFocus] = useState<{ assetId: string; request: { wordIndex?: number; insertTime?: number; promoteIndex?: number; contextIndex?: number; contextTime?: number; serial: number } } | null>(null);
  const editFocusRef = useRef(editFocus);
  const moduleRef = useRef<HTMLElement>(null);
  useScriptShortcuts(moduleRef, { undo: onUndo, redo: onRedo }, ".timeline-module", !editFocus);
  editFocusRef.current = editFocus;
  const duration = Math.max(parent.duration, ...tracks.map((track) => track.duration), 0);
  const selected = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];

  function focusTrack(track: ProjectMediaAsset, request: { wordIndex?: number; insertTime?: number; promoteIndex?: number; contextIndex?: number; contextTime?: number }) {
    if (readOnly || !onAssetWordsChange || !onAssetTimelineStateChange) return;
    if (editFocus?.assetId === track.id && editFocus.request.promoteIndex === request.promoteIndex && request.promoteIndex !== undefined) return;
    audioRefs.current.forEach((audio) => audio.pause());
    setPlaying(false);
    setEditFocus({ assetId: track.id, request: { ...request, serial: Date.now() } });
  }
  const estimatedWaveWidth = layout === "columns"
    ? columnWidths[selected?.id] ?? Math.max(240, (viewportWidth - 12 - Math.max(0, tracks.length - 1) * 6) / Math.max(1, tracks.length))
    : Math.max(240, viewportWidth - 140);
  const waveWidth = measuredWaveWidth || estimatedWaveWidth;
  const minSpan = minimumTimelineSpan(duration, waveWidth);
  const span = duration > 0 ? Math.min(duration, Math.max(minSpan, windowSeconds)) : 1;
  const commonRulerMarks = visibleRulerMarks(duration, windowStart, span, waveWidth);
  const sharedCuts = tracks[0]?.removedRanges ?? [];
  const sharedWorkingRange = tracks[0]?.workingRange ?? null;
  const sharedCutPoints = tracks[0]?.cutPoints ?? [];
  const excludedRanges = useMemo(() => excludedTimelineRanges(duration, sharedCuts, sharedWorkingRange), [duration, sharedCuts, sharedWorkingRange]);
  const sections = useMemo(() => timelineSections(duration, sharedCutPoints), [duration, sharedCutPoints]);
  const orderedTracks = useMemo(() => [...tracks].sort((a, b) => (a.sourceArchiveStreamIndex ?? 0) - (b.sourceArchiveStreamIndex ?? 0)), [tracks]);
  const selectionIds = visibleTrackIds ?? (singleTrackView && selectedTrackId ? [selectedTrackId] : null);
  const visibleTracks = selectionIds !== null ? orderedTracks.filter((track) => selectionIds.includes(track.id)) : orderedTracks;
  const hasSolo = orderedTracks.some((track) => solo[track.id]);
  const previewGain = (id: string) => muted[id] || hasSolo && !solo[id] ? 0 : (gains[id] ?? 100) / 100;
  const trackSources = visibleTracks.map((track) => `${track.id}:${track.url}:${track.updatedAt}`).join("|");
  useEffect(() => () => { ++playbackRevision.current; }, [trackSources]);
  const audioScrubber = useAudioScrubber(trackSources);
  const ids = orderedTracks.map((track) => track.id);

  useEffect(() => {
    publishPlaybackWords(Object.fromEntries(visibleTracks.map((track) => [track.id,
      track.words.findIndex((word) => word.start <= currentTime && word.end > currentTime)])));
  }, [trackSources, currentTime]);
  useEffect(() => () => publishPlaybackWords({}), []);
  useEffect(() => subscribePlaybackSeek((assetId, seconds) => {
    if (ids.includes(assetId)) seek(seconds);
  }));
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<TimestampPromotion>).detail;
      if (detail.index === null || detail.index === undefined) return;
      if (editFocusRef.current?.assetId === detail.assetId) return;
      const track = orderedTracks.find((item) => item.id === detail.assetId);
      if (track) focusTrack(track, { promoteIndex: detail.index });
    };
    window.addEventListener(TIMESTAMP_PROMOTION_EVENT, receive);
    return () => window.removeEventListener(TIMESTAMP_PROMOTION_EVENT, receive);
  }, [orderedTracks, readOnly, onAssetWordsChange, onAssetTimelineStateChange]);
  useEffect(() => {
    const selection = selected ? selectionForTrack(selected) : EMPTY_SELECTION;
    const anchor = selection.anchor;
    if (hasMultipleSelectionRanges(selection)) return;
    if (singleTrackView && anchor != null && selected?.words[anchor]) seek(selected.words[anchor].start);
  // Selection changes seek once; transcript polling must not rewind playback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordSelection?.anchor, selectedTrackId]);

  useEffect(() => {
    setWindowSeconds(Number.POSITIVE_INFINITY);
    setCurrentTime(0); setWindowStart(0); setMarkIn(tracks[0]?.workingRange?.start ?? null); setMarkOut(tracks[0]?.workingRange?.end ?? null); setSelectedSections([]);
    setPlaying(false); setEnvelopes({}); setDetailEnvelopes({}); setError(null);
    audioRefs.current.forEach((audio) => audio.pause());
  }, [parent.id]);

  useEffect(() => {
    setMarkIn(sharedWorkingRange?.start ?? null);
    setMarkOut(sharedWorkingRange?.end ?? null);
  }, [tracks[0]?.id, sharedWorkingRange?.start, sharedWorkingRange?.end]);

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
      const gain = previewGain(id);
      const node = audioGraphRef.current?.nodes.get(id);
      if (node?.element === audio) { node.gain.gain.value = gain; audio.volume = 1; }
      else audio.volume = Math.min(1, gain);
    });
  }, [rate, gains, muted, solo, hasSolo, trackSources]);

  async function preparePlayback() {
    if (typeof AudioContext === "undefined") return;
    try {
      if (!audioGraphRef.current) audioGraphRef.current = { context: new AudioContext(), nodes: new Map() };
      const graph = audioGraphRef.current;
      audioRefs.current.forEach((audio, id) => {
        if (graph.nodes.get(id)?.element === audio) return;
        const source = graph.context.createMediaElementSource(audio);
        const gain = graph.context.createGain();
        gain.gain.value = previewGain(id);
        source.connect(gain); gain.connect(graph.context.destination);
        graph.nodes.set(id, { element: audio, gain });
        audio.volume = 1;
      });
      await graph.context.resume();
    } catch {
      // Browsers without Web Audio still play at the regular 0–100% media volume.
    }
  }
  async function playSelectedTracks() {
    const revision = ++playbackRevision.current;
    const audios = [...audioRefs.current.values()];
    setPlaying(true);
    try {
      await preparePlayback();
      if (revision !== playbackRevision.current) return;
      await Promise.all(audios.map(async (audio) => {
        await audio.play();
        if (![...audioRefs.current.values()].includes(audio)) audio.pause();
      }));
    } catch {
      if (revision !== playbackRevision.current) return;
      audioRefs.current.forEach((audio) => audio.pause()); setPlaying(false);
      setError("Không phát được các track đã chọn.");
    }
  }
  const reconnectPlayback = useRef<() => void>(() => undefined);
  reconnectPlayback.current = () => {
    if (!visibleTracks.length) { setPlaying(false); return; }
    if (!playing) return;
    audioRefs.current.forEach((audio) => { audio.currentTime = currentTime; audio.playbackRate = rate; });
    void playSelectedTracks();
  };
  useEffect(() => reconnectPlayback.current(), [trackSources]);

  useEffect(() => {
    setWindowStart((value) => Math.max(0, Math.min(value, duration - span)));
  }, [duration, span]);

  function seek(seconds: number) {
    const next = Math.max(0, Math.min(duration, seconds));
    setCurrentTime(next);
    if (audioScrubber.active) audioScrubber.move(next);
    else audioRefs.current.forEach((audio) => { audio.currentTime = Math.min(next, Number.isFinite(audio.duration) ? audio.duration : next); });
    if (next < windowStart || next > windowStart + span) setWindowStart(Math.max(0, Math.min(duration - span, next - span / 2)));
  }

  function seekFrom(event: PointerEvent<HTMLElement>, full = false) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width) seek((full ? 0 : windowStart) + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (full ? duration : span));
  }

  function timeFromWave(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(duration, windowStart + Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))) * span));
  }

  function selectionForTrack(track: ProjectMediaAsset): WordSelection {
    const selection = wordSelection ?? EMPTY_SELECTION;
    if (selection.scope && (selection.scope.kind !== "asset" || selection.scope.id !== track.id || selection.scope.revision !== track.updatedAt)) return EMPTY_SELECTION;
    if (!selection.scope && selectedTrackId !== track.id) return EMPTY_SELECTION;
    return selection;
  }

  function scopedSelection(track: ProjectMediaAsset, selection: WordSelection): WordSelection {
    return { ...selection, scope: { kind: "asset", id: track.id, revision: track.updatedAt } };
  }

  function beginWaveSelection(event: PointerEvent<HTMLDivElement>, track: ProjectMediaAsset) {
    if (event.button !== 0 || !(event.ctrlKey || event.metaKey) || !onWordSelectionChange) return false;
    event.preventDefault();
    notifyPlaybackInteraction([track.id]);
    audioRefs.current.forEach((audio) => audio.pause());
    setPlaying(false);
    rangeDragRef.current = { assetId: track.id, start: timeFromWave(event), startX: event.clientX, base: selectionForTrack(track), moved: false };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* pointer stays on the waveform */ }
    return true;
  }

  function moveWaveSelection(event: PointerEvent<HTMLDivElement>, track: ProjectMediaAsset) {
    const drag = rangeDragRef.current;
    if (!drag || drag.assetId !== track.id) return false;
    if (Math.abs(event.clientX - drag.startX) >= 2) drag.moved = true;
    if (drag.moved) onWordSelectionChange?.(scopedSelection(track, selectProductionTime(drag.base, drag.start, timeFromWave(event), track.words, { ctrl: true })));
    return true;
  }

  function endWaveSelection(event: PointerEvent<HTMLDivElement>, track: ProjectMediaAsset, cancelled = false) {
    const drag = rangeDragRef.current;
    if (!drag || drag.assetId !== track.id) return false;
    rangeDragRef.current = null;
    if (cancelled) onWordSelectionChange?.(drag.base);
    else if (drag.moved) onWordSelectionChange?.(scopedSelection(track, selectProductionTime(drag.base, drag.start, timeFromWave(event), track.words, { ctrl: true })));
    else seek(timeFromWave(event));
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    return true;
  }

  async function saveTimelineState(state: TimelineEditState) {
    if (readOnly || busy) return false;
    setBusy(true);
    try {
      if (onAssetTimelineStateChange) {
        for (const track of orderedTracks) await onAssetTimelineStateChange(track.id, state);
      } else if (onCutsChange) {
        const saved = await onCutsChange(ids, state.removedRanges);
        if (!saved) return false;
      } else return false;
      setError(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được chỉnh sửa Timeline cho các channel.");
      return false;
    } finally { setBusy(false); }
  }

  function markWorkingRange(kind: "in" | "out") {
    const nextIn = kind === "in" ? currentTime : markIn;
    const nextOut = kind === "out" ? currentTime : markOut;
    if (kind === "in") setMarkIn(currentTime);
    else setMarkOut(currentTime);
    if (nextIn === null || nextOut === null || nextIn === nextOut) return;
    void saveTimelineState({ removedRanges: sharedCuts, cutPoints: sharedCutPoints,
      workingRange: { id: "working", start: Math.min(nextIn, nextOut), end: Math.max(nextIn, nextOut) } });
  }

  function cutAtPlayhead() {
    if (currentTime <= 0 || currentTime >= duration) return;
    void saveTimelineState({ removedRanges: sharedCuts, workingRange: sharedWorkingRange,
      cutPoints: [...new Set([...sharedCutPoints, currentTime])].sort((a, b) => a - b) });
  }

  function deleteSelectedSections() {
    const selected = sections.filter((section) => selectedSections.includes(section.id));
    if (!selected.length) return;
    const ranges = excludedTimelineRanges(duration, [...sharedCuts, ...selected], null);
    void saveTimelineState({ removedRanges: ranges, workingRange: sharedWorkingRange, cutPoints: sharedCutPoints });
    setSelectedSections([]);
  }

  function uncutSelectedSections() {
    const selected = selectedSections.length ? sections.filter((section) => selectedSections.includes(section.id)) : sections;
    const edges = new Set(selected.flatMap((section) => [section.start, section.end]));
    const removedRanges = selectedSections.length ? restoreTimelineSections(sharedCuts, selected) : [];
    const cutPoints = selectedSections.length ? sharedCutPoints.filter((point) => !edges.has(point)) : [];
    void saveTimelineState({ removedRanges, workingRange: sharedWorkingRange, cutPoints });
    setSelectedSections([]);
  }

  function resetTimelineEdits() {
    void saveTimelineState({ removedRanges: [], workingRange: null, cutPoints: [] });
    setMarkIn(null); setMarkOut(null); setSelectedSections([]);
  }

  function beginScrub(event: PointerEvent<HTMLElement>, full = false) {
    if (event.button !== 0) return;
    notifyPlaybackInteraction(ids);
    audioScrubber.begin([...audioRefs.current.values()], (time) => !excludedRanges.some((range) => range.start <= time && time < range.end),
      (time) => Math.min(duration, ...excludedRanges.filter((range) => range.start > time).map((range) => range.start)));
    setPlaying(false);
    void preparePlayback();
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekFrom(event, full);
  }

  function endScrub(event: PointerEvent<HTMLElement>, full = false) {
    if (!scrubbingRef.current) return;
    seekFrom(event, full);
    scrubbingRef.current = false;
    audioScrubber.end();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function cancelScrub(event: PointerEvent<HTMLElement>) {
    scrubbingRef.current = false;
    audioScrubber.end();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
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

  const zoomValue = timelineZoomPosition(duration, span, minSpan);
  const zoomResolution = timelineZoomResolution(span, waveWidth);

  const playhead = (currentTime - windowStart) / span * 100;
  if (editFocus) {
    const track = orderedTracks.find((item) => item.id === editFocus.assetId);
    if (track) return <Timeline onUndo={onUndo} onRedo={onRedo} rangeSelectionEnabled
      onWordSelectionChange={(selection) => onWordSelectionChange?.(scopedSelection(track, selection))}
      editRequest={editFocus.request}
      gain={previewPercentToDb(previewGain(track.id) * 100)}
      onGainChange={(value) => {
        setMuted((current) => ({ ...current, [track.id]: false }));
        setGains((current) => ({ ...current, [track.id]: previewDbToPercent(value) }));
      }}
      onEditStateChange={(state) => { void (async () => { for (const item of orderedTracks) await onAssetTimelineStateChange?.(item.id, state); })().catch((reason) => setError(reason instanceof Error ? reason.message : "Không lưu được chỉnh sửa Timeline cho các channel.")); }}
      onWordsChange={(words, text) => onAssetWordsChange?.(track.id, words, text)}
      speakers={speakers}
      take={{ id: track.id, name: track.name, url: track.url ?? undefined, duration: track.duration, text: track.text, words: track.words }}
      workingRange={track.workingRange ?? null} removedRanges={track.removedRanges ?? []} cutPoints={track.cutPoints ?? []}
      wordSelection={selectionForTrack(track)}
      leadingActions={<>{error ? <span role="alert">{error}</span> : null}<button onClick={() => { setError(null); setEditFocus(null); }} type="button">← TẤT CẢ CHANNEL</button></>}
    />;
  }

  return <ModuleFrame elementRef={moduleRef} title="Timeline" eyebrow={`${orderedTracks.length} CHANNEL · ${parent.name}`} index="A1" tone="dark" className="timeline-module obs-timeline imported-timeline"
    action={<div className="timeline-header-actions obs-timeline__header-actions">
      <div aria-label="Kiểu hiển thị Timeline" className="obs-timeline__layout" role="group">
        <button aria-pressed={layout === "columns"} onClick={() => setLayout("columns")} type="button">CỘT</button>
        <button aria-pressed={layout === "layers"} onClick={() => setLayout("layers")} type="button">LAYER</button>
      </div>
      <div className="timeline-edit-actions" role="group" aria-label="Timeline edit actions">
        <button disabled={readOnly || busy || !duration} onClick={() => markWorkingRange("in")} type="button">MARK IN</button>
        <button disabled={readOnly || busy || !duration} onClick={() => markWorkingRange("out")} type="button">MARK OUT</button>
        <button disabled={readOnly || busy || currentTime <= 0 || currentTime >= duration} onClick={cutAtPlayhead} type="button">CUT</button>
        <button disabled={readOnly || busy || (!sharedCuts.length && !sharedCutPoints.length)} onClick={uncutSelectedSections} type="button">UNCUT</button>
        <button className="is-delete" disabled={readOnly || busy || !selectedSections.length} onClick={deleteSelectedSections} type="button">DELETE</button>
        <button disabled={readOnly || busy || (!sharedCuts.length && !sharedCutPoints.length && !sharedWorkingRange)} onClick={resetTimelineEdits} type="button">RESET</button>
      </div>
      <div aria-label="Zoom Timeline" className="timeline-zoom obs-timeline__zoom" role="group">
        <button aria-label="Thu nhỏ Timeline" disabled={!duration || span >= duration} onClick={() => selectZoom(span * 2)} type="button">−</button>
        <input aria-label="Zoom timeline" aria-valuetext={zoomResolution} disabled={!duration || duration <= minSpan}
          max={TIMELINE_ZOOM_STEPS} min={0} onChange={(event) => selectZoom(timelineSpanAtZoomPosition(Number(event.target.value), duration, minSpan))}
          type="range" value={zoomValue} />
        <span title={`Cửa sổ ${span}s`}>{zoomResolution}</span>
        <button aria-label="Phóng to Timeline" disabled={!duration || span <= minSpan} onClick={() => selectZoom(span / 2)} type="button">+</button>
      </div>
    </div>}>
    <div className="obs-timeline__main">
      {error ? <p className="obs-timeline__error" role="alert">{error}</p> : null}
      <div className="obs-timeline__viewport" ref={viewportRef}>
        <div aria-label="Timeline đa kênh import" className={`obs-timeline__track-scroll is-${layout}`}
          style={{ "--obs-layer-height": `${Math.max(110, Math.round(viewportHeight * .6))}px` } as CSSProperties}>
          {layout === "layers" ? <><div className="obs-timeline__label-spacer" /><div aria-label="Ruler chung" className="obs-timeline__ruler"
            onPointerDown={(event) => beginScrub(event)} onPointerMove={(event) => { if (scrubbingRef.current) seekFrom(event); }} onPointerUp={(event) => endScrub(event)} onPointerCancel={cancelScrub}>
            {commonRulerMarks.map((mark) => <span key={mark.time} style={{ left: `${mark.position * 100}%` }}>{mark.label}</span>)}
          </div></> : null}
          {visibleTracks.map((track) => {
            const index = orderedTracks.findIndex((item) => item.id === track.id);
            const subtitleLaneWidth = layout === "columns"
              ? columnWidths[track.id] ?? Math.max(240, (viewportWidth - 12 - 6 * Math.max(0, visibleTracks.length - 1)) / Math.max(1, visibleTracks.length))
              : Math.max(240, viewportWidth - 140);
            const laneRulerMarks = layout === "columns"
              ? visibleRulerMarks(duration, windowStart, span, subtitleLaneWidth)
              : commonRulerMarks;
            const trackName = track.name.startsWith(`${parent.name} · `) ? track.name.slice(parent.name.length + 3) : track.name;
            const overview = envelopes[track.id];
            const detail = detailEnvelopes[track.id];
            const envelope = detail && (detail.start ?? 0) <= windowStart + .01 && (detail.end ?? detail.duration) >= windowStart + span - .01 ? detail : overview;
            const point = overview?.points[Math.min((overview.points.length || 1) - 1, Math.floor(currentTime / (overview.duration || 1) * overview.points.length))];
            const level = Math.round(Math.max(Math.abs(point?.min ?? 0), Math.abs(point?.max ?? 0)) * 100);
            const trackSelection = selectionForTrack(track);
            const selectedWordIndexes = new Set(trackSelection.indexes);
            const selectedRanges = productionRanges(trackSelection, track.words);
            return <div className="obs-timeline__lane" key={track.id} style={layout === "columns" ? { width: columnWidths[track.id] ?? `max(240px, calc((100% - 12px - ${(visibleTracks.length - 1) * 6}px) / ${visibleTracks.length}))` } : undefined}>
              <button aria-pressed={selected?.id === track.id} className="obs-timeline__lane-label" onClick={() => onSelectTrack(track.id)} type="button">
                <TimelineLaneLabel text={`Channel ${index + 1} - ${trackName}`} title={track.name} />
              </button>
              {layout === "columns" ? <div className="obs-timeline__column-ruler obs-timeline__ruler" onPointerDown={(event) => beginScrub(event)} onPointerMove={(event) => { if (scrubbingRef.current) seekFrom(event); }} onPointerUp={(event) => endScrub(event)} onPointerCancel={cancelScrub}>{laneRulerMarks.map((mark) => <span key={mark.time} style={{ left: `${mark.position * 100}%` }}>{mark.label}</span>)}</div> : null}
              <div aria-label={`Waveform Channel ${index + 1}`} className="obs-timeline__wave" ref={selected?.id === track.id ? selectedWaveRef : undefined} onPointerDown={(event) => { if (!beginWaveSelection(event, track)) beginScrub(event); }} onPointerMove={(event) => { if (!moveWaveSelection(event, track) && scrubbingRef.current) seekFrom(event); }} onPointerUp={(event) => { if (!endWaveSelection(event, track)) endScrub(event); }} onPointerCancel={(event) => { if (!endWaveSelection(event, track, true)) cancelScrub(event); }}>
                <svg aria-hidden="true" className="timeline-waveform__svg" preserveAspectRatio="none" viewBox="0 0 1000 60"><path d={waveformPath(envelope, windowStart, span, muted[track.id] ? 0 : (gains[track.id] ?? 100) / 100)} /></svg>
                {selectedRanges.map((range) => {
                  const style = intervalStyle(range.start, range.end, windowStart, span);
                  const visibleRange = { ...range, start: Math.max(0, range.start - windowStart), end: Math.min(span, range.end - windowStart) };
                  const bounds = rangeReadoutBounds(visibleRange, span, subtitleLaneWidth, 0, subtitleLaneWidth);
                  return style ? <div aria-label={`Vùng chọn ${range.start.toFixed(3)} đến ${range.end.toFixed(3)} giây`} className="imported-selection-range" key={range.id} style={style}>
                    <div className="imported-selection-readout" style={{ left: bounds.left, width: bounds.width }}><span>START <b>{range.start.toFixed(3)}s</b></span><span>DURATION <b>{(range.end - range.start).toFixed(3)}s</b></span><span>END <b>{range.end.toFixed(3)}s</b></span></div>
                  </div> : null;
                })}
                {excludedRanges.map((range) => { const style = intervalStyle(range.start, range.end, windowStart, span); return style ? <i aria-label="Đoạn đã loại khỏi tính toán" className="timeline-removed-range" key={`${range.id}-${range.start}`} style={style} /> : null; })}
                {sharedCutPoints.map((point) => point >= windowStart && point <= windowStart + span ? <i aria-label="Điểm cắt" className="timeline-cut-point" key={point} style={{ left: `${(point - windowStart) / span * 100}%` }} /> : null)}
                {layout === "columns" && playhead >= 0 && playhead <= 100 ? <i aria-label={`Playhead Channel ${index + 1}`} className="obs-timeline__playhead obs-timeline__column-playhead" style={{ left: `${playhead}%` }} /> : null}
                {markIn !== null ? <i aria-label="Mark In" className="obs-timeline__mark" style={{ left: `${(markIn - windowStart) / span * 100}%` }} /> : null}
                {markOut !== null ? <i aria-label="Mark Out" className="obs-timeline__mark" style={{ left: `${(markOut - windowStart) / span * 100}%` }} /> : null}
              </div>
              <div aria-label={`Subtitle Channel ${index + 1}`} className="obs-timeline__caption imported-timeline__words"
                onDoubleClick={(event) => { if ((event.target as HTMLElement).closest("button, input")) return; const rect = event.currentTarget.getBoundingClientRect(); const time = windowStart + (event.clientX - rect.left) / Math.max(1, rect.width) * span; const index = subtitleIndexAtTime(track.words, time); const word = track.words[index]; focusTrack(track, word && word.start <= time && time < word.end ? { wordIndex: index } : { insertTime: time }); }}
                onContextMenu={(event) => { if ((event.target as HTMLElement).closest("button, input")) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); focusTrack(track, { contextTime: windowStart + (event.clientX - rect.left) / Math.max(1, rect.width) * span }); }}
                onPointerDown={(event) => { if (event.button !== 1 || event.target !== event.currentTarget) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const promoteIndex = subtitleIndexAtTime(track.words, windowStart + (event.clientX - rect.left) / Math.max(1, rect.width) * span); if (promoteIndex >= 0) focusTrack(track, { promoteIndex }); }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = rect.width ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
                  const time = Math.max(0, Math.min(duration, windowStart + ratio * span));
                  if (event.ctrlKey || event.metaKey) focusTrack(track, { insertTime: time });
                  else { const wordIndex = subtitleIndexAtTime(track.words, time); if (wordIndex >= 0) seek(track.words[wordIndex].start); }
                }}>
                {track.words.length ? visibleSubtitleWordLayout(track.words, windowStart, span, subtitleLaneWidth,
                  [subtitleIndexAtTime(track.words, currentTime)]).map((layout) => {
                  const wordIndex = layout.sourceIndex;
                  const word = track.words[wordIndex];
                  const style = { left: `${(layout.leftPixels / subtitleLaneWidth) * 100}%`, width: `${(layout.widthPixels / subtitleLaneWidth) * 100}%` };
                  return style ? <button key={wordIndex} type="button" style={style}
                    aria-label={`${word.text} · ${clock(word.start)}–${clock(word.end)}`}
                    title={`${word.text} · ${word.start.toFixed(3)}–${word.end.toFixed(3)}s${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`}
                    className={`imported-timeline__word ${layout.isCompact ? "is-compact" : ""} ${word.start <= currentTime && word.end > currentTime ? "is-active" : ""} ${selectedWordIndexes.has(wordIndex) ? "is-selected" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""}`}
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey) {
                        event.preventDefault(); event.stopPropagation();
                        const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                        const ratio = rect ? Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))) : 0;
                        focusTrack(track, { insertTime: Math.max(0, Math.min(duration, windowStart + ratio * span)) });
                      }
                      else {
                        onWordSelectionChange?.(scopedSelection(track, selectProductionWord(trackSelection, wordIndex, track.words)));
                        seek(word.start);
                      }
                    }}
                    onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); focusTrack(track, { wordIndex }); }}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.parentElement?.getBoundingClientRect(); const time = rect ? windowStart + Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))) * span : word.start; focusTrack(track, { contextIndex: wordIndex, contextTime: time }); }}
                    onPointerDown={(event) => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); focusTrack(track, { promoteIndex: wordIndex }); } }}
                    >{word.text}</button> : null;
                }) : <span>{track.text ? "Transcript chưa có word timestamp" : "Chưa có lời nói"}</span>}
                {excludedRanges.map((range) => { const style = intervalStyle(range.start, range.end, windowStart, span); return style ? <i aria-hidden="true" className="timeline-removed-range" key={`caption-${range.id}-${range.start}`} style={style} /> : null; })}
              </div>
              <div className="obs-timeline__lane-controls">
                <div className="obs-timeline__gain"><div className="obs-timeline__gain-label"><span>GAIN</span><button aria-label={`${muted[track.id] ? "Bật tiếng" : "Tắt tiếng"} Channel ${index + 1}`} aria-pressed={Boolean(muted[track.id])} className="obs-timeline__mute" onClick={() => setMuted((current) => ({ ...current, [track.id]: !current[track.id] }))} title={muted[track.id] ? "Bật tiếng track" : "Tắt tiếng track"} type="button">M</button>
                  <button aria-label={`${solo[track.id] ? "Bỏ Solo" : "Solo"} Channel ${index + 1}`} aria-pressed={Boolean(solo[track.id])}
                    className="obs-timeline__mute obs-timeline__solo" onClick={() => setSolo((current) => ({ ...current, [track.id]: !current[track.id] }))}
                    title="Chỉ nghe các track đang Solo trong selection; Mute vẫn có hiệu lực" type="button">S</button>
                </div><input aria-label={`Gain Channel ${index + 1}`} max="200" min="0" onChange={(event) => setGains((current) => ({ ...current, [track.id]: Number(event.target.value) }))} type="range" value={gains[track.id] ?? 100} /><output>{gains[track.id] ?? 100}%</output></div>
                <div aria-label={`Level Channel ${index + 1}`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={level} className="obs-timeline__level" role="meter"><span>LEVEL</span><div><i style={{ "--source-level": `${level}%` } as CSSProperties} /></div><output>{level}%</output></div>
              </div>
              {layout === "columns" && visibleTracks.indexOf(track) < visibleTracks.length - 1 ? <div aria-label={`Đổi độ rộng Channel ${index + 1}`} className="obs-timeline__column-resizer" onPointerDown={(event) => { event.stopPropagation(); resizeColumn(track.id, event); }} role="separator" tabIndex={0} /> : null}
            </div>;
          })}
          {layout === "layers" && playhead >= 0 && playhead <= 100 ? <div className="obs-timeline__playhead-layer"><i aria-label="Playhead chung" className="obs-timeline__playhead" style={{ left: `${playhead}%` }} /></div> : null}
        </div>
      </div>
      {duration > 0 ? <div aria-label="Các đoạn Timeline" className="timeline-section-strip">
        {sections.map((section) => {
          const removed = excludedRanges.some((range) => range.start <= section.start && range.end >= section.end);
          const selectedSection = selectedSections.includes(section.id);
          return <button aria-label={`Đoạn ${clock(section.start)}–${clock(section.end)}${removed ? " đã loại" : ""}`} aria-pressed={selectedSection}
            className={`${selectedSection ? "is-selected" : ""} ${removed ? "is-removed" : ""}`}
            key={section.id} onClick={(event) => setSelectedSections((current) => event.ctrlKey || event.metaKey
              ? current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id]
              : [section.id])} style={{ flex: `${Math.max(.001, section.end - section.start)} 1 0` }} type="button" />;
        })}
      </div> : null}
      <div className="transport-bar obs-timeline__transport">
        <button aria-label={playing ? "Tạm dừng footage" : "Phát footage"} className="transport-button" disabled={!selected?.url} onClick={() => {
          audioScrubber.end(); if (playing) { ++playbackRevision.current; audioRefs.current.forEach((audio) => audio.pause()); setPlaying(false); }
          else {
            const startAt = nextPlayableTime(currentTime, duration, excludedRanges);
            if (startAt >= duration) { setCurrentTime(duration); return; }
            seek(startAt);
            audioRefs.current.forEach((audio) => { audio.currentTime = startAt; audio.playbackRate = rate; });
            void playSelectedTracks();
          }
        }} type="button"><Icon name={playing ? "pause" : "play"} /></button>
        <code>{clock(currentTime)}</code>
        <div aria-label="Thanh tiến trình Timeline — bấm hoặc kéo để tua" className="transport-progress obs-timeline__scrub" onPointerDown={(event) => beginScrub(event, true)} onPointerMove={(event) => { if (scrubbingRef.current) seekFrom(event, true); }} onPointerUp={(event) => endScrub(event, true)} onPointerCancel={cancelScrub}><i style={{ width: `${duration ? currentTime / duration * 100 : 0}%` }} /><b style={{ left: `${duration ? currentTime / duration * 100 : 0}%` }} /></div>
        <code>{clock(duration)}</code>
        <label className="transport-rate"><span>RATE</span><select aria-label="Tốc độ phát" onChange={(event) => setRate(Number(event.target.value))} value={rate}>{[.5, .75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
        <div className="obs-timeline__transport-extras"><span>{selected?.name ?? "Chưa có channel"}</span></div>
      </div>
    </div>
    {visibleTracks.map((track) => track.url ? <audio key={track.id} onEnded={() => {
      if (audioScrubber.active) return;
      if (track.id === visibleTracks[0]?.id) { audioRefs.current.forEach((audio) => audio.pause()); setPlaying(false); }
    }} onTimeUpdate={(event) => {
      if (audioScrubber.active || track.id !== visibleTracks[0]?.id) return;
      const time = event.currentTarget.currentTime;
      const playable = nextPlayableTime(time, duration, excludedRanges);
      const next = playable > time + .001 ? playable : time;
      if (next >= duration) { audioRefs.current.forEach((audio) => audio.pause()); setPlaying(false); }
      setCurrentTime(next);
      setWindowStart((start) => next <= start + span ? start : Math.min(Math.max(0, duration - span), next - span / 2));
      audioRefs.current.forEach((audio, id) => { if (Math.abs(audio.currentTime - next) > .08) audio.currentTime = next; });
    }} onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(currentTime, event.currentTarget.duration || currentTime); }}
      preload="none" ref={audioCallback(track.id)} src={track.url} /> : null)}
  </ModuleFrame>;
}
