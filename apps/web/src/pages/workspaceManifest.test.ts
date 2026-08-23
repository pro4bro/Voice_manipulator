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
    expect(manifest.columns.left).toEqual(["media-pool"]);
    expect(manifest.columns.right).toEqual(["recorder", "speaker-emotion", "speaker-isolation"]);
  });

  it("reuses Media Pool, Script, and Timeline across all workspace pages", () => {
    const pages = ["speech-to-text", "voice-training", "voice-manipulator"] as const;

    for (const page of pages) {
      const manifest = workspaceManifest(page);
      expect(manifest.modules).toContain("media-pool");
      expect(manifest.modules).toContain("script");
      expect(manifest.modules).toContain("timeline");
    }

    expect(workspaceManifest("voice-training").modules).toContain("voice-vault");
    expect(workspaceManifest("voice-training").modules).toContain("train");
    expect(workspaceManifest("voice-training").modules).not.toContain("recorder");
    expect(workspaceManifest("voice-training").modules).not.toContain("control-rack");
    expect(workspaceManifest("voice-manipulator").modules).toContain("voice-vault");
  });

  it("declares every manipulator mode without claiming unavailable processors are ready", () => {
    const manifest = workspaceManifest("voice-manipulator");

    expect(manifest.modes).toEqual([
      "voice-over",
      "voice-isolator",
      "voice-changer",
      "voice-dubber",
      "voice-patch",
    ]);
    expect(manifest.plannedModes).toEqual([
      "voice-isolator",
      "voice-changer",
      "voice-dubber",
    ]);
  });
});
