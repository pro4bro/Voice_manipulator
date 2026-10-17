import { useEffect, useRef } from "react";

export interface DragViewport { left: number; width: number; start: number; span: number; duration: number; }

/** Source seconds change with zoom; screen movement stays 10% of the view/sec. */
export function edgeScrollStart(view: DragViewport, clientX: number, elapsedMs: number): number {
  const ratio = (clientX - view.left) / Math.max(1, view.width);
  const direction = ratio <= .1 ? -1 : ratio >= .9 ? 1 : 0;
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
  const drag = useRef<{ x: number; last: number | null; frame: number; position: number | null; span: number } | null>(null);
  function stop() {
    if (drag.current) cancelAnimationFrame(drag.current.frame);
    drag.current = null;
  }
  function frame(now: number) {
    const active = drag.current;
    if (!active) return;
    const view = latest.current.viewport();
    if (view && active.last !== null) {
      // Keep subpixel progress: reading rounded DOM scrollLeft each frame
      // would turn 1.33px/frame into 1px/frame and change the requested rate.
      const ratio = (active.x - view.left) / Math.max(1, view.width);
      const position = ratio > .1 && ratio < .9 ? view.start
        : active.span === view.span ? active.position ?? view.start : view.start;
      const start = edgeScrollStart({ ...view, start: position }, active.x, now - active.last);
      active.position = start;
      active.span = view.span;
      if (start !== view.start) {
        latest.current.pan(start);
        const ratio = Math.max(0, Math.min(1, (active.x - view.left) / Math.max(1, view.width)));
        latest.current.seek(Math.max(0, Math.min(view.duration, start + ratio * view.span)));
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
    begin(x: number) { stop(); drag.current = { x, last: null, frame: requestAnimationFrame(frame), position: null, span: 0 }; },
    move(x: number) { if (drag.current) drag.current.x = x; },
    stop,
  };
}
