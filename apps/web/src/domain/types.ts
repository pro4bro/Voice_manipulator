export type WorkspacePage = "dashboard" | "speech-to-text" | "voice-training" | "voice-manipulator" | "voice-changer";
export type ThemeMode = "light" | "dark";
export type RuntimeAction = "start" | "stop" | "restart";

export type RuntimeServiceState = "running" | "stopped" | "foreign";

export interface RuntimeProcess {
  role: "controller" | "api" | "studio";
  label: string;
  port: number;
  state: RuntimeServiceState;
  pid: number | null;
}

export interface RuntimeWorkloadState {
  overall: "running" | "stopped" | "partial" | "busy" | "blocked";
  api: RuntimeServiceState;
  studio: RuntimeServiceState;
  busy: boolean;
  activeAction: RuntimeAction | null;
  lastAction: RuntimeAction | null;
  lastError: string | null;
  processes: RuntimeProcess[];
  updatedAt: string;
}
export type EmotionLabel = "exciting" | "funny" | "good" | "normal" | "low-energy" | "sad" | "cry" | "angry" | "critical" | "mix";
export type MediaTranscriptionStatus = "queued" | "processing" | "reviewing" | "complete" | "skipped" | "paused" | "not-applicable" | "error";
export type AIReviewStatus = "pending" | "complete" | "skipped" | "error";
export type MediaDiarizationStatus = "idle" | "queued" | "processing" | "complete" | "requires-setup" | "error";
export type WordTimingQuality = "unverified" | "source" | "partial" | "needs-alignment";
/** How an asset's audio and transcript came to exist. Provenance, not a quality score. */
export type CaptureTier = "guided" | "record" | "import";
export type ReadingPassageKind = "coverage" | "drill" | "emotion";

export interface MediaTranscriptionProgress {
  id: string;
  transcriptionStatus: MediaTranscriptionStatus;
  transcriptionProgress: number;
  transcriptionError: string | null;
}

export interface MediaDiarizationProgress {
  id: string;
  diarizationStatus: MediaDiarizationStatus;
  diarizationProgress: number;
  diarizationError: string | null;
}

export type ManipulatorMode =
  | "voice-over"
  | "voice-isolator"
  | "voice-changer"
  | "voice-dubber"
  | "voice-patch";

export type ModuleId =
  | "library-panel"
  | "media-pool"
  | "voice-vault"
  | "script"
  | "control-rack"
  | "recorder"
  | "timeline"
  | "voice-patch"
  | "recent-takes"
  | "voice-output"
  | "voice-script"
  | "manipulator-library"
  | "sound-reactor-input"
  | "sound-reactor-output"
  | "voice-input"
  | "changer-timeline"
  | "training-job"
  | "project-overview"
  | "speaker-isolation"
  | "speaker-emotion"
  | "train"
  | "voice-generator"
  | "pipeline-dashboard"
  | "dataset-readiness";

export interface Project {
  id: string;
  name: string;
  projectPath: string;
  location: string | null;
  language: string | null;
  accent: string | null;
  sampleRate: number | null;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
  lastPage: WorkspacePage;
}

export interface ProjectCreate {
  name: string;
  location: string;
  language?: string | null;
  accent?: string | null;
  sampleRate?: number | null;
  purpose?: string | null;
}

export interface SystemPaths {
  defaultProjectLocation: string;
}

export interface StudioWord {
  text: string;
  start: number;
  end: number;
  /** Recognition confidence; it is not by itself proof of acoustic alignment. */
  confidence?: number;
  /** Processor that measured this interval. Missing means legacy/unverified data. */
  timingSource?: "faster-whisper-dtw" | string;
  /** Structural trust for this exact interval; false words remain visible with a warning. */
  timingTrusted?: boolean;
  segmentIndex?: number;
  realtime?: string;
  accurate?: string;
  corrected?: string;
  reviewState?: "pending" | "confirmed" | "manual";
  selectedVariant?: "realtime" | "accurate" | "corrected" | "manual" | null;
  /** Stable diarization label (speaker-1, speaker-2, …); independent from a user profile. */
  diarizationSpeakerId?: string | null;
  /** Manual Script override used when a word is moved to another diarized row. */
  manualDiarizationSpeakerId?: string | null;
  speakerId?: string | null;
  environmentProfileIds?: string[];
  emotion?: EmotionLabel | null;
}

export interface StudioAudioItem {
  id: string;
  name: string;
  url: string;
  duration: number;
  sampleRate: number;
  text: string;
  kind: string;
  words: StudioWord[];
  voiceId?: string;
  voiceName?: string;
  emotion?: string;
  speed?: number;
}

export interface StudioJobResult {
  item: StudioAudioItem;
  elapsed: number;
}

export type MediaRevisionSource = "stt" | "ai" | "user" | "record" | "import";

export interface MediaRevision {
  id: string;
  source: MediaRevisionSource;
  text: string;
  createdAt: string;
}

export interface TranscriptReviewResult {
  asset: ProjectMediaAsset;
  reviewedText: string;
  status: AIReviewStatus;
  error: string | null;
}

export interface TimelineEditRange {
  id: string;
  start: number;
  end: number;
}

export interface TimelineGainKeyframe {
  id: string;
  time: number;
  gainDb: number;
  source?: "auto-calibration" | "manual";
}

export interface ProjectMediaAsset {
  id: string;
  /** Set while the footage sits in the project's recycle bin. */
  deletedAt?: string | null;
  /** Parked: still playable, but kept out of every batch. */
  disabled?: boolean;
  name: string;
  sourceExtension: string;
  mediaKind: "audio" | "video";
  sourcePath: string;
  analysisPath?: string | null;
  hasExternalSource?: boolean;
  localCacheEnabled?: boolean;
  localCacheUpdatedAt?: string | null;
  removedRanges?: TimelineEditRange[];
  gainKeyframes?: TimelineGainKeyframe[];
  studioItemId: string | null;
  url: string | null;
  duration: number;
  sampleRate: number | null;
  audioCodec?: string | null;
  videoCodec?: string | null;
  text: string;
  words: StudioWord[];
  wordTimingQuality?: WordTimingQuality;
  wordTimingNote?: string | null;
  wordTimingTrustVersion?: number;
  origin: "import" | "record" | "generate";
  status?: "ready" | "no-audio" | "error";
  transcriptionStatus: MediaTranscriptionStatus;
  transcriptionSelected: boolean;
  transcriptionProgress?: number;
  transcriptionError: string | null;
  diarizationStatus?: MediaDiarizationStatus;
  diarizationProgress?: number;
  diarizationError?: string | null;
  diarizationSpeakerAssignments?: Record<string, string | null>;
  aiReviewStatus: AIReviewStatus;
  trainingSelected: boolean;
  captureTier: CaptureTier;
  speakerProfileIds: string[];
  environmentProfileIds: string[];
  emotion: EmotionLabel;
  createdAt: string;
  updatedAt: string;
  revisions: MediaRevision[];
}

export interface SpeakerProfile {
  id: string;
  name: string;
  language: string | null;
  languageId: string | null;
  region: string | null;
  age: string | null;
  gender: string;
  attributes: Record<string, string>;
  color: string;
  /** The voice owner's recorded permission; required to be a Voice Changer target. */
  voiceConsent?: VoiceConsent | null;
  createdAt: string;
}

export interface VoiceConsent {
  grantedBy: string;
  note: string | null;
  confirmedAt: string;
}

export interface EnvironmentNoiseProfile {
  id: string;
  name: string;
  assetIds: string[];
  attributes: Record<string, string>;
  createdAt: string;
}

export interface TrainingSettings {
  targetSpeakerIds: string[];
  maxSteps: number;
  checkpointEvery: number;
  batchSize: number;
  learningRate: number;
  denoiseBeforeTraining: boolean;
  learnEnvironmentNoise: boolean;
  environmentProfileId: string | null;
  /** The option chosen in Model Training. */
  modelId?: string | null;
  /** Only the values changed per option; everything else follows its descriptor. */
  modelParameters?: Record<string, Record<string, TrainingParameterValue>>;
}

export interface TrainingCatalog {
  speakers: SpeakerProfile[];
  environmentProfiles: EnvironmentNoiseProfile[];
  settings: TrainingSettings;
  updatedAt: string;
}

export interface ProfileChoice {
  id: string;
  label: string;
  hint?: string | null;
}

export interface ProfileFacet {
  id: string;
  label: string;
  options: ProfileChoice[];
  hint?: string | null;
}

export interface EngineProfileSchema {
  engineId: string;
  engineName: string;
  languages: ProfileChoice[];
  facets: ProfileFacet[];
}

export interface AIReviewPreferences {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  apiKeyConfigured: boolean;
}

export type EmotionColorMode = "gradient" | "per-emotion";

export interface DiarizationPreferences {
  enabled: boolean;
  model: string;
  huggingfaceToken: string | null;
  huggingfaceTokenConfigured: boolean;
}

export interface SpeakerSimilarityPreferences {
  embedderId: "pyannote-community-1" | "wespeaker-resnet34-lm";
}

export interface EmotionStylePreferences {
  colorMode: EmotionColorMode;
  gradientStart: string;
  gradientEnd: string;
  emotionColors: Record<string, string>;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
}

export interface AppPreferences {
  aiReview: AIReviewPreferences;
  diarization: DiarizationPreferences;
  speakerSimilarity: SpeakerSimilarityPreferences;
  emotionStyle: EmotionStylePreferences;
}

export interface MediaImportChoice {
  file: File;
  transcribe: boolean;
}

export interface WaveformPoint {
  min: number;
  max: number;
}

export interface RecordingWaveformPreview {
  active: boolean;
  duration: number;
  samples: WaveformPoint[];
}

export interface ProjectMediaImportResult {
  asset: ProjectMediaAsset;
  item: StudioAudioItem | null;
  elapsed: number;
}

export interface EngineStatus {
  id: string;
  name: string;
  path: string;
  installed: boolean;
  revision: string | null;
  branch: string | null;
  dirty: boolean;
  capabilities: string[];
}

export interface WorkspaceManifest {
  page: WorkspacePage;
  label: string;
  eyebrow: string;
  modules: ModuleId[];
  columns: {
    left: ModuleId[];
    center: ModuleId[];
    right: ModuleId[];
    bottom: ModuleId[];
  };
  modes: ManipulatorMode[];
  plannedModes: ManipulatorMode[];
}
export interface SystemMetrics {
  cpuPercent: number;
  gpuPercent: number | null;
  gpuMemoryUsedMb: number | null;
  gpuMemoryTotalMb: number | null;
  memoryPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  networkMbps: number;
  sampledAt: string;
}

export interface SystemLog {
  files: string[];
  text: string;
}

export interface ReadingCard {
  id: string;
  text: string;
  tags: string[];
  wordCount: number;
  /** Estimated from a fixed reading rate. Only a recorded take knows the real duration. */
  estimatedSeconds: number;
}

export interface ReadingPassage {
  id: string;
  kind: ReadingPassageKind;
  emotion: EmotionLabel;
  title: string;
  direction: string;
  /** Who the passage suits. Empty means no restriction, not no audience. */
  regions: string[];
  genders: string[];
  ageRanges: string[];
  source: "shipped" | "authored";
  cards: ReadingCard[];
  wordCount: number;
  estimatedSeconds: number;
}

export interface ReadingPackSummary {
  packId: string;
  language: string;
  languageName: string;
  title: string;
  version: number;
  license: string;
  passageCount: number;
  cardCount: number;
  wordCount: number;
  estimatedSeconds: number;
  emotions: EmotionLabel[];
}

export interface ReadingPack extends ReadingPackSummary {
  passages: ReadingPassage[];
}

export interface ReadingAudienceOption {
  id: string;
  label: string;
}

export interface ReadingAudienceVocabulary {
  genders: ReadingAudienceOption[];
  ageRanges: ReadingAudienceOption[];
  regionsByLanguage: Record<string, ReadingAudienceOption[]>;
}

export interface ReadingPassageDraft {
  language: string;
  languageName: string;
  kind: ReadingPassageKind;
  emotion: EmotionLabel;
  title: string;
  direction: string;
  regions: string[];
  genders: string[];
  ageRanges: string[];
  cards: Array<{ text: string; tags: string[] }>;
}

export type DatasetSplit = "train" | "dev";
export type TextProvenance = "script" | "stt" | "user";

export interface DatasetRejection {
  assetId: string;
  assetName: string;
  reason: string;
  detail: string;
}

export interface ScriptValidation {
  assetId: string;
  expectedWords: number;
  heardWords: number;
  matched: number;
  omissions: string[];
  insertions: string[];
  substitutions: Array<[string, string]>;
  matchRatio: number;
}

/** One footage file as the project overview shows it. */
export interface DatasetFileSummary {
  assetId: string;
  name: string;
  extension: string;
  mediaKind: string;
  audioCodec: string | null;
  sampleRate: number | null;
  duration: number;
  bytes: number;
  origin: string;
  trainingSelected: boolean;
  transcriptionStatus: string;
  speakerProfileIds: string[];
  emotion: string;
  segments: number;
  secondsBySpeaker: Record<string, number>;
  secondsByEmotion: Record<string, number>;
  rejection: string | null;
}

export interface DatasetReadiness {
  selectedAssets: number;
  readyAssets: number;
  segments: number;
  totalSeconds: number;
  speakerProfileIds: string[];
  segmentsByTier: Record<string, number>;
  secondsByEmotion: Record<string, number>;
  secondsBySpeaker?: Record<string, number>;
  secondsDroppedUnassigned?: number;
  secondsDroppedOverlap?: number;
  rejections: DatasetRejection[];
  scriptValidations: ScriptValidation[];
  /** Every footage file of the project; older APIs send none. */
  files?: DatasetFileSummary[];
}

export interface DatasetStats {
  segments: number;
  trainSegments: number;
  devSegments: number;
  totalSeconds: number;
  secondsByEmotion: Record<string, number>;
  segmentsByTier: Record<string, number>;
  secondsBySpeaker: Record<string, number>;
}

export interface DatasetManifest {
  version: number;
  id: string;
  createdAt: string;
  sourceAssetIds: string[];
  rejections: DatasetRejection[];
  stats: DatasetStats;
}

export type TrainingStepId =
  | "provision" | "resolve-model" | "read-manifest" | "write-jsonl"
  | "tokenize" | "load-model" | "train" | "checkpoint" | "publish";

export type TrainingRunStatus =
  | "pending" | "running" | "interrupted" | "cancelled" | "failed" | "complete";

export interface TrainingCheckpoint {
  step: number;
  path: string;
  bytes: number;
  createdAt: string;
}

export interface TrainingRun {
  version: number;
  id: string;
  projectId: string;
  manifestId: string;
  status: TrainingRunStatus;
  stepId: TrainingStepId;
  globalStep: number;
  emotion: EmotionLabel;
  speakerProfileId: string | null;
  /** Runs started together for several voice targets share a batch. */
  batchId?: string | null;
  batchIndex?: number;
  batchSize?: number;
  checkpoints: TrainingCheckpoint[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  config: { modelId?: string | null; parameters?: Record<string, TrainingParameterValue>; engine?: string; mode?: string; steps: number; saveSteps: number; learningRate: number; loraR: number };
}

export type TrainingParameterValue = string | number | boolean | null;
export type TrainingParameterKind = "int" | "float" | "text" | "bool" | "choice";

/** One knob of one training model, keyed by the name its own trainer reads. */
export interface TrainingParameterSpec {
  key: string;
  label: string;
  group: string;
  kind: TrainingParameterKind;
  default: TrainingParameterValue;
  /** Value in the model authors' published command or config, when it sets one. */
  recipe?: TrainingParameterValue;
  /** Value the trainer uses when the flag is left out. */
  codeDefault?: TrainingParameterValue;
  source?: string | null;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  options: { value: string | number | boolean; label: string }[];
  unit?: string | null;
  help?: string | null;
  nullable: boolean;
  editable: boolean;
  advanced: boolean;
  runField?: string | null;
}

/** A Model Training option, read from a descriptor file by the API. */
export interface TrainingModelOption {
  id: string;
  label: string;
  family: string;
  engine: string;
  mode: string;
  description: string;
  order: number;
  /** clone: imitates a reference clip, no training. train: changes weights. */
  category?: "clone" | "train";
  runnable: boolean;
  blockedReason?: string | null;
  repository: { root: string; path: string; entrypoint: string; recipe?: string | null; url?: string | null; revision?: string | null };
  dataFormat?: string | null;
  notes: string[];
  parameters: TrainingParameterSpec[];
  origin: "shipped" | "local";
  installed: boolean;
  available: boolean;
  status: string;
}

/** A voice a Speaker Profile can speak with, made by Voice Training. */
export interface ProjectVoice {
  id: string;
  name: string;
  speakerProfileId: string;
  engine: string;
  /** clone: a reference clip only, no training. lora: a trained adapter on top. */
  /** vc: an RVC voice-conversion model for Voice Changer; modelPath is its weights, adapterPath its index. */
  kind: "clone" | "lora" | "full" | "vc";
  modelId: string | null;
  baseModel: string;
  referenceAudio: string;
  referenceText: string;
  referenceSeconds: number;
  referenceSegmentId: string | null;
  adapterPath: string | null;
  modelPath?: string | null;
  language: string | null;
  sourceRunId: string | null;
  /** Aggregate awaiting or carrying the identity-similarity publication gate. */
  modelSetId?: string | null;
  createdAt: string;
}

export interface VoiceModelSetMember {
  voiceId: string;
  role: "anchor" | "neutral" | "emotion";
  emotion: EmotionLabel;
  sourceRunId: string | null;
}

export interface SpeakerSimilarityGateEvidence {
  protocolVersion: number;
  embedderId: string;
  embedderRevision: string;
  threshold: number;
  calibrated: boolean;
  metric: "cosine-similarity";
  protocol: string;
  scoresByVoiceId: Record<string, number>;
  candidateOutputIdsByVoiceId: Record<string, string>;
  scorePassed: boolean;
  passed: boolean;
  decisionReason: "passed" | "below-threshold" | "threshold-unmeasured";
  measuredAt: string;
}

export interface SpeakerEmbedderInfo {
  id: string;
  label: string;
  modelId: string;
  revision: string;
  threshold: number;
  calibrated: boolean;
  available: boolean;
  status: string;
}

export interface VoiceModelSet {
  id: string;
  name: string;
  speakerProfileId: string;
  generationFamily: string;
  anchorVoiceId: string;
  anchorSegmentId: string;
  members: VoiceModelSetMember[];
  voiceIds: string[];
  lineage: {
    manifestId: string;
    manifestHash: string;
    engine: string;
    engineRevision: string;
    modelId: string | null;
    baseModel: string;
    config: TrainingRun["config"];
    segmentCount: number;
    sourceRunIds: string[];
  };
  status: "pending-gate" | "published" | "rejected";
  gate: SpeakerSimilarityGateEvidence | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

/** A speech-recognition adapter trained in this project; offered as an STT choice. */
export interface ProjectAsrAdapter {
  id: string;
  name: string;
  engine: string;
  baseModel: string;
  adapterPath: string;
  speakerProfileId: string | null;
  sourceRunId: string | null;
  createdAt: string;
}

/** Generated speech, kept in its own store rather than in Media Pool. */
export interface VoiceOutput {
  id: string;
  name: string;
  text: string;
  voiceId: string;
  voiceName: string;
  speakerProfileId: string;
  engine: string;
  generatorId: string;
  parameters: Record<string, TrainingParameterValue>;
  duration: number;
  sampleRate: number;
  audioPath: string;
  /** Timed on the generated audio, in the same shape as footage words. */
  words?: StudioWord[];
  wordTimingQuality?: WordTimingQuality | null;
  wordTimingNote?: string | null;
  /** One per Script row that was read, in order. */
  segments?: VoiceOutputSegment[];
  createdAt: string;
}

export interface VoiceOutputSegment {
  rowId: string;
  voiceId: string;
  voiceName: string;
  speakerProfileId: string;
  engine: string;
  generatorId: string;
  text: string;
  start: number;
  end: number;
  clip?: string | null;
}

export interface AudioDeviceInfo {
  index: number;
  name: string;
  hostApi: string;
  maxInputChannels: number;
  maxOutputChannels: number;
  defaultSampleRate: number;
  virtualCable: boolean;
}

export interface VoiceChangerPreflight {
  runtimeReady: boolean;
  runtimePython: string | null;
  missing: string[];
  devices: AudioDeviceInfo[];
  deviceError: string | null;
  endpoints: string[];
  virtualCable: string | null;
  gpuHolder: string | null;
}

export interface VoiceChangerStatus {
  state: "idle" | "running" | "error";
  projectId: string | null;
  engineId: string | null;
  voiceId: string | null;
  sampleRate: number | null;
  blockMs: number | null;
  algorithmicLatencyMs: number | null;
  deviceLatencyMs: number | null;
  processingMs?: number | null;
  inputLevelDb: number;
  inputPeakDb: number;
  outputLevelDb: number;
  outputPeakDb: number;
  inputSpectrum: number[];
  outputSpectrum: number[];
  underruns: number;
  overruns: number;
  recording: boolean;
  recordingSeconds: number;
  outputs: Array<{ role: "virtual" | "speaker"; device: number; sampleRate: number }>;
  error: string | null;
  startedAt: string | null;
}

export interface VoiceChangerRecording {
  id: string;
  name: string;
  engineId: string;
  voiceId: string | null;
  voiceName: string | null;
  speakerProfileId: string | null;
  duration: number;
  sampleRate: number;
  channels: number;
  delayMs: number;
  refinedDelayMs: number | null;
  audioPath: string;
  parameters: Record<string, TrainingParameterValue>;
  createdAt: string;
}

/** What the Voice Input module is set to; devices belong to this machine, not a project. */
export interface VoiceChangerSettings {
  engineId: string | null;
  voiceId: string | null;
  inputDevice: number | null;
  virtualDevice: number | null;
  speakerDevice: number | null;
  monitor: boolean;
  /** Which PortAudio host API the device lists show; WASAPI has the lowest latency. */
  hostApi?: string | null;
  /** Names alongside indices: PortAudio renumbers devices as they come and go. */
  inputDeviceName?: string | null;
  virtualDeviceName?: string | null;
  speakerDeviceName?: string | null;
  parameters: Record<string, Record<string, TrainingParameterValue>>;
}

/** A row of the typed Script in Voice Manipulator. */
export interface VoiceScriptRow {
  id: string;
  speakerProfileId: string | null;
  voiceId: string | null;
  text: string;
}

export interface VoiceScriptJob {
  id: string;
  projectId: string;
  status: "running" | "complete" | "failed";
  total: number;
  done: number;
  reused: number;
  currentRowId: string | null;
  message: string | null;
  output: VoiceOutput | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface TrainingProgressLine {
  at: string;
  stepId: TrainingStepId;
  message: string;
  globalStep: number | null;
  loss: number | null;
  devLoss: number | null;
  learningRate: number | null;
  stepsPerSecond: number | null;
  vramMb: number | null;
  done: number | null;
  total: number | null;
  /** What a person reading the log back should notice first. Older journals have none. */
  level?: TrainingLogLevel;
}

export type TrainingLogLevel = "info" | "warning" | "error";

/** One line of the app's own log, from any part of it. */
export interface ActivityEvent {
  seq: number;
  at: string;
  source: string;
  level: TrainingLogLevel;
  message: string;
  /** How many times in a row this same line arrived; 1 means once. */
  repeat: number;
  taskId?: string | null;
}

/** A piece of work in flight, as the status bar shows it. */
export interface ActivityTask {
  id: string;
  kind: string;
  label: string;
  detail: string;
  status: "running" | "complete" | "failed" | "cancelled";
  fraction: number | null;
  etaSeconds: number | null;
  projectId?: string | null;
  error?: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string | null;
  seconds?: number | null;
}

export interface ActivitySnapshot {
  seq: number;
  events: ActivityEvent[];
  tasks: ActivityTask[];
}

export interface OwnedItem {
  id: string;
  name: string;
}

/** What deleting a run takes with it. */
export interface TrainingRunFootprint {
  runId: string;
  bytes: number;
  voices: OwnedItem[];
  asrAdapters: OwnedItem[];
}

/** Everything a run wrote: its journal and the engine's own output. */
export interface TrainingRunLog {
  runId: string;
  journal: TrainingProgressLine[];
  processLog: string;
  processLogBytes: number;
  truncated: boolean;
}

export interface TrainingRuntimePackage {
  name: string;
  installed: boolean;
  wheelPath: string | null;
}

export interface TrainingRuntimeReport {
  root: string;
  exists: boolean;
  python: string | null;
  packages: TrainingRuntimePackage[];
  cachedWheels: string[];
  ready: boolean;
  interpreterTag: string;
  wheelTagMismatch: string[];
}

export interface GpuLeaseHolder {
  token: string;
  label: string;
  pid: number;
  acquiredAt: string;
  heartbeatAt: string;
}
