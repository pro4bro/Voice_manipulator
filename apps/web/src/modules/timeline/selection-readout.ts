export type ReadoutLayoutInput = {
  start: number;
  end: number;
  duration: number;
  canvasWidth: number;
  viewportLeft: number;
  viewportWidth: number;
  displayStart?: number;
  displayEnd?: number;
};

export type ReadoutMarker = { x: number; width: number };
export type ReadoutLayout = { in: ReadoutMarker; duration: ReadoutMarker; out: ReadoutMarker; fontSize: number; visible: boolean };

const BASE_FONT_SIZE = 11;
const MONO_CHARACTER_WIDTH = 6.6;
const MIN_LABEL_WIDTH = 76;
const EDGE_GAP = 2;
const LABEL_GAP = 3;

function timestampWidth(value: number): number {
  return Math.max(MIN_LABEL_WIDTH, (`${value.toFixed(3)}s`.length * MONO_CHARACTER_WIDTH) + 4);
}

function distribute(centers: number[], widths: number[], left: number, right: number): number[] {
  const result = centers.map((center, index) => Math.max(left + widths[index] / 2,
    Math.min(center, right - widths[index] / 2)));
  for (let index = 1; index < result.length; index += 1) {
    const minimum = result[index - 1] + widths[index - 1] / 2 + LABEL_GAP + widths[index] / 2;
    result[index] = Math.max(result[index], minimum);
  }

  const overflow = result.at(-1)! + widths.at(-1)! / 2 - right;
  if (overflow > 0) for (let index = 0; index < result.length; index += 1) result[index] -= overflow;
  for (let index = result.length - 2; index >= 0; index -= 1) {
    const maximum = result[index + 1] - widths[index + 1] / 2 - LABEL_GAP - widths[index] / 2;
    result[index] = Math.min(result[index], maximum);
  }

  const underflow = left - (result[0] - widths[0] / 2);
  if (underflow > 0) for (let index = 0; index < result.length; index += 1) result[index] += underflow;
  return result;
}

export function selectionReadoutLayout(input: ReadoutLayoutInput): ReadoutLayout {
  const scale = input.canvasWidth / Math.max(input.duration, 0.001);
  const start = input.start * scale;
  const end = input.end * scale;
  const midpoint = (start + end) / 2;
  const left = input.viewportLeft + EDGE_GAP;
  const right = input.viewportLeft + Math.max(0, input.viewportWidth) - EDGE_GAP;
  const span = Math.max(0, right - left);
  const displayStart = input.displayStart ?? input.start;
  const displayEnd = input.displayEnd ?? input.end;
  const desiredWidths = [
    timestampWidth(displayStart),
    timestampWidth(displayEnd - displayStart),
    timestampWidth(displayEnd),
  ];
  const widthScale = Math.min(1, Math.max(0, span - 2 * LABEL_GAP) / desiredWidths.reduce((sum, width) => sum + width, 0));
  const widths = desiredWidths.map((width) => width * widthScale);
  const narrow = end - start < (widths[0] + widths[2]) / 2 + widths[1] + 2 * LABEL_GAP;
  const desiredCenters = narrow
    ? [midpoint - widths[0] / 2 - LABEL_GAP - widths[1] / 2, midpoint, midpoint + widths[1] / 2 + LABEL_GAP + widths[2] / 2]
    : [start, midpoint, end];
  const centers = distribute(desiredCenters, widths, left, right);
  return {
    in: { x: centers[0], width: widths[0] },
    duration: { x: centers[1], width: widths[1] },
    out: { x: centers[2], width: widths[2] },
    fontSize: BASE_FONT_SIZE * widthScale,
    visible: span > 0 && end >= input.viewportLeft && start <= input.viewportLeft + input.viewportWidth,
  };
}
