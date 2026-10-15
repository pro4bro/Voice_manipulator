import { useRef, useState } from "react";
import type { MediaImportChoice, PendingLocalMedia, ProjectMediaAsset } from "../../domain/types";
import { reconcileListSelection, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { PendingMediaImportRow } from "../media-pool/MediaPool";
import "./reference-library.css";

export interface ReferenceLibraryProps {
  projectId?: string;
  assets: ProjectMediaAsset[];
  onReferenceChange?: (ids: string[], selected: boolean) => Promise<void>;
  onImport?: (choices: MediaImportChoice[]) => void;
  onImportLocal?: () => void;
  pendingMediaImports?: PendingMediaImportRow[];
  pendingNativeMediaPaths?: string[];
  onConfirmNativeMediaImport?: (paths: string[], cacheLocal: boolean) => void;
  onCancelNativeMediaImport?: () => void;
  pendingLocalMedia?: PendingLocalMedia | null;
  onPendingLocalTrackChange?: (streamIndex: number, field: "imported" | "transcribe", selected: boolean) => void;
  onConfirmPendingLocalMedia?: (mode: "import" | "follow", segmentSeconds?: number, cacheLocal?: boolean) => void;
  onCancelPendingLocalMedia?: () => void;
}

export function ReferenceLibrary(props: ReferenceLibraryProps) {
  const [onlyReferences, setOnlyReferences] = useState(false);
  const [selection, setSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const [menu, setMenu] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const available = props.assets.filter((asset) => !asset.deletedAt);
  const visible = available.filter((asset) => !onlyReferences || asset.referenceSelected);
  const ids = visible.map((asset) => asset.id);
  const selected = reconcileListSelection(selection, ids).ids;
  function openMenu(asset: ProjectMediaAsset, x: number, y: number) {
    const targets = selected.includes(asset.id) ? selected : [asset.id];
    if (!selected.includes(asset.id)) setSelection({ ids: targets, anchorId: asset.id });
    setMenu({ ids: targets, x: Math.max(0, Math.min(x, window.innerWidth - 240)), y: Math.max(0, Math.min(y, window.innerHeight - 100)) });
  }
  async function mark(value: boolean) {
    if (!menu || !props.onReferenceChange) return;
    const targets = menu.ids;
    setMenu(null); setBusy(true); setError(null);
    try { await props.onReferenceChange(targets, value); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  return <section className="reference-library" aria-label="Reference footage">
    <div className="reference-library__tools">
      <button disabled={!props.onImport || busy} onClick={() => input.current?.click()} type="button">Import nhiều footage</button>
      <button disabled={!props.onImportLocal || busy} onClick={props.onImportLocal} type="button">Chọn file / audio track…</button>
      <label><input checked={onlyReferences} onChange={(event) => setOnlyReferences(event.target.checked)} type="checkbox" />Chỉ Reference</label>
      <input ref={input} hidden multiple accept="audio/*,video/*,.mka,.mkv" type="file" aria-label="Import reference footage" onChange={(event) => {
        props.onImport?.([...event.target.files ?? []].map((file) => ({ file, transcribe: false })));
        event.target.value = "";
      }} />
    </div>
    <p>Chọn nhiều bằng Ctrl/Shift, bấm chuột phải để đánh dấu Reference. Footage nhiều kênh cần chọn audio track cụ thể.</p>
    {props.pendingMediaImports?.map((pending) => <div key={pending.id} role="status">{pending.name} · {pending.status}</div>)}
    {props.pendingNativeMediaPaths?.length ? <div role="group" aria-label="Xác nhận footage reference"><p>{props.pendingNativeMediaPaths.join(" · ")}</p><button onClick={() => props.onConfirmNativeMediaImport?.(props.pendingNativeMediaPaths!, false)} type="button">Import footage đã chọn</button><button onClick={props.onCancelNativeMediaImport} type="button">Hủy import</button></div> : null}
    {props.pendingLocalMedia ? <fieldset disabled={props.pendingLocalMedia.processing}>
      <legend>{props.pendingLocalMedia.name} · audio tracks</legend>
      {props.pendingLocalMedia.tracks.map((track) => <label key={track.streamIndex}><input type="checkbox" checked={track.imported} onChange={(event) => props.onPendingLocalTrackChange?.(track.streamIndex, "imported", event.target.checked)} />{track.title} · {track.channels ?? "?"} kênh</label>)}
      <p>Import các track đã chọn rồi đánh dấu track muốn dùng làm Reference.</p>
      {props.pendingLocalMedia.error ? <p role="alert">{props.pendingLocalMedia.error}</p> : null}
      <button onClick={() => props.onConfirmPendingLocalMedia?.("import")} type="button">Import audio tracks</button><button onClick={props.onCancelPendingLocalMedia} type="button">Hủy chọn track</button>
    </fieldset> : null}
    {error ? <p role="alert">{error}</p> : null}
    <div className="reference-library__list" role="listbox" aria-label="Footage có thể làm reference" aria-multiselectable="true" onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelection({ ids, anchorId: ids[0] ?? null }); }
    }}>
      {visible.map((asset) => <div className={`reference-library__row ${selected.includes(asset.id) ? "is-selected" : ""}`} key={asset.id}>
        <button role="option" aria-selected={selected.includes(asset.id)} title={asset.name} onClick={(event) => setSelection((current) => selectListItem(current, ids, asset.id, { toggle: event.ctrlKey || event.metaKey, shift: event.shiftKey }))}
          onContextMenu={(event) => { event.preventDefault(); openMenu(asset, event.clientX, event.clientY); }}
          onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(asset, rect.left, rect.bottom); } }} type="button">
          <span>{asset.name}</span><small>{asset.referenceSelected ? "REFERENCE · " : ""}{asset.sourceArchiveAssetId ? `TRACK ${asset.sourceArchiveStreamIndex ?? ""} · ` : ""}{asset.duration.toFixed(2)}s{asset.disabled ? " · Đã tắt" : ""}{asset.status === "no-audio" || asset.status === "error" ? " · Audio chưa sẵn sàng" : ""}</small>
        </button>
        <button disabled={!props.projectId || Boolean(asset.availableAudioTracks?.length)} aria-label={`Nghe ${asset.name}`} onClick={() => setPreviewId((current) => current === asset.id ? null : asset.id)} type="button">▶</button>
        {previewId === asset.id ? <audio controls preload="none" src={`/api/projects/${encodeURIComponent(props.projectId!)}/media/${encodeURIComponent(asset.id)}/audio`} onError={() => setError(`Không đọc được audio của ${asset.name}. Kiểm tra hoặc kết nối lại source.`)} /> : null}
      </div>)}
      {!visible.length ? <p>Chưa có footage{onlyReferences ? " được đánh dấu Reference" : " trong project"}.</p> : null}
    </div>
    {menu ? <><button className="reference-menu-dismiss" aria-label="Đóng menu reference" onClick={() => setMenu(null)} type="button" /><div className="reference-menu" role="menu" style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => { if (event.key === "Escape") setMenu(null); }}>
      <button autoFocus role="menuitem" disabled={busy || !props.onReferenceChange} onClick={() => void mark(true)} type="button">Đánh dấu Reference ({menu.ids.length})</button>
      <button role="menuitem" disabled={busy || !props.onReferenceChange} onClick={() => void mark(false)} type="button">Bỏ đánh dấu Reference</button>
    </div></> : null}
  </section>;
}
