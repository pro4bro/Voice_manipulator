import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import type { ProjectMediaAsset, VoiceOutput } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { clampPlacement, clipLength, sourceTime, timelineLength, type ClipPlacement } from "./alignment";
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
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${String(Math.floor((seconds - whole) * 100)).padStart(2, "0")}`;
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
  const drag = useRef<{ kind: "video" | "audio"; x: number; start: number; length: number } | null>(null);

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
    if (!playing) {
      videoRef.current?.pause();
      audioRef.current?.pause();
      if (videoRef.current && video) videoRef.current.currentTime = Math.min(video.duration, sourceTime(playhead, video.duration, videoPlace) ?? videoPlace.inPoint);
      if (audioRef.current && output) audioRef.current.currentTime = Math.min(output.duration, sourceTime(playhead, output.duration, audioPlace) ?? audioPlace.inPoint);
      return;
    }
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
    setter((current) => ({ ...current, inPoint: clampPlacement(value, Math.max(0, duration - 0.1)) }));
  };
  const beginDrag = (kind: "video" | "audio", event: PointerEvent<HTMLButtonElement>) => {
    drag.current = { kind, x: event.clientX, start: kind === "video" ? videoPlace.start : audioPlace.start, length };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    const width = event.currentTarget.parentElement?.clientWidth ?? 0;
    if (!current || current.kind !== event.currentTarget.dataset.kind || width <= 0) return;
    placeStart(current.kind, current.start + (event.clientX - current.x) / width * current.length);
  };

  return <div className="studio-board studio-board--lip-sync lipsync-board" style={{ "--left-column": `${leftWidth}px`, "--right-column": `${rightWidth}px` } as CSSProperties}>
    <div className="module-column module-column--left">
      <ModuleFrame title="Nguồn LipSync" eyebrow="MEDIA POOL / VOICE OUTPUT" className="lipsync-sources">
        <div className="lipsync-tabs" role="tablist" aria-label="Nguồn LipSync">
          <button aria-selected={sourceTab === "video"} onClick={() => setSourceTab("video")} role="tab" type="button">Media Pool · Video <b>{videos.length}</b></button>
          <button aria-selected={sourceTab === "audio"} onClick={() => setSourceTab("audio")} role="tab" type="button">Voice Output <b>{audios.length}</b></button>
        </div>
        {sourceTab === "video" ? <div className="lipsync-source-list" role="tabpanel">
          {videos.length ? videos.map((item) => <button aria-pressed={item.id === videoId} className={item.id === videoId ? "is-selected" : ""} key={item.id} onClick={() => chooseVideo(item)} type="button"><b>{item.name}</b><small>{clock(item.duration)} · {item.sourceExtension.toUpperCase()}</small></button>) : <p>Chưa có video trong Media Pool. Import footage tại page Input.</p>}
        </div> : <div className="lipsync-source-list" role="tabpanel">
          {audios.length ? audios.map((item) => <button aria-pressed={item.id === outputId} className={item.id === outputId ? "is-selected" : ""} key={item.id} onClick={() => chooseAudio(item)} type="button"><b>{item.name}</b><small>{clock(item.duration)} · {item.voiceName}</small></button>) : <p>Chưa có voice generated. Tạo giọng tại Voice Manipulator.</p>}
        </div>}
      </ModuleFrame>
    </div>
    <div aria-label="Co kéo cột trái" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => onResizeKeyDown("left", event)} onPointerDown={(event) => onResizeStart("left", event)} role="separator" tabIndex={0}><i /></div>
    <div className="module-column module-column--center">
      <ModuleFrame title="Preview Video" eyebrow="BEFORE / SOURCE FOOTAGE" className="lipsync-preview">
        <div className="lipsync-compare"><b>Before · footage gốc</b><button disabled title="After chỉ xuất hiện khi có video LipSync đã render" type="button">After · chờ render</button></div>
        <div className="lipsync-preview-screen">
          {video ? <video aria-label="Video trước LipSync" muted onError={() => { setPlaying(false); setPreviewError("Trình duyệt không phát được footage này. Cần bản MP4/WebM tương thích để preview."); }} playsInline preload="metadata" ref={videoRef} src={videoUrl} /> : <div className="lipsync-empty-video">Chọn footage video từ Media Pool</div>}
          {video && !visibleVideo ? <div className="lipsync-video-curtain">Video chưa bắt đầu tại vị trí này</div> : null}
        </div>
        {output ? <audio aria-label="Voice Output cho LipSync" onError={() => { setPlaying(false); setPreviewError("Không đọc được file Voice Output đã chọn. Tải lại danh sách và chọn một output có audio hợp lệ."); }} preload="metadata" ref={audioRef} src={audioUrl} /> : null}
        {previewError ? <p role="alert">{previewError}</p> : null}
        <div className="lipsync-transport"><button disabled={!video && !output} onClick={() => setPlaying((value) => !value)} type="button">{playing ? "Tạm dừng" : "Phát preview"}</button><span>{clock(playhead)} / {clock(length)}</span><span>Audio gốc của video được tắt; chỉ nghe Voice Output.</span></div>
        <input aria-label="Vị trí preview" max={length} min="0" onChange={(event) => seek(Number(event.target.value))} step="0.01" type="range" value={Math.min(playhead, length)} />
      </ModuleFrame>
    </div>
    <div aria-label="Co kéo cột phải" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => onResizeKeyDown("right", event)} onPointerDown={(event) => onResizeStart("right", event)} role="separator" tabIndex={0}><i /></div>
    <div className="module-column module-column--right">
      <ModuleFrame title="Căn timing" eyebrow="VIDEO / GENERATED VOICE" className="lipsync-controls">
        <p>Đặt vị trí bắt đầu của mỗi clip trên timeline và điểm lấy nguồn. Preview dùng chung một đồng hồ.</p>
        <fieldset disabled={!video}><legend>Video</legend><label>Vị trí trên timeline (s)<input min="0" onChange={(event) => placeStart("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.start} /></label><label>Điểm IN nguồn (s)<input max={Math.max(0, (video?.duration ?? 0) - .1)} min="0" onChange={(event) => placeIn("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.inPoint} /></label></fieldset>
        <fieldset disabled={!output}><legend>Voice Output</legend><label>Vị trí trên timeline (s)<input min="0" onChange={(event) => placeStart("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.start} /></label><label>Điểm IN nguồn (s)<input max={Math.max(0, (output?.duration ?? 0) - .1)} min="0" onChange={(event) => placeIn("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.inPoint} /></label></fieldset>
        <div className="lipsync-render-state"><b>Bản nháp preview</b><span>Timing chưa được lưu vào project. Render LipSync và thay face cần adapter, job và kiểm tra video đầu ra.</span><button disabled title="Chưa có engine LipSync và job tạo video" type="button">Generate LipSync</button><button disabled title="Chưa có nguồn face và adapter thay face" type="button">Thay face (tuỳ chọn)</button></div>
      </ModuleFrame>
    </div>
    <div className="module-column module-column--bottom">
      <ModuleFrame title="Timeline LipSync" eyebrow="2 TRACK / DRAG ĐỂ CĂN VỊ TRÍ" className="lipsync-timeline">
        <div className="lipsync-ruler" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width * length); }} role="presentation"><span>00:00</span><span>{clock(length / 2)}</span><span>{clock(length)}</span></div>
        <div className="lipsync-lanes">
          <div className="lipsync-lane"><span>VIDEO</span><div className="lipsync-lane-track">{video ? <button aria-label={`Di chuyển video ${video.name}`} data-kind="video" onPointerDown={(event) => beginDrag("video", event)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} style={{ left: `${videoPlace.start / length * 100}%`, width: `${clipLength(video.duration, videoPlace) / length * 100}%` }} type="button">{video.name}</button> : <small>Chọn video</small>}</div></div>
          <div className="lipsync-lane"><span>VOICE</span><div className="lipsync-lane-track">{output ? <button aria-label={`Di chuyển voice ${output.name}`} data-kind="audio" onPointerDown={(event) => beginDrag("audio", event)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} style={{ left: `${audioPlace.start / length * 100}%`, width: `${clipLength(output.duration, audioPlace) / length * 100}%` }} type="button">{output.name}</button> : <small>Chọn Voice Output</small>}</div></div>
          <div className="lipsync-playhead" style={{ left: `calc(${playhead / length * 100}% + ${62 * (1 - playhead / length)}px)` }} />
        </div>
        <p>Video: {video ? `${clock(videoPlace.start)} → ${clock(videoPlace.start + clipLength(video.duration, videoPlace))}` : "—"} · Voice: {output ? `${clock(audioPlace.start)} → ${clock(audioPlace.start + clipLength(output.duration, audioPlace))}` : "—"}</p>
      </ModuleFrame>
    </div>
  </div>;
}
