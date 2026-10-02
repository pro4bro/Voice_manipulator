import { useSyncExternalStore } from "react";

type PlaybackWordSnapshot = {
  assetId: string | null;
  wordIndex: number;
};

let snapshot: PlaybackWordSnapshot = { assetId: null, wordIndex: -1 };
let channelWords: Record<string, number> = {};
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getServerSnapshot() {
  return -1;
}

export function publishPlaybackWord(assetId: string | null | undefined, wordIndex: number) {
  const next: PlaybackWordSnapshot = { assetId: assetId ?? null, wordIndex };
  if (snapshot.assetId === next.assetId && snapshot.wordIndex === next.wordIndex && !Object.keys(channelWords).length) return;
  snapshot = next;
  channelWords = {};
  listeners.forEach((listener) => listener());
}

/** All imported channels share one playhead and may speak simultaneously. */
export function publishPlaybackWords(words: Record<string, number>) {
  if (JSON.stringify(channelWords) === JSON.stringify(words)) return;
  channelWords = words;
  snapshot = { assetId: null, wordIndex: -1 };
  listeners.forEach((listener) => listener());
}

const seekListeners = new Set<(assetId: string, seconds: number) => void>();
export function requestPlaybackSeek(assetId: string, seconds: number) {
  seekListeners.forEach((listener) => listener(assetId, seconds));
}
export function subscribePlaybackSeek(listener: (assetId: string, seconds: number) => void) {
  seekListeners.add(listener);
  return () => { seekListeners.delete(listener); };
}

export function usePlaybackWord(assetId: string | null | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => assetId && assetId in channelWords ? channelWords[assetId] : snapshot.assetId === (assetId ?? null) ? snapshot.wordIndex : -1,
    getServerSnapshot,
  );
}
