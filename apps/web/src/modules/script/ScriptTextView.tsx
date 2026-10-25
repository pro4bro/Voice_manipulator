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

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const activeElement = document.activeElement;
    const selection = window.getSelection();
    const active = activeElement === root ? activeCell(selection?.anchorNode ?? null) : activeElement;
    const selected = readSelectedScriptText(root);
    for (const row of rows) {
      const cell = cells.current.get(row.id);
      if (!cell || editableText(cell) === row.text || cell === active && composing.current) continue;
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
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!cell.contains(range.startContainer) || !cell.contains(range.endContainer)) return;
    if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const handleBeforeInput = (event: InputEvent) => {
      const cell = activeCell(event.target);
      if (!cell) {
        event.preventDefault();
        root.setAttribute("data-edit-guidance", "Chọn nội dung ở cột Lời thoại để nhập hoặc sửa text.");
        return;
      }
      if (refuseCrossRowEdit(event)) return;
      if (event.isComposing) return;
      root.removeAttribute("data-edit-guidance");
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        insertText(cell, "\n");
        onTextChange(cell.dataset.rowId!, editableText(cell));
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
    if (cell) onTextChange(cell.dataset.rowId!, editableText(cell));
  }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={(event) => {
    composing.current = false;
    const cell = activeCell(event.target);
    if (cell) onTextChange(cell.dataset.rowId!, editableText(cell));
  }} onKeyDown={(event) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const cell = activeCell(event.target);
      if (cell && !refuseCrossRowEdit(event.nativeEvent)) {
        insertText(cell, "\n");
        onTextChange(cell.dataset.rowId!, editableText(cell));
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
    onTextChange(cell.dataset.rowId!, editableText(cell));
  }} onDrop={(event) => { event.preventDefault(); rootRef.current?.setAttribute("data-edit-guidance", "Kéo thả text chưa hỗ trợ; hãy dùng sao chép/dán trong ô lời thoại."); }} ref={(element) => { rootRef.current = element; onRoot(element); }} role="textbox" aria-multiline="true" suppressContentEditableWarning contentEditable spellCheck style={{ whiteSpace: "pre-wrap" }}>
    <div className="script-text-view__header" contentEditable={false}><span>Speaker</span><span>Lời thoại</span></div>
    {rows.map((row, index) => {
      const speaker = speakers.find((profile) => profile.id === row.speakerProfileId);
      return <div className="script-text-view__row" data-script-text-row data-script-row-id={row.id} key={row.id}>
        <div className="script-text-view__speaker" contentEditable={false} data-script-text-speaker data-script-text-copy-label={speaker?.name ?? "Chưa gán Profile"}>{speaker?.name ?? "Chưa gán Profile"}:</div>
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
