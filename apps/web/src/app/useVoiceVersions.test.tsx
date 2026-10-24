import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VoiceOutput, VoiceScriptDocument } from "../domain/types";
import { useVoiceVersions, type VoiceOutputSessionBook, type VoiceOutputVersionState, type UseVoiceVersionsProps } from "./useVoiceVersions";

const scriptDoc = (text = "Hello", revision = 2) => ({ version: 1, revision, settings: {}, segments: [], rows: [{ id: "r", text, speakerProfileId: "speaker", voiceId: "voice" }] }) as VoiceScriptDocument;
const output = { id: "out-1", name: "Output 1" } as VoiceOutput;
const state = (overrides: Partial<VoiceOutputVersionState> = {}): VoiceOutputVersionState => ({ revision: 5, script: scriptDoc(), config: { rate: 1 }, generatedScript: null, generatedConfig: {}, composition: { revision: 0, durationFrames: 1, layers: [{ id: "base", name: "Base", clips: [] }] }, ownedOutputIds: ["out-1"], history: [], outputId: "out-1", ...overrides });
const book = (overrides: Partial<VoiceOutputSessionBook> = {}): VoiceOutputSessionBook => ({ revision: 7, activeSessionId: "s1", activeVersionId: "v1", sessions: [{ id: "s1", name: "Session 1", versions: [{ id: "v1", name: "Version 1", outputId: "out-1", state: state() }] }], recycle: [], ...overrides });

type FixtureFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
let fetchMock: ReturnType<typeof vi.fn<FixtureFetch>>;
beforeEach(() => {
  let current = book();
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : null;
    let value: unknown;
    if (url.endsWith("/voice-output-sessions") && method === "GET") value = current;
    else if (url.endsWith("/voice-outputs") && method === "GET") value = [output];
    else if (url.endsWith("/select") && method === "POST") value = current;
    else if (url.endsWith("/state") && method === "PUT") {
      const version = current.sessions[0].versions[0];
      if (JSON.stringify(body.script) !== JSON.stringify(version.state.script) || JSON.stringify(body.config) !== JSON.stringify(version.state.config)) {
        const nextState = { ...version.state, revision: body.revision + 1, script: body.script, config: body.config };
        current = { ...current, revision: current.revision + 1, sessions: [{ ...current.sessions[0], versions: [{ ...version, state: nextState }] }] };
      }
      value = current;
    } else if (url.endsWith("/versions") && method === "POST") {
      const nextState = { ...current.sessions[0].versions[0].state, revision: 0 };
      current = { ...current, revision: current.revision + 1, activeVersionId: "v2", sessions: [{ ...current.sessions[0], versions: [...current.sessions[0].versions, { id: "v2", name: "Version 2", outputId: "out-2", state: nextState }] }] };
      value = { sessions: current, output: { ...output, id: "out-2", name: "Output 2" } };
    } else if (url.endsWith("/layers")) value = { sessions: current, output };
    else if (url.endsWith("/slots")) value = current;
    else throw new Error(`Unexpected request ${method} ${url}`);
    return { ok: true, status: 200, json: async () => structuredClone(value) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function props(overrides: Partial<UseVoiceVersionsProps> = {}): UseVoiceVersionsProps {
  return { projectId: "p", script: { document: scriptDoc(), ready: true, error: null, flush: vi.fn(async () => scriptDoc()), adoptSaved: vi.fn() }, config: { rate: 1 }, onRestoreConfig: vi.fn(), onOpenOutput: vi.fn(), ...overrides };
}

it("waits for Script readiness before checking out and adopts the active version without autosaving it back", async () => {
  const initial = props({ script: { ...props().script, ready: false } });
  const hook = renderHook((value: UseVoiceVersionsProps) => useVoiceVersions(value), { initialProps: initial });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/select") && init?.method === "POST")).toBe(false);
  const readyScript = { ...initial.script, ready: true };
  hook.rerender({ ...initial, script: readyScript });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/select") && init?.method === "POST")).toBe(true);
  expect(readyScript.adoptSaved).toHaveBeenCalledWith(scriptDoc());
  expect(initial.onRestoreConfig).toHaveBeenCalledWith({ rate: 1 });
  expect(initial.onOpenOutput).toHaveBeenCalledWith(output);
  await new Promise((resolve) => setTimeout(resolve, 375));
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/state") && init?.method === "PUT")).toBe(false);
});

it("debounces document/config persistence and uses the current state revision", async () => {
  const initial = props();
  const hook = renderHook((value: UseVoiceVersionsProps) => useVoiceVersions(value), { initialProps: initial });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const changedDoc = scriptDoc("Changed");
  hook.rerender({ ...initial, script: { ...initial.script, document: changedDoc, flush: vi.fn(async () => changedDoc) }, config: { rate: 1.2 } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/state") && init?.method === "PUT")).toBe(true), { timeout: 1500 });
  const [url, init] = fetchMock.mock.calls.find(([entry, request]) => String(entry).endsWith("/state") && request?.method === "PUT")!;
  expect(String(url)).toContain("/versions/v1/state");
  expect(JSON.parse(String(init?.body))).toEqual({ revision: 5, script: changedDoc, config: { rate: 1.2 } });
});

it("clones a version and sends layer edits with the returned state revision", async () => {
  const initial = props();
  const hook = renderHook((value: UseVoiceVersionsProps) => useVoiceVersions(value), { initialProps: initial });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(async () => { await hook.result.current.change("version"); });
  expect(hook.result.current.activeVersion?.id).toBe("v2");
  expect(initial.onOpenOutput).toHaveBeenLastCalledWith(expect.objectContaining({ id: "out-2" }));
  const cloneCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/versions") && init?.method === "POST");
  expect(JSON.parse(String(cloneCall?.[1]?.body))).toEqual({ revision: 7, sourceVersionId: "v1" });

  const command = { action: "toggle-layer", layerId: "base", enabled: false };
  await act(async () => { await hook.result.current.editLayer(command); });
  const layerCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/versions/v2/layers"));
  expect(JSON.parse(String(layerCall?.[1]?.body))).toEqual({ revision: 0, command });
});

it("flushes the checked-out Version before adopting an unmanaged output and checks out the adopted snapshot", async () => {
  let current = book();
  const adopted = { ...output, id: "legacy-output", name: "Voice Patch output" } as VoiceOutput;
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith("/voice-output-sessions") && method === "GET") return { ok: true, status: 200, json: async () => structuredClone(current) };
    if (url.endsWith("/voice-outputs") && method === "GET") return { ok: true, status: 200, json: async () => [output] };
    if (url.endsWith("/select") && method === "POST") return { ok: true, status: 200, json: async () => structuredClone(current) };
    if (url.endsWith("/state") && method === "PUT") {
      const version = current.sessions[0].versions[0];
      const nextState = { ...version.state, revision: body.revision + 1, script: body.script, config: body.config };
      current = { ...current, revision: current.revision + 1, sessions: [{ ...current.sessions[0], versions: [{ ...version, state: nextState }] }] };
      return { ok: true, status: 200, json: async () => structuredClone(current) };
    }
    if (url.endsWith("/adopt") && method === "POST") {
      const version = current.sessions[0].versions[0];
      const nextState = { ...version.state, revision: version.state.revision + 1, outputId: body.outputId,
        ownedOutputIds: [...version.state.ownedOutputIds, body.outputId] };
      current = { ...current, revision: current.revision + 1, sessions: [{ ...current.sessions[0], versions: [{ ...version, outputId: body.outputId, state: nextState }] }] };
      return { ok: true, status: 200, json: async () => ({ sessions: structuredClone(current), output: adopted }) };
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  const initial = props();
  const hook = renderHook((value: UseVoiceVersionsProps) => useVoiceVersions(value), { initialProps: initial });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const saved = scriptDoc("Changed before adopting", 3);
  const changedProps = { ...initial, script: { ...initial.script, document: saved, flush: vi.fn(async () => saved) }, config: { rate: 1.4 } };
  hook.rerender(changedProps);

  await act(async () => { await hook.result.current.adoptOutput(adopted); });

  const writes = fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/state") || String(url).endsWith("/adopt"));
  expect(writes.map(([url]) => String(url).split("/").at(-1))).toEqual(["state", "adopt"]);
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ revision: 5, script: saved, config: { rate: 1.4 } });
  expect(JSON.parse(String(writes[1][1]?.body))).toEqual({ revision: 8, outputId: "legacy-output" });
  expect(hook.result.current.activeVersion?.outputId).toBe("legacy-output");
  expect(changedProps.script.adoptSaved).toHaveBeenCalledWith(saved);
  expect(changedProps.onOpenOutput).toHaveBeenLastCalledWith(adopted);
});

it("compares persisted JSON by value and does not autosave forever when server keys are sorted", async () => {
  const initial = props({ config: { speed: 1, generatorParameters: { omni: { steps: 32, denoise: true } } } });
  const saved = book();
  saved.sessions[0].versions[0].state.config = { generatorParameters: { omni: { denoise: true, steps: 32 } }, speed: 1 };
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => ({ ok: true, status: 200,
    json: async () => structuredClone(String(input).endsWith("/voice-outputs") ? [output] : saved) }));
  const hook = renderHook(() => useVoiceVersions(initial));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/state"))).toHaveLength(0);
  await act(async () => { await hook.result.current.flush(); });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/state"))).toHaveLength(1);
});

it("clears the deleted checkout and adopts the saved empty Script projection", async () => {
  const initial = props();
  const hook = renderHook(() => useVoiceVersions(initial));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const originalFetch = fetchMock.getMockImplementation()!;
  const removed = book({ activeSessionId: null, activeVersionId: null, sessions: [], recycle: [{ id: "s1", kind: "session", name: "Session 1", deletedAt: "2026-10-24" }] });
  const empty = { ...scriptDoc("", 3), rows: [] };
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/slots")) return { ok: true, status: 200, json: async () => removed };
    if (String(input).endsWith("/voice-script")) return { ok: true, status: 200, json: async () => empty };
    return originalFetch(input, init);
  });
  await act(async () => { await hook.result.current.slotAction("s1", "remove"); });
  expect(hook.result.current.activeVersion).toBeNull();
  expect(hook.result.current.transitioning).toBe(false);
  expect(initial.script.adoptSaved).toHaveBeenLastCalledWith(empty);
  expect(initial.onOpenOutput).toHaveBeenLastCalledWith(null);
  expect(hook.result.current.book?.recycle).toHaveLength(1);
});

it("refreshes a completed Fix before saving newer config and preserves the live Script editor", async () => {
  const initial = props();
  const hook = renderHook((value: UseVoiceVersionsProps) => useVoiceVersions(value), { initialProps: initial });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const pending = scriptDoc("New edit during Fix", 4);
  const completed = book();
  completed.sessions[0].versions[0].state = state({ revision: 9, script: pending, generatedScript: scriptDoc("Captured Fix", 3), outputId: "out-fixed" });
  completed.sessions[0].versions[0].outputId = "out-fixed";
  const writes: number[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/state")) {
      const body = JSON.parse(String(init?.body)); writes.push(body.revision);
      if (body.revision !== 9) return { ok: false, status: 409, json: async () => ({ detail: "Version changed" }) };
      completed.sessions[0].versions[0].state.config = body.config;
    }
    return { ok: true, status: 200, json: async () => structuredClone(url.endsWith("/voice-outputs") ? [{ ...output, id: "out-fixed" }] : completed) };
  });
  const updated = { ...initial, script: { ...initial.script, document: pending, flush: vi.fn(async () => pending) }, config: { rate: 1.3 } };
  hook.rerender(updated);
  vi.mocked(initial.script.adoptSaved).mockClear();
  await act(async () => { await hook.result.current.refreshAfterGeneration(); });
  expect(hook.result.current.error).toBeNull();
  expect(writes).toEqual([9]);
  expect(initial.script.adoptSaved).not.toHaveBeenCalled();
  expect(hook.result.current.state?.generatedScript?.rows[0].text).toBe("Captured Fix");
  expect(initial.onOpenOutput).toHaveBeenLastCalledWith(expect.objectContaining({ id: "out-fixed" }));
});
