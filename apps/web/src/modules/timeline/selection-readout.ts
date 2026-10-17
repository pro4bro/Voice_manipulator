export type ReadoutLayoutInput = {
  start: number;
  end: number;
  duration: number;
  canvasWidth: number;
  viewportLeft: number;
  viewportWidth: number;
};

export type ReadoutMarker = { x: number; width: number; row: 0 | 1 | 2 };
export type ReadoutLayout = { in: ReadoutMarker; duration: ReadoutMarker; out: ReadoutMarker; visible: boolean };

const TIMESTAMP_WIDTH = 76;
const DURATION_WIDTH = 76;
const EDGE_GAP = 2;

function clampCenter(x: number, width: number, left: number, right: number): number {
  const half = Math.min(width / 2, Math.max(0, (right - left) / 2));
  return Math.max(left + half, Math.min(x, right - half));
}

export function selectionReadoutLayout(input: ReadoutLayoutInput): ReadoutLayout {
  const scale = input.canvasWidth / Math.max(input.duration, 0.001);
  const start = input.start * scale;
  const end = input.end * scale;
  const left = input.viewportLeft + EDGE_GAP;
  const right = input.viewportLeft + Math.max(0, input.viewportWidth) - EDGE_GAP;
  const span = Math.max(0, right - left);
  const inWidth = Math.min(TIMESTAMP_WIDTH, span);
  const outWidth = Math.min(TIMESTAMP_WIDTH, span);
  const durationWidth = Math.min(DURATION_WIDTH, span);
  const narrow = end - start < TIMESTAMP_WIDTH * 2 + DURATION_WIDTH + 12;

  // For short ranges, move edge stamps outward so each value stays legible.
  const inX = narrow ? start - inWidth / 2 - 4 : start;
  const outX = narrow ? end + outWidth / 2 + 4 : end;
  const durationX = (start + end) / 2;
  const inMarker = { x: clampCenter(inX, inWidth, left, right), width: inWidth, row: 0 as const };
  const outMarker: ReadoutMarker = { x: clampCenter(outX, outWidth, left, right), width: outWidth, row: 0 };
  const edgesCollide = inMarker.x + inMarker.width / 2 + 4 > outMarker.x - outMarker.width / 2;
  if (edgesCollide) outMarker.row = 1;
  const collides = inMarker.x + inMarker.width / 2 + 4 > durationX - durationWidth / 2
    || durationX + durationWidth / 2 + 4 > outMarker.x - outMarker.width / 2;
  const duration: ReadoutMarker = { x: clampCenter(durationX, durationWidth, left, right), width: durationWidth, row: edgesCollide ? 2 : narrow || collides ? 1 : 0 };
  return { in: inMarker, duration, out: outMarker, visible: end >= input.viewportLeft && start <= input.viewportLeft + input.viewportWidth };
}
