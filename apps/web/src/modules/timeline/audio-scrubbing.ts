import { useEffect, useRef } from "react";

interface Preview {
  audio: HTMLAudioElement;
  target: number;
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
  private previews: Preview[] = [];
  private allowed: (seconds: number) => boolean = () => true;
  private previewEnd: (seconds: number) => number = () => Infinity;

  begin(audios: HTMLAudioElement[], allowed: (seconds: number) => boolean = () => true,
    previewEnd: (seconds: number) => number = () => Infinity) {
    this.end();
    this.active = true;
    this.allowed = allowed;
    this.previewEnd = previewEnd;
    this.previews = [...new Set(audios)].map((audio) => {
      const preview: Preview = { audio, target: audio.currentTime, rate: audio.playbackRate,
        version: 0, lastSeek: -Infinity, seeked: () => undefined };
      audio.pause();
      audio.playbackRate = 1;
      preview.seeked = () => {
        if (!this.active || !this.previews.includes(preview)) return;
        if (Math.abs(audio.currentTime - preview.target) > .025) this.seek(preview);
        else this.play(preview);
      };
      audio.addEventListener("seeked", preview.seeked);
      audio.addEventListener("loadedmetadata", preview.seeked);
      return preview;
    });
  }

  move(seconds: number) {
    if (!this.active || !Number.isFinite(seconds)) return;
    for (const preview of this.previews) {
      preview.target = Math.max(0, Math.min(seconds, Number.isFinite(preview.audio.duration) ? preview.audio.duration : seconds));
      if (!this.allowed(preview.target)) {
        clearTimeout(preview.moveTimer);
        preview.moveTimer = undefined;
        clearTimeout(preview.stopTimer);
        ++preview.version;
        preview.audio.pause();
        continue;
      }
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
    preview.lastSeek = performance.now();
    ++preview.version;
    try { preview.audio.currentTime = preview.target; } catch { return; }
    if (!preview.audio.seeking) this.play(preview);
  }

  private play(preview: Preview) {
    if (!this.active || !this.allowed(preview.target)) return;
    preview.audio.playbackRate = 1;
    clearTimeout(preview.stopTimer);
    const version = ++preview.version;
    const sourceEnd = Number.isFinite(preview.audio.duration) ? preview.audio.duration : Infinity;
    const milliseconds = Math.max(0, Math.min(120, (Math.min(sourceEnd, this.previewEnd(preview.target)) - preview.target) * 1000));
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
        ++preview.version;
        preview.audio.pause();
      }, milliseconds);
    }).catch(() => undefined);
  }

  end() {
    const previews = this.previews;
    this.previews = [];
    this.active = false;
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

export function useAudioScrubber(sourceKey: string | undefined) {
  const ref = useRef<AudioScrubber | null>(null);
  ref.current ??= new AudioScrubber();
  const scrubber = ref.current;
  useEffect(() => () => scrubber.end(), [scrubber, sourceKey]);
  return scrubber;
}
