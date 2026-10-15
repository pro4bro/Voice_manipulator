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
