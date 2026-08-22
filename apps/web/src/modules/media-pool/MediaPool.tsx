import type { ChangeEvent } from "react";

import type { ProjectMediaAsset } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

const MEDIA_ACCEPT = [
  "audio/*", "video/*", ".mov", ".mp4", ".mkv", ".avi", ".webm", ".mxf",
  ".h264", ".h265", ".hevc", ".av1", ".prores", ".mp3", ".wav", ".aac",
  ".wma", ".m4a", ".flac", ".ogg", ".opus", ".aif", ".aiff", ".ac3",
].join(",");

interface MediaPoolProps {
  assets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  busy: boolean;
  onImport: (files: File[]) => void;
  onSelect: (assetId: string) => void;
}

function durationLabel(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.round(safe % 60)).padStart(2, "0")}`;
}

export function MediaPool({ assets, selectedAssetId, busy, onImport, onSelect }: MediaPoolProps) {
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) onImport(files);
    event.target.value = "";
  }

  return (
    <ModuleFrame
      className="media-pool-module"
      eyebrow="PROJECT MEDIA"
      index="MP"
      title="Media Pool"
      action={
        <label className={`media-import ${busy ? "is-busy" : ""}`}>
          <Icon name="upload" />
          <span>{busy ? "PROCESSING" : "IMPORT"}</span>
          <input aria-label="Import media" accept={MEDIA_ACCEPT} disabled={busy} multiple onChange={importFiles} type="file" />
        </label>
      }
    >
      <div className="media-pool-summary">
        <span><b>{assets.length}</b> ASSETS</span>
        <span>PROJECT SOURCES</span>
      </div>
      <div className="media-pool-list">
        {assets.map((asset) => {
          const selected = asset.id === selectedAssetId;
          const codec = asset.audioCodec ?? asset.videoCodec ?? asset.sourceExtension.slice(1).toUpperCase();
          const revisions = asset.revisions.length;
          return (
            <button
              aria-pressed={selected}
              className={selected ? "is-active" : ""}
              key={asset.id}
              onClick={() => onSelect(asset.id)}
              type="button"
            >
              <span className={`media-kind media-kind--${asset.mediaKind}`}><Icon name={asset.mediaKind === "video" ? "project" : "waveform"} /></span>
              <span className="media-item-copy">
                <strong>{asset.name}</strong>
                <small>{asset.mediaKind.toUpperCase()} · {codec} · {durationLabel(asset.duration)}</small>
                <em>{revisions} {revisions === 1 ? "revision" : "revisions"}</em>
              </span>
              <span className={`media-state media-state--${asset.status ?? "ready"}`}>
                {asset.status === "no-audio" ? "NO AUDIO" : asset.origin === "record" ? "REC" : "READY"}
              </span>
            </button>
          );
        })}
        {!assets.length ? (
          <div className="media-pool-empty">
            <Icon name="folder" />
            <b>Chưa có footage</b>
            <span>Import video/audio hoặc thu một take mới.</span>
          </div>
        ) : null}
      </div>
      {selectedAsset ? (
        <details className="media-history">
          <summary><span>TEXT HISTORY</span><b>{selectedAsset.revisions.length}</b></summary>
          <ol>
            {selectedAsset.revisions.slice().reverse().slice(0, 5).map((revision) => (
              <li key={revision.id}>
                <span>{revision.source.toUpperCase()}</span>
                <p>{revision.text || "Không có transcript"}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <p className="media-pool-note"><i /> Asset có audio sẽ trở thành nguồn STT và Voice Training.</p>
    </ModuleFrame>
  );
}
