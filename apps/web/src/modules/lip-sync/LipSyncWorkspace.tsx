import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type KeyboardEvent, type PointerEvent } from "react";

import type { ProjectMediaAsset, TrainingModelOption, VoiceOutput } from "../../domain/types";
import { api } from "../../api/client";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { Icon } from "../../ui/Icon";
import { Timeline } from "../timeline/Timeline";
import { useLipSyncDocument } from "./use-lipsync-document";
import { LipSyncScopeEditor } from "./LipSyncScopeEditor";
import { LipSyncCoverageReview } from "./LipSyncCoverageReview";
import { LipSyncEngineSettings } from "./LipSyncEngineSettings";
import { LipSyncProcessing, type LipSyncReviewController } from "./LipSyncProcessing";
import { lipSyncUrl, type LipSyncDocument, visibleClipAt, compositionLength, clipEnd, duplicateClip, splitClip } from "../../domain/lipsync";
import { clampPlacement, sourceTime, type ClipPlacement } from "./alignment";
import "./lip-sync.css";

export interface LipSyncWorkspaceController {
  save: () => Promise<LipSyncDocument | null>;
  importSources: (kind: "media" | "voice", ids: string[]) => boolean;
}
export interface LipSyncWorkspaceProps {
  projectId: string;
  versionId?: string;
  enabled?: boolean;
  videoOutputPanel?: ReactNode;
  controllerRef?: MutableRefObject<LipSyncWorkspaceController | null>;
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

export function LipSyncWorkspace({ projectId, versionId, enabled = true, videoOutputPanel, controllerRef, assets, outputs, leftWidth, rightWidth, onResizeStart, onResizeKeyDown }: LipSyncWorkspaceProps) {
  const [sourceTab, setSourceTab] = useState<"video" | "audio" | "output">(videoOutputPanel ? "output" : "video");
  const state = useLipSyncDocument(projectId, versionId, enabled);
  const { document } = state;
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const selectedClip = document.clips.find((item) => item.id === selectedClipId) ?? document.clips[0] ?? null;
  const videoId = selectedClip?.assetId ?? null;
  const outputId = document.audio?.outputId ?? null;
  const videoPlace: ClipPlacement = selectedClip ?? EMPTY_PLACEMENT;
  const audioPlace: ClipPlacement = document.audio ?? EMPTY_PLACEMENT;
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [afterJobId, setAfterJobId] = useState<string | null>(null);
  useEffect(() => { setAfterJobId(null); }, [projectId, document]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [engines, setEngines] = useState<TrainingModelOption[]>([]);
  const [settingsValid, setSettingsValid] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);
  const engineId = document.engineId;
  const engineSettings = document.engineSettings;
  const setEngineId = (id: string) => state.edit((current) => ({ ...current, engineId: id }));
  const reviewController = useRef<LipSyncReviewController | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const videos = assets.filter((asset) => asset.mediaKind === "video" && !asset.deletedAt && !asset.disabled && asset.duration > 0);
  const audios = outputs.filter((output) => output.audioAvailable !== false && output.duration > 0);
  const video = videos.find((item) => item.id === videoId) ?? null;
  const output = audios.find((item) => item.id === outputId) ?? null;
  const length = compositionLength(document);
  const previewClip = visibleClipAt(document, playhead);
  const previewAsset = videos.find((item) => item.id === previewClip?.assetId) ?? null;
  const previewPlace: ClipPlacement = previewClip ?? EMPTY_PLACEMENT;
  const videoUrl = previewAsset ? `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(previewAsset.id)}/video` : undefined;
  const audioUrl = output ? `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(output.id)}/audio` : undefined;
  const visibleVideo = !!previewAsset;
  const selectedEngine = engines.find((item) => item.id === engineId) ?? engines[0];

  useEffect(() => {
    let live = true;
    void api.getEngineCatalog("lip-sync").then((options) => {
      if (!live) return;
      setEngines(options);
      setEngineError(null);
    }).catch(() => { if (live) setEngineError("Không tải được danh sách engine LipSync."); });
    return () => { live = false; };
  }, []);

  useEffect(() => { setPlayhead((current) => Math.min(current, length)); }, [length]);

  useEffect(() => {
    if (playing) return;
    videoRef.current?.pause();
    audioRef.current?.pause();
    if (videoRef.current && afterJobId) videoRef.current.currentTime = Math.min(length, playhead);
    else if (videoRef.current && previewAsset) videoRef.current.currentTime = Math.min(previewAsset.duration, sourceTime(playhead, previewAsset.duration, previewPlace) ?? previewPlace.inPoint);
    if (audioRef.current && output) audioRef.current.currentTime = Math.min(output.duration, sourceTime(playhead, output.duration, audioPlace) ?? audioPlace.inPoint);
  }, [playing, playhead, previewAsset, output, previewPlace, audioPlace, afterJobId, length]);

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
      const active = visibleClipAt(document, current);
      const asset = videos.find((item) => item.id === active?.assetId);
      if (afterJobId) sync(videoRef.current, length, { start: 0, inPoint: 0, outPoint: length });
      else if (active && asset && videoRef.current?.dataset.clipId === active.id) sync(videoRef.current, asset.duration, active);
      if (output) sync(audioRef.current, output.duration, audioPlace);
      if (current < length) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Restarting this effect for every playhead paint would reset the master clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, document.clips, document.layers, outputId, audioPlace, length, afterJobId]);

  const seek = (value: number) => { setPlaying(false); setPlayhead(clampPlacement(value, length)); };
  const chooseVideo = (asset: ProjectMediaAsset) => {
    const id = crypto.randomUUID();
    state.edit((current) => {
      const layer = current.layers.find((item) => item.id === activeLayerId) ?? current.layers.find((item) => item.id === selectedClip?.layerId) ?? current.layers[0] ?? { id: crypto.randomUUID(), name: "Video 1", enabled: true };
      const end = Math.max(0, ...current.clips.filter((item) => item.layerId === layer.id).map((item) => item.start + item.outPoint - item.inPoint));
      return { ...current, layers: current.layers.length ? current.layers : [layer], clips: [...current.clips,
        { id, assetId: asset.id, layerId: layer.id, start: end, inPoint: 0, outPoint: asset.duration }] };
    });
    setSelectedClipId(id); setPlaying(false); setPreviewError(null);
  };
  const chooseAudio = (item: VoiceOutput) => {
    state.edit((current) => ({ ...current, audio: { outputId: item.id, start: current.audio?.start ?? 0, inPoint: 0, outPoint: item.duration } }));
    setPlaying(false); setPreviewError(null);
  };
  const saveAll = async () => {
      if (!settingsValid) throw new Error("Sửa thông số engine chưa hợp lệ trước khi đổi version.");
      const saved = await state.save();
      if (!saved) throw new Error("Chưa lưu được bố cục. Kiểm tra lỗi hoặc tải lại bản đã lưu.");
      if (reviewController.current && !await reviewController.current.save()) throw new Error("Chưa lưu được duyệt mặt. Lưu hoặc bỏ thay đổi duyệt mặt trước khi đổi version.");
      return saved;
  };
  if (controllerRef) controllerRef.current = {
    save: saveAll,
    importSources: (kind, ids) => {
      if (!state.ready || state.busy) return false;
      if (kind === "voice") { const item = audios.find((item) => item.id === ids[0]); if (item) chooseAudio(item); }
      else {
        const sources = ids.flatMap((id) => { const asset = videos.find((item) => item.id === id); return asset ? [asset] : []; });
        state.edit((current) => {
          if (!sources.length) return current;
          const layer = current.layers.find((item) => item.id === activeLayerId) ?? current.layers[0] ?? { id: crypto.randomUUID(), name: "Video 1", enabled: true };
          let start = Math.max(0, ...current.clips.filter((clip) => clip.layerId === layer.id).map(clipEnd));
          const clips = sources.map((asset) => { const clip = { id: crypto.randomUUID(), assetId: asset.id, layerId: layer.id, start, inPoint: 0, outPoint: asset.duration }; start += asset.duration; return clip; });
          return { ...current, layers: current.layers.length ? current.layers : [layer], clips: [...current.clips, ...clips] };
        });
      }
      setPlaying(false); setPreviewError(null); return true;
    },
  };
  const updatePlacement = (kind: "video" | "audio", placement: ClipPlacement, clipId = selectedClip?.id) => {
    setPlaying(false);
    state.edit((current) => kind === "video" ? { ...current, clips: current.clips.map((clip) => clip.id === clipId
      ? { ...clip, ...placement, outPoint: placement.outPoint ?? video?.duration ?? clip.outPoint } : clip) }
      : { ...current, audio: current.audio ? { ...current.audio, ...placement, outPoint: placement.outPoint ?? output?.duration ?? current.audio.outPoint } : null });
  };
  const placeStart = (kind: "video" | "audio", value: number) => {
    updatePlacement(kind, { ...(kind === "video" ? videoPlace : audioPlace), start: clampPlacement(value, 36000) });
  };
  const placeIn = (kind: "video" | "audio", value: number) => {
    const place = kind === "video" ? videoPlace : audioPlace;
    const duration = kind === "video" ? video?.duration ?? 0 : output?.duration ?? 0;
    updatePlacement(kind, { ...place, inPoint: clampPlacement(value, Math.max(0, (place.outPoint ?? duration) - .1)) });
  };
  const placeOut = (kind: "video" | "audio", value: number) => {
    const place = kind === "video" ? videoPlace : audioPlace;
    const duration = kind === "video" ? video?.duration ?? 0 : output?.duration ?? 0;
    updatePlacement(kind, { ...place, outPoint: Math.max(place.inPoint + .1, clampPlacement(value, duration)) });
  };

  return <div onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !(event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) {
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") { event.preventDefault(); setPlaying(false); state.undo(key === "y" || event.shiftKey); }
    }
  }} className="studio-board studio-board--lip-sync lipsync-board" style={{ "--left-column": `${leftWidth}px`, "--right-column": `${rightWidth}px` } as CSSProperties}>
    <div className="module-column module-column--left">
      <section className="library-panel lipsync-library">
        <div className="library-panel-tabs" role="tablist" aria-label="Nguồn LipSync">
          {videoOutputPanel ? <button aria-selected={sourceTab === "output"} className={sourceTab === "output" ? "is-active" : ""} onClick={() => setSourceTab("output")} role="tab" type="button">Video Output</button> : null}
          <button aria-selected={sourceTab === "video"} className={sourceTab === "video" ? "is-active" : ""} onClick={() => setSourceTab("video")} role="tab" type="button"><Icon name="folder" />Media Pool <b>{videos.length}</b></button>
          <button aria-selected={sourceTab === "audio"} className={sourceTab === "audio" ? "is-active" : ""} onClick={() => setSourceTab("audio")} role="tab" type="button"><Icon name="waveform" />Voice Output <b>{audios.length}</b></button>
        </div>
      <ModuleFrame title={sourceTab === "output" ? "Video Output" : sourceTab === "video" ? "Media Pool" : "Voice Output"} eyebrow={sourceTab === "output" ? "SESSION / VERSION" : sourceTab === "video" ? "FOOTAGE VIDEO" : "GENERATED AUDIO"} className="lipsync-sources">
        {sourceTab === "output" ? <div role="tabpanel">{videoOutputPanel}</div> : sourceTab === "video" ? <div className="lipsync-source-list" role="tabpanel">
          {videos.length ? videos.map((item) => <button aria-pressed={item.id === videoId} className={item.id === videoId ? "is-selected" : ""} key={item.id} disabled={!state.ready} onClick={() => chooseVideo(item)} type="button"><b>{item.name}</b><small>{clock(item.duration)} · {item.sourceExtension.toUpperCase()}</small></button>) : <p>Chưa có video trong Media Pool. Import footage tại page Input.</p>}
        </div> : <div className="lipsync-source-list" role="tabpanel">
          {audios.length ? audios.map((item) => <button aria-pressed={item.id === outputId} className={item.id === outputId ? "is-selected" : ""} key={item.id} disabled={!state.ready} onClick={() => chooseAudio(item)} type="button"><b>{item.name}</b><small>{clock(item.duration)} · {item.voiceName}</small></button>) : <p>Chưa có voice generated. Tạo giọng tại Voice Manipulator.</p>}
        </div>}
      </ModuleFrame>
      </section>
    </div>
    <div aria-label="Co kéo cột trái" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => onResizeKeyDown("left", event)} onPointerDown={(event) => onResizeStart("left", event)} role="separator" tabIndex={0}><i /></div>
    <div className="module-column module-column--center">
      <ModuleFrame title="Preview Video" eyebrow="BEFORE / SOURCE FOOTAGE" className="lipsync-preview script-module">
        <div className="lipsync-compare"><button onClick={() => { setPlaying(false); setAfterJobId(null); }} type="button">Before · footage gốc</button><b>{afterJobId ? "After · đã qua QC cấu trúc" : "Chọn Xem After ở job đã hoàn tất"}</b></div>
        <div className="lipsync-preview-screen">
          {afterJobId ? <video key={afterJobId} aria-label="Video sau LipSync" muted playsInline preload="metadata" ref={videoRef} onLoadedMetadata={(event) => { event.currentTarget.currentTime = playhead; }} src={lipSyncUrl(projectId, `/jobs/${afterJobId}/video`, versionId)} /> : previewAsset ? <video key={previewClip?.id} data-clip-id={previewClip?.id} aria-label="Video trước LipSync" muted onError={() => { setPlaying(false); setPreviewError("Trình duyệt không phát được footage này. Cần bản MP4/WebM tương thích để preview."); }} onLoadedMetadata={(event) => { event.currentTarget.currentTime = sourceTime(playhead, previewAsset.duration, previewPlace) ?? previewPlace.inPoint; if (playing) void event.currentTarget.play().catch(() => setPlaying(false)); }} playsInline preload="metadata" ref={videoRef} src={videoUrl} /> : <div className="lipsync-empty-video"><Icon name="play" /><b>Chọn footage video từ Media Pool</b></div>}
          {!afterJobId && document.clips.length > 0 && !visibleVideo ? <div className="lipsync-video-curtain">Video chưa bắt đầu tại vị trí này</div> : null}
        </div>
        {output ? <audio aria-label="Voice Output cho LipSync" onError={() => { setPlaying(false); setPreviewError("Không đọc được file Voice Output đã chọn. Tải lại danh sách và chọn một output có audio hợp lệ."); }} onLoadedMetadata={(event) => { event.currentTarget.currentTime = sourceTime(playhead, output.duration, audioPlace) ?? audioPlace.inPoint; }} preload="metadata" ref={audioRef} src={audioUrl} /> : null}
        {previewError ? <p role="alert">{previewError}</p> : null}
        <div className="lipsync-preview-caption"><b>{afterJobId ? "After · composition đã render" : previewAsset?.name ?? "Không có video tại playhead"}</b><span>{clock(playhead)} / {clock(length)} · Audio gốc tắt · nghe Voice Output trên Timeline</span></div>
      </ModuleFrame>
    </div>
    <div aria-label="Co kéo cột phải" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => onResizeKeyDown("right", event)} onPointerDown={(event) => onResizeStart("right", event)} role="separator" tabIndex={0}><i /></div>
    <div className="module-column module-column--right">
      <ModuleFrame title="Căn timing" eyebrow="VIDEO / GENERATED VOICE" className="lipsync-controls">
        <p>Đặt vị trí bắt đầu của mỗi clip trên timeline và điểm lấy nguồn. Preview dùng chung một đồng hồ.</p>
        <fieldset className="lipsync-engine-choices"><legend>Engine LipSync</legend>
          {engines.length ? engines.map((engine) => <label className={`lipsync-engine-choice ${engine.id === engineId ? "is-selected" : ""}`} key={engine.id}>
            <input checked={engine.id === engineId} disabled={!state.ready} name="lipsync-engine" onChange={() => setEngineId(engine.id)} type="radio" value={engine.id} />
            <span><b>{engine.label}</b><small>{engine.installed ? "Source đã tải" : "Chưa có source"} · {engine.available ? "Sẵn sàng" : "Chưa thể render"}</small></span>
          </label>) : <p>{engineError ?? "Đang kiểm tra source engine…"}</p>}
        </fieldset>
        {selectedEngine ? <details className="lipsync-engine-info"><summary>Thông tin và license · {selectedEngine.label}</summary><p>{selectedEngine.description}</p><p>{selectedEngine.notes[0]}</p><p>{selectedEngine.status}</p></details> : null}
        {selectedEngine && state.ready ? <LipSyncEngineSettings engine={selectedEngine} key={selectedEngine.id} onValidityChange={setSettingsValid} values={engineSettings[selectedEngine.id] ?? {}}
          onChange={(values) => state.edit((current) => ({ ...current, engineId: selectedEngine.id, engineSettings: { ...current.engineSettings, [selectedEngine.id]: values } }))} /> : null}
        <div className="lipsync-edit-tools">
          <button disabled={!state.ready} onClick={() => { const id = crypto.randomUUID(); state.edit((current) => ({ ...current, layers: [{ id, name: `Video ${current.layers.length + 1}`, enabled: true }, ...current.layers] })); setActiveLayerId(id); }} type="button">Thêm layer video</button>
          <button disabled={!selectedClip} onClick={() => { if (selectedClip) state.edit((current) => duplicateClip(current, selectedClip.id, crypto.randomUUID())); }} type="button">Nhân bản clip</button>
          <button disabled={!selectedClip || playhead - selectedClip.start < .1 || clipEnd(selectedClip) - playhead < .1} onClick={() => { if (selectedClip) state.edit((current) => splitClip(current, selectedClip.id, playhead, crypto.randomUUID())); }} type="button">Cắt tại playhead</button>
          <button disabled={!selectedClip} onClick={() => state.edit((current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== selectedClip?.id) }))} type="button">Xóa clip</button>
          <button disabled={!state.canUndo} onClick={() => { setPlaying(false); state.undo(); }} type="button">Undo</button>
          <button disabled={!state.canRedo} onClick={() => { setPlaying(false); state.undo(true); }} type="button">Redo</button>
        </div>
        <label>Layer thêm footage<select value={activeLayerId ?? selectedClip?.layerId ?? document.layers[0]?.id ?? ""} onChange={(event) => setActiveLayerId(event.target.value)}><option value="" disabled>Layer mặc định</option>{document.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
        <fieldset disabled={!video}><legend>Video</legend>
        <label>Layer của clip<select value={selectedClip?.layerId ?? ""} onChange={(event) => { const layerId = event.target.value; state.edit((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === selectedClip?.id ? { ...clip, layerId } : clip) })); }}>{document.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label><label>Vị trí trên timeline (s)<input min="0" onChange={(event) => placeStart("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.start} /></label><label>Điểm IN nguồn (s)<input max={Math.max(0, (videoPlace.outPoint ?? video?.duration ?? 0) - .1)} min="0" onChange={(event) => placeIn("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.inPoint} /></label><label>Điểm OUT nguồn (s)<input max={video?.duration ?? 0} min={videoPlace.inPoint + .1} onChange={(event) => placeOut("video", Number(event.target.value))} step="0.01" type="number" value={videoPlace.outPoint ?? video?.duration ?? 0} /></label></fieldset>
        <fieldset disabled={!output}><legend>Voice Output</legend><label>Vị trí trên timeline (s)<input min="0" onChange={(event) => placeStart("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.start} /></label><label>Điểm IN nguồn (s)<input max={Math.max(0, (audioPlace.outPoint ?? output?.duration ?? 0) - .1)} min="0" onChange={(event) => placeIn("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.inPoint} /></label><label>Điểm OUT nguồn (s)<input max={output?.duration ?? 0} min={audioPlace.inPoint + .1} onChange={(event) => placeOut("audio", Number(event.target.value))} step="0.01" type="number" value={audioPlace.outPoint ?? output?.duration ?? 0} /></label></fieldset>
        {state.ready ? <>
          <LipSyncScopeEditor title="Phạm vi nhận diện" scope={document.detectionScope} layers={document.layers} duration={length} onChange={(scope) => state.edit((current) => ({ ...current, detectionScope: scope }))} />
          <LipSyncScopeEditor title="Phạm vi LipSync" scope={document.syncScope} layers={document.layers} duration={length} onChange={(scope) => state.edit((current) => ({ ...current, syncScope: scope }))} />
          <LipSyncCoverageReview versionId={versionId} projectId={projectId} document={document} dirty={state.dirty || !settingsValid} /><LipSyncProcessing onEditStart={state.beginGesture} onEditEnd={state.endGesture} faceReviews={state.faceReviews} onReviewChange={(review) => state.editReview(review)} onReviewBaseline={(review) => state.editReview(review, true)} versionId={versionId} controllerRef={reviewController} projectId={projectId} document={document} dirty={state.dirty || !settingsValid} onAfter={(jobId) => { setPlaying(false); setAfterJobId(jobId); }} />
        </> : null}
        <div className="lipsync-render-state"><b>{state.ready ? state.dirty ? "Chưa lưu thay đổi" : "Bố cục đã tải" : enabled ? "Đang tải bố cục…" : "Tạo session để bắt đầu"}</b><span>Revision {document.revision} · Render LipSync cần runtime, model và adapter.</span>{state.error ? <p role="alert">{state.error}</p> : null}<button disabled={!state.ready || state.busy || !state.dirty || !settingsValid} onClick={() => void saveAll().catch((reason) => setPreviewError(String(reason)))} type="button">{state.busy ? "Đang lưu…" : "Lưu bố cục"}</button><button disabled={!enabled || state.busy} onClick={() => void state.reload()} type="button">Tải lại bản đã lưu</button><button disabled title="Chưa có nguồn face và adapter thay face" type="button">Thay face (tuỳ chọn)</button></div>
      </ModuleFrame>
    </div>
    <div className="module-column module-column--bottom">
      <Timeline take={null} gain={0} onGainChange={() => undefined} alignment={{ onEditStart: state.beginGesture, onEditEnd: state.endGesture, videoClips: document.clips.flatMap((clip) => { const asset = videos.find((item) => item.id === clip.assetId); return asset ? [{ id: clip.id, layerId: clip.layerId, name: asset.name, duration: asset.duration, placement: clip }] : []; }),
        videoLayers: document.layers, selectedClipId: selectedClip?.id, onSelectClip: (id) => { setSelectedClipId(id); setActiveLayerId(document.clips.find((clip) => clip.id === id)?.layerId ?? null); },
        onVideoPlacementChange: (id, placement) => updatePlacement("video", placement, id),
        onLayerToggle: (id) => { setPlaying(false); state.edit((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === id ? { ...layer, enabled: !layer.enabled } : layer) })); },
        onLayerMove: (id, direction) => { setPlaying(false); state.edit((current) => { const layers = [...current.layers], index = layers.findIndex((layer) => layer.id === id), target = index + direction; if (target < 0 || target >= layers.length) return current; [layers[index], layers[target]] = [layers[target], layers[index]]; return { ...current, layers }; }); },
        duration: length, video: video ? { name: video.name, duration: video.duration, placement: videoPlace } : null, audio: output ? { name: output.name, duration: output.duration, placement: audioPlace } : null, audioUrl, playhead, playing, onSeek: seek, onTogglePlay: () => setPlaying((value) => !value), onPlacementChange: updatePlacement }} />
    </div>
  </div>;
}
