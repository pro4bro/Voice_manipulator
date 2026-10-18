import { describe, expect, it } from "vitest";
import { voiceOutputPrefix } from "./voice-output-prefix";

describe("output function prefix", () => {
  it("identifies the result from processor provenance, never from text or the selected tab", () => {
    expect(voiceOutputPrefix({ parameters: {} })).toBe("VO");
    expect(voiceOutputPrefix({ parameters: { voicePatch: { jobId: "job1", sourceOutputId: "source" } } })).toBe("VP");
    expect(voiceOutputPrefix({ parameters: { voicePatch: "Voice Patch" } })).toBe("VO");
    expect(voiceOutputPrefix({ parameters: { voicePatch: null } })).toBe("VO");
  });
});
