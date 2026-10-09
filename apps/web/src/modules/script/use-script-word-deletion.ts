import { useEffect, useRef, useState } from "react";
import type { StudioWord } from "../../domain/types";
import { deleteScriptWords, type ReconciledScriptEdit } from "./script-text-reconciliation";

/** Large deletions leave the UI thread; later edits/navigation invalidate results. */
export function useScriptWordDeletion(assetId: string | null, text: string, words: StudioWord[], commit: (edit: ReconciledScriptEdit) => void) {
  const current = useRef({ assetId, text, words, commit });
  current.current = { assetId, text, words, commit };
  const pending = useRef<Worker | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pending.current?.terminate(); pending.current = null;
    setBusy(false); setError(null);
    return () => { pending.current?.terminate(); pending.current = null; };
  }, [assetId, text, words]);

  function remove(indexes: number[]) {
    if (pending.current) return false;
    setError(null);
    if (words.length < 1000 || typeof Worker === "undefined") {
      const edit = deleteScriptWords(text, indexes, words);
      if (!edit) return false;
      commit(edit); return true;
    }
    const snapshot = current.current;
    let worker: Worker;
    try {
      worker = new Worker(new URL("./script-word-deletion.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setError("Không mở được xử lý xóa từ. Hãy thử lại."); return false;
    }
    pending.current = worker; setBusy(true);
    const isCurrent = () => pending.current === worker && current.current.assetId === snapshot.assetId &&
      current.current.text === snapshot.text && current.current.words === snapshot.words;
    const finish = () => {
      worker.terminate();
      if (pending.current === worker) { pending.current = null; setBusy(false); }
    };
    worker.onmessage = (event: MessageEvent<{ text: string | null }>) => {
      if (!isCurrent()) { finish(); return; }
      finish();
      if (typeof event.data.text !== "string") { setError("Không xóa được vì từ đã chọn không khớp với Script hiện tại."); return; }
      const removed = new Set(indexes);
      snapshot.commit({ text: event.data.text, words: snapshot.words.filter((_, index) => !removed.has(index)), changedWordIndexes: [] });
    };
    worker.onerror = () => {
      const active = isCurrent(); finish();
      if (active) setError("Xử lý xóa từ gặp lỗi. Script vẫn được giữ nguyên; hãy thử lại.");
    };
    try { worker.postMessage({ text, indexes, wordTexts: words.map((word) => word.text) }); }
    catch { finish(); setError("Không gửi được yêu cầu xóa từ. Script vẫn được giữ nguyên."); return false; }
    return true;
  }
  return { remove, busy, error };
}
