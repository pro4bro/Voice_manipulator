import { useState } from "react";

import { formatDuration } from "../../domain/reading-plan";
import type { DatasetReadiness, EnvironmentNoiseProfile, ProjectMediaAsset, TrainingCatalog, TrainingModelOption, TrainingParameterSpec, TrainingParameterValue, TrainingRuntimeReport } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { useParameterForm } from "../../ui/ParameterForm";
import { parameterOverrides, selectedTrainingModel } from "./trainingModels";

interface TrainProps {
  assets: ProjectMediaAsset[];
  catalog: TrainingCatalog;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  trainingModels?: TrainingModelOption[];
  /** How much of each Speaker Profile the dataset holds; starting compiles it fresh. */
  readiness?: DatasetReadiness | null;
  trainingRuntime?: TrainingRuntimeReport | null;
  busy?: boolean;
  onStart?: () => void;
}

export function Train({ assets, catalog, onCatalogChange, trainingModels = [], readiness = null, trainingRuntime = null, busy = false, onStart }: TrainProps) {
  const [noiseName, setNoiseName] = useState("");
  const [noiseAssetIds, setNoiseAssetIds] = useState<string[]>([]);
  const settings = catalog.settings;
  const usableAssets = assets.filter((asset) => asset.status !== "no-audio");
  const model = selectedTrainingModel(trainingModels, settings);
  const overrides = model ? parameterOverrides(model, settings) : {};

  function updateSettings(update: Partial<TrainingCatalog["settings"]>) {
    onCatalogChange({ ...catalog, settings: { ...settings, ...update } });
  }

  function chooseModel(modelId: string) {
    updateSettings({ modelId });
  }

  function setParameter(spec: TrainingParameterSpec, value: TrainingParameterValue) {
    if (!model) return;
    const next = { ...(settings.modelParameters?.[model.id] ?? {}) };
    // A value equal to the default is not a change. Keeping it would pin the
    // project to today's default after a descriptor corrects it.
    if (value === spec.default) delete next[spec.key];
    else next[spec.key] = value;
    const all = { ...(settings.modelParameters ?? {}) };
    if (Object.keys(next).length) all[model.id] = next;
    else delete all[model.id];
    updateSettings({ modelParameters: all });
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

  const form = useParameterForm({ scope: model?.id ?? "none", specs: model?.parameters ?? [], overrides, onChange: setParameter });
  const problems = form.problems;
  const changedCount = Object.keys(overrides).length;
  const families = trainingModels.reduce<string[]>((list, option) => list.includes(option.family) ? list : [...list, option.family], []);

  const targets = catalog.speakers.filter((speaker) => settings.targetSpeakerIds.includes(speaker.id));
  const secondsOf = (speakerId: string) => readiness?.secondsBySpeaker?.[speakerId] ?? 0;
  // Only judged once readiness is known; before that the start compiles and the
  // API refuses a target with nothing to train on.
  const emptyTargets = readiness ? targets.filter((speaker) => secondsOf(speaker.id) <= 0) : [];
  const trainingReady = Boolean(model?.available && targets.length && !emptyTargets.length && trainingRuntime?.ready && !problems.length);
  const startLabel = !model
    ? "Bắt đầu training · adapter chưa kết nối"
    : busy
      ? "Đang khởi động..."
      : !model.installed
        ? "Chưa cài repo cho model này"
        : !model.available
          ? "Model này chưa có adapter chạy"
          : problems.length
            ? "Tham số chưa hợp lệ"
            : !targets.length
              ? "Tick ít nhất một voice target"
              : emptyTargets.length
                ? `${emptyTargets.map((speaker) => speaker.name).join(", ")} chưa có đoạn nào trong dataset`
                : !trainingRuntime?.ready
                  ? "Runtime chưa sẵn sàng"
                  : `Bắt đầu ${model.label} · ${targets.length} voice`;

  return (
    <ModuleFrame className="train-module" eyebrow="FINE-TUNE CONTROL" title="Train" action={<span className={`train-engine-state ${model?.available ? "is-ready" : ""}`}>{model?.available ? "ADAPTER READY" : "ADAPTER PENDING"}</span>}>
      {model ? (
        <section className="train-engine-picker" aria-label="Chọn Model Training">
          <label>
            <span>MODEL TRAINING</span>
            <select aria-label="Model Training" onChange={(event) => chooseModel(event.target.value)} value={model.id}>
              {families.map((family) => (
                <optgroup key={family} label={family}>
                  {trainingModels.filter((option) => option.family === family).map((option) => (
                    <option key={option.id} value={option.id}>{option.label}{option.available ? "" : option.installed ? " · chưa có adapter" : " · chưa cài"}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <small className="train-engine-description">{model.description}</small>
          <div className={`train-model-status ${model.available ? "is-ready" : model.installed ? "is-partial" : ""}`}>
            <b>{model.available ? "SẴN SÀNG" : model.installed ? "ĐÃ CÓ REPO" : "CHƯA CÀI"}</b>
            <span>{model.status}</span>
          </div>
          <dl className="train-model-facts">
            <dt>Repo</dt><dd title={model.repository.url ?? undefined}>{model.repository.root}/{model.repository.path === "." ? "" : `${model.repository.path}/`}{model.repository.entrypoint}{model.repository.revision ? ` @${model.repository.revision}` : ""}</dd>
            {model.repository.recipe ? <><dt>Recipe</dt><dd>{model.repository.recipe}</dd></> : null}
            {model.dataFormat ? <><dt>Dữ liệu</dt><dd>{model.dataFormat}</dd></> : null}
          </dl>
          {model.notes.length ? <ul className="train-model-notes">{model.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
        </section>
      ) : null}
      {model ? (
        <section className={`train-engine-parameters ${model.available ? "" : "is-gated"}`} aria-label={`Tham số ${model.label}`}>
          <div className="train-section-label">
            <span>THAM SỐ · {model.parameters.length}</span>
            {changedCount ? <button className="train-reset" onClick={() => { const all = { ...(settings.modelParameters ?? {}) }; delete all[model.id]; form.clearDrafts(); updateSettings({ modelParameters: all }); }} type="button">Về mặc định · {changedCount}</button> : null}
          </div>
          {form.basic}
          {form.advanced}
          <small className="train-parameter-note">Mặc định lấy từ recipe của repo; "recipe"/"code" dưới ô là giá trị gốc khi khác mặc định. Di chuột lên ô để xem nguồn và tên key.</small>
        </section>
      ) : null}
      <div className="train-speaker-targets">
        <span>VOICE TARGETS · MỖI PROFILE MỘT VOICE</span>
        <div>
          {catalog.speakers.map((speaker) => (
            <label key={speaker.id}>
              <input checked={settings.targetSpeakerIds.includes(speaker.id)} onChange={(event) => updateSettings({ targetSpeakerIds: event.target.checked ? [...settings.targetSpeakerIds, speaker.id] : settings.targetSpeakerIds.filter((id) => id !== speaker.id) })} type="checkbox" />
              <i style={{ background: speaker.color }} />{speaker.name}
              {readiness ? <small>{secondsOf(speaker.id) > 0 ? formatDuration(secondsOf(speaker.id)) : "chưa có đoạn"}</small> : null}
            </label>
          ))}
          {!catalog.speakers.length ? <small>Tạo Speaker Profile trong Sound Library.</small> : null}
        </div>
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
