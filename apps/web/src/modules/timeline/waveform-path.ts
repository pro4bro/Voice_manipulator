export interface WaveformPathPoint {
  x: number;
  min: number;
  max: number;
}

export function waveformY(value: number, height: number): number {
  return height / 2 - clamp(value) * (height * 0.46);
}

/** Builds the same filled peak envelope used by the main Timeline canvas. */
export function waveformEnvelopePath(points: WaveformPathPoint[], height = 60, gain = 1): string {
  const paths: string[] = [];
  let segment: WaveformPathPoint[] = [];

  const flush = () => {
    if (!segment.length) return;
    if (segment.length === 1) {
      const point = segment[0];
      const upper = waveformY(point.max * gain, height);
      const lower = waveformY(point.min * gain, height);
      const left = Math.max(0, point.x - 0.6);
      const right = Math.min(1000, point.x + 0.6);
      paths.push(`M${left.toFixed(2)} ${upper.toFixed(2)}L${right.toFixed(2)} ${upper.toFixed(2)}L${right.toFixed(2)} ${lower.toFixed(2)}L${left.toFixed(2)} ${lower.toFixed(2)}Z`);
      segment = [];
      return;
    }
    const upper = segment.map((point) => `${point.x.toFixed(2)} ${waveformY(point.max * gain, height).toFixed(2)}`);
    const lower = [...segment].reverse().map((point) => `${point.x.toFixed(2)} ${waveformY(point.min * gain, height).toFixed(2)}`);
    paths.push(`M${upper.join("L")}L${lower.join("L")}Z`);
    segment = [];
  };

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.min) || !Number.isFinite(point.max)) {
      flush();
      continue;
    }
    segment.push({ ...point, x: Math.max(0, Math.min(1000, point.x)) });
  }
  flush();
  return paths.join("");
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
