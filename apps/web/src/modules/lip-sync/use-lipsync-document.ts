import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api } from "../../api/client";
import { emptyLipSync, type LipSyncDocument, type LipSyncVersionState, type LipSyncFaceReview, type LipSyncHistoryDocument } from "../../domain/lipsync";

type Entry = LipSyncVersionState & {
  ready: boolean; busy: boolean; dirty: boolean; error: string | null;
  serial: number; generation: number; snapshot: number;
  gesture: { active: boolean; saved: boolean }; listeners: Set<() => void>;
};
const versions = new Map<string, Entry>();
function fresh(): Entry {
  return { document: emptyLipSync(), faceReviews: {}, past: [], future: [], ready: false, busy: false, dirty: false, error: null,
    serial: 0, generation: 0, snapshot: 0, gesture: { active: false, saved: false }, listeners: new Set() };
}
function publish(entry: Entry) { entry.snapshot++; entry.listeners.forEach((notify) => notify()); }

/** Each version owns its draft and history, including responses arriving after navigation. */
export function useLipSyncDocument(projectId: string, versionId?: string, enabled = true) {
  const entry = useMemo(() => {
    if (!versionId) return fresh();
    const key = `${projectId}/${versionId}`;
    if (!versions.has(key)) versions.set(key, fresh());
    return versions.get(key)!;
  }, [projectId, versionId]);
  useSyncExternalStore((notify) => { entry.listeners.add(notify); return () => { entry.listeners.delete(notify); }; }, () => entry.snapshot);

  async function reload() {
    if (!enabled || entry.busy) return;
    const generation = ++entry.generation;
    entry.ready = false; entry.error = null; publish(entry);
    try {
      const saved = versionId ? await api.getLipSyncState(projectId, versionId)
        : { document: await api.getLipSync(projectId), past: [], future: [] };
      if (generation !== entry.generation) return;
      Object.assign(entry, { faceReviews: {} }, saved, { dirty: false, ready: true }); entry.serial++; publish(entry);
    } catch (reason) { if (generation === entry.generation) { entry.error = String(reason); publish(entry); } }
  }
  useEffect(() => { if (enabled && !entry.ready) void reload(); }, [entry, enabled]); // Entry identity owns the project/version.

  function snapshot(): LipSyncHistoryDocument { return { ...entry.document, faceReviews: entry.faceReviews ?? {} }; }
  function remember() {
    if (!entry.gesture.active || !entry.gesture.saved) entry.past = [...entry.past.slice(-99), snapshot()];
    if (entry.gesture.active) entry.gesture.saved = true;
    entry.future = []; entry.serial++; entry.dirty = true;
  }
  function editReview(value: LipSyncFaceReview, baseline = false) {
    if (!entry.ready) return;
    if (!baseline) remember();
    entry.faceReviews = { ...entry.faceReviews, [value.analysisId]: value }; publish(entry);
  }
  function edit(change: (current: LipSyncDocument) => LipSyncDocument) {
    if (!entry.ready) return;
    const next = change(entry.document);
    if (next === entry.document) return;
    remember(); entry.document = next; publish(entry);
  }
  function undo(redo = false) {
    if (!entry.ready) return;
    const from = redo ? entry.future : entry.past, to = redo ? entry.past : entry.future;
    const next = from.at(-1);
    if (!next) return;
    const remaining = from.slice(0, -1), moved = [...to, snapshot()];
    entry.past = redo ? moved : remaining; entry.future = redo ? remaining : moved;
    const { faceReviews, ...document } = next;
    entry.faceReviews = faceReviews ?? {};
    entry.document = { ...document, revision: entry.document.revision }; entry.serial++; entry.dirty = true; publish(entry);
  }
  async function save(): Promise<LipSyncDocument | null> {
    if (!entry.ready || entry.busy) return null;
    if (!entry.dirty) return entry.document;
    const generation = entry.generation, serial = entry.serial;
    const state = { document: entry.document, faceReviews: entry.faceReviews ?? {}, past: entry.past, future: entry.future };
    entry.busy = true; entry.error = null; publish(entry);
    try {
      const saved = versionId ? (await api.saveLipSyncState(projectId, versionId, state)).document : await api.saveLipSync(projectId, state.document);
      if (generation !== entry.generation) return null;
      entry.document = { ...(serial === entry.serial ? saved : entry.document), revision: saved.revision };
      entry.dirty = serial !== entry.serial;
      return entry.dirty ? null : entry.document;
    } catch (reason) { if (generation === entry.generation) entry.error = String(reason); return null; }
    finally { if (generation === entry.generation) { entry.busy = false; publish(entry); } }
  }
  return { document: entry.document, faceReviews: entry.faceReviews ?? {}, editReview, ready: entry.ready, busy: entry.busy, error: entry.error, dirty: entry.dirty, edit, undo, save, reload,
    beginGesture: () => { entry.gesture = { active: true, saved: false }; },
    endGesture: () => { entry.gesture = { active: false, saved: false }; },
    canUndo: entry.past.length > 0, canRedo: entry.future.length > 0 };
}
