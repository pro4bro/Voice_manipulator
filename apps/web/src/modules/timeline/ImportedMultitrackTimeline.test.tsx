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
  const editor = await screen.findByRole("textbox", { name: "Sửa subtitle" });
  fireEvent.change(editor, { target: { value: "Hi" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  await waitFor(() => expect(onAssetWordsChange).toHaveBeenCalledWith("a", [
    expect.objectContaining({ text: "Hi", start: 0, end: 0, timingSource: "user-interpolated", timingTrusted: false }), words[1],
  ], "Hi world"));
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
  expect(await screen.findByText(/GÁN TIMESTAMP · hello/)).toBeInTheDocument();
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

afterEach(() => vi.unstubAllGlobals());

it("opens a long multitrack footage at its full duration", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 7200, points: [] }) }));
  render(<ImportedMultitrackTimeline parent={{ ...parent, duration: 7200 }}
    tracks={tracks.map((track) => ({ ...track, duration: 7200 }))} selectedTrackId={null}
    onSelectTrack={() => undefined} onCutsChange={async () => true} />);
  expect(screen.getByRole("slider", { name: "Zoom timeline" })).toHaveValue("0");
  expect(screen.getByText("7200s")).toBeInTheDocument();
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
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration: 60, points: [] }) }));
  const onSelectTrack = vi.fn();
  const { container } = render(<ImportedMultitrackTimeline parent={parent} tracks={tracks} selectedTrackId="a" singleTrackView
    onSelectTrack={onSelectTrack} onCutsChange={async () => true} />);
  const wave = screen.getByLabelText("Waveform Channel 1");
  vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.pointerDown(wave, { pointerId: 1, clientX: 20 });
  fireEvent.pointerMove(wave, { pointerId: 1, clientX: 60 });
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
  expect(screen.getByRole("group", { name: "Zoom Timeline" })).toHaveTextContent("4000s");
  fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "1000" } });
  expect(screen.getByRole("slider", { name: "Zoom timeline" })).toHaveAttribute("aria-valuetext", "0.01s / 10px");
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
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const onCutsChange = vi.fn().mockResolvedValue(true);
  const cut = { id: "cut-one", start: 10, end: 20 };
  const withCuts = tracks.map((track) => ({ ...track, removedRanges: [cut] }));
  render(<ImportedMultitrackTimeline parent={parent} tracks={withCuts} selectedTrackId="a"
    onSelectTrack={() => undefined} onCutsChange={onCutsChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Phát footage" }));
  await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "RESET" }));
  await waitFor(() => expect(onCutsChange).toHaveBeenCalledWith(["a", "b"], []));
  play.mockRestore(); pause.mockRestore();
});
