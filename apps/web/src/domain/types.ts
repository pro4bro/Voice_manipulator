export type WorkspacePage = "speech-to-text" | "voice-training" | "voice-manipulator";

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
  createdAt: string;
  updatedAt: string;
  revisions: MediaRevision[];
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
