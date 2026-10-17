import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { ProjectMediaAsset } from "../../domain/types";
import { ImportedMultitrackTimeline } from "./ImportedMultitrackTimeline";
import { ChannelScript } from "../script/ChannelScript";

const parent: ProjectMediaAsset = {
  id: "parent", name: "interview.mkv", sourceExtension: ".mkv", mediaKind: "video", sourcePath: "assets/interview.mkv",
  studioItemId: null, url: null, duration: 60, sampleRate: 24000, text: "", words: [], origin: "import",
  transcriptionStatus: "not-applicable", transcriptionSelected: false, transcriptionError: null, aiReviewStatus: "skipped",
  trainingSelected: false, captureTier: "import", speakerProfileIds: [], environmentProfileIds: [], emotion: "normal",
  createdAt: "2026-09-29T00:00:00Z", updatedAt: "2026-09-29T00:00:00Z", revisions: [],
};
const tracks = [
  { ...parent, id: "a", sourceArchiveAssetId: "parent", sourceArchiveStreamIndex: 1, name: "Desk", url: "/api/projects/p/media/a/audio", text: "Desk transcript", removedRanges: [] },
  { ...parent, id: "b", sourceArchiveAssetId: "parent", sourceArchiveStreamIndex: 2, name: "Mic", url: "/api/projects/p/media/b/audio", text: "Mic transcript", removedRanges: [] },
];

it("limits selected imported playback to one track and retains its previous gain", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const props = { parent, tracks, selectedTrackId: null, onSelectTrack: vi.fn(), onCutsChange: vi.fn() };
  const view = render(<ImportedMultitrackTimeline {...props} />);
  fireEvent.change(screen.getByRole("slider", { name: "Gain Channel 2" }), { target: { value: "38" } });
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 1" }));
  view.rerender(<ImportedMultitrackTimeline {...props} selectedTrackId="b" singleTrackView />);
  expect(view.container.querySelectorAll("audio")).toHaveLength(1);
  expect(view.container.querySelector("audio")?.getAttribute("src")).toBe(tracks[1].url);
  expect(view.container.querySelector("audio")?.volume).toBe(.38);
  view.rerender(<ImportedMultitrackTimeline {...props} />);
  expect(screen.getByRole("button", { name: "Bật tiếng Channel 1" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("slider", { name: "Gain Channel 2" })).toHaveValue("38");
});

it("supports multiple Solo tracks while preserving imported mute and gain", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const view = render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId={null} onSelectTrack={vi.fn()} onCutsChange={vi.fn()} />);
  fireEvent.change(screen.getByRole("slider", { name: "Gain Channel 1" }), { target: { value: "54" } });
  fireEvent.click(screen.getByRole("button", { name: "Solo Channel 1" }));
  expect([...view.container.querySelectorAll("audio")].map((audio) => audio.volume)).toEqual([.54, 0]);
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Solo Channel 2" }));
  expect([...view.container.querySelectorAll("audio")].map((audio) => audio.volume)).toEqual([0, 1]);
  expect(screen.getByRole("slider", { name: "Gain Channel 1" })).toHaveValue("54");
});

it("discards pending playback of withdrawn imported tracks before audio activation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  play.mockClear();
  let activate = () => {};
  const activated = new Promise<void>((resolve) => { activate = resolve; });
  vi.stubGlobal("AudioContext", class {
    destination = {};
    createMediaElementSource = () => ({ connect: vi.fn() });
    createGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
    resume = () => activated;
    close = async () => {};
  });
  const props = { parent, tracks, selectedTrackId: null, onSelectTrack: vi.fn(), onCutsChange: vi.fn() };
  const view = render(<ImportedMultitrackTimeline {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Phát footage" }));
  view.rerender(<ImportedMultitrackTimeline {...props} selectedTrackId="b" singleTrackView />);
  await act(async () => { activate(); await activated; });
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  expect((play.mock.instances[0] as HTMLAudioElement).getAttribute("src")).toBe(tracks[1].url);
  expect(view.container.querySelectorAll("audio")).toHaveLength(1);
});

it("resumes Script following by dragging an imported multitrack waveform", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const sources = tracks.map((track) => ({ ...track, words: [{ text: "hello", start: 30, end: 40 }], text: "hello" }));
  const { container } = render(<><ChannelScript tracks={sources} onSelectTrack={vi.fn()} />
    <ImportedMultitrackTimeline parent={parent} tracks={sources} selectedTrackId={null} onSelectTrack={vi.fn()} onCutsChange={vi.fn()} /></>);
  const view = container.querySelector<HTMLElement>(".script-table-scroll")!;
  Object.defineProperties(view, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 2000 } });
  vi.spyOn(view, "getBoundingClientRect").mockReturnValue({ top: 100, height: 200 } as DOMRect);
  container.querySelectorAll<HTMLElement>(".script-table__word").forEach((word) => {
    vi.spyOn(word, "getBoundingClientRect").mockImplementation(() => ({ top: 500 - view.scrollTop, height: 20 } as DOMRect));
  });
  const waveform = screen.getByLabelText("Waveform Channel 1");
  vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.wheel(view);
  fireEvent.pointerDown(waveform, { button: 0, clientX: 55, pointerId: 1 });
  fireEvent.pointerUp(waveform, { button: 0, clientX: 55, pointerId: 1 });
  expect(container.querySelector('.script-table__word.is-active')).toHaveTextContent("hello");
  expect(view.scrollTop).toBeGreaterThan(0);
  fireEvent.wheel(view);
  view.scrollTop = 0;
  fireEvent.pointerDown(waveform, { button: 0, clientX: 56, pointerId: 2 });
  fireEvent.pointerUp(waveform, { button: 0, clientX: 56, pointerId: 2 });
  expect(view.scrollTop).toBeGreaterThan(0);
});

it("positions timed subtitle words on the same axis as each waveform", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  render(<ImportedMultitrackTimeline parent={parent} tracks={[{ ...tracks[0], text: "hello world", words: [
    { text: "hello", start: 15, end: 18 }, { text: "world", start: 30, end: 33 },
  ]}]} selectedTrackId={null} onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  const word = screen.getByRole("button", { name: "hello · 00:15–00:18" });
  expect(Number.parseFloat(word.style.left)).toBeCloseTo(25);
  expect(Number.parseFloat(word.style.width)).toBeCloseTo(5);
  fireEvent.click(word);
  expect(word).toHaveClass("is-active");
});

it("hides labels on dense subtitle intervals and restores them when zoom makes room", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 7200, points: [] }) }));
  const shortWord = { text: "short", start: 0.1, end: 0.2 };
  render(<ImportedMultitrackTimeline parent={{ ...parent, duration: 7200 }} tracks={[{
    ...tracks[0], duration: 7200, text: "short", words: [shortWord],
  }]} selectedTrackId={null} onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  const word = screen.getByRole("button", { name: "short · 00:00–00:00" });
  expect(word).toHaveClass("is-compact");
  expect(word.style.left).toBe("0.001388888888888889%");

  fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "1000" } });
  expect(word).not.toHaveClass("is-compact");
  fireEvent.click(word);
  expect(word).toHaveClass("is-active");
});

it("shows bounded individual word stripes for long imported subtitles", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 900, points: [] }) }));
  const words = Array.from({ length: 6_000 }, (_, index) => {
    const start = index * 0.15;
    return { text: `word${index}`, start, end: start + 0.12 };
  });
  const { container } = render(<ImportedMultitrackTimeline parent={{ ...parent, duration: 900 }} tracks={[{
    ...tracks[0], duration: 900, text: "long transcript", words,
  }]} selectedTrackId={null} onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  const lane = container.querySelector('[aria-label="Subtitle Channel 1"]')!;
  const visibleWords = [...lane.querySelectorAll<HTMLButtonElement>(":scope > .imported-timeline__word")];
  expect(visibleWords.length).toBeGreaterThan(0);
  expect(visibleWords.length).toBeLessThanOrEqual(250);
  expect(visibleWords.every((word) => /^word\d+ · /.test(word.getAttribute("aria-label") ?? ""))).toBe(true);
  expect(visibleWords.every((word) => word.classList.contains("is-compact"))).toBe(true);
  expect(lane.querySelector(":scope > .subtitle-readable-slot")).toBeNull();
});

it("opens the shared timeline editor for an archived multitrack word and writes only to its asset", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const words = [{ text: "hello", start: 15, end: 18 }, { text: "world", start: 30, end: 33 }];
  const onAssetWordsChange = vi.fn();
  const onAssetTimelineStateChange = vi.fn().mockResolvedValue(undefined);
  render(<ImportedMultitrackTimeline parent={parent}
    tracks={[{ ...tracks[0], text: "hello world", words }]}
    selectedTrackId="a" singleTrackView onSelectTrack={() => undefined} onCutsChange={async () => true}
    onAssetWordsChange={onAssetWordsChange} onAssetTimelineStateChange={onAssetTimelineStateChange} />);
  fireEvent.doubleClick(screen.getByRole("button", { name: "hello · 00:15–00:18" }));
  expect(screen.getByRole("button", { name: "← TẤT CẢ CHANNEL" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Nhập gain dB" })).toHaveValue(0);
  const editor = await screen.findByRole("textbox", { name: "Sửa subtitle" });
  fireEvent.change(editor, { target: { value: "Hi" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  await waitFor(() => expect(onAssetWordsChange).toHaveBeenCalledTimes(1));
  const [editedAssetId, editedWords, editedText] = onAssetWordsChange.mock.calls.at(-1)!;
  expect(editedAssetId).toBe("a");
  expect(editedWords[0]).toEqual(expect.objectContaining({ text: "Hi", timingSource: "user-interpolated", timingTrusted: false }));
  expect(editedWords[0].start).toBeGreaterThanOrEqual(words[0].start);
  expect(editedWords[0].end).toBeGreaterThan(editedWords[0].start);
  expect(editedWords[0].end).toBeLessThan(words[1].start);
  expect(editedWords[1]).toEqual(words[1]);
  expect(editedText).toBe("Hi world");
  const gain = screen.getByRole("slider", { name: "Source gain" });
  fireEvent.pointerDown(gain);
  fireEvent.change(gain, { target: { value: "6" } });
  fireEvent.pointerUp(gain);
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ CHANNEL" }));
  expect(Number((screen.getByRole("slider", { name: "Gain Channel 1" }) as HTMLInputElement).value)).toBeCloseTo(199.526, 2);
  fireEvent.change(screen.getByRole("slider", { name: "Gain Channel 1" }), { target: { value: "0" } });
  fireEvent.doubleClick(screen.getByRole("button", { name: "hello · 00:15–00:18" }));
  expect(screen.getByRole("spinbutton", { name: "Nhập gain dB" })).toHaveValue(-96);
});

it("routes undo and redo in both the Imported Timeline root and focused editor", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const onUndo = vi.fn(), onRedo = vi.fn();
  const onAssetWordsChange = vi.fn();
  const onAssetTimelineStateChange = vi.fn().mockResolvedValue(undefined);
  const words = [{ text: "hello", start: 15, end: 18 }];
  const rootView = render(<ImportedMultitrackTimeline parent={parent}
    tracks={[{ ...tracks[0], text: "hello", words }]} selectedTrackId="a" singleTrackView
    onSelectTrack={() => undefined} onCutsChange={async () => true} onUndo={onUndo} onRedo={onRedo}
    onAssetWordsChange={onAssetWordsChange} onAssetTimelineStateChange={onAssetTimelineStateChange} />);

  fireEvent.pointerEnter(document.querySelector(".timeline-module")!);
  fireEvent.keyDown(document, { key: "z", ctrlKey: true });
  fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: true });
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onRedo).toHaveBeenCalledTimes(1);

  fireEvent.doubleClick(screen.getByRole("button", { name: "hello · 00:15–00:18" }));
  expect(await screen.findByRole("textbox", { name: "Sửa subtitle" })).toBeInTheDocument();
  const focusedTimeline = document.querySelector(".timeline-module")!;
  fireEvent.pointerEnter(focusedTimeline);
  fireEvent.keyDown(focusedTimeline, { key: "z", ctrlKey: true });
  fireEvent.keyDown(focusedTimeline, { key: "z", ctrlKey: true, shiftKey: true });
  expect(onUndo).toHaveBeenCalledTimes(2);
  expect(onRedo).toHaveBeenCalledTimes(2);
  fireEvent.click(await screen.findByRole("button", { name: "← TẤT CẢ CHANNEL" }));
  const restoredRoot = document.querySelector(".timeline-module")!;
  fireEvent.pointerEnter(restoredRoot);
  fireEvent.keyDown(restoredRoot, { key: "z", ctrlKey: true });
  fireEvent.keyDown(restoredRoot, { key: "z", ctrlKey: true, shiftKey: true });
  expect(onUndo).toHaveBeenCalledTimes(3);
  expect(onRedo).toHaveBeenCalledTimes(3);
});

it("opens insertion and timestamp-promotion requests from subtitle gestures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const words = [{ text: "hello", start: 15, end: 18 }];
  const onAssetWordsChange = vi.fn();
  const onAssetTimelineStateChange = vi.fn().mockResolvedValue(undefined);
  const view = render(<ImportedMultitrackTimeline parent={parent}
    tracks={[{ ...tracks[0], text: "hello", words }]} selectedTrackId="a" singleTrackView
    onSelectTrack={() => undefined} onCutsChange={async () => true}
    onAssetWordsChange={onAssetWordsChange} onAssetTimelineStateChange={onAssetTimelineStateChange} />);
  const word = screen.getByRole("button", { name: "hello · 00:15–00:18" });
  fireEvent.click(word, { ctrlKey: true, clientX: 1 });
  expect(await screen.findByRole("textbox", { name: "Sửa subtitle" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ CHANNEL" }));
  const listener = vi.fn();
  window.addEventListener("pro4bro:timestamp-promotion", listener);
  fireEvent.pointerDown(screen.getByRole("button", { name: "hello · 00:15–00:18" }), { button: 1 });
  await waitFor(() => expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: { assetId: "a", index: 0 } })));
  window.removeEventListener("pro4bro:timestamp-promotion", listener);
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ CHANNEL" }));
  const replay = vi.fn();
  window.addEventListener("pro4bro:timestamp-promotion", replay);
  act(() => window.dispatchEvent(new CustomEvent("pro4bro:timestamp-promotion", { detail: { assetId: "a", index: 0 } })));
  expect(replay.mock.calls.filter(([event]) => event.detail.index !== null)).toHaveLength(2);
  window.removeEventListener("pro4bro:timestamp-promotion", replay);
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ CHANNEL" }));
  fireEvent.contextMenu(screen.getByRole("button", { name: "hello · 00:15–00:18" }));
  expect(await screen.findByRole("menuitem", { name: "Sửa text" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ CHANNEL" }));
  const subtitle = screen.getByLabelText("Subtitle Channel 1");
  vi.spyOn(subtitle, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  fireEvent.click(subtitle, { ctrlKey: true, clientX: 50 });
  expect(await screen.findByRole("textbox", { name: "Sửa subtitle" })).toBeInTheDocument();
});

it.each(["menu", "doubleclick"])("adds multiple words to the clicked imported channel via %s", async (gesture) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const onAssetWordsChange = vi.fn();
  render(<ImportedMultitrackTimeline parent={parent} tracks={tracks.map((track) => ({ ...track, text: "hello", words: [{ text: "hello", start: 15, end: 18 }] }))}
    selectedTrackId={null} onSelectTrack={() => undefined} onCutsChange={async () => true}
    onAssetWordsChange={onAssetWordsChange} onAssetTimelineStateChange={vi.fn().mockResolvedValue(undefined)} />);
  const lane = screen.getByLabelText("Subtitle Channel 2");
  vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  if (gesture === "menu") {
    fireEvent.contextMenu(lane, { clientX: 10 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add text" }));
  } else fireEvent.doubleClick(lane, { clientX: 10 });
  const editor = await screen.findByRole("textbox", { name: "Sửa subtitle" });
  expect(editor).toHaveValue("");
  fireEvent.change(editor, { target: { value: "new phrase" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  expect(onAssetWordsChange).toHaveBeenCalledTimes(1);
  expect(onAssetWordsChange.mock.calls[0][0]).toBe("b");
  expect(onAssetWordsChange.mock.calls[0][1].map((word: { text: string }) => word.text)).toEqual(["new", "phrase", "hello"]);
  expect(onAssetWordsChange.mock.calls[0][1][0].start).toBe(6);
  expect(onAssetWordsChange.mock.calls[0][2]).toBe("new phrase hello");
});

it("keeps each Script word and both subtitle lanes synchronized without opening a child", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const timed = tracks.map((track) => ({ ...track, text: "hello world", words: [
    { text: "hello", start: 15, end: 18 }, { text: "world", start: 30, end: 33 },
  ] }));
  const select = vi.fn();
  render(<><ChannelScript tracks={timed} onSelectTrack={select} /><ImportedMultitrackTimeline parent={parent}
    tracks={timed} selectedTrackId={null} onSelectTrack={select} onCutsChange={async () => true} /></>);
  const script = within(screen.getByLabelText("Script theo channel"));
  fireEvent.click(script.getAllByRole("button", { name: "world · 00:30.000–00:33.000" })[0]);
  expect(select).not.toHaveBeenCalled();
  expect(script.getAllByRole("button", { name: "world · 00:30.000–00:33.000" }).every((word) => word.classList.contains("is-active"))).toBe(true);
  expect(within(screen.getByLabelText("Subtitle Channel 2")).getByRole("button", { name: "world · 00:30–00:33" })).toHaveClass("is-active");
});

it("shows timed selection only on its source track with waveform timing readout", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const selection = { indexes: [0], anchor: 0, ranges: [{ id: "picked", start: 15, end: 18 }],
    scope: { kind: "asset" as const, id: "a", revision: tracks[0].updatedAt } };
  render(<ImportedMultitrackTimeline parent={parent} tracks={tracks.map((track) => ({ ...track, text: "hello", words: [{ text: "hello", start: 15, end: 18 }] }))}
    selectedTrackId="a" wordSelection={selection} onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  const firstWave = screen.getByLabelText("Waveform Channel 1");
  expect(firstWave).toContainElement(screen.getByLabelText("IN 15.000 seconds"));
  expect(firstWave).toContainElement(screen.getByLabelText("OUT 18.000 seconds"));
  expect(firstWave).toContainElement(screen.getByLabelText("Duration 3.000 seconds"));
  expect(screen.getAllByRole("button", { name: "hello · 00:15–00:18" })[0]).toHaveClass("is-selected");
  expect(screen.getByLabelText("Waveform Channel 2").querySelector(".selection-readout")).toBeNull();
});

it("publishes scoped word selection from an imported subtitle and Ctrl-drag range from its focused waveform", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const onWordSelectionChange = vi.fn();
  const source = { ...tracks[0], text: "hello world", words: [{ text: "hello", start: 15, end: 18 }, { text: "world", start: 30, end: 33 }] };
  render(<ImportedMultitrackTimeline parent={parent} tracks={[source]} selectedTrackId="a" singleTrackView
    onWordSelectionChange={onWordSelectionChange} onSelectTrack={() => undefined} onCutsChange={async () => true}
    onAssetWordsChange={vi.fn()} onAssetTimelineStateChange={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole("button", { name: "hello · 00:15–00:18" }));
  expect(onWordSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ indexes: [0], anchor: 0,
    ranges: [{ id: "time-15-18", start: 15, end: 18 }], scope: { kind: "asset", id: "a", revision: source.updatedAt } }));

  fireEvent.doubleClick(screen.getByRole("button", { name: "hello · 00:15–00:18" }));
  const waveform = await screen.findByLabelText("Waveform timeline");
  const canvas = document.querySelector<HTMLElement>(".timeline-canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, width: 600 } as DOMRect);
  fireEvent.pointerDown(waveform, { button: 0, ctrlKey: true, pointerId: 9, clientX: 100 });
  fireEvent.pointerMove(waveform, { button: 0, ctrlKey: true, pointerId: 9, clientX: 200 });
  fireEvent.pointerUp(waveform, { button: 0, ctrlKey: true, pointerId: 9, clientX: 200 });
  expect(onWordSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({
    ranges: [{ id: "time-10-20", start: 10, end: 20 }], scope: { kind: "asset", id: "a", revision: source.updatedAt },
  }));
});

it("marquees a Ctrl-drag range on the imported waveform without converting it to a scrub", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const onWordSelectionChange = vi.fn();
  const source = { ...tracks[0], text: "hello", words: [{ text: "hello", start: 15, end: 18 }] };
  render(<ImportedMultitrackTimeline parent={parent} tracks={[source]} selectedTrackId="a"
    onWordSelectionChange={onWordSelectionChange} onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  const waveform = screen.getByLabelText("Waveform Channel 1");
  vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 600 } as DOMRect);
  fireEvent.pointerDown(waveform, { button: 0, ctrlKey: true, pointerId: 12, clientX: 100 });
  fireEvent.pointerMove(waveform, { button: 0, ctrlKey: true, pointerId: 12, clientX: 200 });
  fireEvent.pointerUp(waveform, { button: 0, ctrlKey: true, pointerId: 12, clientX: 200 });
  expect(onWordSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({
    ranges: [{ id: "time-10-20", start: 10, end: 20 }], scope: { kind: "asset", id: "a", revision: source.updatedAt },
  }));
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("opens a long multitrack footage at its full duration", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 7200, points: [] }) }));
  render(<ImportedMultitrackTimeline parent={{ ...parent, duration: 7200 }}
    tracks={tracks.map((track) => ({ ...track, duration: 7200 }))} selectedTrackId={null}
    onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  expect(screen.getByRole("slider", { name: "Zoom timeline" })).toHaveValue("0");
  expect(screen.getByTitle("Cửa sổ 7200s")).toBeInTheDocument();
});

it("does not preload six long PCM files just to show their waveforms", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 9276.633, points: [] }) }));
  const longTracks = Array.from({ length: 6 }, (_, index) => ({ ...tracks[0], id: `track-${index}`,
    sourceArchiveStreamIndex: index + 1, duration: 9276.633 }));
  const { container } = render(<ImportedMultitrackTimeline parent={{ ...parent, duration: 9276.633 }}
    tracks={longTracks} selectedTrackId={null} onSelectTrack={() => undefined}
    onCutsChange={async () => true} />);
  expect(screen.getAllByLabelText(/Waveform Channel/)).toHaveLength(6);
  expect([...container.querySelectorAll("audio")].every((audio) => audio.preload === "none")).toBe(true);
  expect(screen.getByRole("slider", { name: "Zoom timeline" })).toHaveValue("0");
});

it("keeps Channel and Track on one line in both layouts and scrolls only when clipped", () => {
  const resize: Array<() => void> = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize.push(() => callback([], this as unknown as ResizeObserver)); }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a"
    onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  const label = screen.getByRole("button", { name: "Channel 1 - Desk" });
  const viewport = label.querySelector(".timeline-lane-label")!;
  const text = viewport.querySelector("b")!;
  expect(label.querySelector("small")).toBeNull();
  expect(viewport).toHaveAttribute("data-scrolling", "false");
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 60 });
  Object.defineProperty(text, "scrollWidth", { configurable: true, value: 180 });
  act(() => resize.forEach((measure) => measure()));
  expect(viewport).toHaveAttribute("data-scrolling", "true");
  expect(viewport.querySelectorAll("b")).toHaveLength(2);
  expect(viewport.querySelectorAll("b")[1]).toHaveAttribute("aria-hidden", "true");
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.getByRole("button", { name: "Channel 1 - Desk" }).querySelector(".timeline-lane-label"))
    .toHaveAttribute("data-scrolling", "true");
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 240 });
  act(() => resize.forEach((measure) => measure()));
  expect(viewport).toHaveAttribute("data-scrolling", "false");
  expect(viewport.querySelectorAll("b")).toHaveLength(1);
});

it("persists the working range and playhead cuts across tracks, then selects sections for delete and uncut", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [{ min: -.5, max: .5 }] }) });
  vi.stubGlobal("fetch", fetcher);
  const onAssetTimelineStateChange = vi.fn().mockResolvedValue(undefined);
  const onSelectTrack = vi.fn();
  const view = render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a"
    onSelectTrack={onSelectTrack} onCutsChange={async () => true} onAssetTimelineStateChange={onAssetTimelineStateChange} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.getAllByLabelText(/Waveform Channel/)).toHaveLength(2);
  expect(screen.getByLabelText("Playhead chung")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Channel 2 - Mic" }));
  expect(onSelectTrack).toHaveBeenCalledWith("b");
  let progress = screen.getByLabelText("Thanh tiến trình Timeline — bấm hoặc kéo để tua");
  vi.spyOn(progress, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.pointerDown(progress, { clientX: 50, pointerId: 1 });
  fireEvent.pointerUp(progress, { clientX: 50, pointerId: 1 });
  fireEvent.click(screen.getByRole("button", { name: "MARK IN" }));
  fireEvent.pointerDown(progress, { clientX: 60, pointerId: 2 });
  fireEvent.pointerUp(progress, { clientX: 60, pointerId: 2 });
  fireEvent.click(screen.getByRole("button", { name: "MARK OUT" }));
  await waitFor(() => expect(onAssetTimelineStateChange).toHaveBeenLastCalledWith("b", expect.objectContaining({
    workingRange: { id: "working", start: 30, end: 36 }, removedRanges: [], cutPoints: [],
  })));
  view.rerender(<ImportedMultitrackTimeline parent={parent} tracks={tracks.map((track) => ({ ...track,
    workingRange: { id: "working", start: 30, end: 36 },
  }))} selectedTrackId="a" onSelectTrack={onSelectTrack} onCutsChange={async () => true}
    onAssetTimelineStateChange={onAssetTimelineStateChange} />);
  progress = screen.getByLabelText("Thanh tiến trình Timeline — bấm hoặc kéo để tua");
  vi.spyOn(progress, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.pointerDown(progress, { clientX: 75, pointerId: 3 });
  fireEvent.pointerUp(progress, { clientX: 75, pointerId: 3 });
  fireEvent.click(screen.getByRole("button", { name: "CUT" }));
  await waitFor(() => expect(onAssetTimelineStateChange).toHaveBeenLastCalledWith("b", expect.objectContaining({
    workingRange: { id: "working", start: 30, end: 36 }, removedRanges: [], cutPoints: [45],
  })));
  view.rerender(<ImportedMultitrackTimeline parent={parent} tracks={tracks.map((track) => ({ ...track,
    workingRange: { id: "working", start: 30, end: 36 }, cutPoints: [45],
  }))} selectedTrackId="a" onSelectTrack={onSelectTrack} onCutsChange={async () => true}
    onAssetTimelineStateChange={onAssetTimelineStateChange} />);
  const section = screen.getByRole("button", { name: "Đoạn 00:00–00:45" });
  fireEvent.click(section);
  expect(screen.getByRole("button", { name: "DELETE" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
  await waitFor(() => expect(onAssetTimelineStateChange).toHaveBeenLastCalledWith("b", expect.objectContaining({
    removedRanges: [expect.objectContaining({ start: 0, end: 45 })],
  })));
  view.rerender(<ImportedMultitrackTimeline parent={parent} tracks={tracks.map((track) => ({ ...track,
    workingRange: { id: "working", start: 30, end: 36 }, cutPoints: [45],
    removedRanges: track.id === "a" ? [{ id: "removed", start: 0, end: 45 }] : [],
  }))} selectedTrackId="a" onSelectTrack={onSelectTrack} onCutsChange={async () => true}
    onAssetTimelineStateChange={onAssetTimelineStateChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Đoạn 00:00–00:45 đã loại" }));
  fireEvent.click(screen.getByRole("button", { name: "UNCUT" }));
  await waitFor(() => expect(onAssetTimelineStateChange).toHaveBeenLastCalledWith("b", expect.objectContaining({ removedRanges: [] })));
  view.rerender(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a" singleTrackView
    onSelectTrack={onSelectTrack} onCutsChange={async () => true} onAssetTimelineStateChange={onAssetTimelineStateChange} />);
  expect(screen.getAllByLabelText(/Waveform Channel/)).toHaveLength(1);
  expect(screen.getByLabelText("Waveform Channel 1")).toBeInTheDocument();
});

it("uses one zoom control and shows each channel's gain and level in both layouts", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [{ min: 0, max: 0 }] }) }));
  render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a"
    onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  expect(screen.getAllByRole("slider", { name: "Zoom timeline" })).toHaveLength(1);
  expect(screen.getByRole("meter", { name: "Level Channel 1" })).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Gain Channel 2" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.queryByLabelText("Playhead chung")).toBeNull();
  expect(screen.getByLabelText("Playhead Channel 1")).toBeInTheDocument();
  expect(screen.getByRole("separator", { name: "Đổi độ rộng Channel 1" })).toBeInTheDocument();
});

it("keeps the waveform mounted while dragging and mutes one track independently", () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  play.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const onSelectTrack = vi.fn();
  const { container } = render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a" singleTrackView
    onSelectTrack={onSelectTrack} onCutsChange={async () => true} />);
  const wave = screen.getByLabelText("Waveform Channel 1");
  vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.pointerDown(wave, { pointerId: 1, clientX: 20 });
  fireEvent.pointerMove(wave, { pointerId: 1, clientX: 60 });
  expect(play).toHaveBeenCalledTimes(1);
  expect(container.querySelectorAll("audio")).toHaveLength(1);
  expect(container.querySelector("audio")?.getAttribute("src")).toBe(tracks[0].url);
  fireEvent.pointerUp(wave, { pointerId: 1, clientX: 60 });
  expect(onSelectTrack).not.toHaveBeenCalled();
  expect(wave).toBeInTheDocument();
  expect(screen.getByText("00:36")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 1" }));
  expect((container.querySelector("audio") as HTMLAudioElement).volume).toBe(0);
  expect(screen.getByRole("slider", { name: "Gain Channel 1" })).toHaveValue("100");
});

it("updates each imported waveform envelope with the gain preview and mute state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    duration: 60, points: [{ min: -.25, max: .25 }],
  }) }));
  const view = render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a"
    onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  await waitFor(() => expect(view.container.querySelectorAll(".obs-timeline__wave path[d^=\"M\"]")).toHaveLength(2));
  const waves = [...view.container.querySelectorAll(".obs-timeline__wave path")];
  const original = waves.map((path) => path.getAttribute("d"));
  const gain = screen.getByRole("slider", { name: "Gain Channel 1" });
  fireEvent.pointerDown(gain);
  fireEvent.change(gain, { target: { value: "200" } });
  expect(waves[0].getAttribute("d")).not.toBe(original[0]);
  expect(waves[1].getAttribute("d")).toBe(original[1]);
  const gained = waves[0].getAttribute("d");
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 1" }));
  expect(waves[0].getAttribute("d")).not.toBe(gained);
});

it("fits the full long footage at minimum zoom and reaches 0.01 seconds per 10 pixels", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 4000, points: [{ min: 0, max: 0 }] }) }));
  render(<ImportedMultitrackTimeline parent={{ ...parent, duration: 4000 }} tracks={tracks.map((track) => ({ ...track, duration: 4000 }))}
    selectedTrackId="a" onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "0" } });
  expect(screen.getByTitle("Cửa sổ 4000s")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "1000" } });
  expect(screen.getByRole("slider", { name: "Zoom timeline" })).toHaveAttribute("aria-valuetext", "0.01s / 10px");
  expect(screen.getByLabelText("Ruler chung")).toHaveTextContent("0.1s");
});

it("requests source PCM detail for the visible window instead of stretching sparse overview peaks", async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes("?")
    ? { duration: 4000, start: 0, end: Number(new URL(url, "http://localhost").searchParams.get("end")), points: Array.from({ length: 300 }, () => ({ min: -.5, max: .5 })) }
    : { duration: 4000, points: Array.from({ length: 100 }, () => ({ min: -.5, max: .5 })) } }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ImportedMultitrackTimeline parent={{ ...parent, duration: 4000 }} tracks={tracks.map((track) => ({ ...track, duration: 4000 }))}
    selectedTrackId="a" onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  for (let index = 0; index < 8; index += 1) fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes("start=0") && String(url).includes("end=") && String(url).includes("points="))).toBe(true));
  await waitFor(() => expect((view.container.querySelector(".obs-timeline__wave path")?.getAttribute("d")?.match(/L/g) ?? []).length).toBeGreaterThan(100));
  expect(view.container.querySelector(".obs-timeline__wave svg")).toHaveClass("timeline-waveform__svg");
  expect(view.container.querySelector(".obs-timeline__wave path")?.getAttribute("d")).toMatch(/Z$/u);
});

it("plays both channel audio elements together and resets every saved cut", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [{ min: 0, max: 0 }] }) }));
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  play.mockClear();
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const onCutsChange = vi.fn().mockResolvedValue(true);
  const cut = { id: "cut-one", start: 10, end: 20 };
  const withCuts = tracks.map((track) => ({ ...track, removedRanges: [cut] }));
  render(<ImportedMultitrackTimeline parent={parent} tracks={withCuts} selectedTrackId="a"
    onSelectTrack={() => undefined} onCutsChange={onCutsChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Phát footage" }));
  await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  expect(play.mock.instances.map((audio) => (audio as HTMLAudioElement).getAttribute("src"))).toEqual(tracks.map((track) => track.url));
  fireEvent.click(screen.getByRole("button", { name: "RESET" }));
  await waitFor(() => expect(onCutsChange).toHaveBeenCalledWith(["a", "b"], []));
  play.mockRestore(); pause.mockRestore();
});


it("keeps the playhead and viewport on separated imported selections and clamps readouts inside the lane", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const sources = [{ ...tracks[0], words: [{ text: "first", start: 2, end: 3 }, { text: "last", start: 59, end: 60 }] }];
  const props = { parent, tracks: sources, singleTrackView: true, selectedTrackId: "a", onSelectTrack: vi.fn(), onCutsChange: vi.fn() };
  const view = render(<ImportedMultitrackTimeline {...props} wordSelection={{ indexes: [], anchor: null }} />);
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 10;
  fireEvent.timeUpdate(audio);
  view.rerender(<ImportedMultitrackTimeline {...props} wordSelection={{ indexes: [0, 1], anchor: 1,
    ranges: [{ id: "first", start: 2, end: 3 }, { id: "last", start: 59, end: 60 }] }} />);
  expect(audio.currentTime).toBe(10);
  expect(view.container.querySelectorAll(".imported-selection-range")).toHaveLength(2);
  const readout = screen.getByLabelText("OUT 60.000 seconds");
  expect(Number.parseFloat(readout.style.getPropertyValue("--readout-x"))).toBeLessThan(16);
  expect(view.container.querySelectorAll(".selection-readout")).toHaveLength(2);
});


it("centers imported zoom, clears blank selections and edge-pans a virtual viewport at 10% per second", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frames.push(cb); return frames.length; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const onSelection = vi.fn();
  try {
    const view = render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a"
      wordSelection={{ indexes: [], anchor: null, ranges: [{ id: "selected", start: 10, end: 12 }] }}
      onWordSelectionChange={onSelection} onSelectTrack={vi.fn()} onCutsChange={vi.fn()} />);
    const audio = view.container.querySelector("audio")!;
    audio.currentTime = 30; fireEvent.timeUpdate(audio);
    fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline" }));
    // 30 seconds is centered in the 30-second viewport (15–45).
    expect(view.container.querySelector<HTMLElement>(".obs-timeline__playhead")!.style.left).toBe("50%");
    const wave = screen.getByLabelText("Waveform Channel 1");
    vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
    fireEvent.pointerDown(wave, { button: 0, clientX: 950, pointerId: 7 });
    expect(onSelection).toHaveBeenLastCalledWith({ indexes: [], anchor: null });
    act(() => { frames.splice(0).forEach((frame) => frame(0)); }); act(() => { frames.splice(0).forEach((frame) => frame(1000)); });
    // 100px at this zoom = 3 source seconds. Playhead remains at pointer's 95%.
    expect(screen.getByText("00:46")).toBeInTheDocument();
    expect(view.container.querySelector<HTMLElement>(".obs-timeline__playhead")!.style.left).toBe("95%");
    fireEvent.pointerUp(wave, { button: 0, clientX: 950, pointerId: 7 });
    expect(audio.currentTime).toBeCloseTo(46.5);
    const stopped = audio.currentTime; act(() => { frames.splice(0).forEach((frame) => frame(2000)); });
    expect(audio.currentTime).toBe(stopped);
    fireEvent.click(screen.getByLabelText("Subtitle Channel 1"));
    expect(onSelection).toHaveBeenLastCalledWith({ indexes: [], anchor: null });
    view.unmount();
  } finally { raf.mockRestore(); cancel.mockRestore(); }
});
