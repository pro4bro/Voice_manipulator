import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import { EMPTY_SELECTION, selectWord, sweepTo, type WordSelection } from "../../domain/word-selection";
import { legalRowMoves, rowMoveTo, type RowMoveDirection } from "./row-moves";
import { promoteTimestampWord } from "../../domain/timestamp-promotion";
import { readableColor } from "../../domain/accessible-color";
import type { EmotionLabel, EmotionStylePreferences, SpeakerProfile, StudioWord } from "../../domain/types";
import { useContrastPalette } from "../../ui/color-theme";
import { useTranscriptWindow } from "./transcript-window";
import { useScriptShortcuts } from "./script-shortcuts";
import { keepWordInView, useScriptPlaybackVisibility } from "./script-playback-follow";
export { keepWordInView } from "./script-playback-follow";
import { ScriptScrollbar } from "./ScriptScrollbar";
import { WordContextMenu, WordNoteItem } from "../../ui/WordContextMenu";
import "./script-selection.css";
import { ScriptRowSelection, ScriptRowSpeaker, ScriptTranscriptHeader, ScriptTranscriptRow, useScriptTableLayout, type ScriptTableColumn } from "./script-transcript-layout";
export type { ScriptTableColumn } from "./script-transcript-layout";

export interface SpeakerScriptRow {
  id: string;
  speakerKey: string;
  diarizationLabel: string;
  profileId: string | null;
  profile: SpeakerProfile | null;
  words: Array<{ index: number; word: StudioWord }>;
}

function normalizedDiarizationId(word: StudioWord) {
  // Manual Profile assignment is the visible grouping; raw diarization remains provenance.
  const profile = word.speakerId?.trim();
  if (profile) return `profile:${profile}`;
  const manual = word.manualDiarizationSpeakerId?.trim();
  if (manual) return manual;
  return word.diarizationSpeakerId?.trim() || word.asrSpeakerId?.trim() || "speaker-1";
}
function labelForDiarization(id: string) {
  if (id.startsWith("profile:")) return "Speaker 1";
  const number = /(?:speaker|spk)[-_ ]?(\d+)$/iu.exec(id)?.[1];
  return number ? `Speaker ${number}` : id.replace(/[-_]+/gu, " ");
}

function timecode(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

/**
 * `defaultSpeakerId` is the profile assigned to the whole take. A word nobody
 * has named belongs to that person - the same rule the dataset compiler uses -
 * so a one-voice file reads as that voice here without diarization or tagging.
 */
export function buildSpeakerScriptRows(words: StudioWord[], speakers: SpeakerProfile[], defaultSpeakerId: string | null = null): SpeakerScriptRow[] {
  const profileById = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const rows: SpeakerScriptRow[] = [];
  for (const [index, word] of words.entries()) {
    // Missing means inherit the take default; explicit null means the user
    // cleared this word's profile and must remain unassigned.
    const unnamed = word.speakerId !== null && !word.speakerId && !word.manualDiarizationSpeakerId && !word.diarizationSpeakerId && !word.asrSpeakerId;
    const diarizationId = unnamed && defaultSpeakerId ? `profile:${defaultSpeakerId}` : normalizedDiarizationId(word);
    const owner = word.speakerId || (unnamed ? defaultSpeakerId : null);
    const profile = owner ? profileById.get(owner) ?? null : null;
    const previous = rows[rows.length - 1];
    if (previous && previous.speakerKey === diarizationId) {
      previous.words.push({ index, word });
      if (!previous.profileId && profile) {
        previous.profileId = profile.id;
        previous.profile = profile;
        previous.diarizationLabel = profile.name;
      }
      continue;
    }
    rows.push({
      id: `${diarizationId}-${index}`,
      speakerKey: diarizationId,
      diarizationLabel: profile?.name ?? labelForDiarization(diarizationId),
      profileId: profile?.id ?? null,
      profile,
      words: [{ index, word }],
    });
  }
  return rows;
}

export function assignProfileToTurn(words: StudioWord[], indexes: number[], profileId: string | null) {
  const selected = new Set(indexes);
  return words.map((word, index) => {
    if (!selected.has(index)) return word;
    const updated = { ...word, speakerId: profileId };
    delete updated.manualDiarizationSpeakerId;
    return updated;
  });
}

export function assignProfileToWord(words: StudioWord[], index: number, profileId: string | null) {
  return assignProfileToTurn(words, [index], profileId);
}
export const assignProfileToWords = assignProfileToTurn;

export function moveWordToRow(words: StudioWord[], index: number, row: Pick<SpeakerScriptRow, "speakerKey" | "profileId">) {
  if (index < 0 || index >= words.length) return words;
  return words.map((word, wordIndex) => {
    if (wordIndex !== index) return word;
    const updated = { ...word, speakerId: row.profileId };
    if (row.profileId) delete updated.manualDiarizationSpeakerId;
    else updated.manualDiarizationSpeakerId = row.speakerKey;
    return updated;
  });
}
export function moveWordsToRow(words: StudioWord[], indexes: number[], row: Pick<SpeakerScriptRow, "speakerKey" | "profileId">) {
  const selected = new Set(indexes.filter((index) => index >= 0 && index < words.length));
  if (!selected.size) return words;
  return words.map((word, index) => {
    if (!selected.has(index)) return word;
    const updated = { ...word, speakerId: row.profileId };
    if (row.profileId) delete updated.manualDiarizationSpeakerId;
    else updated.manualDiarizationSpeakerId = row.speakerKey;
    return updated;
  });
}

export function updateWordText(words: StudioWord[], index: number, text: string) {
  const nextText = text.trim();
  if (!nextText || index < 0 || index >= words.length) return words;
  return words.map((word, wordIndex) => wordIndex === index ? { ...word, text: nextText, reviewState: "manual" as const, selectedVariant: "manual" as const } : word);
}

interface ScriptTableProps {
  trackName?: string;
  leadingContent?: ReactNode;
  deleteBusy?: boolean;
  onSelectedRowWordsChange?: (indexes: number[]) => void;
  assetId?: string | null;
  words: StudioWord[];
  speakers: SpeakerProfile[];
  activeWordIndex: number;
  emotionStyle: EmotionStylePreferences;
  getEmotionStyle: (emotion: EmotionLabel | null | undefined, preferences: EmotionStylePreferences) => CSSProperties | undefined;
  onAssignWords: (indexes: number[], profileId: string | null) => void;
  onDeleteWords?: (indexes: number[]) => boolean;
  onMoveWords: (indexes: number[], row: SpeakerScriptRow) => void;
  /** The profile the whole take belongs to, for words nobody named. */
  defaultSpeakerId?: string | null;
  onUpdateWordText: (index: number, text: string) => void;
  onAddText?: (index: number, text: string) => boolean;
  storageKey: string;
  selection: WordSelection;
  onSelectionChange: (selection: WordSelection) => void;
}
interface SpeakerTextProps {
  /** The profile the whole take belongs to, for words nobody named. */
  defaultSpeakerId?: string | null;
  words: StudioWord[];
  speakers: SpeakerProfile[];
  activeWordIndex: number;
  selection: WordSelection;
  onSelectionChange: (selection: WordSelection) => void;
}

/* The non-table view keeps each diarized turn intact while giving the user a compact reading layout. */
export function ScriptSpeakerText({ words, speakers, activeWordIndex, selection, onSelectionChange, defaultSpeakerId = null }: SpeakerTextProps) {
  const contrastPalette = useContrastPalette();
  const rows = useMemo(() => buildSpeakerScriptRows(words, speakers, defaultSpeakerId), [defaultSpeakerId, speakers, words]);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const sweepOriginRef = useRef<number | null>(null);
  const sweepBaseRef = useRef<WordSelection>(EMPTY_SELECTION);
  const sweepingRef = useRef(false);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useLayoutEffect(() => {
    if (activeWordIndex < 0) return;
    activeWordRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [activeWordIndex]);

  // This view reads like a page of prose, so it selects like one: press and
  // sweep across the words. Delegating from the container rather than binding
  // every word keeps a long transcript cheap, and lets the sweep run over the
  // spaces between words the way dragging over a paragraph does.
  const wordIndexAt = (clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-script-word-index]");
    const index = Number(target?.dataset.scriptWordIndex);
    return Number.isInteger(index) ? index : -1;
  };

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (!sweepingRef.current || sweepOriginRef.current === null) return;
      const index = wordIndexAt(event.clientX, event.clientY);
      if (index < 0) return;
      onSelectionChange(sweepTo(sweepBaseRef.current, sweepOriginRef.current, index, {
        ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey,
      }));
    };
    const end = () => { sweepingRef.current = false; };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
    };
  }, [onSelectionChange]);

  // A selection made in the Timeline or the table has to be visible here too.
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || selection.anchor === null) return;
    const target = view.querySelector<HTMLElement>(`[data-script-word-index="${selection.anchor}"]`);
    if (target) keepWordInView(view, target);
  }, [selection.anchor]);

  function beginSweep(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const index = wordIndexAt(event.clientX, event.clientY);
    if (index < 0) {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onSelectionChange(EMPTY_SELECTION);
      return;
    }
    const next = selectWord(selectionRef.current, index, {
      ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey,
    });
    sweepingRef.current = true;
    sweepOriginRef.current = index;
    sweepBaseRef.current = next;
    onSelectionChange(next);
  }

  if (!rows.length) return null;
  const held = new Set(selection.indexes);
  return <div aria-label="Transcript theo người nói" className="script-speaker-text" onPointerDown={beginSweep} ref={viewRef} title="Quét để chọn nhiều từ · Ctrl/Shift/Alt để cộng trừ">
    {rows.map((row) => {
      const color = row.profile?.color ? readableColor(row.profile.color, contrastPalette.word) : "var(--text-muted)";
      return <article className={row.words.some(({ index }) => index === activeWordIndex) ? "is-active" : ""} key={row.id}>
        <header style={{ borderLeftColor: color }}><i style={{ background: color }} /><b style={{ color }}>{row.diarizationLabel}</b></header>
        <p>{row.words.map(({ index, word }) => <span aria-selected={held.has(index)} className={`${index === activeWordIndex ? "is-active" : ""} ${held.has(index) ? "is-selected" : ""}`} data-script-word-index={index} key={`${word.start}-${word.end}-${index}`} ref={index === activeWordIndex ? activeWordRef : undefined} role="option">{word.text}{" "}</span>)}</p>
      </article>;
    })}
  </div>;
}
export function ScriptTable({ assetId = null, words, speakers, activeWordIndex, emotionStyle, getEmotionStyle, onAssignWords, onDeleteWords, onMoveWords, onUpdateWordText, onAddText, storageKey, selection, onSelectionChange, defaultSpeakerId = null, onSelectedRowWordsChange, leadingContent, deleteBusy = false, trackName }: ScriptTableProps) {
  const rows = useMemo(() => buildSpeakerScriptRows(words, speakers, defaultSpeakerId), [defaultSpeakerId, speakers, words]);
  const layout = useScriptTableLayout();
  const { columns, gridTemplateColumns } = layout;
  const scrollRef = useRef<HTMLDivElement>(null);
  const leadingContentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLButtonElement>(null);
  const selectedWordIndexes = useMemo(() => new Set(selection.indexes), [selection.indexes]);
  const [rowSelection, setRowSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const rowIds = rows.map((row) => row.id);
  const selectedRowIds = reconcileListSelection(rowSelection, rowIds).ids;
  const commandRef = useRef<HTMLDivElement>(null);
  useScriptShortcuts(commandRef, { selectAll: () => setRowSelection((current) => selectAllListItems(current, rowIds)) });
  const selectedRowWords = useMemo(() => rows.filter((row) => selectedRowIds.includes(row.id)).flatMap((row) => row.words.map((item) => item.index)), [rows, selectedRowIds.join("\0")]);
  useEffect(() => { onSelectedRowWordsChange?.(selectedRowWords); }, [selectedRowWords.join(","), onSelectedRowWordsChange]);
  const [wordEdit, setWordEdit] = useState<{ index: number; value: string; add?: boolean } | null>(null);
  const wordEditCommittedRef = useRef(false);
  const [speakerMenu, setSpeakerMenu] = useState<{ indexes: number[]; x: number; y: number } | null>(null);
  useEffect(() => { setSpeakerMenu(null); setWordEdit(null); wordEditCommittedRef.current = true; }, [words]);
  const [hoveredEstimate, setHoveredEstimate] = useState<{ index: number; x: number; y: number } | null>(null);
  const estimateHoverTimerRef = useRef<number | null>(null);
  // A sweep is measured from where it began, against the selection as it stood
  // then, so dragging back over the run shrinks it instead of piling up.
  const sweepOriginRef = useRef<number | null>(null);
  const sweepBaseRef = useRef<WordSelection>(EMPTY_SELECTION);
  const selectionRef = useRef(selection);
  const wordSelectionDraggingRef = useRef(false);
  const wordSelectionExtendedRef = useRef(false);
  // Dragging a selection carries it to another row; sweeping would replace it,
  // so a plain press on a word already selected arms this instead of a sweep.
  const [rowDragIndexes, setRowDragIndexes] = useState<number[] | null>(null);
  const rowDragRef = useRef<{ originX: number; originY: number; active: boolean } | null>(null);
  const rowDropRef = useRef<{ rowId: string; direction: RowMoveDirection } | null>(null);
  const [rowDrop, setRowDrop] = useState<{ rowId: string; direction: RowMoveDirection } | null>(null);
  selectionRef.current = selection;
  const [leadingContentHeight, setLeadingContentHeight] = useState(0);
  const transcriptWindow = useTranscriptWindow(rows, scrollRef, columns.find((column) => column.builtin === "content")?.width ?? 620, leadingContentHeight);
  const playbackIdentity = assetId ?? storageKey;
  const playbackFollow = useScriptPlaybackVisibility(commandRef, scrollRef, [playbackIdentity],
    { [playbackIdentity]: activeWordIndex }, (_assetId, index) => transcriptWindow.reveal(index));

  useLayoutEffect(() => {
    const element = leadingContentRef.current;
    const measure = () => {
      const height = (leadingContent && element ? element.getBoundingClientRect().height : 0)
        + (headerRef.current?.getBoundingClientRect().height ?? 0);
      setLeadingContentHeight((current) => Math.abs(current - height) > 0.5 ? height : current);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    if (element) observer.observe(element);
    if (headerRef.current) observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, [leadingContent, columns]);

  useEffect(() => setRowSelection((current) => reconcileListSelection(current, rowIds)), [words, speakers, defaultSpeakerId]);
  // A selection made in the Timeline has to be reachable here without hunting
  // for it, so the table follows the last word touched either side.
  useLayoutEffect(() => {
    const view = scrollRef.current;
    if (!view || selection.anchor === null) return;
    playbackFollow.resume();
    if (transcriptWindow.reveal(selection.anchor)) { updateScroll(view); return; }
    const target = view.querySelector<HTMLElement>(`[data-script-word-index="${selection.anchor}"]`);
    if (target && keepWordInView(view, target) !== null) updateScroll(view);
  }, [selection.anchor]);
  useEffect(() => {
    const moveSelection = (event: globalThis.PointerEvent) => extendWordSelectionAtPoint(event.clientX, event.clientY, modifiersOf(event));
    const endSelection = () => { wordSelectionDraggingRef.current = false; };
    window.addEventListener("pointermove", moveSelection, true);
    window.addEventListener("pointerup", endSelection, true);
    window.addEventListener("pointercancel", endSelection, true);
    return () => {
      window.removeEventListener("pointermove", moveSelection, true);
      window.removeEventListener("pointerup", endSelection, true);
      window.removeEventListener("pointercancel", endSelection, true);
    };
  }, []);

  function updateScroll(element: HTMLDivElement) {
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }

  function selectScriptRow(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !(event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) {
      event.preventDefault();
      setRowSelection((current) => selectAllListItems(current, rowIds));
    }
  }

  function toggleScriptRow(event: React.MouseEvent<HTMLButtonElement>, rowId: string) {
    event.stopPropagation();
    setRowSelection((current) => selectListItem(current, rowIds, rowId, { shift: event.shiftKey, toggle: !event.shiftKey || event.ctrlKey || event.metaKey }));
  }

  function assignProfileToSelectedRows(profileId: string) {
    if (!selectedRowIds.length || profileId === "__choose__") return;
    const selected = new Set(selectedRowIds);
    const indexes = rows.filter((row) => selected.has(row.id)).flatMap((row) => row.words.map(({ index }) => index));
    if (indexes.length) onAssignWords(indexes, profileId === "__none__" ? null : profileId);
  }

  function deleteSelectedRows() {
    if (deleteBusy || !onDeleteWords || !selectedRowIds.length || !window.confirm(`Xoá nội dung và word timing của ${selectedRowIds.length} Script row đã chọn?`)) return;
    const selected = new Set(selectedRowIds);
    const indexes = rows.filter((row) => selected.has(row.id)).flatMap((row) => row.words.map(({ index }) => index));
    if (indexes.length && !onDeleteWords(indexes)) {
      setDeleteMessage("Không xoá được các row này vì word timing không khớp chính xác với text hiện tại.");
      return;
    }
    setDeleteMessage(null);
    setRowSelection({ ids: [], anchorId: null });
  }

  function modifiersOf(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) {
    return { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey };
  }

  function beginWordSelection(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      promoteTimestampWord(assetId, index);
      return;
    }
    if (event.button === 0 || event.button === 2) promoteTimestampWord(assetId, null);
    if (event.button !== 0 && event.button !== -1) return;
    event.stopPropagation();
    wordSelectionExtendedRef.current = false;
    const bare = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    if (bare && selectionRef.current.indexes.includes(index) && selectionRef.current.indexes.length > 0) {
      wordSelectionDraggingRef.current = false;
      rowDragRef.current = { originX: event.clientX, originY: event.clientY, active: false };
      setRowDragIndexes([...selectionRef.current.indexes]);
      return;
    }
    wordSelectionDraggingRef.current = true;
    const next = selectWord(selectionRef.current, index, modifiersOf(event));
    sweepOriginRef.current = index;
    // A sweep continues from what this click produced, so Ctrl-sweeping keeps
    // everything picked up so far instead of dropping it at the first move.
    sweepBaseRef.current = next;
    onSelectionChange(next);
  }

  function extendWordSelectionAtPoint(clientX: number, clientY: number, modifiers: { ctrl: boolean; shift: boolean; alt: boolean }) {
    if (!wordSelectionDraggingRef.current) return;
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-script-word-index]");
    const index = Number(target?.dataset.scriptWordIndex);
    if (Number.isInteger(index)) extendWordSelection(index, modifiers);
  }

  function extendWordSelection(index: number, modifiers: { ctrl: boolean; shift: boolean; alt: boolean }) {
    const origin = sweepOriginRef.current;
    if (!wordSelectionDraggingRef.current || origin === null || origin === index) return;
    wordSelectionExtendedRef.current = true;
    onSelectionChange(sweepTo(sweepBaseRef.current, origin, index, modifiers));
  }

  useEffect(() => {
    if (!rowDragIndexes) return undefined;
    const move = (event: globalThis.PointerEvent) => {
      const drag = rowDragRef.current;
      if (!drag) return;
      if (!drag.active && Math.abs(event.clientX - drag.originX) + Math.abs(event.clientY - drag.originY) < 5) return;
      drag.active = true;
      const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-script-row-id]");
      const rowId = over?.dataset.scriptRowId;
      const allowed = rowId ? rowMoveTo(rows, rowDragIndexes, rowId) : null;
      const next = allowed ? { rowId: allowed.target.id, direction: allowed.direction } : null;
      rowDropRef.current = next;
      setRowDrop((current) => current?.rowId === next?.rowId ? current : next);
    };
    const finish = () => {
      const drag = rowDragRef.current;
      const drop = rowDropRef.current;
      rowDragRef.current = null;
      rowDropRef.current = null;
      setRowDragIndexes(null);
      setRowDrop(null);
      if (!drag?.active || !drop) return;
      const allowed = rowMoveTo(rows, rowDragIndexes, drop.rowId);
      if (allowed) onMoveWords(rowDragIndexes, allowed.target);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
  }, [onMoveWords, rowDragIndexes, rows]);

  function openSpeakerMenu(index: number, x: number, y: number) {
    const indexes = selectedWordIndexes.has(index) ? [...selectedWordIndexes].sort((left, right) => left - right) : [index];
    if (!selectedWordIndexes.has(index)) {
      sweepOriginRef.current = index;
      onSelectionChange({ indexes, anchor: index });
    }
    setWordEdit(null);
    setSpeakerMenu({ indexes: indexes.sort((left, right) => left - right), x, y });
  }

  function assignProfileToSelectedWords(profileId: string | null) {
    if (!speakerMenu?.indexes.length) return;
    onAssignWords(speakerMenu.indexes, profileId);
    setSpeakerMenu(null);
  }

  function moveSelectedWordsToRow(row: SpeakerScriptRow) {
    if (!speakerMenu?.indexes.length) return;
    onMoveWords(speakerMenu.indexes, row);
    setSpeakerMenu(null);
  }

  function confirmWordEdit() {
    if (!wordEdit || wordEditCommittedRef.current) return;
    if (wordEdit.add && !onAddText?.(wordEdit.index, wordEdit.value)) {
      setDeleteMessage("Không còn khoảng trống timing để thêm text ở đây."); return;
    }
    wordEditCommittedRef.current = true;
    if (!wordEdit.add) onUpdateWordText(wordEdit.index, wordEdit.value);
    setWordEdit(null);
  }

  function beginEstimateHover(event: React.PointerEvent<HTMLButtonElement>, index: number, word: StudioWord) {
    if (estimateHoverTimerRef.current !== null) window.clearTimeout(estimateHoverTimerRef.current);
    if (word.timingSource !== "user-interpolated") return;
    const { clientX: x, clientY: y } = event;
    estimateHoverTimerRef.current = window.setTimeout(() => setHoveredEstimate({ index, x, y }), 2000);
  }
  function clearEstimateHover() {
    if (estimateHoverTimerRef.current !== null) window.clearTimeout(estimateHoverTimerRef.current);
    estimateHoverTimerRef.current = null;
    setHoveredEstimate(null);
  }

  function renderWord(index: number, word: StudioWord) {
    const selected = selectedWordIndexes.has(index);
    const editing = wordEdit?.index === index;
    return <span className="script-table__word-wrap" key={`${word.start}-${word.end}-${index}`}>
      <button aria-label={`Chọn từ ${word.text}`} aria-pressed={selected} className={`script-table__word ${index === activeWordIndex ? "is-active" : ""} ${word.reviewState === "manual" ? "is-manual" : ""} ${word.timingSource === "user-interpolated" ? "is-time-estimated" : ""}`} data-script-word-index={index} onPointerEnter={(event) => { beginEstimateHover(event, index, word); extendWordSelection(index, modifiersOf(event)); }} onPointerLeave={clearEstimateHover} onClick={(event) => {
        event.stopPropagation();
        if (wordSelectionExtendedRef.current) {
          wordSelectionExtendedRef.current = false;
          return;
        }
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        sweepOriginRef.current = index;
        onSelectionChange({ indexes: [index], anchor: index });
        setSpeakerMenu(null);
      }} onDoubleClick={(event) => {
        // Editing is a second, deliberate gesture. Opening the editor on a single
        // click laid a form over the word, so a selected word could no longer be
        // picked up and dragged to another row - the click armed the drag and the
        // form then swallowed it.
        event.stopPropagation();
        setSpeakerMenu(null);
        wordEditCommittedRef.current = false;
        setWordEdit({ index, value: word.text });
      }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openSpeakerMenu(index, event.clientX, event.clientY); }} onPointerDown={(event) => beginWordSelection(event, index)} onPointerMove={(event) => extendWordSelectionAtPoint(event.clientX, event.clientY, modifiersOf(event))} onPointerUp={() => { wordSelectionDraggingRef.current = false; }} ref={index === activeWordIndex ? activeWordRef : undefined} style={getEmotionStyle(word.emotion, emotionStyle)} title="Quét hoặc Ctrl/Shift để chọn nhiều từ · kéo phần đầu hoặc cuối row sang row kề · double-click để sửa chữ · chuột phải để gán Speaker" type="button">{word.text}</button>{" "}
      {editing ? <form aria-label={wordEdit.add ? `Thêm text sau ${word.text}` : `Trình sửa từ ${word.text}`} className="script-table__word-editor" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) confirmWordEdit(); }} onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); confirmWordEdit(); }}>
        <input aria-label={wordEdit.add ? "Thêm text" : `Sửa từ ${word.text}`} autoFocus onChange={(event) => setWordEdit({ ...wordEdit, value: event.currentTarget.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); wordEditCommittedRef.current = true; setWordEdit(null); } }} value={wordEdit.value} />
      </form> : null}
    </span>;
  }

  function rowSelectionControl(row: SpeakerScriptRow, rowIndex: number) {
    return <ScriptRowSelection number={rowIndex + 1} label={`Chọn Script row ${row.diarizationLabel}`} selected={selectedRowIds.includes(row.id)} onSelect={(event) => toggleScriptRow(event, row.id)} />;
  }

  function renderCell(row: SpeakerScriptRow, column: ScriptTableColumn, fragments: typeof transcriptWindow.visible, rowIndex: number) {
    if (column.builtin === "speaker") {
      return <ScriptRowSpeaker selection={rowSelectionControl(row, rowIndex)} label={`Speaker Profile của row ${rowIndex + 1}`} speakerLabel={row.diarizationLabel} profileId={row.profileId} profiles={speakers} track={trackName}
        onActivate={() => { if (!selectedRowIds.length) setRowSelection({ ids: [row.id], anchorId: row.id }); }} onProfileChange={(id) => { if (selectedRowIds.length) assignProfileToSelectedRows(id || "__none__"); }} />;
    }
    if (column.builtin === "content") {
      return <div className="script-table__content" role="gridcell" tabIndex={0} title="Kéo quét nhiều từ · chuột phải để gán Speaker Profile hoặc chuyển row">
        {fragments.map((fragment) => <div className="script-table__fragment" data-transcript-fragment={fragment.key} key={fragment.key}>{fragment.words.map(({ index, word }) => renderWord(index, word))}</div>)}
      </div>;
    }
    if (column.builtin === "timestamp") {
      const first = row.words[0]?.word;
      const last = row.words[row.words.length - 1]?.word;
      return <div className="script-table__timestamp" role="gridcell"><code>IN&nbsp;&nbsp;{timecode(first?.start ?? 0)}</code><code>OUT {timecode(last?.end ?? first?.end ?? 0)}</code></div>;
    }
    return <div className="script-table__custom" role="gridcell"><span>Chưa gán</span></div>;
  }

  if (!rows.length) return null;

  return <div className="script-table-shell" ref={commandRef} onKeyDown={selectScriptRow}>
    {selectedRowIds.length ? <div aria-label="Thao tác transcript rows đã chọn" className="script-row-bulk-actions"><b>{selectedRowIds.length} row đã chọn</b><label>Gán speaker<select aria-label="Gán speaker cho transcript rows" onChange={(event) => assignProfileToSelectedRows(event.target.value)} value="__choose__"><option value="__choose__">Chọn speaker…</option><option value="__none__">Bỏ gán</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select></label>{onDeleteWords ? <button className="is-danger" disabled={deleteBusy} onClick={deleteSelectedRows} type="button">Xoá rows đã chọn</button> : null}<button onClick={() => setRowSelection({ ids: [], anchorId: null })} type="button">Bỏ chọn</button></div> : null}
    {deleteMessage ? <p role="status">{deleteMessage}</p> : null}
    <div className="script-table-scroll-region">
    <div className="script-table-scroll" onPointerDown={(event) => {
      if (event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if ((event.target as HTMLElement).closest("[data-script-word-index]")) return;
      onSelectionChange(EMPTY_SELECTION);
    }} ref={scrollRef}>
        {leadingContent ? <div className="script-table__leading-content" ref={leadingContentRef}>{leadingContent}</div> : null}
        <div aria-label="Bảng Script theo người nói" className="script-table" role="grid" style={{ minWidth: columns.reduce((sum, column) => sum + column.width, 60) }}>
        <ScriptTranscriptHeader layout={layout} headerRef={headerRef} />
          {transcriptWindow.top ? <div aria-hidden="true" style={{ height: transcriptWindow.top }} /> : null}
          {transcriptWindow.visibleRows.map(({ row, fragments, rowIndex }) => <ScriptTranscriptRow
            className={`${selectedRowIds.includes(row.id) ? "is-selected" : ""} ${fragments.some((fragment) => fragment.words.some(({ index }) => index === activeWordIndex)) ? "is-active" : ""} ${rowDrop?.rowId === row.id ? `is-drop-target is-drop-${rowDrop.direction}` : ""}`}
            data-script-row-id={row.id} data-transcript-row={rowIndex} key={row.id} aria-rowindex={rowIndex + 2}
            columns={columns} gridTemplateColumns={gridTemplateColumns} renderCell={(column) => renderCell(row, column, fragments, rowIndex)} selectionFallback={rowSelectionControl(row, rowIndex)} />)}
          {transcriptWindow.bottom ? <div aria-hidden="true" style={{ height: transcriptWindow.bottom }} /> : null}
      </div>
    </div>
    <ScriptScrollbar viewportRef={scrollRef} label="Thanh cuộn bảng Script" className="script-table-scrollbar" />
    </div>
    {speakerMenu ? <WordContextMenu x={speakerMenu.x} y={speakerMenu.y} className="script-table__word-menu" onClose={() => setSpeakerMenu(null)}>
      <strong>SPEAKER PROFILE · {speakerMenu.indexes.length} TỪ</strong>
      {onAddText ? <button onClick={() => { wordEditCommittedRef.current = false; setWordEdit({ index: speakerMenu.indexes.at(-1)!, value: "", add: true }); setSpeakerMenu(null); }} role="menuitem" type="button">Add text</button> : null}
      {speakerMenu.indexes.length === 1 ? <button onClick={() => { wordEditCommittedRef.current = false; setWordEdit({ index: speakerMenu.indexes[0], value: words[speakerMenu.indexes[0]].text }); setSpeakerMenu(null); }} role="menuitem" type="button">Sửa text</button> : null}
      {onDeleteWords ? <button disabled={deleteBusy} onClick={() => { if (onDeleteWords(speakerMenu.indexes)) setSpeakerMenu(null); }} role="menuitem" type="button">Xóa text đã chọn</button> : null}
      <button onClick={() => assignProfileToSelectedWords(null)} role="menuitem" type="button">Chưa gán Profile</button>
      {speakers.map((speaker) => <button key={speaker.id} onClick={() => assignProfileToSelectedWords(speaker.id)} role="menuitem" style={{ borderLeftColor: speaker.color }} type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>)}
      {(() => {
        const distinct = [...new Map(rows.filter((row) => !row.speakerKey.startsWith("profile:"))
          .map((row) => [row.speakerKey, row] as const)).values()];
        return distinct.length > 1 ? <><small>GÁN NGƯỜI NÓI CHO ĐOẠN CHỌN</small>
          {distinct.map((row) => <button key={row.speakerKey} onClick={() => moveSelectedWordsToRow(row)} role="menuitem" type="button">{row.diarizationLabel}</button>)}
        </> : null;
      })()}
      {(() => {
        // Only the neighbouring rows, and only from a row's edge: anything else
        // would reorder the transcript, which recognition already got right.
        const moves = legalRowMoves(rows, speakerMenu.indexes);
        if (!moves.length) return <small>KHÔNG CHUYỂN ĐƯỢC ROW · chọn từ ở đầu hoặc cuối row</small>;
        return <>
          <small>CHUYỂN SANG ROW</small>
          {moves.map((move) => <button key={move.target.id} onClick={() => moveSelectedWordsToRow(move.target)} role="menuitem" type="button">{move.direction === "up" ? "↑" : "↓"} {move.target.diarizationLabel} · {timecode(move.target.words[0]?.word.start ?? 0)}</button>)}
        </>;
      })()}
      <WordNoteItem module="script" />
    </WordContextMenu> : null}
    {hoveredEstimate ? <div className="script-table__timing-status" role="status" style={{ left: hoveredEstimate.x + 12, top: hoveredEstimate.y + 16 }}>Timestamp ước lượng · cần kiểm tra trên waveform</div> : null}
  </div>;
}
