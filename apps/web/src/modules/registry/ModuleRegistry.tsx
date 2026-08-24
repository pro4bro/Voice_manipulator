import type { EmotionLabel, EmotionStylePreferences, EngineProfileSchema, MediaImportChoice, ModuleId, ProjectMediaAsset, RecordingWaveformPreview, StudioWord, TimelineEditRange, TrainingCatalog, WorkspacePage } from "../../domain/types";
import { ControlRack } from "../control-rack/ControlRack";
import { LibraryPanel } from "../library-panel/LibraryPanel";
import { MediaPool } from "../media-pool/MediaPool";
import { RecentTakes } from "../recent-takes/RecentTakes";
import { Recorder } from "../recorder/Recorder";
import type { CapturedAudio } from "../recorder/Recorder";
import { ScriptEditor } from "../script/ScriptEditor";
import { SpeakerEmotion } from "../speaker-emotion/SpeakerEmotion";
import { SpeakerIsolation } from "../speaker-isolation/SpeakerIsolation";
import { Timeline, type ActiveTake } from "../timeline/Timeline";
import { Train } from "../train/Train";
import { TrainingJob } from "../training-job/TrainingJob";
import { VoicePatch } from "../voice-patch/VoicePatch";
import { VoiceVault } from "../voice-vault/VoiceVault";

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
  liveTranscriptActive: boolean;
  emotionStyle: EmotionStylePreferences;
  aiReviewText: string | null;
  aiReviewKey: string | null;
  aiReviewBusy: boolean;
  canRunAiReview: boolean;
  trainingCatalog: TrainingCatalog;
  profileSchema: EngineProfileSchema | null;
  onScriptChange: (value: string) => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (value: number) => void;
  onGainChange: (value: number) => void;
  onTimelineEditsChange: (ranges: TimelineEditRange[]) => void;
  onTakeChange: (take: CapturedAudio) => void;
  onImportMedia: (choices: MediaImportChoice[]) => void;
  onSelectAsset: (assetId: string) => void;
  onRecordingPreview: (preview: RecordingWaveformPreview) => void;
  onLiveTranscript: (text: string, active: boolean) => void;
  onActiveWordChange: (index: number) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: () => void;
  onRemoveAsset: (asset: ProjectMediaAsset) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onWordsChange: (words: StudioWord[]) => void;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSendToTraining: () => void;
  onGenerate: () => void;
  onDeferredAction: (action: string) => void;
  onRunAiReview: () => void;
}

interface ModuleRegistryProps {
  id: ModuleId;
  context: StudioContext;
}

function mediaPoolProps(context: StudioContext) {
  return {
    assets: context.mediaAssets,
    busy: context.mediaBusy,
    environments: context.trainingCatalog.environmentProfiles,
    onImport: context.onImportMedia,
    onQueueTranscriptions: context.onQueueTranscriptions,
    onRemove: context.onRemoveAsset,
    onSelect: context.onSelectAsset,
    onSendToTraining: context.onSendToTraining,
    onToggleTraining: context.onToggleTraining,
    onToggleTranscription: context.onToggleTranscription,
    selectedAssetId: context.selectedAssetId,
    workflow: context.workflow,
    speakers: context.trainingCatalog.speakers,
    onUpdateAnnotations: context.onUpdateAnnotations,
  };
}

export function ModuleRegistry({ id, context }: ModuleRegistryProps) {
  switch (id) {
    case "library-panel":
      return <LibraryPanel {...mediaPoolProps(context)} catalog={context.trainingCatalog} onCatalogChange={context.onCatalogChange} onSelectVoice={context.onVoiceChange} profileSchema={context.profileSchema} selectedVoice={context.selectedVoice} />;
    case "media-pool":
      return <MediaPool {...mediaPoolProps(context)} />;
    case "voice-vault":
      return <VoiceVault assets={context.mediaAssets} catalog={context.trainingCatalog} onCatalogChange={context.onCatalogChange} onSelectVoice={context.onVoiceChange} profileSchema={context.profileSchema} selectedVoice={context.selectedVoice} />;
    case "script":
      return <ScriptEditor activeWordIndex={context.activeWordIndex} emotionStyle={context.emotionStyle} aiReviewBusy={context.aiReviewBusy} aiReviewKey={context.aiReviewKey} aiReviewText={context.aiReviewText} canRunAiReview={context.canRunAiReview} environments={context.trainingCatalog.environmentProfiles} isLiveTranscript={context.liveTranscriptActive} onChange={context.onScriptChange} onDeferredAction={context.onDeferredAction} onGenerate={context.onGenerate} onRunAiReview={context.onRunAiReview} onWordsChange={context.onWordsChange} speakers={context.trainingCatalog.speakers} value={context.script} words={context.take?.words} workflow={context.workflow} />;
    case "control-rack":
      return <ControlRack gain={context.gain} onGainChange={context.onGainChange} onSpeedChange={context.onSpeedChange} speed={context.speed} environmentProfiles={context.trainingCatalog.environmentProfiles} environmentProfileId={context.trainingCatalog.settings.environmentProfileId} onEnvironmentProfileChange={(environmentProfileId) => context.onCatalogChange({ ...context.trainingCatalog, settings: { ...context.trainingCatalog.settings, environmentProfileId } })} />;
    case "recorder":
      return <Recorder onLiveTranscript={context.onLiveTranscript} onRecordingPreview={context.onRecordingPreview} onRecordingReady={context.onTakeChange} />;
    case "timeline":
      return <Timeline gain={context.gain} onActiveWordChange={context.onActiveWordChange} onGainChange={context.onGainChange} onRemovedRangesChange={context.onTimelineEditsChange} recordingPreview={context.recordingPreview} removedRanges={context.mediaAssets.find((asset) => asset.id === context.selectedAssetId)?.removedRanges ?? []} take={context.take} />;
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
