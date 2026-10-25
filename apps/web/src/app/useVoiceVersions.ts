import type { OutputRecycleEntry, OutputSlotAction } from "../domain/output-lifecycle";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceOutput, VoiceScriptDocument } from "../domain/types";
import type { VoiceComposition, VoiceLayerTimelineCommand } from "../modules/voice-output/VoiceLayerTimeline";

export interface VoiceOutputVersionState {
  revision: number;
  script: VoiceScriptDocument;
  config: Record<string, unknown>;
  generatedScript: VoiceScriptDocument | null;
  fullGeneratedScript?: VoiceScriptDocument | null;
  generatedConfig: Record<string, unknown>;
  composition: VoiceComposition | null;
  ownedOutputIds: string[];
  history: Array<Record<string, unknown>>;
  outputId: string | null;
}

export interface VoiceOutputSessionVersion {
  id: string;
  name: string;
  outputId: string | null;
  disabled?: boolean;
  parentVersionId?: string | null;
  acceptsNextOutput?: boolean;
  state: VoiceOutputVersionState;
}

export interface VoiceOutputSession {
  id: string;
  name: string;
  disabled?: boolean;
  versions: VoiceOutputSessionVersion[];
}

export type VoiceOutputRecycleEntry = OutputRecycleEntry;

export interface VoiceOutputSessionBook {
  revision: number;
  activeSessionId: string | null;
  activeVersionId: string | null;
  sessions: VoiceOutputSession[];
  recycle: VoiceOutputRecycleEntry[];
}

export interface VoiceScriptBinding {
  document: VoiceScriptDocument;
  ready: boolean;
  error: string | null;
  flush: () => Promise<VoiceScriptDocument>;
  adoptSaved: (document: VoiceScriptDocument) => void;
}

export interface VoiceVersionsController {
  book: VoiceOutputSessionBook | null;
  state: VoiceOutputVersionState | null;
  activeVersion: VoiceOutputSessionVersion | null;
  ready: boolean;
  busy: boolean;
  transitioning?: boolean;
  error: string | null;
  flush: (configSnapshot?: Record<string, unknown>) => Promise<VoiceOutputSessionBook | null>;
  reload: () => Promise<VoiceOutputSessionBook | null>;
  change: (kind: "session" | "version" | "select", versionId?: string) => Promise<VoiceOutputSessionBook | null>;
  editLayer: (command: VoiceLayerTimelineCommand | Record<string, unknown>) => Promise<VoiceOutputSessionBook | null>;
  adoptOutput: (output: VoiceOutput) => Promise<VoiceOutputSessionBook | null>;
  slotAction: (id: string, kind: OutputSlotAction, name?: string) => Promise<VoiceOutputSessionBook | null>;
  refreshAfterGeneration: () => Promise<void>;
}

export interface UseVoiceVersionsProps {
  projectId: string;
  script: VoiceScriptBinding;
  config: Record<string, unknown>;
  onRestoreConfig: (config: Record<string, unknown>) => void;
  onOpenOutput: (output: VoiceOutput | null) => void;
}

async function requestJson<T>(url: string, method?: "POST" | "PUT", body?: unknown): Promise<T> {
  const response = await fetch(url, method ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  let result: unknown;
  try { result = await response.json(); } catch { result = null; }
  if (!response.ok) {
    const detail = result && typeof result === "object" && "detail" in result ? (result as { detail: unknown }).detail : null;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status}).`);
  }
  return result as T;
}

function projectUrl(projectId: string) { return `/api/projects/${encodeURIComponent(projectId)}/voice-output-sessions`; }
function activeVersion(book: VoiceOutputSessionBook | null) {
  return book?.sessions.flatMap((session) => session.versions).find((version) => version.id === book.activeVersionId) ?? null;
}
function comparable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function comparableScript(document: VoiceScriptDocument) { return comparable(document); }
function comparableConfig(config: Record<string, unknown>) { return comparable(config); }

export function useVoiceVersions({ projectId, script, config, onRestoreConfig, onOpenOutput }: UseVoiceVersionsProps): VoiceVersionsController {
  const props = useRef({ projectId, script, config, onRestoreConfig, onOpenOutput });
  props.current = { projectId, script, config, onRestoreConfig, onOpenOutput };
  const [book, setBook] = useState<VoiceOutputSessionBook | null>(null);
  const [state, setState] = useState<VoiceOutputVersionState | null>(null);
  const [outputs, setOutputs] = useState<VoiceOutput[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bookRef = useRef<VoiceOutputSessionBook | null>(null);
  const stateRef = useRef<VoiceOutputVersionState | null>(null);
  const outputsRef = useRef<VoiceOutput[]>([]);
  const busyRef = useRef(false);
  const pending = useRef(0);
  const mounted = useRef(true);
  const generation = useRef(0);
  const checkedOut = useRef("");
  const lane = useRef<Promise<unknown>>(Promise.resolve());

  const setBookValue = useCallback((value: VoiceOutputSessionBook | null) => { bookRef.current = value; setBook(value); }, []);
  const setStateValue = useCallback((value: VoiceOutputVersionState | null) => { stateRef.current = value; setState(value); }, []);
  const setOutputsValue = useCallback((value: VoiceOutput[]) => { outputsRef.current = value; setOutputs(value); }, []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);

  useEffect(() => {
    const token = ++generation.current;
    checkedOut.current = "";
    setBookValue(null); setStateValue(null); setOutputsValue([]); setLoaded(false); setBusy(false); setTransitioning(false); busyRef.current = false; pending.current = 0; setError(null);
    const root = projectUrl(projectId);
    void Promise.all([requestJson<VoiceOutputSessionBook>(root), requestJson<VoiceOutput[]>(`/api/projects/${encodeURIComponent(projectId)}/voice-outputs`)]).then(([nextBook, nextOutputs]) => {
      if (!mounted.current || token !== generation.current || props.current.projectId !== projectId) return;
      setBookValue(nextBook); setOutputsValue(nextOutputs); setLoaded(true);
    }).catch((reason: unknown) => {
      if (!mounted.current || token !== generation.current || props.current.projectId !== projectId) return;
      setError(reason instanceof Error ? reason.message : String(reason)); setLoaded(true);
    });
    return () => { if (generation.current === token) generation.current++; };
  }, [projectId, setBookValue, setOutputsValue, setStateValue]);

  function applyCheckout(nextBook: VoiceOutputSessionBook, token: number, project: string, preferredOutput?: VoiceOutput | null) {
    if (!mounted.current || token !== generation.current || props.current.projectId !== project) return;
    setBookValue(nextBook);
    const nextState = activeVersion(nextBook)?.state ?? null;
    setStateValue(nextState);
    checkedOut.current = `${project}:${nextBook.activeVersionId ?? "empty"}`;
    if (nextState) {
      props.current.script.adoptSaved(nextState.script);
      props.current.onRestoreConfig(nextState.config);
      const output = preferredOutput ?? outputsRef.current.find((item) => item.id === nextState.outputId) ?? null;
      props.current.onOpenOutput(output);
    } else {
      props.current.onOpenOutput(null);
    }
  }

  function updateBookOnly(nextBook: VoiceOutputSessionBook, token: number, project: string) {
    if (!mounted.current || token !== generation.current || props.current.projectId !== project) return;
    setBookValue(nextBook);
    setStateValue(activeVersion(nextBook)?.state ?? null);
  }

  const enqueue = useCallback(<T,>(work: (token: number, project: string) => Promise<T>): Promise<T | null> => {
    pending.current++;
    busyRef.current = true; setBusy(true); setError(null);
    const token = generation.current, project = props.current.projectId;
    const task = lane.current.then(() => {
      if (!mounted.current || token !== generation.current || props.current.projectId !== project) return null;
      return work(token, project);
    });
    lane.current = task.then(() => undefined, () => undefined);
    return task.catch((reason: unknown) => {
      if (mounted.current && token === generation.current && props.current.projectId === project) setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    }).finally(() => {
      if (mounted.current && token === generation.current && props.current.projectId === project) { pending.current--; busyRef.current = pending.current > 0; setBusy(busyRef.current); }
    });
  }, []);

  async function flushState(token: number, project: string, captureSidecars = false, configSnapshot?: Record<string, unknown>): Promise<VoiceOutputSessionBook | null> {
    const currentBook = bookRef.current;
    const currentVersion = activeVersion(currentBook);
    if (!currentBook) return null;
    if (!props.current.script.ready || props.current.script.error) throw new Error(props.current.script.error ?? "Script chưa tải xong.");
    const savedScript = await props.current.script.flush();
    if (!mounted.current || token !== generation.current || props.current.projectId !== project) return null;
    if (!currentVersion) return currentBook;
    const currentState = stateRef.current ?? currentVersion.state;
    const configNow = configSnapshot ?? props.current.config;
    if (!captureSidecars && comparableScript(savedScript) === comparableScript(currentState.script) && comparableConfig(configNow) === comparableConfig(currentState.config)) return currentBook;
    const updated = await requestJson<VoiceOutputSessionBook>(`${projectUrl(project)}/versions/${encodeURIComponent(currentVersion.id)}/state`, "PUT", {
      revision: currentState.revision, script: savedScript, config: configNow,
    });
    if (!mounted.current || token !== generation.current || props.current.projectId !== project) return null;
    updateBookOnly(updated, token, project);
    return updated;
  }

  const flush = useCallback((configSnapshot?: Record<string, unknown>) => enqueue(async (token, project) => (await flushState(token, project, true, configSnapshot)) ?? null), [enqueue]);

  const applyInitialCheckout = useCallback(() => {
    if (!loaded || !props.current.script.ready || props.current.script.error) return;
    const currentBook = bookRef.current;
    if (!currentBook?.activeVersionId) { checkedOut.current = `${props.current.projectId}:empty`; return; }
    const identity = `${props.current.projectId}:${currentBook.activeVersionId}`;
    if (checkedOut.current === identity) return;
    checkedOut.current = identity;
    void enqueue(async (token, project) => {
      const latestBook = bookRef.current;
      if (!latestBook?.activeVersionId) return latestBook;
      // Flush a migrated browser draft before checkout, then re-read the server
      // snapshot captured by the Script save callback.
      await props.current.script.flush();
      if (!mounted.current || token !== generation.current || props.current.projectId !== project) return null;
      const captured = await requestJson<VoiceOutputSessionBook>(projectUrl(project));
      const next = await requestJson<VoiceOutputSessionBook>(`${projectUrl(project)}/select`, "POST", { revision: captured.revision, versionId: captured.activeVersionId });
      applyCheckout(next, token, project);
      return next;
    });
  }, [enqueue, loaded, props.current.script.ready, props.current.script.error]);

  useEffect(() => { applyInitialCheckout(); }, [applyInitialCheckout, book?.revision, book?.activeVersionId]);

  const reload = useCallback(() => enqueue(async (token, project) => {
    if (stateRef.current) await flushState(token, project, true);
    const [nextBook, nextOutputs] = await Promise.all([requestJson<VoiceOutputSessionBook>(projectUrl(project)), requestJson<VoiceOutput[]>(`/api/projects/${encodeURIComponent(project)}/voice-outputs`)]);
    setOutputsValue(nextOutputs);
    if (nextBook.activeVersionId) {
      const next = await requestJson<VoiceOutputSessionBook>(`${projectUrl(project)}/select`, "POST", { revision: nextBook.revision, versionId: nextBook.activeVersionId });
      applyCheckout(next, token, project);
      return next;
    }
    applyCheckout(nextBook, token, project);
    return nextBook;
  }), [enqueue, setOutputsValue]);

  const change = useCallback((kind: "session" | "version" | "select", versionId?: string) => {
    setTransitioning(true);
    return enqueue(async (token, project) => {
    await flushState(token, project, true);
    const currentBook = bookRef.current;
    if (!currentBook) throw new Error("Voice Output Sessions chưa tải xong.");
    let nextBook: VoiceOutputSessionBook;
    let preferredOutput: VoiceOutput | null | undefined;
    if (kind === "session") {
      nextBook = await requestJson<VoiceOutputSessionBook>(projectUrl(project), "POST", { revision: currentBook.revision });
    } else if (kind === "version") {
      if (!currentBook.activeVersionId) throw new Error("Chưa có Version để sao chép.");
      const result = await requestJson<{ sessions: VoiceOutputSessionBook; output: VoiceOutput | null }>(`${projectUrl(project)}/versions`, "POST", { revision: currentBook.revision, sourceVersionId: currentBook.activeVersionId });
      nextBook = result.sessions; preferredOutput = result.output;
    } else {
      if (!versionId) throw new Error("Chưa chọn Version.");
      nextBook = await requestJson<VoiceOutputSessionBook>(`${projectUrl(project)}/select`, "POST", { revision: currentBook.revision, versionId });
    }
    if (preferredOutput && !outputsRef.current.some((item) => item.id === preferredOutput!.id)) setOutputsValue([...outputsRef.current, preferredOutput]);
    applyCheckout(nextBook, token, project, preferredOutput);
    return nextBook;
    }).finally(() => setTransitioning(false));
  }, [enqueue, setOutputsValue]);

  const editLayer = useCallback((command: VoiceLayerTimelineCommand | Record<string, unknown>) => enqueue(async (token, project) => {
    await flushState(token, project, true);
    const currentBook = bookRef.current, currentVersion = activeVersion(bookRef.current), currentState = stateRef.current;
    if (!currentBook || !currentVersion || !currentState?.composition) throw new Error("Composition audio chưa sẵn sàng.");
    const result = await requestJson<{ sessions: VoiceOutputSessionBook; output: VoiceOutput | null }>(`${projectUrl(project)}/versions/${encodeURIComponent(currentVersion.id)}/layers`, "POST", { revision: currentState.revision, command });
    if (result.output) setOutputsValue([...outputsRef.current.filter((item) => item.id !== result.output!.id), result.output]);
    updateBookOnly(result.sessions, token, project);
    props.current.onOpenOutput(result.output ?? outputsRef.current.find((item) => item.id === activeVersion(result.sessions)?.state.outputId) ?? null);
    return result.sessions;
  }), [enqueue, setOutputsValue]);

  const adoptOutput = useCallback((output: VoiceOutput) => enqueue(async (token, project) => {
    await flushState(token, project, true);
    const currentBook = bookRef.current;
    if (!currentBook) throw new Error("Voice Output Sessions chưa tải xong.");
    const result = await requestJson<{ sessions: VoiceOutputSessionBook; output: VoiceOutput }>(`${projectUrl(project)}/adopt`, "POST", {
      revision: currentBook.revision, outputId: output.id,
    });
    if (!mounted.current || token !== generation.current || props.current.projectId !== project) return null;
    setOutputsValue([...outputsRef.current.filter((item) => item.id !== result.output.id), result.output]);
    applyCheckout(result.sessions, token, project, result.output);
    return result.sessions;
  }), [enqueue, setOutputsValue]);

  const slotAction = useCallback((id: string, kind: OutputSlotAction, name?: string) => {
    setTransitioning(true);
    return enqueue(async (token, project) => {
      await flushState(token, project, true);
      const currentBook = bookRef.current;
      if (!currentBook) throw new Error("Voice Output Sessions chưa tải xong.");
      const next = await requestJson<VoiceOutputSessionBook>(`${projectUrl(project)}/slots`, "POST", { revision: currentBook.revision, id, kind, ...(name ? { name } : {}) });
      if (!next.activeVersionId && currentBook.activeVersionId) {
        const projection = await requestJson<VoiceScriptDocument>(`/api/projects/${encodeURIComponent(project)}/voice-script`);
        if (!mounted.current || token !== generation.current || props.current.projectId !== project) return null;
        props.current.script.adoptSaved(projection);
        props.current.onRestoreConfig({});
      }
      if (next.activeVersionId !== currentBook.activeVersionId) applyCheckout(next, token, project);
      else updateBookOnly(next, token, project);
      return next;
    }).finally(() => setTransitioning(false));
  }, [enqueue]);

  const refreshAfterGeneration = useCallback(async () => {
    await enqueue(async (token, project) => {
      // Publication advances the server revision. Save the live text projection
      // first, then read that revision before persisting newer configuration.
      // Checking out the captured job Script here would erase edits made in flight.
      await props.current.script.flush();
      const [nextBook, nextOutputs] = await Promise.all([requestJson<VoiceOutputSessionBook>(projectUrl(project)), requestJson<VoiceOutput[]>(`/api/projects/${encodeURIComponent(project)}/voice-outputs`)]);
      if (!mounted.current || token !== generation.current || props.current.projectId !== project) return;
      setOutputsValue(nextOutputs);
      if (nextBook.activeVersionId !== bookRef.current?.activeVersionId) {
        applyCheckout(nextBook, token, project);
        return;
      }
      updateBookOnly(nextBook, token, project);
      const updated = await flushState(token, project);
      if (!mounted.current || token !== generation.current || props.current.projectId !== project) return;
      const outputId = activeVersion(updated ?? nextBook)?.state.outputId;
      props.current.onOpenOutput(nextOutputs.find((item) => item.id === outputId) ?? null);
      return undefined;
    });
  }, [enqueue, setOutputsValue]);

  const selectedVersion = activeVersion(book);
  const configSignature = comparableConfig(config);
  useEffect(() => {
    if (!loaded || !script.ready || script.error || !selectedVersion || !state || busy || error) return;
    if (comparableScript(script.document) === comparableScript(state.script) && configSignature === comparableConfig(state.config)) return;
    const timer = window.setTimeout(() => { void flush().catch(() => undefined); }, 350);
    return () => window.clearTimeout(timer);
  }, [loaded, script.ready, script.error, script.document, configSignature, selectedVersion?.id, state?.revision, state?.script, state?.config, busy, error, flush]);

  const ready = loaded && script.ready && !script.error && (!book?.activeVersionId || Boolean(state && checkedOut.current === `${projectId}:${book.activeVersionId}`));
  return { book, state, activeVersion: selectedVersion, ready, busy, transitioning, error, flush, reload, change, editLayer, adoptOutput, slotAction, refreshAfterGeneration };
}
