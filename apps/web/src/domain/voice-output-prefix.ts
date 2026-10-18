import type { VoiceOutput } from "./types";

/** The producing operation owns the label, independently of the open function. */
export function voiceOutputPrefix(output: Pick<VoiceOutput, "parameters">): "VO" | "VP" {
  const patch = output.parameters.voicePatch;
  return patch && typeof patch === "object" && !Array.isArray(patch)
    && typeof (patch as Record<string, unknown>).jobId === "string"
    && typeof (patch as Record<string, unknown>).sourceOutputId === "string" ? "VP" : "VO";
}
