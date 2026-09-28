import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { api } from "../../api/client";
import type { ObsLiveLinkRecording, ObsLiveLinkRecordingJournal, ObsLiveLinkStatus, ObsLiveLinkTranscriptRow, ObsLiveLinkWaveform, ObsLiveLinkWaveformPoint } from "../../domain/types";
import { subscribeObsLiveLinkWaveforms } from "../obs-capture/obs-waveform-feed";
import { obsTranscriptText } from "../obs-capture/obs-transcript-feed";
import { obsOverlapAt, obsOverlapByUtterance, obsOverlapTime } from "../obs-capture/obs-overlap";
import { ModuleFrame } from "../../ui/ModuleFrame";

const WINDOW_OPTIONS = [15, 30, 60, 120] as const;
const DEFAULT_WINDOW_SECONDS = 60;
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

function clock(seconds: number): string {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
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
      (channel.appliedForward || channel.desiredForward || (channel.capture.durableChunkCount ?? 0) > 0))
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
                      windowStart: number, windowSpan: number): string {
  if (!sampleRate) return "";
  const commands: string[] = [];
  for (const point of points) {
    if (point.min === null || point.max === null) continue;
    const x = Math.max(0, Math.min(1_000, ((point.startFrame / sampleRate - windowStart) / windowSpan) * 1_000));
    const top = 30 - (point.max / 32768) * 27;
    const bottom = 30 - (point.min / 32768) * 27;
    commands.push(`M${x.toFixed(1)} ${top.toFixed(1)}V${bottom.toFixed(1)}`);
  }
  return commands.join("");
}

function mergeWaveform(previous: ObsLiveLinkWaveform | undefined, incoming: ObsLiveLinkWaveform): ObsLiveLinkWaveform {
  if (!previous || incoming.source === "mka" || incoming.lastIncludedSequence < 0 ||
      previous.recordingId !== incoming.recordingId || previous.sampleRate !== incoming.sampleRate ||
      previous.startSeconds !== incoming.startSeconds || previous.endSeconds !== incoming.endSeconds) return incoming;
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
                          elapsedSeconds: number): Array<{ start: number; end: number }> {
  if (!sampleRate) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  for (const point of points) {
    if (point.peak !== null) continue;
    const start = point.startFrame / sampleRate;
    const end = Math.min(elapsedSeconds, point.endFrame / sampleRate);
    if (end <= start) continue;
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous.end + 1 / sampleRate) previous.end = Math.max(previous.end, end);
    else ranges.push({ start, end });
  }
  return ranges;
}

function sourceLevel(waveform: ObsLiveLinkWaveform | undefined, time: number): number {
  if (!waveform?.sampleRate) return 0;
  const frame = time * waveform.sampleRate;
  const point = waveform.points.find((item) => item.startFrame <= frame && frame < item.endFrame);
  return Math.max(0, Math.min(100, Math.round(((point?.peak ?? 0) / 32768) * 100)));
}

export function ObsLiveLinkTimeline({ projectId, requestedRecordingId, onRecordingIdChange, onPlayheadChange,
                                      transcriptRows = [], seekRequest = null }: {
  projectId: string; requestedRecordingId: string | null;
  onRecordingIdChange?: (recordingId: string) => void;
  onPlayheadChange?: (seconds: number) => void;
  transcriptRows?: ObsLiveLinkTranscriptRow[];
  seekRequest?: { recordingId: string; channelId: string; seconds: number; serial: number; replayUntilSeconds?: number } | null;
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
  const [pendingReplay, setPendingReplay] = useState<{ channelId: string; startSeconds: number; endSeconds: number } | null>(null);
  const [replayUntil, setReplayUntil] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveRetry, setArchiveRetry] = useState(0);
  const [layout, setLayout] = useState<Layout>("layers");
  const [windowSeconds, setWindowSeconds] = useState<number>(DEFAULT_WINDOW_SECONDS);
  const [gainByChannel, setGainByChannel] = useState<Record<string, number>>({});
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [followLive, setFollowLive] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioGraphRef = useRef<PreviewAudioGraph | null>(null);
  const windowRef = useRef({ start: 0, end: DEFAULT_WINDOW_SECONDS });
  const recordingIdRef = useRef<string | null>(null);

  useEffect(() => setSelectedRecordingId(requestedRecordingId), [projectId, requestedRecordingId]);
  useEffect(() => {
    let active = true;
    setJournals([]);
    const refresh = () => void api.listObsLiveLinkRecordings(projectId)
      .then((records) => { if (active) setJournals(records); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Không đọc được bản ghi OBS."); });
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId]);

  useEffect(() => subscribeObsLiveLinkWaveforms(projectId,
    () => ({ startSeconds: windowRef.current.start, endSeconds: windowRef.current.end, maxPoints: 600 }),
    (incoming) => {
      if (incoming.recordingId !== recordingIdRef.current) return;
      setError(null);
      setWaveforms((current) => ({ ...current,
        [incoming.channelId]: mergeWaveform(current[incoming.channelId], incoming) }));
    },
    (reason) => setError(reason instanceof Error ? reason.message : "Không tải được waveform OBS."),
    (next) => {
      setStatus(next);
      const liveId = next.appRecording?.projectId === projectId ? next.appRecording.recordingId : null;
      if (liveId) { setError(null); recordingIdRef.current = liveId; setSelectedRecordingId(liveId); }
    }), [projectId]);

  const active = status?.appRecording?.projectId === projectId ? status.appRecording : null;
  const recordingId = active?.recordingId ?? selectedRecordingId ?? journals[0]?.recording.recordingId ?? null;
  const journal = journals.find((item) => item.recording.recordingId === recordingId);
  const recording = active ?? journal?.recording ?? null;
  useEffect(() => {
    if (recordingId && recordingId !== requestedRecordingId) onRecordingIdChange?.(recordingId);
  }, [recordingId, requestedRecordingId, onRecordingIdChange]);
  const isLive = Boolean(active);
  const duration = recording ? recordingSeconds(recording, now) : 0;
  const visibleSpan = (seconds: number) => isLive ? seconds :
    Math.min(seconds, Math.max(10, Math.ceil(duration / 10) * 10));
  const windowSpan = visibleSpan(windowSeconds);
  windowRef.current = { start: windowStart, end: windowStart + windowSpan };
  recordingIdRef.current = recordingId;
  const lanes = useMemo(() => sourceLanes(status, journal, recordingId, isLive),
    [status, journal, recordingId, isLive]);
  const overlapByUtterance = useMemo(() => obsOverlapByUtterance(transcriptRows), [transcriptRows]);
  const laneIds = lanes.map((lane) => lane.channelId).join(",");

  useEffect(() => {
    if (transcriptRows.length) onPlayheadChange?.(currentTime);
  }, [currentTime, onPlayheadChange, transcriptRows.length]);

  useEffect(() => {
    setWaveforms({});
    setWindowStart(0);
    setCurrentTime(0);
    setPlaying(false);
    setPendingReplay(null);
    setReplayUntil(null);
    setMarkIn(null);
    setFollowLive(true);
  }, [recordingId]);
  useEffect(() => setGainByChannel({}), [projectId]);
  useEffect(() => {
    if (!isLive || !followLive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isLive, followLive]);
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
    if (seekRequest.replayUntilSeconds !== undefined) {
      seekOverlap(seekRequest.channelId, seekRequest.seconds, seekRequest.replayUntilSeconds);
      return;
    }
    setPendingReplay(null);
    setReplayUntil(null);
    setSelectedChannelId(seekRequest.channelId);
    setCurrentTime(seekRequest.seconds);
    setWindowStart(Math.max(0, seekRequest.seconds - windowSpan / 3));
    setFollowLive(false);
    if (audioRef.current) audioRef.current.currentTime = seekRequest.seconds;
  }, [seekRequest?.serial, recordingId]);
  useEffect(() => {
    if (!isLive && recording) setCurrentTime((time) => Math.min(time, duration));
  }, [isLive, recording, duration]);
  useEffect(() => {
    if (lanes.some((lane) => lane.channelId === selectedChannelId)) return;
    setSelectedChannelId(lanes.find((lane) => lane.assetId)?.channelId ?? lanes[0]?.channelId ?? null);
  }, [laneIds, selectedChannelId, journal]);

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

  useEffect(() => {
    if (!isLive || !recordingId || windowStart === 0 || !lanes.length) return;
    let cancelled = false;
    for (const lane of lanes) void api.getObsLiveLinkWaveform(projectId, recordingId,
      lane.channelId, windowStart, windowStart + windowSpan, 600)
      .then((waveform) => { if (!cancelled) setWaveforms((current) => ({ ...current, [lane.channelId]: waveform })); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Không tải được cửa sổ sóng âm."); });
    return () => { cancelled = true; };
  }, [projectId, recordingId, isLive, laneIds, windowStart, windowSpan]);

  const selectedLane = lanes.find((lane) => lane.channelId === selectedChannelId) ?? lanes[0];
  const playbackUrl = selectedLane?.assetId
    ? `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(selectedLane.assetId)}/audio`
    : null;
  const selectedGain = selectedLane ? gainByChannel[`${recordingId}:${selectedLane.channelId}`] ?? 100 : 100;
  const playhead = ((currentTime - windowStart) / windowSpan) * 100;
  const markInPosition = markIn === null ? null : ((markIn - windowStart) / windowSpan) * 100;
  const canPlay = !isLive && Boolean(playbackUrl);

  useEffect(() => {
    if (audioGraphRef.current?.element === audioRef.current) {
      audioGraphRef.current.gain.gain.value = selectedGain / 100;
    } else if (audioRef.current) {
      audioRef.current.volume = Math.min(1, selectedGain / 100);
    }
  }, [playbackUrl, selectedGain]);

  useEffect(() => () => {
    const graph = audioGraphRef.current;
    if (!graph) return;
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
      graph.gain.gain.value = selectedGain / 100;
      void graph.context.resume().catch(() => setError("Không kích hoạt được gain nghe lại."));
    } else {
      audio.volume = Math.min(1, selectedGain / 100);
      if (selectedGain > 100) setError("Trình duyệt không hỗ trợ tăng gain nghe lại trên 100%.");
    }
  }

  function playPendingReplay(audio: HTMLAudioElement) {
    if (!pendingReplay || isLive || selectedLane?.channelId !== pendingReplay.channelId ||
        audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
    audio.currentTime = Math.min(pendingReplay.startSeconds, audio.duration || pendingReplay.startSeconds);
    preparePreviewAudio(audio);
    setReplayUntil(pendingReplay.endSeconds);
    setPendingReplay(null);
    void audio.play().catch(() => setError("Không phát được đoạn chồng tiếng trên track OBS."));
  }

  function finishReplay(audio: HTMLAudioElement) {
    if (replayUntil === null || audio.currentTime < replayUntil) return;
    audio.pause();
    audio.currentTime = replayUntil;
    setCurrentTime(replayUntil);
    setReplayUntil(null);
  }

  useEffect(() => {
    if (audioRef.current) playPendingReplay(audioRef.current);
  }, [pendingReplay, playbackUrl, selectedLane?.channelId]);

  useEffect(() => {
    if (replayUntil === null || !playing) return;
    const timer = window.setInterval(() => {
      if (audioRef.current) finishReplay(audioRef.current);
    }, 25);
    return () => window.clearInterval(timer);
  }, [replayUntil, playing]);

  function zoomTarget(direction: -1 | 1): number | null {
    let index = WINDOW_OPTIONS.findIndex((value) => value === windowSeconds) + direction;
    while (index >= 0 && index < WINDOW_OPTIONS.length) {
      const next = WINDOW_OPTIONS[index];
      if (visibleSpan(next) !== windowSpan) return next;
      index += direction;
    }
    return null;
  }

  function changeWindow(direction: -1 | 1) {
    const next = zoomTarget(direction);
    if (next === null) return;
    const nextSpan = visibleSpan(next);
    setWindowStart(isLive ? Math.max(0, duration - nextSpan) :
      Math.max(0, Math.min(duration - nextSpan, currentTime - nextSpan / 2)));
    setWindowSeconds(next);
  }

  function seek(clientX: number, element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width) return;
    const position = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const next = Math.min(duration, windowStart + position * windowSpan);
    setCurrentTime(next);
    if (audioRef.current) audioRef.current.currentTime = Math.min(next, audioRef.current.duration || next);
  }

  function seekOverlap(channelId: string, seconds: number, endSeconds: number) {
    setSelectedChannelId(channelId);
    setFollowLive(false);
    setCurrentTime(seconds);
    setReplayUntil(null);
    setPendingReplay(!isLive && lanes.some((lane) => lane.channelId === channelId && lane.assetId)
      ? { channelId, startSeconds: seconds, endSeconds } : null);
  }

  return <ModuleFrame eyebrow={isLive ? `REC LIVE · ${lanes.length} CHANNEL` : recordingId ? `OBS LIVELINK · ${recordingId.slice(0, 8)}` : "OBS LIVELINK"}
    title="Timeline" index="A1" tone="dark" className="timeline-module obs-timeline"
    action={<div className="obs-timeline__header-actions">
      <label>SESSION <select aria-label="Bản ghi OBS" disabled={isLive} onChange={(event) => { setSelectedRecordingId(event.target.value); onRecordingIdChange?.(event.target.value); }} value={recordingId ?? ""}>
        {!recordingId ? <option value="">Chưa có bản ghi</option> : null}
        {journals.map((item) => <option key={item.recording.recordingId} value={item.recording.recordingId}>
          {item.recording.recordingId.slice(0, 8)} · {item.recording.archiveStatus}
        </option>)}
      </select></label>
      <span>{isLive ? recording?.status === "paused" ? "PAUSED" : "REC LIVE" : recording?.archiveStatus === "ready" ? "MKA READY" : "PCM SAVED"}</span>
    </div>}>
    <div className="obs-timeline__main">
      {error ? <p className="obs-timeline__error" role="alert">{error}</p> : null}
      <div className="obs-timeline__toolbar">
        <div aria-label="Kiểu hiển thị Timeline OBS" className="obs-timeline__layout" role="group">
          <button aria-pressed={layout === "columns"} onClick={() => setLayout("columns")} type="button">CỘT</button>
          <button aria-pressed={layout === "layers"} onClick={() => setLayout("layers")} type="button">LAYER</button>
        </div>
        <button className="obs-timeline__mark-button" disabled={isLive || !recordingId}
          onClick={() => setMarkIn(currentTime)} type="button">MARK IN</button>
        <div aria-label="Zoom Timeline OBS" className="obs-timeline__zoom" role="group">
          <button aria-label="Phóng to Timeline OBS" disabled={zoomTarget(-1) === null}
            onClick={() => changeWindow(-1)} type="button">+</button>
          <span>{windowSpan}s</span>
          <button aria-label="Thu nhỏ Timeline OBS" disabled={zoomTarget(1) === null}
            onClick={() => changeWindow(1)} type="button">−</button>
        </div>
      </div>
      <div className="obs-timeline__viewport">
        <div className={`obs-timeline__track-scroll is-${layout}`} aria-label="Timeline đa kênh OBS">
          {layout === "layers" ? <><div className="obs-timeline__label-spacer" />
            <div className="obs-timeline__ruler" aria-label="Ruler chung">
              {[0, 1, 2, 3, 4].map((part) => <span key={part} style={{ left: `${part * 25}%` }}>
                {clock(windowStart + (part * windowSpan) / 4)}
              </span>)}
            </div></> : null}
          {lanes.map((lane) => {
            const captions = transcriptRows.filter((row) => row.recordingId === recordingId && row.channelId === lane.channelId);
            const overlaps = captions.flatMap((row) => (overlapByUtterance.get(row.utteranceId) ?? []).map((interval) => ({
              ...interval, utteranceId: row.utteranceId,
            })));
            const caption = isLive && followLive
              ? [...captions].reverse().find((row) => duration - row.endSeconds < 4)
              : [...captions].reverse().find((row) => row.startSeconds <= currentTime && currentTime <= Math.max(row.endSeconds, row.startSeconds + 1));
            const waveform = waveforms[lane.channelId];
            const points = waveform?.recordingId === recordingId ? waveform.points : [];
            const hasPcm = points.some((point) => point.peak !== null);
            const path = waveformPath(points, waveform?.sampleRate ?? null, windowStart, windowSpan);
            const missing = isLive ? missingPcmRanges(points, waveform?.sampleRate ?? null, duration) : [];
            const livePeak = status?.channels.find((channel) => channel.channelId === lane.channelId)?.meterPeak ?? 0;
            const level = isLive ? Math.max(0, Math.min(100, Math.round(livePeak * 100))) :
              sourceLevel(waveform, currentTime);
            const gainKey = `${recordingId}:${lane.channelId}`;
            const gain = gainByChannel[gainKey] ?? 100;
            const intervalOrigin = recording?.startedMonotonicNs ?? 0;
            const intervals = [
              ...(recording?.capturePauseIntervals ?? []).map((part) => ({ ...part, reason: "app-paused" })),
              ...(recording?.channelIntervals ?? []).filter((part) => part.channelId === lane.channelId)
                .map((part) => ({ ...part, reason: part.reason })),
            ];
            return <div className="obs-timeline__lane" key={lane.channelId}>
              <button aria-label={`Nghe kênh ${lane.label}`} aria-pressed={selectedLane?.channelId === lane.channelId}
                className="obs-timeline__lane-label" onClick={() => { setSelectedChannelId(lane.channelId); audioRef.current?.pause(); }} type="button">
                <b title={lane.label}>{lane.label}</b><small title={lane.nativeName}>{lane.nativeName}</small>
              </button>
              {layout === "columns" ? <div aria-label={`Ruler ${lane.label}`} className="obs-timeline__ruler obs-timeline__column-ruler">
                {[0, 1, 2, 3, 4].map((part) => <span key={part} style={{ left: `${part * 25}%` }}>
                  {clock(windowStart + (part * windowSpan) / 4)}
                </span>)}
              </div> : null}
              <div aria-label={`Sóng âm ${lane.label}`} className="obs-timeline__wave" role="img"
                onClick={(event) => { if (!isLive) seek(event.clientX, event.currentTarget); }}>
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
                {captions.map((row) => {
                  const position = intervalPosition(row.startSeconds, Math.max(row.endSeconds, row.startSeconds + 0.08), windowStart, windowSpan);
                  return position ? <i aria-label={`Lượt nói ${lane.label} tại ${row.startSeconds.toFixed(2)}s`}
                    className="obs-timeline__speech-span" key={row.utteranceId} style={position} /> : null;
                })}
                <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1000 60"><path d={path} /></svg>
                {layout === "columns" && playhead >= 0 && playhead <= 100 ?
                  <i aria-label={`Playhead ${lane.label}`} className="obs-timeline__playhead obs-timeline__column-playhead" style={{ left: `${playhead}%` }} /> : null}
                {markInPosition !== null && markInPosition >= 0 && markInPosition <= 100 ?
                  <i aria-label={`Mark In ${lane.label}`} className="obs-timeline__mark" style={{ left: `${markInPosition}%` }} /> : null}
                {!hasPcm ? <span className="obs-timeline__empty">{isLive ? "Đang chờ PCM" : "Không có PCM"}</span> : null}
              </div>
              <div className="obs-timeline__overlap-markers">
                {overlaps.map((overlap) => {
                  const position = intervalPosition(overlap.startSeconds, overlap.endSeconds, windowStart, windowSpan);
                  return position ? <button key={`${overlap.utteranceId}-${overlap.startSeconds}`}
                    aria-label={`Nghe lại chồng tiếng ${lane.label} từ ${obsOverlapTime(overlap.startSeconds)} đến ${obsOverlapTime(overlap.endSeconds)}`}
                    onClick={() => seekOverlap(lane.channelId, overlap.startSeconds, overlap.endSeconds)}
                    style={position} title={`Chồng tiếng ${obsOverlapTime(overlap.startSeconds)}–${obsOverlapTime(overlap.endSeconds)} · thời gian theo đoạn · nghe ${lane.label}`}
                    type="button" /> : null;
                })}
              </div>
              <div aria-label={`Phụ đề nháp ${lane.label}`}
                className={`obs-timeline__caption${caption && obsOverlapAt(overlapByUtterance.get(caption.utteranceId) ?? [], currentTime) ? " is-overlap" : ""}`}
                title="Live draft · thời gian theo đoạn, chưa xác thực từng từ">
                <span>{caption ? obsTranscriptText(caption) || "Đang nghe…" : "Chưa có lời nói"}</span>
                {caption ? <small>{caption.status === "final" ? "DRAFT" : "LIVE"}</small> : null}
              </div>
              <div className="obs-timeline__lane-controls" title="Gain chỉ đổi âm lượng nghe lại trong Pro4Bro; không đổi fader OBS hoặc PCM/MKA gốc.">
                <label className="obs-timeline__gain">GAIN
                  <input aria-label={`Gain nghe lại ${lane.label}`} max="200" min="0"
                    onChange={(event) => setGainByChannel((current) => ({ ...current,
                      [gainKey]: Number(event.target.value) }))} step="1" type="range" value={gain} />
                  <output>{gain}%</output>
                </label>
                <div className="obs-timeline__level" role="meter" aria-label={`Level nguồn ${lane.label}`}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} title={`Mức nguồn ${level}% · không chịu tác động của Gain nghe lại`}>
                  <span>LEVEL</span><div><i style={{ width: `${level}%` }} /></div><output>{level}%</output>
                </div>
              </div>
            </div>;
          })}
          {layout === "layers" && playhead >= 0 && playhead <= 100 ? <div className="obs-timeline__playhead-layer">
            <i aria-label="Playhead chung" className="obs-timeline__playhead" style={{ left: `${playhead}%` }} />
          </div> : null}
          {!lanes.length ? <p className="obs-timeline__no-channels">{recordingId ? "Bản ghi này chưa có channel được forward." : "Chọn OBS LiveLink và bấm Record để xem từng channel."}</p> : null}
        </div>
      </div>
      <div className="obs-timeline__transport">
        <button aria-label={playing ? "Tạm dừng track OBS" : "Phát track OBS"} disabled={!canPlay}
          onClick={() => { if (!audioRef.current) return; if (playing) audioRef.current.pause(); else {
            preparePreviewAudio(audioRef.current);
            void audioRef.current.play().catch(() => setError("Không phát được track OBS."));
          } }} type="button">
          {playing ? "Ⅱ" : "▶"}
        </button>
        <code>{clock(currentTime)}</code>
        <span>{isLive ? "Đang thu · nghe lại sau Stop" : selectedLane?.assetId ? `TRACK · ${selectedLane.label}` : "Track chưa sẵn sàng"}</span>
        {isLive && !followLive ? <button onClick={() => { setFollowLive(true); setCurrentTime(duration); }} type="button">VỀ LIVE</button> : null}
        <button aria-label="Lùi cửa sổ Timeline" disabled={windowStart === 0 || isLive}
          onClick={() => setWindowStart((value) => Math.max(0, value - windowSpan / 4))} type="button">←</button>
        <button aria-label="Tiến cửa sổ Timeline" disabled={isLive || windowStart + windowSpan >= duration}
          onClick={() => setWindowStart((value) => Math.min(Math.max(0, duration - windowSpan), value + windowSpan / 4))} type="button">→</button>
        <code>{clock(duration)}</code>
      </div>
    </div>
    {playbackUrl ? <audio key={playbackUrl} onEnded={() => { setPlaying(false); setReplayUntil(null); }}
      onPause={() => { setPlaying(false); setReplayUntil(null); }}
      onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(currentTime,
        Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : currentTime);
        if (audioGraphRef.current?.element !== event.currentTarget) {
          event.currentTarget.volume = Math.min(1, selectedGain / 100);
        }
        playPendingReplay(event.currentTarget); }}
      onPlay={() => setPlaying(true)} onTimeUpdate={(event) => {
        setCurrentTime(event.currentTarget.currentTime);
        finishReplay(event.currentTarget);
      }}
      preload="metadata" ref={audioRef} src={playbackUrl} /> : null}
  </ModuleFrame>;
}
