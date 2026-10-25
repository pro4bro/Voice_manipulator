import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { SpeakerProfile, StudioWord, VoiceScriptRow } from "../../domain/types";
import { ScriptTextPane } from "./ScriptTextPane";
import { buildSpeakerScriptRows } from "./script-table";
import { mapScriptWordsToText } from "./script-text-reconciliation";
import { scriptTextOffset, scriptTextPosition } from "./script-text-dom";

export interface TranscriptTextRange { start: number; end: number; text: string }
export interface TranscriptTextHandle { select: (start: number, end: number, focus?: boolean) => void; selected: () => TranscriptTextRange | null }

export function selectTranscriptTextRange(root: HTMLElement, start: number, end: number, focus = true) {
  const cells = [...root.querySelectorAll<HTMLElement>("[data-transcript-start]")];
  const a = cells.find((cell, index) => start >= Number(cell.dataset.transcriptStart) && (start < Number(cell.dataset.transcriptEnd) || index === cells.length - 1));
  const b = cells.find((cell) => end >= Number(cell.dataset.transcriptStart) && end <= Number(cell.dataset.transcriptEnd));
  if (!a || !b) return;
  const range = document.createRange();
  const [an, ao] = scriptTextPosition(a, start - Number(a.dataset.transcriptStart)), [bn, bo] = scriptTextPosition(b, end - Number(b.dataset.transcriptStart));
  range.setStart(an, ao); range.setEnd(bn, bo);
  if (focus) root.focus({ preventScroll: true });
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
}

/** Project text into speaker turns without adding/removing any transcript characters. */
export function transcriptTextTurns(value: string, words: StudioWord[], speakers: SpeakerProfile[], defaultSpeakerId: string | null) {
  const ranges = mapScriptWordsToText(value, words);
  const starts = new Map(ranges.map((range) => [range.index, range.start]));
  const groups = buildSpeakerScriptRows(words, speakers, defaultSpeakerId).filter((group) => starts.has(group.words[0].index));
  if (!groups.length) return [{ id: "draft", start: 0, end: value.length, text: value, speakerProfileId: defaultSpeakerId, label: speakers.find((speaker) => speaker.id === defaultSpeakerId)?.name ?? "Chưa gán Profile" }];
  return groups.map((group, index) => {
    const start = index ? starts.get(group.words[0].index)! : 0;
    const end = index + 1 < groups.length ? starts.get(groups[index + 1].words[0].index)! : value.length;
    return { id: group.id, start, end, text: value.slice(start, end), speakerProfileId: group.profileId, label: group.diarizationLabel };
  });
}

export const TranscriptTextView = forwardRef<TranscriptTextHandle, {
  value: string; words: StudioWord[]; speakers: SpeakerProfile[]; defaultSpeakerId?: string | null;
  assetId?: string | null; activeWordIndex?: number; label?: string; readOnly?: boolean; followPlayback?: boolean; leadingContent?: ReactNode;
  onChange: (text: string) => void;
  onRangeChange?: (range: TranscriptTextRange | null) => void;
  onEditingChange?: (editing: boolean) => void;
  onContextRange?: (range: TranscriptTextRange | null, x: number, y: number) => void;
  onWordHover?: (word: { index: number; left: number; top: number } | null) => void;
}>(function TranscriptTextView({ value, words, speakers, defaultSpeakerId = null, assetId = null, activeWordIndex = -1, label = "Script transcript", readOnly = false, followPlayback = true, leadingContent, onChange, onRangeChange, onEditingChange, onContextRange, onWordHover }, ref) {
  const root = useRef<HTMLDivElement | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const speakerKey = useMemo(() => JSON.stringify(speakers.map((speaker) => [speaker.id, speaker.name])), [speakers]);
  const wordsKey = useMemo(() => JSON.stringify(words.map((word) => [word.text, word.speakerId, word.diarizationSpeakerId, word.manualDiarizationSpeakerId])), [words]);
  const projection = useRef<{ value: string; wordsKey: string; assetId: string | null; speakerKey: string; defaultSpeakerId: string | null; turns: ReturnType<typeof transcriptTextTurns> } | null>(null);
  if (!projection.current || projection.current.value !== value || projection.current.wordsKey !== wordsKey || projection.current.assetId !== assetId || projection.current.speakerKey !== speakerKey || projection.current.defaultSpeakerId !== defaultSpeakerId) {
    projection.current = { value, wordsKey, assetId, speakerKey, defaultSpeakerId, turns: transcriptTextTurns(value, words, speakers, defaultSpeakerId) };
  }
  const turns = projection.current.turns;
  const ranges = useMemo(() => mapScriptWordsToText(value, words), [value, words]);
  function cell(id: string) { return root.current?.querySelector<HTMLElement>(`[data-script-text-dialogue][data-row-id="${CSS.escape(id)}"]`) ?? null; }
  function selection() {
    const selected = window.getSelection();
    if (!selected?.rangeCount || !root.current) return null;
    const range = selected.getRangeAt(0);
    const point = (node: Node, offset: number) => {
      const element = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-script-text-dialogue]");
      const turn = turns.find((item) => item.id === element?.dataset.rowId);
      return element && turn && root.current?.contains(element) ? turn.start + scriptTextOffset(element, node, offset) : null;
    };
    const start = point(range.startContainer, range.startOffset), end = point(range.endContainer, range.endOffset);
    return start === null || end === null ? null : { start, end, text: value.slice(start, end) };
  }
  useImperativeHandle(ref, () => ({ selected: selection, select(start, end, focus) { if (root.current) selectTranscriptTextRange(root.current, start, end, focus); } }));
  useLayoutEffect(() => {
    for (const turn of turns) {
      const element = cell(turn.id);
      if (element) { element.dataset.transcriptStart = String(turn.start); element.dataset.transcriptEnd = String(turn.end); }
    }
  });
  const active = ranges.find((range) => range.index === activeWordIndex);
  const activeTurn = active && turns.find((item) => active.start >= item.start && active.end <= item.end);
  const activeText = active && activeTurn ? { rowId: activeTurn.id, start: active.start - activeTurn.start, end: active.end - activeTurn.start, wordIndex: activeWordIndex } : null;
  const rows: VoiceScriptRow[] = turns.map((turn) => ({ id: turn.id, text: turn.text, speakerProfileId: turn.speakerProfileId, voiceId: null }));
  return <div className="transcript-text-editor" ref={panel} onSelect={() => onRangeChange?.(selection())} onFocusCapture={() => onEditingChange?.(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onEditingChange?.(false); }} onPointerLeave={() => onWordHover?.(null)} onPointerMove={(event) => {
    if (!onWordHover || !root.current) return;
    const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const position = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const node = caret?.startContainer ?? position?.offsetNode;
    const offset = caret?.startOffset ?? position?.offset;
    const element = node && (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-script-text-dialogue]");
    const turn = turns.find((item) => item.id === element?.dataset.rowId);
    const at = element && turn && node && offset !== undefined && root.current.contains(element) ? turn.start + scriptTextOffset(element, node, offset) : null;
    const word = at === null ? null : ranges.find((range) => range.start <= at && range.end >= at);
    onWordHover(word ? { index: word.index, left: event.clientX + 12, top: event.clientY + 14 } : null);
  }} onContextMenu={(event) => {
    if (!onContextRange) return;
    event.preventDefault(); onContextRange(selection(), event.clientX, event.clientY);
  }}>
    <ScriptTextPane followPlayback={followPlayback} playbackId={assetId} activeText={activeText} label={label} viewportRef={viewport} readOnly={readOnly} leadingContent={leadingContent} onRoot={(element) => { root.current = element; }} rows={rows} speakers={speakers} speakerLabels={Object.fromEntries(turns.map((turn) => [turn.id, turn.label]))} onTextChange={(id, text) => {
      const turn = turns.find((item) => item.id === id);
      if (!turn) return;
      const next = value.slice(0, turn.start) + text + value.slice(turn.end);
      const delta = text.length - (turn.end - turn.start);
      projection.current = { value: next, wordsKey, assetId, speakerKey, defaultSpeakerId, turns: turns.map((item) => item.id === id
        ? { ...item, text, end: item.end + delta } : item.start >= turn.end ? { ...item, start: item.start + delta, end: item.end + delta } : item) };
      onChange(next);
    }} />
  </div>;
});
