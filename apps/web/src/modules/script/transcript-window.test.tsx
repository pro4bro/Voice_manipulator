import { useLayoutEffect, useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { StudioWord } from "../../domain/types";
import { useTranscriptWindow } from "./transcript-window";

const words: StudioWord[] = Array.from({ length: 1_280 }, (_, index) => ({
  text: `word${index}`, start: index, end: index + 0.5,
}));
const rows = [{ id: "speaker-1", words: words.map((word, index) => ({ index, word })) }];

function WindowProbe({ topInset }: { topInset: number }) {
  const view = useRef<HTMLDivElement>(null);
  const transcript = useTranscriptWindow(rows, view, 620, topInset);
  useLayoutEffect(() => {
    if (!view.current) return;
    view.current.scrollTop = 850;
    view.current.dispatchEvent(new Event("scroll"));
  }, []);
  return <div aria-label="Script scroll viewport" ref={view}>
    <output data-testid="window-top">{transcript.top}</output>
    <output data-testid="window-first">{transcript.visible[0]?.key}</output>
    {transcript.visible.map((fragment) => <div data-transcript-fragment={fragment.key} key={fragment.key} />)}
  </div>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function MeasuredProbe({ refreshed = false, rowChrome = false }: { refreshed?: boolean; rowChrome?: boolean }) {
  const view = useRef<HTMLDivElement>(null);
  const data = refreshed ? rows.map((row) => ({ ...row, words: [...row.words] })) : rows;
  const transcript = useTranscriptWindow(data, view, 620);
  return <div aria-label="Measured Script" ref={view}>
    <output data-testid="measured-top">{transcript.top}</output>
    <output data-testid="measured-bottom">{transcript.bottom}</output>
    {transcript.visibleRows.map((row) => <div data-transcript-row={rowChrome ? row.rowIndex : undefined} key={row.rowIndex}>
      {row.fragments.map((fragment) => <div data-transcript-fragment={fragment.key} key={fragment.key} />)}
    </div>)}
  </div>;
}

it("preserves the visible text anchor when a measured fragment above it changes height", () => {
  let firstHeight = 80;
  const observers: ResizeObserverCallback[] = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { observers.push(callback); }
    observe() {} disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.dataset.transcriptFragment === "0:0" ? firstHeight : 80;
    return { height, top: 0, bottom: height, width: 620, left: 0 } as DOMRect;
  });
  render(<MeasuredProbe />);
  const view = screen.getByLabelText("Measured Script");
  Object.defineProperty(view, "clientHeight", { configurable: true, value: 200 });
  view.scrollTop = 100;
  fireEvent.scroll(view);
  firstHeight = 160;
  act(() => observers.forEach((callback) => callback([], {} as ResizeObserver)));
  expect(view.scrollTop).toBe(180);
});

it("retains offscreen measurements when identical transcript data is refreshed", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 80 } as DOMRect);
  const mounted = render(<MeasuredProbe />);
  const view = screen.getByLabelText("Measured Script");
  view.scrollTop = 1200;
  fireEvent.scroll(view);
  const before = screen.getByTestId("measured-top").textContent;
  mounted.rerender(<MeasuredProbe refreshed />);
  expect(screen.getByTestId("measured-top").textContent).toBe(before);
});

it("counts logical row controls once when the visible window enters a continuation", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.hasAttribute("data-transcript-row")
      ? this.querySelectorAll("[data-transcript-fragment]").length * 80 + 21 : 80;
    return { height } as DOMRect;
  });
  render(<MeasuredProbe rowChrome />);
  const view = screen.getByLabelText("Measured Script");
  Object.defineProperty(view, "clientHeight", { configurable: true, value: 200 });
  view.scrollTop = 420;
  fireEvent.scroll(view);
  const first = view.querySelector<HTMLElement>("[data-transcript-fragment]")!;
  const number = Number(first.dataset.transcriptFragment!.split(":")[1]) / 64;
  expect(number).toBeGreaterThan(0);
  // The visible wrapper already contains the 21px row controls/padding.
  expect(Number(screen.getByTestId("measured-top").textContent)).toBe(number * 80);
  expect(view.style.overflowAnchor).toBe("none");
});

it("subtracts the measured leading notice from virtual row coordinates", () => {
  const withoutInset = render(<WindowProbe topInset={0} />);
  const firstWithoutInset = screen.getByTestId("window-first").textContent;
  const topWithoutInset = screen.getByTestId("window-top").textContent;
  withoutInset.unmount();

  render(<WindowProbe topInset={200} />);
  const firstWithInset = screen.getByTestId("window-first").textContent;
  const topWithInset = screen.getByTestId("window-top").textContent;
  expect(firstWithoutInset).not.toBe(firstWithInset);
  expect(Number(topWithInset)).toBeLessThan(Number(topWithoutInset));
});
