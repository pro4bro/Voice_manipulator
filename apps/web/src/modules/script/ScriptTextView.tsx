import { useEffect, useLayoutEffect, useRef } from "react";
import type { SpeakerProfile, VoiceScriptRow } from "../../domain/types";
import { serializeScriptTextSelection } from "./script-text-selection";
import { editableText, scriptTextOffset, scriptTextPosition } from "./script-text-dom";
import "./script-text-view.css";

interface ScriptTextViewProps {
  rows: VoiceScriptRow[];
  speakers: SpeakerProfile[];
  onTextChange: (rowId: string, text: string) => void;
  onRoot: (element: HTMLDivElement | null) => void;
}

interface TextEdit {
  rowId: string;
  before: string;
  after: string;
  selectionBefore: [number, number];
  selectionAfter: [number, number];
}

function selectedDialogue(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const start = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)
    ?.closest<HTMLElement>("[data-script-text-dialogue]");
  const end = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)
    ?.closest<HTMLElement>("[data-script-text-dialogue]");
  return start && start === end && root.contains(start) ? { selection, range, cell: start } : null;
}

function isAtCellEdge(cell: HTMLElement, range: Range, edge: "start" | "end") {
  const offset = scriptTextOffset(cell, range.startContainer, range.startOffset);
  return edge === "start" ? offset === 0 : offset === editableText(cell).length;
}

function selectText(root: HTMLElement, rowId: string, start: number, end: number) {
  const cell = root.querySelector<HTMLElement>(`[data-script-text-dialogue][data-row-id="${CSS.escape(rowId)}"]`);
  if (!cell) return;
  cell.focus();
  const [startNode, startOffset] = scriptTextPosition(cell, start);
  const [endNode, endOffset] = scriptTextPosition(cell, end);
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** A single editing host keeps native selection continuous across rows and columns. */
export function ScriptTextView({ rows, speakers, onTextChange, onRoot }: ScriptTextViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLElement>());
  const composing = useRef(false);
  const lastText = useRef(new Map<string, string>());
  const editSelection = useRef<ReturnType<typeof readSelectedScriptText>>(null);
  const history = useRef<{ undo: TextEdit[]; redo: TextEdit[] }>({ undo: [], redo: [] });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const activeElement = document.activeElement;
    const selection = window.getSelection();
    const active = activeElement === root ? activeCell(selection?.anchorNode ?? null) : activeElement;
    const selected = readSelectedScriptText(root);
    if ([...lastText.current.keys()].some((id) => !rows.some((row) => row.id === id))) {
      history.current = { undo: [], redo: [] };
      lastText.current.clear();
    }
    for (const row of rows) {
      const cell = cells.current.get(row.id);
      if (!cell || cell === active && composing.current) continue;
      if (lastText.current.has(row.id) && lastText.current.get(row.id) !== row.text) history.current = { undo: [], redo: [] };
      lastText.current.set(row.id, row.text);
      if (editableText(cell) === row.text) continue;
      cell.textContent = row.text;
      if (selected?.rowId === row.id) {
        const length = row.text.length;
        selectText(root, row.id, Math.min(selected.start, length), Math.min(selected.end, length));
      }
    }
  }, [rows]);

  function cellFor(target: EventTarget | null) {
    const node = target instanceof Node ? target : null;
    const cell = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-script-text-dialogue]") ?? null;
    return cell && rootRef.current?.contains(cell) ? cell : null;
  }

  function activeCell(target: EventTarget | null) {
    return cellFor(target) ?? cellFor(window.getSelection()?.anchorNode ?? null);
  }

  function refuseCrossRowEdit(event: Event) {
    const root = rootRef.current;
    const selected = window.getSelection();
    const start = root && selected ? cellFor(selected.anchorNode) : null;
    const end = root && selected ? cellFor(selected.focusNode) : null;
    if (selected && !selected.isCollapsed && (!start || !end || start !== end)) {
      event.preventDefault();
      root?.setAttribute("data-edit-guidance", "Chỉnh sửa từng hàng để giữ nguyên speaker và ranh giới lượt nói.");
      return true;
    }
    root?.removeAttribute("data-edit-guidance");
    return false;
  }

  function insertText(cell: HTMLElement, text: string) {
    const root = rootRef.current;
    const selected = root && readSelectedScriptText(root);
    if (!root || !selected || selected.rowId !== cell.dataset.rowId) return;
    editSelection.current = selected;
    const value = editableText(cell);
    // Browser editing commands can split a grid cell or insert before it at offset 0.
    // Replace only this cell's literal text and keep history independent of DOM markup.
    cell.textContent = value.slice(0, selected.start) + text + value.slice(selected.end);
    selectText(root, selected.rowId, selected.start + text.length, selected.start + text.length);
    commitCell(cell);
  }

  function commitCell(cell: HTMLElement) {
    const rowId = cell.dataset.rowId!;
    const before = lastText.current.get(rowId) ?? "";
    const after = editableText(cell);
    if (before === after) return;
    const selected = rootRef.current && readSelectedScriptText(rootRef.current);
    const prior = editSelection.current?.rowId === rowId ? editSelection.current : null;
    history.current.undo.push({ rowId, before, after, selectionBefore: [prior?.start ?? 0, prior?.end ?? 0], selectionAfter: [selected?.start ?? after.length, selected?.end ?? after.length] });
    if (history.current.undo.length > 100) history.current.undo.shift();
    history.current.redo = [];
    lastText.current.set(rowId, after);
    onTextChange(rowId, after);
  }

  function replayEdit(direction: "undo" | "redo") {
    const edit = history.current[direction].pop();
    const root = rootRef.current;
    const cell = edit && cells.current.get(edit.rowId);
    if (!edit || !root || !cell) return;
    const value = direction === "undo" ? edit.before : edit.after;
    const [start, end] = direction === "undo" ? edit.selectionBefore : edit.selectionAfter;
    cell.textContent = value;
    lastText.current.set(edit.rowId, value);
    history.current[direction === "undo" ? "redo" : "undo"].push(edit);
    selectText(root, edit.rowId, start, end);
    onTextChange(edit.rowId, value);
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const handleBeforeInput = (event: InputEvent) => {
      if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
        event.preventDefault();
        if (!composing.current) replayEdit(event.inputType === "historyUndo" ? "undo" : "redo");
        return;
      }
      const cell = activeCell(event.target);
      if (!cell) {
        event.preventDefault();
        root.setAttribute("data-edit-guidance", "Chọn nội dung ở cột Lời thoại để nhập hoặc sửa text.");
        return;
      }
      if (refuseCrossRowEdit(event)) return;
      if (event.isComposing) return;
      editSelection.current = readSelectedScriptText(root);
      root.removeAttribute("data-edit-guidance");
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        insertText(cell, "\n");
      } else if (/^delete.*(?:Backward|Forward)$/u.test(event.inputType) && window.getSelection()?.rangeCount) {
        const range = window.getSelection()!.getRangeAt(0);
        if (range.collapsed && (event.inputType.endsWith("Backward") && isAtCellEdge(cell, range, "start") || event.inputType.endsWith("Forward") && isAtCellEdge(cell, range, "end"))) event.preventDefault();
      }
    };
    root.addEventListener("beforeinput", handleBeforeInput);
    return () => root.removeEventListener("beforeinput", handleBeforeInput);
  }, [rows, onTextChange]);

  return <div aria-label="Script dạng văn bản" className="script-text-view" data-testid="script-text-view" onCopy={(event) => {
    const root = rootRef.current;
    if (!root) return;
    const text = serializeScriptTextSelection(root, window.getSelection());
    if (!text) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
  }} onInput={(event) => {
    const cell = activeCell(event.target);
    if (cell && !composing.current) commitCell(cell);
  }} onCompositionStart={() => {
    composing.current = true;
    editSelection.current = rootRef.current && readSelectedScriptText(rootRef.current);
  }} onCompositionEnd={(event) => {
    composing.current = false;
    const cell = activeCell(event.target);
    if (cell) commitCell(cell);
  }} onKeyDown={(event) => {
    const key = event.key.toLowerCase();
    if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      replayEdit(key === "y" || event.shiftKey ? "redo" : "undo");
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const cell = activeCell(event.target);
      if (cell && !refuseCrossRowEdit(event.nativeEvent)) {
        insertText(cell, "\n");
      }
    } else if (event.key === "Backspace" || event.key === "Delete") {
      if (refuseCrossRowEdit(event.nativeEvent)) { event.preventDefault(); return; }
      const cell = activeCell(event.target);
      if (!cell) { event.preventDefault(); return; }
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || !range.collapsed) return;
      if (event.key === "Backspace" && isAtCellEdge(cell, range, "start") || event.key === "Delete" && isAtCellEdge(cell, range, "end")) event.preventDefault();
    }
  }} onCut={(event) => {
    if (!activeCell(event.target) || refuseCrossRowEdit(event.nativeEvent)) {
      event.preventDefault();
      rootRef.current?.setAttribute("data-edit-guidance", "Chỉ cắt text bên trong một ô lời thoại; cấu trúc lượt nói được giữ nguyên.");
    }
  }} onPaste={(event) => {
    event.preventDefault();
    const cell = activeCell(event.target);
    if (!cell || refuseCrossRowEdit(event.nativeEvent)) return;
    insertText(cell, event.clipboardData.getData("text/plain"));
  }} onDrop={(event) => { event.preventDefault(); rootRef.current?.setAttribute("data-edit-guidance", "Kéo thả text chưa hỗ trợ; hãy dùng sao chép/dán trong ô lời thoại."); }} ref={(element) => { rootRef.current = element; onRoot(element); }} role="textbox" aria-multiline="true" suppressContentEditableWarning contentEditable spellCheck style={{ whiteSpace: "pre-wrap" }}>
    <div className="script-text-view__header" contentEditable={false}><span>Speaker</span><span>Lời thoại</span></div>
    {rows.map((row, index) => {
      const speaker = speakers.find((profile) => profile.id === row.speakerProfileId);
      return <div className="script-text-view__row" data-script-text-row data-script-row-id={row.id} key={row.id}>
        <div className="script-text-view__speaker" data-script-text-speaker data-script-text-copy-label={speaker?.name ?? "Chưa gán Profile"}>{speaker?.name ?? "Chưa gán Profile"}:</div>
        <div aria-label={`Lời thoại đoạn ${index + 1}`} className="script-text-view__dialogue" data-script-text-dialogue data-row-id={row.id} ref={(element) => { if (element) cells.current.set(row.id, element); else cells.current.delete(row.id); }} tabIndex={0} />
      </div>;
    })}
    <output aria-live="polite" className="script-text-view__guidance">{rows.length ? "" : "Thêm đoạn ở Dạng bảng để bắt đầu."}</output>
  </div>;
}

export function readSelectedScriptText(root: HTMLElement) {
  const selected = selectedDialogue(root);
  if (!selected) return null;
  const { range, cell } = selected;
  return { rowId: cell.dataset.rowId!, start: scriptTextOffset(cell, range.startContainer, range.startOffset), end: scriptTextOffset(cell, range.endContainer, range.endOffset), text: editableText(cell).slice(scriptTextOffset(cell, range.startContainer, range.startOffset), scriptTextOffset(cell, range.endContainer, range.endOffset)) };
}

export function selectScriptText(root: HTMLElement, rowId: string, start: number, end: number) {
  selectText(root, rowId, start, end);
}
