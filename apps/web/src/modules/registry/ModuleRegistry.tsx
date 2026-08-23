import type { EmotionLabel, MediaImportChoice, ModuleId, ProjectMediaAsset, RecordingWaveformPreview, StudioWord, TrainingCatalog, WorkspacePage } from "../../domain/types";
import { ControlRack } from "../control-rack/ControlRack";
import { RecentTakes } from "../recent-takes/RecentTakes";
import { Recorder } from "../recorder/Recorder";
import type { CapturedAudio } from "../recorder/Recorder";
import { ScriptEditor } from "../script/ScriptEditor";
import { Timeline, type ActiveTake } from "../timeline/Timeline";
import { TrainingJob } from "../training-job/TrainingJob";
import { VoicePatch } from "../voice-patch/VoicePatch";
import { VoiceVault } from "../voice-vault/VoiceVault";
import { MediaPool } from "../media-pool/MediaPool";
import { SpeakerIsolation } from "../speaker-isolation/SpeakerIsolation";
import { SpeakerEmotion } from "../speaker-emotion/SpeakerEmotion";
import { Train } from "../train/Train";

export interface StudioContext {
  workflow: WorkspacePage;
  script: string;
  selectedVoice: string;
  speed: number;
  gain: number;
  take: ActiveTake | null;
  mediaAssets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  mediaBusy: boolean;
  recordingPreview: RecordingWaveformPreview | null;
  activeWordIndex: number;
  trainingCatalog: TrainingCatalog;
  onScriptChange: (value: string) => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (value: number) => void;
  onGainChange: (value: number) => void;
  onTakeChange: (take: CapturedAudio) => void;
  onImportMedia: (choices: MediaImportChoice[]) => void;
  onSelectAsset: (assetId: string) => void;
  onRecordingPreview: (preview: RecordingWaveformPreview) => void;
  onActiveWordChange: (index: number) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], emotion: EmotionLabel) => void;
  onWordsChange: (words: StudioWord[]) => void;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSendToTraining: () => void;
  onGenerate: () => void;
  onDeferredAction: (action: string) => void;
}

interface ModuleRegistryProps {
  id: ModuleId;
  context: StudioContext;
}

export function ModuleRegistry({ id, context }: ModuleRegistryProps) {
  switch (id) {
    case "media-pool":
      return (
        <MediaPool
          assets={context.mediaAssets}
          busy={context.mediaBusy}
          onImport={context.onImportMedia}
          onSelect={context.onSelectAsset}
          onSendToTraining={context.onSendToTraining}
          onToggleTraining={context.onToggleTraining}
          selectedAssetId={context.selectedAssetId}
          workflow={context.workflow}
          speakers={context.trainingCatalog.speakers}
          onUpdateAnnotations={context.onUpdateAnnotations}
        />
      );
    case "voice-vault":
      return <VoiceVault speakers={context.trainingCatalog.speakers} selectedVoice={context.selectedVoice} onAddSpeaker={(speaker) => context.onCatalogChange({ ...context.trainingCatalog, speakers: [...context.trainingCatalog.speakers, speaker] })} onSelectVoice={context.onVoiceChange} />;
    case "script":
      return (
        <ScriptEditor
          onChange={context.onScriptChange}
          onDeferredAction={context.onDeferredAction}
          onGenerate={context.onGenerate}
          value={context.script}
          activeWordIndex={context.activeWordIndex}
          words={context.take?.words}
          workflow={context.workflow}
          speakers={context.trainingCatalog.speakers}
          onWordsChange={context.onWordsChange}
        />
      );
    case "control-rack":
      return (
        <ControlRack
          gain={context.gain}
          onGainChange={context.onGainChange}
          onSpeedChange={context.onSpeedChange}
          speed={context.speed}
          environmentProfiles={context.trainingCatalog.environmentProfiles}
          environmentProfileId={context.trainingCatalog.settings.environmentProfileId}
          onEnvironmentProfileChange={(environmentProfileId) => context.onCatalogChange({ ...context.trainingCatalog, settings: { ...context.trainingCatalog.settings, environmentProfileId } })}
        />
      );
    case "recorder":
      return <Recorder onRecordingPreview={context.onRecordingPreview} onRecordingReady={context.onTakeChange} />;
    case "timeline":
      return <Timeline gain={context.gain} onActiveWordChange={context.onActiveWordChange} onGainChange={context.onGainChange} recordingPreview={context.recordingPreview} take={context.take} />;
    case "voice-patch":
      return <VoicePatch hasTake={Boolean(context.take)} />;
    case "training-job":
      return <TrainingJob assets={context.mediaAssets} speakers={context.trainingCatalog.speakers} />;
    case "speaker-isolation":
      return <SpeakerIsolation asset={context.mediaAssets.find((asset) => asset.id === context.selectedAssetId) ?? null} speakers={context.trainingCatalog.speakers} words={context.take?.words ?? []} />;
    case "speaker-emotion":
      return <SpeakerEmotion asset={context.mediaAssets.find((asset) => asset.id === context.selectedAssetId) ?? null} speakers={context.trainingCatalog.speakers} words={context.take?.words ?? []} />;
    case "train":
      return <Train assets={context.mediaAssets} catalog={context.trainingCatalog} onCatalogChange={context.onCatalogChange} />;
    case "recent-takes":
      return <RecentTakes />;
    case "voice-generator":
      return null;
  }
}
