import { describe, expect, it } from "vitest";
import type { ProjectMediaAsset, ProjectVoice, TrainingRun, VoiceOutput } from "./types";
import { completedGenerationRows, completedTrainingTargets } from "./processing-results";

describe("processing result eligibility", () => {
  it("does not skip new text, another voice, changed settings or deleted outputs", () => {
    const rows = [{ id: "r1", voiceId: "v1", text: "xin chào" }, { id: "r2", voiceId: "v1", text: "thêm" }];
    const output = { audioPath: "out.wav", parameters: { generators: { gen: { speed: 1 } } },
      segments: [{ rowId: "r1", voiceId: "v1", generatorId: "gen", text: "xin  chào" }] } as unknown as VoiceOutput;
    expect([...completedGenerationRows(rows, [output], { gen: { speed: 1 } })]).toEqual(["r1"]);
    expect(completedGenerationRows(rows, [output], { gen: { speed: 2 } }).size).toBe(0);
    expect(completedGenerationRows(rows, [output], { gen: {} }).size).toBe(0);
    expect(completedGenerationRows(rows, [{ ...output, audioAvailable: false }], { gen: { speed: 1 } }).size).toBe(0);
    expect(completedGenerationRows([{ ...rows[0], voiceId: "v2" }], [output], {}).size).toBe(0);
    expect(completedGenerationRows([{ ...rows[0], text: "sửa" }], [output], {}).size).toBe(0);
    expect(completedGenerationRows(rows, [], {}).size).toBe(0);
  });
  it("requires a completed run with a published voice and unchanged speaker inputs", () => {
    const run = { id: "run1", status: "complete", speakerProfileId: "a", createdAt: "2026-10-08T12:00:00Z",
      config: { modelId: "model", parameters: { steps: 20 } } } as unknown as TrainingRun;
    const voice = { speakerProfileId: "a", modelId: "model", sourceRunId: "run1" } as ProjectVoice;
    const asset = { trainingSelected: true, speakerProfileIds: ["a"], words: [], updatedAt: "2026-10-08T11:00:00Z" } as unknown as ProjectMediaAsset;
    const check = (assets = [asset], voices = [voice], runs = [run]) => completedTrainingTargets(["a", "b"], "model", { steps: 20 }, runs, voices, assets);
    expect([...check()]).toEqual(["a"]);
    expect(check([{ ...asset, updatedAt: "2026-10-08T13:00:00Z" }]).size).toBe(0);
    expect(check([asset], []).size).toBe(0);
    expect(check([asset], [voice], [{ ...run, status: "interrupted" }]).size).toBe(0);
    expect(completedTrainingTargets(["a"], "model", { steps: 50 }, [run], [voice], [asset]).size).toBe(0);
    expect(completedTrainingTargets(["a"], "model", {}, [run], [voice], [asset]).size).toBe(0);
  });
});
