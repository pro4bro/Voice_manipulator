export type WorkspacePage = "speech-to-text" | "voice-training" | "voice-manipulator";
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
  | "training-job"
  | "speaker-isolation"
  | "speaker-emotion"
  | "train"
  | "voice-generator";

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
  origin: "import" | "record";
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
  createdAt: string;
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

export interface DatasetReadiness {
  selectedAssets: number;
  readyAssets: number;
  segments: number;
  totalSeconds: number;
  speakerProfileIds: string[];
  segmentsByTier: Record<string, number>;
  secondsByEmotion: Record<string, number>;
  rejections: DatasetRejection[];
  scriptValidations: ScriptValidation[];
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
