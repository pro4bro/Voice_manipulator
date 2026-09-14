import type { WordSelection } from "../../domain/word-selection";
import type { ReadingMode } from "../../domain/reading-plan";
import type { EmotionLabel, EmotionStylePreferences, EngineProfileSchema, MediaImportChoice, ModuleId, DatasetReadiness, ProjectMediaAsset, TrainingModelOption, TrainingProgressLine, TrainingRun, ReadingPackSummary, RecordingWaveformPreview, StudioWord, TimelineEditRange, TimelineGainKeyframe, TrainingCatalog, WorkspacePage } from "../../domain/types";
import { ControlRack } from "../control-rack/ControlRack";
import { DatasetReadinessPanel } from "../dashboard/DatasetReadinessPanel";
import { PipelineDashboard } from "../dashboard/PipelineDashboard";
import { LibraryPanel } from "../library-panel/LibraryPanel";
import { MediaPool } from "../media-pool/MediaPool";
import { RecentTakes } from "../recent-takes/RecentTakes";
import { VoiceOutputPanel } from "../voice-output/VoiceOutputPanel";
import { selectedTrainingModel } from "../train/trainingModels";
import { Recorder } from "../recorder/Recorder";
import type { CapturedAudio, ReadingSessionView } from "../recorder/Recorder";
import { ScriptEditor } from "../script/ScriptEditor";
import { SpeakerEmotion } from "../speaker-emotion/SpeakerEmotion";
import { SpeakerIsolation } from "../speaker-isolation/SpeakerIsolation";
import { Timeline, type ActiveTake } from "../timeline/Timeline";
import { Train } from "../train/Train";
import { TrainingJob } from "../training-job/TrainingJob";
import { VoiceGenerator } from "../voice-generator/VoiceGenerator";
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
  datasetReadiness: DatasetReadiness | null;
  datasetBusy: boolean;
  projectId: string;
  voiceOutputs: import("../../domain/types").VoiceOutput[];
  activeOutputId: string | null;
  onOpenVoiceOutput: (output: import("../../domain/types").VoiceOutput) => void;
  onDeleteVoiceOutput: (output: import("../../domain/types").VoiceOutput) => void;
  sttEngines: TrainingModelOption[];
  asrAdapters: import("../../domain/types").ProjectAsrAdapter[];
  projectVoices: import("../../domain/types").ProjectVoice[];
  voiceGenerators: TrainingModelOption[];
  generatorId: string | null;
  projectVoiceId: string | null;
  generatorParameters: Record<string, import("../../domain/types").TrainingParameterValue>;
  generating: boolean;
  onGeneratorChange: (generatorId: string) => void;
  onProjectVoiceChange: (voiceId: string) => void;
  onGeneratorParametersChange: (parameters: Record<string, import("../../domain/types").TrainingParameterValue>) => void;
  trainingRuns: TrainingRun[];
  /** The newest batch, in the order its voices train. */
  trainingBatch: TrainingRun[];
  trainingProgressByRun: Record<string, TrainingProgressLine[]>;
  trainingRuntime: import("../../domain/types").TrainingRuntimeReport | null;
  trainingModels: TrainingModelOption[];
  readingPacks: ReadingPackSummary[];
  readingSession: ReadingSessionView | null;
  readingBusy: boolean;
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
  onStartReadingSession: (packId: string, emotions: EmotionLabel[], mode: ReadingMode) => void;
  onEndReadingSession: () => void;
  onSkipCard: () => void;
  onCompileDataset: () => void;
  onCancelTrainingRun: (runId: string) => void;
  onSelectPage: (page: WorkspacePage) => void;
  onStartTrainingRun: () => void;
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
    sttEngines: context.sttEngines,
    asrAdapters: context.asrAdapters,
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
      return <ScriptEditor readingCard={context.readingSession?.card ?? null} readingCardNumber={context.readingSession?.cardNumber ?? 0} readingCardTotal={context.readingSession?.cardTotal ?? 0} wordSelection={context.wordSelection} onWordSelectionChange={context.onWordSelectionChange} wordTimingNote={selectedAsset?.wordTimingNote} wordTimingQuality={selectedAsset?.wordTimingQuality} playbackAssetId={context.take?.id ?? null} footageName={context.take?.name ?? null} emotionStyle={context.emotionStyle} aiReviewBusy={context.aiReviewBusy} aiReviewKey={context.aiReviewKey} aiReviewText={context.aiReviewText} canRunAiReview={context.canRunAiReview} environments={context.trainingCatalog.environmentProfiles} isLiveTranscript={context.liveTranscriptActive} liveTranscriptText={context.liveTranscriptText} onChange={context.onScriptChange} onDeferredAction={context.onDeferredAction} onGenerate={context.onGenerate} onRunAiReview={context.onRunAiReview} onWordsChange={context.onWordsChange} speakers={context.trainingCatalog.speakers} value={context.script} words={context.take?.words} workflow={context.workflow} />;
    }
    case "control-rack":
      return <ControlRack gain={context.gain} onGainChange={context.onGainChange} onSpeedChange={context.onSpeedChange} speed={context.speed} environmentProfiles={context.trainingCatalog.environmentProfiles} environmentProfileId={context.trainingCatalog.settings.environmentProfileId} onEnvironmentProfileChange={(environmentProfileId) => context.onCatalogChange({ ...context.trainingCatalog, settings: { ...context.trainingCatalog.settings, environmentProfileId } })} />;
    case "recorder":
      return <Recorder onEndReadingSession={context.onEndReadingSession} onSkipCard={context.onSkipCard} onStartReadingSession={context.onStartReadingSession} readingBusy={context.readingBusy} readingPacks={context.readingPacks} readingSession={context.readingSession} projectLanguage={context.projectLanguage} onLiveTranscript={context.onLiveTranscript} onRecordingPreview={context.onRecordingPreview} onRecordingReady={context.onTakeChange} />;
    case "timeline": {
      const selectedAsset = context.mediaAssets.find((asset) => asset.id === context.selectedAssetId);
      return <Timeline wordSelection={context.wordSelection} onWordSelectionChange={context.onWordSelectionChange} gain={context.gain} gainKeyframes={selectedAsset?.gainKeyframes ?? []} onGainChange={context.onGainChange} onGainKeyframesChange={(keyframes) => context.onTimelineEditsChange(selectedAsset?.removedRanges ?? [], keyframes)} onRemovedRangesChange={context.onTimelineEditsChange} onWordsChange={context.onWordsChange} recordingPreview={context.recordingPreview} removedRanges={selectedAsset?.removedRanges ?? []} speakers={context.trainingCatalog.speakers} take={context.take} />;
    }
    case "voice-patch":
      return <VoicePatch hasTake={Boolean(context.take)} />;
    case "training-job":
      return <TrainingJob batch={context.trainingBatch} busy={context.datasetBusy} onCancelRun={context.onCancelTrainingRun} progressByRun={context.trainingProgressByRun} selectedMode={selectedTrainingModel(context.trainingModels, context.trainingCatalog.settings)?.mode ?? null} speakers={context.trainingCatalog.speakers} targetSpeakerIds={context.trainingCatalog.settings.targetSpeakerIds} />;
    case "pipeline-dashboard":
      return <PipelineDashboard assets={context.mediaAssets} onOpenTraining={() => context.onSelectPage("voice-training")} onSelectAsset={context.onSelectAsset} readiness={context.datasetReadiness} runs={context.trainingRuns} speakers={context.trainingCatalog.speakers} />;
    case "dataset-readiness":
      return <DatasetReadinessPanel busy={context.datasetBusy} onCompile={context.onCompileDataset} readiness={context.datasetReadiness} speakers={context.trainingCatalog.speakers} />;
    case "speaker-isolation":
      return <SpeakerIsolation asset={context.mediaAssets.find((asset) => asset.id === context.selectedAssetId) ?? null} onAssign={(assignments) => context.onUpdateDiarizationAssignments(context.selectedAssetId ?? "", assignments)} onRun={context.onRunDiarization} speakers={context.trainingCatalog.speakers} words={context.take?.words ?? []} />;
    case "speaker-emotion":
      return <SpeakerEmotion asset={context.mediaAssets.find((asset) => asset.id === context.selectedAssetId) ?? null} speakers={context.trainingCatalog.speakers} words={context.take?.words ?? []} />;
    case "train":
      return <Train assets={context.mediaAssets} busy={context.datasetBusy} catalog={context.trainingCatalog} onCatalogChange={context.onCatalogChange} onStart={context.onStartTrainingRun} readiness={context.datasetReadiness} trainingModels={context.trainingModels} trainingRuntime={context.trainingRuntime} />;
    case "recent-takes":
      return <RecentTakes />;
    case "voice-output":
      return <VoiceOutputPanel activeOutputId={context.activeOutputId} onDelete={context.onDeleteVoiceOutput} onOpen={context.onOpenVoiceOutput} outputs={context.voiceOutputs} speakers={context.trainingCatalog.speakers} />;
    case "voice-generator":
      return <VoiceGenerator busy={context.generating} generatorId={context.generatorId} generators={context.voiceGenerators} onGenerate={context.onGenerate} onGeneratorChange={context.onGeneratorChange} onOpenTraining={() => context.onSelectPage("voice-training")} onParametersChange={context.onGeneratorParametersChange} onVoiceChange={context.onProjectVoiceChange} parameters={context.generatorParameters} projectId={context.projectId} scriptLength={context.script.trim().length} speakers={context.trainingCatalog.speakers} voiceId={context.projectVoiceId} voices={context.projectVoices} />;
  }
}
