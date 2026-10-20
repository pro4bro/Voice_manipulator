export interface ClipPlacement {
  start: number;
  inPoint: number;
  outPoint?: number | null;
}

export function clipLength(duration: number, placement: ClipPlacement): number {
  return Math.max(0, Math.min(duration, placement.outPoint ?? duration) - placement.inPoint);
}

export function sourceTime(time: number, duration: number, placement: ClipPlacement): number | null {
  const elapsed = time - placement.start;
  const length = clipLength(duration, placement);
  return elapsed >= 0 && elapsed < length ? placement.inPoint + elapsed : null;
}

export function timelineLength(videoDuration: number, audioDuration: number, video: ClipPlacement, audio: ClipPlacement): number {
  return Math.max(1, video.start + clipLength(videoDuration, video), audio.start + clipLength(audioDuration, audio));
}

export function clampPlacement(value: number, maximum: number): number {
  return Math.round(Math.max(0, Math.min(maximum, Number.isFinite(value) ? value : 0)) * 100) / 100;
}
