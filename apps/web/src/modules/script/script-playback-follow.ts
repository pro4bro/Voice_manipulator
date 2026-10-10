import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { subscribePlaybackInteraction } from "../../domain/playback-sync";

/** Manual reading takes priority until the user explicitly seeks/selects again. */
export function useScriptPlaybackFollow(root: RefObject<HTMLElement | null>, identity: string | null | readonly string[], bindingKey?: unknown) {
  const ids = typeof identity === "string" ? [identity] : identity ?? [];
  const identityKey = JSON.stringify(ids);
  const [revision, setRevision] = useState(0);
  const state = useRef({ identity: identityKey, paused: false, lastWord: "", preferredAssetId: null as string | null });
  if (state.current.identity !== identityKey) state.current = { identity: identityKey, paused: false, lastWord: "", preferredAssetId: null };
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const pause = () => { state.current.paused = true; };
    const pointer = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('[role="scrollbar"]')) pause();
    };
    const key = (event: KeyboardEvent) => {
      if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) pause();
    };
    element.addEventListener("wheel", pause, { passive: true });
    element.addEventListener("touchstart", pause, { passive: true });
    element.addEventListener("pointerdown", pointer, true);
    element.addEventListener("keydown", key, true);
    const unsubscribe = subscribePlaybackInteraction((assetIds) => {
      if (!assetIds.some((id) => ids.includes(id))) return;
      state.current.paused = false;
      state.current.lastWord = "";
      if (assetIds.length === 1) state.current.preferredAssetId = assetIds[0];
      setRevision((current) => current + 1);
    });
    return () => {
      element.removeEventListener("wheel", pause); element.removeEventListener("touchstart", pause);
      element.removeEventListener("pointerdown", pointer, true); element.removeEventListener("keydown", key, true);
      unsubscribe();
    };
  }, [root, identityKey, bindingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    revision,
    preferredAssetId: state.current.preferredAssetId,
    canFollow: () => !state.current.paused,
    resume: () => { state.current.paused = false; },
    shouldFollow: (index: number | string | null) => {
      const key = index === null || index === -1 ? "" : String(index);
      const changed = state.current.lastWord !== key;
      state.current.lastWord = key;
      return key !== "" && changed && !state.current.paused;
    },
  };
}

/** Use viewport rectangles: word wraps are positioned, so offsetTop is not a scroll offset. */
export function keepWordInView(view: HTMLElement, target: HTMLElement): number | null {
  const viewRect = view.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = targetRect.top - viewRect.top + view.scrollTop;
  const bottom = top + targetRect.height;
  if (top >= view.scrollTop + view.clientHeight * .18 && bottom <= view.scrollTop + view.clientHeight * .76) return null;
  const next = Math.max(0, Math.min(Math.max(0, view.scrollHeight - view.clientHeight), top - view.clientHeight * .38));
  view.scrollTop = next;
  return next;
}

/** Single-file and source-document tables share follow policy and virtual reveal. */
export function useScriptPlaybackVisibility(
  root: RefObject<HTMLElement | null>, view: RefObject<HTMLElement | null>, assetIds: readonly string[],
  activeWords: Readonly<Record<string, number>>, reveal?: (assetId: string, index: number) => boolean, enabled = true,
) {
  const follow = useScriptPlaybackFollow(root, assetIds, enabled);
  const previousAsset = useRef<string | null>(null);
  const pending = useRef<string | null>(null);
  const activeIds = assetIds.filter((id) => activeWords[id] >= 0);
  // Simultaneous speakers must not fight over the scrollbar. Keep the current
  // source until it falls silent; an explicit word selection chooses its source.
  const assetId = activeIds.find((id) => id === follow.preferredAssetId) ?? activeIds.find((id) => id === previousAsset.current) ?? activeIds[0];
  const index = assetId ? activeWords[assetId] : -1;
  const key = assetId && index >= 0 ? JSON.stringify([assetId, index, Boolean(reveal), enabled]) : null;
  useLayoutEffect(() => {
    previousAsset.current = assetId ?? null;
    const changed = follow.shouldFollow(key);
    if (!enabled || !view.current || !key || !follow.canFollow()) { pending.current = null; return; }
    if (!changed && pending.current !== key) return;
    if (reveal?.(assetId, index)) { pending.current = key; return; }
    // A virtualized word is mounted on the next commit. Finish positioning it
    // without waiting for playback to advance to a different word.
    pending.current = null;
    const target = [...view.current.querySelectorAll<HTMLElement>(`[data-script-word-index="${index}"]`)]
      .find((node) => !node.dataset.scriptSourceId || node.dataset.scriptSourceId === assetId);
    if (target && keepWordInView(view.current, target) !== null) view.current.dispatchEvent(new Event("scroll"));
  });
  return follow;
}
