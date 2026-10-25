import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectVoice, SpeakerProfile, VoiceOutput } from "../../domain/types";
import { publishPlaybackWords } from "../../domain/playback-sync";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { Timeline } from "../timeline/Timeline";
import { VoiceScript } from "./VoiceScript";
import { ScriptEditor } from "./ScriptEditor";

const speaker = { id: "speaker", name: "Anh Vũ" } as SpeakerProfile;
const voice = { id: "voice", speakerProfileId: "speaker", engine: "omnivoice", kind: "clone" } as ProjectVoice;
const words = [{ text: "early", start: 0, end: 1, segmentIndex: 0 }, { text: "target", start: 40, end: 50, segmentIndex: 0 }];
const output = { id: "drag", name: "Script", duration: 100, words,
  segments: [{ rowId: "r", text: "early target", voiceId: "voice", speakerProfileId: "speaker", start: 0, end: 100 }] } as VoiceOutput;

const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
afterEach(() => {
  publishPlaybackWords({}); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalRangeRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", originalRangeRect);
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});

function mockLayoutFrames() {
  const observers: { callback: ResizeObserverCallback; targets: Set<Element> }[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0;
  vi.stubGlobal("ResizeObserver", class {
    entry: typeof observers[number];
    constructor(callback: ResizeObserverCallback) { this.entry = { callback, targets: new Set() }; observers.push(this.entry); }
    observe(target: Element) { this.entry.targets.add(target); }
    disconnect() { this.entry.targets.clear(); }
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++serial, callback); return serial; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  return {
    flushLayout(view: HTMLElement) {
      act(() => {
        for (const observer of observers) if ([...observer.targets].some((node) => node === view || view.contains(node))) observer.callback([], {} as ResizeObserver);
      });
      act(() => {
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach((callback) => callback(performance.now()));
      });
    },
  };
}

it.each((["input-table", "voice-table", "voice-text"] as const).flatMap((mode) => [false, true].map((multiple) => ({ mode, multiple }))))(
  "keeps $mode following held forward/reverse scrubs with an existing disjoint selection=$multiple", ({ mode, multiple }) => {
  const { flushLayout } = mockLayoutFrames();
  const tokens = Array.from({ length: 30 }, (_, index) => ({ text: `word${index}`, start: index * 3, end: index * 3 + 2.9, segmentIndex: 0 }));
  const text = tokens.map((word) => word.text).join(" ");
  const selection: WordSelection = multiple ? { indexes: [], anchor: null, ranges: [{ id: "a", start: 5, end: 7 }, { id: "b", start: 60, end: 62 }] } : EMPTY_SELECTION;
  const generated = { ...output, words: tokens, segments: [{ ...output.segments![0], text }] };
  const props = { words: tokens, duration: 100, id: "drag", name: "drag.wav", url: "/drag.wav" };
  const pair = () => <>{mode === "input-table" ? <ScriptEditor value={text} words={tokens} onChange={vi.fn()} workflow="speech-to-text" playbackAssetId="drag" wordSelection={selection} /> :
    <VoiceScript category="clone" rows={[{ id: "r", text, speakerProfileId: "speaker", voiceId: "voice" }]} speakers={[speaker]} voices={[voice]} output={generated}
      playbackId="drag" wordSelection={selection} onRowsChange={vi.fn()} onRead={vi.fn()} />}
    <Timeline gain={0} onGainChange={vi.fn()} take={props} wordSelection={selection} /></>;
  const rendered = render(pair());
  if (mode === "voice-text") fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
  const view = rendered.container.querySelector<HTMLElement>(mode === "voice-text" ? ".script-text-scroll" : ".script-table-scroll")!;
  Object.defineProperties(view, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 4000 } });
  vi.spyOn(view, "getBoundingClientRect").mockReturnValue({ top: 0, height: 200 } as DOMRect);
  let layoutOffset = 0;
  for (const node of view.querySelectorAll<HTMLElement>("[data-script-word-index]")) {
    vi.spyOn(node, "getBoundingClientRect").mockImplementation(() => ({ top: layoutOffset + Number(node.dataset.scriptWordIndex) * 100 - view.scrollTop, height: 20 } as DOMRect));
  }
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: function (this: Range) {
    return { top: layoutOffset + Number(this.toString().slice(4)) * 100 - view.scrollTop, height: 20 } as DOMRect;
  } });
  vi.spyOn(rendered.container.querySelector(".timeline-canvas")!, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  fireEvent.wheel(view); view.scrollTop = 0;
  const playhead = screen.getByLabelText("Playhead indicator");
  fireEvent.pointerDown(playhead, { button: 0, pointerId: 11, clientX: 200 });
  for (const seconds of [80, 35, 75, 12, 60]) {
    fireEvent.pointerMove(playhead, { pointerId: 11, clientX: seconds * 10 });
    const index = Math.floor(seconds / 3);
    expect(layoutOffset + index * 100 - view.scrollTop, `word${index} above visible band`).toBeGreaterThanOrEqual(0);
    expect(layoutOffset + index * 100 + 20 - view.scrollTop, `word${index} below visible band`).toBeLessThanOrEqual(200);
    layoutOffset += 250;
    // Row measurement/wrapping can settle after the first playback-follow commit.
    rendered.rerender(pair());
    flushLayout(view);
    expect(layoutOffset + index * 100 + 20 - view.scrollTop, `word${index} after late layout`).toBeLessThanOrEqual(200);
    const audio = rendered.container.querySelector("audio")!;
    audio.currentTime = 0;
    fireEvent.timeUpdate(audio); fireEvent.seeking(audio); fireEvent.seeked(audio); fireEvent.durationChange(audio);
    expect(screen.getByText(`00:0${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`)).toBeInTheDocument();
  }
  fireEvent.pointerUp(playhead, { pointerId: 11, clientX: 600 });
});

it("keeps a long edited Script row and its scroll position stable as the held playhead changes word", () => {
  vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(2600);
  const text = `early ${"edited text ".repeat(400)}target`;
  const view = render(<><VoiceScript category="clone" rows={[{ id: "r", text, speakerProfileId: "speaker", voiceId: "voice" }]} speakers={[speaker]} voices={[voice]}
    output={output} playbackId="drag" onRowsChange={vi.fn()} onRead={vi.fn()} />
    <Timeline gain={0} onGainChange={vi.fn()} take={{ id: "drag", name: "drag.wav", url: "/drag.wav", duration: 100, words }} /></>);
  const scriptScroll = view.container.querySelector<HTMLElement>(".script-table-scroll")!;
  const field = screen.getByRole("textbox", { name: "Lời thoại đoạn 1" }) as HTMLTextAreaElement;
  let prototype = Object.getPrototypeOf(field.style);
  while (!Object.getOwnPropertyDescriptor(prototype, "height")) prototype = Object.getPrototypeOf(prototype);
  const height = Object.getOwnPropertyDescriptor(prototype, "height")!;
  const heightWrites = vi.spyOn(field.style, "height", "set").mockImplementation((value: string) => {
    height.set!.call(field.style, value);
    // Real layout clamps scrollTop when the only tall row is collapsed to auto.
    if (value === "auto") scriptScroll.scrollTop = 0;
  });
  const canvas = view.container.querySelector<HTMLElement>(".timeline-canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  scriptScroll.scrollTop = 1200;
  const playhead = screen.getByLabelText("Playhead indicator");
  fireEvent.pointerDown(playhead, { button: 0, pointerId: 8, clientX: 200 });
  fireEvent.pointerMove(playhead, { pointerId: 8, clientX: 450 });
  expect(screen.getByText("00:00:45.000")).toBeInTheDocument();
  expect(field).toHaveValue(text);
  expect(heightWrites).not.toHaveBeenCalled();
  expect(scriptScroll.scrollTop).toBe(1200);
  fireEvent.pointerUp(playhead, { pointerId: 8, clientX: 450 });
  act(() => {});
});

it("settles distant virtualized Input words after wrapping measurements and reverse overview scrubs", () => {
  const { flushLayout } = mockLayoutFrames();
  let viewport: HTMLElement | null = null;
  let scale = 1;
  const fragmentHeight = (node: Element) => Math.ceil(node.querySelectorAll("[data-script-word-index]").length / 8) * 28 * scale + 16;
  const fragments = () => [...viewport?.querySelectorAll<HTMLElement>("[data-transcript-fragment]") ?? []];
  const prefix = () => {
    const spacer = viewport?.querySelector<HTMLElement>(".script-table > [aria-hidden][style]");
    return spacer?.nextElementSibling ? Number.parseFloat(spacer.style.height) || 0 : 0;
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("timeline-canvas") || this.classList.contains("transport-progress")) return { left: 0, width: 1000 } as DOMRect;
    if (this === viewport) return { top: 100, height: 200, width: 800 } as DOMRect;
    if (this.hasAttribute("data-transcript-fragment")) return { height: fragmentHeight(this) } as DOMRect;
    if (this.hasAttribute("data-transcript-row")) return { height: [...this.querySelectorAll("[data-transcript-fragment]")].reduce((sum, node) => sum + fragmentHeight(node), 20) } as DOMRect;
    if (this.classList.contains("script-table__header")) return { height: 24 } as DOMRect;
    if (this.dataset.scriptWordIndex !== undefined && viewport) {
      const fragment = this.closest<HTMLElement>("[data-transcript-fragment]")!;
      const localIndex = Number(this.dataset.scriptWordIndex) - Number(fragment.dataset.transcriptFragment!.split(":")[1]);
      const before = fragments().slice(0, fragments().indexOf(fragment)).reduce((sum, node) => sum + fragmentHeight(node), 0);
      const top = 100 + 24 + prefix() + 20 + before + Math.floor(localIndex / 8) * 28 * scale - viewport.scrollTop;
      return { top, height: 20 } as DOMRect;
    }
    return { height: 0, top: 0, width: 800 } as DOMRect;
  });
  const tokens = Array.from({ length: 1400 }, (_, index) => ({ text: `word${index}`, start: index / 10, end: index / 10 + .09 }));
  const rendered = render(<><ScriptEditor value={tokens.map((word) => word.text).join(" ")} words={tokens} onChange={vi.fn()} workflow="speech-to-text" playbackAssetId="virtual" />
    <Timeline gain={0} onGainChange={vi.fn()} take={{ id: "virtual", name: "virtual.wav", url: "/virtual.wav", duration: 140, words: tokens }} /></>);
  viewport = rendered.container.querySelector<HTMLElement>(".script-table-scroll")!;
  const view = viewport;
  const totalHeight = () => 24 + [...view.querySelector(".script-table")!.children].reduce((sum, node) => sum + ((node as HTMLElement).hasAttribute("data-transcript-row")
    ? node.getBoundingClientRect().height : Number.parseFloat((node as HTMLElement).style.height) || 0), 0);
  let scroll = 0;
  Object.defineProperties(view, {
    clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, get: totalHeight },
    scrollTop: { configurable: true, get: () => Math.min(scroll, Math.max(0, totalHeight() - 200)),
      set: (value: number) => { scroll = Math.max(0, Math.min(totalHeight() - 200, value)); } },
  });
  const playhead = screen.getByLabelText("Thanh tiến trình Timeline — bấm hoặc kéo để tua");
  fireEvent.pointerDown(playhead, { button: 0, pointerId: 12, clientX: 100 });
  for (const index of [1300, 230, 990, 30, 1399]) {
    const x = (index / 10 + .01) / 140 * 1000;
    fireEvent.pointerMove(playhead, { pointerId: 12, clientX: x });
    scale = scale === 1 ? 1.15 : 1;
    for (let pass = 0; pass < 6; pass++) flushLayout(view);
    const active = view.querySelector<HTMLElement>(`[data-script-word-index="${index}"]`)!;
    expect(active).toHaveClass("is-active");
    expect(active.getBoundingClientRect().top).toBeGreaterThanOrEqual(124);
    expect(active.getBoundingClientRect().top + 20).toBeLessThanOrEqual(300);
    const settled = view.scrollTop;
    flushLayout(view);
    expect(view.scrollTop).toBe(settled);
  }
  fireEvent.pointerUp(playhead, { pointerId: 12, clientX: 999.36 });
});
