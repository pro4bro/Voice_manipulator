import type { WorkspaceManifest, WorkspacePage } from "../domain/types";

const manifests: Record<WorkspacePage, WorkspaceManifest> = {
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
    modules: ["library-panel", "script", "train", "timeline", "training-job"],
    columns: {
      left: ["library-panel"],
      center: ["script"],
      right: ["train", "training-job"],
      bottom: ["timeline"],
    },
    modes: [],
    plannedModes: [],
  },
  "voice-manipulator": {
    page: "voice-manipulator",
    label: "Voice Manipulator",
    eyebrow: "GENERATE / TRANSFORM / PATCH",
    modules: ["library-panel", "script", "control-rack", "recorder", "timeline", "voice-patch", "recent-takes", "voice-generator"],
    columns: {
      left: ["library-panel", "recent-takes"],
      center: ["script"],
      right: ["recorder", "control-rack", "voice-patch"],
      bottom: ["timeline"],
    },
    modes: ["voice-over", "voice-isolator", "voice-changer", "voice-dubber", "voice-patch"],
    plannedModes: ["voice-isolator", "voice-changer", "voice-dubber"],
  },
};

export function workspaceManifest(page: WorkspacePage): WorkspaceManifest {
  return manifests[page];
}
