import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./task-stop.css";

export interface ProcessingSelection { ids: string[]; rerunAll: boolean; }
interface PendingChoice {
  label: string;
  ids: string[];
  missing: string[];
  resolve: (selection: ProcessingSelection | null) => void;
  returnFocus: HTMLElement | null;
}

/** Ask once, before any work starts, and resolve cancellation without dispatching. */
export function useProcessingChoice() {
  const [pending, setPending] = useState<PendingChoice | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current?.resolve(null), []);

  function choose(label: string, ids: string[], completed: ReadonlySet<string>): Promise<ProcessingSelection | null> {
    const missing = ids.filter((id) => !completed.has(id));
    if (missing.length === ids.length) return Promise.resolve({ ids, rerunAll: false });
    pendingRef.current?.resolve(null);
    return new Promise((resolve) => setPending({ label, ids, missing, resolve,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null }));
  }
  function settle(selection: ProcessingSelection | null) {
    pending?.resolve(selection);
    setPending(null);
    pending?.returnFocus?.focus();
  }
  return { choose, dialog: pending ? <ProcessingChoice pending={pending} onChoose={settle} /> : null };
}

function ProcessingChoice({ pending, onChoose }: {
  pending: PendingChoice; onChoose: (selection: ProcessingSelection | null) => void;
}) {
  const headingId = useId();
  const descriptionId = useId();
  const root = useRef<HTMLElement>(null);
  const initial = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (pending.missing.length ? initial.current : root.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [pending.missing.length]);
  return createPortal(<div className="task-stop-backdrop">
    <section ref={root} aria-describedby={descriptionId} aria-labelledby={headingId} aria-modal="true"
      className="task-stop-dialog" role="dialog" onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); onChoose(null); }
        if (event.key === "Tab") {
          const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
      <h2 id={headingId}>Chạy {pending.label}</h2>
      <p id={descriptionId}>{pending.ids.length - pending.missing.length}/{pending.ids.length} mục đã có kết quả. Anh muốn chạy toàn bộ các mục đã chọn, hay chỉ phần chưa có kết quả?</p>
      <p>Kết quả đã hoàn tất vẫn được giữ lại.</p>
      {!pending.missing.length ? <p>Tất cả các mục đã chọn đều có kết quả. Chọn chạy toàn bộ nếu muốn làm lại.</p> : null}
      <footer><button className="button button--quiet" onClick={() => onChoose(null)} type="button">Hủy</button>
        <button className="button button--quiet" onClick={() => onChoose({ ids: pending.ids, rerunAll: true })} type="button">Chạy toàn bộ ({pending.ids.length})</button>
        <button ref={initial} className="button button--accent" disabled={!pending.missing.length}
          onClick={() => onChoose({ ids: pending.missing, rerunAll: false })} type="button">Chỉ phần chưa có kết quả ({pending.missing.length})</button>
      </footer>
    </section>
  </div>, document.body);
}
