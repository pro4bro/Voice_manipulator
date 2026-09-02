import type { WordSelection } from "../../domain/word-selection";
import type { EmotionLabel, EmotionStylePreferences, EngineProfileSchema, MediaImportChoice, ModuleId, ProjectMediaAsset, RecordingWaveformPreview, StudioWord, TimelineEditRange, TimelineGainKeyframe, TrainingCatalog, WorkspacePage } from "../../domain/types";
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
  liveTranscriptActive: boolean;
  liveTranscriptText: string | null;
  emotionStyle: EmotionStylePreferences;
  aiReviewText: string | null;
  aiReviewKey: string | null;
  aiReviewBusy: boolean;
  canRunAiReview: boolean;
  trainingCatalog: TrainingCatalog;
  profileSchema: EngineProfileSchema | null;
  /** Shared so a selection made in Script shows up in Timeline, and back. */
  wordSelection: WordSelection;
  onScriptChange: (value: string) => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (value: number) => void;
  onGainChange: (value: number) => void;
  onTimelineEditsChange: (ranges: TimelineEditRange[], gainKeyframes?: TimelineGainKeyframe[]) => void;
  onTakeChange: (take: CapturedAudio) => void;
  onImportMedia: (choices: MediaImportChoice[]) => void;
  onImportLocalMedia: () => void;
  onSetLocalCache: (assetId: string, enabled: boolean) => void;
  onSelectAsset: (assetId: string) => void;
  onRecordingPreview: (preview: RecordingWaveformPreview) => void;
  onLiveTranscript: (text: string, active: boolean) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: (model: string) => void;
  onControlTranscriptions: (action: "pause" | "resume" | "stop", assetIds?: string[]) => void;
  onRemoveAsset: (asset: ProjectMediaAsset) => void;
  onRestoreAsset: (asset: ProjectMediaAsset) => void;
  onRevealAsset: (asset: ProjectMediaAsset) => void;
  onSetAssetDisabled: (asset: ProjectMediaAsset, disabled: boolean) => void;
  /** True while the selected footage is in the recycle bin: look, do not touch. */
  readOnlyAsset: boolean;
  projectLanguage: string | null;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onUpdateDiarizationAssignments: (assetId: string, assignments: Record<string, string | null>) => void;
  onWordsChange: (words: StudioWord[], text?: string) => void;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onSendToTraining: () => void;
  onGenerate: () => void;
  onDeferredAction: (action: string) => void;
  onRunAiReview: () => void;
  onRunDiarization: () => void;
  onWordSelectionChange: (selection: WordSelection) => void;
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
    onImportLocal: context.onImportLocalMedia,
    onSetLocalCache: context.onSetLocalCache,
    onQueueTranscriptions: context.onQueueTranscriptions,
    onControlTranscriptions: context.onControlTranscriptions,
    onRemove: context.onRemoveAsset,
    onRestore: context.onRestoreAsset,
    onReveal: context.onRevealAsset,
    onSetDisabled: context.onSetAssetDisabled,
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
    case "script": {
      const selectedAsset = context.mediaAssets.find((asset) => asset.id === context.selectedAssetId);
      return <ScriptEditor wordSelection={context.wordSelection} onWordSelectionChange={context.onWordSelectionChange} wordTimingNote={selectedAsset?.wordTimingNote} wordTimingQuality={selectedAsset?.wordTimingQuality} playbackAssetId={context.take?.id ?? null} footageName={context.take?.name ?? null} emotionStyle={context.emotionStyle} aiReviewBusy={context.aiReviewBusy} aiReviewKey={context.aiReviewKey} aiReviewText={context.aiReviewText} canRunAiReview={context.canRunAiReview} environments={context.trainingCatalog.environmentProfiles} isLiveTranscript={context.liveTranscriptActive} liveTranscriptText={context.liveTranscriptText} onChange={context.onScriptChange} onDeferredAction={context.onDeferredAction} onGenerate={context.onGenerate} onRunAiReview={context.onRunAiReview} onWordsChange={context.onWordsChange} speakers={context.trainingCatalog.speakers} value={context.script} words={context.take?.words} workflow={context.workflow} />;
    }
    case "control-rack":
      return <ControlRack gain={context.gain} onGainChange={context.onGainChange} onSpeedChange={context.onSpeedChange} speed={context.speed} environmentProfiles={context.trainingCatalog.environmentProfiles} environmentProfileId={context.trainingCatalog.settings.environmentProfileId} onEnvironmentProfileChange={(environmentProfileId) => context.onCatalogChange({ ...context.trainingCatalog, settings: { ...context.trainingCatalog.settings, environmentProfileId } })} />;
    case "recorder":
      return <Recorder projectLanguage={context.projectLanguage} onLiveTranscript={context.onLiveTranscript} onRecordingPreview={context.onRecordingPreview} onRecordingReady={context.onTakeChange} />;
    case "timeline": {
      const selectedAsset = context.mediaAssets.find((asset) => asset.id === context.selectedAssetId);
      return <Timeline wordSelection={context.wordSelection} onWordSelectionChange={context.onWordSelectionChange} gain={context.gain} gainKeyframes={selectedAsset?.gainKeyframes ?? []} onGainChange={context.onGainChange} onGainKeyframesChange={(keyframes) => context.onTimelineEditsChange(selectedAsset?.removedRanges ?? [], keyframes)} onRemovedRangesChange={context.onTimelineEditsChange} onWordsChange={context.onWordsChange} recordingPreview={context.recordingPreview} removedRanges={selectedAsset?.removedRanges ?? []} speakers={context.trainingCatalog.speakers} take={context.take} />;
    }
    case "voice-patch":
      return <VoicePatch hasTake={Boolean(context.take)} />;
    case "training-job":
      return <TrainingJob assets={context.mediaAssets} speakers={context.trainingCatalog.speakers} />;
    case "speaker-isolation":
      return <SpeakerIsolation asset={context.mediaAssets.find((asset) => asset.id === context.selectedAssetId) ?? null} onAssign={(assignments) => context.onUpdateDiarizationAssignments(context.selectedAssetId ?? "", assignments)} onRun={context.onRunDiarization} speakers={context.trainingCatalog.speakers} words={context.take?.words ?? []} />;
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
