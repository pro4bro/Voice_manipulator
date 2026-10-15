import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type UIEvent } from "react";

import { notifyPlaybackInteraction, publishPlaybackWord } from "../../domain/playback-sync";
import { editableWordTimings } from "../../domain/editable-word-timing";
import { excludedTimelineRanges, nextPlayableTime, restoreTimelineSections, timelineSections, type TimelineEditState } from "../../domain/timeline-editing";
import { TIMESTAMP_PROMOTION_EVENT, promoteTimestampWord, type TimestampPromotion } from "../../domain/timestamp-promotion";
import { useAudioScrubber } from "./audio-scrubbing";
import { createPortal } from "react-dom";
import { useScriptShortcuts } from "../script/script-shortcuts";
import "./timeline-editing.css";
import "./subtitle-density.css";
import { replaceScriptWord, insertScriptTextAtWordBoundary } from "../script/script-text-reconciliation";
import { useScriptWordDeletion } from "../script/use-script-word-deletion";
import { buildAutoCalibrationKeyframes, dbToLinear, gainAtTime } from "./gain-automation";
import { EMPTY_SELECTION, selectWord, sweepTo, type WordSelection } from "../../domain/word-selection";
import { hasMultipleSelectionRanges, productionRanges, rangeReadoutBounds, selectProductionTime, selectProductionWord, sweepProductionWords } from "../../domain/production-selection";
import "./production-selection.css";
import { SelectionMarkers } from "../../ui/SelectionMarkers";
import { StretchHandles } from "./StretchHandles";
import { inverseStretch, mapStretchSelection, mapStretchTime, type StretchOperation } from "../../domain/voice-edits";
import { rulerMarks } from "./ruler";
import { waveformY } from "./waveform-path";
import { acousticEdges, applyWordDrag, assignWordInterval, timingCollisionIndexes, type WordDragMode } from "./word-timing";
import { visibleSubtitleWordLayout } from "./subtitle-density";
import type { RecordingWaveformPreview, SpeakerProfile, StudioWord, TimelineEditRange, TimelineGainKeyframe, WordTimingQuality } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { minimumTimelineSpan, timelineSpanAtZoomPosition, timelineZoomPosition, timelineZoomResolution } from "./zoom";

export interface ActiveTake {
  id?: string;
  name: string;
  url?: string;
  duration: number;
  text?: string;
  words?: StudioWord[];
  wordTimingQuality?: WordTimingQuality;
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
  requestedDensity: number;
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
  voiceEdits?: import("../../domain/voice-edits").VoiceEditController;
  navigation?: import("../../domain/reference-bindings").ProductionNavigation | null;
  rangeSelectionEnabled?: boolean;
  onReferenceContext?: (request: import("../../domain/reference-bindings").ReferenceContextRequest) => void;
  take: ActiveTake | null;
  gain: number;
  recordingPreview?: RecordingWaveformPreview | null;
  removedRanges?: TimelineEditRange[];
  workingRange?: TimelineEditRange | null;
  cutPoints?: number[];
  onEditStateChange?: (state: TimelineEditState) => void;
  editRequest?: { wordIndex?: number; insertTime?: number; promoteIndex?: number; contextIndex?: number; contextTime?: number; serial: number } | null;
  gainKeyframes?: TimelineGainKeyframe[];
  onGainChange: (value: number) => void;
  onRemovedRangesChange?: (ranges: TimelineEditRange[]) => void;
  onGainKeyframesChange?: (keyframes: TimelineGainKeyframe[]) => void;
  speakers?: SpeakerProfile[];
  onWordsChange?: (words: StudioWord[], text?: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
  /** Page-specific controls ahead of the edit tools, such as recording in Voice Changer. */
  leadingActions?: ReactNode;
  /** Replaces the take name above the waveform while something live is happening. */
  liveCaption?: string | null;
  /** What an empty timeline says; each page fills it with what would fill it. */
  emptyNote?: { title: string; hint: string };
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];
const PATH_WIDTH = 12000;
const PATH_HEIGHT = 100;
const GAIN_PREVIEW_DIVISIONS = 12;
const GAIN_PREVIEW_PARTS = [1, 5, 9];
const AUTO_CALIBRATE_CEILING = 10 ** (-1 / 20);
const MAX_GAIN_RANGES = 96;
const CLOCK_STATE_INTERVAL_MS = 80;
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
  const coordinate = (point: EnvelopePoint, index: number, edge: "min" | "max") => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * PATH_WIDTH;
    const peak = Math.max(Math.abs(point.min * gain), Math.abs(point.max * gain));
    const calibration = autoCalibrate && peak > AUTO_CALIBRATE_CEILING
      ? AUTO_CALIBRATE_CEILING / peak
      : 1;
    const value = Math.max(-1, Math.min(1, point[edge] * gain * calibration));
    return { x, y: waveformY(value, PATH_HEIGHT) };
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
  return editableWordTimings(words, duration);
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
  voiceEdits,
  navigation,
  take,
  gain,
  recordingPreview = null,
  removedRanges = [],
  workingRange = null,
  cutPoints = [],
  onEditStateChange,
  editRequest = null,
  gainKeyframes = [],
  onGainChange,
  onRemovedRangesChange,
  onGainKeyframesChange,
  speakers = [],
  onWordsChange,
  onUndo,
  onRedo,
  wordSelection = EMPTY_SELECTION,
  onWordSelectionChange,
  rangeSelectionEnabled = false,
  onReferenceContext,
  leadingActions = null,
  liveCaption = null,
  emptyNote,
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
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [promotedIndex, setPromotedIndex] = useState<number | null>(null);
  const promotedRef = useRef<number | null>(null);
  const promotionDragRef = useRef<{ start: number; index: number } | null>(null);
  const pendingPromotionRef = useRef<number | null>(null);
  const [collisionIndexes, setCollisionIndexes] = useState<number[]>([]);
  const [promotionNote, setPromotionNote] = useState<{ x: number; y: number; text: string } | null>(null);
  const promotionNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wordEditor, setWordEditor] = useState<{ index: number | null; time: number; text: string } | null>(null);
  const wordEditorRef = useRef(wordEditor);
  wordEditorRef.current = wordEditor;
  const moduleRef = useRef<HTMLElement>(null);
  useScriptShortcuts(moduleRef, {
    undo: voiceEdits?.packet?.document.cursor ? () => void navigateStretchHistory("undo") : onUndo ? () => { commitWordEditor(); cancelWordGesture(); (document.activeElement as HTMLElement | null)?.blur?.(); onUndo(); } : undefined,
    redo: voiceEdits?.packet && voiceEdits.packet.document.cursor < voiceEdits.packet.document.operations.length ? () => void navigateStretchHistory("redo") : onRedo ? () => { commitWordEditor(); cancelWordGesture(); (document.activeElement as HTMLElement | null)?.blur?.(); onRedo(); } : undefined,
  }, ".timeline-module");
  useEffect(() => { hidePromotionNote(); }, [promotedIndex, take?.id]);
  useEffect(() => () => { if (promotionNoteTimer.current) clearTimeout(promotionNoteTimer.current); }, []);
  const [draftGain, setDraftGain] = useState(gain);
  const [isGainPreviewing, setIsGainPreviewing] = useState(false);
  const [autoCalibrate, setAutoCalibrate] = useState(false);
  const [timelineCanvasWidth, setTimelineCanvasWidth] = useState(0);
  const [timelineViewport, setTimelineViewport] = useState({ left: 0, width: 0 });
  const [speakerMenu, setSpeakerMenu] = useState<{ indexes: number[]; time: number; x: number; y: number } | null>(null);
  const [insertionError, setInsertionError] = useState<string | null>(null);
  const selectedWordIndexes = useMemo(() => new Set(wordSelection.indexes), [wordSelection.indexes]);
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
  const stretchTransportRef = useRef<{ sourceTime: number; wasPlaying: boolean; time: number; url: string; complete: boolean } | null>(null);
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
  const audioScrubber = useAudioScrubber(take?.url);
  const gainInteractionRef = useRef(false);
  // A sweep is measured from where it began, against the selection as it stood
  // then, so dragging back over the run shrinks it instead of piling up.
  const sweepOriginRef = useRef<number | null>(null);
  const sweepBaseRef = useRef<WordSelection>(EMPTY_SELECTION);
  const selectionRef = useRef(wordSelection);
  const rangeDragRef = useRef<{ x: number; start: number; base: WordSelection; moved: boolean; modifiers: { ctrl: boolean; shift: boolean; alt: boolean } } | null>(null);
  selectionRef.current = wordSelection;
  // Pointer moves fire faster than React renders, so the in-progress edit lives
  // in a ref and only the preview is state.
  const wordDragRef = useRef<{ mode: WordDragMode; indexes: number[]; originX: number; pixelsPerSecond: number; moved: boolean } | null>(null);
  const [draftWords, setDraftWords] = useState<StudioWord[] | null>(null);
  // pointerup must read the newest draft; state would still be a render behind.
  const draftWordsRef = useRef<StudioWord[] | null>(null);
  const wordSelectionDraggingRef = useRef(false);
  const isRecording = Boolean(recordingPreview?.active);
  const rawWords = take?.words ?? [];
  // Spreading 47,000 arguments into Math.max ran on every render and risks a
  // call-stack overflow at that size.
  const lastWordEnd = useMemo(() => {
    let latest = 0;
    for (const word of rawWords) if (word.end > latest) latest = word.end;
    return latest;
  }, [rawWords]);
  const sourceDuration = isRecording
    ? Math.max(0.1, recordingPreview?.duration ?? 0)
    : mediaDuration || decodedDuration || take?.duration || lastWordEnd;
  const duration = sourceDuration || 10;
  const words = useMemo(() => editableWordTimings(rawWords, duration), [rawWords, duration]);
  const subtitleText = useMemo(() => take?.text ?? words.map((word) => word.text).join(" "), [take?.text, words]);
  const wordDeletion = useScriptWordDeletion(take?.id ?? null, subtitleText, words, (edit) => {
    onWordsChange?.(edit.words, edit.text);
    cancelWordGesture();
    onWordSelectionChange?.(EMPTY_SELECTION);
  });
  const excludedRanges = useMemo(() => excludedTimelineRanges(duration, removedRanges, workingRange), [duration, removedRanges, workingRange]);
  const sections = useMemo(() => timelineSections(duration, cutPoints), [duration, cutPoints]);
  const timingIsTrusted = Boolean(take && words.length);
  const timingUnavailable = Boolean(take && !timingIsTrusted && (words.length || take.wordTimingNote));
  // W2 keeps reviewable intervals visible. The asset summary blocks only the
  // unsafe >=5% case; individual bad words carry their own warning class.
  const editableWords = draftWords ?? words;
  const displayWords = useMemo(() => normalizeWordTimings(editableWords, duration), [duration, editableWords]);
  const speakerById = useMemo(() => new Map(speakers.map((speaker) => [speaker.id, speaker])), [speakers]);
  const ticks = useMemo(() => rulerMarks(duration, timelineCanvasWidth, timelineViewport), [duration, timelineCanvasWidth, timelineViewport]);
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
  // Snap targets read off the drawn waveform, so an edge lands where the wave is
  // seen to start rather than where a model thinks it does.
  const snapEdges = useMemo(
    () => (isRecording || !detailEnvelope ? [] : acousticEdges(detailEnvelope)),
    [detailEnvelope, isRecording],
  );
  const latestPreview = visibleEnvelope[visibleEnvelope.length - 1];
  const latestPreviewPeak = latestPreview ? Math.max(Math.abs(latestPreview.min), Math.abs(latestPreview.max)) : 0;
  const previewDb = latestPreviewPeak > 0.0001 ? Math.min(96, Math.max(-96, 20 * Math.log10(latestPreviewPeak) + gain)) : -96;
  const activeSignalDb = isRecording ? previewDb : signalDb;
  const activePeakDb = isRecording ? Math.max(peakDb, previewDb) : peakDb;
  const meterPercent = Math.min(100, Math.max(0, ((activeSignalDb + 96) / 192) * 100));
  const peakPercent = Math.min(100, Math.max(0, ((activePeakDb + 96) / 192) * 100));
  const activeWordIndex = isRecording || !timingIsTrusted ? -1 : activeWordAt(displayWords, currentTime);
  // Render original word boxes by screen-space density. Their timestamps still
  // drive hit testing and edits; compact boxes only receive a four-pixel view.
  const wordTrackCanvasWidth = timelineCanvasWidth || 1000;
  const wordTrackViewportWidth = timelineViewport.width || Math.min(wordTrackCanvasWidth, 1000);
  const wordTrackLayout = useMemo(() => {
    if (!displayWords.length || isRecording || !timingIsTrusted) return [];
    const start = (timelineViewport.left / wordTrackCanvasWidth) * duration;
    const span = (wordTrackViewportWidth / wordTrackCanvasWidth) * duration;
    return visibleSubtitleWordLayout(displayWords, start, span, wordTrackViewportWidth,
      [...wordSelection.indexes.slice(-8), activeWordIndex, promotedIndex ?? -1, wordEditor?.index ?? -1, ...collisionIndexes]);
  }, [activeWordIndex, displayWords, duration, isRecording, promotedIndex, timingIsTrusted, timelineViewport,
    wordEditor?.index, wordSelection.indexes, wordTrackCanvasWidth, wordTrackViewportWidth, collisionIndexes]);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));
  const timelineNavigator = useMemo(() => {
    const visible = Math.max(0, timelineViewport.width);
    const total = Math.max(visible, timelineCanvasWidth);
    const maxScroll = Math.max(0, total - visible);
    const width = total > 0 ? Math.min(100, (visible / total) * 100) : 100;
    const left = maxScroll > 0 ? Math.max(0, Math.min(100 - width, (timelineViewport.left / maxScroll) * (100 - width))) : 0;
    return { left, width, enabled: maxScroll > 0.5 };
  }, [timelineCanvasWidth, timelineViewport]);

  // Selecting words is also how the user says "start here": the playhead moves to
  // the front of the selection, so Play begins there whichever module the words
  // were picked in. Only while paused - moving it mid-playback would fight the
  // person listening.
  useEffect(() => {
    if (playing || wordDragRef.current || rangeDragRef.current || hasMultipleSelectionRanges(wordSelection) || !wordSelection.indexes.length) return;
    const first = displayWords[wordSelection.indexes[0]];
    if (!first) return;
    setCurrentTime(first.start);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = first.start;
      syncPlaybackClock(audio);
    }
  }, [wordSelection.indexes]);

  useEffect(() => {
    if (!navigation || navigation.scope.kind !== "voice-output" || navigation.scope.id !== take?.id || navigation.start === null) return;
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    const width = timelinePixelWidthRef.current || scroller.scrollWidth;
    scroller.scrollLeft = Math.max(0, Math.min(width - scroller.clientWidth, navigation.start / Math.max(duration, .001) * width - scroller.clientWidth * .25));
    setTimelineViewport({ left: scroller.scrollLeft, width: scroller.clientWidth });
  }, [navigation, take?.id, duration]);

  // A selection made in Script has to be reachable here without hunting for it.
  useEffect(() => {
    const scroller = timelineScrollRef.current;
    const anchor = wordSelection.anchor;
    if (!scroller || anchor === null || wordDragRef.current || rangeDragRef.current || hasMultipleSelectionRanges(wordSelection)) return;
    const word = displayWords[anchor];
    if (!word) return;
    const width = timelinePixelWidthRef.current || scroller.scrollWidth;
    const centre = ((word.start + word.end) / 2 / Math.max(duration, 0.001)) * width;
    const visible = (centre - scroller.scrollLeft) / Math.max(scroller.clientWidth, 1);
    if (visible >= 0.1 && visible <= 0.9) return;
    scroller.scrollLeft = Math.max(0, Math.min(width - scroller.clientWidth, centre - scroller.clientWidth / 2));
  }, [wordSelection.anchor]);

  useEffect(() => {
    sweepOriginRef.current = null;
    rangeDragRef.current = null;
    sweepBaseRef.current = EMPTY_SELECTION;
    wordSelectionDraggingRef.current = false;
  }, [take?.id, take?.url]);

  useEffect(() => {
    const moveWordSelection = (event: globalThis.PointerEvent) => extendWordSelectionAtPoint(event.clientX, event.clientY, modifiersOf(event));
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
    // Zoom, duration metadata and data refreshes are browsing operations. Only
    // a changed playback/seek position may move the viewport to the playhead.
  }, [currentTime]);

  useEffect(() => {
    stopPlaybackClock();
    setZoom(1);
    if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft = 0;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    wordEditorRef.current = null;
    setWordEditor(null);
    setSpeakerMenu(null);
    setInsertionError(null);
    setCurrentTime(0);
    setPlaying(false);
    setDecodedDuration(0);
    setMediaDuration(0);
    setDetailEnvelope(null);
    setDetailWaveformState("idle");
    setMarkIn(workingRange?.start ?? null);
    setMarkOut(workingRange?.end ?? null);
    setStagedCut(null);
    setSelectedSections([]);
    promoteTimestampWord(null, null);
  }, [take?.id]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<TimestampPromotion>).detail;
      const requested = detail.assetId === (take?.id ?? null) ? detail.index : null;
      const index = requested !== null && requested === promotedRef.current ? null : requested;
      promotedRef.current = index;
      setPromotedIndex(index);
    };
    window.addEventListener(TIMESTAMP_PROMOTION_EVENT, receive);
    return () => window.removeEventListener(TIMESTAMP_PROMOTION_EVENT, receive);
  }, [take?.id]);

  useEffect(() => {
    if (!editRequest) return;
    if (editRequest.promoteIndex !== undefined) promoteTimestampWord(take?.id ?? null, editRequest.promoteIndex);
    if (editRequest.contextTime !== undefined || (editRequest.contextIndex !== undefined && words[editRequest.contextIndex])) {
      const bounds = wordTrackRef.current?.getBoundingClientRect();
      openSpeakerMenu(editRequest.contextIndex ?? -1, Math.max(8, bounds?.left ?? 8), Math.max(8, (bounds?.top ?? 8) - 80), editRequest.contextTime);
    }
    if (editRequest.wordIndex !== undefined && words[editRequest.wordIndex]) {
      const word = words[editRequest.wordIndex];
      setWordEditor({ index: editRequest.wordIndex, time: word.start, text: word.text });
    } else if (editRequest.insertTime !== undefined) beginTextInsertion(editRequest.insertTime);
  }, [editRequest?.serial, take?.id]);

  useEffect(() => {
    const cancel = (event: globalThis.PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      if (promotedRef.current !== null) promoteTimestampWord(null, null);
      if (promotionDragRef.current) { promotionDragRef.current = null; draftWordsRef.current = null; setDraftWords(null); setCollisionIndexes([]); audioScrubber.end(); audioRef.current?.pause(); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { promoteTimestampWord(null, null); promotionDragRef.current = null; draftWordsRef.current = null; setDraftWords(null); setCollisionIndexes([]); audioScrubber.end(); audioRef.current?.pause(); } };
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", cancel, true); window.removeEventListener("keydown", escape); };
  }, []);

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
    let nextTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (!audio.paused && !promotionDragRef.current) {
      nextTime = nextPlayableTime(nextTime, duration, excludedRanges);
      if (nextTime !== audio.currentTime) audio.currentTime = nextTime;
      if (nextTime >= duration) audio.pause();
    }
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
    const cacheCoversViewport = detailEnvelope
      && detailEnvelope.start <= detailRequest.viewportStart
      && detailEnvelope.end >= detailRequest.viewportEnd
      // The API groups source peaks in whole blocks, so it can return fewer
      // points than requested even at its highest available resolution.
      && detailEnvelope.requestedDensity >= requiredDensity * 0.75;
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
          setDetailEnvelope({ start, end, resolution, requestedDensity: requiredDensity, points });
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
    if (stretchTransportRef.current) stretchTransportRef.current.wasPlaying = false;
    const audio = audioRef.current;
    if (!audio || !take?.url || isRecording) return;
    if (voiceEdits?.busy) { audio.pause(); return; }
    audioScrubber.end();
    if (audio.paused) {
      try {
        await preparePlayback(audio);
      } catch {
        // Native playback remains available if Web Audio is unavailable.
      }
      audio.playbackRate = playbackRate;
      // The element ignores a seek made before it had metadata, so a playhead
      // moved by selecting words can be ahead of the audio. Reconcile here:
      // play has to start where the playhead says it will.
      if (Math.abs(audio.currentTime - currentTime) > 0.01) audio.currentTime = currentTime;
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
    const start = kind === "in" ? currentTime : markIn;
    const end = kind === "out" ? currentTime : markOut;
    if (kind === "in") setMarkIn(start);
    else setMarkOut(end);
    if (start !== null && end !== null && end > start) {
      onEditStateChange?.({ removedRanges, cutPoints, workingRange: { id: "working", start, end } });
    }
    setStagedCut(null);
  }

  function cutMarkedRange() {
    if (currentTime <= 0 || currentTime >= duration) return;
    const next = [...new Set([...cutPoints, currentTime])].sort((a, b) => a - b);
    onEditStateChange?.({ removedRanges, workingRange, cutPoints: next });
  }

  function uncut() {
    const selected = sections.filter((section) => selectedSections.includes(section.id));
    const edges = new Set(selected.flatMap((section) => [section.start, section.end]));
    const remaining = selected.length ? cutPoints.filter((point) => !edges.has(point)) : [];
    const removed = selected.length ? restoreTimelineSections(removedRanges, selected) : [];
    if (onEditStateChange) onEditStateChange({ removedRanges: removed, workingRange, cutPoints: remaining });
    else onRemovedRangesChange?.(removed);
    setSelectedSections([]);
  }

  function deleteStagedCut() {
    const selected = sections.filter((section) => selectedSections.includes(section.id));
    if (!selected.length) return;
    const next = excludedTimelineRanges(duration, [...removedRanges, ...selected], null);
    if (onEditStateChange) onEditStateChange({ removedRanges: next, workingRange, cutPoints });
    else onRemovedRangesChange?.(next);
    setStagedCut(null);
  }

  function resetTimelineEdits() {
    setStagedCut(null);
    setMarkIn(null);
    setMarkOut(null);
    setSelectedSections([]);
    if (onEditStateChange) onEditStateChange({ removedRanges: [], workingRange: null, cutPoints: [] });
    else onRemovedRangesChange?.([]);
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
    // Capture keeps the drag alive when the pointer leaves a four-pixel word box,
    // but a browser that refuses the id must not take the edit down with it.
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
  function maxTimelineZoom() {
    const baseWidth = timelinePixelWidthRef.current > 0
      ? timelinePixelWidthRef.current / Math.max(zoom, 0.001)
      : 1000;
    const minimumSpan = minimumTimelineSpan(duration, baseWidth);
    return Math.max(1, duration / minimumSpan);
  }
  function zoomResolutionLabel() {
    const baseWidth = timelinePixelWidthRef.current > 0
      ? timelinePixelWidthRef.current / Math.max(zoom, 0.001)
      : 1000;
    return timelineZoomResolution(duration / Math.max(zoom, 0.001), baseWidth);
  }
  function zoomSliderValue() {
    const baseWidth = timelinePixelWidthRef.current > 0
      ? timelinePixelWidthRef.current / Math.max(zoom, 0.001)
      : 1000;
    const minimumSpan = minimumTimelineSpan(duration, baseWidth);
    return timelineZoomPosition(duration, duration / Math.max(zoom, 0.001), minimumSpan);
  }
  function setZoomFromSlider(value: number) {
    const baseWidth = timelinePixelWidthRef.current > 0
      ? timelinePixelWidthRef.current / Math.max(zoom, 0.001)
      : 1000;
    const minimumSpan = minimumTimelineSpan(duration, baseWidth);
    if (duration <= minimumSpan) {
      setZoom(1);
      return;
    }
    setZoom(duration / timelineSpanAtZoomPosition(value, duration, minimumSpan));
  }

  function modifiersOf(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) {
    return { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey };
  }

  function beginWordSelection(event: PointerEvent<HTMLElement>, index: number) {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    event.stopPropagation();
    promoteTimestampWord(null, null);
    wordSelectionDraggingRef.current = true;
    const next = rangeSelectionEnabled ? selectProductionWord(selectionRef.current, index, displayWords, modifiersOf(event)) : selectWord(selectionRef.current, index, modifiersOf(event));
    sweepOriginRef.current = index;
    sweepBaseRef.current = next;
    onWordSelectionChange?.(next);
  }

  function extendWordSelection(index: number, modifiers: { ctrl: boolean; shift: boolean; alt: boolean }) {
    const origin = sweepOriginRef.current;
    if (!wordSelectionDraggingRef.current || origin === null) return;
    onWordSelectionChange?.(rangeSelectionEnabled ? sweepProductionWords(sweepBaseRef.current, origin, index, displayWords, modifiers) : sweepTo(sweepBaseRef.current, origin, index, modifiers));
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

  function extendWordSelectionAtPoint(clientX: number, clientY: number, modifiers: { ctrl: boolean; shift: boolean; alt: boolean }) {
    if (!wordSelectionDraggingRef.current) return;
    const index = wordIndexAtTimelinePoint(clientX, clientY);
    if (index >= 0) extendWordSelection(index, modifiers);
  }

  function beginTextInsertion(time: number) {
    if (!take || isRecording || !onWordsChange) return;
    setInsertionError(null);
    setWordEditor({ index: null, time: Math.max(0, Math.min(duration, time)), text: "" });
    setSpeakerMenu(null);
  }

  function openSpeakerMenu(index: number, x: number, y: number, time = words[index]?.start ?? 0) {
    const indexes = !words[index] ? [] : selectedWordIndexes.has(index) ? [...selectedWordIndexes].sort((left, right) => left - right) : [index];
    if (indexes.length && !selectedWordIndexes.has(index)) {
      sweepOriginRef.current = index;
      onWordSelectionChange?.({ indexes, anchor: index });
    }
    setSpeakerMenu({ indexes: indexes.sort((left, right) => left - right), time, x, y });
  }

  function deleteSelectedSubtitleWords() {
    if (speakerMenu && onWordsChange && wordDeletion.remove(speakerMenu.indexes)) setSpeakerMenu(null);
  }

  function beginWordDrag(event: PointerEvent<HTMLElement>, index: number, mode: WordDragMode) {
    // Middle carries a selection; the grips trim, and they are left-button.
    if (mode === "move" ? event.button !== 1 : event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const scroller = timelineScrollRef.current;
    const width = timelinePixelWidthRef.current || scroller?.scrollWidth || 0;
    if (!width) return;
    // A drag on an unselected word takes it alone; on a selected one it carries
    // the whole selection, which is how the user asked to move several at once.
    const carriesSelection = selectedWordIndexes.has(index);
    const indexes = carriesSelection
      ? [...selectedWordIndexes].sort((left, right) => left - right)
      : [index];
    if (!carriesSelection) {
      sweepOriginRef.current = index;
      onWordSelectionChange?.({ indexes, anchor: index });
    }
    wordSelectionDraggingRef.current = false;
    wordDragRef.current = { mode, indexes, originX: event.clientX, pixelsPerSecond: width / Math.max(duration, 0.001), moved: false };
    // Capture keeps a drag alive when the pointer leaves a word only a few pixels
    // wide; a browser that refuses the id must not take the edit down with it.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* drag still works */ }
  }

  function sourceTimeAt(clientX: number) {
    const bounds = timelineCanvasRef.current?.getBoundingClientRect();
    return bounds ? Math.max(0, Math.min(duration, (clientX - bounds.left) / Math.max(1, bounds.width) * duration)) : currentTime;
  }

  function promoteWord(index: number) {
    promoteTimestampWord(take?.id ?? null, index);
  }

  function hidePromotionNote() {
    if (promotionNoteTimer.current) clearTimeout(promotionNoteTimer.current);
    promotionNoteTimer.current = null;
    setPromotionNote(null);
  }

  function cancelWordGesture() {
    promotionDragRef.current = null;
    wordDragRef.current = null;
    pendingPromotionRef.current = null;
    draftWordsRef.current = null;
    setDraftWords(null);
    setCollisionIndexes([]);
    promoteTimestampWord(null, null);
    audioScrubber.end();
  }

  function showPromotionNote(event: PointerEvent<HTMLElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-timeline-word-index]");
    if (!target || Number(target.dataset.timelineWordIndex) !== promotedRef.current) return;
    hidePromotionNote();
    const rect = target.getBoundingClientRect();
    const text = words[promotedRef.current!]?.text ?? "";
    promotionNoteTimer.current = setTimeout(() => {
      setPromotionNote({ x: Math.max(8, Math.min(window.innerWidth - 340, rect.left)), y: Math.max(8, rect.top - 42), text });
    }, 2000);
  }

  function beginPromotionDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 1 || promotedRef.current === null || isRecording) return false;
    event.preventDefault();
    event.stopPropagation();
    const start = sourceTimeAt(event.clientX);
    promotionDragRef.current = { start, index: promotedRef.current };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginAudioScrub();
    audioScrubber.move(start);
    setCurrentTime(start);
    return true;
  }

  function movePromotionDrag(event: PointerEvent<HTMLDivElement>) {
    if (!promotionDragRef.current) return false;
    event.preventDefault();
    const time = sourceTimeAt(event.clientX);
    const drag = promotionDragRef.current;
    const preview = assignWordInterval(words, drag.index, drag.start, time, duration);
    draftWordsRef.current = preview.words;
    setDraftWords(preview.words);
    setCollisionIndexes(preview.collisionIndexes);
    audioScrubber.move(time);
    paintPlayhead(time);
    setCurrentTime(time);
    return true;
  }

  function endPromotionDrag(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const drag = promotionDragRef.current;
    if (!drag) return false;
    event.preventDefault();
    promotionDragRef.current = null;
    draftWordsRef.current = null;
    setDraftWords(null);
    setCollisionIndexes([]);
    audioScrubber.end();
    audioRef.current?.pause();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!cancel) {
      const end = sourceTimeAt(event.clientX);
      const start = Math.min(drag.start, end);
      const out = Math.max(drag.start, end);
      if (out - start >= .001) {
        const next = assignWordInterval(words, drag.index, start, out, duration).words;
        onWordsChange?.(next);
        const following = drag.index + 1 < words.length ? drag.index + 1 : null;
        promotedRef.current = following;
        setPromotedIndex(following);
        // Do not redispatch the same index: listeners toggle an existing promote.
      }
    }
    return true;
  }

  function commitWordEditor() {
    const wordEditor = wordEditorRef.current;
    if (!wordEditor) return;
    wordEditorRef.current = null;
    const text = take?.text ?? words.map((word) => word.text).join(" ");
    if (wordEditor.index !== null) {
      const edit = replaceScriptWord(text, wordEditor.index, wordEditor.text, words);
      onWordsChange?.(edit.words, edit.text);
    } else if (wordEditor.text.trim()) {
      const boundary = words.findIndex((word) => word.start >= wordEditor.time);
      const index = boundary < 0 ? words.length : boundary;
      const edit = insertScriptTextAtWordBoundary(text, index, wordEditor.text, words, wordEditor.time, duration);
      if (!edit.changedWordIndexes.length) {
        setInsertionError("Không còn khoảng trống timing ở đây. Hãy chỉnh timing các từ bên cạnh rồi thêm text.");
        wordEditorRef.current = wordEditor;
        return;
      }
      onWordsChange?.(edit.words, edit.text);
      setPromotedIndex(index);
      promotedRef.current = index;
    }
    setWordEditor(null);
    setInsertionError(null);
  }

  function dragWord(event: PointerEvent<HTMLElement>) {
    const drag = wordDragRef.current;
    if (!drag) return;
    const delta = (event.clientX - drag.originX) / drag.pixelsPerSecond;
    if (!drag.moved && Math.abs(event.clientX - drag.originX) < 3) return;
    drag.moved = true;
    const next = applyWordDrag(words, drag.indexes, drag.mode, delta, { duration, edges: snapEdges });
    setCollisionIndexes(timingCollisionIndexes(words, next, drag.indexes));
    draftWordsRef.current = next;
    setDraftWords(next);
  }

  function endWordDrag(event: PointerEvent<HTMLElement>) {
    const drag = wordDragRef.current;
    wordDragRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    const draft = draftWordsRef.current;
    draftWordsRef.current = null;
    setDraftWords(null);
    setCollisionIndexes([]);
    // Releasing is what commits: the draft was preview only until now.
    if (drag?.moved && draft) onWordsChange?.(draft);
    else if (pendingPromotionRef.current !== null) promoteWord(pendingPromotionRef.current);
    pendingPromotionRef.current = null;
  }

  function assignSpeakerToSelectedWords(profileId: string | null) {
    if (!speakerMenu?.indexes.length) return;
    const indexes = new Set(speakerMenu.indexes);
    onWordsChange?.(words.map((word, index) => indexes.has(index) ? { ...word, speakerId: profileId } : word));
    setSpeakerMenu(null);
  }

  function followPlayhead() {
    if (rangeSelectionEnabled && hasMultipleSelectionRanges(wordSelection)) return;
    const scroller = timelineScrollRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const playheadX = (currentTime / Math.max(duration, 0.001)) * scroller.scrollWidth;
    const visibleRatio = (playheadX - scroller.scrollLeft) / Math.max(scroller.clientWidth, 1);
    if (visibleRatio >= 0.1 && visibleRatio <= 0.9) return;
    const nextLeft = Math.max(0, Math.min(scroller.scrollWidth - scroller.clientWidth, playheadX - scroller.clientWidth * 0.1));
    scroller.scrollLeft = nextLeft;
    setTimelineViewport({ left: scroller.scrollLeft, width: scroller.clientWidth });
  }

  function seekToClientX(clientX: number) {
    stretchTransportRef.current = null;
    const canvas = timelineCanvasRef.current;
    if (isRecording || !take?.url || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nextTime = Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
    setCurrentTime(nextTime);
    if (audioScrubber.active) audioScrubber.move(nextTime);
    else if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
      syncPlaybackClock(audioRef.current);
    }
  }

  function seek(event: PointerEvent<HTMLDivElement>) {
    seekToClientX(event.clientX);
  }

  function seekTransportToClientX(clientX: number) {
    stretchTransportRef.current = null;
    const transport = transportProgressRef.current;
    if (isRecording || !take?.url || !transport) return;
    const rect = transport.getBoundingClientRect();
    const nextTime = Math.min(duration, Math.max(0, ((clientX - rect.left) / Math.max(rect.width, 1)) * duration));
    setCurrentTime(nextTime);
    if (audioScrubber.active) audioScrubber.move(nextTime);
    else if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
      syncPlaybackClock(audioRef.current);
    }
  }

  function beginTransportScrub(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isRecording || !take?.url) return;
    event.preventDefault();
    transportScrubRef.current = true;
    beginAudioScrub();
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
    audioScrubber.end();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function beginPlayheadDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isRecording || !take?.url) return;
    event.preventDefault();
    event.stopPropagation();
    playheadDragRef.current = true;
    beginAudioScrub();
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
    audioScrubber.end();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // The position set by seekToClientX is committed on the next render.
    // Scheduling this render's closure would follow the old drag position.
  }

  function beginAudioScrub() {
    if (take?.id) notifyPlaybackInteraction([take.id]);
    const audio = audioRef.current;
    if (!audio) return;
    audioScrubber.begin([audio], (time) => !excludedRanges.some((range) => range.start <= time && time < range.end),
      (time) => Math.min(duration, ...excludedRanges.filter((range) => range.start > time).map((range) => range.start)));
    setPlaying(false);
    stopPlaybackClock();
    stopSignalMeter();
    void preparePlayback(audio).catch(() => undefined);
  }

  function beginScrub(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isRecording || !take?.url) return;
    event.preventDefault();
    scrubbingRef.current = true;
    beginAudioScrub();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seek(event);
  }

  function beginRangeSelection(event: PointerEvent<HTMLDivElement>) {
    if (!rangeSelectionEnabled || event.button !== 0 || isRecording || !take) return false;
    event.preventDefault();
    rangeDragRef.current = { x: event.clientX, start: sourceTimeAt(event.clientX), base: selectionRef.current, moved: false, modifiers: modifiersOf(event) };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* pointer remains in the waveform */ }
    return true;
  }

  function moveRangeSelection(event: PointerEvent<HTMLDivElement>) {
    const drag = rangeDragRef.current;
    if (!drag) return false;
    if (Math.abs(event.clientX - drag.x) >= 2) drag.moved = true;
    if (drag.moved) onWordSelectionChange?.(selectProductionTime(drag.base, drag.start, sourceTimeAt(event.clientX), displayWords, drag.modifiers));
    return true;
  }

  function endRangeSelection(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = rangeDragRef.current;
    if (!drag) return false;
    if (cancelled) onWordSelectionChange?.(drag.base);
    else if (drag.moved) moveRangeSelection(event);
    else { beginScrub(event); endScrub(event); }
    rangeDragRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    return true;
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
    audioScrubber.end();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function suspendStretchPlayback() {
    const audio = audioRef.current;
    stretchTransportRef.current = { sourceTime: audio?.currentTime ?? currentTime, time: audio?.currentTime ?? currentTime, wasPlaying: Boolean(audio && !audio.paused), url: take?.url ?? "", complete: false };
    audio?.pause(); audioScrubber.end();
  }

  function prepareStretchPlayback(operation: StretchOperation) {
    const transport = stretchTransportRef.current;
    if (transport) transport.time = mapStretchTime(transport.sourceTime, operation, voiceEdits?.packet?.document.sampleRate ?? 24000);
    audioRef.current?.pause();
  }

  function restoreStretchPlayback() {
    const transport = stretchTransportRef.current, audio = audioRef.current;
    if (!transport) return;
    transport.time = transport.sourceTime; transport.complete = true;
    if (audio && audio.readyState >= 1 && audio.currentSrc.endsWith(transport.url)) {
      audio.currentTime = transport.sourceTime;
      if (transport.wasPlaying) void audio.play().catch(() => undefined);
      stretchTransportRef.current = null;
    }
  }

  function completeStretchPlayback(samePreview: boolean) {
    if (!stretchTransportRef.current) return;
    stretchTransportRef.current.complete = true;
    if (samePreview) stretchTransportRef.current = null;
  }

  async function navigateStretchHistory(action: "undo" | "redo") {
    const document = voiceEdits?.packet?.document;
    const operation = document?.operations[document.cursor - (action === "undo" ? 1 : 0)];
    if (!voiceEdits || !document || !operation || voiceEdits.busy) return;
    const mapping = action === "undo" ? inverseStretch(operation) : operation;
    suspendStretchPlayback(); prepareStretchPlayback(mapping);
    const accepted = await voiceEdits.history(action);
    if (accepted) {
      onWordSelectionChange?.(mapStretchSelection(selectionRef.current, mapping, document.sampleRate));
      completeStretchPlayback(false);
    } else restoreStretchPlayback();
  }

  return (
    <ModuleFrame
      elementRef={moduleRef}
      eyebrow={liveCaption ?? (isRecording ? "REC LIVE · WAVEFORM" : take?.name ?? "CHƯA CÓ AUDIO")}
      title="Timeline"
      index="A1"
      tone="dark"
      className="timeline-module"
      action={
        <div className="timeline-header-actions">
          {leadingActions}
          {voiceEdits?.packet ? <div className="timeline-edit-actions" aria-label="Giãn thời lượng">
            <button type="button" disabled={voiceEdits.busy || !voiceEdits.packet.document.cursor} onClick={() => void navigateStretchHistory("undo")}>Undo giãn</button>
            <button type="button" disabled={voiceEdits.busy || voiceEdits.packet.document.cursor >= voiceEdits.packet.document.operations.length} onClick={() => void navigateStretchHistory("redo")}>Redo giãn</button>
            <span role="status">{voiceEdits.busy ? "Đang dựng audio…" : voiceEdits.error ?? (voiceEdits.packet.document.cursor ? "Preview giãn · chưa Fix voice" : "Ctrl + kéo handle để giãn")}</span>
          </div> : null}
          <div className="timeline-edit-actions" role="group" aria-label="Timeline edit actions">
            <button disabled={isRecording || !take?.url} onClick={() => markTimelinePoint("in")} type="button">MARK IN</button>
            <button disabled={isRecording || !take?.url} onClick={() => markTimelinePoint("out")} type="button">MARK OUT</button>
            <button disabled={isRecording || !take?.url || currentTime <= 0 || currentTime >= duration} onClick={cutMarkedRange} type="button">CUT</button>
            <button disabled={(!cutPoints.length && !removedRanges.length) || isRecording} onClick={uncut} type="button">UNCUT</button>
            <button className="is-delete" disabled={!selectedSections.length || isRecording} onClick={deleteStagedCut} type="button">DELETE</button>
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
      {wordDeletion.busy ? <span className="timeline-delete-feedback" role="status">Đang xóa từ đã chọn…</span> : null}
      {wordDeletion.error ? <span className="timeline-delete-feedback" role="alert">{wordDeletion.error}</span> : null}
      {promotionNote ? createPortal(<div className="timeline-promotion-note" role="tooltip" style={{ left: promotionNote.x, top: promotionNote.y }}>GÁN TIMESTAMP · {promotionNote.text}<br />Giữ chuột giữa trên waveform: IN → OUT.<br />Chuột trái/phải để kết thúc.</div>, document.body) : null}
      <div className="timeline-section-strip" aria-label="Các đoạn footage đã chia">{sections.map((section) => <button type="button" key={section.id} aria-label={`Đoạn footage ${section.start.toFixed(2)} đến ${section.end.toFixed(2)}`} aria-pressed={selectedSections.includes(section.id)} className={`${selectedSections.includes(section.id) ? "is-selected" : ""} ${removedRanges.some((range) => range.start <= section.start && range.end >= section.end) ? "is-removed" : ""}`} style={{ width: `${(section.end - section.start) / duration * 100}%` }} onClick={(event) => setSelectedSections((current) => event.ctrlKey || event.metaKey ? current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id] : [section.id])}>{section.start.toFixed(1)}–{section.end.toFixed(1)}</button>)}</div>
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
              {ticks.map((mark) => <span key={mark.time} style={{ left: `${mark.position * 100}%` }}>{mark.label}</span>)}
            </div>
            <div
              className="waveform"
              aria-label="Waveform timeline"
              tabIndex={rangeSelectionEnabled ? 0 : undefined}
              onKeyDown={(event) => { if (onReferenceContext && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); onReferenceContext({ selection: wordSelection, x: rect.left + 10, y: rect.top + 10, origin: "waveform" }); } }}
              onContextMenu={(event) => {
                if (!onReferenceContext) return;
                event.preventDefault();
                const time = sourceTimeAt(event.clientX);
                const inside = productionRanges(wordSelection, displayWords).some((range) => time >= range.start && time <= range.end);
                const index = displayWords.findIndex((word) => word.start <= time && word.end > time);
                const selection = inside ? wordSelection : index >= 0 ? selectProductionWord(EMPTY_SELECTION, index, displayWords) : EMPTY_SELECTION;
                onWordSelectionChange?.(selection);
                onReferenceContext({ selection, x: event.clientX, y: event.clientY, origin: "waveform" });
              }}
              onPointerCancel={(event) => { if (!endRangeSelection(event, true) && !endPromotionDrag(event, true)) endScrub(event); }}
              onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }} onPointerDown={(event) => { if (beginPromotionDrag(event) || beginRangeSelection(event)) return; promoteTimestampWord(null, null); beginScrub(event); }}
              onPointerMove={(event) => { if (!moveRangeSelection(event) && !movePromotionDrag(event)) scrubTimeline(event); }}
              onPointerUp={(event) => { if (!endRangeSelection(event) && !endPromotionDrag(event)) endScrub(event); }}
            >
              {rangeSelectionEnabled ? productionRanges(wordSelection, displayWords).map((range) => {
                const bounds = rangeReadoutBounds(range, duration, timelineCanvasWidth || 1000, timelineViewport.left, timelineViewport.width || 1000);
                return <div aria-label={`Vùng chọn ${range.start.toFixed(3)} đến ${range.end.toFixed(3)} giây`} className="production-selection-range" key={range.id} style={{ left: `${range.start / duration * 100}%`, width: `${(range.end - range.start) / duration * 100}%` }}>
                  {bounds.visible ? <div className="production-selection-readout" style={{ left: bounds.left, width: bounds.width }}><span>START <b>{range.start.toFixed(3)}s</b></span><span>DURATION <b>{(range.end - range.start).toFixed(3)}s</b></span><span>END <b>{range.end.toFixed(3)}s</b></span></div> : null}
                </div>;
              }) : null}
              {rangeSelectionEnabled && voiceEdits ? <StretchHandles controller={voiceEdits} ranges={productionRanges(wordSelection, displayWords)} selection={wordSelection} onSelectionChange={onWordSelectionChange} duration={duration} canvasWidth={timelineCanvasWidth} onSuspend={suspendStretchPlayback} onPrepare={prepareStretchPlayback} onRevert={restoreStretchPlayback} onComplete={completeStretchPlayback} /> : null}
              {isRecording && visibleEnvelope.length ? <canvas aria-label="Natural audio waveform" className="waveform-shape" ref={waveformCanvasRef} /> : null}
              {detailEnvelope?.points.length ? <canvas aria-label="PCM waveform at zoom" className="waveform-shape waveform-shape--detail" ref={detailWaveformCanvasRef} style={{ left: `${(detailEnvelope.start / duration) * 100}%`, width: `${((detailEnvelope.end - detailEnvelope.start) / duration) * 100}%` }} /> : null}
              {take && !isRecording && detailWaveformState === "loading" && !detailEnvelope?.points.length ? <div className="timeline-waveform-status">Đang đọc PCM waveform theo vùng nhìn…</div> : null}
              {detailWaveformState === "loading" && detailEnvelope?.points.length ? <span className="timeline-waveform-detail-status">PCM PEAK · đang cập nhật vùng nhìn</span> : null}
              {take && !isRecording && detailWaveformState === "error" ? <div className="timeline-waveform-status is-error">Không tải được PCM waveform của footage này.</div> : null}
              {gainOverflows.map((range, index) => { const start = gainWindowStart + (range.start / Math.max(visibleEnvelope.length, 1)) * gainWindowDuration; const end = gainWindowStart + (range.end / Math.max(visibleEnvelope.length, 1)) * gainWindowDuration; return <i aria-label={autoCalibrate ? "Vùng đã auto calibrate" : "Vùng gain bị clipping"} className={`timeline-gain-range ${autoCalibrate ? "is-calibrated" : ""}`} key={`${range.start}-${range.end}-${index}`} style={{ left: `${(start / duration) * 100}%`, width: `${Math.max(0.08, ((end - start) / Math.max(duration, 0.001)) * 100)}%` }} />; })}
              {autoCalibrate ? gainKeyframes.map((frame) => <i aria-label={`Gain keyframe ${frame.gainDb.toFixed(1)} dB tại ${frame.time.toFixed(2)} giây`} className="timeline-gain-keyframe" key={frame.id} style={{ left: `${(frame.time / Math.max(duration, 0.001)) * 100}%` }} />) : null}
              {excludedRanges.map((range) => <i aria-label={`Đoạn đã loại ${range.start.toFixed(2)} đến ${range.end.toFixed(2)} giây`} className="timeline-removed-range" key={range.id} style={{ left: `${(range.start / duration) * 100}%`, width: `${((range.end - range.start) / duration) * 100}%` }} />)}
              {cutPoints.map((point) => <i className="timeline-cut-point" key={point} style={{ left: `${point / duration * 100}%` }} />)}
              {stagedCut ? <i aria-label="Đoạn đã cắt, sẵn sàng xóa" className="timeline-removed-range is-staged" style={{ left: `${(stagedCut.start / duration) * 100}%`, width: `${((stagedCut.end - stagedCut.start) / duration) * 100}%` }} /> : null}
              {markIn !== null ? <i className="timeline-mark timeline-mark--in" style={{ left: `${(markIn / duration) * 100}%` }}>IN</i> : null}
              {markOut !== null ? <i className="timeline-mark timeline-mark--out" style={{ left: `${(markOut / duration) * 100}%` }}>OUT</i> : null}
              {!take && !isRecording ? <div className="timeline-empty"><Icon name="waveform" /><b>{emptyNote?.title ?? "Import, thu âm hoặc chọn một Take"}</b><span>{emptyNote?.hint ?? "Audio lineage sẽ bắt đầu tại đây"}</span></div> : null}
            </div>
            <div className="word-track" onKeyDown={(event) => {
              if (!onReferenceContext || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
              const target = (event.target as HTMLElement).closest<HTMLElement>("[data-timeline-word-index]");
              if (!target) return;
              event.preventDefault();
              const index = Number(target.dataset.timelineWordIndex);
              const selection = selectedWordIndexes.has(index) ? wordSelection : selectProductionWord(EMPTY_SELECTION, index, displayWords);
              const rect = target.getBoundingClientRect();
              onWordSelectionChange?.(selection);
              onReferenceContext({ selection, x: rect.left, y: rect.bottom, origin: "subtitle" });
            }} onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest("button, input")) return;
              event.preventDefault(); event.stopPropagation();
              const time = sourceTimeAt(event.clientX);
              const index = wordIndexAtTimelinePoint(event.clientX, event.clientY);
              const word = words[index];
              if (word && word.start <= time && time < word.end) setWordEditor({ index, time: word.start, text: word.text });
              else beginTextInsertion(time);
            }} onContextMenu={(event) => {
              if ((event.target as HTMLElement).closest("input")) return;
              event.preventDefault(); event.stopPropagation();
              const target = (event.target as HTMLElement).closest<HTMLElement>("[data-timeline-word-index]");
              if (onReferenceContext) {
                const index = target ? Number(target.dataset.timelineWordIndex) : -1;
                const selection = index >= 0 ? selectedWordIndexes.has(index) ? wordSelection : selectProductionWord(EMPTY_SELECTION, index, displayWords) : EMPTY_SELECTION;
                onWordSelectionChange?.(selection);
                onReferenceContext({ selection, x: event.clientX, y: event.clientY, origin: "subtitle" });
                return;
              }
              openSpeakerMenu(target ? Number(target.dataset.timelineWordIndex) : -1, event.clientX, event.clientY, sourceTimeAt(event.clientX));
            }} onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }} onPointerDown={(event) => { if ((event.target as HTMLElement).closest("input")) return; if (event.button === 0 && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); beginTextInsertion(sourceTimeAt(event.clientX)); return; } const target = (event.target as HTMLElement).closest<HTMLElement>("[data-timeline-word-index]"); const index = target ? Number(target.dataset.timelineWordIndex) : wordIndexAtTimelinePoint(event.clientX, event.clientY); if (index < 0) return; if (event.button === 1) { event.preventDefault(); event.stopPropagation(); pendingPromotionRef.current = index; beginWordDrag(event, index, "move"); } else beginWordSelection(event, index); }} onPointerMove={(event) => { if (wordDragRef.current) { dragWord(event); return; } extendWordSelectionAtPoint(event.clientX, event.clientY, modifiersOf(event)); }} onPointerCancel={endWordDrag} onPointerUp={(event) => { wordSelectionDraggingRef.current = false; if (wordDragRef.current) endWordDrag(event); }} ref={wordTrackRef}>
              {displayWords.length && !isRecording && timingIsTrusted ? wordTrackLayout.map((layout) => { const index = layout.sourceIndex; const word = displayWords[index];
                const start = Math.min(duration, Math.max(0, word.start));
                const end = Math.min(duration, Math.max(start, word.end));
                return (
                  <button
                    aria-label={`Subtitle word ${word.text}`}
                    aria-pressed={selectedWordIndexes.has(index)}
                    onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); setWordEditor({ index, time: word.start, text: word.text }); }}
                    className={`timeline-word ${layout.isCompact ? "is-compact" : ""} ${promotedIndex === index ? "is-promoted" : ""} ${collisionIndexes.includes(index) ? "is-timing-collision" : ""} ${word.timingTrusted === false ? "timeline-word--untrusted" : ""} ${word.timingSource === "manual" ? "timeline-word--edited" : ""} ${index === activeWordIndex ? "is-active" : currentTime >= end ? "is-past" : ""} ${selectedWordIndexes.has(index) ? "is-selected" : ""}`}
                    onPointerEnter={showPromotionNote}
                    onPointerLeave={hidePromotionNote}
                    data-collision-note={collisionIndexes.includes(index) ? "Đang lấn timing · giữ lại ít nhất 10% từ này" : undefined}
                    data-timeline-word-index={index}
                    key={`${word.text}-${index}`}
                    style={{ left: `${(start / duration) * 100}%`, width: `${(layout.widthPixels / wordTrackCanvasWidth) * 100}%`, color: speakerById.get(word.speakerId ?? "")?.color }}
                    data-timing-note={word.timingTrusted === false ? "Từ vừa sửa · timestamp nội suy, cần căn chỉnh" : undefined}
                    title={word.timingTrusted === false ? undefined : "Chuột trái quét để chọn · chuột giữa kéo để dịch · kéo hai mép để chỉnh IN/OUT · chuột phải để gán Speaker"}
                    type="button"
                  >
                    <i
                      aria-hidden="true"
                      className="timeline-word__grip timeline-word__grip--in"
                      onPointerCancel={endWordDrag}
                      onPointerDown={(handleEvent) => beginWordDrag(handleEvent, index, "trim-start")}
                      onPointerMove={dragWord}
                      onPointerUp={endWordDrag}
                    />
                    <span className="timeline-word__label">{word.text}</span>
                    <i
                      aria-hidden="true"
                      className="timeline-word__grip timeline-word__grip--out"
                      onPointerCancel={endWordDrag}
                      onPointerDown={(handleEvent) => beginWordDrag(handleEvent, index, "trim-end")}
                      onPointerMove={dragWord}
                      onPointerUp={endWordDrag}
                    />
                  </button>
                );
              }) : <em className={timingUnavailable ? "is-warning" : ""}>{isRecording ? "REC LIVE · waveform đang cập nhật" : timingUnavailable ? take?.wordTimingNote ?? "WORD TIMING · chưa có nguồn căn chỉnh đáng tin; cần chạy lại STT" : "WORD SYNC · subtitle sẽ khớp theo timestamp"}</em>}
              {excludedRanges.map((range) => <i key={range.id} className="timeline-removed-range" style={{ left: `${range.start / duration * 100}%`, width: `${(range.end - range.start) / duration * 100}%` }} />)}
              {wordEditor ? <input aria-label="Sửa subtitle" autoFocus className="timeline-word-edit" placeholder={wordEditor.index === null ? "Nhập text mới · Enter để lưu" : undefined} style={{ left: `${Math.max(timelineViewport.left, Math.min(wordEditor.time / duration * wordTrackCanvasWidth, timelineViewport.left + wordTrackViewportWidth - Math.min(320, wordTrackViewportWidth))) / wordTrackCanvasWidth * 100}%`, width: Math.min(320, wordTrackViewportWidth) }} value={wordEditor.text} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setWordEditor({ ...wordEditor, text: event.target.value })} onBlur={commitWordEditor} onKeyDown={(event) => { if (!(event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey))) event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); commitWordEditor(); } if (event.key === "Escape") { wordEditorRef.current = null; setWordEditor(null); setInsertionError(null); } }} /> : null}
            </div>
            <div aria-label="Playhead indicator" className={`timeline-playhead ${isRecording ? "is-recording" : ""}`} ref={playheadRef} onPointerCancel={endPlayheadDrag} onPointerDown={beginPlayheadDrag} onPointerMove={dragPlayhead} onPointerUp={endPlayheadDrag}  />
          </div>
          </div>
          {rangeSelectionEnabled ? <SelectionMarkers orientation="horizontal" className="timeline-selection-markers" markers={productionRanges(wordSelection, displayWords).map((range) => ({ id: range.id, position: (range.start + range.end) / 2 / Math.max(duration, .001), label: `Timeline ${range.start.toFixed(3)}–${range.end.toFixed(3)}s` }))} onReveal={(id) => {
            const range = productionRanges(wordSelection, displayWords).find((item) => item.id === id), scroller = timelineScrollRef.current;
            if (!range || !scroller) return;
            scroller.scrollLeft = Math.max(0, Math.min(scroller.scrollWidth - scroller.clientWidth, (range.start + range.end) / 2 / Math.max(duration, .001) * scroller.scrollWidth - scroller.clientWidth / 2));
            setTimelineViewport({ left: scroller.scrollLeft, width: scroller.clientWidth });
          }} /> : null}
          <div aria-label="Thanh cuộn timeline" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(timelineNavigator.left)} className={`timeline-navigator ${timelineNavigator.enabled ? "" : "is-static"}`} onPointerCancel={endTimelineNavigator} onPointerDown={beginTimelineNavigator} onPointerMove={moveTimelineNavigator} onPointerUp={endTimelineNavigator} role="scrollbar" tabIndex={0}>
            <i style={{ left: `${timelineNavigator.left}%`, width: `${timelineNavigator.width}%` }} />
          </div>
        </div>
      </div>
      {speakerMenu ? <div className="timeline-speaker-menu" role="menu" style={{ left: speakerMenu.x, top: speakerMenu.y }}>
        <strong>TEXT · {speakerMenu.indexes.length} TỪ</strong>
        <button disabled={!take || isRecording || !onWordsChange} role="menuitem" type="button" onClick={() => beginTextInsertion(speakerMenu.time)}>Add text</button>
        {speakerMenu.indexes.length ? <>
          <button role="menuitem" type="button" onClick={() => { const index = speakerMenu.indexes[0]; setWordEditor({ index, time: words[index].start, text: words[index].text }); setSpeakerMenu(null); }}>Sửa text</button>
          <button disabled={wordDeletion.busy || !onWordsChange} role="menuitem" type="button" onClick={deleteSelectedSubtitleWords}>Xóa text đã chọn</button>
          <button onClick={() => assignSpeakerToSelectedWords(null)} role="menuitem" type="button">Chưa gán Profile</button>
          {speakers.map((speaker) => <button key={speaker.id} onClick={() => assignSpeakerToSelectedWords(speaker.id)} role="menuitem" style={{ borderLeftColor: speaker.color }} type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>)}
        </> : null}
      </div> : null}
      {insertionError ? <div role="alert" className="timeline-delete-feedback">{insertionError}</div> : null}
      <div className="transport-bar">
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
          onEnded={(event) => { if (audioScrubber.active) return; syncPlaybackClock(event.currentTarget); setPlaying(false); stopSignalMeter(); stopPlaybackClock(); }}
          onLoadedMetadata={(event) => {
            syncPlaybackDuration(event.currentTarget);
            const transport = stretchTransportRef.current;
            if (transport) {
              event.currentTarget.currentTime = Math.min(transport.time, event.currentTarget.duration || transport.time);
              if (transport.wasPlaying) void event.currentTarget.play().catch(() => undefined);
              if (transport.complete) stretchTransportRef.current = null;
            }
          }}
          onDurationChange={(event) => syncPlaybackDuration(event.currentTarget)}
          onPause={() => { setPlaying(false); stopSignalMeter(); stopPlaybackClock(); }}
          onPlay={() => { if (audioScrubber.active) return; setPlaying(true); syncPlaybackClock(); startSignalMeter(); startPlaybackClock(); }}
          onSeeking={(event) => { scheduleGainAutomation(event.currentTarget); if (!audioScrubber.active) syncPlaybackClock(event.currentTarget); }}
          onSeeked={(event) => { scheduleGainAutomation(event.currentTarget); if (!audioScrubber.active) syncPlaybackClock(event.currentTarget); }}
          onTimeUpdate={(event) => { if (!audioScrubber.active) syncPlaybackClock(event.currentTarget); }}
          preload="metadata"
          ref={audioRef}
          src={take.url}
        />
      ) : null}
    </ModuleFrame>
  );
}
