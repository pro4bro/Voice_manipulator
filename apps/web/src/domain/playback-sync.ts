import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

type PlaybackWordSnapshot = {
  assetId: string | null;
  wordIndex: number;
};

let snapshot: PlaybackWordSnapshot = { assetId: null, wordIndex: -1 };
let channelWords: Record<string, number> = {};
let playbackWords: Readonly<Record<string, number>> = {};
const listeners = new Set<() => void>();
let publisher: symbol | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getServerSnapshot() {
  return -1;
}

export function publishPlaybackWord(assetId: string | null | undefined, wordIndex: number) {
  publisher = null;
  const next: PlaybackWordSnapshot = { assetId: assetId ?? null, wordIndex };
  if (snapshot.assetId === next.assetId && snapshot.wordIndex === next.wordIndex && !Object.keys(channelWords).length) return;
  snapshot = next;
  channelWords = {};
  playbackWords = next.assetId ? { [next.assetId]: wordIndex } : {};
  listeners.forEach((listener) => listener());
}

/** All imported channels share one playhead and may speak simultaneously. */
export function publishPlaybackWords(words: Record<string, number>) {
  publisher = null;
  if (snapshot.assetId === null && JSON.stringify(channelWords) === JSON.stringify(words)) return;
  channelWords = words;
  playbackWords = words;
  snapshot = { assetId: null, wordIndex: -1 };
  listeners.forEach((listener) => listener());
}

/** Publish in the subtitle commit. A retiring Timeline cannot clear its successor. */
export function usePlaybackPublisher(words: Record<string, number> | null) {
  const owner = useRef(Symbol("timeline"));
  const latest = useRef(words); latest.current = words;
  const key = JSON.stringify(words);
  useLayoutEffect(() => {
    const words = latest.current;
    if (words === null) {
      if (publisher === owner.current) publishPlaybackWords({});
      return;
    }
    publishPlaybackWords(words);
    publisher = owner.current;
  }, [key]);
  useLayoutEffect(() => () => {
    if (publisher === owner.current) publishPlaybackWords({});
  }, []);
}

/** One source word per lane, using original indexes even for reviewed overlaps. */
export function activePlaybackWordAt(words: readonly { start: number; end: number }[], seconds: number): number {
  let active = -1;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (Number.isFinite(word.start) && Number.isFinite(word.end) && word.start <= seconds && seconds < word.end &&
        (active < 0 || word.start >= words[active].start)) active = index;
  }
  return active;
}

const seekListeners = new Set<(assetId: string, seconds: number) => void>();
const interactionListeners = new Set<(assetIds: readonly string[]) => void>();
/** A deliberate Timeline gesture resumes Script following without seeking audio again. */
export function notifyPlaybackInteraction(assetIds: readonly string[]) {
  interactionListeners.forEach((listener) => listener(assetIds));
}
export function subscribePlaybackInteraction(listener: (assetIds: readonly string[]) => void) {
  interactionListeners.add(listener);
  return () => { interactionListeners.delete(listener); };
}
export function requestPlaybackSeek(assetId: string, seconds: number) {
  notifyPlaybackInteraction([assetId]);
  seekListeners.forEach((listener) => listener(assetId, seconds));
}

const EMPTY_PLAYBACK_WORDS: Readonly<Record<string, number>> = {};
/** Source IDs remain distinct even when two tracks have the same word index. */
export function usePlaybackWords() {
  return useSyncExternalStore(subscribe, () => playbackWords, () => EMPTY_PLAYBACK_WORDS);
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
