import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { EMOTION_OPTIONS, emotionLabel } from "../../domain/emotions";
import { missingPreparation } from "../../domain/footagePipeline";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { EmotionLabel, EnvironmentNoiseProfile, MediaImportChoice, ProjectAsrAdapter, ProjectMediaAsset, SpeakerProfile, TrainingModelOption, WorkspacePage } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

const STT_MODELS = [
  { id: "tiny", label: "Tiny · nhanh nhất / yếu nhất" },
  { id: "base", label: "Base · nhẹ" },
  { id: "small", label: "Small · cân bằng nhẹ" },
  { id: "medium", label: "Medium · chính xác hơn" },
  { id: "large-v3", label: "Large v3 · mạnh nhất / mặc định" },
] as const;

interface SttChoice {
  value: string;
  label: string;
  group: string;
  available: boolean;
  engine: TrainingModelOption | null;
}

/**
 * What the STT select offers, read from the engine descriptors. An engine with
 * a `model` choice contributes one entry per model; any other engine is one
 * entry under its own id. With no descriptors (an older API) the built-in
 * Whisper list still works.
 */
export function sttChoices(engines: TrainingModelOption[], adapters: ProjectAsrAdapter[] = []): SttChoice[] {
  if (!engines.length) {
    return STT_MODELS.map((model) => ({ value: model.id, label: model.label, group: "faster-whisper", available: true, engine: null }));
  }
  return engines.flatMap((engine) => {
    const models = engine.parameters.find((spec) => spec.key === "model" && spec.kind === "choice");
    if (models) {
      return models.options.map((option) => ({ value: String(option.value), label: option.label, group: engine.label, available: engine.available, engine }));
    }
    // Adapters this project trained for the engine follow it, as `engine@adapter`.
    const trained = adapters
      .filter((adapter) => adapter.engine === engine.id)
      .map((adapter) => ({ value: `${engine.id}@${adapter.id}`, label: `+ ${adapter.name}`, group: engine.label, available: engine.available, engine }));
    return [{ value: engine.id, label: engine.label, group: engine.label, available: engine.available, engine }, ...trained];
  });
}
const MEDIA_ACCEPT = [
  "audio/*", "video/*", ".mov", ".mp4", ".mkv", ".avi", ".webm", ".mxf",
  ".h264", ".h265", ".hevc", ".av1", ".prores", ".mp3", ".wav", ".aac",
  ".wma", ".m4a", ".flac", ".ogg", ".opus", ".aif", ".aiff", ".ac3",
].join(",");

export type MediaBatchAction =
  | { kind: "annotations"; changes: Array<{ assetId: string; speakerProfileIds: string[]; environmentProfileIds: string[]; emotion: EmotionLabel }> }
  | { kind: "disabled"; assetIds: string[]; disabled: boolean }
  | { kind: "selection"; target: "stt" | "training"; assetIds: string[]; selected: boolean }
  | { kind: "recycle" | "restore"; assetIds: string[] };

interface MediaPoolProps {
  assets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  busy: boolean;
  workflow: WorkspacePage;
  /** Speech-to-text engines from their descriptors; the select is built from these. */
  sttEngines?: TrainingModelOption[];
  /** Speech-recognition adapters this project trained. */
  asrAdapters?: ProjectAsrAdapter[];
  speakers: SpeakerProfile[];
  environments: EnvironmentNoiseProfile[];
  onImport: (choices: MediaImportChoice[]) => void;
  onImportLocal?: () => void;
  onSetLocalCache?: (assetId: string, enabled: boolean) => void;
  onSelect: (assetId: string) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: (model: string) => void;
  onControlTranscriptions: (action: "pause" | "resume" | "stop", assetIds?: string[]) => void;
  onRemove: (asset: ProjectMediaAsset) => void;
  onBatchAction: (action: MediaBatchAction) => void;
  onRestore: (asset: ProjectMediaAsset) => void;
  onReveal: (asset: ProjectMediaAsset) => void;
  onSetDisabled: (asset: ProjectMediaAsset, disabled: boolean) => void;
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
  sttEngines = [],
  asrAdapters = [],
  speakers,
  environments,
  onImport,
  onImportLocal = () => undefined,
  onSetLocalCache = () => undefined,
  onSelect,
  onToggleTraining,
  onToggleTranscription,
  onQueueTranscriptions,
  onControlTranscriptions,
  onRemove,
  onBatchAction,
  onRestore,
  onReveal,
  onSetDisabled,
  onUpdateAnnotations,
  onSendToTraining,
}: MediaPoolProps) {
  const [pendingImports, setPendingImports] = useState<MediaImportChoice[]>([]);
  const [contextMenu, setContextMenu] = useState<{ assetId: string; left: number; top: number } | null>(null);
  const [historyAssetId, setHistoryAssetId] = useState<string | null>(null);
  const [sttModel, setSttModel] = useState<string>("large-v3");
  const [selection, setSelection] = useState<ListSelection>({ ids: selectedAssetId && assets.some((asset) => asset.id === selectedAssetId && !asset.deletedAt) ? [selectedAssetId] : [], anchorId: selectedAssetId });
  const [binSelection, setBinSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const choices = sttChoices(sttEngines, asrAdapters);
  const chosen = choices.find((choice) => choice.value === sttModel) ?? null;
  const choiceGroups = choices.reduce<string[]>((groups, choice) => groups.includes(choice.group) ? groups : [...groups, choice.group], []);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextAsset = assets.find((asset) => asset.id === contextMenu?.assetId) ?? null;
  const liveAssets = assets.filter((asset) => !asset.deletedAt);
  const liveIds = liveAssets.map((asset) => asset.id);
  const selectedIds = reconcileListSelection(selection, liveIds).ids;
  const menuAssets = contextAsset && selectedIds.includes(contextAsset.id)
    ? liveAssets.filter((asset) => selectedIds.includes(asset.id))
    : contextAsset ? [contextAsset] : [];
  const menuTrainingEligible = menuAssets.filter((asset) => asset.status !== "no-audio");
  const menuSttEligible = menuTrainingEligible.filter((asset) => !["queued", "processing", "reviewing"].includes(asset.transcriptionStatus));
  // Newest first inside the bin; the bin itself is pinned last in the list.
  const recycledAssets = assets
    .filter((asset) => asset.deletedAt)
    .sort((left, right) => String(right.deletedAt).localeCompare(String(left.deletedAt)));
  const recycledIds = recycledAssets.map((asset) => asset.id);
  const selectedBinIds = reconcileListSelection(binSelection, recycledIds).ids;
  const [binOpen, setBinOpen] = useState(false);
  // Derived from the footage itself rather than polled: the assets already carry
  // their own status, so there is nothing extra to keep in step.
  const running = assets.filter((asset) => asset.transcriptionStatus === "queued" || asset.transcriptionStatus === "processing");
  const heldBack = assets.filter((asset) => asset.transcriptionStatus === "paused");
  const queueBusy = running.length > 0;
  // STT queue controls stay scoped to the list selection when right-clicked.
  const contextTargets = (asset: ProjectMediaAsset, action: "pause" | "resume" | "stop") => {
    const eligible = action === "pause" ? ["queued", "processing"] : action === "resume" ? ["paused"] : ["queued", "processing", "paused"];
    return menuAssets.length > 1 ? menuAssets.filter((item) => eligible.includes(item.transcriptionStatus)).map((item) => item.id) : [asset.id];
  };
  const historyAsset = assets.find((asset) => asset.id === historyAssetId) ?? null;
  const trainingCount = assets.filter((asset) => asset.trainingSelected).length;
  const transcriptionCount = assets.filter((asset) => asset.transcriptionSelected && asset.status !== "no-audio" && !["processing", "reviewing", "queued"].includes(asset.transcriptionStatus)).length;

  useEffect(() => {
    setSelection((current) => reconcileListSelection(current, liveIds));
  }, [liveIds.join("\0")]);
  useEffect(() => {
    setBinSelection((current) => reconcileListSelection(current, recycledIds));
  }, [recycledIds.join("\0")]);

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
    if (!selectedIds.includes(assetId)) setSelection({ ids: liveIds.includes(assetId) ? [assetId] : [], anchorId: assetId });
    onSelect(assetId);
    setContextMenu({
      assetId,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 300)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 560)),
    });
  }

  function selectAsset(event: MouseEvent<HTMLButtonElement>, asset: ProjectMediaAsset) {
    if (asset.deletedAt) {
      setSelection({ ids: [], anchorId: null });
      setBinSelection((current) => selectListItem(current, recycledIds, asset.id, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
    } else {
      setBinSelection({ ids: [], anchorId: null });
      setSelection((current) => selectListItem(current, liveIds, asset.id, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
    }
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) onSelect(asset.id);
  }

  function selectAllWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      if ((event.target as HTMLElement).closest(".media-recycle-bin") && binOpen) setBinSelection((current) => selectAllListItems(current, recycledIds));
      else setSelection((current) => selectAllListItems(current, liveIds));
    }
  }

  function updateMenuAnnotations(changes: MediaBatchAction & { kind: "annotations" }) {
    if (changes.changes.length > 1) {
      setContextMenu(null);
      onBatchAction(changes);
    } else {
      const change = changes.changes[0];
      if (change) onUpdateAnnotations(change.assetId, change.speakerProfileIds, change.environmentProfileIds, change.emotion);
    }
  }

  function openHistory(asset: ProjectMediaAsset) {
    setContextMenu(null);
    setHistoryAssetId(asset.id);
  }

  function renderAsset(asset: ProjectMediaAsset) {
    const selected = asset.deletedAt ? selectedBinIds.includes(asset.id) : selectedIds.includes(asset.id);
    const active = asset.id === selectedAssetId;
    const recycled = Boolean(asset.deletedAt);
    const parked = Boolean(asset.disabled) && !recycled;
    const codec = asset.audioCodec ?? asset.videoCodec ?? asset.sourceExtension.slice(1).toUpperCase();
    const assignedNames = speakers.filter((speaker) => asset.speakerProfileIds.includes(speaker.id)).map((speaker) => speaker.name);
    const environmentNames = environments.filter((profile) => asset.environmentProfileIds.includes(profile.id)).map((profile) => profile.name);
    const missing = recycled ? [] : missingPreparation(asset);
    return (
      <div className={`media-pool-item ${active ? "is-active" : ""} ${selected ? "is-selected" : ""} ${recycled ? "is-recycled" : ""} ${parked ? "is-disabled" : ""}`} key={asset.id} onContextMenu={(event) => openContextMenu(event, asset.id)}>
        <button aria-pressed={selected} className="media-pool-item__main" onClick={(event) => selectAsset(event, asset)} type="button">
          <span className={`media-kind media-kind--${asset.mediaKind}`}><Icon name={asset.mediaKind === "video" ? "project" : "waveform"} /></span>
          <span className="media-item-copy">
            <strong>{missing.length ? <span aria-label={`Chưa xong: ${missing.join(", ")}`} className="media-prep-warning" role="img" title={`Chưa xong: ${missing.join(", ")}`}>!</span> : null}{asset.name}</strong>
            <small>{asset.mediaKind.toUpperCase()} · {codec} · {durationLabel(asset.duration)}</small>
            <em>{transcriptionLabel(asset)} · {asset.revisions.length} REV · {emotionLabel(asset.emotion).toUpperCase()} · {assignedNames.join(", ") || "CHƯA GÁN SPEAKER"}{environmentNames.length ? " · " + environmentNames.join(", ") : ""}{asset.hasExternalSource ? asset.localCacheEnabled ? " · CACHE ✓ " + (asset.localCacheUpdatedAt ? new Date(asset.localCacheUpdatedAt).toLocaleString("vi-VN") : "") : " · ORIGINAL FILE" : ""}</em>
            {["queued", "processing", "reviewing", "paused"].includes(asset.transcriptionStatus) ? <span aria-label={`Tiến trình Speech to text ${transcriptionProgressLabel(asset.transcriptionProgress)}%`} className={`media-transcription-progress ${asset.transcriptionStatus === "paused" ? "is-paused" : ""}`}><i style={{ width: `${asset.transcriptionProgress ?? 0}%` }} /><b>{asset.transcriptionStatus === "paused" ? "TẠM DỪNG" : asset.transcriptionStatus === "reviewing" ? "AI CHECK" : asset.transcriptionStatus === "queued" ? "WAITING" : "STT KỸ"} · {transcriptionProgressLabel(asset.transcriptionProgress)}%</b></span> : null}
          </span>
        </button>
        <div className="media-pool-item__toggles">
        {recycled ? <><button className="media-restore-action" onClick={() => onRestore(asset)} title="Đưa footage trở lại Media Pool" type="button">Restore</button><button className="media-remove-action" onClick={() => onRemove(asset)} title="Xóa hẳn, không khôi phục được" type="button">Delete</button></> : <>
          <label className={`media-training-toggle ${asset.transcriptionSelected ? "is-selected" : ""}`}>
            <input aria-label={`Đưa ${asset.name} vào hàng đợi Speech to text`} checked={asset.transcriptionSelected} disabled={asset.status === "no-audio" || ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus)} onChange={(event) => onToggleTranscription(asset.id, event.target.checked)} type="checkbox" />
            <span>STT</span>
          </label>
          <label className={`media-training-toggle ${asset.trainingSelected ? "is-selected" : ""}`}>
            <input aria-label={`Dùng ${asset.name} cho Voice Training`} checked={asset.trainingSelected} disabled={asset.status === "no-audio"} onChange={(event) => onToggleTraining(asset.id, event.target.checked)} type="checkbox" />
            <span>TRAIN</span>
          </label></>}
        </div>
      </div>
    );
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
        <span><b>{liveAssets.length}</b> ASSETS</span>
        {selectedIds.length > 1 ? <span><b>{selectedIds.length}</b> SELECTED</span> : null}
        <span><b>{transcriptionCount}</b> TO STT</span>
        <span><b>{trainingCount}</b> TO TRAIN</span>
      </div>
      <div aria-label="Danh sách Media Pool" className="media-pool-list" onKeyDown={selectAllWithKeyboard} role="region" tabIndex={0}>
        {liveAssets.map(renderAsset)}
        {!liveAssets.length && !recycledAssets.length ? <div className="media-pool-empty"><Icon name="folder" /><b>Chưa có footage</b><span>Import video/audio hoặc thu một take mới.</span></div> : null}
        {/* Rendered after the list rather than inside it, so no amount of
            importing can push the bin out of last place. */}
        {recycledAssets.length ? <section className={`media-recycle-bin ${binOpen ? "is-open" : ""}`}>
          <button aria-expanded={binOpen} className="media-recycle-bin__toggle" onClick={() => setBinOpen((open) => !open)} type="button">
            <Icon name="trash" />
            <b>RECYCLE BIN</b>
            <span>{recycledAssets.length}</span>
            <i aria-hidden="true">{binOpen ? "▾" : "▸"}</i>
          </button>
          {binOpen ? <div className="media-recycle-bin__list">
            <p>Chỉ xem: play, script, subtitle và zoom vẫn dùng được; muốn sửa thì Restore trước.</p>
            {selectedBinIds.length > 1 ? <div className="media-recycle-bin__bulk"><span>{selectedBinIds.length} footage đã chọn</span><button onClick={() => { onBatchAction({ kind: "restore", assetIds: selectedBinIds }); setBinSelection({ ids: [], anchorId: null }); }} type="button">Restore đã chọn</button></div> : null}
            {recycledAssets.map(renderAsset)}
          </div> : null}
        </section> : null}
      </div>
      <div className="media-pool-footer">
        {workflow === "speech-to-text" ? <div className="media-stt-action">{queueBusy || heldBack.length ? <><button className="button button--quiet" onClick={() => onControlTranscriptions(queueBusy ? "pause" : "resume")} type="button">{queueBusy ? "Pause" : "Chạy tiếp"} ({queueBusy ? running.length : heldBack.length})</button><button className="button button--quiet media-stt-stop" onClick={() => onControlTranscriptions("stop")} type="button">Stop</button></> : <button className="button button--accent media-send-training" disabled={!transcriptionCount || (chosen !== null && !chosen.available)} onClick={() => onQueueTranscriptions(sttModel)} type="button">Speech to text {transcriptionCount ? `(${transcriptionCount})` : ""}</button>}<select aria-label="Model Speech to Text" onChange={(event) => setSttModel(event.target.value)} value={sttModel}>{choiceGroups.map((group) => <optgroup key={group} label={group}>{choices.filter((choice) => choice.group === group).map((choice) => <option disabled={!choice.available} key={choice.value} value={choice.value}>{choice.label}{choice.available ? "" : " · chưa sẵn sàng"}</option>)}</optgroup>)}</select>{chosen?.engine && chosen.engine.id !== "faster-whisper" ? <small className="media-stt-engine-note">{chosen.engine.description}</small> : null}</div> : null}
        {workflow === "speech-to-text" && trainingCount > 0 ? <button className="button button--lime button--full media-send-training" onClick={onSendToTraining} type="button">Gửi {trainingCount} footage sang Voice Training</button> : null}
        <p className="media-pool-note"><i /> STT chạy lần lượt theo thứ tự footage được thêm vào, ngay cả khi bạn đổi page.</p>
      </div>
      {pendingImports.length ? <div className="media-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingImports([]); }}><section aria-label="Tùy chọn import media" aria-modal="true" className="media-import-dialog" role="dialog"><header><span>IMPORT QUEUE</span><strong>{pendingImports.length} footage</strong></header><p>Chọn footage cần đưa vào hàng chờ STT. STT kỹ sẽ chỉ chạy khi bấm Speech to text.</p><div className="media-import-choices">{pendingImports.map((choice, index) => <label key={`${choice.file.name}-${index}`}><span><b>{choice.file.name}</b><small>{(choice.file.size / 1024 / 1024).toFixed(1)} MB</small></span><input aria-label={`Đánh dấu STT cho ${choice.file.name}`} checked={choice.transcribe} onChange={(event) => togglePendingTranscript(index, event.target.checked)} type="checkbox" /><em>{choice.transcribe ? "TO STT" : "IMPORT ONLY"}</em></label>)}</div><footer><button className="button button--quiet" onClick={() => setPendingImports([])} type="button">Hủy</button><button className="button button--accent" onClick={confirmImport} type="button">Import {pendingImports.length} file</button></footer></section></div> : null}
      {contextMenu && contextAsset ? createPortal(
        <div aria-label={`Gán profile cho ${contextAsset.name}`} className="media-context-menu" ref={contextMenuRef} role="menu" style={{ left: contextMenu.left, top: contextMenu.top }}>
          <header><span>FOOTAGE PROPERTIES</span><b>{menuAssets.length > 1 ? `${menuAssets.length} footage đã chọn` : contextAsset.name}</b></header>
          <section><strong>EMOTION</strong><div className="media-context-options media-context-options--emotion">{EMOTION_OPTIONS.map((option) => <button aria-pressed={menuAssets.every((asset) => asset.emotion === option.id)} className={menuAssets.every((asset) => asset.emotion === option.id) ? "is-active" : ""} key={option.id} onClick={() => updateMenuAnnotations({ kind: "annotations", changes: menuAssets.map((asset) => ({ assetId: asset.id, speakerProfileIds: asset.speakerProfileIds, environmentProfileIds: asset.environmentProfileIds, emotion: option.id })) })} role="menuitem" type="button">{option.label}</button>)}</div></section>
          <section><strong><Icon name="person" /> SPEAKER PROFILE</strong><div className="media-context-options media-context-options--speakers">{speakers.map((speaker) => { const assigned = menuAssets.every((asset) => asset.speakerProfileIds.includes(speaker.id)); return <button aria-pressed={assigned} className={assigned ? "is-active" : ""} key={speaker.id} onClick={() => updateMenuAnnotations({ kind: "annotations", changes: menuAssets.map((asset) => ({ assetId: asset.id, speakerProfileIds: assigned ? asset.speakerProfileIds.filter((id) => id !== speaker.id) : [...new Set([...asset.speakerProfileIds, speaker.id])], environmentProfileIds: asset.environmentProfileIds, emotion: asset.emotion })) })} role="menuitem" type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>; })}{!speakers.length ? <p>Thêm Speaker Profile trong Sound Library trước.</p> : null}</div></section>
          <section><strong><Icon name="landscape" /> ENVIRONMENT PROFILE</strong><div className="media-context-options media-context-options--speakers">{environments.map((profile) => { const assigned = menuAssets.every((asset) => asset.environmentProfileIds.includes(profile.id)); return <button aria-pressed={assigned} className={assigned ? "is-active" : ""} key={profile.id} onClick={() => updateMenuAnnotations({ kind: "annotations", changes: menuAssets.map((asset) => ({ assetId: asset.id, speakerProfileIds: asset.speakerProfileIds, environmentProfileIds: assigned ? asset.environmentProfileIds.filter((id) => id !== profile.id) : [...new Set([...asset.environmentProfileIds, profile.id])], emotion: asset.emotion })) })} role="menuitem" type="button"><Icon name="landscape" />{profile.name}</button>; })}{!environments.length ? <p>Thêm Environment Profile trong Sound Library trước.</p> : null}</div></section>
          <footer>
            <button onClick={() => { setContextMenu(null); onReveal(contextAsset); }} role="menuitem" type="button"><Icon name="folder" /> Reveal in Desktop</button>
            {contextAsset.hasExternalSource ? <button onClick={() => { setContextMenu(null); onSetLocalCache(contextAsset.id, !contextAsset.localCacheEnabled); }} role="menuitem" type="button"><Icon name="folder" /> {contextAsset.localCacheEnabled ? "Use original file" : "Local File Caching"}</button> : null}
            {contextAsset.hasExternalSource && contextAsset.localCacheEnabled ? <button onClick={() => { setContextMenu(null); onSetLocalCache(contextAsset.id, true); }} role="menuitem" type="button"><Icon name="upload" /> Refresh local cache</button> : null}
            <button onClick={() => openHistory(contextAsset)} role="menuitem" type="button"><Icon name="file" /> Text History</button>
            {menuAssets.length > 1 && menuSttEligible.length ? <button onClick={() => { setContextMenu(null); onBatchAction({ kind: "selection", target: "stt", assetIds: menuSttEligible.map((asset) => asset.id), selected: !menuSttEligible.every((asset) => asset.transcriptionSelected) }); }} role="menuitem" type="button"><Icon name="file" /> {menuSttEligible.every((asset) => asset.transcriptionSelected) ? "Bỏ STT" : "Chọn STT"} ({menuSttEligible.length})</button> : null}
            {menuAssets.length > 1 && menuTrainingEligible.length ? <button onClick={() => { setContextMenu(null); onBatchAction({ kind: "selection", target: "training", assetIds: menuTrainingEligible.map((asset) => asset.id), selected: !menuTrainingEligible.every((asset) => asset.trainingSelected) }); }} role="menuitem" type="button"><Icon name="training" /> {menuTrainingEligible.every((asset) => asset.trainingSelected) ? "Bỏ TRAIN" : "Chọn TRAIN"} ({menuTrainingEligible.length})</button> : null}
            <button onClick={() => { setContextMenu(null); if (menuAssets.length > 1) onBatchAction({ kind: "disabled", assetIds: menuAssets.map((asset) => asset.id), disabled: !menuAssets.every((asset) => asset.disabled) }); else onSetDisabled(contextAsset, !contextAsset.disabled); }} role="menuitem" type="button"><Icon name="power" /> {menuAssets.every((asset) => asset.disabled) ? "Enable footage" : "Disable footage"}</button>
            {(contextAsset.transcriptionStatus === "queued" || contextAsset.transcriptionStatus === "processing") ? <button onClick={() => { setContextMenu(null); onControlTranscriptions("pause", contextTargets(contextAsset, "pause")); }} role="menuitem" type="button"><Icon name="power" /> Pause STT{contextTargets(contextAsset, "pause").length > 1 ? ` (${contextTargets(contextAsset, "pause").length})` : ""}</button> : null}
            {contextAsset.transcriptionStatus === "paused" ? <button onClick={() => { setContextMenu(null); onControlTranscriptions("resume", contextTargets(contextAsset, "resume")); }} role="menuitem" type="button"><Icon name="power" /> Chạy tiếp STT</button> : null}
            {["queued", "processing", "paused"].includes(contextAsset.transcriptionStatus) ? <button onClick={() => { setContextMenu(null); onControlTranscriptions("stop", contextTargets(contextAsset, "stop")); }} role="menuitem" type="button"><Icon name="power" /> Stop STT{contextTargets(contextAsset, "stop").length > 1 ? ` (${contextTargets(contextAsset, "stop").length})` : ""}</button> : null}
            <button className="media-context-menu__remove" onClick={() => { setContextMenu(null); if (menuAssets.length > 1) onBatchAction({ kind: "recycle", assetIds: menuAssets.map((asset) => asset.id) }); else onRemove(contextAsset); }} role="menuitem" type="button"><Icon name="trash" /> Remove{menuAssets.length > 1 ? ` (${menuAssets.length})` : ""}</button>
          </footer>
        </div>,
        document.body,
      ) : null}
      {historyAsset ? <TranscriptHistoryDialog asset={historyAsset} onClose={() => setHistoryAssetId(null)} /> : null}
    </ModuleFrame>
  );
}
