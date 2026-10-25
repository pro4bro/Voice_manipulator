import { useId, useLayoutEffect, useRef, type RefObject } from "react";
import { keepWordInView, useScriptFollowLayout, useScriptPlaybackFollow } from "./script-playback-follow";
import { scriptTextPosition } from "./script-text-dom";

export interface ScriptTextPlayback { rowId: string; start: number; end: number; wordIndex: number }

/** A paint-only highlight never changes the editor caret or publishes a word selection. */
export function useScriptTextPlayback(root: RefObject<HTMLElement | null>, viewport: RefObject<HTMLElement | null>, scope: RefObject<HTMLElement | null>, assetId: string | null, active?: ScriptTextPlayback | null, followEnabled = true) {
  const name = `script-playback-${useId().replace(/[^a-z0-9]/giu, "")}`;
  const followRoot = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { followRoot.current = scope.current?.closest<HTMLElement>(".script-transcript-feed") ?? scope.current; }, [scope]);
  const follow = useScriptPlaybackFollow(followRoot, assetId);
  const activeRange = useRef<Range | null>(null);
  function reconcile() {
    const range = activeRange.current;
    if (!active || !range || !followEnabled || !follow.canFollow() || !viewport.current || typeof range.getBoundingClientRect !== "function") return;
    const view = viewport.current.closest<HTMLElement>(".script-table-scroll") ?? viewport.current;
    if (keepWordInView(view, range) !== null) view.dispatchEvent(new Event("scroll"));
  }
  useLayoutEffect(() => {
    root.current?.querySelectorAll("[data-playback-active]").forEach((element) => element.removeAttribute("data-playback-active"));
    const target = active && root.current?.querySelector<HTMLElement>(`[data-script-text-dialogue][data-row-id="${CSS.escape(active.rowId)}"]`);
    const highlights = typeof CSS !== "undefined" ? CSS.highlights : undefined;
    if (!active || !target) { activeRange.current = null; highlights?.delete(name); return; }
    target.dataset.playbackActive = "true";
    const range = document.createRange();
    const [an, ao] = scriptTextPosition(target, active.start), [bn, bo] = scriptTextPosition(target, active.end);
    range.setStart(an, ao); range.setEnd(bn, bo);
    activeRange.current = range;
    if (highlights && typeof Highlight !== "undefined") highlights.set(name, new Highlight(range));
    if (followEnabled && follow.shouldFollow(active.wordIndex)) reconcile();
    return () => { highlights?.delete(name); };
  });
  useScriptFollowLayout(viewport, reconcile, assetId);
  return `::highlight(${name}) { color: var(--text); background-color: #b9dcff88; }`;
}
