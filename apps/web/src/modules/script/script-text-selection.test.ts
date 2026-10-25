import { describe, expect, it } from "vitest";
import { serializeScriptTextSelection } from "./script-text-selection";

function selection(root: HTMLElement, start: Node, startOffset: number, end: Node, endOffset: number) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const value = window.getSelection()!;
  value.removeAllRanges();
  value.addRange(range);
  return serializeScriptTextSelection(root, value);
}

function editor() {
  const root = document.createElement("div");
  root.innerHTML = '<div data-script-text-row><span data-script-text-speaker data-script-text-copy-label="An Vũ">An Vũ</span><span data-script-text-dialogue>Xin chào</span></div><div data-script-text-row><span data-script-text-speaker data-script-text-copy-label="Khoa">Khoa</span><span data-script-text-dialogue>Được không sao</span></div>';
  document.body.append(root);
  const speakers = [...root.querySelectorAll<HTMLElement>("[data-script-text-speaker]")];
  const dialogue = [...root.querySelectorAll<HTMLElement>("[data-script-text-dialogue]")];
  return { root, speakers, dialogue };
}

describe("Script text selection copy", () => {
  it("copies only the speaker column when both endpoints are speaker names", () => {
    const { root, speakers } = editor();
    expect(selection(root, speakers[0].firstChild!, 0, speakers[1].firstChild!, 4)).toBe("An Vũ\nKhoa");
    root.remove();
  });
  it("preserves browser-created block and break newlines in copied dialogue", () => {
    const { root, dialogue } = editor();
    dialogue[0].innerHTML = "Xin<div>chào</div><div><br></div><div>nhé</div>";
    expect(selection(root, dialogue[0], 0, dialogue[0], dialogue[0].childNodes.length)).toBe("Xin\nchào\n\nnhé");
    root.remove();
  });
  it("copies selected dialogue across rows without intermediate speaker labels", () => {
    const { root, dialogue } = editor();
    const text = selection(root, dialogue[0].firstChild!, 0, dialogue[1].firstChild!, 8);
    expect(text).toBe("Xin chào\nĐược khô");
    root.remove();
  });

  it("includes speaker names when selection endpoints span the speaker and dialogue columns", () => {
    const { root, speakers, dialogue } = editor();
    const text = selection(root, speakers[0].firstChild!, 0, dialogue[1].firstChild!, 14);
    expect(text).toBe("An Vũ: Xin chào\nKhoa: Được không sao");
    root.remove();
  });

  it("serializes partial reverse selections in row order", () => {
    const { root, dialogue } = editor();
    const value = window.getSelection()!;
    value.removeAllRanges();
    value.collapse(dialogue[1].firstChild!, 4);
    value.extend(dialogue[0].firstChild!, 2);
    expect(serializeScriptTextSelection(root, value)).toBe("n chào\nĐược");
    root.remove();
  });

  it("preserves blank intermediate rows and excludes the text-view header on select all", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div data-header>Speaker Lời thoại</div><div data-script-text-row><span data-script-text-speaker data-script-text-copy-label="A">A:</span><span data-script-text-dialogue>One</span></div><div data-script-text-row><span data-script-text-speaker data-script-text-copy-label="B">B:</span><span data-script-text-dialogue></span></div><div data-script-text-row><span data-script-text-speaker data-script-text-copy-label="C">C:</span><span data-script-text-dialogue>Three</span></div>';
    document.body.append(root);
    const dialogue = [...root.querySelectorAll<HTMLElement>("[data-script-text-dialogue]")];
    const selection = window.getSelection()!;
    selection.collapse(dialogue[0].firstChild!, 0);
    selection.extend(dialogue[2].firstChild!, 5);
    expect(serializeScriptTextSelection(root, selection)).toBe("One\n\nThree");
    const all = document.createRange();
    all.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(all);
    expect(serializeScriptTextSelection(root, selection)).toBe("A: One\nB: \nC: Three");
    root.remove();
  });
});
