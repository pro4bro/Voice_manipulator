import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

import { describeTask, isLiveTask, sortTasks } from "../../domain/activity";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import { usePlaybackWord } from "../../domain/playback-sync";
import type { ActivityTask, ProjectVoice, SpeakerProfile, VoiceOutput, VoiceOutputExportMode, VoiceScriptJob, VoiceScriptRow } from "../../domain/types";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { VOICE_KIND_LABELS, clipboardToRows, emptyRow, estimatedSeconds, lineBreakWords, normalizedRowText, resolveRowVoice, rowTimings, rowsToText, scriptReadiness, textToRows, type VoiceCategory } from "../../domain/voiceScript";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { useScriptPlaybackVisibility } from "./script-playback-follow";
import { ScriptSelectionMarkers } from "./ScriptSelectionMarkers";
import { ScriptScrollbar } from "./ScriptScrollbar";
import { DurationPlanPanel } from "./DurationPlanPanel";
import { TimingPlanEditor } from "./TimingPlanEditor";
import { VoiceScriptSettings } from "./VoiceScriptSettings";
import { DeliveryCapabilities } from "./DeliveryCapabilities";
import { VoiceRenderControls } from "./VoiceRenderControls";
import { VoiceFixControls } from "./VoiceFixControls";
import "./voice-script-settings.css";
import { joinScriptSentences, migrateScript } from "../../domain/voice-script-document";
import { hasMultipleSelectionRanges, productionRanges, selectProductionWord, sweepProductionWords } from "../../domain/production-selection";

const CATEGORY_LABELS: Record<VoiceCategory, string> = { clone: "Nhái giọng", train: "Train giọng" };
const ENGINE_LABELS: Record<string, string> = { omnivoice: "OmniVoice", vibevoice: "VibeVoice" };
import { ScriptRowSelection, ScriptRowSpeaker, ScriptTranscriptHeader, ScriptTranscriptRow, useScriptTableLayout } from "./script-transcript-layout";

interface VoiceScriptProps {
  onFixedOutput?: (output: VoiceOutput) => void;
  onNavigateOutput?: (id: string) => void;
  voiceRender?: import("../../app/useVoiceRender").VoiceRenderController;
  timingContext?: { projectId: string; assets: import("../../domain/types").ProjectMediaAsset[]; runs: import("../../domain/types").TrainingRun[]; saved: boolean; editRevision?: number };
  navigation?: import("../../domain/reference-bindings").ProductionNavigation | null;
  onReferenceContext?: (request: import("../../domain/reference-bindings").ReferenceContextRequest) => void;
  document?: import("../../domain/types").VoiceScriptDocument;
  onDocumentChange?: (document: import("../../domain/types").VoiceScriptDocument) => void;
  saveError?: string | null;
  onReload?: () => void;
  rows: VoiceScriptRow[];
  onRowsChange: (rows: VoiceScriptRow[]) => void;
  speakers: SpeakerProfile[];
  /** Voices of the kind chosen in Voice Training, the only ones rows may use. */
  voices: ProjectVoice[];
  category: VoiceCategory;
  /** The Voice Output open on the Timeline, when it came from this Script. */
  output: VoiceOutput | null;
  playbackId: string | null;
  defaultSpeakerId?: string | null;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
  job?: VoiceScriptJob | null;
  /** Jobs the app has in flight; the ones that make audio show under the Script. */
  activityTasks?: ActivityTask[];
  busy?: boolean;
  onRead: () => void;
  onExport?: (mode: VoiceOutputExportMode) => void;
  onOpenTraining?: () => void;
}

/**
 * What the app is making right now, under the Script.
 *
 * Generating speech happens in several places - reading the whole Script, the
 * single-sentence Tạo giọng, a model being loaded first - and this strip shows
 * whichever is running, so the page is never silent while the GPU works.
 */
function ScriptProgress({ tasks = [] }: { tasks?: ActivityTask[] }) {
  const shown = sortTasks(tasks.filter((task) => isLiveTask(task) && (task.kind === "tts" || task.kind === "model")));
  if (!shown.length) return null;
  return (
    <ul aria-label="Tiến trình tạo giọng" className="script-progress">
      {shown.map((task) => {
        const line = describeTask(task);
        return (
          <li key={task.id}>
            <b>{line.stage}</b>
            <span>{line.label}</span>
            <small>{line.detail}</small>
            <i><em style={{ width: line.percent === null ? "100%" : `${line.percent}%` }} className={line.percent === null ? "is-indeterminate" : ""} /></i>
            {line.percent !== null ? <strong>{line.percent}%</strong> : null}
          </li>
        );
      })}
    </ul>
  );
}

function timecode(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * The Script of Voice Manipulator: typed by the user rather than transcribed,
 * one row per turn, each row read by the voice picked in its Speaker cell.
 * Once read, a row shows its words on the generated audio's timing - the same
 * table, selection and playback highlight footage gets in Speech to Text.
 */
export function VoiceScript({ onFixedOutput, onNavigateOutput, voiceRender, timingContext, navigation, onReferenceContext, document: scriptDocument, onDocumentChange, saveError, onReload, rows, onRowsChange, speakers, voices, category, output, playbackId, defaultSpeakerId = null, wordSelection = EMPTY_SELECTION, onWordSelectionChange, job = null, activityTasks = [], busy = false, onRead, onExport, onOpenTraining }: VoiceScriptProps) {
  const activeWordIndex = usePlaybackWord(playbackId);
  const words = output?.words ?? [];
  const timings = useMemo(() => rowTimings(rows, output, voices), [output, rows, voices]);
  const readiness = scriptReadiness(rows, voices);
  const [durationRefresh, setDurationRefresh] = useState(0);
  const [view, setView] = useState<"table" | "text">("table");
  const [textDraft, setTextDraft] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [voiceMenu, setVoiceMenu] = useState<{ rowId: string; x: number; y: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [fontScale, setFontScale] = useState(100);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [rowSelection, setRowSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const scrollRef = useRef<HTMLDivElement>(null);
  const consumedNavigation = useRef<typeof navigation>(undefined);
  const followRoot = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusRef = useRef<{ rowId: string; start: number; end: number } | null>(null);
  const [, setFocusTick] = useState(0);
  // The row shown while the Script is empty keeps one id, so typing into it
  // is not interrupted by a re-render handing it a new one.
  const placeholderRef = useRef<VoiceScriptRow>(emptyRow(null));
  const shownRows = rows.length ? rows : [placeholderRef.current];
  const rowIds = rows.map((row) => row.id);
  const selectedRowIds = reconcileListSelection(rowSelection, rowIds).ids;
  useEffect(() => setRowSelection((current) => reconcileListSelection(current, rowIds)), [rows]);
  const held = useMemo(() => new Set(wordSelection.indexes), [wordSelection.indexes]);
  const wordSweep = useRef<{ base: WordSelection; origin: number } | null>(null);
  useEffect(() => {
    const end = () => { wordSweep.current = null; };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, []);
  useEffect(() => {
    const ids = rows.filter((row) => {
      const timing = timings.get(row.id);
      return wordSelection.rowIds?.includes(row.id) || Boolean(timing?.fresh && wordSelection.indexes.some((index) => index >= timing.firstWord && index < timing.lastWord));
    }).map((row) => row.id);
    setRowSelection((current) => current.ids.join("\0") === ids.join("\0") ? current : { ids, anchorId: ids.at(-1) ?? null });
  }, [wordSelection, rows, timings]);
  const selectionMarkers = useMemo(() => {
    const ranges = productionRanges(wordSelection, words);
    if (ranges.length) return ranges.map((range) => {
      const wordIndex = words.findIndex((word) => word.end > range.start && word.start < range.end);
      const nearest = rows.find((row) => { const timing = timings.get(row.id); return timing?.fresh && timing.end > range.start; }) ?? rows.at(-1);
      return { id: range.id, wordIndex: wordIndex >= 0 ? wordIndex : undefined, rowId: nearest?.id, label: `Script ${range.start.toFixed(3)}–${range.end.toFixed(3)}s` };
    });
    return (wordSelection.rowIds ?? []).flatMap((id) => { const row = rows.find((row) => row.id === id); return row ? [{ id, rowId: id, label: `Script ${row.text || "Câu chưa có lời thoại"}` }] : []; });
  }, [wordSelection, words, rows, timings]);
  const speakerOf = (id: string | null | undefined) => speakers.find((speaker) => speaker.id === id) ?? null;
  const usedVoices = new Set(readiness.rows.map((row) => row.voiceId));
  const wordCount = rows.reduce((total, row) => total + (normalizedRowText(row.text) ? normalizedRowText(row.text).split(" ").length : 0), 0);
  const freshOutput = Boolean(output && rows.length && rows.every((row) => !normalizedRowText(row.text) || timings.get(row.id)?.fresh));
  const textStyle = { "--script-format-scale": fontScale / 100, "--script-font-adjust": fontScale / 100, fontWeight: bold ? 700 : undefined, fontStyle: italic ? "italic" : undefined, textDecoration: underline ? "underline" : undefined } as CSSProperties;

  useLayoutEffect(() => {
    if (!navigation || consumedNavigation.current === navigation) return;
    if (navigation.scope.kind === "voice-output" && navigation.scope.id !== output?.id) return;
    if (view !== "table") { setView("table"); return; }
    consumedNavigation.current = navigation;
    const timedRow = navigation.start === null ? null : (output?.segments?.find((segment) => segment.end > navigation.start!) ?? output?.segments?.at(-1));
    const rowId = navigation.rowIds[0] ?? timedRow?.rowId;
    const target = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>("[data-script-row-id]") ?? []).find((node) => node.dataset.scriptRowId === rowId);
    const viewport = scrollRef.current;
    if (target && viewport) {
      viewport.scrollTop = Math.max(0, target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - viewport.clientHeight * .25);
      viewport.dispatchEvent(new Event("scroll"));
    }
  }, [navigation, view, output?.id]);

  // Editing always goes through the full row list; an empty Script still shows
  // one row to type into, and typing into it makes it real.
  function commit(next: VoiceScriptRow[]) {
    onRowsChange(next);
  }

  function withDefaults(row: VoiceScriptRow): VoiceScriptRow {
    if (row.speakerProfileId || !defaultSpeakerId) return row;
    return { ...row, speakerProfileId: defaultSpeakerId };
  }

  function updateRow(rowId: string, update: Partial<VoiceScriptRow>) {
    const base = rows.length ? rows : shownRows.map(withDefaults);
    commit(base.map((row) => row.id === rowId ? { ...row, ...update } : row));
  }

  function insertAfter(rowId: string | null, text = "", caret = 0) {
    const base = rows.length ? rows : shownRows.map(withDefaults);
    const index = rowId ? base.findIndex((row) => row.id === rowId) : base.length - 1;
    const previous = base[index] ?? base[base.length - 1] ?? null;
    const row = withDefaults(emptyRow(previous, text));
    focusRef.current = { rowId: row.id, start: caret, end: caret };
    setEditingRowId(row.id);
    commit([...base.slice(0, index + 1), row, ...base.slice(index + 1)]);
  }

  function removeRow(rowId: string) {
    const index = rows.findIndex((row) => row.id === rowId);
    if (index < 0) return;
    const previous = rows[index - 1];
    if (previous) focusRef.current = { rowId: previous.id, start: previous.text.length, end: previous.text.length };
    commit(rows.filter((row) => row.id !== rowId));
  }

  function moveRow(rowId: string, direction: -1 | 1) {
    const index = rows.findIndex((row) => row.id === rowId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function handleRowKey(event: ReactKeyboardEvent<HTMLTextAreaElement>, row: VoiceScriptRow) {
    const field = event.currentTarget;
    if (event.key === "Enter" && event.altKey) {
      // Alt+Enter breaks the line inside the same turn, as in a spreadsheet cell.
      event.preventDefault();
      const start = field.selectionStart;
      const next = `${row.text.slice(0, start)}\n${row.text.slice(field.selectionEnd)}`;
      focusRef.current = { rowId: row.id, start: start + 1, end: start + 1 };
      updateRow(row.id, { text: next });
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      // Enter starts the next turn, the way a line break does in a script.
      event.preventDefault();
      const before = row.text.slice(0, field.selectionStart);
      const after = row.text.slice(field.selectionEnd);
      const base = rows.length ? rows : shownRows.map(withDefaults);
      const index = base.findIndex((item) => item.id === row.id);
      const current = { ...(base[index] ?? withDefaults(row)), text: before };
      const created = emptyRow(current, after.trimStart());
      focusRef.current = { rowId: created.id, start: 0, end: 0 };
      setEditingRowId(created.id);
      commit([...base.slice(0, index), current, created, ...base.slice(index + 1)]);
      return;
    }
    if (event.key === "Backspace" && field.selectionStart === 0 && field.selectionEnd === 0) {
      const index = rows.findIndex((item) => item.id === row.id);
      if (index <= 0) return;
      event.preventDefault();
      const previous = rows[index - 1];
      let joined: VoiceScriptRow;
      try { joined = joinScriptSentences(previous, row); }
      catch { return; }
      focusRef.current = { rowId: previous.id, start: previous.text.length, end: previous.text.length };
      setEditingRowId(previous.id);
      commit(rows.flatMap((item, itemIndex) => itemIndex === index ? [] : itemIndex === index - 1 ? [joined] : [item]));
    }
  }

  // A table copied from Excel, Google Sheets or Word, or several paragraphs,
  // arrives as turns: one row each, read by the speaker named in it.
  function handleRowPaste(event: ReactClipboardEvent<HTMLTextAreaElement>, row: VoiceScriptRow) {
    const plain = event.clipboardData.getData("text/plain");
    const html = event.clipboardData.getData("text/html");
    const base = rows.length ? rows : shownRows.map(withDefaults);
    const index = base.findIndex((item) => item.id === row.id);
    const current = base[index] ?? withDefaults(row);
    const pasted = clipboardToRows(plain, html, speakers, voices, current, base);
    if (!pasted?.length) return;
    event.preventDefault();
    const field = event.currentTarget;
    const before = current.text.slice(0, field.selectionStart).trimEnd();
    const after = current.text.slice(field.selectionEnd).trimStart();
    const leading = before ? [{ ...current, text: before }] : [];
    // An empty row, or one whose text was all selected, is replaced by what came in.
    const first = before ? pasted : [{ ...pasted[0], id: current.id }, ...pasted.slice(1)];
    const trailing = after ? [emptyRow(pasted[pasted.length - 1], after)] : [];
    const last = first[first.length - 1];
    focusRef.current = { rowId: last.id, start: last.text.length, end: last.text.length };
    setEditingRowId(last.id);
    commit([...base.slice(0, index), ...leading, ...first, ...trailing, ...base.slice(index + 1)]);
  }

  function handleTextPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const plain = event.clipboardData.getData("text/plain");
    const html = event.clipboardData.getData("text/html");
    if (!plain.includes("\t") && !/<table[\s>]/iu.test(html)) return;
    const pasted = clipboardToRows(plain, html, speakers, voices, rows[rows.length - 1] ?? null, rows);
    if (!pasted?.length) return;
    event.preventDefault();
    const field = event.currentTarget;
    const insert = rowsToText(pasted, speakers);
    const head = textDraft.slice(0, field.selectionStart);
    const tail = textDraft.slice(field.selectionEnd);
    changeText(`${head}${head && !head.endsWith("\n") ? "\n" : ""}${insert}${tail && !tail.startsWith("\n") ? "\n" : ""}${tail}`);
  }

  useLayoutEffect(() => {
    const request = focusRef.current;
    if (!request) return;
    const field = scrollRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-row-id="${request.rowId}"]`);
    if (!field) return;
    focusRef.current = null;
    field.focus();
    field.setSelectionRange(request.start, request.end);
  });

  // Rows grow with what is typed; a fixed height would hide the end of a long turn.
  useLayoutEffect(() => {
    scrollRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea.voice-script__input").forEach((field) => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    });
  });

  useScriptPlaybackVisibility(followRoot, scrollRef, playbackId ? [playbackId] : [],
    playbackId ? { [playbackId]: activeWordIndex } : {}, undefined, view === "table" && !hasMultipleSelectionRanges(wordSelection));

  useEffect(() => {
    if (!voiceMenu) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".voice-script__menu") || target?.closest(".voice-script__speaker")) return;
      setVoiceMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setVoiceMenu(null); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [voiceMenu]);

  function openVoiceMenu(event: ReactMouseEvent<HTMLButtonElement>, rowId: string) {
    if (voiceMenu?.rowId === rowId) {
      setVoiceMenu(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setVoiceMenu({ rowId, x: Math.max(8, Math.min(bounds.left, window.innerWidth - 290)), y: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 360)) });
  }

  function pickVoice(voice: ProjectVoice) {
    if (!voiceMenu) return;
    updateRow(voiceMenu.rowId, { voiceId: voice.id, speakerProfileId: voice.speakerProfileId });
    setVoiceMenu(null);
  }

  // ---------- find / replace, over rows in the table and over the text in Text Edit ----------

  const units = view === "table" ? shownRows.map((row) => row.text) : [textDraft];

  function indexIn(text: string, from: number, reverse: boolean) {
    const source = caseSensitive ? text : text.toLocaleLowerCase("vi");
    const query = caseSensitive ? findQuery : findQuery.toLocaleLowerCase("vi");
    return reverse ? source.lastIndexOf(query, from) : source.indexOf(query, from);
  }

  function findNext(reverse = false) {
    if (!findQuery) return;
    if (view === "text") {
      const field = textRef.current;
      if (!field) return;
      let index = indexIn(textDraft, reverse ? Math.max(0, field.selectionStart - 1) : field.selectionEnd, reverse);
      if (index < 0) index = indexIn(textDraft, reverse ? textDraft.length : 0, reverse);
      if (index >= 0) { field.focus(); field.setSelectionRange(index, index + findQuery.length); }
      return;
    }
    const focused = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
    const startRow = Math.max(0, shownRows.findIndex((row) => row.id === focused?.dataset.rowId));
    const count = units.length;
    for (let step = 0; step <= count; step += 1) {
      const rowIndex = ((reverse ? startRow - step : startRow + step) % count + count) % count;
      const text = units[rowIndex];
      const from = step === 0 && focused ? (reverse ? Math.max(0, focused.selectionStart - 1) : focused.selectionEnd) : reverse ? text.length : 0;
      const index = indexIn(text, from, reverse);
      if (index >= 0 && !(step === 0 && !focused && reverse)) {
        const row = shownRows[rowIndex];
        focusRef.current = { rowId: row.id, start: index, end: index + findQuery.length };
        setEditingRowId(row.id);
        setFocusTick((tick) => tick + 1);
        return;
      }
    }
  }

  function replaceCurrent() {
    const field = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
    if (field && findQuery) {
      const selected = field.value.slice(field.selectionStart, field.selectionEnd);
      const same = caseSensitive ? selected === findQuery : selected.toLocaleLowerCase("vi") === findQuery.toLocaleLowerCase("vi");
      if (same) {
        const next = field.value.slice(0, field.selectionStart) + replaceQuery + field.value.slice(field.selectionEnd);
        const caret = field.selectionStart + replaceQuery.length;
        if (view === "text") changeText(next);
        else if (field.dataset.rowId) {
          focusRef.current = { rowId: field.dataset.rowId, start: caret, end: caret };
          updateRow(field.dataset.rowId, { text: next });
        }
        return;
      }
    }
    findNext();
  }

  function replaceAll() {
    if (!findQuery) return;
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const expression = new RegExp(escaped, caseSensitive ? "gu" : "giu");
    if (view === "text") changeText(textDraft.replace(expression, () => replaceQuery));
    else commit(rows.map((row) => ({ ...row, text: row.text.replace(expression, () => replaceQuery) })));
  }

  function changeText(value: string) {
    setTextDraft(value);
    commit(textToRows(value, speakers, voices, rows));
  }

  function handleRowSelectionKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !(event.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) {
      event.preventDefault();
      setRowSelection((current) => selectAllListItems(current, rowIds));
    }
  }

  function selectRow(event: ReactMouseEvent<HTMLButtonElement>, rowId: string) {
    const next = selectListItem(rowSelection, rowIds, rowId, { shift: event.shiftKey, toggle: !event.shiftKey || event.ctrlKey || event.metaKey });
    setRowSelection(next);
    const selectedTimings = next.ids.flatMap((id) => { const timing = timings.get(id); return timing?.fresh ? [{ id, ...timing }] : []; });
    const indexes = selectedTimings.flatMap((timing) => Array.from({ length: timing.lastWord - timing.firstWord }, (_, offset) => timing.firstWord + offset));
    onWordSelectionChange?.({ indexes, anchor: indexes.at(-1) ?? null, rowIds: next.ids,
      ranges: selectedTimings.map((timing) => ({ id: `row-${timing.id}`, start: timing.start, end: timing.end })) });
  }

  function referenceContext(event: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>) {
    if (!onReferenceContext) return;
    const target = event.target as HTMLElement;
    const rowId = target.closest<HTMLElement>("[data-script-row-id]")?.dataset.scriptRowId;
    const row = rows.find((item) => item.id === rowId);
    if (!row) return;
    event.preventDefault();
    const wordElement = target.closest<HTMLElement>("[data-script-word-index]");
    const index = wordElement ? Number(wordElement.dataset.scriptWordIndex) : -1;
    let selection = wordSelection;
    if (index >= 0 && !held.has(index)) selection = selectProductionWord(EMPTY_SELECTION, index, words);
    else if (index < 0 && !selectedRowIds.includes(row.id)) {
      const timing = timings.get(row.id);
      const indexes = timing?.fresh ? Array.from({ length: timing.lastWord - timing.firstWord }, (_, offset) => timing.firstWord + offset) : [];
      selection = { indexes, anchor: indexes.at(-1) ?? null, rowIds: [row.id],
        ranges: timing?.fresh ? [{ id: `row-${row.id}`, start: timing.start, end: timing.end }] : [] };
    }
    onWordSelectionChange?.(selection);
    const rect = target.getBoundingClientRect();
    onReferenceContext({ selection, x: "clientX" in event && event.clientX ? event.clientX : rect.left, y: "clientY" in event && event.clientY ? event.clientY : rect.bottom, origin: "script" });
  }

  function deleteSelectedRows() {
    if (!selectedRowIds.length || !window.confirm(`Xoá ${selectedRowIds.length} dòng Script đã chọn?`)) return;
    const deleting = new Set(selectedRowIds);
    commit(rows.filter((row) => !deleting.has(row.id)));
    setRowSelection({ ids: [], anchorId: null });
  }

  function assignSpeakerToSelected(speakerId: string) {
    if (!selectedRowIds.length) return;
    if (speakerId === "__choose__") return;
    const voice = voices.find((item) => item.speakerProfileId === speakerId);
    const selected = new Set(selectedRowIds);
    const assignedId = speakerId === "__none__" ? null : speakerId;
    commit(rows.map((row) => selected.has(row.id) ? { ...row, speakerProfileId: assignedId, voiceId: assignedId ? voice?.id ?? null : null } : row));
  }

  function clearScript() {
    if (!rows.length || busy) return;
    if (!window.confirm("Clear toàn bộ Script? Các đoạn và lựa chọn voice trong Script sẽ bị xóa. Voice Output đã tạo vẫn được giữ lại.")) return;
    focusRef.current = null;
    setEditingRowId(null);
    setVoiceMenu(null);
    setExportOpen(false);
    setTextDraft("");
    onWordSelectionChange?.(EMPTY_SELECTION);
    commit([]);
  }

  function toggleView() {
    if (view === "table") {
      setTextDraft(rowsToText(rows, speakers));
      setView("text");
    } else {
      setView("table");
    }
  }

  // ---------- rendering ----------

  function renderSpeaker(row: VoiceScriptRow, number: number) {
    const voice = resolveRowVoice(row, voices);
    const speaker = speakerOf(voice?.speakerProfileId ?? row.speakerProfileId);
    const detail = voice ? `${VOICE_KIND_LABELS[voice.kind]} · ${ENGINE_LABELS[voice.engine] ?? voice.engine}` : "Chọn model voice";
    const checked = selectedRowIds.includes(row.id);
    return <ScriptRowSpeaker selection={<ScriptRowSelection number={number} label={`Chọn đoạn ${number}`} selected={checked} onSelect={(event) => selectRow(event, row.id)} />}
      label={`Speaker Profile của đoạn ${number}`} profileId={speaker?.id ?? null} profiles={speakers} onActivate={() => { if (!selectedRowIds.length) setRowSelection({ ids: [row.id], anchorId: row.id }); }}
      onProfileChange={(id) => { if (selectedRowIds.length) assignSpeakerToSelected(id ?? "__none__"); }}
      extra={<button aria-expanded={voiceMenu?.rowId === row.id} aria-haspopup="menu" aria-label={`Voice đọc đoạn ${number}`} className="script-row-model" onClick={(event) => openVoiceMenu(event, row.id)} type="button">{detail} ▾</button>} />;
  }

  function renderContent(row: VoiceScriptRow, number: number) {
    const timing = timings.get(row.id);
    const showWords = Boolean(timing?.fresh && timing.lastWord > timing.firstWord && editingRowId !== row.id);
    if (showWords && timing) {
      return <div className="script-table__content voice-script__words" onDoubleClick={() => { focusRef.current = { rowId: row.id, start: row.text.length, end: row.text.length }; setEditingRowId(row.id); }} role="gridcell" style={textStyle} title="Bấm để chọn từ · Ctrl/Shift để chọn nhiều · double-click để sửa lời thoại">
        {(() => {
          // Alt+Enter line breaks inside the turn stay visible once it is read.
          const breaks = lineBreakWords(row.text);
          return words.slice(timing.firstWord, timing.lastWord).map((word, offset) => {
            const index = timing.firstWord + offset;
            return <Fragment key={`${index}-${word.start}`}>
              <span className="script-table__word-wrap">
                <button aria-label={`Chọn từ ${word.text}`} aria-pressed={held.has(index)} className={`script-table__word ${index === activeWordIndex ? "is-active" : ""} ${word.timingTrusted === false ? "is-estimated" : ""}`} data-script-word-index={index}
                  onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); wordSweep.current = { base: wordSelection, origin: index }; onWordSelectionChange?.(selectProductionWord(wordSelection, index, words, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey })); }}
                  onPointerEnter={(event) => { const sweep = wordSweep.current; if (sweep && event.buttons === 1) onWordSelectionChange?.(sweepProductionWords(sweep.base, sweep.origin, index, words, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey })); }}
                  onClick={(event) => { if (event.detail === 0) onWordSelectionChange?.(selectProductionWord(wordSelection, index, words, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey })); }} type="button">{word.text}</button>{" "}
              </span>
              {breaks.has(offset) ? <br /> : null}
            </Fragment>;
          });
        })()}
      </div>;
    }
    return <div className="script-table__content voice-script__edit" role="gridcell" style={textStyle}>
      <textarea aria-label={`Lời thoại đoạn ${number}`} className="voice-script__input" data-row-id={row.id} onBlur={() => setEditingRowId((current) => current === row.id ? null : current)} onChange={(event) => { onWordSelectionChange?.(EMPTY_SELECTION); updateRow(row.id, { text: event.target.value }); }} onSelect={(event) => {
        const { selectionStart: start, selectionEnd: end } = event.currentTarget;
        if (end <= start) return;
        const tokens = [...row.text.matchAll(/\S+/gu)];
        const selectedTokens = tokens.flatMap((token, index) => token.index! < end && token.index! + token[0].length > start ? [index] : []);
        const indexes = timing?.fresh ? selectedTokens.map((offset) => timing.firstWord + offset).filter((index) => index < timing.lastWord) : [];
        const first = words[indexes[0]], last = words[indexes.at(-1) ?? -1];
        onWordSelectionChange?.({ indexes, anchor: indexes.at(-1) ?? null, rowIds: [row.id], textRanges: [{ rowId: row.id, start, end }],
          ranges: first && last ? [{ id: `text-${row.id}-${start}-${end}`, start: first.start, end: last.end }] : [] });
      }} onFocus={() => setEditingRowId(row.id)} onKeyDown={(event) => handleRowKey(event, row)} onPaste={(event) => handleRowPaste(event, row)} placeholder={number === 1 ? "Nhập lời thoại… Enter: lượt nói mới · Alt+Enter: xuống dòng · dán được từ Excel, Sheets, Word" : "Nhập lời thoại…"} rows={1} spellCheck value={row.text} />
    </div>;
  }

  function renderTimestamp(row: VoiceScriptRow) {
    const timing = timings.get(row.id);
    if (job?.status === "running" && job.currentRowId === row.id) {
      return <div className="script-table__timestamp voice-script__timestamp is-reading" role="gridcell"><code>ĐANG ĐỌC…</code><code>{job.done}/{job.total}</code></div>;
    }
    if (timing?.fresh) {
      return <div className="script-table__timestamp" role="gridcell"><code>IN&nbsp;&nbsp;{timecode(timing.start)}</code><code>OUT {timecode(timing.end)}</code></div>;
    }
    return <div className="script-table__timestamp voice-script__timestamp" role="gridcell"><code>IN&nbsp;&nbsp;—</code><code>{timing ? "ĐÃ SỬA · ĐỌC LẠI" : normalizedRowText(row.text) ? "CHƯA ĐỌC" : "—"}</code></div>;
  }

  const layout = useScriptTableLayout();
  const menuRow = voiceMenu ? shownRows.find((row) => row.id === voiceMenu.rowId) ?? null : null;
  const menuVoice = menuRow ? resolveRowVoice(menuRow, voices) : null;
  const bySpeaker = speakers
    .map((speaker) => [speaker, voices.filter((voice) => voice.speakerProfileId === speaker.id)] as const)
    .filter(([, items]) => items.length);
  const orphanVoices = voices.filter((voice) => !speakers.some((speaker) => speaker.id === voice.speakerProfileId));
  const duration = freshOutput && output ? output.duration : estimatedSeconds(rows);
  const timingNote = output && freshOutput && output.wordTimingQuality && output.wordTimingQuality !== "source" ? output.wordTimingNote : null;
  const hasTrustedWords = words.some((word) => word.timingTrusted !== false);
  const readLabel = busy
    ? job ? `Đang đọc ${Math.min(job.done + 1, job.total)}/${job.total}` : "Đang gửi…"
    : readiness.problem ?? (freshOutput ? "Đọc lại Script" : "Tạo voice");

  return <ModuleFrame action={<div className="script-module__duration"><span>{freshOutput ? "TTS DURATION" : "EST. DURATION"}</span><strong>{clock(duration)}</strong></div>} className="script-module voice-script-module" eyebrow={output ? `VOICE OUTPUT · ${output.name}` : "VOICE SCRIPT · nhập lời thoại"} title="SCRIPT">
    <div className="script-toolbars">
      <div className="script-review-strip">
        <strong>VOICE SCRIPT</strong>
        <span className={`voice-script__category is-${category}`} title="Theo lựa chọn ở Voice Training">{CATEGORY_LABELS[category]}</span>
        <span className="review-status"><i />{busy && job?.message ? ` ${job.message}` : freshOutput ? " Sub chạy theo giọng đã tạo" : " Mỗi dòng một lượt nói · chọn voice ở cột Speaker"}</span>
      </div>
      <div aria-label="Công cụ văn bản" className="script-edit-toolbar">
        <button aria-expanded={findOpen} className={findOpen ? "is-active" : ""} onClick={() => setFindOpen((open) => !open)} type="button">FIND / REPLACE</button>
        <label>SIZE<select aria-label="Cỡ chữ Script" onChange={(event) => setFontScale(Number(event.target.value))} value={fontScale}><option value="85">85%</option><option value="100">100%</option><option value="115">115%</option><option value="130">130%</option><option value="150">150%</option></select></label>
        <button aria-pressed={bold} onClick={() => setBold((value) => !value)} type="button"><b>B</b></button>
        <button aria-pressed={italic} onClick={() => setItalic((value) => !value)} type="button"><i>I</i></button>
        <button aria-pressed={underline} onClick={() => setUnderline((value) => !value)} type="button"><u>U</u></button>
        <button aria-pressed={view === "table"} onClick={toggleView} title="Dạng bảng: Speaker, nội dung và timestamp; tắt để sửa văn bản dạng “Tên: lời thoại”" type="button">DẠNG BẢNG</button>
      </div>
      {timingNote ? <div className="script-timing-warning" role="status">{timingNote}</div> : null}
      {findOpen ? <div aria-label="Tìm và thay thế" className="script-find-replace"><input aria-label="Tìm text" onChange={(event) => setFindQuery(event.target.value)} placeholder="Tìm" value={findQuery} /><input aria-label="Thay bằng text" onChange={(event) => setReplaceQuery(event.target.value)} placeholder="Thay bằng" value={replaceQuery} /><label><input checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} type="checkbox" /> Phân biệt hoa/thường</label><button onClick={() => findNext(true)} type="button">↑</button><button onClick={() => findNext()} type="button">↓</button><button onClick={replaceCurrent} type="button">REPLACE</button><button onClick={replaceAll} type="button">ALL</button></div> : null}
    </div>
    {saveError ? <div role="alert" className="script-timing-warning">{saveError}<button onClick={() => { if (window.confirm("Tải Script đã lưu? Nội dung chưa lưu vẫn có bản dự phòng trong trình duyệt.")) onReload?.(); }} type="button">Tải lại bản đã lưu</button></div> : null}
    <VoiceScriptSettings document={scriptDocument ?? migrateScript(rows)} onChange={onDocumentChange} onRowsChange={onRowsChange} selectedIds={selectedRowIds} />
    <DeliveryCapabilities document={scriptDocument ?? migrateScript(rows)} />
    {output && voiceRender ? <VoiceRenderControls controller={voiceRender} saved={timingContext?.saved ?? false} /> : null}
    {output && timingContext && scriptDocument ? <VoiceFixControls projectId={timingContext.projectId} outputId={output.id} output={output} onOutputReady={onFixedOutput} onNavigateOutput={onNavigateOutput} scriptRevision={scriptDocument.revision} editRevision={timingContext.editRevision ?? 0} saved={timingContext.saved} /> : null}
    {timingContext && scriptDocument ? <DurationPlanPanel projectId={timingContext.projectId} document={scriptDocument} saved={timingContext.saved} output={output} refreshKey={durationRefresh} /> : null}
    {timingContext && scriptDocument ? <TimingPlanEditor {...timingContext} document={scriptDocument} onChange={() => setDurationRefresh((current) => current + 1)} /> : null}
    {view === "table" ? <div className="script-table-shell voice-script" onContextMenu={referenceContext} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) referenceContext(event); else handleRowSelectionKey(event); }} ref={followRoot}>
      {selectedRowIds.length ? <div aria-label="Thao tác dòng đã chọn" className="voice-script__bulk-actions"><b>{selectedRowIds.length} dòng đã chọn</b><label>Gán speaker<select aria-label="Gán speaker cho các dòng đã chọn" onChange={(event) => assignSpeakerToSelected(event.target.value)} value="__choose__"><option value="__choose__">Chọn speaker…</option><option value="__none__">Bỏ gán</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select></label><button className="button button--quiet is-danger" onClick={deleteSelectedRows} type="button">Xoá dòng đã chọn</button><button className="button button--quiet" onClick={() => setRowSelection({ ids: [], anchorId: null })} type="button">Bỏ chọn</button></div> : null}
      <div className="script-table-scroll-region"><div className="script-table-scroll" onPointerDown={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if ((event.target as HTMLElement).closest("[data-script-word-index]")) return;
        if (wordSelection.indexes.length) onWordSelectionChange?.(EMPTY_SELECTION);
      }} ref={scrollRef}>
        <div aria-label="Bảng Script theo lượt nói" className="script-table voice-script__table" role="grid" style={{ minWidth: layout.columns.reduce((sum, column) => sum + column.width, 60) }}>
          <ScriptTranscriptHeader layout={layout} />
          {shownRows.map((row, index) => {
            const timing = timings.get(row.id);
            const active = Boolean(timing?.fresh && activeWordIndex >= timing.firstWord && activeWordIndex < timing.lastWord);
            return <ScriptTranscriptRow className={`${active ? "is-active" : ""} ${selectedRowIds.includes(row.id) ? "is-selected" : ""} ${job?.status === "running" && job.currentRowId === row.id ? "is-reading" : ""}`} data-script-row-id={row.id} key={row.id} columns={layout.columns} gridTemplateColumns={layout.gridTemplateColumns}
              cells={{ speaker: renderSpeaker(row, index + 1), content: renderContent(row, index + 1), timestamp: renderTimestamp(row) }}
              selectionFallback={<ScriptRowSelection number={index + 1} label={`Chọn đoạn ${index + 1}`} selected={selectedRowIds.includes(row.id)} onSelect={(event) => selectRow(event, row.id)} />}>
              <div className="script-table__cell voice-script__row-actions">
                <button aria-label={`Đưa đoạn ${index + 1} lên`} disabled={index === 0 || !rows.length} onClick={() => moveRow(row.id, -1)} type="button">↑</button>
                <button aria-label={`Đưa đoạn ${index + 1} xuống`} disabled={index >= rows.length - 1} onClick={() => moveRow(row.id, 1)} type="button">↓</button>
                <button aria-label={`Xoá đoạn ${index + 1}`} disabled={!rows.length} onClick={() => removeRow(row.id)} type="button">×</button>
              </div>
            </ScriptTranscriptRow>;
          })}
          <button className="voice-script__add" onClick={() => insertAfter(shownRows[shownRows.length - 1]?.id ?? null)} type="button"><Icon name="plus" />THÊM ĐOẠN</button>
        </div>
      </div>
      <ScriptSelectionMarkers viewport={scrollRef} markers={selectionMarkers} />
      <ScriptScrollbar viewportRef={scrollRef} label="Thanh cuộn Voice Script" className="script-table-scrollbar" />
      </div>
    </div> : <div className="script-editor-stack voice-script__text" style={textStyle}>
      <textarea aria-label="Script dạng văn bản" className="script-editor" onChange={(event) => changeText(event.target.value)} onPaste={handleTextPaste} placeholder={"Anh Vũ: Xin chào mọi người\nKhoa Trịnh: Chào anh"} ref={textRef} spellCheck value={textDraft} />
    </div>}

    {voiceMenu ? <div className="script-table__word-menu voice-script__menu" onPointerDown={(event) => event.stopPropagation()} role="menu" style={{ left: voiceMenu.x, top: voiceMenu.y }}>
      <strong>VOICE ĐỌC ĐOẠN {shownRows.findIndex((row) => row.id === voiceMenu.rowId) + 1} · {CATEGORY_LABELS[category].toUpperCase()}</strong>
      {[...bySpeaker, ...(orphanVoices.length ? [[null, orphanVoices] as const] : [])].map(([speaker, items]) => <div className="voice-script__menu-group" key={speaker?.id ?? "other"}>
        <small>{speaker?.name ?? "Khác"}</small>
        {items.map((voice) => <button aria-checked={menuVoice?.id === voice.id} key={voice.id} onClick={() => pickVoice(voice)} role="menuitemradio" style={{ borderLeftColor: speaker?.color }} type="button"><i style={{ background: speaker?.color ?? "var(--text-muted)" }} /><span><b>{VOICE_KIND_LABELS[voice.kind]} · {ENGINE_LABELS[voice.engine] ?? voice.engine}</b><em>{voice.referenceSeconds.toFixed(1)}s mẫu · {new Date(voice.createdAt).toLocaleDateString("vi-VN")}</em></span></button>)}
      </div>)}
      {!voices.length ? <div className="voice-script__menu-empty"><span>Chưa có voice dạng {CATEGORY_LABELS[category].toLowerCase()}. Tạo ở Voice Training: chọn dạng, tick Speaker Profile rồi bấm Bắt đầu.</span>{onOpenTraining ? <button onClick={() => { setVoiceMenu(null); onOpenTraining(); }} type="button">Mở Voice Training</button> : null}</div> : null}
      <button className="voice-script__menu-close" onClick={() => setVoiceMenu(null)} type="button">Đóng</button>
    </div> : null}

    <ScriptProgress tasks={activityTasks} />

    <div className="script-module__footer">
      <div className="script-stats"><span><b>{rows.filter((row) => normalizedRowText(row.text)).length}</b> đoạn</span><span><b>{usedVoices.size}</b> voice</span><span><b>{wordCount}</b> từ</span></div>
      <div className="script-actions">
        {output && onExport ? <span className="script-export"><button aria-expanded={exportOpen} className="button button--quiet" onClick={() => setExportOpen((open) => !open)} type="button">EXPORT ▾</button>{exportOpen ? <div className="script-export__menu" role="menu"><button onClick={() => { setExportOpen(false); onExport("audio"); }} role="menuitem" type="button"><b>Âm thanh WAV</b><small>File giọng đã tạo</small></button><button disabled={!output.segments?.length} onClick={() => { setExportOpen(false); onExport("line"); }} role="menuitem" title={!output.segments?.length ? "Output này chưa có mốc thời gian từng dòng Script" : undefined} type="button"><b>SRT từng dòng</b><small>Mỗi dòng Script một cue</small></button><button disabled={!hasTrustedWords} onClick={() => { setExportOpen(false); onExport("word"); }} role="menuitem" title={!hasTrustedWords ? "Chưa có thời gian từng từ đáng tin" : undefined} type="button"><b>SRT từng từ</b><small>Timestamp theo giọng đã tạo</small></button><button disabled={!hasTrustedWords} onClick={() => { setExportOpen(false); onExport("sentence"); }} role="menuitem" type="button"><b>SRT theo câu</b><small>Dễ đọc · tối đa 2 dòng</small></button><button disabled={!words.length} onClick={() => { setExportOpen(false); onExport("table"); }} role="menuitem" type="button"><b>Bảng Script CSV</b><small>Speaker · nội dung · start · end</small></button></div> : null}</span> : null}
        <button className="button button--quiet is-danger" disabled={busy || !rows.length} onClick={clearScript} type="button">Clear Script</button>
        <button aria-label="Tạo voice" className="button button--accent" disabled={busy || Boolean(readiness.problem)} onClick={onRead} type="button"><span><b>{readLabel}</b><small>{readiness.rows.length} đoạn · {usedVoices.size} voice · {CATEGORY_LABELS[category]}</small></span><Icon name="arrow" /></button>
      </div>
    </div>
  </ModuleFrame>;
}
