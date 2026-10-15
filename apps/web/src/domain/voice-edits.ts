import type { VoiceOutput } from "./types";
import type { WordSelection } from "./word-selection";

export interface StretchOperation { startFrame: number; endFrame: number; targetFrames: number; edge: "left" | "right" }
export interface VoiceEditPacket {
  document: { revision: number; cursor: number; sampleRate: number; sourceFrames: number; operations: StretchOperation[]; outputId: string };
  duration: number;
  audioUrl: string;
  output: VoiceOutput;
}
export interface VoiceEditController {
  packet: VoiceEditPacket | null;
  busy: boolean;
  error: string | null;
  preview: (operation: StretchOperation) => Promise<boolean>;
  commit: (operation: StretchOperation) => Promise<boolean>;
  cancel: () => void;
  history: (action: "undo" | "redo") => Promise<boolean>;
}

export function stretchFromDrag(start: number, end: number, deltaSeconds: number, edge: "left" | "right", rate: number): StretchOperation {
  const startFrame = Math.round(start * rate), endFrame = Math.round(end * rate);
  const length = endFrame - startFrame;
  return { startFrame, endFrame, edge, targetFrames: Math.max(Math.ceil(length / 2), Math.min(length * 2,
    length + Math.round(deltaSeconds * rate * (edge === "left" ? -1 : 1)))) };
}

export function mapStretchTime(time: number, op: StretchOperation, rate: number): number {
  const frame = Math.round(time * rate);
  if (frame <= op.startFrame) return time;
  if (frame >= op.endFrame) return (frame + op.targetFrames - (op.endFrame - op.startFrame)) / rate;
  return (op.startFrame + Math.round((frame - op.startFrame) * op.targetFrames / (op.endFrame - op.startFrame))) / rate;
}

export function inverseStretch(op: StretchOperation): StretchOperation {
  return { ...op, endFrame: op.startFrame + op.targetFrames, targetFrames: op.endFrame - op.startFrame };
}

export function mapStretchSelection(selection: WordSelection, op: StretchOperation, rate: number): WordSelection {
  return { ...selection, ranges: selection.ranges?.map((range) => ({ ...range,
    start: mapStretchTime(range.start, op, rate), end: mapStretchTime(range.end, op, rate) })) };
}
