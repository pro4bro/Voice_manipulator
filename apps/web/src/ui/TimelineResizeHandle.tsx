import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";

/** The shared bottom module is resized without rerendering the workspace clock. */
export function TimelineResizeHandle({ layoutKey }: { layoutKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(() => {
    try { const saved = Number(localStorage.getItem(`pro4bro:${layoutKey}:timeline-height`)); return saved >= 180 ? saved : null; }
    catch { return null; }
  });
  const cleanup = useRef<() => void>(() => {});
  function clamp(value: number) {
    const size = ref.current?.parentElement?.getBoundingClientRect().height ?? 0;
    return Math.round(Math.max(180, Math.min(Math.max(180, size - 187), value)));
  }
  useLayoutEffect(() => {
    const board = ref.current?.parentElement;
    if (!board || height === null) return;
    const value = clamp(height);
    board.style.setProperty("--bottom-height", `${value}px`);
    try { localStorage.setItem(`pro4bro:${layoutKey}:timeline-height`, String(value)); } catch { /* session layout still works */ }
    return () => { board.style.removeProperty("--bottom-height"); };
  }, [height, layoutKey]);
  useEffect(() => {
    const board = ref.current?.parentElement;
    const resize = () => setHeight((value) => value === null ? null : clamp(value));
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (board) observer?.observe(board);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, []);
  useEffect(() => () => cleanup.current(), []);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanup.current();
    const start = event.clientY;
    const initial = ref.current?.parentElement?.querySelector(".module-column--bottom")?.getBoundingClientRect().height ?? 270;
    const move = (next: globalThis.PointerEvent) => { if (next.pointerId === event.pointerId) setHeight(clamp(initial + start - next.clientY)); };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); window.removeEventListener("blur", stop); };
    cleanup.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
  }
  return <div aria-label="Co kéo chiều cao Timeline" aria-orientation="horizontal" aria-valuemin={180} aria-valuenow={height ?? undefined} className="timeline-resizer" onPointerDown={begin} onKeyDown={(event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const current = height ?? ref.current?.parentElement?.querySelector(".module-column--bottom")?.getBoundingClientRect().height ?? 270;
    setHeight(clamp(current + (event.key === "ArrowUp" ? 24 : -24)));
  }} ref={ref} role="separator" tabIndex={0}><i /></div>;
}
