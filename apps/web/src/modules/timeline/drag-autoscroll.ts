import { useEffect, useRef } from "react";

export interface DragViewport { left: number; width: number; start: number; span: number; duration: number; }
export const DRAG_SAFE_START = .1;
export const DRAG_SAFE_END = .9;

/** Keep the visual playhead inside the follow window while more source can pan.
 * At a physical source boundary, the pointer can still reach the first/last sample. */
export function dragSeekTime(view: DragViewport, clientX: number): number {
  const ratio = (clientX - view.left) / Math.max(1, view.width);
  const minimum = view.start > 0 ? DRAG_SAFE_START : 0;
  const maximum = view.start + view.span < view.duration ? DRAG_SAFE_END : 1;
  return Math.max(0, Math.min(view.duration, view.start + Math.max(minimum, Math.min(maximum, ratio)) * view.span));
}

/** Source seconds change with zoom; screen movement stays 10% of the view/sec. */
export function edgeScrollStart(view: DragViewport, clientX: number, elapsedMs: number): number {
  const ratio = (clientX - view.left) / Math.max(1, view.width);
  const direction = ratio <= DRAG_SAFE_START ? -1 : ratio >= DRAG_SAFE_END ? 1 : 0;
  return Math.max(0, Math.min(Math.max(0, view.duration - view.span),
    view.start + direction * view.span * .1 * Math.max(0, elapsedMs) / 1000));
}

export function zoomWindowStart(playhead: number, span: number, duration: number): number {
  return Math.max(0, Math.min(Math.max(0, duration - span), playhead - span / 2));
}

export function useDragAutoScroll(options: {
  sourceKey?: string;
  viewport: () => DragViewport | null;
  pan: (start: number) => void;
  seek: (time: number) => void;
}) {
  const latest = useRef(options); latest.current = options;
  const drag = useRef<{ x: number; last: number | null; frame: number; position: number | null; span: number; restricted: boolean } | null>(null);
  function stop() {
    const restricted = drag.current?.restricted ?? false;
    if (drag.current) cancelAnimationFrame(drag.current.frame);
    drag.current = null;
    return restricted;
  }
  function seek(x: number): boolean {
    if (!drag.current) return false;
    drag.current.x = x;
    const view = latest.current.viewport();
    if (!view || view.width <= 0 || view.span <= 0) return false;
    const time = dragSeekTime(view, x);
    const pointerTime = view.start + Math.max(0, Math.min(1, (x - view.left) / view.width)) * view.span;
    drag.current.restricted ||= Math.abs(time - pointerTime) > 1e-9;
    latest.current.seek(time);
    return true;
  }
  function frame(now: number) {
    const active = drag.current;
    if (!active) return;
    const view = latest.current.viewport();
    if (view && view.width > 0 && view.span > 0 && active.last !== null) {
      // Keep subpixel progress: reading rounded DOM scrollLeft each frame
      // would turn 1.33px/frame into 1px/frame and change the requested rate.
      const ratio = (active.x - view.left) / Math.max(1, view.width);
      const position = ratio > DRAG_SAFE_START && ratio < DRAG_SAFE_END ? view.start
        : active.span === view.span ? active.position ?? view.start : view.start;
      const start = edgeScrollStart({ ...view, start: position }, active.x, now - active.last);
      active.position = start;
      active.span = view.span;
      if (start !== view.start) {
        active.restricted = true;
        latest.current.pan(start);
        latest.current.seek(dragSeekTime({ ...view, start }, active.x));
      }
    }
    active.last = now;
    active.frame = requestAnimationFrame(frame);
  }
  useEffect(() => {
    stop();
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      stop(); window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop); window.removeEventListener("blur", stop);
    };
  }, [options.sourceKey]);
  return {
    begin(x: number) { stop(); drag.current = { x, last: null, frame: requestAnimationFrame(frame), position: null, span: 0, restricted: false }; },
    move(x: number) { if (drag.current) drag.current.x = x; },
    seek,
    stop,
  };
}
