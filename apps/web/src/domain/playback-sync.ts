import { useSyncExternalStore } from "react";

type PlaybackWordSnapshot = {
  assetId: string | null;
  wordIndex: number;
};

let snapshot: PlaybackWordSnapshot = { assetId: null, wordIndex: -1 };
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
  if (snapshot.assetId === next.assetId && snapshot.wordIndex === next.wordIndex) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function usePlaybackWord(assetId: string | null | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.assetId === (assetId ?? null) ? snapshot.wordIndex : -1,
    getServerSnapshot,
  );
}