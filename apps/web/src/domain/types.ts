export type WorkspacePage = "speech-to-text" | "voice-training" | "voice-manipulator";
export type ThemeMode = "light" | "dark";
export type EmotionLabel = "exciting" | "funny" | "good" | "normal" | "low-energy" | "sad" | "cry" | "angry" | "critical" | "mix";
export type SpeakerGender = "female" | "male" | "nonbinary" | "unspecified";

export type ManipulatorMode =
  | "voice-over"
  | "voice-isolator"
  | "voice-changer"
  | "voice-dubber"
  | "voice-patch";

export type ModuleId =
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
  realtime?: string;
  accurate?: string;
  corrected?: string;
  reviewState?: "pending" | "confirmed" | "manual";
  selectedVariant?: "realtime" | "accurate" | "corrected" | "manual" | null;
  speakerId?: string | null;
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

export interface ProjectMediaAsset {
  id: string;
  name: string;
  sourceExtension: string;
  mediaKind: "audio" | "video";
  sourcePath: string;
  analysisPath?: string | null;
  studioItemId: string | null;
  url: string | null;
  duration: number;
  sampleRate: number | null;
  audioCodec?: string | null;
  videoCodec?: string | null;
  text: string;
  words: StudioWord[];
  origin: "import" | "record";
  status?: "ready" | "no-audio" | "error";
  transcriptionStatus: "complete" | "skipped" | "not-applicable";
  trainingSelected: boolean;
  speakerProfileIds: string[];
  emotion: EmotionLabel;
  createdAt: string;
  updatedAt: string;
  revisions: MediaRevision[];
}

export interface SpeakerProfile {
  id: string;
  name: string;
  language: string | null;
  region: string | null;
  age: number | null;
  gender: SpeakerGender;
  color: string;
  createdAt: string;
}

export interface EnvironmentNoiseProfile {
  id: string;
  name: string;
  assetIds: string[];
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

export interface MediaImportChoice {
  file: File;
  transcribe: boolean;
}

export interface RecordingWaveformPreview {
  active: boolean;
  duration: number;
  samples: number[];
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
