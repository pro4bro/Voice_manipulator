import { useEffect, useRef, type RefObject } from "react";

/** Route commands to the Script under the pointer, or its keyboard focus. */
export function useScriptShortcuts(view: RefObject<HTMLElement | null>, commands: {
  selectAll?: () => void; undo?: () => void; redo?: () => void;
}) {
  const latest = useRef(commands);
  latest.current = commands;
  useEffect(() => {
    const root = view.current?.closest<HTMLElement>(".script-module") ?? view.current;
    if (!root) return;
    let hovered = root.matches(":hover"), pointerLeft = false;
    const enter = () => { hovered = true; pointerLeft = false; };
    const leave = () => { hovered = false; pointerLeft = true; };
    const focus = () => { pointerLeft = false; };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      if (!hovered && (pointerLeft || !root.contains(event.target as Node))) return;
      const input = event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']");
      if (event.key.toLowerCase() === "a" && !input && latest.current.selectAll) {
        event.preventDefault(); latest.current.selectAll();
      } else if (event.key.toLowerCase() === "z") {
        if (input && !input.closest(".script-editor, .script-table__word-editor, .channel-script-word-editor")) return;
        const action = event.shiftKey ? latest.current.redo : latest.current.undo;
        if (action) { event.preventDefault(); action(); }
      }
    };
    root.addEventListener("pointerenter", enter);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("focusin", focus);
    document.addEventListener("keydown", key);
    return () => { root.removeEventListener("pointerenter", enter); root.removeEventListener("pointerleave", leave); root.removeEventListener("focusin", focus); document.removeEventListener("keydown", key); };
  }, [view]);
}
