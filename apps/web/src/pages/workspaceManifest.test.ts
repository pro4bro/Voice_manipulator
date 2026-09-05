import { describe, expect, it } from "vitest";

import { workspaceManifest } from "./workspaceManifest";

describe("workspaceManifest", () => {
  it("keeps generation, patch, and recent takes out of Speech to Text", () => {
    const manifest = workspaceManifest("speech-to-text");
    expect(manifest.modules).not.toContain("voice-generator");
    expect(manifest.modules).not.toContain("voice-patch");
    expect(manifest.modules).not.toContain("recent-takes");
    expect(manifest.modules).not.toContain("voice-vault");
    expect(manifest.modules).not.toContain("control-rack");
    expect(manifest.columns.left).toEqual(["library-panel"]);
    expect(manifest.columns.right).toEqual(["recorder", "speaker-emotion", "speaker-isolation"]);
  });

  it("keeps editing modules in source workflows and training controls in Train", () => {
    const editingPages = ["speech-to-text", "voice-manipulator"] as const;
    for (const page of editingPages) {
      const manifest = workspaceManifest(page);
      expect(manifest.modules).toContain("library-panel");
      expect(manifest.modules).toContain("script");
      expect(manifest.modules).toContain("timeline");
    }
    const training = workspaceManifest("voice-training");
    expect(training.modules).toEqual(["library-panel", "train", "training-job"]);
    expect(training.columns.left).toEqual(["library-panel"]);
    expect(training.columns.right).toEqual(["train"]);
    expect(training.columns.center).toEqual(["training-job"]);
    expect(training.columns.bottom).toEqual([]);
    expect(training.modules).not.toContain("script");
    expect(training.modules).not.toContain("timeline");
    expect(training.modules).not.toContain("recorder");
    expect(training.modules).not.toContain("control-rack");
  });

  it("declares every manipulator mode without claiming unavailable processors are ready", () => {
    const manifest = workspaceManifest("voice-manipulator");
    expect(manifest.modes).toEqual(["voice-over", "voice-isolator", "voice-changer", "voice-dubber", "voice-patch"]);
    expect(manifest.plannedModes).toEqual(["voice-isolator", "voice-changer", "voice-dubber"]);
  });
});
