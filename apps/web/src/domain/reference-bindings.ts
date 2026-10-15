import type { ScriptSettings, VoiceOutput, VoiceScriptDocument } from "./types";
import type { WordSelection } from "./word-selection";
import { productionRanges } from "./production-selection";
import { effectiveScriptSettings } from "./voice-script-document";

export const REFERENCE_PROPERTIES = [
  ["timing", "Timing"], ["intonation", "Giọng điệu"], ["volume", "Âm lượng"],
  ["emotion", "Cảm xúc"], ["shout", "Hét to"], ["whisper", "Thì thầm"],
] as const;
export type ReferenceProperty = typeof REFERENCE_PROPERTIES[number][0];
export type ReferenceScope = NonNullable<WordSelection["scope"]>;
export interface ReferenceTarget {
  id: string; start: number | null; end: number | null; rowIds: string[]; wordIndexes: number[];
  textRanges: NonNullable<WordSelection["textRanges"]>; text: string;
}
export interface ReferenceSource {
  assetId: string; start: number; end: number; properties: ReferenceProperty[]; strength: number; priority: number;
  name?: string | null; audioSha256?: string | null;
}
export interface ReferenceBinding {
  id: string; scope: ReferenceScope; target: ReferenceTarget; sources: ReferenceSource[];
  status: "requested" | "missing" | "stale"; warnings: string[]; createdAt: string; updatedAt: string;
}
export interface ProductionNavigation { serial: number; scope: ReferenceScope; start: number | null; rowIds: string[] }
export function referenceSelection(binding: ReferenceBinding): WordSelection {
  const { target, scope } = binding;
  return { scope, indexes: target.wordIndexes, anchor: target.wordIndexes[0] ?? null,
    ranges: target.start === null ? [] : [{ id: target.id, start: target.start, end: target.end! }], rowIds: target.rowIds, textRanges: target.textRanges };
}
export interface ReferenceBindingDocument { version: 1; revision: number; bindings: ReferenceBinding[] }
export interface ReferenceAssignment { scope: ReferenceScope; targets: ReferenceTarget[]; sources: ReferenceSource[]; expectedRevision: number }
export interface ReferenceContextRequest { selection: WordSelection; x: number; y: number; origin: "waveform" | "subtitle" | "script" }
export interface ReferenceSession {
  id: string; scope: ReferenceScope; targets: ReferenceTarget[]; request: ReferenceContextRequest;
  expectedRevision: number | null; existing: ReferenceBinding[]; inherited: Record<string, ScriptSettings>;
}

/** Freeze target identity and text before opening any asynchronous picker. */
export function captureReferenceTargets(selection: WordSelection, output: VoiceOutput | null, script: VoiceScriptDocument): ReferenceTarget[] {
  if (!selection.scope) throw new Error("Vùng chọn chưa có source revision.");
  const rows = new Map(script.rows.map((row) => [row.id, row]));
  if (selection.scope.kind === "script") {
    return (selection.rowIds ?? []).map((id) => {
      const row = rows.get(id);
      if (!row) throw new Error("Câu đã chọn không còn tồn tại.");
      const textRanges = selection.textRanges?.filter((part) => part.rowId === id) ?? [];
      return { id: `sentence-${id}`, start: null, end: null, rowIds: [id], wordIndexes: [], textRanges,
        text: textRanges.length ? textRanges.map((part) => row.text.slice(part.start, part.end)).join("\n") : row.text };
    });
  }
  if (!output || output.id !== selection.scope.id || output.createdAt !== selection.scope.revision) throw new Error("Voice Output đã thay đổi. Chọn lại vùng đích.");
  const words = output.words ?? [];
  return productionRanges(selection, words).map((range) => {
    const wordIndexes = selection.indexes.filter((index) => words[index] && words[index].end > range.start && words[index].start < range.end);
    const rowIds = (selection.rowIds ?? []).filter((id) => output.segments?.some((segment) => segment.rowId === id && segment.end > range.start && segment.start < range.end));
    const textRanges = selection.textRanges?.filter((part) => rowIds.includes(part.rowId)) ?? [];
    const text = textRanges.length ? textRanges.map((part) => rows.get(part.rowId)?.text.slice(part.start, part.end) ?? "").join("\n")
      : wordIndexes.length ? wordIndexes.map((index) => words[index].text).join(" ")
        : rowIds.map((id) => output.segments?.find((segment) => segment.rowId === id)?.text ?? "").join("\n");
    return { ...range, rowIds, wordIndexes, textRanges, text };
  });
}

export function referenceInheritedSettings(targets: ReferenceTarget[], script: VoiceScriptDocument) {
  return Object.fromEntries(targets.flatMap((target) => target.rowIds.map((id) => {
    const row = script.rows.find((row) => row.id === id);
    return [id, row ? effectiveScriptSettings(script, row) : {}];
  })));
}

export interface ReferencePropertyResolution {
  state: "measured" | "unsupported" | "conflict" | "locked" | "stale" | "unavailable";
  reason: string; applied: false; value?: unknown;
  source?: ReferenceSource & { features?: { duration: number; rmsDbfs: number | null; peakDbfs: number | null }; state: string };
}
export interface ReferenceResolution {
  version: 1; bindingId: string; key: string; applied: false;
  identity: { rowId: string; voiceId: string | null; speakerProfileId: string | null }[];
  units: { rowId: string | null; properties: Partial<Record<ReferenceProperty, ReferencePropertyResolution>> }[];
}
