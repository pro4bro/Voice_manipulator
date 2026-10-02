import { expect, it } from "vitest";
import { recordingName } from "./recording-name";

it.each(["MIC", "SYS", "LIV"] as const)("names %s captures from their start time and source", (source) => {
  expect(recordingName(new Date(2026, 8, 30, 9, 4, 2), "Dự án / A", source, "12345678-1234"))
    .toBe(`2026-09-30_09-04-02_Dự-án-A_${source}_12345678`);
});
