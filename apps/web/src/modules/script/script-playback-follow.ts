import { useLayoutEffect, useRef, type RefObject } from "react";
import { subscribePlaybackSeek } from "../../domain/playback-sync";

/** Manual reading takes priority until the user explicitly seeks/selects again. */
export function useScriptPlaybackFollow(root: RefObject<HTMLElement | null>, identity: string | null) {
  const state = useRef({ identity, paused: false, lastWord: -2 });
  if (state.current.identity !== identity) state.current = { identity, paused: false, lastWord: -2 };
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
    const unsubscribe = subscribePlaybackSeek((assetId) => {
      if (assetId === identity) state.current.paused = false;
    });
    return () => {
      element.removeEventListener("wheel", pause); element.removeEventListener("touchstart", pause);
      element.removeEventListener("pointerdown", pointer, true); element.removeEventListener("keydown", key, true);
      unsubscribe();
    };
  }, [root, identity]);
  return {
    resume: () => { state.current.paused = false; },
    shouldFollow: (index: number) => {
      const changed = state.current.lastWord !== index;
      state.current.lastWord = index;
      return index >= 0 && changed && !state.current.paused;
    },
  };
}
