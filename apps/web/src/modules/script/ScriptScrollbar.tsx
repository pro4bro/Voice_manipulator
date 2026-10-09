import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type RefObject } from "react";
import "./script-scrollbar.css";

interface ScrollGeometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
  trackTop: number;
}

interface DragState {
  pointerId: number;
  startY: number;
  startScrollTop: number;
}

const EMPTY_GEOMETRY: ScrollGeometry = {
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 0,
  trackHeight: 0,
  trackTop: 0,
};

function sameGeometry(a: ScrollGeometry, b: ScrollGeometry) {
  return a.scrollTop === b.scrollTop && a.scrollHeight === b.scrollHeight &&
    a.clientHeight === b.clientHeight && a.trackHeight === b.trackHeight && a.trackTop === b.trackTop;
}

/** A visible, keyboard-operable scrollbar synchronized to an existing Script viewport. */
export function ScriptScrollbar({ viewportRef, label, className }: {
  viewportRef: RefObject<HTMLElement | null>;
  label: string;
  className?: string;
}) {
  const generatedId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [geometry, setGeometry] = useState(EMPTY_GEOMETRY);
  const viewportId = viewportRef.current?.id || generatedId;
  const maxScroll = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
  const trackHeight = Math.max(0, geometry.trackHeight);
  const thumbHeight = maxScroll > 0
    ? Math.min(trackHeight, Math.max(Math.min(28, trackHeight), trackHeight * geometry.clientHeight / geometry.scrollHeight))
    : trackHeight;
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const thumbTop = maxScroll > 0
    ? Math.max(0, Math.min(thumbTravel, geometry.scrollTop / maxScroll * thumbTravel))
    : 0;
  const enabled = maxScroll > 0 && trackHeight > 0;

  // A textarea's scrollHeight can change with inherited font styles without
  // changing its own observed border box or producing a DOM mutation.
  useLayoutEffect(() => {
    const viewport = viewportRef.current, track = trackRef.current;
    if (!viewport || !track) return;
    const bounds = track.getBoundingClientRect();
    const next = { scrollTop: viewport.scrollTop, scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight, trackHeight: bounds.height || track.clientHeight, trackTop: bounds.top };
    setGeometry((current) => sameGeometry(current, next) ? current : next);
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return undefined;
    if (!viewport.id) viewport.id = generatedId;
    const previousOverflowAnchor = viewport.style.overflowAnchor;
    viewport.style.overflowAnchor = "none";

    let resizeObserver: ResizeObserver | null = null;
    const observeItems = () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      resizeObserver.observe(viewport);
      if (trackRef.current) resizeObserver.observe(trackRef.current);
      for (const child of Array.from(viewport.children)) {
        if (child instanceof HTMLElement) resizeObserver.observe(child);
      }
    };
    const syncGeometry = () => {
      const bounds = track.getBoundingClientRect();
      const next: ScrollGeometry = {
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
        trackHeight: bounds.height || track.clientHeight,
        trackTop: bounds.top,
      };
      setGeometry((current) => sameGeometry(current, next) ? current : next);
    };

    viewport.addEventListener("scroll", syncGeometry, { passive: true });
    resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncGeometry);
    observeItems();
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      observeItems();
      syncGeometry();
    });
    mutationObserver?.observe(viewport, { attributes: true, characterData: true, childList: true, subtree: true });
    syncGeometry();
    return () => {
      viewport.removeEventListener("scroll", syncGeometry);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (viewport.id === generatedId) viewport.removeAttribute("id");
      viewport.style.overflowAnchor = previousOverflowAnchor;
    };
  }, [generatedId, viewportRef]);

  function setScrollTop(nextTop: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = Math.max(0, Math.min(maxScroll, nextTop));
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    const bounds = trackRef.current?.getBoundingClientRect();
    setGeometry((current) => ({ ...current, scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight,
      trackHeight: bounds?.height || trackRef.current?.clientHeight || current.trackHeight,
      trackTop: bounds?.top ?? current.trackTop }));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    if (event.target !== thumbRef.current) {
      const trackTop = event.currentTarget.getBoundingClientRect().top;
      const top = Math.max(0, Math.min(thumbTravel, event.clientY - trackTop - thumbHeight / 2));
      setScrollTop(thumbTravel > 0 ? top / thumbTravel * maxScroll : 0);
      return;
    }
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startScrollTop: geometry.scrollTop };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || thumbTravel <= 0) return;
    event.preventDefault();
    setScrollTop(drag.startScrollTop + (event.clientY - drag.startY) / thumbTravel * maxScroll);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let nextTop: number | null = null;
    switch (event.key) {
      case "ArrowUp": nextTop = geometry.scrollTop - 40; break;
      case "ArrowDown": nextTop = geometry.scrollTop + 40; break;
      case "PageUp": nextTop = geometry.scrollTop - geometry.clientHeight; break;
      case "PageDown": nextTop = geometry.scrollTop + geometry.clientHeight; break;
      case "Home": nextTop = 0; break;
      case "End": nextTop = maxScroll; break;
      default: return;
    }
    event.preventDefault();
    setScrollTop(nextTop);
  }

  return <div
    aria-controls={viewportId}
    aria-disabled={!enabled}
    aria-label={label}
    aria-orientation="vertical"
    aria-valuemax={maxScroll}
    aria-valuemin={0}
    aria-valuenow={Math.round(geometry.scrollTop)}
    className={`script-feed-scrollbar${className ? ` ${className}` : ""}${enabled ? "" : " is-static"}`}
    onKeyDown={handleKeyDown}
    onPointerCancel={handlePointerUp}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    ref={trackRef}
    role="scrollbar"
    tabIndex={0}
  >
    <i ref={thumbRef} style={{ height: `${thumbHeight}px`, top: `${thumbTop}px` }} />
  </div>;
}
