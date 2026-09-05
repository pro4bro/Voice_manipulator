import { useState } from "react";

import type { EnvironmentNoiseProfile, OmniVoiceTrainingParameters, ProjectMediaAsset, TrainingCatalog, TrainingEngineId, TrainingEngineOption, TrainingModeId, TrainingRuntimeReport } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface TrainProps {
  assets: ProjectMediaAsset[];
  catalog: TrainingCatalog;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  trainingEngines?: TrainingEngineOption[];
  trainingEngine?: TrainingEngineId;
  trainingMode?: TrainingModeId;
  trainingParameters?: OmniVoiceTrainingParameters;
  trainingManifestId?: string | null;
  trainingRuntime?: TrainingRuntimeReport | null;
  busy?: boolean;
  onTrainingEngineChange?: (engine: TrainingEngineId) => void;
  onTrainingModeChange?: (mode: TrainingModeId) => void;
  onTrainingParametersChange?: (parameters: OmniVoiceTrainingParameters) => void;
  onStart?: () => void;
}

export function Train({ assets, catalog, onCatalogChange, trainingEngines = [], trainingEngine = "omnivoice", trainingMode = "lora-finetune", trainingParameters, trainingManifestId = null, trainingRuntime = null, busy = false, onTrainingEngineChange, onTrainingModeChange, onTrainingParametersChange, onStart }: TrainProps) {
  const [noiseName, setNoiseName] = useState("");
  const [noiseAssetIds, setNoiseAssetIds] = useState<string[]>([]);
  const [localEngineId, setLocalEngineId] = useState<TrainingEngineId>(trainingEngine);
  const [localModeId, setLocalModeId] = useState<TrainingModeId>(trainingMode);
  const settings = catalog.settings;
  const usableAssets = assets.filter((asset) => asset.status !== "no-audio");
  const selectedEngineId = onTrainingEngineChange ? trainingEngine : localEngineId;
  const selectedModeId = onTrainingModeChange ? trainingMode : localModeId;
  const selectedEngine = trainingEngines.find((engine) => engine.id === selectedEngineId) ?? null;
  const selectedMode = selectedEngine?.modes.find((mode) => mode.id === selectedModeId) ?? selectedEngine?.modes[0] ?? null;
  const omniParameters = trainingParameters ?? { baseModel: "k2-fsa/OmniVoice", loraR: 16, loraAlpha: 32, batchTokens: Math.max(1, settings.batchSize) * 2048, attnImplementation: "sdpa" as const };

  function updateSettings(update: Partial<TrainingCatalog["settings"]>) {
    onCatalogChange({ ...catalog, settings: { ...settings, ...update } });
  }

  function updatePositiveNumber(key: "maxSteps" | "checkpointEvery" | "batchSize" | "learningRate", value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    updateSettings({ [key]: parsed });
    if (key === "batchSize") updateOmniParameters({ batchTokens: parsed * 2048 });
  }

  function addNoiseProfile() {
    const name = noiseName.trim();
    if (!name || !noiseAssetIds.length) return;
    const profile: EnvironmentNoiseProfile = {
      id: `noise-${crypto.randomUUID().slice(0, 12)}`,
      name,
      assetIds: noiseAssetIds,
      attributes: {},
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

  function updateOmniParameters(update: Partial<OmniVoiceTrainingParameters>) {
    onTrainingParametersChange?.({ ...omniParameters, ...update });
  }

  const trainingReady = Boolean(trainingManifestId && trainingRuntime?.ready && selectedMode?.available);
  const startLabel = !trainingEngines.length
    ? "Bắt đầu training · adapter chưa kết nối"
    : busy
      ? "Đang khởi động..."
      : !trainingManifestId
        ? "Biên dịch dataset trước"
        : !selectedMode?.available
          ? "Mode chưa sẵn sàng"
          : !trainingRuntime?.ready
            ? "Runtime chưa sẵn sàng"
            : `Bắt đầu ${selectedEngine?.label ?? "training"}`;

  return (
    <ModuleFrame className="train-module" eyebrow="FINE-TUNE CONTROL" title="Train" action={<span className={`train-engine-state ${selectedMode?.available ? "is-ready" : ""}`}>{selectedMode?.available ? "ADAPTER READY" : "ADAPTER PENDING"}</span>}>
      {trainingEngines.length ? (
        <section className="train-engine-picker" aria-label="Training engine configuration">
          <div className="train-picker-grid">
            <label><span>ENGINE</span><select aria-label="Training engine" onChange={(event) => { const next = event.target.value as TrainingEngineId; setLocalEngineId(next); setLocalModeId(next === "omnivoice" ? "lora-finetune" : "tts-single-speaker-lora"); onTrainingEngineChange?.(next); }} value={selectedEngine?.id ?? selectedEngineId}>{trainingEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.label}{engine.installed ? "" : " · chưa cài"}</option>)}</select></label>
            <label><span>TRAINING MODE</span><select aria-label="Training mode" onChange={(event) => { const next = event.target.value as TrainingModeId; setLocalModeId(next); onTrainingModeChange?.(next); }} value={selectedMode?.id ?? selectedModeId}>{selectedEngine?.modes.map((mode) => <option disabled={!mode.available} key={mode.id} value={mode.id}>{mode.label}{mode.available ? "" : " · chưa hỗ trợ"}</option>)}</select></label>
          </div>
          {selectedEngine ? <small className="train-engine-description">{selectedEngine.description}</small> : null}
          {selectedMode ? <small className="train-engine-description">{selectedMode.description}</small> : null}
        </section>
      ) : null}
      {selectedEngineId === "omnivoice" ? (
        <section className="train-engine-parameters">
          <div className="train-section-label">OMNIVOICE · REAL PARAMETERS</div>
          <label className="train-field-wide"><span>Base model / checkpoint</span><input aria-label="OmniVoice base model" onChange={(event) => updateOmniParameters({ baseModel: event.target.value })} value={omniParameters.baseModel} /></label>
          <div className="train-parameter-grid">
            <label><span>LoRA rank</span><input aria-label="LoRA rank" min="1" onChange={(event) => updateOmniParameters({ loraR: Math.max(1, Number(event.target.value) || 1) })} type="number" value={omniParameters.loraR} /></label>
            <label><span>LoRA alpha</span><input aria-label="LoRA alpha" min="1" onChange={(event) => updateOmniParameters({ loraAlpha: Math.max(1, Number(event.target.value) || 1) })} type="number" value={omniParameters.loraAlpha} /></label>
            <label><span>Batch tokens</span><input aria-label="Batch tokens" min="1" onChange={(event) => updateOmniParameters({ batchTokens: Math.max(1, Number(event.target.value) || 1) })} type="number" value={omniParameters.batchTokens} /></label>
            <label><span>Attention</span><select aria-label="Attention implementation" onChange={(event) => updateOmniParameters({ attnImplementation: event.target.value as OmniVoiceTrainingParameters["attnImplementation"] })} value={omniParameters.attnImplementation}><option value="sdpa">SDPA</option><option value="flex_attention">Flex attention</option></select></label>
          </div>
          <small className="train-parameter-note">Mode LoRA dùng checkpoint có sẵn. Full fine-tune và From scratch chỉ mở khi adapter tương ứng được cài.</small>
        </section>
      ) : (
        <section className="train-engine-parameters is-gated">
          <div className="train-section-label">VIBEVOICE · REAL PARAMETERS</div>
          <label className="train-field-wide"><span>Model</span><input aria-label="VibeVoice model" disabled value={trainingMode === "asr-lora" ? "microsoft/VibeVoice-ASR" : "vibevoice/VibeVoice-1.5B"} /></label>
          <div className="train-parameter-grid">
            <label><span>Epochs</span><input aria-label="VibeVoice epochs" disabled type="number" value="3" readOnly /></label>
            <label><span>Device batch</span><input aria-label="VibeVoice device batch" disabled type="number" value="1" readOnly /></label>
            <label><span>Grad accumulation</span><input aria-label="VibeVoice gradient accumulation" disabled type="number" value="8" readOnly /></label>
            <label><span>Learning rate</span><input aria-label="VibeVoice learning rate" disabled value="1e-4" readOnly /></label>
            <label><span>LoRA rank</span><input aria-label="VibeVoice LoRA rank" disabled type="number" value="16" readOnly /></label>
            <label><span>Precision</span><select aria-label="VibeVoice precision" disabled value="bf16" onChange={() => undefined}><option value="bf16">BF16</option></select></label>
          </div>
          {selectedModeId === "tts-single-speaker-lora" ? <div className="train-parameter-grid">
            <label><span>Voice prompt drop</span><input aria-label="VibeVoice voice prompt drop rate" disabled value="0.1" readOnly /></label>
            <label><span>Diffusion loss</span><input aria-label="VibeVoice diffusion loss weight" disabled value="1.0" readOnly /></label>
            <label><span>CE loss</span><input aria-label="VibeVoice CE loss weight" disabled value="1.0" readOnly /></label>
            <label className="train-checkbox-field"><input aria-label="VibeVoice train diffusion head" checked readOnly type="checkbox" /><span>Train diffusion head</span></label>
          </div> : null}
          {selectedModeId === "asr-lora" ? <div className="train-parameter-grid">
            <label><span>Max audio seconds</span><input aria-label="VibeVoice ASR max audio seconds" disabled type="number" value="30" readOnly /></label>
            <label><span>Context</span><input aria-label="VibeVoice ASR customized context" disabled value="default" readOnly /></label>
          </div> : null}
          <small className="train-parameter-note">VibeVoice đã có schema tham số để giữ đúng UI giữa các engine, nhưng adapter local chưa được cài nên chưa cho chạy.</small>
        </section>
      )}
      <div className="train-speaker-targets">
        <span>VOICE TARGETS · MULTI-SPEAKER</span>
        <div>
          {catalog.speakers.map((speaker) => (
            <label key={speaker.id}>
              <input checked={settings.targetSpeakerIds.includes(speaker.id)} onChange={(event) => updateSettings({ targetSpeakerIds: event.target.checked ? [...settings.targetSpeakerIds, speaker.id] : settings.targetSpeakerIds.filter((id) => id !== speaker.id) })} type="checkbox" />
              <i style={{ background: speaker.color }} />{speaker.name}
            </label>
          ))}
          {!catalog.speakers.length ? <small>Tạo Speaker Profile trong Sound Library.</small> : null}
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
      <button className="button button--accent button--full" disabled={busy || !trainingReady} onClick={onStart} type="button">{startLabel}</button>
    </ModuleFrame>
  );
}
