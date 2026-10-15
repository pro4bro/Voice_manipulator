import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { VoiceScriptDocument, VoiceScriptRow } from "../domain/types";
import { migrateScript } from "../domain/voice-script-document";

const content = (document: VoiceScriptDocument) => JSON.stringify({ ...document, revision: 0 });

export function useVoiceScriptDocument(projectId: string) {
  const key = `pro4bro:${projectId}:voice-script`;
  const [document, setDocument] = useState<VoiceScriptDocument>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
      return migrateScript(Array.isArray(saved) ? saved.filter((row) => row && typeof row.id === "string" && typeof row.text === "string") : []);
    } catch { return migrateScript([]); }
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const latest = useRef(document);
  latest.current = document;
  const revision = useRef(0);
  const persisted = useRef("");
  const savingTask = useRef<Promise<VoiceScriptDocument> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let active = true;
    setReady(false);
    const beforeLoad = content(latest.current);
    api.getVoiceScript(projectId).then((saved) => {
      if (!active) return;
      if (saved.revision && content(latest.current) !== beforeLoad) {
        setReady(true);
        setError("Script trong project đã có nội dung khác. Bản đang sửa được giữ trong trình duyệt; tải lại bản đã lưu để tiếp tục.");
        return;
      }
      const next = saved.revision ? migrateScript(saved.rows, saved) : latest.current;
      revision.current = saved.revision;
      persisted.current = saved.revision ? content(next) : content(migrateScript([]));
      setDocument(next);
      setReady(true);
      setError(null);
    }).catch((reason) => { if (active) setError(`Chưa đọc được Script trong project: ${String(reason)}`); });
    return () => { active = false; };
  }, [projectId, retry]);

  const flush = useCallback((): Promise<VoiceScriptDocument> => {
    if (savingTask.current) return savingTask.current;
    const task = (async () => {
      try {
        while (content(latest.current) !== persisted.current) {
          const snapshot = latest.current;
          const saved = await api.saveVoiceScript(projectId, { ...snapshot, revision: revision.current });
          revision.current = saved.revision;
          persisted.current = content(snapshot);
          if (mounted.current) setDocument((current) => ({ ...current, revision: saved.revision }));
        }
        return { ...latest.current, revision: revision.current };
      } catch (reason) {
        if (mounted.current) setError(`Script chưa lưu vào project: ${String(reason)}`);
        throw reason;
      }
    })();
    savingTask.current = task;
    const release = () => { if (savingTask.current === task) savingTask.current = null; };
    void task.then(release, release);
    return task;
  }, [projectId]);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(document.rows)); } catch { /* project file remains authoritative */ }
    if (!ready || error) return;
    void flush().catch(() => { /* explicit conflict remains visible, no automatic retry */ });
  }, [document, key, ready, error, flush]);

  const setRows = useCallback((rows: VoiceScriptRow[] | ((rows: VoiceScriptRow[]) => VoiceScriptRow[])) => setDocument((current) => migrateScript(typeof rows === "function" ? rows(current.rows) : rows, current)), []);
  const update = useCallback((next: VoiceScriptDocument) => setDocument(migrateScript(next.rows, next)), []);
  return { document, setRows, update, ready, error, flush, isSaved: ready && !error && content(document) === persisted.current, reload: () => setRetry((value) => value + 1) };
}
