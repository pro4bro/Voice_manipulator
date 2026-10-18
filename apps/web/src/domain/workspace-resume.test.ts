import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadResumePosition,
  loadResumeSource,
  resumePositionKey,
  resumeSourceKey,
  saveResumePosition,
  saveResumeSource,
  type ResumeSource,
} from "./workspace-resume";

describe("workspace resume persistence", () => {
  beforeEach(() => localStorage.clear());

  it("restores a source and its stopped position after a fresh helper read", () => {
    const source: ResumeSource = { kind: "asset", id: "asset-1" };
    saveResumeSource("project-1", source);
    saveResumePosition("project-1", source, 12.75);

    expect(loadResumeSource("project-1")).toEqual(source);
    expect(loadResumePosition("project-1", source)).toBe(12.75);
  });

  it("keeps positions per source when the active source changes", () => {
    const first: ResumeSource = { kind: "asset", id: "asset-1" };
    const second: ResumeSource = { kind: "asset", id: "track-2", parentId: "container-1" };
    saveResumeSource("project-1", first);
    saveResumePosition("project-1", first, 8);
    saveResumeSource("project-1", second);
    saveResumePosition("project-1", second, 21);

    expect(loadResumeSource("project-1")).toEqual(second);
    expect(loadResumePosition("project-1", first)).toBe(8);
    expect(loadResumePosition("project-1", second)).toBe(21);
  });

  it("does not let a stale position write change the active source", () => {
    const active: ResumeSource = { kind: "asset", id: "new-source" };
    const stale: ResumeSource = { kind: "obs", id: "old-recording" };
    saveResumeSource("project-1", active);
    saveResumePosition("project-1", stale, 5);

    expect(loadResumeSource("project-1")).toEqual(active);
    expect(loadResumePosition("project-1", stale)).toBe(5);
  });

  it("isolates sources and positions by project", () => {
    const source: ResumeSource = { kind: "output", id: "take-1" };
    saveResumeSource("project-1", source);
    saveResumePosition("project-1", source, 9);

    expect(loadResumeSource("project-2")).toBeNull();
    expect(loadResumePosition("project-2", source)).toBeNull();
  });

  it("clamps a saved value to a valid duration and preserves zero", () => {
    const source: ResumeSource = { kind: "asset", id: "asset-1" };
    saveResumePosition("project-1", source, 50);
    expect(loadResumePosition("project-1", source, 12)).toBe(12);

    saveResumePosition("project-1", source, 0);
    expect(loadResumePosition("project-1", source, 12)).toBe(0);
    expect(loadResumePosition("project-1", source, 0)).toBe(0);
    expect(loadResumePosition("project-1", source, Number.NaN)).toBe(0);
  });

  it("ignores invalid IDs, source shapes, times, and project IDs", () => {
    const invalidSource = { kind: "asset", id: "  " } as ResumeSource;
    saveResumeSource("project-1", invalidSource);
    saveResumePosition("project-1", invalidSource, 3);
    saveResumePosition("project-1", { kind: "asset", id: "asset-1" }, -1);
    saveResumePosition("project-1", { kind: "asset", id: "asset-1" }, Infinity);
    saveResumeSource("", { kind: "asset", id: "asset-2" });

    expect(loadResumeSource("project-1")).toBeNull();
    expect(loadResumePosition("project-1", { kind: "asset", id: "asset-1" })).toBeNull();
    expect(loadResumeSource("")).toBeNull();
  });

  it("returns null for corrupt or unknown-version records", () => {
    localStorage.setItem(resumeSourceKey("project-1"), "not-json");
    localStorage.setItem(resumePositionKey("project-1"), JSON.stringify({ version: 99, positions: {} }));
    expect(loadResumeSource("project-1")).toBeNull();
    expect(loadResumePosition("project-1", { kind: "obs", id: "recording-1" })).toBeNull();

    localStorage.setItem(resumeSourceKey("project-1"), JSON.stringify({ version: 1, source: { kind: "path", id: "C:\\audio.wav" } }));
    localStorage.setItem(resumePositionKey("project-1"), "{}");
    expect(loadResumeSource("project-1")).toBeNull();
    expect(loadResumePosition("project-1", { kind: "obs", id: "recording-1" })).toBeNull();
  });

  it("ignores storage read and quota failures", () => {
    const source: ResumeSource = { kind: "asset", id: "asset-1" };
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota exceeded"); });
    expect(loadResumeSource("project-1")).toBeNull();
    expect(loadResumePosition("project-1", source)).toBeNull();
    expect(() => saveResumeSource("project-1", source)).not.toThrow();
    expect(() => saveResumePosition("project-1", source, 1)).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
