import "@testing-library/jest-dom/vitest";

import { useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { ScriptScrollbar } from "./ScriptScrollbar";

function ScrollFixture({ content = "Words" }: { content?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  return <div className="script-feed-scroll-region">
    <div aria-label="Fixture viewport" ref={viewportRef}>{content}</div>
    <ScriptScrollbar label="Fixture scrollbar" viewportRef={viewportRef} />
  </div>;
}

function setScrollMetrics(viewport: HTMLElement, track: HTMLElement) {
  let scrollTop = 0;
  let scrollHeight = 1000;
  const clientHeight = 100;
  Object.defineProperties(viewport, {
    scrollTop: { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = Math.max(0, Math.min(scrollHeight - clientHeight, next)); } },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => clientHeight },
  });
  Object.defineProperty(track, "getBoundingClientRect", { configurable: true, value: () => ({
    x: 0, y: 10, top: 10, left: 0, right: 13, bottom: 110, width: 13, height: 100, toJSON: () => ({}),
  }) });
  return { get scrollTop() { return scrollTop; }, setScrollHeight(value: number) { scrollHeight = value; } };
}

it("maps keyboard and pointer navigation to the viewport and preserves a reachable end", () => {
  render(<ScrollFixture />);
  const viewport = screen.getByLabelText("Fixture viewport");
  const scrollbar = screen.getByRole("scrollbar", { name: "Fixture scrollbar" });
  const metrics = setScrollMetrics(viewport, scrollbar);
  fireEvent.scroll(viewport);

  expect(scrollbar).toHaveAttribute("aria-controls", viewport.id);
  expect(scrollbar).toHaveAttribute("aria-valuemax", "900");
  expect(scrollbar.firstElementChild).toHaveStyle({ height: "28px" });

  fireEvent.keyDown(scrollbar, { key: "End" });
  expect(metrics.scrollTop).toBe(900);
  expect(scrollbar).toHaveAttribute("aria-valuenow", "900");
  fireEvent.keyDown(scrollbar, { key: "Home" });
  expect(metrics.scrollTop).toBe(0);

  const thumb = scrollbar.firstElementChild!;
  fireEvent.pointerDown(thumb, { button: 0, pointerId: 1, clientY: 24 });
  fireEvent.pointerMove(scrollbar, { pointerId: 1, clientY: 96 });
  fireEvent.pointerUp(scrollbar, { pointerId: 1 });
  expect(metrics.scrollTop).toBe(900);
  fireEvent.pointerDown(scrollbar, { button: 0, pointerId: 2, clientY: 12 });
  expect(metrics.scrollTop).toBe(0);
  fireEvent.pointerDown(scrollbar, { button: 0, pointerId: 3, clientY: 108 });
  expect(metrics.scrollTop).toBe(900);
});

it("refreshes range geometry when virtualized content changes height", async () => {
  const view = render(<ScrollFixture content="first fragment" />);
  const viewport = screen.getByLabelText("Fixture viewport");
  const scrollbar = screen.getByRole("scrollbar", { name: "Fixture scrollbar" });
  const metrics = setScrollMetrics(viewport, scrollbar);
  fireEvent.scroll(viewport);
  expect(scrollbar).toHaveAttribute("aria-valuemax", "900");

  metrics.setScrollHeight(1600);
  view.rerender(<ScrollFixture content="measured fragment grew" />);
  await waitFor(() => expect(scrollbar).toHaveAttribute("aria-valuemax", "1500"));
});
