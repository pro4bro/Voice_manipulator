import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ScrubPreviewPosition } from "../../domain/types";

export interface ScrubPreviewRange { start: number; end: number }
export const SCRUB_PREVIEW_SECONDS = .12;

interface Preview {
  audio: HTMLAudioElement;
  target: number;
  start: number;
  end: number;
  rate: number;
  version: number;
  lastSeek: number;
  moveTimer?: ReturnType<typeof setTimeout>;
  stopTimer?: ReturnType<typeof setTimeout>;
  seeked: () => void;
}

/** Short, normal-pitch previews at the pointer; no full-file decoding or AI work. */
export class AudioScrubber {
  active = false;
  position: ScrubPreviewPosition = "start";
  range: ScrubPreviewRange | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.range;
  private setRange(range: ScrubPreviewRange | null) {
    if (this.range?.start === range?.start && this.range?.end === range?.end) return;
    this.range = range;
    this.listeners.forEach((listener) => listener());
  }
  private previews: Preview[] = [];
  private allowed: (seconds: number) => boolean = () => true;
  private previewEnd: (seconds: number) => number = () => Infinity;
  private previewStart: (seconds: number) => number = () => 0;

  begin(audios: HTMLAudioElement[], allowed: (seconds: number) => boolean = () => true,
    previewEnd: (seconds: number) => number = () => Infinity,
    previewStart: (seconds: number) => number = () => 0) {
    this.end();
    this.active = true;
    this.allowed = allowed;
    this.previewEnd = previewEnd;
    this.previewStart = previewStart;
    this.previews = [...new Set(audios)].map((audio) => {
      const preview: Preview = { audio, target: audio.currentTime, start: audio.currentTime, end: audio.currentTime, rate: audio.playbackRate,
        version: 0, lastSeek: -Infinity, seeked: () => undefined };
      audio.pause();
      audio.playbackRate = 1;
      preview.seeked = () => {
        if (!this.active || !this.previews.includes(preview)) return;
        if (!this.allowed(preview.target) || preview.end <= preview.start) return;
        if (Math.abs(audio.currentTime - preview.start) > .025) this.seek(preview);
        else this.play(preview);
      };
      audio.addEventListener("seeked", preview.seeked);
      audio.addEventListener("loadedmetadata", preview.seeked);
      return preview;
    });
  }

  move(seconds: number) {
    if (!this.active || !Number.isFinite(seconds)) return;
    const offset = this.position === "start" ? 0 : this.position === "center" ? SCRUB_PREVIEW_SECONDS / 2 : SCRUB_PREVIEW_SECONDS;
    const start = Math.max(0, this.previewStart(seconds), seconds - offset);
    const knownDurations = this.previews.map(({ audio }) => audio.duration).filter(Number.isFinite);
    const sourceEnd = knownDurations.length && knownDurations.length === this.previews.length ? Math.max(...knownDurations) : Infinity;
    const end = Math.min(sourceEnd, this.previewEnd(seconds), seconds - offset + SCRUB_PREVIEW_SECONDS);
    const range = this.allowed(seconds) && end > start ? { start, end } : null;
    this.setRange(range);
    for (const preview of this.previews) {
      const previousTarget = preview.target, previousStart = preview.start, previousEnd = preview.end;
      preview.target = Math.max(0, Math.min(seconds, Number.isFinite(preview.audio.duration) ? preview.audio.duration : seconds));
      preview.start = start;
      preview.end = Math.min(end, Number.isFinite(preview.audio.duration) ? preview.audio.duration : end);
      if (!range || preview.end <= preview.start) {
        clearTimeout(preview.moveTimer);
        preview.moveTimer = undefined;
        clearTimeout(preview.stopTimer);
        ++preview.version;
        preview.audio.pause();
        try { preview.audio.currentTime = preview.target; } catch { /* Metadata may still be loading. */ }
        continue;
      }
      if (previousTarget === preview.target && previousStart === preview.start && previousEnd === preview.end) continue;
      clearTimeout(preview.stopTimer);
      preview.stopTimer = undefined;
      ++preview.version;
      if (preview.audio.seeking || preview.moveTimer) continue;
      const delay = Math.max(0, 40 - (performance.now() - preview.lastSeek));
      if (!delay) this.seek(preview);
      else preview.moveTimer = setTimeout(() => {
        preview.moveTimer = undefined;
        if (this.active) this.seek(preview);
      }, delay);
    }
  }

  private seek(preview: Preview) {
    if (!this.active) return;
    if (Number.isFinite(preview.audio.duration) && preview.start >= preview.audio.duration) { preview.audio.pause(); return; }
    preview.lastSeek = performance.now();
    ++preview.version;
    try { preview.audio.currentTime = preview.start; } catch { return; }
    if (!preview.audio.seeking) this.play(preview);
  }

  private play(preview: Preview) {
    if (!this.active || !this.allowed(preview.target)) return;
    preview.audio.playbackRate = 1;
    clearTimeout(preview.stopTimer);
    const version = ++preview.version;
    const milliseconds = Math.max(0, (preview.end - preview.start) * 1000);
    // play() at the media endpoint restarts it from zero, even for a 0ms
    // preview. Leave an empty preview paused at the requested final sample.
    if (milliseconds <= 0) { preview.audio.pause(); return; }
    void Promise.resolve(preview.audio.play()).then(() => {
      // A pending browser play may settle after release/unmount or another drag.
      if (!this.active || !this.previews.includes(preview)) {
        if (!this.previews.some((current) => current.audio === preview.audio)) preview.audio.pause();
        return;
      }
      if (version !== preview.version) {
        if (!this.allowed(preview.target)) preview.audio.pause();
        return;
      }
      preview.stopTimer = setTimeout(() => {
        preview.stopTimer = undefined;
        ++preview.version;
        preview.audio.pause();
        if (this.active && this.previews.includes(preview) && this.allowed(preview.target)) this.seek(preview);
      }, Math.max(1, Math.ceil(Math.min(milliseconds, Math.max(0, (preview.end - preview.audio.currentTime) * 1000)) - 1e-6)));
    }).catch(() => undefined);
  }

  end() {
    const previews = this.previews;
    this.previews = [];
    this.active = false;
    this.setRange(null);
    for (const preview of previews) {
      clearTimeout(preview.moveTimer);
      clearTimeout(preview.stopTimer);
      preview.audio.removeEventListener("seeked", preview.seeked);
      preview.audio.removeEventListener("loadedmetadata", preview.seeked);
      preview.audio.pause();
      preview.audio.playbackRate = preview.rate;
      try { preview.audio.currentTime = preview.target; } catch { /* Metadata may still be loading. */ }
    }
  }
}

export function useAudioScrubber(sourceKey: string | undefined, position: ScrubPreviewPosition = "center") {
  const ref = useRef<AudioScrubber | null>(null);
  ref.current ??= new AudioScrubber();
  const scrubber = ref.current;
  scrubber.position = position;
  useSyncExternalStore(scrubber.subscribe, scrubber.snapshot, () => null);
  useEffect(() => {
    const stop = () => scrubber.end();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") stop(); };
    window.addEventListener("blur", stop);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", escape);
    return () => { stop(); window.removeEventListener("blur", stop); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); window.removeEventListener("keydown", escape); };
  }, [scrubber, sourceKey, position]);
  return scrubber;
}
