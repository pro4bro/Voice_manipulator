import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import type { ProjectMediaAsset, VoiceOutput } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { Icon } from "../../ui/Icon";
import { Timeline } from "../timeline/Timeline";
import { clampPlacement, sourceTime, timelineLength, type ClipPlacement } from "./alignment";
import "./lip-sync.css";

interface Props {
  projectId: string;
  assets: ProjectMediaAsset[];
  outputs: VoiceOutput[];
  leftWidth: number;
  rightWidth: number;
  onResizeStart: (side: "left" | "right", event: PointerEvent<HTMLDivElement>) => void;
  onResizeKeyDown: (side: "left" | "right", event: KeyboardEvent<HTMLDivElement>) => void;
}

const EMPTY_PLACEMENT: ClipPlacement = { start: 0, inPoint: 0 };

function clock(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  return `${String(Math.floor(centiseconds / 6000)).padStart(2, "0")}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

export function LipSyncWorkspace({ projectId, assets, outputs, leftWidth, rightWidth, onResizeStart, onResizeKeyDown }: Props) {
  const [sourceTab, setSourceTab] = useState<"video" | "audio">("video");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [videoPlace, setVideoPlace] = useState<ClipPlacement>(EMPTY_PLACEMENT);
  const [audioPlace, setAudioPlace] = useState<ClipPlacement>(EMPTY_PLACEMENT);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const videos = assets.filter((asset) => asset.mediaKind === "video" && !asset.deletedAt && !asset.disabled && asset.duration > 0);
  const audios = outputs.filter((output) => output.audioAvailable !== false && output.duration > 0);
  const video = videos.find((item) => item.id === videoId) ?? null;
  const output = audios.find((item) => item.id === outputId) ?? null;
  const length = timelineLength(video?.duration ?? 0, output?.duration ?? 0, videoPlace, audioPlace);
  const videoUrl = video ? `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(video.id)}/video` : undefined;
  const audioUrl = output ? `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(output.id)}/audio` : undefined;
  const visibleVideo = video && sourceTime(playhead, video.duration, videoPlace) !== null;

  useEffect(() => { setPlayhead((current) => Math.min(current, length)); }, [length]);

  useEffect(() => {
    if (playing) return;
    videoRef.current?.pause();
    audioRef.current?.pause();
    if (videoRef.current && video) videoRef.current.currentTime = Math.min(video.duration, sourceTime(playhead, video.duration, videoPlace) ?? videoPlace.inPoint);
    if (audioRef.current && output) audioRef.current.currentTime = Math.min(output.duration, sourceTime(playhead, output.duration, audioPlace) ?? audioPlace.inPoint);
  }, [playing, playhead, video, output, videoPlace, audioPlace]);

  useEffect(() => {
    if (!playing) return;
    const origin = performance.now() - playhead * 1000;
    let frame = 0;
    const tick = () => {
      const current = Math.min(length, (performance.now() - origin) / 1000);
      setPlayhead(current);
      const sync = (element: HTMLMediaElement | null, duration: number, place: ClipPlacement) => {
        if (!element) return;
        const target = sourceTime(current, duration, place);
        if (target === null) { element.pause(); return; }
        if (Math.abs(element.currentTime - target) > 0.12) element.currentTime = target;
        if (element.paused) void element.play().catch(() => setPlaying(false));
      };
      if (video) sync(videoRef.current, video.duration, videoPlace);
      if (output) sync(audioRef.current, output.duration, audioPlace);
      if (current < length) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Restarting this effect for every playhead paint would reset the master clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, videoId, outputId, videoPlace, audioPlace, length]);

  const seek = (value: number) => { setPlaying(false); setPlayhead(clampPlacement(value, length)); };
  const chooseVideo = (asset: ProjectMediaAsset) => {
    setPlaying(false); setVideoId(asset.id); setVideoPlace(EMPTY_PLACEMENT); setPlayhead(0); setPreviewError(null);
  };
  const chooseAudio = (item: VoiceOutput) => {
    setPlaying(false); setOutputId(item.id); setAudioPlace(EMPTY_PLACEMENT); setPlayhead(0); setPreviewError(null);
  };
  const placeStart = (kind: "video" | "audio", value: number) => {
    setPlaying(false);
    const setter = kind === "video" ? setVideoPlace : setAudioPlace;
    setter((current) => ({ ...current, start: clampPlacement(value, 36000) }));
  };
  const placeIn = (kind: "video" | "audio", value: number) => {
    setPlaying(false);
    const duration = kind === "video" ? video?.duration ?? 0 : output?.duration ?? 0;
    const setter = kind === "video" ? setVideoPlace : setAudioPlace;
    setter((current) => ({ ...current, inPoint: clampPlacement(value, Math.max(0, (current.outPoint ?? duration) - 0.1)) }));
  };
  const placeOut = (kind: "video" | "audio", value: number) => {
    setPlaying(false);
    const duration = kind === "video" ? video?.duration ?? 0 : output?.duration ?? 0;
    const setter = kind === "video" ? setVideoPlace : setAudioPlace;
    setter((current) => ({ ...current, outPoint: Math.max(current.inPoint + 0.1, clampPlacement(value, duration)) }));
  };
  const updatePlacement = (kind: "video" | "audio", placement: ClipPlacement) => {
    setPlaying(false);
    (kind === "video" ? setVideoPlace : setAudioPlace)(placement);
  };

  return <div className="studio-board studio-board--lip-sync lipsync-board" style={{ "--left-column": `${leftWidth}px`, "--right-column": `${rightWidth}px` } as CSSProperties}>
    <div className="module-column module-column--left">
      <section className="library-panel lipsync-library">
        <div className="library-panel-tabs" role="tablist" aria-label="Nguồn LipSync">
          <button aria-selected={sourceTab === "video"} className={sourceTab === "video" ? "is-active" : ""} onClick={() => setSourceTab("video")} role="tab" type="button"><Icon name="folder" />Media Pool <b>{videos.length}</b></button>
          <button aria-selected={sourceTab === "audio"} className={sourceTab === "audio" ? "is-active" : ""} onClick={() => setSourceTab("audio")} role="tab" type="button"><Icon name="waveform" />Voice Output <b>{audios.length}</b></button>
        </div>
      <ModuleFrame title={sourceTab === "video" ? "Media Pool" : "Voice Output"} eyebrow={sourceTab === "video" ? "FOOTAGE VIDEO" : "GENERATED AUDIO"} className="lipsync-sources">
        {sourceTab === "video" ? <div className="lipsync-source-list" role="tabpanel">
          {videos.length ? videos.map((item) => <button aria-pressed={item.id === videoId} className={item.id === videoId ? "is-selected" : ""} key={item.id} onClick={() => chooseVideo(item)} type="button"><b>{item.name}</b><small>{clock(item.duration)} · {item.sourceExtension.toUpperCase()}</small></button>) : <p>Chưa có video trong Media Pool. Import footage tại page Input.</p>}
        </div> : <div className="lipsync-source-list" role="tabpanel">
          {audios.length ? audios.map((item) => <button aria-pressed={item.id === outputId} className={item.id === outputId ? "is-selected" : ""} key={item.id} onClick={() => chooseAudio(item)} type="button"><b>{item.name}</b><small>{clock(item.duration)} · {item.voiceName}</small></button>) : <p>Chưa có voice generated. Tạo giọng tại Voice Manipulator.</p>}
        </div>}
      </ModuleFrame>
      </section>
    </div>
    <div aria-label="Co kéo cột trái" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => onResizeKeyDown("left", event)} onPointerDown={(event) => onResizeStart("left", event)} role="separator" tabIndex={0}><i /></div>
    <div className="module-column module-column--center">
      <ModuleFrame title="Preview Video" eyebrow="BEFORE / SOURCE FOOTAGE" className="lipsync-preview script-module">
        <div className="lipsync-compare"><b>Before · footage gốc</b><button disabled title="After chỉ xuất hiện khi có video LipSync đã render" type="button">After · chờ render</button></div>
        <div className="lipsync-preview-screen">
          {video ? <video aria-label="Video trước LipSync" muted onError={() => { setPlaying(false); setPreviewError("Trình duyệt không phát được footage này. Cần bản MP4/WebM tương thích để preview."); }} onLoadedMetadata={(event) => { event.currentTarget.currentTime = sourceTime(playhead, video.duration, videoPlace) ?? videoPlace.inPoint; }} playsInline preload="metadata" ref={videoRef} src={videoUrl} /> : <div className="lipsync-empty-video"><Icon name="play" /><b>Chọn footage video từ Media Pool</b></div>}
          {video && !visibleVideo ? <div className="lipsync-video-curtain">Video chưa bắt đầu tại vị trí này</div> : null}
        </div>
        {output ? <audio aria-label="Voice Output cho LipSync" onError={() => { setPlaying(false); setPreviewError("Không đọc được file Voice Output đã chọn. Tải lại danh sách và chọn một output có audio hợp lệ."); }} onLoadedMetadata={(event) => { event.currentTarget.currentTime = sourceTime(playhead, output.duration, audioPlace) ?? audioPlace.inPoint; }} preload="metadata" ref={audioRef} src={audioUrl} /> : null}
        {previewError ? <p role="alert">{previewError}</p> : null}
        <div className="lipsync-preview-caption"><b>{video?.name ?? "Chưa chọn video"}</b><span>{clock(playhead)} / {clock(length)} · Audio gốc tắt · nghe Voice Output trên Timeline</span></div>
      </ModuleFrame>
    </div>
    <div aria-label="Co kéo cột phải" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => onResizeKeyDown("right", event)} onPointerDown={(event) => onResizeStart("right", event)} role="separator" tabIndex={0}><i /></div>
    <div className="module-column module-column--right">
      <ModuleFrame title="Căn timing" eyebrow="VIDEO / GENERATED VOICE" className="lipsync-controls">
        <p>Đặt vị trí bắt đầu của mỗi clip trên timeline và điểm lấy nguồn. Preview dùng chung một đồng hồ.</p>
        <fieldset disabled={!video}><legend>Video</legend><label>Vị trí trên timeline (s)<input min="0" onChange={(event) => placeStart("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.start} /></label><label>Điểm IN nguồn (s)<input max={Math.max(0, (videoPlace.outPoint ?? video?.duration ?? 0) - .1)} min="0" onChange={(event) => placeIn("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.inPoint} /></label><label>Điểm OUT nguồn (s)<input max={video?.duration ?? 0} min={videoPlace.inPoint + .1} onChange={(event) => placeOut("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.outPoint ?? video?.duration ?? 0} /></label></fieldset>
        <fieldset disabled={!output}><legend>Voice Output</legend><label>Vị trí trên timeline (s)<input min="0" onChange={(event) => placeStart("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.start} /></label><label>Điểm IN nguồn (s)<input max={Math.max(0, (audioPlace.outPoint ?? output?.duration ?? 0) - .1)} min="0" onChange={(event) => placeIn("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.inPoint} /></label><label>Điểm OUT nguồn (s)<input max={output?.duration ?? 0} min={audioPlace.inPoint + .1} onChange={(event) => placeOut("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.outPoint ?? output?.duration ?? 0} /></label></fieldset>
        <div className="lipsync-render-state"><b>Bản nháp preview</b><span>Timing chưa được lưu vào project. Render LipSync và thay face cần adapter, job và kiểm tra video đầu ra.</span><button disabled title="Chưa có engine LipSync và job tạo video" type="button">Generate LipSync</button><button disabled title="Chưa có nguồn face và adapter thay face" type="button">Thay face (tuỳ chọn)</button></div>
      </ModuleFrame>
    </div>
    <div className="module-column module-column--bottom">
      <Timeline take={null} gain={0} onGainChange={() => undefined} alignment={{ duration: length, video: video ? { name: video.name, duration: video.duration, placement: videoPlace } : null, audio: output ? { name: output.name, duration: output.duration, placement: audioPlace } : null, audioUrl, playhead, playing, onSeek: seek, onTogglePlay: () => setPlaying((value) => !value), onPlacementChange: updatePlacement }} />
    </div>
  </div>;
}
