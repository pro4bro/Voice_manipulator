import type { WordSelection } from "../../domain/word-selection";
import type { TimelineEditState } from "../../domain/timeline-editing";
import type { TaskStopHandler } from "../../ui/TaskStop";
import type { ReadingMode } from "../../domain/reading-plan";
import type { EmotionLabel, EmotionStylePreferences, EngineProfileSchema, MediaImportChoice, PendingLocalMedia, ModuleId, DatasetReadiness, ProjectMediaAsset, TrainingModelOption, TrainingProgressLine, TrainingRun, ReadingPackSummary, RecordingWaveformPreview, StudioWord, TimelineEditRange, TimelineGainKeyframe, TrainingCatalog, VoiceOutputExportMode, WorkspacePage } from "../../domain/types";
import { ControlRack } from "../control-rack/ControlRack";
import { DatasetReadinessPanel } from "../dashboard/DatasetReadinessPanel";
import { PipelineDashboard } from "../dashboard/PipelineDashboard";
import { ProjectOverview } from "../dashboard/ProjectOverview";
import { LibraryPanel, ManipulatorLibrary } from "../library-panel/LibraryPanel";
import { MediaPool } from "../media-pool/MediaPool";
import { ModuleFrame } from "../../ui/ModuleFrame";
import type { MediaBatchAction } from "../media-pool/MediaPool";
import { RecentTakes } from "../recent-takes/RecentTakes";
import { VoiceOutputPanel } from "../voice-output/VoiceOutputPanel";
import { selectedTrainingModel } from "../train/trainingModels";
import { Recorder } from "../recorder/Recorder";
import { ObsCapture } from "../obs-capture/ObsCapture";
import type { ObsOverlapSelection, ObsTimelineSeekRequest } from "../obs-capture/obs-overlap";
import type { CapturedAudio, ReadingSessionView } from "../recorder/Recorder";
import type { ScriptDocumentChange } from "../script/script-document-actions";
import { ScriptEditor } from "../script/ScriptEditor";
import { ObsLiveLinkScript } from "../script/ObsLiveLinkScript";
import { VoiceScript } from "../script/VoiceScript";
import { ChangerRecordControls } from "../voice-changer/ChangerRecordControls";
import { SoundReactor } from "../voice-changer/SoundReactor";
import { VoiceInput } from "../voice-changer/VoiceInput";
import { voicesInCategory, type VoiceCategory } from "../../domain/voiceScript";
import { SpeakerEmotion } from "../speaker-emotion/SpeakerEmotion";
import { SpeakerIsolation } from "../speaker-isolation/SpeakerIsolation";
import { Timeline, type ActiveTake } from "../timeline/Timeline";
import { ObsLiveLinkTimeline } from "../timeline/ObsLiveLinkTimeline";
import { ImportedMultitrackTimeline } from "../timeline/ImportedMultitrackTimeline";
import { ChannelScript } from "../script/ChannelScript";
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
  selectedImportedTrackId: string | null;
  selectedScriptAssetIds?: string[] | null;
  onScriptSelectionChange?: (assetIds: string[]) => void;
  onAssignScriptWords?: (assetId: string, indexes: number[], speakerProfileId: string | null) => void;
  onSelectImportedTrack: (assetId: string) => void;
  mediaBusy: boolean;
  recordingPreview: RecordingWaveformPreview | null;
  obsTimelineActive: boolean;
  obsTimelineRecordingId: string | null;
  obsTranscriptRows: import("../../domain/types").ObsLiveLinkTranscriptRow[];
  obsTranscriptError: string | null;
  obsPlayheadSeconds: number;
  obsSeekRequest: ObsTimelineSeekRequest | null;
  obsOverlapSelection: ObsOverlapSelection | null;
  onObsTimelineRecordingChange: (recordingId: string) => void;
  onObsTranscriptSeek: (row: import("../../domain/types").ObsLiveLinkTranscriptRow, seconds?: number) => void;
  onObsOverlapSelect: (selection: ObsOverlapSelection | null) => void;
  onObsArchivedOverlapSelect: (trackId: string, selection: ObsOverlapSelection) => void;
  onObsPlayheadChange: (seconds: number) => void;
  onObsTimelineCutsChange: (assetIds: string[], ranges: TimelineEditRange[]) => Promise<boolean>;
  onObsTimelineSourceChange: (source: "microphone" | "display" | "obs-livelink") => void;
  onOpenObsRecording: (recordingId: string) => void;
  onOpenObsTrack: (recordingId: string, channelId: string) => void;
  onObsArchiveReady: (recordingId: string) => Promise<void>;
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
  projectName: string;
  voiceOutputs: import("../../domain/types").VoiceOutput[];
  activeOutputId: string | null;
  onOpenVoiceOutput: (output: import("../../domain/types").VoiceOutput) => void;
  onDeleteVoiceOutput: (output: import("../../domain/types").VoiceOutput) => void;
  onDeleteVoiceOutputs: (outputs: import("../../domain/types").VoiceOutput[]) => void;
  sttEngines: TrainingModelOption[];
  asrAdapters: import("../../domain/types").ProjectAsrAdapter[];
  projectVoices: import("../../domain/types").ProjectVoice[];
  voiceGenerators: TrainingModelOption[];
  /** Generation values keyed by generator id. */
  generatorParameters: Record<string, Record<string, import("../../domain/types").TrainingParameterValue>>;
  generating: boolean;
  onGeneratorParametersChange: (generatorId: string, parameters: Record<string, import("../../domain/types").TrainingParameterValue>) => void;
  onVoiceCategoryChange?: (category: VoiceCategory) => void;
  /** The typed Script of Voice Manipulator, one row per turn. */
  voiceScriptRows: import("../../domain/types").VoiceScriptRow[];
  onVoiceScriptRowsChange: (rows: import("../../domain/types").VoiceScriptRow[]) => void;
  /** Follows the kind chosen in Voice Training. */
  voiceCategory: VoiceCategory;
  voiceScriptJob: import("../../domain/types").VoiceScriptJob | null;
  onExportVoiceOutput: (output: import("../../domain/types").VoiceOutput, mode: VoiceOutputExportMode) => void;
  voiceChangers: TrainingModelOption[];
  changerPreflight: import("../../domain/types").VoiceChangerPreflight | null;
  changerSettings: import("../../domain/types").VoiceChangerSettings;
  onChangerSettingsChange: (settings: import("../../domain/types").VoiceChangerSettings) => void;
  changerStatus: import("../../domain/types").VoiceChangerStatus | null;
  changerBusy: boolean;
  changerRecordings: import("../../domain/types").VoiceChangerRecording[];
  onStartChanger: () => void;
  onStopChanger: () => void;
  onRefreshChanger: () => void;
  onStartChangerRecording: () => void;
  onStopChangerRecording: () => void;
  onOpenChangerRecording: (recording: import("../../domain/types").VoiceChangerRecording) => void;
  onDeleteChangerRecording: (recording: import("../../domain/types").VoiceChangerRecording) => void;
  onDeleteChangerRecordings: (recordings: import("../../domain/types").VoiceChangerRecording[]) => void;
  trainingRuns: TrainingRun[];
  /** Every job the app has in flight, and its log lines. */
  activityTasks: import("../../domain/types").ActivityTask[];
  activityEvents: import("../../domain/types").ActivityEvent[];
  /** The newest batch, in the order its voices train. */
  trainingBatch: TrainingRun[];
  trainingProgressByRun: Record<string, TrainingProgressLine[]>;
  trainingRuntime: import("../../domain/types").TrainingRuntimeReport | null;
  trainingModels: TrainingModelOption[];
  readingPacks: ReadingPackSummary[];
  readingSession: ReadingSessionView | null;
  readingBusy: boolean;
  readingPending: boolean;
  onRetryReadingTake: () => void;
  onScriptChange: (value: string) => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (value: number) => void;
  onGainChange: (value: number) => void;
  onTimelineEditsChange: (ranges: TimelineEditRange[], gainKeyframes?: TimelineGainKeyframe[]) => void;
  onTimelineStateChange: (state: TimelineEditState) => void;
  onAssetTimelineStateChange: (assetId: string, state: TimelineEditState) => Promise<void>;
  onTakeChange: (take: CapturedAudio) => void;
  onImportMedia: (choices: MediaImportChoice[]) => void;
  onImportLocalMedia: () => void;
  pendingLocalMedia: PendingLocalMedia | null;
  onPendingLocalTrackChange: (streamIndex: number, field: "imported" | "transcribe", selected: boolean) => void;
  onConfirmPendingLocalMedia: (mode: "import" | "follow", sttSegmentSeconds?: number) => void;
  onCancelPendingLocalMedia: () => void;
  onFinishGrowingMkv: (assetId: string) => void;
  onStartGrowingMkvDetailedStt: (assetId: string, segmentSeconds: number) => void;
  onSetLocalCache: (assetId: string, enabled: boolean) => void;
  onSelectAsset: (assetId: string) => void;
  onClearMediaSelection: () => void;
  onOpenObsAsset: (assetId: string) => void;
  onObsImportReady: (assetId: string) => void;
  onRecordingPreview: (preview: RecordingWaveformPreview) => void;
  onLiveTranscript: (text: string, active: boolean) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onToggleImport: (assetId: string, selected: boolean, streamIndex?: number) => void;
  onToggleDiarization: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: (model: string) => void;
  onControlTranscriptions: (action: "pause" | "resume" | "stop" | "stop-all", assetIds?: string[]) => void | Promise<unknown>;
  onRemoveAsset: (asset: ProjectMediaAsset) => void;
  onBatchMediaAction: (action: MediaBatchAction) => void;
  onRestoreAsset: (asset: ProjectMediaAsset) => void;
  onRevealAsset: (asset: ProjectMediaAsset) => void;
  onSetAssetDisabled: (asset: ProjectMediaAsset, disabled: boolean) => void;
  /** True while the selected footage is in the recycle bin: look, do not touch. */
  readOnlyAsset: boolean;
  projectLanguage: string | null;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onUpdateDiarizationAssignments: (assetId: string, assignments: Record<string, string | null>) => void;
  onWordsChange: (words: StudioWord[], text?: string) => void;
  onScriptUndo?: () => void;
  onScriptRedo?: () => void;
  onScriptDocumentsChange?: (changes: ScriptDocumentChange[]) => void;
  onAssetWordsChange: (assetId: string, words: StudioWord[], text?: string) => void;
  onCatalogChange: (catalog: TrainingCatalog) => void;
  onCollectionImported?: (result: import("../../domain/types").VoiceCollectionImport) => void;
  onPrepareCollectionExport?: () => Promise<void>;
  onSendToTraining: () => void;
  onGenerate: () => void;
  onDeferredAction: (action: string, assetIds?: string[]) => void;
  onRunAiReview: (assetIds?: string[]) => void;
  onRunDiarization: () => void;
  onStopDiarization: TaskStopHandler;
  onStopTraining: TaskStopHandler;
  onStopGeneration: TaskStopHandler;
  onWordSelectionChange: (selection: WordSelection) => void;
  onStartReadingSession: (packId: string, emotions: EmotionLabel[], mode: ReadingMode, speakerProfileId: string) => void;
  onEndReadingSession: () => void;
  onSkipCard: () => void;
  onCompileDataset: () => void;
  onTrainingOutputsChanged: () => void;
  onDeleteVoice: (voice: import("../../domain/types").ProjectVoice) => void;
  onDeleteVoices: (voices: import("../../domain/types").ProjectVoice[]) => void;
  onDeleteSpeaker: (speaker: import("../../domain/types").SpeakerProfile) => void;
  onDeleteSpeakers: (speakers: import("../../domain/types").SpeakerProfile[]) => void;
  onDeleteEnvironment: (profile: import("../../domain/types").EnvironmentNoiseProfile) => void;
  onDeleteEnvironments: (profiles: import("../../domain/types").EnvironmentNoiseProfile[]) => void;
  /** Whose voice a whole take is, assigned from Script without diarization. */
  onAssignAssetSpeaker: (assetId: string, speakerProfileId: string | null) => void;
  onSelectPage: (page: WorkspacePage) => void;
  onStartTrainingRun: () => void;
}

interface ModuleRegistryProps {
  id: ModuleId;
  context: StudioContext;
}

function mediaPoolProps(context: StudioContext) {
  return {
    projectId: context.workflow === "voice-training" ? undefined : context.projectId,
    assets: workflowMediaAssets(context),
    activeTrainingSpeakerIds: [...new Set((context.trainingRuns ?? [])
      .filter((run) => run.status === "pending" || run.status === "running")
      .map((run) => run.speakerProfileId)
      .filter((speakerId): speakerId is string => Boolean(speakerId)))],
    busy: context.mediaBusy,
    environments: context.trainingCatalog.environmentProfiles,
    onImport: context.onImportMedia,
    onImportLocal: context.onImportLocalMedia,
    pendingLocalMedia: context.workflow === "voice-training" ? null : context.pendingLocalMedia,
    onPendingLocalTrackChange: context.onPendingLocalTrackChange,
    onConfirmPendingLocalMedia: context.onConfirmPendingLocalMedia,
    onCancelPendingLocalMedia: context.onCancelPendingLocalMedia,
    onFinishGrowingMkv: context.onFinishGrowingMkv,
    onStartGrowingMkvDetailedStt: context.onStartGrowingMkvDetailedStt,
    onSetLocalCache: context.onSetLocalCache,
    onQueueTranscriptions: context.onQueueTranscriptions,
    onControlTranscriptions: context.onControlTranscriptions,
    onRemove: context.onRemoveAsset,
    onBatchAction: context.onBatchMediaAction,
    onRestore: context.onRestoreAsset,
    onReveal: context.onRevealAsset,
    onSetDisabled: context.onSetAssetDisabled,
    onSelect: context.onSelectAsset,
    onClearSelection: context.onClearMediaSelection,
    onSelectTrack: context.onSelectImportedTrack,
    onScriptSelectionChange: context.onScriptSelectionChange,
    selectedImportedTrackId: context.selectedImportedTrackId,
    onSendToTraining: context.onSendToTraining,
    onToggleTraining: context.onToggleTraining,
    onToggleTranscription: context.onToggleTranscription,
    onToggleImport: context.onToggleImport,
    onToggleDiarization: context.onToggleDiarization,
    selectedAssetId: context.selectedAssetId,
    workflow: context.workflow,
    sttEngines: context.sttEngines,
    asrAdapters: context.asrAdapters,
    speakers: context.trainingCatalog.speakers,
    onUpdateAnnotations: context.onUpdateAnnotations,
    onOpenObsRecording: context.onOpenObsRecording,
    onOpenObsTrack: context.onOpenObsTrack,
    selectedObsRecordingId: context.obsTimelineActive ? context.obsTimelineRecordingId : null,
    onObsArchiveReady: context.onObsArchiveReady,
  };
}

function workflowMediaAssets(context: StudioContext) {
  if (context.workflow !== "voice-training") return context.mediaAssets;
  const parents = new Set(context.mediaAssets.map((asset) => asset.sourceArchiveAssetId).filter(Boolean));
  const trainedParents = new Set(context.mediaAssets.filter((asset) => asset.sourceArchiveAssetId && asset.trainingSelected && !asset.deletedAt && !asset.disabled && asset.importSelected !== false).map((asset) => asset.sourceArchiveAssetId));
  return context.mediaAssets.filter((asset) => !asset.deletedAt && !asset.disabled &&
    (parents.has(asset.id) ? trainedParents.has(asset.id) : asset.trainingSelected === true));
}

export function ModuleRegistry({ id, context }: ModuleRegistryProps) {
  if ((id === "script" || id === "timeline") && context.workflow !== "voice-manipulator" && (context.selectedScriptAssetIds?.length ?? 0) > 1) {
    return <ModuleFrame title={id === "script" ? "Script" : "Timeline"}><p role="status">Đã chọn {context.selectedScriptAssetIds!.length} mục · chọn một footage để mở dữ liệu.</p></ModuleFrame>;
  }
  const pageAssets = workflowMediaAssets(context);
  const parentsWithTracks = new Set(context.mediaAssets.map((asset) => asset.sourceArchiveAssetId).filter((id): id is string => Boolean(id)));
  const parentsWithImportedTracks = new Set(context.mediaAssets.filter((asset) => asset.sourceArchiveAssetId && asset.importSelected !== false).map((asset) => asset.sourceArchiveAssetId));
  const workingAssets = pageAssets.filter((asset) => {
    if (asset.sourceArchiveAssetId) return asset.importSelected !== false;
    return parentsWithTracks.has(asset.id) ? parentsWithImportedTracks.has(asset.id) : asset.importSelected !== false;
  });
  switch (id) {
    case "library-panel":
      return <LibraryPanel onCollectionImported={context.onCollectionImported} onPrepareCollectionExport={context.onPrepareCollectionExport} {...mediaPoolProps(context)} onDeleteEnvironment={context.onDeleteEnvironment} onDeleteEnvironments={context.onDeleteEnvironments} onDeleteSpeaker={context.onDeleteSpeaker} onDeleteSpeakers={context.onDeleteSpeakers} onDeleteVoice={context.onDeleteVoice} onDeleteVoices={context.onDeleteVoices} voices={context.projectVoices} catalog={context.trainingCatalog} onCatalogChange={context.onCatalogChange} onSelectVoice={context.onVoiceChange} profileSchema={context.profileSchema} selectedVoice={context.selectedVoice} />;
    case "media-pool":
      return <MediaPool {...mediaPoolProps(context)} />;
    case "voice-vault":
      return <VoiceVault projectId={context.projectId} onCollectionImported={context.onCollectionImported} onPrepareCollectionExport={context.onPrepareCollectionExport} onDeleteEnvironment={context.onDeleteEnvironment} onDeleteEnvironments={context.onDeleteEnvironments} onDeleteSpeaker={context.onDeleteSpeaker} onDeleteSpeakers={context.onDeleteSpeakers} onDeleteVoice={context.onDeleteVoice} onDeleteVoices={context.onDeleteVoices} voices={context.projectVoices} assets={workingAssets} catalog={context.trainingCatalog} onCatalogChange={context.onCatalogChange} onSelectVoice={context.onVoiceChange} profileSchema={context.profileSchema} selectedVoice={context.selectedVoice} />;
    case "script": {
      const selectedAsset = workingAssets.find((asset) => asset.id === (context.selectedImportedTrackId ?? context.selectedAssetId));
      const selectedIds = context.selectedScriptAssetIds ?? [context.selectedImportedTrackId ?? context.selectedAssetId].filter((id): id is string => Boolean(id));
      const selectedTracks = [...new Map(selectedIds.flatMap((id) => {
        const children = workingAssets.filter((asset) => asset.sourceArchiveAssetId === id);
        return children.length ? children : workingAssets.filter((asset) => asset.id === id);
      }).map((asset) => [asset.id, asset])).values()];
      const singleOpen = selectedTracks.length === 1 && selectedTracks[0].id === selectedAsset?.id;
      const showSelectedFeed = selectedTracks.length > 0 && !singleOpen;
      const renderSources = showSelectedFeed ? (mode: "table" | "edit") => <ChannelScript viewMode={mode} onWordsChange={context.onAssetWordsChange} tracks={selectedTracks} speakers={context.trainingCatalog.speakers} onAssignWords={context.onAssignScriptWords}
          onSelectTrack={(id) => { const asset = workingAssets.find((item) => item.id === id); if (asset?.sourceArchiveAssetId) context.onSelectImportedTrack(id); else context.onSelectAsset(id); }}
          recordingId={context.obsTimelineActive ? context.obsTimelineRecordingId : null}
          selectedOverlap={context.obsOverlapSelection}
          onSelectOverlap={context.obsTimelineActive ? context.onObsArchivedOverlapSelect : undefined} /> : undefined;
      const parentFeed = renderSources?.("table") ?? null;
      // Pending recordings have no archived Media Pool asset yet, but the
      // selected recording itself still owns the live Script.
      const pendingObsSelected = context.obsTimelineActive && !context.selectedAssetId && Boolean(context.obsTimelineRecordingId);
      const liveFeed = context.workflow === "speech-to-text" && context.obsTimelineActive && !context.selectedImportedTrackId && !parentFeed && (pendingObsSelected || selectedTracks.some((asset) => asset.obsRecordingId))
        ? <ObsLiveLinkScript embedded speakers={context.trainingCatalog.speakers} error={context.obsTranscriptError} onSeek={context.onObsTranscriptSeek}
          onSelectOverlap={context.onObsOverlapSelect} selectedOverlap={context.obsOverlapSelection}
          playheadSeconds={context.obsPlayheadSeconds} recordingId={context.obsTimelineRecordingId} rows={context.obsTranscriptRows.filter((row) => (!context.obsTimelineRecordingId || row.recordingId === context.obsTimelineRecordingId) && (!context.obsSeekRequest?.selectOnly || row.channelId === context.obsSeekRequest.channelId))} />
        : null;
      return <ScriptEditor sourceDocuments={renderSources ? selectedTracks : undefined} renderSources={renderSources} onSourceDocumentsChange={(changes) => { if (context.onScriptDocumentsChange) context.onScriptDocumentsChange(changes); else changes.forEach((change) => context.onAssetWordsChange(change.assetId, change.words, change.text)); }} trackName={singleOpen && selectedAsset?.sourceArchiveAssetId ? selectedAsset.name.replace(/^OBS LiveLink · Channel (\d+)/, "Track $1") : undefined} onUndo={context.onScriptUndo} onRedo={context.onScriptRedo} key={context.selectedImportedTrackId ?? context.selectedAssetId ?? "none"} obsFeed={parentFeed ?? liveFeed} feedMode={parentFeed ? "channels" : "obs"} onSpeakerProfileChange={singleOpen && selectedAsset ? (speakerProfileId) => context.onAssignAssetSpeaker(selectedAsset.id, speakerProfileId) : undefined} speakerProfileId={selectedAsset?.speakerProfileIds?.[0] ?? null} readingCard={context.readingSession?.card ?? null} readingCardNumber={context.readingSession?.cardNumber ?? 0} readingCardTotal={context.readingSession?.cardTotal ?? 0} wordSelection={context.wordSelection} onWordSelectionChange={context.onWordSelectionChange} wordTimingNote={selectedAsset?.wordTimingNote} wordTimingQuality={selectedAsset?.wordTimingQuality} playbackAssetId={context.take?.id ?? null} footageName={singleOpen ? context.take?.name ?? null : parentFeed ? `${selectedTracks.length} track đã chọn` : null} emotionStyle={context.emotionStyle} aiReviewBusy={context.aiReviewBusy} aiReviewKey={context.aiReviewKey} aiReviewText={context.aiReviewText} canRunAiReview={renderSources ? selectedTracks.some((asset) => asset.transcriptionStatus === "complete" && Boolean(asset.text.trim())) : context.canRunAiReview} environments={context.trainingCatalog.environmentProfiles} isLiveTranscript={context.liveTranscriptActive} liveTranscriptText={context.liveTranscriptText} onChange={context.onScriptChange} onDeferredAction={context.onDeferredAction} onGenerate={context.onGenerate} onRunAiReview={context.onRunAiReview} onWordsChange={context.onWordsChange} speakers={context.trainingCatalog.speakers} value={parentFeed ? selectedTracks.map((asset) => asset.text).join("\n") : singleOpen || pendingObsSelected || context.liveTranscriptActive || context.readingSession ? context.script : ""} words={singleOpen ? context.take?.words : []} workflow={context.workflow} />;
    }
    case "control-rack":
      return <ControlRack gain={context.gain} onGainChange={context.onGainChange} onSpeedChange={context.onSpeedChange} speed={context.speed} environmentProfiles={context.trainingCatalog.environmentProfiles} environmentProfileId={context.trainingCatalog.settings.environmentProfileId} onEnvironmentProfileChange={(environmentProfileId) => context.onCatalogChange({ ...context.trainingCatalog, settings: { ...context.trainingCatalog.settings, environmentProfileId } })} />;
    case "recorder":
      return <Recorder readingSpeakers={context.trainingCatalog.speakers} readingPending={context.readingPending} onRetryReadingTake={context.onRetryReadingTake} onEndReadingSession={context.onEndReadingSession} onSkipCard={context.onSkipCard} onStartReadingSession={context.onStartReadingSession} readingBusy={context.readingBusy} readingPacks={context.readingPacks} readingSession={context.readingSession} projectLanguage={context.projectLanguage} projectName={context.projectName} projectId={context.projectId} onOpenObsAsset={context.onOpenObsAsset} onOpenObsRecording={context.onOpenObsRecording} onObsArchiveReady={context.onObsArchiveReady} onCaptureSourceChange={context.onObsTimelineSourceChange} onLiveTranscript={context.onLiveTranscript} onRecordingPreview={context.onRecordingPreview} onRecordingReady={context.onTakeChange} />;
    case "obs-capture":
      return <ObsCapture onImportReady={context.onObsImportReady} onOpenAsset={context.onOpenObsAsset} projectId={context.projectId} />;
    case "timeline": {
      if (context.workflow === "speech-to-text" && context.obsTimelineActive) {
        return <ObsLiveLinkTimeline onUndo={context.onScriptUndo} onRedo={context.onScriptRedo} onRecordingIdChange={context.onObsTimelineRecordingChange}
          wordSelection={context.wordSelection} onWordSelectionChange={context.onWordSelectionChange}
          speakers={context.trainingCatalog.speakers} onAssetWordsChange={context.onAssetWordsChange} onAssetTimelineStateChange={context.onAssetTimelineStateChange}
          onPlayheadChange={context.onObsPlayheadChange}
          assets={context.mediaAssets} onCutsChange={context.onObsTimelineCutsChange}
          visibleAssetId={context.selectedImportedTrackId}
          projectId={context.projectId} projectName={context.projectName} requestedRecordingId={context.obsTimelineRecordingId}
          onOverlapSelect={context.onObsOverlapSelect} selectedOverlap={context.obsOverlapSelection}
          seekRequest={context.obsSeekRequest} transcriptRows={context.obsTranscriptRows} />;
      }
      const importedParent = workingAssets.find((asset) => asset.id === context.selectedAssetId);
      const importedTracks = workingAssets.filter((asset) => asset.sourceArchiveAssetId === importedParent?.id)
        .sort((a, b) => (a.sourceArchiveStreamIndex ?? 0) - (b.sourceArchiveStreamIndex ?? 0));
      if (context.workflow === "speech-to-text" && importedParent && importedTracks.length > 0) {
        return <ImportedMultitrackTimeline onUndo={context.onScriptUndo} onRedo={context.onScriptRedo} key={importedParent.id} parent={importedParent} tracks={importedTracks}
          speakers={context.trainingCatalog.speakers} onAssetWordsChange={context.onAssetWordsChange} onAssetTimelineStateChange={context.onAssetTimelineStateChange}
          selectedTrackId={context.selectedImportedTrackId} singleTrackView={Boolean(context.selectedImportedTrackId)} onSelectTrack={context.onSelectImportedTrack} wordSelection={context.wordSelection}
          onCutsChange={context.onObsTimelineCutsChange} readOnly={context.readOnlyAsset} />;
      }
      // Voice Manipulator shows only what the app generated, and none of the
      // footage's own cuts, gain or word edits: those belong to the file open in
      // Speech to Text, and applied here they changed the wrong audio.
      const generatedOnly = context.workflow === "voice-manipulator";
      const selectedAsset = generatedOnly ? undefined : workingAssets.find((asset) => asset.id === context.selectedAssetId);
      const noop = () => undefined;
      return <Timeline onUndo={context.onScriptUndo} onRedo={context.onScriptRedo} workingRange={selectedAsset?.workingRange ?? null} cutPoints={selectedAsset?.cutPoints ?? []} onEditStateChange={generatedOnly ? undefined : context.onTimelineStateChange} wordSelection={context.wordSelection} onWordSelectionChange={context.onWordSelectionChange} gain={context.gain} gainKeyframes={selectedAsset?.gainKeyframes ?? []} onGainChange={context.onGainChange} onGainKeyframesChange={generatedOnly ? noop : (keyframes) => context.onTimelineEditsChange(selectedAsset?.removedRanges ?? [], keyframes)} onRemovedRangesChange={generatedOnly ? noop : context.onTimelineEditsChange} onWordsChange={generatedOnly ? undefined : context.onWordsChange} emptyNote={generatedOnly ? { title: "Chưa có giọng nào được tạo", hint: "Nhập lời thoại ở Script rồi bấm Tạo voice; file sẽ hiện ở đây" } : undefined} recordingPreview={generatedOnly ? null : context.recordingPreview} removedRanges={selectedAsset?.removedRanges ?? []} speakers={context.trainingCatalog.speakers} take={generatedOnly || selectedAsset ? context.take : null} />;
    }
    case "voice-patch":
      return <VoicePatch hasTake={Boolean(context.take)} />;
    case "training-job":
      return <TrainingJob activityEvents={context.activityEvents} activityTasks={context.activityTasks} adapters={context.asrAdapters} batch={context.trainingBatch} busy={context.datasetBusy} onStop={context.onStopTraining} onRunsChanged={context.onTrainingOutputsChanged} projectId={context.projectId} runs={context.trainingRuns} progressByRun={context.trainingProgressByRun} selectedMode={selectedTrainingModel(context.trainingModels, context.trainingCatalog.settings)?.mode ?? null} speakers={context.trainingCatalog.speakers} targetSpeakerIds={context.trainingCatalog.settings.targetSpeakerIds} />;
    case "pipeline-dashboard":
      return <PipelineDashboard assets={workingAssets} onOpenTraining={() => context.onSelectPage("voice-training")} onSelectAsset={context.onSelectAsset} readiness={context.datasetReadiness} runs={context.trainingRuns} speakers={context.trainingCatalog.speakers} />;
    case "project-overview":
      return <ProjectOverview assets={workingAssets} model={selectedTrainingModel(context.trainingModels, context.trainingCatalog.settings)} onSelectAsset={(assetId) => { context.onSelectAsset(assetId); context.onSelectPage("speech-to-text"); }} readiness={context.datasetReadiness} runs={context.trainingRuns} settings={context.trainingCatalog.settings} speakers={context.trainingCatalog.speakers} />;
    case "dataset-readiness":
      return <DatasetReadinessPanel busy={context.datasetBusy} onCompile={context.onCompileDataset} readiness={context.datasetReadiness} speakers={context.trainingCatalog.speakers} />;
    case "speaker-isolation":
      return <SpeakerIsolation asset={workingAssets.find((asset) => asset.id === context.selectedAssetId) ?? null} onAssign={(assignments) => context.onUpdateDiarizationAssignments(context.selectedAssetId ?? "", assignments)} onRun={context.onRunDiarization} onStop={context.onStopDiarization} batchBusy={workingAssets.some((asset) => asset.diarizationStatus === "queued" || asset.diarizationStatus === "processing")} speakers={context.trainingCatalog.speakers} words={context.take?.words ?? []} />;
    case "speaker-emotion":
      return <SpeakerEmotion asset={workingAssets.find((asset) => asset.id === context.selectedAssetId) ?? null} speakers={context.trainingCatalog.speakers} words={context.take?.words ?? []} />;
    case "train":
      return <Train assets={workingAssets} busy={context.datasetBusy} catalog={context.trainingCatalog} onCatalogChange={context.onCatalogChange} onStart={context.onStartTrainingRun} readiness={context.datasetReadiness} trainingModels={context.trainingModels} trainingRuntime={context.trainingRuntime} />;
    case "recent-takes":
      return <RecentTakes />;
    case "voice-output":
      return <VoiceOutputPanel activeOutputId={context.activeOutputId} onDelete={context.onDeleteVoiceOutput} onDeleteMany={context.onDeleteVoiceOutputs} onExport={context.onExportVoiceOutput} onOpen={context.onOpenVoiceOutput} outputs={context.voiceOutputs} speakers={context.trainingCatalog.speakers} />;
    case "voice-generator":
      return <VoiceGenerator busy={context.generating} category={context.voiceCategory} generators={context.voiceGenerators} job={context.voiceScriptJob} onStop={context.onStopGeneration} onGenerate={context.onGenerate} onOpenTraining={() => context.onSelectPage("voice-training")} onParametersChange={context.onGeneratorParametersChange} onCategoryChange={context.onVoiceCategoryChange} parameters={context.generatorParameters} projectId={context.projectId} rows={context.voiceScriptRows} speakers={context.trainingCatalog.speakers} voices={voicesInCategory(context.projectVoices, context.voiceCategory)} />;
    case "voice-script": {
      const output = context.voiceOutputs.find((item) => item.id === context.activeOutputId) ?? null;
      return <VoiceScript activityTasks={context.activityTasks} busy={context.generating} category={context.voiceCategory} defaultSpeakerId={context.selectedVoice || null} job={context.voiceScriptJob} onExport={output ? (mode) => context.onExportVoiceOutput(output, mode) : undefined} onOpenTraining={() => context.onSelectPage("voice-training")} onRead={context.onGenerate} onRowsChange={context.onVoiceScriptRowsChange} onWordSelectionChange={context.onWordSelectionChange} output={output} playbackId={context.take?.id ?? null} rows={context.voiceScriptRows} speakers={context.trainingCatalog.speakers} voices={voicesInCategory(context.projectVoices, context.voiceCategory)} wordSelection={context.wordSelection} />;
    }
    case "sound-reactor-input":
    case "sound-reactor-output": {
      const status = context.changerStatus;
      const running = status?.state === "running";
      const input = id === "sound-reactor-input";
      const engine = context.voiceChangers.find((item) => item.id === status?.engineId);
      const voice = context.projectVoices.find((item) => item.id === status?.voiceId);
      return <SoundReactor active={running} caption={running ? input ? `Micro thật · ${status?.sampleRate ?? "—"} Hz` : `${engine?.label ?? "Engine"}${voice ? ` · ${voice.name}` : ""}` : undefined} eyebrow={input ? "GIỌNG GỐC" : "SAU KHI ĐỔI GIỌNG"} levelDb={input ? status?.inputLevelDb ?? -120 : status?.outputLevelDb ?? -120} peakDb={input ? status?.inputPeakDb ?? -120 : status?.outputPeakDb ?? -120} spectrum={input ? status?.inputSpectrum ?? [] : status?.outputSpectrum ?? []} title={input ? "Sound Reactor · gốc" : "Sound Reactor · đã đổi"} tone={input ? "input" : "output"} />;
    }
    case "voice-input":
      return <VoiceInput busy={context.changerBusy} engines={context.voiceChangers} onRefresh={context.onRefreshChanger} onSettingsChange={context.onChangerSettingsChange} onStart={context.onStartChanger} onStop={context.onStopChanger} preflight={context.changerPreflight} settings={context.changerSettings} speakerId={context.selectedVoice || null} speakers={context.trainingCatalog.speakers} status={context.changerStatus} voices={context.projectVoices} />;
    case "changer-timeline": {
      const recording = context.changerRecordings.find((item) => item.id === context.take?.id) ?? null;
      const status = context.changerStatus;
      return <Timeline gain={context.gain} leadingActions={<ChangerRecordControls activeRecordingId={recording?.id ?? null} busy={context.changerBusy} onDelete={context.onDeleteChangerRecording} onDeleteMany={context.onDeleteChangerRecordings} onOpen={context.onOpenChangerRecording} onRecord={context.onStartChangerRecording} onStopRecording={context.onStopChangerRecording} recordings={context.changerRecordings} status={status} />} liveCaption={status?.recording ? "REC · MICRO THẬT (L) + GIỌNG ĐÃ ĐỔI (R)" : null} onGainChange={context.onGainChange} speakers={context.trainingCatalog.speakers} take={recording ? context.take : null} />;
    }
    case "manipulator-library":
      return <ManipulatorLibrary projectId={context.projectId} onCollectionImported={context.onCollectionImported} onPrepareCollectionExport={context.onPrepareCollectionExport} onDeleteEnvironment={context.onDeleteEnvironment} onDeleteEnvironments={context.onDeleteEnvironments} onDeleteSpeaker={context.onDeleteSpeaker} onDeleteSpeakers={context.onDeleteSpeakers} onDeleteVoice={context.onDeleteVoice} onDeleteVoices={context.onDeleteVoices} voices={context.projectVoices} activeOutputId={context.activeOutputId} assets={workingAssets} catalog={context.trainingCatalog} environments={context.trainingCatalog.environmentProfiles} onCatalogChange={context.onCatalogChange} onDeleteOutput={context.onDeleteVoiceOutput} onDeleteOutputs={context.onDeleteVoiceOutputs} onExportOutput={context.onExportVoiceOutput} onOpenOutput={context.onOpenVoiceOutput} onSelectVoice={context.onVoiceChange} outputs={context.voiceOutputs} profileSchema={context.profileSchema} selectedVoice={context.selectedVoice} speakers={context.trainingCatalog.speakers} />;
  }
}
