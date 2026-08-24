import type { TimelineGainKeyframe } from "../../domain/types";

export interface GainEnvelopePoint {
  min: number;
  max: number;
}

const CEILING = 10 ** (-1 / 20);
const MAX_KEYFRAMES = 256;
const RAMP_SECONDS = 0.012;

export function dbToLinear(gainDb: number) {
  return 10 ** (gainDb / 20);
}

function clampGainDb(value: number) {
  return Math.max(-96, Math.min(96, Number.isFinite(value) ? value : 0));
}

function pushKeyframe(frames: TimelineGainKeyframe[], time: number, gainDb: number) {
  const safeTime = Math.max(0, time);
  const safeGain = clampGainDb(gainDb);
  const previous = frames[frames.length - 1];
  if (previous && Math.abs(previous.time - safeTime) < 0.0005) {
    previous.gainDb = safeGain;
    return;
  }
  frames.push({ id: `auto-${frames.length + 1}`, time: safeTime, gainDb: safeGain, source: "auto-calibration" });
}

/** Builds a compact gain envelope: global gain remains outside each peak region. */
export function buildAutoCalibrationKeyframes(points: GainEnvelopePoint[], duration: number, baseGainDb: number): TimelineGainKeyframe[] {
  if (!points.length || !Number.isFinite(duration) || duration <= 0) return [];
  const base = clampGainDb(baseGainDb);
  const sourceThreshold = CEILING / dbToLinear(base);
  const pointDuration = duration / points.length;
  const permittedGap = Math.max(1, Math.floor(points.length / 1600));
  const groups: Array<{ start: number; end: number; peak: number }> = [];
  let start = -1;
  let end = -1;
  let peak = 0;

  for (let index = 0; index < points.length; index += 1) {
    const pointPeak = Math.max(Math.abs(points[index].min), Math.abs(points[index].max));
    if (pointPeak > sourceThreshold) {
      if (start < 0) start = index;
      end = index;
      peak = Math.max(peak, pointPeak);
    } else if (start >= 0 && index - end > permittedGap) {
      groups.push({ start, end, peak });
      start = -1;
      end = -1;
      peak = 0;
    }
  }
  if (start >= 0) groups.push({ start, end, peak });

  const frames: TimelineGainKeyframe[] = [];
  for (const group of groups) {
    if (frames.length + 4 > MAX_KEYFRAMES) break;
    const reducedGain = clampGainDb(Math.min(base, 20 * Math.log10(CEILING / Math.max(group.peak, 0.000001))));
    const startTime = group.start * pointDuration;
    const endTime = Math.min(duration, (group.end + 1) * pointDuration);
    pushKeyframe(frames, Math.max(0, startTime - RAMP_SECONDS), base);
    pushKeyframe(frames, startTime, reducedGain);
    pushKeyframe(frames, endTime, reducedGain);
    pushKeyframe(frames, Math.min(duration, endTime + RAMP_SECONDS), base);
  }
  return frames;
}

export function gainAtTime(keyframes: TimelineGainKeyframe[], time: number, fallbackGainDb: number) {
  let previousTime = 0;
  let previousGain = fallbackGainDb;
  for (const frame of keyframes) {
    if (frame.time > time) {
      const span = frame.time - previousTime;
      if (span <= 0.0005) return frame.gainDb;
      const progress = Math.max(0, Math.min(1, (time - previousTime) / span));
      return previousGain + (frame.gainDb - previousGain) * progress;
    }
    previousTime = frame.time;
    previousGain = frame.gainDb;
  }
  return previousGain;
}