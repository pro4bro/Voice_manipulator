import { useState, type ChangeEvent } from "react";

import { EMOTION_OPTIONS } from "../../domain/emotions";
import type { EmotionLabel, MediaImportChoice, ProjectMediaAsset, SpeakerProfile, WorkspacePage } from "../../domain/types";
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
  workflow: WorkspacePage;
  speakers: SpeakerProfile[];
  onImport: (choices: MediaImportChoice[]) => void;
  onSelect: (assetId: string) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], emotion: EmotionLabel) => void;
  onSendToTraining: () => void;
}

function durationLabel(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.round(safe % 60)).padStart(2, "0")}`;
}

export function MediaPool({
  assets,
  selectedAssetId,
  busy,
  workflow,
  speakers,
  onImport,
  onSelect,
  onToggleTraining,
  onUpdateAnnotations,
  onSendToTraining,
}: MediaPoolProps) {
  const [pendingImports, setPendingImports] = useState<MediaImportChoice[]>([]);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const trainingCount = assets.filter((asset) => asset.trainingSelected).length;

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) setPendingImports(files.map((file) => ({ file, transcribe: true })));
    event.target.value = "";
  }

  function togglePendingTranscript(index: number, transcribe: boolean) {
    setPendingImports((current) => current.map((choice, choiceIndex) => (
      choiceIndex === index ? { ...choice, transcribe } : choice
    )));
  }

  function confirmImport() {
    if (!pendingImports.length) return;
    onImport(pendingImports);
    setPendingImports([]);
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
        <span><b>{trainingCount}</b> TO TRAIN</span>
      </div>
      <div className="media-pool-list">
        {assets.map((asset) => {
          const selected = asset.id === selectedAssetId;
          const codec = asset.audioCodec ?? asset.videoCodec ?? asset.sourceExtension.slice(1).toUpperCase();
          const revisions = asset.revisions.length;
          return (
            <div className={`media-pool-item ${selected ? "is-active" : ""}`} key={asset.id}>
              <button
                aria-pressed={selected}
                className="media-pool-item__main"
                onClick={() => onSelect(asset.id)}
                type="button"
              >
                <span className={`media-kind media-kind--${asset.mediaKind}`}><Icon name={asset.mediaKind === "video" ? "project" : "waveform"} /></span>
                <span className="media-item-copy">
                  <strong>{asset.name}</strong>
                  <small>{asset.mediaKind.toUpperCase()} · {codec} · {durationLabel(asset.duration)}</small>
                  <em>{revisions} {revisions === 1 ? "revision" : "revisions"} · {asset.transcriptionStatus === "skipped" ? "NO STT" : asset.transcriptionStatus === "not-applicable" ? "NO AUDIO" : "TRANSCRIPT"}</em>
                </span>
                <span className={`media-state media-state--${asset.status ?? "ready"}`}>
                  {asset.status === "no-audio" ? "NO AUDIO" : asset.origin === "record" ? "REC" : "READY"}
                </span>
              </button>
              <label className={`media-training-toggle ${asset.trainingSelected ? "is-selected" : ""}`}>
                <input
                  aria-label={`Dùng ${asset.name} cho Voice Training`}
                  checked={asset.trainingSelected}
                  disabled={asset.status === "no-audio"}
                  onChange={(event) => onToggleTraining(asset.id, event.target.checked)}
                  type="checkbox"
                />
                <span>TRAIN</span>
              </label>
            </div>
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
        <details className="media-annotations" open>
          <summary><span>SPEAKER & EMOTION</span><b>{selectedAsset.speakerProfileIds.length || "-"}</b></summary>
          <label className="media-emotion-field">
            <span>File emotion</span>
            <select aria-label="Cảm xúc của footage" onChange={(event) => onUpdateAnnotations(selectedAsset.id, selectedAsset.speakerProfileIds, event.target.value as EmotionLabel)} value={selectedAsset.emotion}>
              {EMOTION_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <div className="media-speaker-choices">
            {speakers.map((speaker) => (
              <label key={speaker.id}>
                <input
                  aria-label={`Gán ${speaker.name} cho ${selectedAsset.name}`}
                  checked={selectedAsset.speakerProfileIds.includes(speaker.id)}
                  onChange={(event) => onUpdateAnnotations(selectedAsset.id, event.target.checked ? [...selectedAsset.speakerProfileIds, speaker.id] : selectedAsset.speakerProfileIds.filter((id) => id !== speaker.id), selectedAsset.emotion)}
                  type="checkbox"
                />
                <i style={{ background: speaker.color }} />
                <span>{speaker.name}</span>
              </label>
            ))}
            {!speakers.length ? <p>Thêm Speaker Profile trong Voice Training để phân vai footage.</p> : null}
          </div>
        </details>
      ) : null}
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
      <div className="media-pool-footer">
        <p className="media-pool-note"><i /> Chỉ footage đã tick TRAIN mới được đưa vào dataset.</p>
        {workflow === "speech-to-text" && trainingCount > 0 ? (
          <button className="button button--lime button--full media-send-training" onClick={onSendToTraining} type="button">
            Gửi {trainingCount} footage sang Voice Training
          </button>
        ) : null}
      </div>
      {pendingImports.length ? (
        <div className="media-import-backdrop">
          <section aria-label="Tùy chọn import media" aria-modal="true" className="media-import-dialog" role="dialog">
            <header><span>IMPORT QUEUE</span><strong>{pendingImports.length} footage</strong></header>
            <p>Chọn file cần nhận diện. File đã có kịch bản có thể bỏ transcript để import nhanh hơn.</p>
            <div className="media-import-choices">
              {pendingImports.map((choice, index) => (
                <label key={`${choice.file.name}-${index}`}>
                  <span><b>{choice.file.name}</b><small>{(choice.file.size / 1024 / 1024).toFixed(1)} MB</small></span>
                  <input
                    aria-label={`Tạo transcript cho ${choice.file.name}`}
                    checked={choice.transcribe}
                    onChange={(event) => togglePendingTranscript(index, event.target.checked)}
                    type="checkbox"
                  />
                  <em>{choice.transcribe ? "TRANSCRIPT" : "SKIP STT"}</em>
                </label>
              ))}
            </div>
            <footer>
              <button className="button button--quiet" onClick={() => setPendingImports([])} type="button">Hủy</button>
              <button className="button button--accent" onClick={confirmImport} type="button">Import {pendingImports.length} file</button>
            </footer>
          </section>
        </div>
      ) : null}
    </ModuleFrame>
  );
}
