import { useState } from "react";

import type { EngineProfileSchema, EmotionLabel, EnvironmentNoiseProfile, MediaImportChoice, ProjectMediaAsset, SpeakerProfile, TrainingCatalog, WorkspacePage } from "../../domain/types";
import { MediaPool } from "../media-pool/MediaPool";
import { VoiceVault } from "../voice-vault/VoiceVault";
import { Icon } from "../../ui/Icon";

interface LibraryPanelProps {
  assets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  busy: boolean;
  workflow: WorkspacePage;
  speakers: SpeakerProfile[];
  environments: EnvironmentNoiseProfile[];
  catalog: TrainingCatalog;
  profileSchema: EngineProfileSchema | null;
  selectedVoice: string;
  onImport: (choices: MediaImportChoice[]) => void;
  onSelect: (assetId: string) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: () => void;
  onRemove: (asset: ProjectMediaAsset) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onSendToTraining: () => void;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSelectVoice: (voiceId: string) => void;
}

export function LibraryPanel(props: LibraryPanelProps) {
  const [tab, setTab] = useState<"media" | "sound">("media");
  return (
    <section className="library-panel">
      <div className="library-panel-tabs" role="tablist" aria-label="Library panel">
        <button aria-selected={tab === "media"} className={tab === "media" ? "is-active" : ""} onClick={() => setTab("media")} role="tab" type="button"><Icon name="folder" />Media Pool <b>{props.assets.length}</b></button>
        <button aria-selected={tab === "sound"} className={tab === "sound" ? "is-active" : ""} onClick={() => setTab("sound")} role="tab" type="button"><Icon name="waveform" />Sound Library <b>{props.speakers.length + props.environments.length}</b></button>
      </div>
      {tab === "media" ? <MediaPool {...props} /> : <VoiceVault assets={props.assets} catalog={props.catalog} onCatalogChange={props.onCatalogChange} onSelectVoice={props.onSelectVoice} profileSchema={props.profileSchema} selectedVoice={props.selectedVoice} />}
    </section>
  );
}
