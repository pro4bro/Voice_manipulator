import { useState } from "react";

import type { EnvironmentNoiseProfile, ProjectMediaAsset, TrainingCatalog } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface TrainProps {
  assets: ProjectMediaAsset[];
  catalog: TrainingCatalog;
  onCatalogChange: (catalog: TrainingCatalog) => void;
}

export function Train({ assets, catalog, onCatalogChange }: TrainProps) {
  const [noiseName, setNoiseName] = useState("");
  const [noiseAssetIds, setNoiseAssetIds] = useState<string[]>([]);
  const settings = catalog.settings;
  const usableAssets = assets.filter((asset) => asset.status !== "no-audio");

  function updateSettings(update: Partial<TrainingCatalog["settings"]>) {
    onCatalogChange({ ...catalog, settings: { ...settings, ...update } });
  }

  function updatePositiveNumber(key: "maxSteps" | "checkpointEvery" | "batchSize" | "learningRate", value: string) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) updateSettings({ [key]: parsed });
  }

  function addNoiseProfile() {
    const name = noiseName.trim();
    if (!name || !noiseAssetIds.length) return;
    const profile: EnvironmentNoiseProfile = {
      id: `noise-${crypto.randomUUID().slice(0, 12)}`,
      name,
      assetIds: noiseAssetIds,
      createdAt: new Date().toISOString(),
    };
    onCatalogChange({
      ...catalog,
      environmentProfiles: [...catalog.environmentProfiles, profile],
      settings: { ...settings, environmentProfileId: profile.id },
    });
    setNoiseName("");
    setNoiseAssetIds([]);
  }

  return (
    <ModuleFrame className="train-module" eyebrow="FINE-TUNE CONTROL" title="Train" action={<span className="train-engine-state">ADAPTER PENDING</span>}>
      <div className="train-speaker-targets">
        <span>VOICE TARGETS · MULTI-SPEAKER</span>
        <div>
          {catalog.speakers.map((speaker) => (
            <label key={speaker.id}>
              <input checked={settings.targetSpeakerIds.includes(speaker.id)} onChange={(event) => updateSettings({ targetSpeakerIds: event.target.checked ? [...settings.targetSpeakerIds, speaker.id] : settings.targetSpeakerIds.filter((id) => id !== speaker.id) })} type="checkbox" />
              <i style={{ background: speaker.color }} />{speaker.name}
            </label>
          ))}
          {!catalog.speakers.length ? <small>Tạo Speaker Profile trong Voice Vault.</small> : null}
        </div>
      </div>
      <div className="train-parameter-grid">
        <label><span>Max steps</span><input aria-label="Max steps" min="1" onChange={(event) => updatePositiveNumber("maxSteps", event.target.value)} type="number" value={settings.maxSteps} /></label>
        <label><span>Backup mỗi</span><input aria-label="Checkpoint interval" min="1" onChange={(event) => updatePositiveNumber("checkpointEvery", event.target.value)} type="number" value={settings.checkpointEvery} /><small>steps</small></label>
        <label><span>Batch size</span><input aria-label="Batch size" min="1" onChange={(event) => updatePositiveNumber("batchSize", event.target.value)} type="number" value={settings.batchSize} /></label>
        <label><span>Learning rate</span><input aria-label="Learning rate" min="0.000001" onChange={(event) => updatePositiveNumber("learningRate", event.target.value)} step="0.000001" type="number" value={settings.learningRate} /></label>
      </div>
      <div className="train-switches">
        <label><input checked={settings.denoiseBeforeTraining} onChange={(event) => updateSettings({ denoiseBeforeTraining: event.target.checked })} type="checkbox" /><span><b>Khử nhiễu trước khi train</b><small>Filter tạm trên dataset đầu vào</small></span></label>
        <label><input checked={settings.learnEnvironmentNoise} onChange={(event) => updateSettings({ learnEnvironmentNoise: event.target.checked })} type="checkbox" /><span><b>Học Environment Noise Profile</b><small>Giữ lại đặc tính môi trường để tái tạo sau này</small></span></label>
      </div>
      <details className="noise-profile-editor">
        <summary><span>ENVIRONMENT NOISE PROFILES</span><b>{catalog.environmentProfiles.length}</b></summary>
        <select aria-label="Environment noise profile" onChange={(event) => updateSettings({ environmentProfileId: event.target.value || null })} value={settings.environmentProfileId ?? ""}>
          <option value="">Không áp dụng profile</option>
          {catalog.environmentProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.assetIds.length} files</option>)}
        </select>
        <input aria-label="Tên noise profile" onChange={(event) => setNoiseName(event.target.value)} placeholder="Ví dụ: Phòng làm việc buổi tối" value={noiseName} />
        <div className="noise-source-list">
          {usableAssets.map((asset) => <label key={asset.id}><input checked={noiseAssetIds.includes(asset.id)} onChange={(event) => setNoiseAssetIds((current) => event.target.checked ? [...current, asset.id] : current.filter((id) => id !== asset.id))} type="checkbox" /><span>{asset.name}</span></label>)}
        </div>
        <button className="button button--quiet button--full" disabled={!noiseName.trim() || !noiseAssetIds.length} onClick={addNoiseProfile} type="button"><Icon name="plus" />Lưu noise profile</button>
      </details>
      <button className="button button--accent button--full" disabled type="button">Bắt đầu training · processor chưa kết nối</button>
    </ModuleFrame>
  );
}
