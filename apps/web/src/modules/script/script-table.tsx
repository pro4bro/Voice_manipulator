import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type UIEvent } from "react";

import { EMPTY_SELECTION, selectWord, sweepTo, type WordSelection } from "../../domain/word-selection";
import { legalRowMoves, rowMoveTo, type RowMoveDirection } from "./row-moves";
import type { EmotionLabel, EmotionStylePreferences, SpeakerProfile, StudioWord } from "../../domain/types";

export interface ScriptTableColumn {
  id: string;
  label: string;
  width: number;
  builtin?: "speaker" | "content" | "timestamp";
}

const DEFAULT_COLUMNS: readonly ScriptTableColumn[] = [
  { id: "speaker", label: "SPEAKER", width: 220, builtin: "speaker" },
  { id: "content", label: "NỘI DUNG", width: 620, builtin: "content" },
  { id: "timestamp", label: "TIMESTAMP", width: 164, builtin: "timestamp" },
];

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
  return word.diarizationSpeakerId?.trim() || "speaker-1";
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

function parsedBuiltin(value: unknown): ScriptTableColumn["builtin"] {
  return value === "speaker" || value === "content" || value === "timestamp" ? value : undefined;
}
function copyDefaultColumns() {
  return DEFAULT_COLUMNS.map((column) => ({ ...column }));
}

function loadColumns(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(`pro4bro:script-table:${storageKey}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || !parsed.length) return copyDefaultColumns();
    const columns = parsed
      .filter((column): column is Record<string, unknown> => Boolean(column && typeof column === "object"))
      .map((column) => ({
        id: String(column.id ?? ""),
        label: String(column.label ?? "").trim(),
        width: Math.max(24, Number(column.width) || 160),
        builtin: parsedBuiltin(column.builtin),
      }))
      .filter((column) => column.id && column.label);
    return columns.length ? columns : copyDefaultColumns();
  } catch {
    return copyDefaultColumns();
  }
}

export function buildSpeakerScriptRows(words: StudioWord[], speakers: SpeakerProfile[]): SpeakerScriptRow[] {
  const profileById = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const rows: SpeakerScriptRow[] = [];
  for (const [index, word] of words.entries()) {
    const diarizationId = normalizedDiarizationId(word);
    const profile = word.speakerId ? profileById.get(word.speakerId) ?? null : null;
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
    const updated = { ...word, speakerId: profileId ?? undefined };
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
    const updated = { ...word, speakerId: row.profileId ?? undefined };
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
    const updated = { ...word, speakerId: row.profileId ?? undefined };
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
  words: StudioWord[];
  speakers: SpeakerProfile[];
  activeWordIndex: number;
  emotionStyle: EmotionStylePreferences;
  getEmotionStyle: (emotion: EmotionLabel | null | undefined, preferences: EmotionStylePreferences) => CSSProperties | undefined;
  onAssignWords: (indexes: number[], profileId: string | null) => void;
  onMoveWords: (indexes: number[], row: SpeakerScriptRow) => void;
  onUpdateWordText: (index: number, text: string) => void;
  onOpenTextEditor: () => void;
  storageKey: string;
  selection: WordSelection;
  onSelectionChange: (selection: WordSelection) => void;
}
interface ScrollMetrics {
  top: number;
  clientHeight: number;
  scrollHeight: number;
  trackHeight: number;
}

interface ResizeState {
  id: string;
  startX: number;
  startWidth: number;
}

interface SpeakerTextProps {
  words: StudioWord[];
  speakers: SpeakerProfile[];
  activeWordIndex: number;
  onOpenTextEditor: () => void;
  selection: WordSelection;
  onSelectionChange: (selection: WordSelection) => void;
}

/* The non-table view keeps each diarized turn intact while giving the user a compact reading layout. */
/** Scroll `view` so `target` sits in its comfortable band, and report the new offset.
 *
 * Measured from rects rather than offsetTop. offsetTop is relative to the nearest
 * positioned ancestor, and `.script-table__word-wrap` is positioned so it can host
 * the word editor popover - so every word reported offsetTop 0, the arithmetic
 * produced 0, and playback scrolled the transcript back to the top on every tick
 * instead of following the word being spoken.
 */
export function keepWordInView(view: HTMLElement, target: HTMLElement): number | null {
  const viewRect = view.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = targetRect.top - viewRect.top + view.scrollTop;
  const bottom = top + targetRect.height;
  if (top >= view.scrollTop + view.clientHeight * 0.18 && bottom <= view.scrollTop + view.clientHeight * 0.76) {
    return null;
  }
  const furthest = Math.max(0, view.scrollHeight - view.clientHeight);
  const next = Math.max(0, Math.min(furthest, top - view.clientHeight * 0.38));
  view.scrollTop = next;
  return next;
}

export function ScriptSpeakerText({ words, speakers, activeWordIndex, onOpenTextEditor, selection, onSelectionChange }: SpeakerTextProps) {
  const rows = useMemo(() => buildSpeakerScriptRows(words, speakers), [speakers, words]);
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
  return <div aria-label="Transcript theo người nói" className="script-speaker-text" onDoubleClick={onOpenTextEditor} onPointerDown={beginSweep} ref={viewRef} title="Quét để chọn nhiều từ · Ctrl/Shift/Alt để cộng trừ · double-click để mở Text Edit">
    {rows.map((row) => {
      const color = row.profile?.color ?? "var(--text-muted)";
      return <article className={row.words.some(({ index }) => index === activeWordIndex) ? "is-active" : ""} key={row.id}>
        <header style={{ borderLeftColor: color }}><i style={{ background: color }} /><b style={{ color }}>{row.diarizationLabel}</b></header>
        <p>{row.words.map(({ index, word }) => <span aria-selected={held.has(index)} className={`${index === activeWordIndex ? "is-active" : ""} ${held.has(index) ? "is-selected" : ""}`} data-script-word-index={index} key={`${word.start}-${word.end}-${index}`} ref={index === activeWordIndex ? activeWordRef : undefined} role="option">{word.text}{" "}</span>)}</p>
      </article>;
    })}
  </div>;
}
export function ScriptTable({ words, speakers, activeWordIndex, emotionStyle, getEmotionStyle, onAssignWords, onMoveWords, onUpdateWordText, onOpenTextEditor, storageKey, selection, onSelectionChange }: ScriptTableProps) {
  const rows = useMemo(() => buildSpeakerScriptRows(words, speakers), [speakers, words]);
  const [columns, setColumns] = useState<ScriptTableColumn[]>(() => loadColumns(storageKey));
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLButtonElement>(null);
  const draggingRef = useRef(false);
  const resizeRef = useRef<ResizeState | null>(null);
  const selectedWordIndexes = useMemo(() => new Set(selection.indexes), [selection.indexes]);
  const [wordEdit, setWordEdit] = useState<{ index: number; value: string } | null>(null);
  const [speakerMenu, setSpeakerMenu] = useState<{ indexes: number[]; x: number; y: number } | null>(null);
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
  const [scroll, setScroll] = useState<ScrollMetrics>({ top: 0, clientHeight: 0, scrollHeight: 0, trackHeight: 0 });

  useEffect(() => { setColumns(loadColumns(storageKey)); }, [storageKey]);
  // A selection made in the Timeline has to be reachable here without hunting
  // for it, so the table follows the last word touched either side.
  useLayoutEffect(() => {
    const view = scrollRef.current;
    if (!view || selection.anchor === null) return;
    const target = view.querySelector<HTMLElement>(`[data-script-word-index="${selection.anchor}"]`);
    if (target && keepWordInView(view, target) !== null) updateScroll(view);
  }, [selection.anchor]);
  useEffect(() => { window.localStorage.setItem(`pro4bro:script-table:${storageKey}`, JSON.stringify(columns)); }, [columns, storageKey]);
  useEffect(() => {
    if (!speakerMenu) return undefined;
    const closeMenu = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".script-table__word-menu")) return;
      setSpeakerMenu(null);
    };
    window.addEventListener("pointerdown", closeMenu, true);
    return () => window.removeEventListener("pointerdown", closeMenu, true);
  }, [speakerMenu]);
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

  const gridTemplateColumns = useMemo(() => [...columns.map((column) => `${column.width}px`), "30px"].join(" "), [columns]);
  const thumb = useMemo(() => {
    const visible = scroll.clientHeight;
    const total = Math.max(visible, scroll.scrollHeight);
    const cssMinimum = Math.min(100, (28 / Math.max(1, scroll.trackHeight)) * 100);
    const height = total > 0 ? Math.min(100, Math.max(cssMinimum, (visible / total) * 100)) : 100;
    const maxScroll = Math.max(0, total - visible);
    const top = maxScroll > 0 ? Math.max(0, Math.min(100 - height, (scroll.top / maxScroll) * (100 - height))) : 0;
    return { top, height, enabled: maxScroll > 0.5 };
  }, [scroll]);

  function updateScroll(element: HTMLDivElement) {
    const trackHeight = trackRef.current?.clientHeight ?? 0;
    setScroll((current) => current.top === element.scrollTop && current.clientHeight === element.clientHeight && current.scrollHeight === element.scrollHeight && current.trackHeight === trackHeight
      ? current
      : { top: element.scrollTop, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, trackHeight });
  }

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () => updateScroll(element);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [rows.length, words]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const activeWord = activeWordRef.current;
    if (!element || !activeWord || activeWordIndex < 0) return;
    if (keepWordInView(element, activeWord) !== null) updateScroll(element);
  }, [activeWordIndex, rows]);

  function syncScroll(event: UIEvent<HTMLDivElement>) {
    updateScroll(event.currentTarget);
  }

  function seekScrollbar(clientY: number) {
    const element = scrollRef.current;
    const track = trackRef.current;
    if (!element || !track || element.scrollHeight <= element.clientHeight) return;
    const bounds = track.getBoundingClientRect();
    const pointerRatio = Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(bounds.height, 1)));
    const thumbRatio = thumb.height / 100;
    const travel = Math.max(0.0001, 1 - thumbRatio);
    const targetRatio = Math.max(0, Math.min(1, (pointerRatio - thumbRatio / 2) / travel));
    element.scrollTop = targetRatio * (element.scrollHeight - element.clientHeight);
    updateScroll(element);
  }

  function beginScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!thumb.enabled) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekScrollbar(event.clientY);
  }

  function moveScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    event.preventDefault();
    seekScrollbar(event.clientY);
  }

  function endScrollbar(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    seekScrollbar(event.clientY);
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function beginColumnResize(event: ReactPointerEvent<HTMLButtonElement>, column: ScriptTableColumn) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { id: column.id, startX: event.clientX, startWidth: column.width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function resizeColumn(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize) return;
    event.preventDefault();
    const width = Math.max(24, resize.startWidth + event.clientX - resize.startX);
    setColumns((current) => current.map((column) => column.id === resize.id ? { ...column, width } : column));
  }

  function endColumnResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!resizeRef.current) return;
    resizeColumn(event);
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function addColumn() {
    const label = window.prompt("Tên cột mới", "Thuộc tính")?.trim();
    if (!label) return;
    setColumns((current) => [...current, { id: `custom-${Date.now()}-${current.length}`, label: label.toUpperCase(), width: 180 }]);
  }

  function removeColumn(id: string) {
    setColumns((current) => current.length > 1 ? current.filter((column) => column.id !== id) : current);
  }

  function modifiersOf(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) {
    return { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey };
  }

  function beginWordSelection(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
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
    if (!wordEdit) return;
    onUpdateWordText(wordEdit.index, wordEdit.value);
    setWordEdit(null);
  }

  function renderWord(index: number, word: StudioWord) {
    const selected = selectedWordIndexes.has(index);
    const editing = wordEdit?.index === index;
    return <span className="script-table__word-wrap" key={`${word.start}-${word.end}-${index}`}>
      <button aria-label={`Chọn từ ${word.text}`} aria-pressed={selected} className={`script-table__word ${index === activeWordIndex ? "is-active" : ""} ${word.reviewState === "manual" ? "is-manual" : ""}`} data-script-word-index={index} onClick={(event) => {
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
        setWordEdit({ index, value: word.text });
      }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openSpeakerMenu(index, event.clientX, event.clientY); }} onPointerDown={(event) => beginWordSelection(event, index)} onPointerEnter={(event) => extendWordSelection(index, modifiersOf(event))} onPointerMove={(event) => extendWordSelectionAtPoint(event.clientX, event.clientY, modifiersOf(event))} onPointerUp={() => { wordSelectionDraggingRef.current = false; }} ref={index === activeWordIndex ? activeWordRef : undefined} style={getEmotionStyle(word.emotion, emotionStyle)} title="Quét hoặc Ctrl/Shift để chọn nhiều từ · kéo phần đầu hoặc cuối row sang row kề · double-click để sửa chữ · chuột phải để gán Speaker" type="button">{word.text}</button>{" "}
      {editing ? <form aria-label={`Trình sửa từ ${word.text}`} className="script-table__word-editor" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); confirmWordEdit(); }}>
        <input aria-label={`Sửa từ ${word.text}`} autoFocus onChange={(event) => setWordEdit({ index, value: event.currentTarget.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setWordEdit(null); } }} value={wordEdit.value} />
      </form> : null}
    </span>;
  }

  function renderCell(row: SpeakerScriptRow, column: ScriptTableColumn) {
    if (column.builtin === "speaker") {
      return <div className="script-table__speaker" role="gridcell">
        <i style={{ background: row.profile?.color ?? "var(--text-muted)" }} />
        <div>
          <b style={{ color: row.profile?.color }}>{row.diarizationLabel}</b>
          <small>{row.profile ? "Profile đã gán" : "Chuột phải trên từ để gán Profile"}</small>
        </div>
      </div>;
    }
    if (column.builtin === "content") {
      return <div className="script-table__content" onDoubleClick={onOpenTextEditor} role="gridcell" tabIndex={0} title="Kéo quét nhiều từ · chuột phải để gán Speaker Profile hoặc chuyển row">
        {row.words.map(({ index, word }) => renderWord(index, word))}
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

  return <div className="script-table-shell">
    <div className="script-table-scroll" onPointerDown={(event) => {
      if (event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if ((event.target as HTMLElement).closest("[data-script-word-index]")) return;
      onSelectionChange(EMPTY_SELECTION);
    }} onScroll={syncScroll} ref={scrollRef}>
      <div aria-label="Bảng Script theo người nói" className="script-table" role="grid" style={{ gridTemplateColumns }}>
        <div className="script-table__header" role="row" style={{ gridTemplateColumns }}>
          {columns.map((column) => <div className="script-table__header-cell" key={column.id} role="columnheader"><b>{column.label}</b><button aria-label={`Kéo rộng cột ${column.label}`} className="script-table__resize" onPointerCancel={endColumnResize} onPointerDown={(event) => beginColumnResize(event, column)} onPointerMove={resizeColumn} onPointerUp={endColumnResize} type="button" />{columns.length > 1 ? <button aria-label={`Xóa cột ${column.label}`} className="script-table__remove" onClick={() => removeColumn(column.id)} type="button">×</button> : null}</div>)}
          <button aria-label="Thêm cột Script" className="script-table__add" onClick={addColumn} title="Thêm cột" type="button">+</button>
        </div>
        {rows.map((row) => <div className={`script-table__row ${row.words.some(({ index }) => index === activeWordIndex) ? "is-active" : ""} ${rowDrop?.rowId === row.id ? `is-drop-target is-drop-${rowDrop.direction}` : ""}`} data-script-row-id={row.id} key={row.id} role="row" style={{ gridTemplateColumns }}>
          {columns.map((column) => <div className="script-table__cell" key={column.id}>{renderCell(row, column)}</div>)}
          <i aria-hidden="true" className="script-table__add-space" />
        </div>)}
      </div>
    </div>
    <div aria-label="Thanh cuộn bảng Script" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(thumb.top)} className={`script-table-scrollbar ${thumb.enabled ? "" : "is-static"}`} onPointerCancel={endScrollbar} onPointerDown={beginScrollbar} onPointerMove={moveScrollbar} onPointerUp={endScrollbar} ref={trackRef} role="scrollbar" tabIndex={0}>
      <i style={{ height: `${thumb.height}%`, top: `${thumb.top}%` }} />
    </div>
    {speakerMenu ? <div className="script-table__word-menu" role="menu" style={{ left: speakerMenu.x, top: speakerMenu.y }}>
      <strong>SPEAKER PROFILE · {speakerMenu.indexes.length} TỪ</strong>
      <button onClick={() => assignProfileToSelectedWords(null)} role="menuitem" type="button">Chưa gán Profile</button>
      {speakers.map((speaker) => <button key={speaker.id} onClick={() => assignProfileToSelectedWords(speaker.id)} role="menuitem" style={{ borderLeftColor: speaker.color }} type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>)}
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
    </div> : null}
  </div>;
}
