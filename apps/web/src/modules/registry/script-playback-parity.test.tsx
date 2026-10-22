import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectMediaAsset } from "../../domain/types";
import { EMPTY_SELECTION } from "../../domain/word-selection";
import { publishPlaybackWord, publishPlaybackWords, requestPlaybackSeek } from "../../domain/playback-sync";
import { ModuleRegistry, type StudioContext } from "./ModuleRegistry";

type InputKind = "file" | "import" | "obs" | "import-track" | "obs-track";
const inputs: InputKind[] = ["file", "import", "obs", "import-track", "obs-track"];
const single = (kind: InputKind) => kind === "file" || kind.endsWith("-track");
function context(kind: InputKind, count = 20): StudioContext {
  const words = Array.from({ length: count }, (_, index) => ({ text: `word${index}`, start: index, end: index + .5 }));
  const tracks = ["a", "b"].map((id) => ({ id, name: `Track ${id}`, ...(kind === "file" ? {} : { sourceArchiveAssetId: "parent" }),
    ...(kind.startsWith("obs") ? { obsRecordingId: "recording" } : {}), words, text: words.map((word) => word.text).join(" "),
    duration: count, transcriptionStatus: "complete", scriptRef: `${id}.json`, wordTimingQuality: "source" })) as unknown as ProjectMediaAsset[];
  return { workflow: "speech-to-text", selectedAssetId: kind === "file" ? "a" : "parent", selectedImportedTrackId: kind.endsWith("-track") ? "a" : null,
    mediaAssets: kind === "file" ? [tracks[0]] : [{ id: "parent", name: "archive.mkv", words: [], text: "" }, ...tracks], take: single(kind) ? { ...tracks[0], id: "stt-a" } : null,
    script: tracks[0].text, trainingCatalog: { speakers: [], environmentProfiles: [] }, readingSession: null, wordSelection: EMPTY_SELECTION,
    obsTimelineActive: kind.startsWith("obs"), onScriptChange: vi.fn(), onWordsChange: vi.fn(), onAssetWordsChange: vi.fn(),
    onAssignScriptWords: vi.fn(), onSelectImportedTrack: vi.fn(), onDeferredAction: vi.fn() } as unknown as StudioContext;
}

function viewport(container: HTMLElement) {
  const view = container.querySelector<HTMLElement>(".script-table-scroll")!;
  Object.defineProperties(view, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 100000 } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = Number(this.dataset.scriptWordIndex ?? -1);
    const spacer = view.querySelector<HTMLElement>(".script-table > [aria-hidden][style]");
    const prefix = spacer && !spacer.nextElementSibling ? 0 : parseFloat(spacer?.style.height ?? "0") || 0;
    const sourceOffset = !prefix && this.dataset.scriptSourceId === "b" ? 700 : 0;
    const top = this === view ? 100 : index < 0 ? 0 : 100 + prefix + sourceOffset + (prefix ? index % 64 * 5 : index * 20) - view.scrollTop;
    return { top, bottom: top + (index < 0 ? 0 : 20), left: 0, right: 620, width: 620, height: this === view ? 200 : index < 0 ? 0 : 20 } as DOMRect;
  });
  return view;
}

afterEach(() => { cleanup(); publishPlaybackWords({}); vi.restoreAllMocks(); });

it("shares the real imported track clock with Script after STT creates a different sidecar item ID", async () => {
  const ctx = context("import-track");
  ctx.mediaAssets = ctx.mediaAssets.map((asset) => ({ ...asset, duration: 20, url: `/audio/${asset.id}.wav` }));
  ctx.onObsTimelineCutsChange = vi.fn();
  ctx.onWordSelectionChange = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ duration: 20, points: [] }) } as Response);
  const { container } = render(<><ModuleRegistry id="script" context={ctx} /><ModuleRegistry id="timeline" context={ctx} /></>);
  const audio = container.querySelector("audio")!;
  fireEvent.click(screen.getByRole("button", { name: "Phát footage" }));
  await act(async () => {});
  audio.currentTime = 3.2;
  fireEvent.timeUpdate(audio);
  expect(container.querySelector('.imported-timeline__word.is-active')).toHaveTextContent("word3");
  expect(container.querySelector('.script-table__word.is-active')).toHaveTextContent("word3");
  act(() => requestPlaybackSeek("a", 7.2));
  expect(audio.currentTime).toBe(7.2);
  expect(container.querySelector('.script-table__word.is-active')).toHaveTextContent("word7");
});

it("clears single-source highlighting when the playback owner is released", () => {
  const { container } = render(<ModuleRegistry id="script" context={context("file")} />);
  viewport(container);
  act(() => publishPlaybackWord("stt-a", 18));
  expect(container.querySelector('.script-table__word.is-active')).not.toBeNull();
  act(() => publishPlaybackWords({}));
  expect(container.querySelector('.script-table__word.is-active')).toBeNull();
});

it.each(inputs)("follows a Timeline word while paused for %s input, pauses for manual reading, resumes on seek", (kind) => {
  const { container } = render(<ModuleRegistry id="script" context={context(kind)} />);
  const view = viewport(container);
  const publish = (index: number) => act(() => kind === "file" ? publishPlaybackWord("stt-a", index) : publishPlaybackWords({ a: index, b: -1 }));
  publish(18);
  expect(view.scrollTop).toBeGreaterThan(0);
  expect(container.querySelector('.script-table__word.is-active')).toHaveTextContent("word18");
  fireEvent.wheel(view);
  view.scrollTop = 0;
  publish(19);
  expect(view.scrollTop).toBe(0);
  act(() => requestPlaybackSeek(kind === "file" ? "stt-a" : "a", 19));
  // Explicit seeking resumes even when the playhead remains in the same word.
  expect(view.scrollTop).toBeGreaterThan(0);
});

it.each(["import", "obs"] as const)("follows plain text in %s and keeps native editing independent of playback", (kind) => {
  const { container } = render(<ModuleRegistry id="script" context={context(kind)} />);
  const view = viewport(container);
  fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
  act(() => publishPlaybackWords({ a: -1, b: 18 }));
  expect(view.scrollTop).toBeGreaterThan(0);
  expect(container.querySelector('.script-source-playback-layer .is-active')).toHaveTextContent("word18");
  const field = screen.getByRole("textbox", { name: "Script transcript · Track b" }) as HTMLTextAreaElement;
  fireEvent.focus(field);
  field.setSelectionRange(2, 7);
  act(() => publishPlaybackWords({ a: -1, b: 19 }));
  expect(field.selectionStart).toBe(2);
  expect(field.selectionEnd).toBe(7);
  expect(container.querySelector('.script-source-playback-layer .is-active')).toBeNull();
});

it.each(["import", "obs"] as const)("keeps simultaneous sources stable and honors explicit source selection for %s", (kind) => {
  const { container } = render(<ModuleRegistry id="script" context={context(kind)} />);
  const view = viewport(container);
  act(() => publishPlaybackWords({ a: 18, b: 18 }));
  const first = view.scrollTop;
  act(() => publishPlaybackWords({ b: 18, a: 18 }));
  expect(view.scrollTop).toBe(first);
  act(() => requestPlaybackSeek("b", 18));
  expect(view.scrollTop).toBeGreaterThan(first);
  fireEvent.pointerDown(screen.getByRole("scrollbar"));
  view.scrollTop = 0;
  act(() => publishPlaybackWords({ a: 19, b: 19 }));
  expect(view.scrollTop).toBe(0);
  act(() => requestPlaybackSeek("unrelated-source", 19));
  expect(view.scrollTop).toBe(0);
});

it.each(inputs)("reveals a distant virtualized word for %s input", (kind) => {
  const { container } = render(<ModuleRegistry id="script" context={context(kind, 1400)} />);
  const view = viewport(container);
  expect(container.querySelector('[data-script-word-index="1300"]')).toBeNull();
  act(() => kind === "file" ? publishPlaybackWord("stt-a", 1300) : publishPlaybackWords(single(kind) ? { a: 1300, b: -1 } : { a: -1, b: 1300 }));
  expect(view.scrollTop).toBeGreaterThan(0);
  expect(container.querySelector('.script-table__word.is-active')).toHaveTextContent("word1300");
  if (!single(kind)) expect(container.querySelector('.script-table__word.is-active')?.closest('[data-channel-id]')).toHaveAttribute("data-channel-id", "b");
});
