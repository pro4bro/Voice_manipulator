import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./task-stop.css";

export type TaskStopMode = "queue" | "all";
export type TaskStopHandler = (mode: TaskStopMode) => void | Promise<unknown>;

/** Repeated clicks escalate only after confirmation; queue stop stays reversible by rerunning. */
export function TaskStop({ scope, onStop, disabled = false }: {
  scope: string; onStop: TaskStopHandler; disabled?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const lastClick = useRef<number | null>(null);
  const queued = useRef<Promise<unknown>>(Promise.resolve());
  const button = useRef<HTMLButtonElement>(null);
  const noButton = useRef<HTMLButtonElement>(null);
  const yesButton = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  useEffect(() => { if (confirm) noButton.current?.focus(); }, [confirm]);

  function close() {
    if (stopping) return;
    lastClick.current = null;
    setConfirm(false);
    button.current?.focus();
  }

  function click() {
    const now = Date.now();
    if (lastClick.current !== null && now - lastClick.current <= 1200) {
      lastClick.current = null;
      setConfirm(true);
      return;
    }
    lastClick.current = now;
    setError("");
    // Keep the button usable while queue acknowledgement arrives: a fast second click is intentional.
    queued.current = queued.current.catch(() => undefined).then(() => onStop("queue"));
    void queued.current.catch((reason) => setError(reason instanceof Error ? reason.message : "Không dừng được hàng đợi."));
  }

  async function stopAll() {
    setStopping(true);
    setError("");
    try {
      // A delayed queue response must not undo confirmed cancellation.
      await queued.current.catch(() => undefined);
      await onStop("all");
      setConfirm(false);
      button.current?.focus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không dừng được tác vụ đang chạy.");
    } finally { setStopping(false); }
  }

  return <>
    <button ref={button} className="button button--quiet task-stop" disabled={disabled || stopping}
      onClick={click} title={`Dừng hàng đợi ${scope}. Bấm hai lần liên tiếp để xác nhận dừng cả tác vụ đang chạy.`} type="button">Stop</button>
    {error && !confirm ? <span role="alert">{error}</span> : null}
    {confirm ? createPortal(<div className="task-stop-backdrop">
      <section aria-describedby={descriptionId} aria-labelledby={headingId} aria-modal="true" className="task-stop-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key === "Tab") {
            event.preventDefault();
            (document.activeElement === noButton.current ? yesButton.current : noButton.current)?.focus();
          }
        }} role="alertdialog">
        <h2 id={headingId}>Dừng hoàn toàn {scope}?</h2>
        <p id={descriptionId}>Anh đã bấm Stop liên tiếp. Chọn Yes để dừng toàn bộ hàng đợi và tác vụ {scope} đang chạy. Các kết quả đã hoàn tất và checkpoint đã lưu được giữ lại.</p>
        <p>Chọn No để giữ trạng thái dừng hàng đợi; tác vụ hiện tại tiếp tục chạy đến hết.</p>
        {error ? <p role="alert">{error}</p> : null}
        <footer><button ref={noButton} className="button button--quiet" disabled={stopping} onClick={close} type="button">No</button>
          <button ref={yesButton} className="button button--accent" disabled={stopping} onClick={() => void stopAll()} type="button">{stopping ? "Đang dừng…" : "Yes"}</button></footer>
      </section>
    </div>, document.body) : null}
  </>;
}
