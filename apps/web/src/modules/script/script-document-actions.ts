import type { StudioWord } from "../../domain/types";
import { mapScriptWordsToText, reconcileScriptTextEdit, replaceScriptTextRange } from "./script-text-reconciliation";

export interface ScriptDocumentChange { assetId: string; text: string; words: StudioWord[]; }
export interface ScriptDocument { id: string; name: string; text: string; words: StudioWord[]; }
export interface ScriptDocumentMatch { assetId: string; start: number; end: number; }

/** Commands keep source IDs and independent clocks through every text edit. */
export function findScriptDocumentMatches(documents: ScriptDocument[], query: string, caseSensitive: boolean): ScriptDocumentMatch[] {
  if (!query) return [];
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "gu" : "giu");
  return documents.flatMap((document) => Array.from(document.text.matchAll(expression), (match) =>
    ({ assetId: document.id, start: match.index!, end: match.index! + match[0].length })));
}

export function replaceScriptDocumentMatches(documents: ScriptDocument[], matches: ScriptDocumentMatch[], replacement: string): ScriptDocumentChange[] {
  return documents.flatMap((document) => {
    const own = matches.filter((match) => match.assetId === document.id).sort((a, b) => b.start - a.start);
    if (!own.length) return [];
    const text = own.reduce((value, match) => value.slice(0, match.start) + replacement + value.slice(match.end), document.text);
    // An explicit single range pins repeated neighbouring word identities.
    const result = own.length === 1 ? replaceScriptTextRange(document.text, own[0], replacement, document.words)
      : reconcileScriptTextEdit(document.text, text, document.words);
    return [{ assetId: document.id, text: result.text, words: result.words }];
  });
}

export function formatScriptDocumentPauses(document: Pick<ScriptDocument, "text" | "words">): string {
  const ranges = new Map(mapScriptWordsToText(document.text, document.words).map((range) => [range.index, range]));
  const edits: { start: number; end: number; text: string }[] = [];
  for (let index = 0; index < document.words.length - 1; index++) {
    const current = ranges.get(index), next = ranges.get(index + 1);
    if (!current || !next || next.start < current.end) continue;
    const pause = document.words[index + 1].start - document.words[index].end;
    if (pause < .28 || document.text.slice(current.end, next.start).trim()) continue;
    const tail = document.text.slice(0, current.end).trimEnd();
    const punctuation = /[.!?,;:…]$/u.test(tail) ? "" : pause >= 1.05 ? "." : pause >= .56 ? "," : "";
    edits.push({ start: current.end, end: next.start, text: punctuation + (pause >= 1.05 ? "\n\n" : pause >= .36 ? "\n" : " ") });
  }
  return edits.reverse().reduce((value, edit) => value.slice(0, edit.start) + edit.text + value.slice(edit.end), document.text);
}
