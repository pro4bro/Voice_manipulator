import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PendingLocalMedia } from "../../domain/types";

interface Props {
  media: PendingLocalMedia;
  busy: boolean;
  onTrackChange: (streamIndex: number, field: "imported" | "transcribe", selected: boolean) => void;
  onConfirm: (mode: "import" | "follow", sttSegmentSeconds?: number, cacheLocal?: boolean) => void;
  onCancel: () => void;
}

export function LocalMediaImportDialog({ media, busy, onTrackChange, onConfirm, onCancel }: Props) {
  const [cacheFile, setCacheFile] = useState(true);
  const dialogRef = useRef<HTMLElement>(null);
  const isMkv = /\.mkv$/iu.test(media.name);
  const disabled = busy || Boolean(media.processing);
  const canImport = !disabled && media.tracks.some((track) => track.imported);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)");
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <div className="media-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section aria-label="Tùy chọn import media" aria-modal="true" className="media-import-dialog media-import-dialog--cache media-import-dialog--tracks"
      onKeyDown={handleKeyDown} ref={dialogRef} role="dialog">
      <header><span>IMPORT FILE GỐC</span><strong title={media.sourcePath}>{media.name}</strong></header>
      <p>Chọn cách dùng file nguồn và các track cần import. Track được tick STT sẽ sẵn sàng cho bước nhận diện.</p>
      {media.error ? <p role="alert">{media.error}</p> : null}
      <label className="media-import-cache-choice"><input aria-label="Cache file" checked={cacheFile} disabled={disabled}
        onChange={(event) => setCacheFile(event.target.checked)} type="checkbox" />
        <span>Cache file <small>Sao chép file đã hoàn tất vào project. Bỏ chọn để liên kết tới file gốc.</small></span></label>
      <section aria-label="Chọn track import và STT" className="media-import-track-list">
        <div className="media-track-options">
          <div className="media-track-options__heading"><span>TRACK</span><span>IMPORT</span><span>STT</span></div>
          {media.tracks.map((track) => <div className="media-track-options__row" key={track.streamIndex}>
            <span title={`${track.title} · ${track.codec}`}><b>#{track.streamIndex} · {track.title}</b><small>{track.codec}{track.channels ? ` · ${track.channels} ch` : ""}</small></span>
            <input aria-label={`Import track ${track.streamIndex} ${track.title}`} checked={track.imported} disabled={disabled}
              onChange={(event) => onTrackChange(track.streamIndex, "imported", event.target.checked)} type="checkbox" />
            <input aria-label={`STT track ${track.streamIndex} ${track.title}`} checked={track.transcribe} disabled={disabled || !track.imported}
              onChange={(event) => onTrackChange(track.streamIndex, "transcribe", event.target.checked)} type="checkbox" />
          </div>)}
        </div>
      </section>
      {isMkv ? <fieldset className="media-import-mkv-options"><legend>TÙY CHỌN MKV</legend>
        <p>Nếu file vẫn đang ghi, theo dõi file gốc để nhận thêm audio và Live Transcribe trên các track đã tick STT.
          Chế độ này đọc file gốc liên tục; lựa chọn Cache ở trên áp dụng cho nút Import file.</p>
        <p>Khi OBS dừng, app tự import bản hoàn chỉnh ở nền và giữ bản nháp. Bấm Speech to text sau đó nếu muốn nhận diện lại toàn bộ track.</p>
        <button className="button button--quiet" disabled={!canImport} onClick={() => onConfirm("follow", 60)} type="button">Theo dõi MKV đang ghi</button>
      </fieldset> : null}
      <footer><button className="button button--quiet" onClick={onCancel} type="button">Hủy</button>
        <button className="button button--accent" disabled={!canImport} onClick={() => onConfirm("import", undefined, cacheFile)} type="button">Import file</button></footer>
    </section>
  </div>;
}
