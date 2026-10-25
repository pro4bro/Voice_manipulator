import { useLayoutEffect, useRef, type RefObject } from "react";

function fitTextareas(view: HTMLElement, sizes: WeakMap<HTMLTextAreaElement, string>) {
  const top = view.scrollTop, left = view.scrollLeft;
  for (const field of view.querySelectorAll<HTMLTextAreaElement>("textarea.voice-script__input")) {
    const style = getComputedStyle(field);
    const key = JSON.stringify([field.value, field.clientWidth, style.fontFamily, style.fontSize,
      style.fontWeight, style.fontStyle, style.lineHeight, style.letterSpacing, style.wordSpacing,
      style.paddingTop, style.paddingBottom, style.paddingLeft, style.paddingRight,
      style.borderTopWidth, style.borderBottomWidth, style.boxSizing]);
    if (sizes.get(field) === key) continue;
    // Only content/layout changes may collapse the field for measurement. A clock
    // update must not temporarily shrink a long row and clamp its parent's scroll.
    field.style.height = "auto";
    const pixels = (value: string) => Number.parseFloat(value) || 0;
    const adjustment = style.boxSizing === "border-box"
      ? pixels(style.borderTopWidth) + pixels(style.borderBottomWidth)
      : -pixels(style.paddingTop) - pixels(style.paddingBottom);
    field.style.height = `${Math.max(0, field.scrollHeight + adjustment)}px`;
    sizes.set(field, key);
  }
  // Real text/font/width changes still need measurement. Restore the viewport
  // after all rows are expanded; the browser clamps only to the final extent.
  if (view.scrollTop !== top) view.scrollTop = top;
  if (view.scrollLeft !== left) view.scrollLeft = left;
}

/** Auto-height rows follow content and wrapping, independently of the playback clock. */
export function useScriptTextareaSize(view: RefObject<HTMLElement | null>, binding: unknown) {
  const sizes = useRef(new WeakMap<HTMLTextAreaElement, string>());
  useLayoutEffect(() => { if (view.current) fitTextareas(view.current, sizes.current); });
  useLayoutEffect(() => {
    const element = view.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => fitTextareas(element, sizes.current));
    observer.observe(element);
    return () => observer.disconnect();
  }, [view, binding]);
}
