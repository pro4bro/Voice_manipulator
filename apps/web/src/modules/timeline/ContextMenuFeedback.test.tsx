import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";

const take = { id: "menu55", name: "menu55", duration: 10, words: [{ text: "word", start: 1, end: 2 }] };
beforeEach(() => {
  vi.stubGlobal("innerWidth", 320); vi.stubGlobal("innerHeight", 300);
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("role") === "menu") return { width: 214, height: 230, left: 0, top: 0, right: 214, bottom: 230 } as DOMRect;
    return original.call(this);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([[5, 5], [315, 5], [5, 295], [315, 295]])("keeps the subtitle menu within the viewport from corner %s,%s", (x, y) => {
  render(<Timeline gain={0} onGainChange={vi.fn()} take={take} onWordsChange={vi.fn()} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Subtitle word word" }), { clientX: x, clientY: y });
  const menu = screen.getByRole("menu"), left = parseFloat(menu.style.left), top = parseFloat(menu.style.top);
  expect(left).toBeGreaterThanOrEqual(8); expect(top).toBeGreaterThanOrEqual(8);
  expect(left + 214).toBeLessThanOrEqual(312); expect(top + 230).toBeLessThanOrEqual(292);
});

it("escapes the module's overflow and transformed containing block", () => {
  render(<div style={{ overflow: "hidden", transform: "translateZ(0)", height: 90 }}>
    <Timeline gain={0} onGainChange={vi.fn()} take={take} onWordsChange={vi.fn()} />
  </div>);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Subtitle word word" }));
  expect(screen.getByRole("menu").parentElement).toBe(document.body);
});

it("opens the Note submenu without editing the word or closing its parent", () => {
  const changed = vi.fn();
  render(<Timeline gain={0} onGainChange={vi.fn()} take={take} onWordsChange={changed} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Subtitle word word" }), { clientX: 310, clientY: 290 });
  fireEvent.click(screen.getByRole("menuitem", { name: /^Note$/ }));
  expect(screen.getByRole("menu", { name: /Note/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Sửa text" })).toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});
