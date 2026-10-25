import { TimelineTransport, TimelinePlaybackSettings } from "./TimelineTransport";
import { SubtitleTimingGhosts } from "../script/SubtitleTimingPreview";
import type { ScrubPreviewPosition } from "../../domain/types";
import { ScrubPreviewOverlay } from "./ScrubPreviewOverlay";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { useAudioScrubber } from "./audio-scrubbing";
import { usePreviewMixer } from "./preview-mixer";

import { api } from "../../api/client";
import { activePlaybackWordAt, notifyPlaybackInteraction, usePlaybackPublisher, subscribePlaybackSeek } from "../../domain/playback-sync";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { productionRanges } from "../../domain/production-selection";
import type { ObsLiveLinkRecording, ObsLiveLinkRecordingJournal, ObsLiveLinkStatus, ObsLiveLinkTranscriptRow, ObsLiveLinkWaveform, ObsLiveLinkWaveformPoint, ProjectMediaAsset, SpeakerProfile, TimelineEditRange } from "../../domain/types";
import type { TimelineEditState } from "../../domain/timeline-editing";
import { excludedTimelineRanges, nextPlayableTime, restoreTimelineSections, timelineSections } from "../../domain/timeline-editing";
import { TIMESTAMP_PROMOTION_EVENT, type TimestampPromotion } from "../../domain/timestamp-promotion";
import { subscribeObsLiveLinkWaveforms } from "../obs-capture/obs-waveform-feed";
import { obsTranscriptText } from "../obs-capture/obs-transcript-feed";
import { obsOverlapByUtterance, obsOverlapSelectionMatches, obsOverlapTime,
  type ObsOverlapSelection, type ObsTimelineSeekRequest } from "../obs-capture/obs-overlap";
import { channelScriptRows } from "../script/channel-script";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { useScriptShortcuts } from "../script/script-shortcuts";
import { Icon } from "../../ui/Icon";
import { TimelineLaneLabel } from "./TimelineLaneLabel";
import { Timeline } from "./Timeline";
import { ArchivedObsWaveform } from "./ArchivedObsWaveform";
import { SelectionReadout } from "./SelectionReadout";
import { useDragAutoScroll, zoomWindowStart } from "./drag-autoscroll";
import { archiveTranscriptGaps } from "./archive-transcript-gaps";
import { previewDbToPercent, previewPercentToDb } from "./gain-automation";
import { LaneMixerControls } from "./LaneMixerControls";
import { loadResumePosition, saveResumePosition, type ResumeSource } from "../../domain/workspace-resume";
import { recordingName } from "../../domain/recording-name";
import { obsTrackLabel } from "../../domain/obs-track-label";
import { waveformEnvelopePath } from "./waveform-path";
import { visibleRulerMarks as visibleTimelineRulerMarks } from "./ruler";
import { minimumTimelineSpan, timelineSpanAtZoomPosition, timelineZoomPosition, timelineZoomResolution,
  TIMELINE_ZOOM_STEPS } from "./zoom";
import { subtitleIndexAtTime, visibleSubtitleWordLayout } from "./subtitle-density";
import "./waveform.css";
import "./subtitle-density.css";

const MAX_LIVE_WINDOW_SECONDS = 120;
const DEFAULT_WINDOW_SECONDS = 60;
const EMPTY_ASSETS: ProjectMediaAsset[] = [];
type Layout = "layers" | "columns";
interface PreviewAudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  element: HTMLAudioElement;
}

interface Lane {
  channelId: string;
  label: string;
  nativeName: string;
  assetId: string | null;
  slot: number;
}

interface TimelineOverlap {
  startSeconds: number;
  endSeconds: number;
  sourceIds: string[];
  markerId: string;
}

function clock(seconds: number): string {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function timecode(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe - hours * 3600 - minutes * 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(3).padStart(6, "0")}`;
}

function recordingDisplayName(recording: ObsLiveLinkRecording, projectName: string): string {
  return recording.displayName || recordingName(new Date(recording.startedAtUtc ?? ""), projectName, "LIV", recording.recordingId);
}

function recordingSeconds(recording: ObsLiveLinkRecording, now: number): number {
  if (recording.endedMonotonicNs !== null) {
    return Math.max(0, (recording.endedMonotonicNs - recording.startedMonotonicNs) / 1e9);
  }
  const started = recording.startedAtUtc ? Date.parse(recording.startedAtUtc) : NaN;
  return Number.isFinite(started) ? Math.max(0, (now - started) / 1_000) : 0;
}

function sourceLanes(status: ObsLiveLinkStatus | null, journal: ObsLiveLinkRecordingJournal | undefined,
                     recordingId: string | null, live: boolean): Lane[] {
  if (!recordingId) return [];
  const stems = new Map((journal?.sourceStems ?? []).map((stem) => [stem.channelId, stem]));
  const journalChannels = new Map((journal?.channels ?? []).map((channel) => [channel.channelId, channel]));
  if (live) {
    return (status?.channels ?? []).filter((channel) => channel.capture?.recordingId === recordingId &&
      ((!channel.missing && (channel.appliedForward || channel.desiredForward)) ||
        (channel.capture.durableChunkCount ?? 0) > 0))
      .map((channel) => ({ channelId: channel.channelId, label: channel.alias,
        nativeName: channel.nativeName, assetId: stems.get(channel.channelId)?.assetId ?? null,
        slot: channel.slot }));
  }
  const ids = journal?.sourceStems?.length
    ? journal.sourceStems.map((stem) => stem.channelId)
    : (journal?.channels ?? []).filter((channel) => channel.forwardApplied).map((channel) => channel.channelId);
  return ids.map((channelId) => {
    const stem = stems.get(channelId);
    const channel = journalChannels.get(channelId);
    return { channelId, label: stem?.alias ?? channel?.relayLabel ?? channelId.slice(0, 8),
      nativeName: channel?.nativeName ?? "OBS source", assetId: stem?.assetId ?? null,
      slot: channel?.slot ?? 999 };
  }).sort((a, b) => a.slot - b.slot);
}

function waveformPath(points: ObsLiveLinkWaveformPoint[], sampleRate: number | null,
                      windowStart: number, windowSpan: number, gain = 1): string {
  if (!sampleRate) return "";
  const visible: Array<{ x: number; min: number; max: number }> = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous && point.startFrame > previous.endFrame) {
      visible.push({ x: Number.NaN, min: Number.NaN, max: Number.NaN });
    }
    if (point.min === null || point.max === null) {
      visible.push({ x: Number.NaN, min: Number.NaN, max: Number.NaN });
      return;
    }
    visible.push({
      x: ((point.startFrame / sampleRate - windowStart) / windowSpan) * 1_000,
      min: point.min / 32768,
      max: point.max / 32768,
    });
  });
  return waveformEnvelopePath(visible, 60, gain);
}

function mergeWaveform(previous: ObsLiveLinkWaveform | undefined, incoming: ObsLiveLinkWaveform): ObsLiveLinkWaveform {
  if (!previous || incoming.source === "mka" || incoming.lastIncludedSequence < 0 ||
      previous.recordingId !== incoming.recordingId || previous.channelId !== incoming.channelId ||
      previous.source !== incoming.source || previous.sampleAxis !== incoming.sampleAxis ||
      previous.startSeconds !== incoming.startSeconds || previous.endSeconds !== incoming.endSeconds) return incoming;
  // A sparse cursor reply can advance over chunks outside this window. It has
  // no sample rate or replacement bins; the saved waveform is still valid.
  if (incoming.sampleRate === null && !incoming.points.length) {
    return { ...previous, lastDurableSequence: incoming.lastDurableSequence,
      lastIncludedSequence: incoming.lastIncludedSequence, hasMore: incoming.hasMore };
  }
  if (previous.sampleRate !== incoming.sampleRate) return incoming;
  const points = new Map(previous.points.map((point) => [point.startFrame, point]));
  for (const point of incoming.points) points.set(point.startFrame, point);
  return { ...incoming, points: [...points.values()].sort((a, b) => a.startFrame - b.startFrame) };
}

function intervalPosition(startSeconds: number, endSeconds: number, windowStart: number,
                          windowSpan: number): CSSProperties | null {
  const left = Math.max(startSeconds, windowStart);
  const right = Math.min(endSeconds, windowStart + windowSpan);
  if (right <= left) return null;
  return { left: `${((left - windowStart) / windowSpan) * 100}%`,
    width: `${((right - left) / windowSpan) * 100}%` };
}

function missingPcmRanges(points: ObsLiveLinkWaveformPoint[], sampleRate: number | null,
                          elapsedSeconds: number,
                          knownAbsences: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (!sampleRate) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  const lastReceivedFrame = points.reduce((latest, point) => point.peak === null
    ? latest : Math.max(latest, point.endFrame), 0);
  for (const point of points) {
    if (point.peak !== null || point.startFrame >= lastReceivedFrame) continue;
    const start = point.startFrame / sampleRate;
    const end = Math.min(elapsedSeconds, point.endFrame / sampleRate, lastReceivedFrame / sampleRate);
    if (end <= start) continue;
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous.end + 1 / sampleRate) previous.end = Math.max(previous.end, end);
    else ranges.push({ start, end });
  }
  // Keep unknown holes visible, but don't label a journaled source absence
  // as PCM waiting to arrive. Split partial overlaps instead of hiding them.
  return ranges.flatMap((range) => knownAbsences.reduce((remaining, absent) => remaining.flatMap((part) => {
    if (absent.end <= part.start || absent.start >= part.end) return [part];
    return [
      ...(part.start < absent.start ? [{ start: part.start, end: absent.start }] : []),
      ...(absent.end < part.end ? [{ start: absent.end, end: part.end }] : []),
    ];
  }), [range]));
}

function sourceLevel(waveform: ObsLiveLinkWaveform | undefined, time: number): number {
  if (!waveform?.sampleRate) return 0;
  const frame = time * waveform.sampleRate;
  const point = waveform.points.find((item) => item.startFrame <= frame && frame < item.endFrame);
  return Math.max(0, Math.min(100, Math.round(((point?.peak ?? 0) / 32768) * 100)));
}

function selectionForArchivedAsset(selection: WordSelection, asset: ProjectMediaAsset, visibleAssetId: string | null): WordSelection {
  if (selection.scope) return selection.scope.kind === "asset" && selection.scope.id === asset.id &&
    selection.scope.revision === asset.updatedAt ? selection : EMPTY_SELECTION;
  return visibleAssetId === asset.id ? selection : EMPTY_SELECTION;
}

export function ObsLiveLinkTimeline({ projectId, resumeProjectId, projectName = projectId, requestedRecordingId, onRecordingIdChange, onPlayheadChange,
                                      transcriptRows = [], seekRequest = null, selectedOverlap = null, onOverlapSelect,
                                      assets = EMPTY_ASSETS, onCutsChange, visibleAssetId = null, visibleAssetIds = null, speakers = [], onAssetWordsChange,
                                      onAssetTimelineStateChange, onUndo, onRedo, wordSelection = EMPTY_SELECTION, onWordSelectionChange,
                                      clippingHighlightAutoHide = false, scrubPreviewPosition = "center" }: {
  projectId: string; resumeProjectId?: string; projectName?: string; requestedRecordingId: string | null;
  onRecordingIdChange?: (recordingId: string) => void;
  onPlayheadChange?: (seconds: number) => void;
  transcriptRows?: ObsLiveLinkTranscriptRow[];
  assets?: ProjectMediaAsset[];
  speakers?: SpeakerProfile[];
  onAssetWordsChange?: (assetId: string, words: ProjectMediaAsset["words"], text?: string) => void;
  onAssetTimelineStateChange?: (assetId: string, state: TimelineEditState) => Promise<void>;
  onUndo?: () => void;
  onRedo?: () => void;
  visibleAssetId?: string | null;
  visibleAssetIds?: string[] | null;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
  onCutsChange?: (assetIds: string[], ranges: TimelineEditRange[]) => Promise<boolean> | boolean | void;
  seekRequest?: ObsTimelineSeekRequest | null;
  selectedOverlap?: ObsOverlapSelection | null;
  onOverlapSelect?: (selection: ObsOverlapSelection | null) => void;
  clippingHighlightAutoHide?: boolean;
  scrubPreviewPosition?: ScrubPreviewPosition;
}) {
  const [status, setStatus] = useState<ObsLiveLinkStatus | null>(null);
  const [journals, setJournals] = useState<ObsLiveLinkRecordingJournal[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(requestedRecordingId);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [waveforms, setWaveforms] = useState<Record<string, ObsLiveLinkWaveform>>({});
  const [windowStart, setWindowStart] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [playing, setPlaying] = useState(false);
  const [focusedWordSelection, setFocusedWordSelection] = useState<WordSelection>(EMPTY_SELECTION);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [recordingsError, setRecordingsError] = useState<string | null>(null);
  const visibleError = statusError ?? recordingsError ?? error;
  const [archiveRetry, setArchiveRetry] = useState(0);
  const [layout, setLayout] = useState<Layout>("layers");
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [windowSeconds, setWindowSeconds] = useState<number>(DEFAULT_WINDOW_SECONDS);
  const { gains: gainByChannel, setGains: setGainByChannel, muted: mutedByChannel,
    setMuted: setMutedByChannel, solo: soloByChannel, setSolo: setSoloByChannel } = usePreviewMixer();
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [editBusy, setEditBusy] = useState(false);
  const [followLive, setFollowLive] = useState(true);
  const [editFocus, setEditFocus] = useState<{ assetId: string; request: { wordIndex?: number; insertTime?: number; promoteIndex?: number; contextIndex?: number; contextTime?: number; serial: number } } | null>(null);
  const editFocusRef = useRef(editFocus);
  const moduleRef = useRef<HTMLElement>(null);
  useScriptShortcuts(moduleRef, { undo: onUndo, redo: onRedo }, ".timeline-module", !editFocus);
  editFocusRef.current = editFocus;
  const audioRef = useRef<HTMLAudioElement>(null);
  const otherAudioRefs = useRef(new Map<string, HTMLAudioElement>());
  const otherAudioCallbacks = useRef(new Map<string, (element: HTMLAudioElement | null) => void>());
  const setMainAudio = useCallback((element: HTMLAudioElement | null) => {
    const previous = audioRef.current;
    audioRef.current = element;
    if (!element) previous?.pause();
  }, []);
  function otherAudioCallback(channelId: string) {
    let callback = otherAudioCallbacks.current.get(channelId);
    if (!callback) {
      callback = (element) => {
        if (element) otherAudioRefs.current.set(channelId, element);
        else { otherAudioRefs.current.get(channelId)?.pause(); otherAudioRefs.current.delete(channelId); }
      };
      otherAudioCallbacks.current.set(channelId, callback);
    }
    return callback;
  }
  const audioGraphRef = useRef<PreviewAudioGraph | null>(null);
  const windowRef = useRef({ start: 0, end: DEFAULT_WINDOW_SECONDS });
  const recordingIdRef = useRef<string | null>(null);
  const lastLiveStatusRef = useRef<ObsLiveLinkStatus | null>(null);
  const scrubbingRef = useRef(false);
  const scrubStartXRef = useRef(0);
  const autoScrollElementRef = useRef<HTMLElement | null>(null);
  const suppressClickRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const playbackActionRef = useRef<() => void>(() => undefined);
  const handledSeekRef = useRef<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const columnResizeRef = useRef<{ channelId: string; pointerId: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => setSelectedRecordingId(requestedRecordingId), [projectId, requestedRecordingId]);
  useEffect(() => {
    setJournals([]);
    setRecordingsError(null);
  }, [projectId]);
  useEffect(() => {
    let active = true;
    const refresh = () => void api.listObsLiveLinkRecordings(projectId)
      .then((records) => { if (active) { setJournals(records); setRecordingsError(null); } })
      .catch((reason) => { if (active) setRecordingsError(reason instanceof Error ? reason.message : "Không đọc được bản ghi OBS."); });
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId, status?.appRecording?.recordingId]);

  useEffect(() => subscribeObsLiveLinkWaveforms(projectId,
    () => ({ startSeconds: Math.max(windowRef.current.start, windowRef.current.end - MAX_LIVE_WINDOW_SECONDS),
      endSeconds: windowRef.current.end, maxPoints: 600 }),
    (incoming) => {
      if (incoming.recordingId !== recordingIdRef.current) return;
      setError(null);
      setWaveforms((current) => ({ ...current,
        [incoming.channelId]: mergeWaveform(current[incoming.channelId], incoming) }));
    },
    (reason) => setError(reason instanceof Error ? reason.message : "Không tải được waveform OBS."),
    (next) => {
      setStatus(next);
      setStatusError(null);
      const liveId = next.appRecording?.projectId === projectId ? next.appRecording.recordingId : null;
      if (liveId) {
        lastLiveStatusRef.current = next;
        recordingIdRef.current = liveId;
        setSelectedRecordingId(liveId);
      }
    },
    (reason) => setStatusError(reason instanceof Error ? reason.message : "Không đọc được trạng thái OBS.")), [projectId]);

  const active = status?.appRecording?.projectId === projectId &&
    (!requestedRecordingId || requestedRecordingId === status.appRecording.recordingId) ? status.appRecording : null;
  // A workspace selection must win before the local state sync effect runs;
  // otherwise the previous footage is echoed back and both selections oscillate.
  const recordingId = active?.recordingId ?? requestedRecordingId ?? selectedRecordingId ?? journals[0]?.recording.recordingId ?? null;
  const resumeSource: ResumeSource = { kind: "obs", id: recordingId ?? "" };
  const resumeIdentity = resumeProjectId && recordingId ? JSON.stringify([resumeProjectId, resumeSource]) : null;
  const [hydratedResumeIdentity, setHydratedResumeIdentity] = useState<string | null>(null);
  const activeResumeIdentityRef = useRef(resumeIdentity);
  activeResumeIdentityRef.current = resumeIdentity;
  const journal = journals.find((item) => item.recording.recordingId === recordingId);
  // Stop status can precede the journal-list reply. Retain only this take's
  // received lanes/clock until its durable journal replaces the live snapshot.
  const retainedLive = lastLiveStatusRef.current?.appRecording?.projectId === projectId &&
    lastLiveStatusRef.current.appRecording.recordingId === recordingId ? lastLiveStatusRef.current : null;
  const recording = active ?? journal?.recording ?? retainedLive?.appRecording ?? null;
  useEffect(() => {
    if (recordingId && recordingId !== requestedRecordingId) onRecordingIdChange?.(recordingId);
  }, [recordingId, requestedRecordingId, onRecordingIdChange]);
  const isLive = Boolean(active);
  const duration = recording ? recordingSeconds(recording, now) : 0;
  const resumeReady = Boolean(resumeProjectId && resumeIdentity && recording && journal && !isLive);
  recordingIdRef.current = recordingId;
  const lanes = useMemo(() => sourceLanes(!journal && !isLive ? retainedLive : status, journal,
    recordingId, isLive || Boolean(!journal && retainedLive)).filter((lane) => {
    if (isLive || !lane.assetId) return true;
    return assets.find((asset) => asset.id === lane.assetId)?.importSelected !== false;
  }), [status, journal, recordingId, isLive, assets, retainedLive]);
  const selectionIds = visibleAssetIds ?? (visibleAssetId ? [visibleAssetId] : null);
  const visibleLanes = selectionIds !== null ? lanes.filter((lane) => lane.assetId && selectionIds.includes(lane.assetId))
    : seekRequest?.selectOnly && seekRequest.recordingId === recordingId
      ? lanes.filter((lane) => lane.channelId === seekRequest.channelId) : lanes;
  const hasSolo = lanes.some((lane) => soloByChannel[`${projectId}:${recordingId}:${lane.channelId}`]);
  const previewGain = (channelId: string) => {
    const key = `${projectId}:${recordingId}:${channelId}`;
    return mutedByChannel[key] || hasSolo && !soloByChannel[key] ? 0 : (gainByChannel[key] ?? 100) / 100;
  };
  const visibleLaneIds = visibleLanes.map((lane) => lane.channelId).join(",");
  const defaultColumnWidth = viewportWidth
    ? Math.max(240, Math.min(800, Math.floor((viewportWidth - 12 - (visibleLanes.length - 1) * 6) / Math.max(1, visibleLanes.length))))
    : 360;
  const waveformWidth = layout === "columns"
    ? (columnWidths[visibleLanes[0]?.channelId ?? ""] ?? defaultColumnWidth) * 0.62
    : Math.max(240, viewportWidth - 216);
  const maximumWindowSpan = isLive ? Math.max(MAX_LIVE_WINDOW_SECONDS, duration) : Math.max(Number.EPSILON, duration);
  const minimumWindowSpan = Math.min(maximumWindowSpan, minimumTimelineSpan(maximumWindowSpan, waveformWidth));
  const visibleSpan = (seconds: number) => Math.max(minimumWindowSpan, Math.min(maximumWindowSpan, seconds));
  const windowSpan = visibleSpan(windowSeconds);
  const rulerWidth = layout === "layers" ? Math.max(waveformWidth, viewportWidth - 124) : waveformWidth;
  const rulerMarks = visibleTimelineRulerMarks(duration, windowStart, windowSpan, waveformWidth);
  windowRef.current = { start: windowStart, end: windowStart + windowSpan };
  const laneTargets = lanes.map((lane) => `${lane.channelId}:${lane.assetId ?? ""}`).join(",");
  const overlapByUtterance = useMemo(() => obsOverlapByUtterance(transcriptRows), [transcriptRows]);
  const archivedTranscriptGaps = useMemo(() => new Map(lanes.filter((lane) => lane.assetId).map((lane) => [lane.channelId,
    archiveTranscriptGaps(assets.find((asset) => asset.id === lane.assetId)?.words ?? [],
      transcriptRows.filter((row) => row.recordingId === recordingId && row.channelId === lane.channelId))])),
  [assets, recordingId, transcriptRows, laneTargets]);
  const detailedOverlaps = useMemo(() => {
    const tracks = assets.filter((asset) => asset.obsRecordingId === recordingId && asset.sourceArchiveAssetId &&
      asset.importSelected !== false);
    if (!tracks.some((track) => track.words?.length || (track.transcriptionStatus === "complete" && track.text?.trim()))) return null;
    const rows = channelScriptRows(tracks);
    const byAsset = new Map<string, TimelineOverlap[]>();
    rows.forEach((row, rowIndex) => row.overlaps.forEach((interval) => {
      const sourceIds = [...new Set(rows.filter((peer) => peer.overlaps.some((part) =>
        Math.min(part.endSeconds, interval.endSeconds) > Math.max(part.startSeconds, interval.startSeconds)))
        .map((peer) => peer.trackId))];
      const markers = byAsset.get(row.trackId) ?? [];
      markers.push({ ...interval, sourceIds, markerId: `${rowIndex}-${interval.startSeconds}` });
      byAsset.set(row.trackId, markers);
    }));
    return byAsset;
  }, [assets, recordingId]);
  const laneIds = lanes.map((lane) => lane.channelId).join(",");
  const clampColumnWidth = (value: number) => Math.max(240, Math.min(1200, Math.round(value)));

  function beginColumnResize(event: PointerEvent<HTMLDivElement>, channelId: string) {
    event.preventDefault();
    event.stopPropagation();
    const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? defaultColumnWidth;
    columnResizeRef.current = { channelId, pointerId: event.pointerId, startX: event.clientX, startWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveColumnResize(event: PointerEvent<HTMLDivElement>) {
    const resize = columnResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setColumnWidths((current) => ({ ...current,
      [resize.channelId]: clampColumnWidth(resize.startWidth + event.clientX - resize.startX) }));
  }

  function endColumnResize(event: PointerEvent<HTMLDivElement>) {
    if (columnResizeRef.current?.pointerId !== event.pointerId) return;
    columnResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const assetIds = lanes.map((lane) => lane.assetId).filter((id): id is string => Boolean(id));
  const primaryAsset = assets.find((asset) => asset.id === assetIds[0]);
  const sharedCuts = primaryAsset?.removedRanges ?? [];
  const sharedWorkingRange = primaryAsset?.workingRange ?? null;
  const sharedCutPoints = primaryAsset?.cutPoints ?? [];
  const excludedRanges = useMemo(() => excludedTimelineRanges(duration, sharedCuts, isLive ? null : sharedWorkingRange), [duration, sharedCuts, sharedWorkingRange, isLive]);
  const sections = useMemo(() => timelineSections(duration, sharedCutPoints), [duration, sharedCutPoints]);
  const canMark = !isLive && lanes.length > 0 && assetIds.length === lanes.length;
  const canEdit = canMark && Boolean(onAssetTimelineStateChange ?? onCutsChange) && !editBusy;

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<TimestampPromotion>).detail;
      if (isLive || detail.index == null || editFocusRef.current?.assetId === detail.assetId) return;
      const asset = assets.find((item) => item.id === detail.assetId && assetIds.includes(item.id));
      if (asset) focusArchivedTrack(asset, { promoteIndex: detail.index });
    };
    window.addEventListener(TIMESTAMP_PROMOTION_EVENT, receive);
    return () => window.removeEventListener(TIMESTAMP_PROMOTION_EVENT, receive);
  }, [isLive, assets, laneTargets, onAssetWordsChange, onAssetTimelineStateChange]);
  useEffect(() => {
    setMarkIn(sharedWorkingRange?.start ?? null);
    setMarkOut(sharedWorkingRange?.end ?? null);
  }, [primaryAsset?.id, sharedWorkingRange?.start, sharedWorkingRange?.end]);

  useEffect(() => {
    if (resumeProjectId && !isLive && (!resumeReady || hydratedResumeIdentity !== resumeIdentity)) return;
    onPlayheadChange?.(currentTime);
  }, [currentTime, onPlayheadChange, resumeProjectId, isLive, resumeReady, hydratedResumeIdentity, resumeIdentity]);
  const activeWords = Object.fromEntries(visibleLanes.flatMap((lane) => {
    if (!lane.assetId) return [];
    const words = assets.find((asset) => asset.id === lane.assetId)?.words ?? [];
    return [[lane.assetId, !isLive ? activePlaybackWordAt(words, currentTime) : -1]];
  }));
  // The focused standard Timeline owns the clock while editing a track.
  usePlaybackPublisher(editFocus ? null : activeWords);
  useLayoutEffect(() => subscribePlaybackSeek((assetId, seconds) => {
    if (isLive || !visibleLanes.some((lane) => lane.assetId === assetId)) return;
    setEditFocus(null);
    seekTime(seconds);
  }));
  useEffect(() => {
    if (isLive || editFocus || !visibleAssetId || !wordSelection.indexes.length || wordSelection.anchor === null) return;
    const word = assets.find((asset) => asset.id === visibleAssetId)?.words?.[wordSelection.anchor];
    if (word) seekTime(word.start);
  // Only a new selection may seek; refreshed words and playback must not rewind it.
  }, [wordSelection, visibleAssetId]);

  useEffect(() => {
    setWaveforms({});
    setWindowStart(0);
    setCurrentTime(0);
    setPlaying(false);
    setMarkIn(primaryAsset?.workingRange?.start ?? null);
    setMarkOut(primaryAsset?.workingRange?.end ?? null);
    setSelectedSections([]);
    setFollowLive(true);
    setWindowSeconds(DEFAULT_WINDOW_SECONDS);
  }, [recordingId]);
  useEffect(() => {
    if (!resumeReady || !resumeProjectId || !resumeIdentity) return;
    const restored = loadResumePosition(resumeProjectId, resumeSource, duration) ?? 0;
    setCurrentTime(restored);
    forEachPlaybackAudio((audio) => {
      if (audio.readyState >= 1) audio.currentTime = Math.min(restored, Number.isFinite(audio.duration) ? audio.duration : restored);
    });
    setHydratedResumeIdentity(resumeIdentity);
  // Read once for each archived recording identity, after its journal is ready.
  }, [resumeIdentity, resumeReady]);
  useEffect(() => {
    if (!resumeReady || !resumeProjectId || !resumeIdentity || hydratedResumeIdentity !== resumeIdentity) return;
    saveResumePosition(resumeProjectId, resumeSource, currentTime);
  }, [currentTime, hydratedResumeIdentity, resumeIdentity, resumeProjectId, resumeReady]);
  useEffect(() => setColumnWidths({}), [projectId]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setViewportWidth(viewport.clientWidth);
      setViewportHeight(viewport.clientHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!isLive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isLive]);
  useEffect(() => {
    if (!isLive || !followLive) return;
    setCurrentTime(duration);
    if (duration > windowSeconds + windowStart) {
      const step = windowSeconds / 4;
      setWindowStart(Math.ceil((duration - windowSeconds) / step) * step);
    }
  }, [duration, isLive, followLive, windowStart, windowSeconds]);
  useEffect(() => {
    if (!seekRequest || seekRequest.recordingId !== recordingId) return;
    const key = `${recordingId}:${seekRequest.serial}`;
    if (handledSeekRef.current === key) return;
    const target = lanes.find((lane) => lane.channelId === seekRequest.channelId || lane.assetId === seekRequest.assetId);
    if (!target) return;
    handledSeekRef.current = key;
    setSelectedChannelId(target.channelId);
    if (seekRequest.selectOnly) return;
    seekTime(seekRequest.seconds);
  }, [seekRequest?.serial, recordingId, laneTargets]);
  useEffect(() => {
    if (!isLive && recording) setCurrentTime((time) => Math.min(time, duration));
  }, [isLive, recording, duration]);
  useEffect(() => {
    if (!lanes.length) return;
    if (lanes.some((lane) => lane.channelId === selectedChannelId)) return;
    const requested = seekRequest?.recordingId === recordingId
      ? lanes.find((lane) => lane.channelId === seekRequest.channelId || lane.assetId === seekRequest.assetId)
      : null;
    setSelectedChannelId(requested?.channelId ?? lanes.find((lane) => lane.assetId)?.channelId ?? lanes[0].channelId);
  }, [laneIds, selectedChannelId, journal, recordingId, seekRequest?.serial]);

  useEffect(() => {
    if (!recordingId || !lanes.length || isLive) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    const request = lanes.map(async (lane) => {
      const waveform = await api.getObsLiveLinkWaveform(projectId, recordingId, lane.channelId,
        windowStart, windowStart + windowSpan, 600);
      if (!cancelled) setWaveforms((current) => ({ ...current, [lane.channelId]: waveform }));
    });
    void Promise.all(request).then(() => { if (!cancelled) setError(null); }).catch((reason) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : "Không tải được các track OBS.");
      retryTimer = window.setTimeout(() => setArchiveRetry((value) => value + 1), 2_000);
    });
    return () => { cancelled = true; window.clearTimeout(retryTimer); };
  }, [projectId, recordingId, isLive, journal?.recording.archiveStatus, laneIds, windowStart, windowSpan, archiveRetry]);

  const selectedLane = visibleLanes.find((lane) => lane.channelId === selectedChannelId) ?? visibleLanes[0];
  const focusedAsset = editFocus ? assets.find((asset) => asset.id === editFocus.assetId) : undefined;
  const playbackUrl = selectedLane?.assetId
    ? `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(selectedLane.assetId)}/audio`
    : null;
  const audioScrubber = useAudioScrubber(`${recordingId}:${playbackUrl}:${isLive}`, scrubPreviewPosition);
  const dragAutoScroll = useDragAutoScroll({ sourceKey: `${recordingId}:${isLive}`,
    viewport: () => {
      const element = autoScrollElementRef.current;
      if (isLive || !element) return null;
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, width: bounds.width, start: windowStart, span: windowSpan, duration };
    },
    pan: (start) => setWindowStart(Math.max(0, Math.min(Math.max(0, duration - windowSpan), start))),
    seek: (seconds) => seekTime(seconds, false),
  });
  const selectedGain = selectedLane ? gainByChannel[`${projectId}:${recordingId}:${selectedLane.channelId}`] ?? 100 : 100;
  const selectedMuted = selectedLane ? mutedByChannel[`${projectId}:${recordingId}:${selectedLane.channelId}`] ?? false : false;
  const playhead = ((currentTime - windowStart) / windowSpan) * 100;
  const markInPosition = markIn === null ? null : ((markIn - windowStart) / windowSpan) * 100;
  const canPlay = !isLive && visibleLanes.some((lane) => lane.assetId);

  function focusArchivedTrack(asset: ProjectMediaAsset, request: { wordIndex?: number; insertTime?: number; promoteIndex?: number; contextIndex?: number; contextTime?: number }) {
    if (isLive || (!asset.words?.length && request.insertTime === undefined && request.contextTime === undefined) || !onAssetWordsChange || !onAssetTimelineStateChange) return;
    const lane = lanes.find((item) => item.assetId === asset.id);
    if (lane) setSelectedChannelId(lane.channelId);
    pausePlayback();
    setFocusedWordSelection(EMPTY_SELECTION);
    setEditFocus({ assetId: asset.id, request: { ...request, serial: Date.now() } });
  }

  function forEachPlaybackAudio(callback: (audio: HTMLAudioElement, channelId: string) => void) {
    if (audioRef.current && selectedLane) callback(audioRef.current, selectedLane.channelId);
    otherAudioRefs.current.forEach(callback);
  }

  function pausePlayback() {
    forEachPlaybackAudio((audio) => audio.pause());
    setPlaying(false);
  }

  function togglePlayback() {
    if (!canPlay) return;
    audioScrubber.end();
    if (playing) { pausePlayback(); return; }
    const start = nextPlayableTime(currentTime, duration, excludedRanges);
    if (start >= duration) return;
    setCurrentTime(start);
    const audios: HTMLAudioElement[] = [];
    forEachPlaybackAudio((audio) => { audio.currentTime = start; audio.playbackRate = playbackRate; audios.push(audio); });
    if (!audios.length) return;
    if (audioRef.current) preparePreviewAudio(audioRef.current);
    void Promise.all(audios.map((audio) => audio.play())).then(() => setPlaying(true)).catch(() => {
      pausePlayback(); setError("Không phát được tất cả track OBS.");
    });
  }
  playbackActionRef.current = togglePlayback;

  useEffect(() => {
    const module = viewportRef.current?.closest(".obs-timeline");
    if (!module) return;
    let pointerInside = false;
    const enter = () => { pointerInside = true; };
    const leave = () => { pointerInside = false; };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!pointerInside || event.key !== " " || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
          (target instanceof HTMLElement && (target.isContentEditable ||
            Boolean(target.closest("input, textarea, select, button, [role='slider']"))))) return;
      event.preventDefault();
      playbackActionRef.current();
    };
    module.addEventListener("pointerenter", enter);
    module.addEventListener("pointerleave", leave);
    window.addEventListener("keydown", keydown);
    return () => {
      module.removeEventListener("pointerenter", enter);
      module.removeEventListener("pointerleave", leave);
      window.removeEventListener("keydown", keydown);
    };
  }, []);

  useLayoutEffect(() => {
    if (audioGraphRef.current?.element === audioRef.current) {
      audioGraphRef.current.gain.gain.value = selectedLane ? previewGain(selectedLane.channelId) : 0;
    } else if (audioRef.current) {
      audioRef.current.volume = selectedLane ? Math.min(1, previewGain(selectedLane.channelId)) : 0;
    }
  }, [playbackUrl, selectedGain, selectedMuted, hasSolo, soloByChannel, visibleLaneIds]);
  useLayoutEffect(() => {
    otherAudioRefs.current.forEach((audio, channelId) => {
      audio.volume = Math.min(1, previewGain(channelId));
    });
  }, [recordingId, playbackUrl, gainByChannel, mutedByChannel, soloByChannel, hasSolo, visibleLaneIds]);
  useEffect(() => {
    forEachPlaybackAudio((audio) => { audio.playbackRate = playbackRate; });
  }, [playbackUrl, playbackRate]);

  useEffect(() => {
    if (!visibleLanes.length) { setPlaying(false); return; }
    if (!playing || isLive) return;
    const audios: HTMLAudioElement[] = [];
    forEachPlaybackAudio((audio) => { audio.currentTime = currentTime; audios.push(audio); });
    if (audioRef.current) preparePreviewAudio(audioRef.current);
    void Promise.all(audios.map((audio) => audio.play())).catch(() => {
      pausePlayback(); setError("Không phát được tất cả track OBS.");
    });
  // Reconnect the selected player when the user changes the focused lane.
  }, [playbackUrl, visibleLaneIds]);

  useEffect(() => () => {
    const graph = audioGraphRef.current;
    if (!graph) return;
    graph.element.pause();
    graph.source.disconnect();
    graph.gain.disconnect();
    void graph.context.close().catch(() => undefined);
    audioGraphRef.current = null;
  }, [playbackUrl]);

  function preparePreviewAudio(audio: HTMLAudioElement) {
    if (!audioGraphRef.current && typeof AudioContext !== "undefined") {
      let context: AudioContext | null = null;
      try {
        context = new AudioContext();
        const source = context.createMediaElementSource(audio);
        const gain = context.createGain();
        source.connect(gain);
        gain.connect(context.destination);
        audioGraphRef.current = { context, source, gain, element: audio };
      } catch {
        if (context) void context.close().catch(() => undefined);
        setError("Không tạo được bộ gain nghe lại; trình duyệt sẽ chỉ phát tối đa 100%.");
      }
    }
    const graph = audioGraphRef.current;
    if (graph?.element === audio) {
      audio.volume = 1;
      graph.gain.gain.value = selectedLane ? previewGain(selectedLane.channelId) : 0;
      void graph.context.resume().catch(() => setError("Không kích hoạt được gain nghe lại."));
    } else {
      audio.volume = selectedLane ? Math.min(1, previewGain(selectedLane.channelId)) : 0;
      if (selectedGain > 100) setError("Trình duyệt không hỗ trợ tăng gain nghe lại trên 100%.");
    }
  }

  function zoomTarget(direction: -1 | 1): number | null {
    const next = visibleSpan(windowSpan * (direction === 1 ? 2 : 0.5));
    return next === windowSpan ? null : next;
  }

  function selectWindow(next: number) {
    const nextSpan = visibleSpan(next);
    setWindowStart(isLive ? Math.max(0, duration - nextSpan) :
      zoomWindowStart(currentTime, nextSpan, duration));
    setWindowSeconds(nextSpan >= maximumWindowSpan ? Number.POSITIVE_INFINITY : nextSpan);
  }

  function changeWindow(direction: -1 | 1) {
    const next = zoomTarget(direction);
    if (next !== null) selectWindow(next);
  }

  function positionSeconds(clientX: number, element: HTMLElement): number | null {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width) return null;
    const position = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return Math.min(duration, element.classList.contains("obs-timeline__scrub")
      ? position * duration : windowStart + position * windowSpan);
  }

  function seekTime(seconds: number, reveal = true) {
    if (!Number.isFinite(seconds)) return;
    const next = Math.max(0, Math.min(duration, seconds));
    setCurrentTime(next);
    setFollowLive(false);
    if (reveal && (next < windowStart || next > windowStart + windowSpan)) {
      setWindowStart(Math.max(0, Math.min(Math.max(0, duration - windowSpan), next - windowSpan / 2)));
    }
    if (audioScrubber.active) audioScrubber.move(next);
    else forEachPlaybackAudio((audio) => { audio.currentTime = Math.min(next, audio.duration || next); });
  }

  function seek(clientX: number, element: HTMLElement) {
    if (!element.classList.contains("obs-timeline__scrub") && dragAutoScroll.seek(clientX)) return;
    const next = positionSeconds(clientX, element);
    if (next !== null) seekTime(next);
  }

  function clickSeek(event: MouseEvent<HTMLElement>, lane?: Lane, overlaps: TimelineOverlap[] = []) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    const seconds = positionSeconds(event.clientX, event.currentTarget);
    if (seconds === null) return;
    const overlap = overlaps.find((item) => item.startSeconds <= seconds && seconds < item.endSeconds);
    if (isLive && !overlap) { onOverlapSelect?.(null); return; }
    notifyPlaybackInteraction(lane?.assetId ? [lane.assetId] : assetIds);
    seek(event.clientX, event.currentTarget);
    if (overlap && lane && recordingId) {
      setSelectedChannelId(lane.channelId);
      onOverlapSelect?.({ recordingId, startSeconds: overlap.startSeconds,
        endSeconds: overlap.endSeconds, sourceIds: overlap.sourceIds });
    } else onOverlapSelect?.(null);
  }

  function beginScrub(event: PointerEvent<HTMLElement>) {
    if (isLive || event.button !== 0) return;
    if (!event.currentTarget.classList.contains("obs-timeline__scrub")) {
      autoScrollElementRef.current = event.currentTarget;
      dragAutoScroll.begin(event.clientX);
    }
    notifyPlaybackInteraction(assetIds);
    const audios: HTMLAudioElement[] = [];
    forEachPlaybackAudio((audio) => audios.push(audio));
    audioScrubber.begin(audios, (time) => !excludedRanges.some((range) => range.start <= time && time < range.end),
      (time) => Math.min(duration, ...excludedRanges.filter((range) => range.start > time).map((range) => range.start)),
      (time) => Math.max(0, ...excludedRanges.filter((range) => range.end <= time).map((range) => range.end)));
    setPlaying(false);
    if (audioRef.current) preparePreviewAudio(audioRef.current);
    scrubbingRef.current = true;
    scrubStartXRef.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seek(event.clientX, event.currentTarget);
  }

  function moveScrub(event: PointerEvent<HTMLElement>) {
    if (scrubbingRef.current) { dragAutoScroll.move(event.clientX); seek(event.clientX, event.currentTarget); }
  }

  function endScrub(event: PointerEvent<HTMLElement>) {
    if (!scrubbingRef.current) return;
    seek(event.clientX, event.currentTarget);
    const heldAtEdge = dragAutoScroll.stop();
    scrubbingRef.current = false;
    audioScrubber.end();
    suppressClickRef.current = heldAtEdge || Math.abs(event.clientX - scrubStartXRef.current) > 2;
    if (suppressClickRef.current) window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function cancelScrub(event: PointerEvent<HTMLElement>) {
    dragAutoScroll.stop();
    scrubbingRef.current = false;
    audioScrubber.end();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function saveTimelineState(state: TimelineEditState): Promise<boolean> {
    if (!canEdit) return false;
    setEditBusy(true);
    try {
      if (onAssetTimelineStateChange) {
        for (const id of assetIds) await onAssetTimelineStateChange(id, state);
      } else if (onCutsChange && await onCutsChange(assetIds, state.removedRanges) === false) return false;
      setStatusError(null);
      return true;
    } catch (reason) {
      setStatusError(reason instanceof Error ? reason.message : "Không lưu được chỉnh sửa Timeline cho các channel OBS.");
      return false;
    }
    finally { setEditBusy(false); }
  }
  function markWorkingRange(kind: "in" | "out") {
    const start = kind === "in" ? currentTime : markIn;
    const end = kind === "out" ? currentTime : markOut;
    if (kind === "in") setMarkIn(currentTime); else setMarkOut(currentTime);
    if (start === null || end === null || start === end) return;
    void saveTimelineState({ removedRanges: sharedCuts, cutPoints: sharedCutPoints,
      workingRange: { id: "working", start: Math.min(start, end), end: Math.max(start, end) } });
  }
  function cutAtPlayhead() {
    if (currentTime <= 0 || currentTime >= duration) return;
    void saveTimelineState({ removedRanges: sharedCuts, workingRange: sharedWorkingRange,
      cutPoints: [...new Set([...sharedCutPoints, currentTime])].sort((a, b) => a - b) });
  }
  function deleteSelectedSections() {
    const selected = sections.filter((section) => selectedSections.includes(section.id));
    if (!selected.length) return;
    void saveTimelineState({ removedRanges: excludedTimelineRanges(duration, [...sharedCuts, ...selected], null),
      workingRange: sharedWorkingRange, cutPoints: sharedCutPoints });
    setSelectedSections([]);
  }
  function uncutSelectedSections() {
    const selected = sections.filter((section) => selectedSections.includes(section.id));
    const edges = new Set(selected.flatMap((section) => [section.start, section.end]));
    void saveTimelineState({ removedRanges: selected.length ? restoreTimelineSections(sharedCuts, selected) : [],
      workingRange: sharedWorkingRange, cutPoints: selected.length ? sharedCutPoints.filter((point) => !edges.has(point)) : [] });
    setSelectedSections([]);
  }
  function resetTimelineEdits() {
    void saveTimelineState({ removedRanges: [], workingRange: null, cutPoints: [] }).then((saved) => {
      if (saved) { setMarkIn(null); setMarkOut(null); setSelectedSections([]); }
    });
  }

  function reportFocusedPlayhead(seconds: number) {
    if (!Number.isFinite(seconds) || !resumeProjectId || !resumeIdentity || activeResumeIdentityRef.current !== resumeIdentity || isLive) return;
    const next = Math.max(0, Math.min(duration, seconds));
    setCurrentTime(next);
    forEachPlaybackAudio((audio) => { audio.currentTime = Math.min(next, Number.isFinite(audio.duration) ? audio.duration : next); });
  }

  if (focusedAsset && editFocus && !isLive) return <Timeline resumeProjectId={resumeProjectId} resumeSource={resumeSource}
    onPlayheadChange={reportFocusedPlayhead} onUndo={onUndo} onRedo={onRedo} rangeSelectionEnabled
    scrubPreviewPosition={scrubPreviewPosition} clippingHighlightAutoHide={clippingHighlightAutoHide}
    wordSelection={visibleAssetId === focusedAsset.id ? wordSelection : focusedWordSelection}
    onWordSelectionChange={visibleAssetId === focusedAsset.id ? onWordSelectionChange : setFocusedWordSelection}
    editRequest={editFocus.request}
    gain={previewPercentToDb(selectedLane ? previewGain(selectedLane.channelId) * 100 : 0)}
    onGainChange={(value) => {
      if (!selectedLane) return;
      const key = `${projectId}:${recordingId}:${selectedLane.channelId}`;
      setMutedByChannel((current) => ({ ...current, [key]: false }));
      setGainByChannel((current) => ({ ...current, [key]: previewDbToPercent(value) }));
    }}
    onEditStateChange={(state) => { void saveTimelineState(state); }}
    onWordsChange={(words, text) => onAssetWordsChange?.(focusedAsset.id, words, text)}
    speakers={speakers}
    defaultSpeakerId={focusedAsset.speakerProfileIds?.[0] ?? null}
    take={{ id: focusedAsset.id, name: focusedAsset.name, url: `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(focusedAsset.id)}/audio`, duration: focusedAsset.duration, text: focusedAsset.text, words: focusedAsset.words }}
    workingRange={focusedAsset.workingRange ?? null} removedRanges={focusedAsset.removedRanges ?? []} cutPoints={focusedAsset.cutPoints ?? []}
    leadingActions={<>{statusError ? <span role="alert">{statusError}</span> : null}<button onClick={() => { setStatusError(null); setEditFocus(null); }} type="button">← TẤT CẢ TRACK OBS</button></>}
  />;

  return <ModuleFrame elementRef={moduleRef} eyebrow={isLive ? `REC LIVE · ${lanes.length} CHANNEL` : recordingId ? `OBS LIVELINK · ${recordingId.slice(0, 8)}` : "OBS LIVELINK"}
    title="Timeline" index="A1" tone="dark" className="timeline-module obs-timeline"
    action={<div className="timeline-header-actions obs-timeline__header-actions">
      <label title="Mỗi lần ghi OBS tạo một footage chứa các track và Script đi kèm">BẢN GHI <select aria-label="Bản ghi OBS" disabled={isLive} onChange={(event) => { setSelectedRecordingId(event.target.value); onRecordingIdChange?.(event.target.value); }} title={recording ? recordingDisplayName(recording, projectName) : undefined} value={recordingId ?? ""}>
        {!recordingId ? <option value="">Chưa có bản ghi</option> : null}
        {active && !journals.some((item) => item.recording.recordingId === active.recordingId) ?
          <option value={active.recordingId}>{recordingDisplayName(active, projectName)}</option> : null}
        {journals.map((item) => <option key={item.recording.recordingId} value={item.recording.recordingId}>
          {recordingDisplayName(item.recording, projectName)}
        </option>)}
      </select></label>
      {recording ? <span>{isLive ? recording.status === "paused" ? "PAUSED" : "REC LIVE" : recording.archiveStatus === "ready" ? "MKA READY" : "PCM SAVED"}</span> : null}
      <div aria-label="Kiểu hiển thị Timeline OBS" className="obs-timeline__layout" role="group">
        <button aria-pressed={layout === "columns"} onClick={() => setLayout("columns")} type="button">CỘT</button>
        <button aria-pressed={layout === "layers"} onClick={() => setLayout("layers")} type="button">LAYER</button>
      </div>
      <div className="timeline-edit-actions" role="group" aria-label="Timeline edit actions">
        <button disabled={!canMark || editBusy} onClick={() => markWorkingRange("in")} type="button">MARK IN</button>
        <button disabled={!canMark || editBusy} onClick={() => markWorkingRange("out")} type="button">MARK OUT</button>
        <button disabled={!canEdit || currentTime <= 0 || currentTime >= duration} onClick={cutAtPlayhead} type="button">CUT</button>
        <button disabled={!canEdit || (!sharedCuts.length && !sharedCutPoints.length)} onClick={uncutSelectedSections} type="button">UNCUT</button>
        <button className="is-delete" disabled={!canEdit || !selectedSections.length} onClick={deleteSelectedSections} type="button">DELETE</button>
        <button disabled={!canEdit || (!sharedCuts.length && !sharedCutPoints.length && markIn === null && markOut === null)} onClick={resetTimelineEdits} type="button">RESET</button>
      </div>
      <div aria-label="Zoom Timeline OBS" className="timeline-zoom obs-timeline__zoom" role="group">
        <button aria-label="Thu nhỏ Timeline OBS" disabled={zoomTarget(1) === null} onClick={() => changeWindow(1)} type="button">−</button>
        <input aria-label="Zoom timeline" aria-valuetext={timelineZoomResolution(windowSpan, waveformWidth)}
          disabled={maximumWindowSpan <= minimumWindowSpan} max={TIMELINE_ZOOM_STEPS} min={0}
          onChange={(event) => selectWindow(timelineSpanAtZoomPosition(Number(event.target.value), maximumWindowSpan, minimumWindowSpan))}
          step={1} type="range" value={timelineZoomPosition(maximumWindowSpan, windowSpan, minimumWindowSpan)} />
        <span title={`Cửa sổ ${windowSpan}s`}>{timelineZoomResolution(windowSpan, waveformWidth)}</span>
        <button aria-label="Phóng to Timeline OBS" disabled={zoomTarget(-1) === null} onClick={() => changeWindow(-1)} type="button">+</button>
      </div>
      <TimelinePlaybackSettings rate={playbackRate} onRateChange={setPlaybackRate}>
        <div className="obs-timeline__transport-extras">
          <span>{isLive ? "Đang thu" : selectedLane?.assetId ? `TRACK · ${selectedLane.label}` : "Track chưa sẵn sàng"}</span>
          {isLive && !followLive ? <button onClick={() => { setFollowLive(true); setCurrentTime(duration); }} type="button">VỀ LIVE</button> : null}
          <button aria-label="Lùi cửa sổ Timeline" disabled={windowStart === 0 || isLive}
            onClick={() => setWindowStart((value) => Math.max(0, value - windowSpan / 4))} type="button">←</button>
          <button aria-label="Tiến cửa sổ Timeline" disabled={isLive || windowStart + windowSpan >= duration}
            onClick={() => setWindowStart((value) => Math.min(Math.max(0, duration - windowSpan), value + windowSpan / 4))} type="button">→</button>
        </div>
      </TimelinePlaybackSettings>
    </div>}>
    {!isLive && canMark ? <div aria-label="Các đoạn footage OBS" className="timeline-section-strip">{sections.map((section) => <button
      key={section.id} type="button" disabled={!canEdit} aria-pressed={selectedSections.includes(section.id)}
      className={`${selectedSections.includes(section.id) ? "is-selected" : ""} ${sharedCuts.some((range) => range.start < section.end && range.end > section.start) ? "is-removed" : ""}`}
      style={{ flex: Math.max(.001, section.end - section.start) }}
      onClick={(event) => setSelectedSections((current) => event.ctrlKey || event.metaKey
        ? current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id] : [section.id])}>
      {clock(section.start)}–{clock(section.end)}</button>)}</div> : null}
    <div className="obs-timeline__main">
      {visibleError ? <p className="obs-timeline__error" role="alert">{visibleError}</p> : null}
      <div className="obs-timeline__viewport" ref={viewportRef}>
        <div className={`obs-timeline__track-scroll is-${layout}`} aria-label="Timeline đa kênh OBS"
          style={{ "--obs-layer-height": `${Math.max(110, Math.round(viewportHeight * 0.6))}px` } as CSSProperties}>
          {layout === "layers" ? <><div className="obs-timeline__label-spacer" />
            <div className="obs-timeline__ruler" aria-label="Ruler chung" onClick={(event) => {
              if (!isLive && event.target === event.currentTarget && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                onWordSelectionChange?.(EMPTY_SELECTION); setFocusedWordSelection(EMPTY_SELECTION);
              }
              clickSeek(event);
            }} onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub} onPointerCancel={cancelScrub}>
              {rulerMarks.map((mark) => <span key={mark.time} style={{ left: `${mark.position * waveformWidth / rulerWidth * 100}%` }}>
                {mark.label}
              </span>)}
            </div></> : null}
          {visibleLanes.map((lane) => {
            const subtitleLaneWidth = layout === "columns"
              ? (columnWidths[lane.channelId] ?? defaultColumnWidth) * 0.62
              : Math.max(240, viewportWidth - 124);
            const laneRulerMarks = layout === "columns"
              ? visibleTimelineRulerMarks(duration, windowStart, windowSpan, subtitleLaneWidth)
              : rulerMarks;
            const captions = transcriptRows.filter((row) => row.recordingId === recordingId && row.channelId === lane.channelId);
            const archivedAsset = !isLive && lane.assetId ? assets.find((asset) => asset.id === lane.assetId) : undefined;
            const overlaps: TimelineOverlap[] = detailedOverlaps
              ? detailedOverlaps.get(lane.assetId ?? "") ?? []
              : captions.flatMap((row) => (overlapByUtterance.get(row.utteranceId) ?? []).map((interval) => ({
                ...interval, sourceIds: [lane.channelId, ...interval.otherChannelIds],
                markerId: `${row.utteranceId}-${interval.startSeconds}`,
              })));
            const overlapSourceId = detailedOverlaps ? lane.assetId : lane.channelId;
            const selectedRanges = selectedOverlap && recordingId && overlapSourceId
              ? overlaps.filter((interval) => obsOverlapSelectionMatches(selectedOverlap, recordingId, overlapSourceId, interval))
                .map((interval) => ({ startSeconds: Math.max(interval.startSeconds, selectedOverlap.startSeconds),
                  endSeconds: Math.min(interval.endSeconds, selectedOverlap.endSeconds) }))
              : [];
            const archivedSelectionRanges = archivedAsset
              ? productionRanges(selectionForArchivedAsset(wordSelection, archivedAsset, visibleAssetId), archivedAsset.words ?? [])
              : [];
            const caption = isLive && followLive
              ? [...captions].reverse().find((row) => duration - row.endSeconds < 4)
              : [...captions].reverse().find((row) => row.startSeconds <= currentTime && currentTime <= Math.max(row.endSeconds, row.startSeconds + 1));
            const waveform = waveforms[lane.channelId];
            const sampleRate = waveform?.sampleRate ?? null;
            // Reproject received bins while Stop/archive or zoom data is loading.
            // Retain only this recording/channel's live PCM axis and reproject
            // bins that overlap the new viewport; never stretch an older window.
            const overlapsWindow = waveform && waveform.endSeconds > windowStart && waveform.startSeconds < windowStart + windowSpan;
            const sameSource = waveform?.recordingId === recordingId && waveform.channelId === lane.channelId &&
              (!isLive || waveform.sampleAxis === "channel");
            const points = sameSource && (overlapsWindow || !isLive) && sampleRate
              ? waveform.points.filter((point) => point.endFrame > windowStart * sampleRate &&
                point.startFrame < (windowStart + windowSpan) * sampleRate) : [];
            const hasPcm = points.some((point) => point.peak !== null);
            const path = waveformPath(points, sampleRate, windowStart, windowSpan,
              mutedByChannel[`${projectId}:${recordingId}:${lane.channelId}`] ? 0 : (gainByChannel[`${projectId}:${recordingId}:${lane.channelId}`] ?? 100) / 100);
            const receivedUntil = sampleRate ? points.reduce((latest, point) => point.peak === null
              ? latest : Math.max(latest, point.endFrame / sampleRate), 0) : 0;
            const liveChannel = status?.channels.find((channel) => channel.channelId === lane.channelId);
            const livePeak = liveChannel?.meterPeak ?? 0;
            const level = isLive ? Math.max(0, Math.min(100, Math.round(livePeak * 100))) :
              sourceLevel(waveform, currentTime);
            const gainKey = `${projectId}:${recordingId}:${lane.channelId}`;
            const gain = gainByChannel[gainKey] ?? 100;
            const intervalOrigin = recording?.startedMonotonicNs ?? 0;
            const intervals = [
              ...(recording?.capturePauseIntervals ?? []).map((part) => ({ ...part, reason: "app-paused" })),
              ...(recording?.channelIntervals ?? []).filter((part) => part.channelId === lane.channelId)
                .map((part) => ({ ...part, reason: part.reason })),
            ];
            const sourceAbsences = intervals.filter((part) => part.reason === "source-missing");
            const sourceAbsent = isLive && (liveChannel?.missing || sourceAbsences.some((part) => part.endMonotonicNs === null));
            const missing = isLive ? missingPcmRanges(points, sampleRate, duration, sourceAbsences.map((part) => ({
              start: (part.startMonotonicNs - intervalOrigin) / 1e9,
              end: part.endMonotonicNs === null ? duration : (part.endMonotonicNs - intervalOrigin) / 1e9,
            }))) : [];
            const pendingSeconds = isLive && !sourceAbsent && followLive && hasPcm ? Math.max(0, duration - receivedUntil) : 0;
            // Keep the rendered width equal to the separator value, including lanes
            // the user has not resized yet. Flex growth otherwise changes sibling widths.
            return <div className="obs-timeline__lane" key={lane.channelId}
              style={layout === "columns" ? { flexBasis: columnWidths[lane.channelId] ?? defaultColumnWidth, flexGrow: 0 } : undefined}>
              <div className="obs-timeline__lane-header">
                <button aria-label={`Nghe kênh ${lane.label}`} aria-pressed={selectedLane?.channelId === lane.channelId}
                  className="obs-timeline__lane-label" onClick={() => setSelectedChannelId(lane.channelId)} type="button">
                  <TimelineLaneLabel text={`${obsTrackLabel(lane.label)} - ${lane.nativeName}`} />
                </button>
                <LaneMixerControls gain={gain} gainLabel={`Gain nghe lại ${lane.label}`} level={level}
                  levelLabel={`Level nguồn ${lane.label}`} muteLabel={`Tắt tiếng ${lane.label}`}
                  muted={Boolean(mutedByChannel[gainKey])} onGainChange={(value) => setGainByChannel((current) => ({
                    ...current, [gainKey]: value }))}
                  onMuteToggle={() => setMutedByChannel((current) => ({ ...current, [gainKey]: !current[gainKey] }))}
                  onSoloToggle={() => setSoloByChannel((current) => ({ ...current, [gainKey]: !current[gainKey] }))}
                  soloLabel={`Solo ${lane.label}`} solo={Boolean(soloByChannel[gainKey])}
                  soloTitle="Chỉ nghe các track đang Solo trong selection; Mute vẫn có hiệu lực"
                  title="Gain chỉ đổi âm lượng nghe lại trong Pro4Bro; không đổi fader OBS hoặc PCM/MKA gốc."
                  unmuteLabel={`Bật tiếng ${lane.label}`} unsoloLabel={`Bỏ Solo ${lane.label}`} />
              </div>
              {layout === "columns" ? <div aria-label={`Điều chỉnh độ rộng Timeline ${lane.label}`}
                aria-orientation="vertical" aria-valuemin={240} aria-valuemax={1200}
                aria-valuenow={columnWidths[lane.channelId] ?? defaultColumnWidth}
                className="obs-timeline__column-resizer" onKeyDown={(event) => {
                  const width = columnWidths[lane.channelId] ?? defaultColumnWidth;
                  const delta = event.key === "ArrowRight" ? 24 : event.key === "ArrowLeft" ? -24 : null;
                  if (delta === null && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  setColumnWidths((current) => ({ ...current, [lane.channelId]:
                    event.key === "Home" ? 240 : event.key === "End" ? 1200 : clampColumnWidth(width + (delta ?? 0)) }));
                }} onPointerCancel={endColumnResize} onPointerDown={(event) => beginColumnResize(event, lane.channelId)}
                onPointerMove={moveColumnResize} onPointerUp={endColumnResize} role="separator" tabIndex={0}
                title={`Kéo vách để đổi độ rộng Timeline ${lane.label}`} /> : null}
              {layout === "columns" ? <div aria-label={`Ruler ${lane.label}`} className="obs-timeline__ruler obs-timeline__column-ruler" onClick={clickSeek} onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub} onPointerCancel={cancelScrub}>
                {laneRulerMarks.map((mark) => <span key={mark.time} style={{ left: `${mark.position * 100}%` }}>{mark.label}</span>)}
              </div> : null}
              <div aria-label={`Sóng âm ${lane.label}`} className="obs-timeline__wave" role="img"
                onClick={(event) => {
                  if (!isLive && lane.assetId && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
                      (event.target === event.currentTarget || (event.target as HTMLElement).closest(".timeline-waveform__svg"))) {
                    onWordSelectionChange?.(EMPTY_SELECTION);
                    setFocusedWordSelection(EMPTY_SELECTION);
                  }
                  clickSeek(event, lane, overlaps);
                }}
                onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub} onPointerCancel={cancelScrub}>
                {intervals.map((part, index) => {
                  const from = (part.startMonotonicNs - intervalOrigin) / 1e9;
                  const to = part.endMonotonicNs === null ? duration : (part.endMonotonicNs - intervalOrigin) / 1e9;
                  const position = intervalPosition(from, to, windowStart, windowSpan);
                  return position ? <i aria-label={`${lane.label}: ${part.reason}`} className="obs-timeline__interval" key={`${part.reason}-${index}`} style={position} title={part.reason} /> : null;
                })}
                {waveform?.gaps?.map((gap, index) => {
                  if (!waveform.sampleRate) return null;
                  const position = intervalPosition(gap.startFrame / waveform.sampleRate,
                    gap.endFrame / waveform.sampleRate, windowStart, windowSpan);
                  return position ? <i aria-label={`${lane.label}: ${gap.classification}`} className="obs-timeline__gap" key={`gap-${index}`} style={position} title={gap.classification} /> : null;
                })}
                {missing.map((gap, index) => {
                  const position = intervalPosition(gap.start, gap.end, windowStart, windowSpan);
                  return position ? <i aria-label={`${lane.label}: thiếu PCM`} className="obs-timeline__gap"
                    key={`missing-${index}`} style={position} title="Chưa nhận PCM ở đoạn này" /> : null;
                })}
                {isLive ? captions.map((row) => {
                  const position = intervalPosition(row.startSeconds, Math.max(row.endSeconds, row.startSeconds + 0.08), windowStart, windowSpan);
                  return position ? <i aria-label={`Lượt nói ${lane.label} tại ${row.startSeconds.toFixed(2)}s`}
                    className="obs-timeline__speech-span" key={row.utteranceId} style={position} /> : null;
                }) : null}
                {selectedRanges.map((range) => {
                  const position = intervalPosition(range.startSeconds, range.endSeconds, windowStart, windowSpan);
                  return position ? <i aria-label={`Đoạn chồng tiếng đang chọn ${lane.label} ${obsOverlapTime(range.startSeconds)}–${obsOverlapTime(range.endSeconds)}`}
                    className="obs-timeline__selected-overlap" key={`${range.startSeconds}-${range.endSeconds}`} style={position} /> : null;
                })}
                {!isLive && lane.assetId ? <ArchivedObsWaveform
                  url={`/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(lane.assetId)}/waveform`}
                  windowStart={windowStart} windowSpan={windowSpan} duration={duration} width={subtitleLaneWidth}
                  gain={mutedByChannel[gainKey] ? 0 : gain / 100} fallbackPath={path}
                  clippingHighlightAutoHide={clippingHighlightAutoHide} /> :
                  <svg aria-hidden="true" className="timeline-waveform__svg is-live" preserveAspectRatio="none" viewBox="0 0 1000 60"><path d={path} /></svg>}
              <ScrubPreviewOverlay range={audioScrubber.range} windowStart={windowStart} windowSpan={windowSpan} />
                {archivedSelectionRanges.map((range) => {
                  const start = Math.max(windowStart, range.start);
                  const end = Math.min(windowStart + windowSpan, range.end);
                  const position = intervalPosition(start, end, windowStart, windowSpan);
                  if (!position) return null;
                  const visibleRange = { ...range, start: start - windowStart, end: end - windowStart };
                  return <div aria-label={`Vùng chọn ${range.start.toFixed(3)} đến ${range.end.toFixed(3)} giây`}
                    className="imported-selection-range" key={range.id} style={position}>
                    <SelectionReadout range={visibleRange} duration={windowSpan} canvasWidth={subtitleLaneWidth}
                      viewportLeft={0} viewportWidth={subtitleLaneWidth} displayStart={range.start} displayEnd={range.end} />
                  </div>;
                })}
                {layout === "columns" && playhead >= 0 && playhead <= 100 ?
                  <i aria-label={`Playhead ${lane.label}`} className="obs-timeline__playhead obs-timeline__column-playhead" style={{ left: `${playhead}%` }} /> : null}
                {markInPosition !== null && markInPosition >= 0 && markInPosition <= 100 ?
                  <i aria-label={`Mark In ${lane.label}`} className="obs-timeline__mark" style={{ left: `${markInPosition}%` }} /> : null}
                {markOut !== null ? <i aria-label={`Mark Out ${lane.label}`} className="obs-timeline__mark" style={{ left: `${((markOut - windowStart) / windowSpan) * 100}%` }} /> : null}
                {excludedRanges.map((cut) => {
                  const position = intervalPosition(cut.start, cut.end, windowStart, windowSpan);
                  return position ? <i aria-label={`Đoạn đã loại ${lane.label}`} className="obs-timeline__removed-range" key={cut.id} style={position} /> : null;
                })}
                {sharedCutPoints.map((point) => point >= windowStart && point <= windowStart + windowSpan
                  ? <i key={point} className="timeline-cut-point" style={{ left: `${(point - windowStart) / windowSpan * 100}%` }} /> : null)}
                {sourceAbsent ? <span className="obs-timeline__empty">Nguồn đang vắng · PCM đã lưu</span>
                : isLive && pendingSeconds > 2 ? <span className="obs-timeline__pending">
                  Đang nhận PCM · trễ {Math.round(pendingSeconds)}s
                </span> : !hasPcm ? <span className="obs-timeline__empty">{isLive
                  ? (liveChannel?.capture?.durableChunkCount ?? 0) > 0
                    ? "PCM đã lưu · cửa sổ này chưa có dữ liệu" : "Đang chờ PCM"
                  : "Không có PCM"}</span> : null}
              </div>
              <div aria-hidden="true" className="obs-timeline__overlap-markers">
                {overlaps.map((overlap) => {
                  const position = intervalPosition(overlap.startSeconds, overlap.endSeconds, windowStart, windowSpan);
                  return position ? <i className={overlapSourceId && recordingId &&
                    obsOverlapSelectionMatches(selectedOverlap, recordingId, overlapSourceId, overlap) ? "is-selected" : undefined}
                    key={overlap.markerId} style={position}
                    title={`Chồng tiếng ${obsOverlapTime(overlap.startSeconds)}–${obsOverlapTime(overlap.endSeconds)}`} /> : null;
                })}
              </div>
              {archivedAsset ? <div aria-label={`Subtitle ${lane.label}`} className="obs-timeline__caption imported-timeline__words"
                onDoubleClick={(event) => { if ((event.target as HTMLElement).closest("button, input")) return; const time = positionSeconds(event.clientX, event.currentTarget); if (time === null) return; const index = subtitleIndexAtTime(archivedAsset.words ?? [], time); const word = archivedAsset.words?.[index]; focusArchivedTrack(archivedAsset, word && word.start <= time && time < word.end ? { wordIndex: index } : { insertTime: time }); }}
                onContextMenu={(event) => { if ((event.target as HTMLElement).closest("button, input")) return; event.preventDefault(); const time = positionSeconds(event.clientX, event.currentTarget); if (time !== null) focusArchivedTrack(archivedAsset, { contextTime: time }); }}
                onPointerDown={(event) => { if (event.button !== 1 || event.target !== event.currentTarget) return; event.preventDefault(); const time = positionSeconds(event.clientX, event.currentTarget); const promoteIndex = subtitleIndexAtTime(archivedAsset.words ?? [], time ?? 0); if (promoteIndex >= 0) focusArchivedTrack(archivedAsset, { promoteIndex }); }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                    onWordSelectionChange?.(EMPTY_SELECTION);
                    setFocusedWordSelection(EMPTY_SELECTION);
                  }
                  const seconds = positionSeconds(event.clientX, event.currentTarget);
                  if (seconds === null) return;
                  if (event.ctrlKey || event.metaKey) focusArchivedTrack(archivedAsset, { insertTime: seconds });
                  else seek(event.clientX, event.currentTarget);
                }}>
                {(archivedTranscriptGaps.get(lane.channelId) ?? []).map((gap) => {
                  const position = intervalPosition(gap.start, gap.end, windowStart, windowSpan);
                  return position ? <span className="obs-timeline__transcript-gap" role="note" key={`${gap.row.utteranceId}:${gap.start}`}
                    style={position} title={`Realtime ${clock(gap.row.startSeconds)}–${clock(gap.row.endSeconds)} · chưa có timestamp từng từ được xác nhận: ${gap.row.text}`}>
                    Realtime · chưa có timing từ tin cậy
                  </span> : null;
                })}
                {excludedRanges.map((range) => { const position = intervalPosition(range.start, range.end, windowStart, windowSpan);
                  return position ? <i aria-hidden="true" className="obs-timeline__removed-range" key={range.id} style={position} /> : null; })}
                <SubtitleTimingGhosts assetId={archivedAsset.id} words={archivedAsset.words ?? []} start={windowStart} span={windowSpan} />
                {visibleSubtitleWordLayout(archivedAsset.words ?? [], windowStart, windowSpan, subtitleLaneWidth,
                  [activeWords[archivedAsset.id] ?? -1]).map((layout) => {
                  const wordIndex = layout.sourceIndex;
                  const word = archivedAsset.words[wordIndex];
                  const position = { left: `${(layout.leftPixels / subtitleLaneWidth) * 100}%`, width: `${(layout.widthPixels / subtitleLaneWidth) * 100}%` };
                  return position ? <button key={wordIndex} type="button" style={position}
                    aria-label={`${word.text} · ${timecode(word.start)}–${timecode(word.end)}`}
                    title={`${word.text} · ${word.start.toFixed(3)}–${word.end.toFixed(3)}s${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`}
                    className={`imported-timeline__word ${word.subtitleTimingConflict ? "has-refinement-conflict" : ""} ${layout.isCompact ? "is-compact" : ""} ${wordIndex === activeWords[archivedAsset.id] ? "is-active" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""}`}
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey) {
                        event.preventDefault(); event.stopPropagation();
                        const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                        const ratio = rect ? Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))) : 0;
                        focusArchivedTrack(archivedAsset, { insertTime: Math.max(0, Math.min(duration, windowStart + ratio * windowSpan)) });
                      } else {
                        seekTime(word.start);
                        if (visibleAssetId === archivedAsset.id) onWordSelectionChange?.({ indexes: [wordIndex], anchor: wordIndex });
                      }
                    }}
                    onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); focusArchivedTrack(archivedAsset, { wordIndex }); }}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); const lane = event.currentTarget.parentElement; focusArchivedTrack(archivedAsset, { contextIndex: wordIndex, contextTime: lane ? positionSeconds(event.clientX, lane) ?? word.start : word.start }); }}
                    onPointerDown={(event) => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); focusArchivedTrack(archivedAsset, { promoteIndex: wordIndex }); } }}
                  >{word.text}</button> : null;
                })}
              </div> : <div aria-label={`Phụ đề nháp ${lane.label}`}
                className={`obs-timeline__caption${caption && !detailedOverlaps && overlaps.some((item) => item.startSeconds <= currentTime && currentTime < item.endSeconds) ? " is-overlap" : ""}`}
                title="Live draft · thời gian theo đoạn, chưa xác thực từng từ">
                <span>{caption ? obsTranscriptText(caption) || "Đang nghe…" : "Chưa có lời nói"}</span>
                {caption ? <small>{caption.status === "final" ? "DRAFT" : "LIVE"}</small> : null}
              </div>}
            </div>;
          })}
          {layout === "layers" && playhead >= 0 && playhead <= 100 ? <div className="obs-timeline__playhead-layer">
            <i aria-label="Playhead chung" className="obs-timeline__playhead" style={{ left: `${playhead}%` }} />
          </div> : null}
          {!lanes.length ? <p className="obs-timeline__no-channels">{recordingId ? "Bản ghi này chưa có track được forward." : "Chọn OBS LiveLink và bấm Record để xem từng track."}</p> : null}
        </div>
      </div>
      <TimelineTransport current={timecode(currentTime)} duration={timecode(duration)} layout={layout} playButton={<button aria-label={playing ? "Tạm dừng track OBS" : "Phát track OBS"} disabled={!canPlay}
          className="transport-button"
          onClick={togglePlayback} type="button">
          <Icon name={playing ? "pause" : "play"} />
        </button>}>
        <div aria-label="Thanh tiến trình Timeline — bấm hoặc kéo để tua" className="transport-progress obs-timeline__scrub"
          onClick={clickSeek}
          onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub} onPointerCancel={cancelScrub}>
          <i style={{ width: `${Math.max(0, Math.min(100, duration ? currentTime / duration * 100 : 0))}%` }} />
          <b style={{ left: `${Math.max(0, Math.min(100, duration ? currentTime / duration * 100 : 0))}%` }} />
        </div>
      </TimelineTransport>
    </div>
    {playbackUrl ? <audio key={playbackUrl} onEnded={pausePlayback}
      onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(currentTime,
        Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : currentTime);
        event.currentTarget.playbackRate = playbackRate;
        if (audioGraphRef.current?.element !== event.currentTarget) {
          event.currentTarget.volume = selectedLane ? Math.min(1, previewGain(selectedLane.channelId)) : 0;
        }
      }}
      onPause={(event) => { if (event.currentTarget === audioRef.current && !audioScrubber.active) setPlaying(false); }}
      onPlay={() => { if (!audioScrubber.active) setPlaying(true); }} onTimeUpdate={(event) => {
        if (audioScrubber.active) return;
        if (resumeProjectId && activeResumeIdentityRef.current !== resumeIdentity) return;
        const time = event.currentTarget.currentTime;
        const next = nextPlayableTime(time, duration, excludedRanges);
        if (next >= duration) pausePlayback();
        setCurrentTime(next);
        if (playing && !scrubbingRef.current && (next < windowStart || next >= windowStart + windowSpan * .9)) {
          setWindowStart(Math.max(0, Math.min(Math.max(0, duration - windowSpan), next - windowSpan * .1)));
        }
        forEachPlaybackAudio((other) => {
          if (Math.abs(other.currentTime - next) > .001) other.currentTime = next;
        });
      }}
      preload="metadata" ref={setMainAudio} src={playbackUrl} /> : null}
    {visibleLanes.filter((lane) => lane.assetId && lane.channelId !== selectedLane?.channelId).map((lane) => {
      return <audio key={lane.channelId}
        onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(currentTime,
          Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : currentTime);
          event.currentTarget.playbackRate = playbackRate;
          event.currentTarget.volume = Math.min(1, previewGain(lane.channelId)); }}
        preload="metadata" ref={otherAudioCallback(lane.channelId)} src={`/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(lane.assetId!)}/audio`} />;
    })}
  </ModuleFrame>;
}
