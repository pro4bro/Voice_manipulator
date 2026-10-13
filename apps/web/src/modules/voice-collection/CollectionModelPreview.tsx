import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { CollectionVoicePreview } from "../../domain/types";

export function CollectionModelPreview({ collectionId, entryId, name }: { collectionId: string; entryId: string; name: string }) {
  const [preview, setPreview] = useState<CollectionVoicePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    setLoading(true); setPreview(null); setLoadError(null);
    const accept = (value: CollectionVoicePreview) => {
      if (!active || !value) return;
      setPreview(value); setLoading(false);
      if (value.status === "queued" || value.status === "running") timer = window.setTimeout(() => void refresh(false), 1200);
    };
    const refresh = async (create: boolean) => {
      try {
        if (typeof api.getCollectionVoicePreview !== "function") { if (active) setLoading(false); return; }
        let value: CollectionVoicePreview;
        let started = false;
        try {
          value = await api.getCollectionVoicePreview(collectionId, entryId);
        } catch (error) {
          if (!create || revision === 0) throw error;
          value = await api.startCollectionVoicePreview(collectionId, entryId);
          started = true;
        }
        if (!active) return;
        if (!started && create && (revision > 0 || value?.status === "missing")) value = await api.startCollectionVoicePreview(collectionId, entryId);
        if (!value) throw new Error("Không đọc được trạng thái mẫu giọng.");
        accept(value);
      } catch (error) {
        if (active) { setLoadError(error instanceof Error ? error.message : "Không tải được mẫu giọng."); setLoading(false); }
      }
    };
    void refresh(true);
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [collectionId, entryId, revision]);


  const working = loading || preview?.status === "queued" || preview?.status === "running";
  const ready = preview?.status === "ready" && Boolean(preview.audioUrl) && (preview.duration ?? 0) >= 15;
  return <div aria-busy={working} className={`collection-model-preview${working ? " is-working" : ""}`}>
    <div className="collection-model-preview__audio">
      {ready ? <audio aria-label={`Nghe mẫu ${name}`} controls preload="none" src={preview!.audioUrl!} /> : <span role="status">{working ? "Đang tạo mẫu giới thiệu ≥15 giây…" : preview?.status === "unsupported" ? "Chưa thể tạo mẫu bằng model này" : "Chưa có mẫu giọng hợp lệ"}</span>}
      {ready ? <small>{preview!.duration!.toFixed(1)} giây · mẫu được tạo bằng model</small> : null}
      {preview?.error || loadError ? <small className="collection-model-preview__error">{preview?.error || loadError}</small> : null}
      {!working && (preview?.status === "error" || loadError) ? <button className="button button--quiet" onClick={() => setRevision((current) => current + 1)} type="button">Thử tạo mẫu lại</button> : null}
    </div>
    <label className="collection-model-preview__script">Script mẫu<textarea aria-label={`Script mẫu ${name}`} readOnly rows={4} value={preview?.script ?? "Đang đọc thông tin profile và model…"} /></label>
  </div>;
}
