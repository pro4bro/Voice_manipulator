import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { VoiceLayerTimeline, type VoiceComposition } from "../voice-output/VoiceLayerTimeline";
import type { VoiceOutput } from "../../domain/types";

it("shares Master zoom/scroll/playhead with layers and keeps one top ruler and bottom navigator", () => {
  const composition: VoiceComposition = { revision: 1, durationFrames: 240000, layers: [{ id: "l", name: "Full", clips: [
    { id: "c", outputId: "out", startFrame: 24000, sourceStartFrame: 0, frameCount: 48000, enabled: true },
  ] }] };
  const view = render(<Timeline gain={0} onGainChange={vi.fn()} take={{ id: "out", name: "Master", duration: 10, url: "/audio" }}
    layerContent={(time, viewport) => <VoiceLayerTimeline composition={composition} outputs={[] as VoiceOutput[]} playheadSeconds={time} viewport={viewport} busy={false} onCommand={vi.fn()} />} />);
  const scroller = view.container.querySelector<HTMLElement>(".timeline-scroll")!;
  const master = view.container.querySelector<HTMLElement>(".timeline-canvas")!;
  const width = () => 1000 * Number(master.style.getPropertyValue("--zoom"));
  Object.defineProperties(scroller, { clientWidth: { configurable: true, value: 1000 }, scrollWidth: { configurable: true, get: width } });
  vi.spyOn(master, "getBoundingClientRect").mockImplementation(() => ({ left: -scroller.scrollLeft, width: width() } as DOMRect));
  fireEvent.scroll(scroller);
  fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
  scroller.scrollLeft = 400;
  fireEvent.scroll(scroller);
  expect(view.container.querySelector(".voice-layer-timeline__canvas")).toHaveStyle({ width: `${width()}px`, transform: "translateX(-400px)" });
  const pane = screen.getByLabelText("Danh sách audio layer");
  fireEvent.wheel(pane, { deltaX: 120 });
  expect(scroller.scrollLeft).toBe(520);
  expect(view.container.querySelector(".voice-layer-timeline__canvas")).toHaveStyle({ transform: "translateX(-520px)" });
  fireEvent.keyDown(pane, { key: "ArrowLeft" });
  expect(scroller.scrollLeft).toBe(460);
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 2.5; fireEvent.timeUpdate(audio);
  expect(view.container.querySelector(".voice-layer-timeline__playhead")).toHaveStyle({ left: "25%" });
  expect(view.container.querySelectorAll(".timeline-ruler")).toHaveLength(1);
  expect(view.container.querySelector(".voice-layer-timeline__ruler")).toBeNull();
  const layers = screen.getByLabelText("Danh sách audio layer");
  const stack = screen.getByRole("region", { name: "Master, subtitle và audio layers" });
  expect(stack).toContainElement(view.container.querySelector(".waveform"));
  expect(stack).toContainElement(view.container.querySelector(".word-track"));
  expect(stack).toContainElement(layers);
  expect(stack.querySelector(".timeline-sticky-ruler .timeline-ruler")).toBeTruthy();
  expect(stack.querySelector(".timeline-sticky-subtitles .word-track")).toBeTruthy();
  const sharedTransform = view.container.querySelector<HTMLElement>(".voice-layer-timeline__canvas")!.style.transform;
  expect(stack.querySelector(".timeline-sticky-ruler > div")).toHaveStyle({ width: `${width()}px`, transform: sharedTransform });
  expect(stack.querySelector(".timeline-sticky-subtitles > div")).toHaveStyle({ width: `${width()}px`, transform: sharedTransform });
  const navigator = screen.getByRole("scrollbar", { name: "Thanh cuộn timeline" });
  expect(stack).not.toContainElement(navigator);
  expect(layers.compareDocumentPosition(navigator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(navigator.compareDocumentPosition(screen.getByRole("button", { name: "Phát" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("keeps a Version's zoom, viewport and cursor when Solo publishes new Master PCM", () => {
  const props = { gain: 0, onGainChange: vi.fn(), viewIdentity: "p:version", take: { id: "first", name: "Master", duration: 10, url: "/first/audio" } };
  const view = render(<Timeline {...props} />);
  const scroller = view.container.querySelector<HTMLElement>(".timeline-scroll")!;
  const canvas = view.container.querySelector<HTMLElement>(".timeline-canvas")!;
  Object.defineProperties(scroller, { clientWidth: { configurable: true, value: 1000 }, scrollWidth: { configurable: true, value: 2000 } });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, width: 2000 } as DOMRect);
  fireEvent.scroll(scroller);
  fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 2.5; fireEvent.timeUpdate(audio);
  scroller.scrollLeft = 400; fireEvent.scroll(scroller);
  const zoom = canvas.style.getPropertyValue("--zoom");
  view.rerender(<Timeline {...props} take={{ ...props.take, id: "solo-render", url: "/solo/audio" }} />);
  expect(canvas.style.getPropertyValue("--zoom")).toBe(zoom);
  expect(scroller.scrollLeft).toBe(400);
  Object.defineProperty(audio, "duration", { configurable: true, value: 10 });
  fireEvent.loadedMetadata(audio);
  expect(audio.currentTime).toBe(2.5);
});
