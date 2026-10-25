import { act, fireEvent } from "@testing-library/react";
import { editableText, scriptTextOffset } from "../modules/script/script-text-dom";
import { selectTranscriptTextRange } from "../modules/script/TranscriptTextView";

/** Simulate DOM input/selection, including the legacy comparison textarea. */
export function selectEditorText(editor: HTMLElement, start: number, end: number) {
  act(() => {
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) { editor.focus(); editor.setSelectionRange(start, end); }
    else {
      // JSDOM does not reflect this native property; React uses it to track selection.
      editor.contentEditable = "true";
      selectTranscriptTextRange(editor, start, end);
    }
  });
}
export function editorSelection(editor: HTMLElement) {
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) return { start: editor.selectionStart, end: editor.selectionEnd };
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return { start: 0, end: 0 };
  const range = selection.getRangeAt(0);
  const offset = (node: Node, at: number) => {
    const cell = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-transcript-start]");
    return cell ? Number(cell.dataset.transcriptStart) + scriptTextOffset(cell, node, at) : 0;
  };
  return { start: offset(range.startContainer, range.startOffset), end: offset(range.endContainer, range.endOffset) };
}
export function editorText(editor: HTMLElement) {
  return editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement ? editor.value : [...editor.querySelectorAll("[data-script-text-dialogue]")].map(editableText).join("");
}
export function changeEditorText(editor: HTMLElement, text: string) {
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) { fireEvent.change(editor, { target: { value: text } }); return; }
  const cells = [...editor.querySelectorAll<HTMLElement>("[data-script-text-dialogue]")];
  if (cells.length !== 1) throw new Error("Edit one turn at a time in this helper");
  const cell = cells[0];
  fireEvent(cell, new InputEvent("beforeinput", { inputType: "insertText", bubbles: true, cancelable: true }));
  cell.textContent = text;
  const range = document.createRange();
  range.selectNodeContents(cell); range.collapse(false);
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
  fireEvent.input(cell);
}
