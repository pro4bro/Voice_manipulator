import { useState } from "react";

import type { EngineProfileSchema, EmotionLabel, EnvironmentNoiseProfile, MediaImportChoice, ProjectMediaAsset, ProjectVoice, SpeakerProfile, TrainingCatalog, VoiceOutput, WorkspacePage } from "../../domain/types";
import { MediaPool } from "../media-pool/MediaPool";
import { VoiceOutputPanel } from "../voice-output/VoiceOutputPanel";
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
  onQueueTranscriptions: (model: string) => void;
  onControlTranscriptions: (action: "pause" | "resume" | "stop", assetIds?: string[]) => void;
  onRemove: (asset: ProjectMediaAsset) => void;
  onRestore: (asset: ProjectMediaAsset) => void;
  onReveal: (asset: ProjectMediaAsset) => void;
  onSetDisabled: (asset: ProjectMediaAsset, disabled: boolean) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onSendToTraining: () => void;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSelectVoice: (voiceId: string) => void;
  voices?: ProjectVoice[];
  onDeleteVoice?: (voice: ProjectVoice) => void;
  onDeleteSpeaker?: (speaker: SpeakerProfile) => void;
  onDeleteEnvironment?: (profile: EnvironmentNoiseProfile) => void;
}

export function LibraryPanel(props: LibraryPanelProps) {
  const [tab, setTab] = useState<"media" | "sound">("media");
  return (
    <section className="library-panel">
      <div className="library-panel-tabs" role="tablist" aria-label="Library panel">
        <button aria-selected={tab === "media"} className={tab === "media" ? "is-active" : ""} onClick={() => setTab("media")} role="tab" type="button"><Icon name="folder" />Media Pool <b>{props.assets.length}</b></button>
        <button aria-selected={tab === "sound"} className={tab === "sound" ? "is-active" : ""} onClick={() => setTab("sound")} role="tab" type="button"><Icon name="waveform" />Sound Library <b>{props.speakers.length + props.environments.length}</b></button>
      </div>
      {tab === "media" ? <MediaPool {...props} /> : <VoiceVault assets={props.assets} catalog={props.catalog} onCatalogChange={props.onCatalogChange} onDeleteEnvironment={props.onDeleteEnvironment} onDeleteSpeaker={props.onDeleteSpeaker} onDeleteVoice={props.onDeleteVoice} onSelectVoice={props.onSelectVoice} profileSchema={props.profileSchema} selectedVoice={props.selectedVoice} voices={props.voices} />}
    </section>
  );
}

interface ManipulatorLibraryProps {
  assets: ProjectMediaAsset[];
  speakers: SpeakerProfile[];
  environments: EnvironmentNoiseProfile[];
  catalog: TrainingCatalog;
  profileSchema: EngineProfileSchema | null;
  selectedVoice: string;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSelectVoice: (voiceId: string) => void;
  voices?: ProjectVoice[];
  onDeleteVoice?: (voice: ProjectVoice) => void;
  onDeleteSpeaker?: (speaker: SpeakerProfile) => void;
  onDeleteEnvironment?: (profile: EnvironmentNoiseProfile) => void;
  outputs: VoiceOutput[];
  activeOutputId: string | null;
  onOpenOutput: (output: VoiceOutput) => void;
  onDeleteOutput: (output: VoiceOutput) => void;
}

/**
 * Voice Manipulator's library: who can speak, and what has been spoken.
 * Media Pool is source footage for STT and training and has no place here.
 */
export function ManipulatorLibrary(props: ManipulatorLibraryProps) {
  const [tab, setTab] = useState<"sound" | "output">("output");
  return (
    <section className="library-panel">
      <div className="library-panel-tabs" role="tablist" aria-label="Thư viện Voice Manipulator">
        <button aria-selected={tab === "sound"} className={tab === "sound" ? "is-active" : ""} onClick={() => setTab("sound")} role="tab" type="button"><Icon name="waveform" />Sound Library <b>{props.speakers.length + props.environments.length}</b></button>
        <button aria-selected={tab === "output"} className={tab === "output" ? "is-active" : ""} onClick={() => setTab("output")} role="tab" type="button"><Icon name="file" />Voice Output <b>{props.outputs.length}</b></button>
      </div>
      {tab === "sound"
        ? <VoiceVault assets={props.assets} catalog={props.catalog} onCatalogChange={props.onCatalogChange} onDeleteEnvironment={props.onDeleteEnvironment} onDeleteSpeaker={props.onDeleteSpeaker} onDeleteVoice={props.onDeleteVoice} onSelectVoice={props.onSelectVoice} profileSchema={props.profileSchema} selectedVoice={props.selectedVoice} voices={props.voices} />
        : <VoiceOutputPanel activeOutputId={props.activeOutputId} onDelete={props.onDeleteOutput} onOpen={props.onOpenOutput} outputs={props.outputs} speakers={props.speakers} />}
    </section>
  );
}
