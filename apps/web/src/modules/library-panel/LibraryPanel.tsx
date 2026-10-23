import { useState } from "react";

import type { EngineProfileSchema, EmotionLabel, EnvironmentNoiseProfile, MediaImportChoice, PendingLocalMedia, ProjectMediaAsset, ProjectVoice, SpeakerProfile, TrainingCatalog, VoiceOutput, VoiceOutputExportMode, WorkspacePage } from "../../domain/types";
import { MediaPool } from "../media-pool/MediaPool";
import type { MediaBatchAction, PendingMediaImportRow } from "../media-pool/MediaPool";
import { VoiceOutputPanel } from "../voice-output/VoiceOutputPanel";
import { VoiceVault } from "../voice-vault/VoiceVault";
import { Icon } from "../../ui/Icon";
import { ReferenceLibrary, type ReferenceLibraryProps } from "./ReferenceLibrary";

interface LibraryPanelProps {
  projectId?: string;
  onCollectionImported?: (result: import("../../domain/types").VoiceCollectionImport) => void;
  onPrepareCollectionExport?: () => Promise<void>;
  assets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  selectedImportedTrackId?: string | null;
  busy: boolean;
  workflow: WorkspacePage;
  speechToTextHost?: HTMLElement | null;
  speakers: SpeakerProfile[];
  environments: EnvironmentNoiseProfile[];
  catalog: TrainingCatalog;
  profileSchema: EngineProfileSchema | null;
  selectedVoice: string;
  onImport: (choices: MediaImportChoice[]) => void;
  onImportLocal?: () => void;
  pendingNativeMediaPaths?: string[];
  onConfirmNativeMediaImport?: (paths: string[], cacheLocal: boolean) => void;
  onCancelNativeMediaImport?: () => void;
  pendingMediaImports?: PendingMediaImportRow[];
  onRetryPendingImport?: (id: string) => void;
  pendingLocalMedia?: PendingLocalMedia | null;
  onPendingLocalTrackChange?: (streamIndex: number, field: "imported" | "transcribe", selected: boolean) => void;
  onConfirmPendingLocalMedia?: (mode: "import" | "follow", sttSegmentSeconds?: number, cacheLocal?: boolean) => void;
  onCancelPendingLocalMedia?: () => void;
  onFinishGrowingMkv?: (assetId: string) => void;
  onStartGrowingMkvDetailedStt?: (assetId: string, segmentSeconds: number) => void;
  onSelect: (assetId: string) => void;
  onSelectTrack?: (assetId: string) => void;
  onToggleImport?: (assetId: string, selected: boolean, streamIndex?: number) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onToggleDiarization?: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: (model: string) => void;
  onControlTranscriptions: (action: "pause" | "resume" | "stop" | "stop-all", assetIds?: string[]) => void | Promise<unknown>;
  onRemove: (asset: ProjectMediaAsset) => void;
  onBatchAction: (action: MediaBatchAction) => void;
  onRestore: (asset: ProjectMediaAsset) => void;
  onReveal: (asset: ProjectMediaAsset, location: "original" | "project") => void;
  onSetDisabled: (asset: ProjectMediaAsset, disabled: boolean) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onSendToTraining: () => void;
  onSendTo?: (target: import("../../ui/SendToMenu").SendTarget, assetIds: string[]) => void;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSelectVoice: (voiceId: string) => void;
  voices?: ProjectVoice[];
  onDeleteVoice?: (voice: ProjectVoice) => void;
  onDeleteVoices?: (voices: ProjectVoice[]) => void;
  onDeleteSpeaker?: (speaker: SpeakerProfile) => void;
  onDeleteSpeakers?: (speakers: SpeakerProfile[]) => void;
  onDeleteEnvironment?: (profile: EnvironmentNoiseProfile) => void;
  onDeleteEnvironments?: (profiles: EnvironmentNoiseProfile[]) => void;
}

export function LibraryPanel(props: LibraryPanelProps) {
  const [tab, setTab] = useState<"media" | "sound">("media");
  return (
    <section className="library-panel">
      <div className="library-panel-tabs" role="tablist" aria-label="Library panel">
        <button aria-selected={tab === "media"} className={tab === "media" ? "is-active" : ""} onClick={() => setTab("media")} role="tab" type="button"><Icon name="folder" />Media Pool <b>{props.assets.length}</b></button>
        <button aria-selected={tab === "sound"} className={tab === "sound" ? "is-active" : ""} onClick={() => setTab("sound")} role="tab" type="button"><Icon name="waveform" />Sound Library <b>{props.speakers.length + props.environments.length}</b></button>
      </div>
      <div className="library-panel-media" hidden={tab !== "media"}><MediaPool {...props} /></div>
      {tab === "sound" ? <VoiceVault projectId={props.projectId} onCollectionImported={props.onCollectionImported} onPrepareCollectionExport={props.onPrepareCollectionExport} assets={props.assets} catalog={props.catalog} onCatalogChange={props.onCatalogChange} onDeleteEnvironment={props.onDeleteEnvironment} onDeleteEnvironments={props.onDeleteEnvironments} onDeleteSpeaker={props.onDeleteSpeaker} onDeleteSpeakers={props.onDeleteSpeakers} onDeleteVoice={props.onDeleteVoice} onDeleteVoices={props.onDeleteVoices} onSelectVoice={props.onSelectVoice} profileSchema={props.profileSchema} selectedVoice={props.selectedVoice} voices={props.voices} /> : null}
    </section>
  );
}

interface ManipulatorLibraryProps {
  referenceLibrary?: Omit<ReferenceLibraryProps, "assets" | "projectId">;
  referenceAssets?: ProjectMediaAsset[];
  projectId?: string;
  onCollectionImported?: (result: import("../../domain/types").VoiceCollectionImport) => void;
  onPrepareCollectionExport?: () => Promise<void>;
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
  onDeleteVoices?: (voices: ProjectVoice[]) => void;
  onDeleteSpeaker?: (speaker: SpeakerProfile) => void;
  onDeleteSpeakers?: (speakers: SpeakerProfile[]) => void;
  onDeleteEnvironment?: (profile: EnvironmentNoiseProfile) => void;
  onDeleteEnvironments?: (profiles: EnvironmentNoiseProfile[]) => void;
  outputs: VoiceOutput[];
  activeOutputId: string | null;
  onOpenOutput: (output: VoiceOutput) => void;
  onVersionCreated?: (output: VoiceOutput) => void;
  onSessionCreated?: () => void;
  onSendOutputTo?: (target: import("../../ui/SendToMenu").SendTarget, outputs: VoiceOutput[]) => void;
  onExportOutput: (output: VoiceOutput, mode: VoiceOutputExportMode) => void;
  onDeleteOutput: (output: VoiceOutput) => void;
  onDeleteOutputs?: (outputs: VoiceOutput[]) => void;
}

/**
 * Voice Manipulator's library: who can speak, and what has been spoken.
 * Media Pool is source footage for STT and training and has no place here.
 */
export function ManipulatorLibrary(props: ManipulatorLibraryProps) {
  const [tab, setTab] = useState<"sound" | "output" | "reference">("output");
  return (
    <section className="library-panel">
      <div className="library-panel-tabs" role="tablist" aria-label="Thư viện Voice Manipulator">
        <button aria-selected={tab === "sound"} className={tab === "sound" ? "is-active" : ""} onClick={() => setTab("sound")} role="tab" type="button"><Icon name="waveform" />Sound Library <b>{props.speakers.length + props.environments.length}</b></button>
        <button aria-selected={tab === "output"} className={tab === "output" ? "is-active" : ""} onClick={() => setTab("output")} role="tab" type="button"><Icon name="file" />Voice Output <b>{props.outputs.length}</b></button>
        <button aria-selected={tab === "reference"} className={tab === "reference" ? "is-active" : ""} onClick={() => setTab("reference")} role="tab" type="button">Reference <b>{(props.referenceAssets ?? props.assets).filter((asset) => asset.referenceSelected && !asset.deletedAt).length}</b></button>
      </div>
      {tab === "reference" ? <ReferenceLibrary {...props.referenceLibrary} projectId={props.projectId} assets={props.referenceAssets ?? props.assets} /> : tab === "sound"
        ? <VoiceVault projectId={props.projectId} onCollectionImported={props.onCollectionImported} onPrepareCollectionExport={props.onPrepareCollectionExport} assets={props.assets} catalog={props.catalog} onCatalogChange={props.onCatalogChange} onDeleteEnvironment={props.onDeleteEnvironment} onDeleteEnvironments={props.onDeleteEnvironments} onDeleteSpeaker={props.onDeleteSpeaker} onDeleteSpeakers={props.onDeleteSpeakers} onDeleteVoice={props.onDeleteVoice} onDeleteVoices={props.onDeleteVoices} onSelectVoice={props.onSelectVoice} profileSchema={props.profileSchema} selectedVoice={props.selectedVoice} voices={props.voices} />
        : <VoiceOutputPanel projectId={props.projectId} onVersionCreated={props.onVersionCreated} onSessionCreated={props.onSessionCreated} onSendTo={props.onSendOutputTo} activeOutputId={props.activeOutputId} onDelete={props.onDeleteOutput} onDeleteMany={props.onDeleteOutputs} onExport={props.onExportOutput} onOpen={props.onOpenOutput} outputs={props.outputs} speakers={props.speakers} />}
    </section>
  );
}
