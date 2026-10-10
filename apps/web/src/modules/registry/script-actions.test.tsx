import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectMediaAsset, SpeakerProfile } from "../../domain/types";
import { EMPTY_SELECTION } from "../../domain/word-selection";
import { ModuleRegistry, type StudioContext } from "./ModuleRegistry";

const words = [{ text: "Xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }];
const tracks = ["a", "b"].map((id) => ({ id, name: `Track ${id}`, sourceArchiveAssetId: "parent", text: "Xin chào", words,
  duration: 10, transcriptionStatus: "complete", scriptRef: `${id}.json`, wordTimingQuality: "source" })) as unknown as ProjectMediaAsset[];
function context(multi = true, count = 2): StudioContext {
  const speakers = Array.from({ length: count }, (_, index) => ({ id: `speaker-${index}`, name: `Speaker ${index}` })) as SpeakerProfile[];
  return { workflow: "speech-to-text", script: "Xin chào", selectedAssetId: multi ? "parent" : "a", selectedImportedTrackId: multi ? null : "a",
    mediaAssets: [{ id: "parent", name: "archive.mkv", words: [], text: "" }, ...tracks], take: multi ? null : tracks[0],
    trainingCatalog: { speakers, environmentProfiles: [] }, readingSession: null, wordSelection: EMPTY_SELECTION,
    obsTimelineActive: false, onScriptChange: vi.fn(), onWordsChange: vi.fn(), onAssetWordsChange: vi.fn(), onAssignScriptWords: vi.fn(),
    onAssignAssetSpeaker: vi.fn(), onSelectImportedTrack: vi.fn(), onRunAiReview: vi.fn(), canRunAiReview: true,
    onDeferredAction: vi.fn() } as unknown as StudioContext;
}

it.each([0, 1, 4])("opens every row profile dropdown with %i profiles before checking a row", (count) => {
  render(<ModuleRegistry id="script" context={context(true, count)} />);
  const selects = screen.getAllByRole("combobox", { name: /Speaker Profile của/ });
  selects.forEach((select) => {
    expect(select).toBeEnabled();
    expect(select.querySelectorAll("option")).toHaveLength(count + 1);
    expect(select.querySelector('option[value=""]')).toHaveTextContent("Chưa gán Profile");
  });
});

it("opens an ordinary footage row dropdown before checking it", () => {
  render(<ModuleRegistry id="script" context={context(false)} />);
  expect(screen.getByLabelText("Speaker Profile của row 1")).toBeEnabled();
});

it("keeps Script commands operational on a multitrack parent", () => {
  render(<ModuleRegistry id="script" context={context()} />);
  for (const name of ["DẠNG BẢNG", "AUTO NHỊP", "EXPORT ▾", "Clear Text", "AI fix"]) {
    expect(screen.getByRole("button", { name })).toBeEnabled();
  }
  fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
  expect(screen.getAllByRole("textbox", { name: /Script transcript/ })).toHaveLength(2);
});

it.each([false, true])("opening a row picker selects that row and can unassign it (multitrack=%s)", (multi) => {
  const ctx = context(multi);
  render(<ModuleRegistry id="script" context={ctx} />);
  const pick = screen.getAllByRole("combobox", { name: /Speaker Profile của/ })[0];
  fireEvent.focus(pick);
  fireEvent.change(pick, { target: { value: "speaker-1" } });
  if (multi) expect(ctx.onAssignScriptWords).toHaveBeenLastCalledWith("a", [0, 1], "speaker-1");
  else expect(ctx.onWordsChange).toHaveBeenLastCalledWith(words.map((word) => ({ ...word, speakerId: "speaker-1" })));
  fireEvent.change(pick, { target: { value: "" } });
  if (multi) expect(ctx.onAssignScriptWords).toHaveBeenLastCalledWith("a", [0, 1], null);
  else expect(ctx.onWordsChange).toHaveBeenLastCalledWith(words.map((word) => ({ ...word, speakerId: null })));
});

it("choosing from an unchecked row affects only the rows already selected", () => {
  const ctx = context();
  render(<ModuleRegistry id="script" context={ctx} />);
  fireEvent.click(screen.getByRole("button", { name: "Chọn row 2 của Track b" }));
  const pick = screen.getAllByRole("combobox", { name: /Speaker Profile của/ })[0];
  fireEvent.focus(pick);
  fireEvent.change(pick, { target: { value: "speaker-1" } });
  expect(ctx.onAssignScriptWords).toHaveBeenCalledTimes(1);
  expect(ctx.onAssignScriptWords).toHaveBeenCalledWith("b", [0, 1], "speaker-1");
});

it("exports and reviews the displayed sources instead of the parent archive", () => {
  const ctx = context();
  render(<ModuleRegistry id="script" context={ctx} />);
  fireEvent.click(screen.getByRole("button", { name: "EXPORT ▾" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Bảng Script CSV/ }));
  expect(ctx.onDeferredAction).toHaveBeenCalledWith("Export bảng Script", ["a", "b"]);
  fireEvent.click(screen.getByRole("button", { name: "AI fix" }));
  expect(ctx.onRunAiReview).toHaveBeenCalledWith(["a", "b"]);
  expect(screen.getAllByRole("textbox", { name: /Script transcript/ })).toHaveLength(2);
});

it("formats and clears each track through one source command", () => {
  const ctx = context();
  ctx.onScriptDocumentsChange = vi.fn();
  render(<ModuleRegistry id="script" context={ctx} />);
  fireEvent.click(screen.getByRole("button", { name: "AUTO NHỊP" }));
  expect(ctx.onScriptDocumentsChange).toHaveBeenCalledWith([
    expect.objectContaining({ assetId: "a", text: "Xin,\nchào" }),
    expect.objectContaining({ assetId: "b", text: "Xin,\nchào" }),
  ]);
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "Clear Text" }));
  expect(ctx.onScriptDocumentsChange).toHaveBeenLastCalledWith([{ assetId: "a", text: "", words: [] }, { assetId: "b", text: "", words: [] }]);
  expect(ctx.onScriptChange).not.toHaveBeenCalled();
});

it("find and replace applies independently to each displayed document", () => {
  const ctx = context();
  ctx.onScriptDocumentsChange = vi.fn();
  render(<ModuleRegistry id="script" context={ctx} />);
  fireEvent.click(screen.getByRole("button", { name: "FIND / REPLACE" }));
  fireEvent.change(screen.getByLabelText("Tìm text"), { target: { value: "Xin" } });
  fireEvent.change(screen.getByLabelText("Thay bằng text"), { target: { value: "Chúc" } });
  fireEvent.click(screen.getByRole("button", { name: "ALL" }));
  expect(ctx.onScriptDocumentsChange).toHaveBeenCalledWith([
    expect.objectContaining({ assetId: "a", text: "Chúc chào" }),
    expect.objectContaining({ assetId: "b", text: "Chúc chào" }),
  ]);
});

it("finding moves to the correct native text selection in each track", async () => {
  render(<ModuleRegistry id="script" context={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "FIND / REPLACE" }));
  fireEvent.change(screen.getByLabelText("Tìm text"), { target: { value: "chào" } });
  fireEvent.click(screen.getByRole("button", { name: "↓" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Script transcript · Track a" })).toHaveFocus());
  expect((document.activeElement as HTMLTextAreaElement).selectionStart).toBe(4);
  expect((document.activeElement as HTMLTextAreaElement).selectionEnd).toBe(8);
  fireEvent.click(screen.getByRole("button", { name: "↓" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Script transcript · Track b" })).toHaveFocus());
});

it("Ctrl Z commits a source text edit before routing to shared Undo", () => {
  const ctx = context();
  ctx.onScriptUndo = vi.fn();
  render(<ModuleRegistry id="script" context={ctx} />);
  fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" });
  editor.focus();
  fireEvent.change(editor, { target: { value: "Chúc chào" } });
  fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
  expect(ctx.onAssetWordsChange).toHaveBeenCalledWith("a", expect.any(Array), "Chúc chào");
  expect(ctx.onScriptUndo).toHaveBeenCalledOnce();
  expect(vi.mocked(ctx.onAssetWordsChange).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(ctx.onScriptUndo!).mock.invocationCallOrder[0]);
});
