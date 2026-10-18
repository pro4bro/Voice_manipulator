import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WordContextMenu, WordNoteItem } from "./WordContextMenu";

function Menu({ close = vi.fn() }: { close?: () => void }) {
  const [open, setOpen] = useState(true);
  return <><button>Outside</button>{open ? <WordContextMenu x={600} y={500} onClose={() => { close(); setOpen(false); }}>
    <button role="menuitem">Add text</button><button role="menuitem" disabled>Disabled</button><WordNoteItem module="subtitle" />
  </WordContextMenu> : null}</>;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("keeps the parent open while using Note, closes only Note with Escape and skips disabled menu actions", () => {
  const close = vi.fn(); render(<Menu close={close} />);
  expect(screen.getByRole("menuitem", { name: "Add text" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  const trigger = screen.getByRole("menuitem", { name: /^Note$/ }); expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: "ArrowRight" });
  const note = screen.getByRole("menu", { name: /Note/ });
  expect(note.contains(document.activeElement)).toBe(true);
  fireEvent.pointerDown(screen.getByText("Vạch dưới màu Speaker")); expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu", { name: /Note/ })).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: "Escape" }); expect(close).toHaveBeenCalledTimes(1);
});

it("closes from outside pointer but allows the pointer to cross the small gap into Note", () => {
  vi.useFakeTimers(); const close = vi.fn(); render(<Menu close={close} />);
  const trigger = screen.getByRole("menuitem", { name: /^Note$/ });
  fireEvent.pointerEnter(trigger); fireEvent.pointerLeave(trigger);
  fireEvent.pointerEnter(screen.getByRole("menu", { name: /Note/ }));
  act(() => vi.advanceTimersByTime(200)); expect(screen.getByRole("menu", { name: /Note/ })).toBeInTheDocument();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" })); expect(close).toHaveBeenCalledTimes(1);
});

it("remeasures after viewport resize and does not inherit overflow clipping", () => {
  vi.stubGlobal("innerWidth", 700); vi.stubGlobal("innerHeight", 600);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 214, height: 230 } as DOMRect);
  render(<div style={{ overflow: "hidden", height: 10 }}><Menu /></div>);
  const menu = screen.getByRole("menu"); expect(menu.parentElement).toBe(document.body);
  vi.stubGlobal("innerWidth", 320); vi.stubGlobal("innerHeight", 300); fireEvent.resize(window);
  expect(parseFloat(menu.style.left) + 214).toBeLessThanOrEqual(312);
  expect(parseFloat(menu.style.top) + 230).toBeLessThanOrEqual(292);
  expect(menu.style.maxHeight).toBe("284px");
});

it("keeps Note beside its parent after the parent flips on viewport resize", () => {
  vi.stubGlobal("innerWidth", 1100); vi.stubGlobal("innerHeight", 700);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("word-note-trigger")) {
      const parent = this.closest<HTMLElement>("[role='menu']")!;
      const left = parseFloat(parent.style.left), top = parseFloat(parent.style.top) + 70;
      return { left, right: left + 214, top, width: 214, height: 28 } as DOMRect;
    }
    return { width: this.classList.contains("word-note-menu") ? 300 : 214, height: 100 } as DOMRect;
  });
  render(<WordContextMenu x={650} y={300} onClose={vi.fn()}><WordNoteItem module="subtitle" /></WordContextMenu>);
  fireEvent.click(screen.getByRole("menuitem", { name: /^Note$/ }));
  const note = screen.getByRole("menu", { name: /Note/ });
  expect(note.style.left).toBe("346px");
  vi.stubGlobal("innerWidth", 600); fireEvent.resize(window);
  expect(note.style.left).toBe("74px");
});
