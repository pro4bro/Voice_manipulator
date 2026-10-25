import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { migrateScript } from "../domain/voice-script-document";
import { useVoiceScriptDocument } from "./useVoiceScriptDocument";

const mocks = vi.hoisted(() => ({ getVoiceScript: vi.fn(), saveVoiceScript: vi.fn() }));
vi.mock("../api/client", () => ({ api: mocks }));
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  mocks.getVoiceScript.mockResolvedValue(migrateScript([]));
  mocks.saveVoiceScript.mockImplementation(async (_id, doc) => ({ ...doc, revision: doc.revision + 1 }));
});
const row = { id: "r", text: "Xin chào.", voiceId: "v", speakerProfileId: "s" };

it("migrates browser-only rows once and opens the project document on a fresh browser", async () => {
  localStorage.setItem("pro4bro:p:voice-script", JSON.stringify([row]));
  const first = renderHook(() => useVoiceScriptDocument("p"));
  await waitFor(() => expect(first.result.current.document.revision).toBe(1));
  const saved = first.result.current.document;
  expect(mocks.saveVoiceScript).toHaveBeenCalledTimes(1);
  first.unmount(); localStorage.clear(); mocks.getVoiceScript.mockResolvedValue(saved);
  const second = renderHook(() => useVoiceScriptDocument("p"));
  await waitFor(() => expect(second.result.current.ready).toBe(true));
  expect(second.result.current.document.rows[0]).toMatchObject(row);
  expect(mocks.saveVoiceScript).toHaveBeenCalledTimes(1);
});

it("groups an old same-speaker cache once and preserves a later same-speaker row across reopen", async () => {
  const legacyRows = [
    { id: "old-1", text: "first", voiceId: "v", speakerProfileId: "s", segmentId: "seg-1" },
    { id: "old-2", text: "second", voiceId: "v", speakerProfileId: "s", segmentId: "seg-2" },
  ];
  localStorage.setItem("pro4bro:p:voice-script", JSON.stringify(legacyRows));
  const first = renderHook(() => useVoiceScriptDocument("p"));
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  expect(first.result.current.document).toMatchObject({ turnGroupingVersion: 1, rows: [
    { id: "old-1", text: "first\nsecond", segmentId: "seg-1", legacyRowIds: ["old-1", "old-2"] },
  ] });

  act(() => first.result.current.setRows((rows) => [...rows, { id: "manual", text: "intentional row", voiceId: "v", speakerProfileId: "s" }]));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("pro4bro:p:voice-script") ?? "null");
    expect(saved).toMatchObject({ turnGroupingVersion: 1, rows: [{ id: "old-1" }, { id: "manual" }] });
  });
  first.unmount();

  const reopened = renderHook(() => useVoiceScriptDocument("p"));
  await waitFor(() => expect(reopened.result.current.ready).toBe(true));
  expect(reopened.result.current.document.rows.map((row) => [row.id, row.text])).toEqual([
    ["old-1", "first\nsecond"], ["manual", "intentional row"],
  ]);
  expect(reopened.result.current.document.turnGroupingVersion).toBe(1);
});

it("serializes saves, retains edits during a pending write and does not overwrite on conflict", async () => {
  let resolve!: (doc: unknown) => void;
  mocks.saveVoiceScript.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const hook = renderHook(() => useVoiceScriptDocument("p"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setRows([row]));
  await waitFor(() => expect(mocks.saveVoiceScript).toHaveBeenCalledTimes(1));
  act(() => hook.result.current.setRows([{ ...row, text: "Đã sửa." }]));
  expect(mocks.saveVoiceScript).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ...migrateScript([row]), revision: 1 }));
  await waitFor(() => expect(hook.result.current.document.revision).toBe(2));
  expect(mocks.saveVoiceScript.mock.calls[1][1]).toMatchObject({ revision: 1, rows: [{ text: "Đã sửa." }] });
  mocks.saveVoiceScript.mockRejectedValueOnce(new Error("409 newer revision"));
  act(() => hook.result.current.setRows([{ ...row, text: "Giữ bản nháp." }]));
  await waitFor(() => expect(hook.result.current.error).toContain("409"));
  expect(hook.result.current.document.rows[0].text).toBe("Giữ bản nháp.");
});
