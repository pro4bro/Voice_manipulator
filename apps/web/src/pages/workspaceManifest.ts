import type { WorkspaceManifest, WorkspacePage } from "../domain/types";

const manifests: Record<WorkspacePage, WorkspaceManifest> = {
  dashboard: {
    page: "dashboard",
    label: "Dashboard",
    eyebrow: "PIPELINE / FOOTAGE / DATASET",
    modules: ["library-panel", "pipeline-dashboard", "dataset-readiness"],
    columns: {
      left: ["library-panel"],
      center: ["pipeline-dashboard"],
      right: ["dataset-readiness"],
      bottom: [],
    },
    modes: [],
    plannedModes: [],
  },
  "speech-to-text": {
    page: "speech-to-text",
    label: "Speech to Text",
    eyebrow: "CAPTURE / TRANSCRIBE / REVIEW",
    modules: ["library-panel", "speaker-isolation", "speaker-emotion", "script", "recorder", "timeline"],
    columns: {
      left: ["library-panel"],
      center: ["script"],
      right: ["recorder", "speaker-emotion", "speaker-isolation"],
      bottom: ["timeline"],
    },
    modes: [],
    plannedModes: [],
  },
  "voice-training": {
    page: "voice-training",
    label: "Voice Training",
    eyebrow: "CURATE / TOKENIZE / TRAIN",
    modules: ["library-panel", "train", "training-job"],
    columns: {
      left: ["library-panel"],
      center: ["training-job"],
      right: ["train"],
      bottom: [],
    },
    modes: [],
    plannedModes: [],
  },
  "voice-manipulator": {
    page: "voice-manipulator",
    label: "Voice Manipulator",
    eyebrow: "GENERATE / TRANSFORM / PATCH",
    modules: ["manipulator-library", "voice-script", "control-rack", "timeline", "voice-patch", "voice-generator"],
    columns: {
      // Sound Library and Voice Output only: Media Pool is source footage for
      // STT and training, and the Script here is typed, not transcribed.
      left: ["manipulator-library"],
      center: ["voice-script"],
      right: ["voice-generator", "control-rack", "voice-patch"],
      bottom: ["timeline"],
    },
    // Voice Changer has its own page now.
    modes: ["voice-over", "voice-isolator", "voice-dubber", "voice-patch"],
    plannedModes: ["voice-isolator", "voice-dubber"],
  },
  "voice-changer": {
    page: "voice-changer",
    label: "Voice Changer",
    eyebrow: "SPEAK / CONVERT / ROUTE",
    modules: ["voice-vault", "sound-reactor-input", "sound-reactor-output", "voice-input", "changer-timeline"],
    columns: {
      // Sound Library picks whose voice to wear; the centre shows the voice
      // going in and coming out; the Timeline records both as two channels.
      left: ["voice-vault"],
      center: ["sound-reactor-input", "sound-reactor-output"],
      right: ["voice-input"],
      bottom: ["changer-timeline"],
    },
    modes: [],
    plannedModes: [],
  },
};

export function workspaceManifest(page: WorkspacePage): WorkspaceManifest {
  return manifests[page];
}
