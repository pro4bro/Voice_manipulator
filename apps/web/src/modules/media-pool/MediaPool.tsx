import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { EMOTION_OPTIONS, emotionLabel } from "../../domain/emotions";
import type { EmotionLabel, EnvironmentNoiseProfile, MediaImportChoice, ProjectMediaAsset, SpeakerProfile, WorkspacePage } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

const STT_MODELS = [
  { id: "tiny", label: "Tiny · nhanh nhất / yếu nhất" },
  { id: "base", label: "Base · nhẹ" },
  { id: "small", label: "Small · cân bằng nhẹ" },
  { id: "medium", label: "Medium · chính xác hơn" },
  { id: "large-v3", label: "Large v3 · mạnh nhất / mặc định" },
] as const;
const MEDIA_ACCEPT = [
  "audio/*", "video/*", ".mov", ".mp4", ".mkv", ".avi", ".webm", ".mxf",
  ".h264", ".h265", ".hevc", ".av1", ".prores", ".mp3", ".wav", ".aac",
  ".wma", ".m4a", ".flac", ".ogg", ".opus", ".aif", ".aiff", ".ac3",
].join(",");

interface MediaPoolProps {
  assets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  busy: boolean;
  workflow: WorkspacePage;
  speakers: SpeakerProfile[];
  environments: EnvironmentNoiseProfile[];
  onImport: (choices: MediaImportChoice[]) => void;
  onImportLocal?: () => void;
  onSetLocalCache?: (assetId: string, enabled: boolean) => void;
  onSelect: (assetId: string) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: (model: string) => void;
  onRemove: (asset: ProjectMediaAsset) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onSendToTraining: () => void;
}

interface TranscriptHistoryDialogProps {
  asset: ProjectMediaAsset;
  onClose: () => void;
}

function durationLabel(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.round(safe % 60)).padStart(2, "0")}`;
}

function transcriptionProgressLabel(value: number | undefined) {
  return Math.max(0, Math.min(100, value ?? 0)).toFixed(1);
}

function transcriptionLabel(asset: ProjectMediaAsset) {
  if (asset.status === "no-audio" || asset.transcriptionStatus === "not-applicable") return "NO AUDIO";
  if (asset.transcriptionStatus === "queued") return "QUEUED";
  if (asset.transcriptionStatus === "processing") return "STT ĐANG CHẠY";
  if (asset.transcriptionStatus === "reviewing") return "AI REVIEW";
  if (asset.transcriptionStatus === "error") return "STT ERROR";
  if (asset.transcriptionStatus === "skipped") return "NO STT";
  return asset.aiReviewStatus === "complete" ? "AI CHECKED" : "TRANSCRIPT";
}

function TranscriptHistoryDialog({ asset, onClose }: TranscriptHistoryDialogProps) {
  const revisions = asset.revisions.slice().reverse();
  const [revisionId, setRevisionId] = useState(revisions[0]?.id ?? "current");
  const selected = revisions.find((revision) => revision.id === revisionId) ?? revisions[0] ?? null;

  return createPortal(
    <div className="media-history-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label={`Text History: ${asset.name}`} aria-modal="true" className="media-history-dialog" role="dialog">
        <header>
          <div><span>TEXT HISTORY</span><strong>{asset.name}</strong></div>
          <button aria-label="Đóng Text History" onClick={onClose} type="button">×</button>
        </header>
        <div className="media-history-dialog__body">
          <nav aria-label="Các phiên bản transcript">
            {revisions.map((revision) => <button className={revision.id === selected?.id ? "is-active" : ""} key={revision.id} onClick={() => setRevisionId(revision.id)} type="button"><b>{revision.source.toUpperCase()}</b><small>{new Date(revision.createdAt).toLocaleString("vi-VN")}</small></button>)}
            {!revisions.length ? <span>Chưa có transcript được lưu.</span> : null}
          </nav>
          <article>
            <div><b>{selected?.source.toUpperCase() ?? "CHƯA CÓ TEXT"}</b><time>{selected ? new Date(selected.createdAt).toLocaleString("vi-VN") : ""}</time></div>
            <pre>{selected?.text || "Không có transcript trong phiên bản này."}</pre>
          </article>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function MediaPool({
  assets,
  selectedAssetId,
  busy,
  workflow,
  speakers,
  environments,
  onImport,
  onImportLocal = () => undefined,
  onSetLocalCache = () => undefined,
  onSelect,
  onToggleTraining,
  onToggleTranscription,
  onQueueTranscriptions,
  onRemove,
  onUpdateAnnotations,
  onSendToTraining,
}: MediaPoolProps) {
  const [pendingImports, setPendingImports] = useState<MediaImportChoice[]>([]);
  const [contextMenu, setContextMenu] = useState<{ assetId: string; left: number; top: number } | null>(null);
  const [historyAssetId, setHistoryAssetId] = useState<string | null>(null);
  const [sttModel, setSttModel] = useState<string>("large-v3");
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextAsset = assets.find((asset) => asset.id === contextMenu?.assetId) ?? null;
  const historyAsset = assets.find((asset) => asset.id === historyAssetId) ?? null;
  const trainingCount = assets.filter((asset) => asset.trainingSelected).length;
  const transcriptionCount = assets.filter((asset) => asset.transcriptionSelected && asset.status !== "no-audio" && !["processing", "reviewing", "queued"].includes(asset.transcriptionStatus)).length;

  useEffect(() => {
    if (!contextMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    const closeWithBlur = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    window.addEventListener("blur", closeWithBlur);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
      window.removeEventListener("blur", closeWithBlur);
    };
  }, [contextMenu]);

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) setPendingImports(files.map((file) => ({ file, transcribe: true })));
    event.target.value = "";
  }

  function togglePendingTranscript(index: number, transcribe: boolean) {
    setPendingImports((current) => current.map((choice, choiceIndex) => choiceIndex === index ? { ...choice, transcribe } : choice));
  }

  function confirmImport() {
    if (!pendingImports.length) return;
    onImport(pendingImports);
    setPendingImports([]);
  }

  function openContextMenu(event: MouseEvent, assetId: string) {
    event.preventDefault();
    onSelect(assetId);
    setContextMenu({
      assetId,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 300)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 560)),
    });
  }

  function openHistory(asset: ProjectMediaAsset) {
    setContextMenu(null);
    setHistoryAssetId(asset.id);
  }

  return (
    <ModuleFrame
      className="media-pool-module"
      eyebrow="PROJECT MEDIA"
      index="MP"
      title="Media Pool"
      action={<div className="media-import-actions"><label className="media-import"><Icon name="upload" /><span>{busy ? "IMPORTING" : "IMPORT"}</span><input aria-label="Import media" accept={MEDIA_ACCEPT} disabled={busy} multiple onChange={importFiles} type="file" /></label><button aria-label="Mở file media từ máy" className="media-import-native" disabled={busy} onClick={onImportLocal} title="Mở file gốc và tùy chọn cache local" type="button"><Icon name="folder" /></button></div>}
    >
      <div className="media-pool-summary">
        <span><b>{assets.length}</b> ASSETS</span>
        <span><b>{transcriptionCount}</b> TO STT</span>
        <span><b>{trainingCount}</b> TO TRAIN</span>
      </div>
      <div className="media-pool-list">
        {assets.map((asset) => {
          const selected = asset.id === selectedAssetId;
          const codec = asset.audioCodec ?? asset.videoCodec ?? asset.sourceExtension.slice(1).toUpperCase();
          const assignedNames = speakers.filter((speaker) => asset.speakerProfileIds.includes(speaker.id)).map((speaker) => speaker.name);
          const environmentNames = environments.filter((profile) => asset.environmentProfileIds.includes(profile.id)).map((profile) => profile.name);
          return (
            <div className={`media-pool-item ${selected ? "is-active" : ""}`} key={asset.id} onContextMenu={(event) => openContextMenu(event, asset.id)}>
              <button aria-pressed={selected} className="media-pool-item__main" onClick={() => onSelect(asset.id)} type="button">
                <span className={`media-kind media-kind--${asset.mediaKind}`}><Icon name={asset.mediaKind === "video" ? "project" : "waveform"} /></span>
                <span className="media-item-copy">
                  <strong>{asset.name}</strong>
                  <small>{asset.mediaKind.toUpperCase()} · {codec} · {durationLabel(asset.duration)}</small>
                  <em>{transcriptionLabel(asset)} · {asset.revisions.length} REV · {emotionLabel(asset.emotion).toUpperCase()} · {assignedNames.join(", ") || "CHƯA GÁN SPEAKER"}{environmentNames.length ? " · " + environmentNames.join(", ") : ""}{asset.hasExternalSource ? asset.localCacheEnabled ? " · CACHE ✓ " + (asset.localCacheUpdatedAt ? new Date(asset.localCacheUpdatedAt).toLocaleString("vi-VN") : "") : " · ORIGINAL FILE" : ""}</em>
                  {["queued", "processing", "reviewing"].includes(asset.transcriptionStatus) ? <span aria-label={`Tiến trình Speech to text ${transcriptionProgressLabel(asset.transcriptionProgress)}%`} className="media-transcription-progress"><i style={{ width: `${asset.transcriptionProgress ?? 0}%` }} /><b>{asset.transcriptionStatus === "reviewing" ? "AI CHECK" : asset.transcriptionStatus === "queued" ? "WAITING" : "STT KỸ"} · {transcriptionProgressLabel(asset.transcriptionProgress)}%</b></span> : null}
                </span>
              </button>
              <div className="media-pool-item__toggles">
                <label className={`media-training-toggle ${asset.transcriptionSelected ? "is-selected" : ""}`}>
                  <input aria-label={`Đưa ${asset.name} vào hàng đợi Speech to text`} checked={asset.transcriptionSelected} disabled={asset.status === "no-audio" || ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus)} onChange={(event) => onToggleTranscription(asset.id, event.target.checked)} type="checkbox" />
                  <span>STT</span>
                </label>
                <label className={`media-training-toggle ${asset.trainingSelected ? "is-selected" : ""}`}>
                  <input aria-label={`Dùng ${asset.name} cho Voice Training`} checked={asset.trainingSelected} disabled={asset.status === "no-audio"} onChange={(event) => onToggleTraining(asset.id, event.target.checked)} type="checkbox" />
                  <span>TRAIN</span>
                </label>
              </div>
            </div>
          );
        })}
        {!assets.length ? <div className="media-pool-empty"><Icon name="folder" /><b>Chưa có footage</b><span>Import video/audio hoặc thu một take mới.</span></div> : null}
      </div>
      <div className="media-pool-footer">
        {workflow === "speech-to-text" ? <div className="media-stt-action"><button className="button button--accent media-send-training" disabled={!transcriptionCount} onClick={() => onQueueTranscriptions(sttModel)} type="button">Speech to text {transcriptionCount ? `(${transcriptionCount})` : ""}</button><select aria-label="Model Speech to Text" onChange={(event) => setSttModel(event.target.value)} value={sttModel}>{STT_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></div> : null}
        {workflow === "speech-to-text" && trainingCount > 0 ? <button className="button button--lime button--full media-send-training" onClick={onSendToTraining} type="button">Gửi {trainingCount} footage sang Voice Training</button> : null}
        <p className="media-pool-note"><i /> STT chạy lần lượt theo thứ tự footage được thêm vào, ngay cả khi bạn đổi page.</p>
      </div>
      {pendingImports.length ? <div className="media-import-backdrop"><section aria-label="Tùy chọn import media" aria-modal="true" className="media-import-dialog" role="dialog"><header><span>IMPORT QUEUE</span><strong>{pendingImports.length} footage</strong></header><p>Chọn footage cần đưa vào hàng chờ STT. STT kỹ sẽ chỉ chạy khi bấm Speech to text.</p><div className="media-import-choices">{pendingImports.map((choice, index) => <label key={`${choice.file.name}-${index}`}><span><b>{choice.file.name}</b><small>{(choice.file.size / 1024 / 1024).toFixed(1)} MB</small></span><input aria-label={`Đánh dấu STT cho ${choice.file.name}`} checked={choice.transcribe} onChange={(event) => togglePendingTranscript(index, event.target.checked)} type="checkbox" /><em>{choice.transcribe ? "TO STT" : "IMPORT ONLY"}</em></label>)}</div><footer><button className="button button--quiet" onClick={() => setPendingImports([])} type="button">Hủy</button><button className="button button--accent" onClick={confirmImport} type="button">Import {pendingImports.length} file</button></footer></section></div> : null}
      {contextMenu && contextAsset ? createPortal(
        <div aria-label={`Gán profile cho ${contextAsset.name}`} className="media-context-menu" ref={contextMenuRef} role="menu" style={{ left: contextMenu.left, top: contextMenu.top }}>
          <header><span>FOOTAGE PROPERTIES</span><b>{contextAsset.name}</b></header>
          <section><strong>EMOTION</strong><div className="media-context-options media-context-options--emotion">{EMOTION_OPTIONS.map((option) => <button aria-pressed={contextAsset.emotion === option.id} className={contextAsset.emotion === option.id ? "is-active" : ""} key={option.id} onClick={() => onUpdateAnnotations(contextAsset.id, contextAsset.speakerProfileIds, contextAsset.environmentProfileIds, option.id)} role="menuitem" type="button">{option.label}</button>)}</div></section>
          <section><strong><Icon name="person" /> SPEAKER PROFILE</strong><div className="media-context-options media-context-options--speakers">{speakers.map((speaker) => { const assigned = contextAsset.speakerProfileIds.includes(speaker.id); return <button aria-pressed={assigned} className={assigned ? "is-active" : ""} key={speaker.id} onClick={() => onUpdateAnnotations(contextAsset.id, assigned ? contextAsset.speakerProfileIds.filter((id) => id !== speaker.id) : [...contextAsset.speakerProfileIds, speaker.id], contextAsset.environmentProfileIds, contextAsset.emotion)} role="menuitem" type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>; })}{!speakers.length ? <p>Thêm Speaker Profile trong Sound Library trước.</p> : null}</div></section>
          <section><strong><Icon name="landscape" /> ENVIRONMENT PROFILE</strong><div className="media-context-options media-context-options--speakers">{environments.map((profile) => { const assigned = contextAsset.environmentProfileIds.includes(profile.id); return <button aria-pressed={assigned} className={assigned ? "is-active" : ""} key={profile.id} onClick={() => onUpdateAnnotations(contextAsset.id, contextAsset.speakerProfileIds, assigned ? contextAsset.environmentProfileIds.filter((id) => id !== profile.id) : [...contextAsset.environmentProfileIds, profile.id], contextAsset.emotion)} role="menuitem" type="button"><Icon name="landscape" />{profile.name}</button>; })}{!environments.length ? <p>Thêm Environment Profile trong Sound Library trước.</p> : null}</div></section>
          <footer><span>RCLICK MENU</span><div>{contextAsset.hasExternalSource ? <button className="media-history-action" onClick={() => { setContextMenu(null); onSetLocalCache(contextAsset.id, !contextAsset.localCacheEnabled); }} role="menuitem" type="button"><Icon name="folder" /> {contextAsset.localCacheEnabled ? "Use original file" : "Local File Caching"}</button> : null}{contextAsset.hasExternalSource && contextAsset.localCacheEnabled ? <button className="media-history-action" onClick={() => { setContextMenu(null); onSetLocalCache(contextAsset.id, true); }} role="menuitem" type="button"><Icon name="upload" /> Refresh local cache</button> : null}<button className="media-history-action" onClick={() => openHistory(contextAsset)} role="menuitem" type="button"><Icon name="file" /> Text History</button><button className="media-remove-action" onClick={() => { setContextMenu(null); onRemove(contextAsset); }} role="menuitem" type="button"><Icon name="trash" /> Remove</button></div></footer>
        </div>,
        document.body,
      ) : null}
      {historyAsset ? <TranscriptHistoryDialog asset={historyAsset} onClose={() => setHistoryAssetId(null)} /> : null}
    </ModuleFrame>
  );
}