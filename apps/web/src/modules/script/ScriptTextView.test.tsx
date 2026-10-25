import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readSelectedScriptText, ScriptTextView, selectScriptText } from "./ScriptTextView";

const rows = [
  { id: "r1", text: "Xin chào", speakerProfileId: "an", voiceId: "an-voice" },
  { id: "r2", text: "Được không", speakerProfileId: "khoa", voiceId: "khoa-voice" },
];
const speakers = [{ id: "an", name: "An Vũ" }, { id: "khoa", name: "Khoa Trịnh" }];

describe("Script text view", () => {
  it("keeps labels in the selection host while blocking edits to speaker names", () => {
    const onTextChange = vi.fn();
    render(<ScriptTextView onRoot={() => {}} onTextChange={onTextChange} rows={rows as never} speakers={speakers as never} />);
    const root = screen.getByTestId("script-text-view");
    const label = root.querySelector<HTMLElement>("[data-script-text-speaker]")!;
    expect(label).not.toHaveAttribute("contenteditable", "false");
    window.getSelection()!.collapse(label.firstChild!, 1);
    for (const inputType of ["insertText", "insertCompositionText", "deleteContentBackward"]) {
      const input = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
      fireEvent(root, input);
      expect(input.defaultPrevented).toBe(true);
    }
    expect(fireEvent.cut(root)).toBe(false);
    fireEvent.paste(root, { clipboardData: { getData: () => "replacement" } });
    expect(label).toHaveTextContent("An Vũ:");
    expect(onTextChange).not.toHaveBeenCalled();
  });
  it("finds and copies text after browser block line breaks, with safe delete boundaries", () => {
    const onTextChange = vi.fn();
    render(<ScriptTextView onRoot={() => {}} onTextChange={onTextChange} rows={rows as never} speakers={speakers as never} />);
    const root = screen.getByTestId("script-text-view");
    const cell = root.querySelector<HTMLElement>('[data-row-id="r1"]')!;
    cell.innerHTML = "Xin<div>chào</div><div><br></div><div>nhé</div>";
    fireEvent.input(cell);
    expect(onTextChange).toHaveBeenLastCalledWith("r1", "Xin\nchào\n\nnhé");
    selectScriptText(root, "r1", 10, 13);
    expect(readSelectedScriptText(root)).toEqual({ rowId: "r1", start: 10, end: 13, text: "nhé" });
    const setData = vi.fn();
    fireEvent.copy(root, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "nhé");
    selectScriptText(root, "r1", 13, 13);
    const deletion = new InputEvent("beforeinput", { inputType: "deleteWordForward", bubbles: true, cancelable: true });
    fireEvent(root, deletion);
    expect(deletion.defaultPrevented).toBe(true);
  });

  it("guards cross-turn IME replacement, cut and drop without removing either speaker", () => {
    render(<ScriptTextView onRoot={() => {}} onTextChange={vi.fn()} rows={rows as never} speakers={speakers as never} />);
    const root = screen.getByTestId("script-text-view");
    const [first, second] = [...root.querySelectorAll<HTMLElement>("[data-script-text-dialogue]")];
    const selection = window.getSelection()!;
    selection.collapse(first.firstChild!, 2);
    selection.extend(second.firstChild!, 3);
    const input = new InputEvent("beforeinput", { inputType: "insertCompositionText", isComposing: true, bubbles: true, cancelable: true });
    fireEvent(root, input);
    expect(input.defaultPrevented).toBe(true);
    expect(fireEvent.cut(root)).toBe(false);
    expect(fireEvent.drop(root)).toBe(false);
    expect(root.querySelectorAll("[data-script-text-speaker]")).toHaveLength(2);
  });
  it("renders aligned speaker labels and dialogue cells while preserving row identities on edit", () => {
    const onTextChange = vi.fn();
    const { container } = render(<ScriptTextView onRoot={() => {}} onTextChange={onTextChange} rows={rows as never} speakers={speakers as never} />);
    const cells = [...container.querySelectorAll<HTMLElement>("[data-script-text-dialogue]")];
    expect(cells).toHaveLength(2);
    expect(container.querySelectorAll("[data-script-text-row]")).toHaveLength(2);
    expect(screen.getByText("An Vũ:")).toBeInTheDocument();
    (cells[1] as HTMLElement).textContent = "Được nhé";
    fireEvent.input(cells[1]);
    expect(onTextChange).toHaveBeenCalledWith("r2", "Được nhé");
  });

  it("inserts Alt+Enter as a literal newline in the current dialogue row", () => {
    const onTextChange = vi.fn();
    render(<ScriptTextView onRoot={() => {}} onTextChange={onTextChange} rows={rows as never} speakers={speakers as never} />);
    const cell = document.querySelector<HTMLElement>('[data-script-text-dialogue][data-row-id="r1"]')!;
    const text = cell.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.keyDown(cell, { key: "Enter", altKey: true });
    expect(cell.textContent).toBe("Xin\n chào");
    expect(onTextChange).toHaveBeenCalledWith("r1", "Xin\n chào");
  });

  it("pastes plain text, including speaker-looking lines, into the same dialogue row", () => {
    const onTextChange = vi.fn();
    render(<ScriptTextView onRoot={() => {}} onTextChange={onTextChange} rows={rows as never} speakers={speakers as never} />);
    const cell = document.querySelector<HTMLElement>('[data-script-text-dialogue][data-row-id="r1"]')!;
    const range = document.createRange();
    range.setStart(cell.firstChild!, 3);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.paste(screen.getByTestId("script-text-view"), { clipboardData: { getData: () => "\nKhoa: vẫn là lời thoại" } });
    expect(cell.textContent).toBe("Xin\nKhoa: vẫn là lời thoại chào");
    expect(onTextChange).toHaveBeenCalledWith("r1", "Xin\nKhoa: vẫn là lời thoại chào");
    expect(document.querySelectorAll("[data-script-text-row]")).toHaveLength(2);
  });

  it("keeps speaker names plain and does not offer profile controls in text view", () => {
    render(<ScriptTextView onRoot={() => {}} onTextChange={vi.fn()} rows={rows as never} speakers={speakers as never} />);
    expect(screen.getByText("An Vũ:")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("syncs an external same-row text change and keeps the caret within the updated text", () => {
    const props = { onRoot: () => {}, onTextChange: vi.fn(), speakers: speakers as never };
    const { rerender } = render(<ScriptTextView {...props} rows={rows as never} />);
    const cell = document.querySelector<HTMLElement>('[data-script-text-dialogue][data-row-id="r1"]')!;
    cell.focus();
    const range = document.createRange();
    range.setStart(cell.firstChild!, 4);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    rerender(<ScriptTextView {...props} rows={[{ ...rows[0], text: "Xin chào mới" }, rows[1]] as never} />);
    expect(cell.textContent).toBe("Xin chào mới");
    expect(readSelectedScriptText(document.querySelector<HTMLElement>(".script-text-view")!)?.start).toBe(4);
  });

  it("blocks destructive edits across rows while preserving their speaker and row structure", () => {
    const onTextChange = vi.fn();
    const { container } = render(<ScriptTextView onRoot={() => {}} onTextChange={onTextChange} rows={rows as never} speakers={speakers as never} />);
    const [first, second] = [...container.querySelectorAll<HTMLElement>("[data-script-text-dialogue]")];
    const selection = window.getSelection()!;
    selection.collapse(first.firstChild!, 0);
    selection.extend(second.firstChild!, 5);
    expect(selection.isCollapsed).toBe(false);
    const root = screen.getByTestId("script-text-view");
    fireEvent.paste(root, { clipboardData: { getData: () => "replacement" } });
    expect(container.querySelectorAll("[data-script-text-row]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-script-text-speaker]")).toHaveLength(2);
    expect(onTextChange).not.toHaveBeenCalled();
    expect(root).toHaveAttribute("data-edit-guidance");
  });

  it("undoes and redoes newlines and leading/trailing blank-line paste without splitting cells", () => {
    const onTextChange = vi.fn();
    render(<ScriptTextView onRoot={() => {}} onTextChange={onTextChange} rows={rows as never} speakers={speakers as never} />);
    const root = screen.getByTestId("script-text-view");
    const cell = root.querySelector<HTMLElement>('[data-row-id="r1"]')!;
    selectScriptText(root, "r1", 0, 0);
    fireEvent.keyDown(root, { key: "Enter", altKey: true });
    expect(cell.textContent).toBe("\nXin chào");
    fireEvent.paste(root, { clipboardData: { getData: () => "\n\n<b>gõ & dán</b>\n" } });
    const pasted = "\n\n\n<b>gõ & dán</b>\nXin chào";
    expect(cell.textContent).toBe(pasted);
    expect(cell.querySelector("b")).toBeNull();
    expect(root.querySelectorAll("[data-script-text-dialogue]")).toHaveLength(2);
    expect(root.querySelectorAll("[data-script-text-row]")).toHaveLength(2);
    fireEvent.keyDown(root, { key: "z", ctrlKey: true });
    expect(cell.textContent).toBe("\nXin chào");
    fireEvent.keyDown(root, { key: "z", ctrlKey: true });
    expect(cell.textContent).toBe("Xin chào");
    fireEvent.keyDown(root, { key: "z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(root, { key: "y", ctrlKey: true });
    expect(cell.textContent).toBe(pasted);
    expect(onTextChange).toHaveBeenLastCalledWith("r1", pasted);
  });

  it("records normal typing and a composition as edits and clears stale history after external replacement", () => {
    const onTextChange = vi.fn();
    const props = { onRoot: () => {}, onTextChange, speakers: speakers as never };
    const { rerender } = render(<ScriptTextView {...props} rows={rows as never} />);
    const root = screen.getByTestId("script-text-view");
    const cell = root.querySelector<HTMLElement>('[data-row-id="r1"]')!;
    selectScriptText(root, "r1", 0, 0);
    fireEvent(root, new InputEvent("beforeinput", { inputType: "insertText", bubbles: true, cancelable: true }));
    cell.textContent = "AXin chào";
    fireEvent.input(cell);
    fireEvent.compositionStart(cell);
    cell.textContent = "Tiếng Việt";
    fireEvent.input(cell);
    expect(onTextChange).toHaveBeenLastCalledWith("r1", "AXin chào");
    fireEvent.compositionEnd(cell);
    expect(onTextChange).toHaveBeenLastCalledWith("r1", "Tiếng Việt");
    fireEvent(root, new InputEvent("beforeinput", { inputType: "historyUndo", bubbles: true, cancelable: true }));
    expect(cell.textContent).toBe("AXin chào");
    fireEvent.keyDown(root, { key: "z", ctrlKey: true });
    expect(cell.textContent).toBe("Xin chào");
    rerender(<ScriptTextView {...props} rows={[{ ...rows[0], text: "Thay từ ngoài" }, rows[1]] as never} />);
    fireEvent.keyDown(root, { key: "y", ctrlKey: true });
    expect(cell.textContent).toBe("Thay từ ngoài");
  });
});
