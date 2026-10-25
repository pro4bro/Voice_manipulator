import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Timeline } from "./Timeline";
import { TimelineTransport } from "./TimelineTransport";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("stacks both clocks beside Play and keeps rate/gain in the Timeline header", () => {
  const view = render(<Timeline gain={15} onGainChange={vi.fn()} take={{ id: "a", name: "a.wav", url: "/a.wav", duration: 236,
    words: [] }} />);
  const header = view.container.querySelector(".module-frame__header")!;
  const footer = view.container.querySelector(".timeline-transport")!;
  const clocks = view.container.querySelector(".timeline-transport__clocks")!;
  expect(within(clocks as HTMLElement).getByLabelText("Thời điểm hiện tại")).toHaveTextContent("00:00:00.000");
  expect(within(clocks as HTMLElement).getByLabelText("Tổng thời lượng")).toHaveTextContent("00:03:56.000");
  expect(footer.querySelectorAll(":scope > *")).toHaveLength(2);
  expect(within(header as HTMLElement).getByRole("combobox", { name: "Tốc độ phát" })).toBeInTheDocument();
  expect(header.querySelector(".gain-badge")).toHaveTextContent("+15.0 dB");
  expect(within(footer as HTMLElement).queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Tốc độ phát" }), { target: { value: "4" } });
  expect(view.container.querySelector("audio")!.playbackRate).toBe(4);
});

it.each(["standard", "layers", "columns"])("fits the scrubber to the %s viewport after resize, scroll and clock updates", (layout) => {
  const callbacks = new Set<() => void>();
  vi.stubGlobal("ResizeObserver", class {
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; callbacks.add(callback); }
    observe() {}
    disconnect() { callbacks.delete(this.callback); }
  });
  let viewportWidth = 800, rulerLeft = 234;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const left = this.classList.contains("timeline-transport") ? 100
      : this.classList.contains("obs-timeline__ruler") ? rulerLeft
      : layout === "standard" ? 224 : 110;
    const width = this.classList.contains("timeline-transport") ? 1000 : viewportWidth;
    return { left, right: left + width, width } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => viewportWidth - 12);
  function Fixture({ clock }: { clock: string }) {
    return <section className="timeline-module">
      {layout === "standard" ? <div className="timeline-scroll" /> : <div className="obs-timeline__viewport">
        <div className={`obs-timeline__track-scroll is-${layout}`}>
          {layout === "layers" ? <div className="obs-timeline__ruler" /> : null}
        </div>
      </div>}
      <TimelineTransport current={clock} duration="00:05:00.000" layout={layout} playButton={<button>Play</button>}>
        <div className="transport-progress" />
      </TimelineTransport>
    </section>;
  }
  const view = render(<Fixture clock="00:00:00.000" />);
  const bar = view.container.querySelector<HTMLElement>(".timeline-transport")!;
  expect(bar.style.getPropertyValue("--transport-start")).toBe(`${layout === "standard" ? 124 : layout === "layers" ? 134 : 10}px`);
  expect(bar.style.getPropertyValue("--transport-end")).toBe(`${layout === "standard" ? 88 : 202}px`);
  expect(bar.classList.contains("timeline-transport--full-width")).toBe(layout === "columns");
  viewportWidth = 600;
  act(() => callbacks.forEach((callback) => callback()));
  expect(bar.style.getPropertyValue("--transport-end")).toBe(`${layout === "standard" ? 288 : 402}px`);
  rulerLeft = 90;
  fireEvent.scroll(view.container.querySelector(".timeline-scroll, .obs-timeline__viewport")!);
  expect(bar.style.getPropertyValue("--transport-start")).toBe(`${layout === "standard" ? 124 : 10}px`);
  view.rerender(<Fixture clock="00:01:10.000" />);
  expect(screen.getByLabelText("Thời điểm hiện tại")).toHaveTextContent("00:01:10.000");
  expect(bar.style.getPropertyValue("--transport-start")).toBe(`${layout === "standard" ? 124 : 10}px`);
  view.unmount();
  expect(callbacks.size).toBe(0);
});
