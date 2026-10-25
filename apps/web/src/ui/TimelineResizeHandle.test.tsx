import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TimelineResizeHandle } from "./TimelineResizeHandle";

beforeEach(() => localStorage.clear());
function setup() {
  const view = render(<div><TimelineResizeHandle layoutKey="input" /><div className="module-column--bottom" /></div>);
  const handle = screen.getByRole("separator", { name: "Co kéo chiều cao Timeline" });
  const board = handle.parentElement!;
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue({ height: 800 } as DOMRect);
  vi.spyOn(board.querySelector(".module-column--bottom")!, "getBoundingClientRect").mockReturnValue({ height: 300 } as DOMRect);
  return { ...view, handle, board };
}
it("resizes the whole bottom module by pointer and keeps the upper editor reachable", () => {
  const { handle, board } = setup();
  fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientY: 500 });
  fireEvent.pointerMove(window, { pointerId: 2, clientY: 400 });
  expect(board.style.getPropertyValue("--bottom-height")).toBe("400px");
  fireEvent.pointerMove(window, { pointerId: 2, clientY: -500 });
  expect(board.style.getPropertyValue("--bottom-height")).toBe("613px");
  fireEvent.pointerCancel(window, { pointerId: 2 });
  fireEvent.pointerMove(window, { pointerId: 2, clientY: 500 });
  expect(board.style.getPropertyValue("--bottom-height")).toBe("613px");
});
it("supports keyboard resizing with a readable minimum and saves the layout", () => {
  const { handle, board } = setup();
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  expect(board.style.getPropertyValue("--bottom-height")).toBe("324px");
  for (let index = 0; index < 10; index++) fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(board.style.getPropertyValue("--bottom-height")).toBe("180px");
  expect(localStorage.getItem("pro4bro:input:timeline-height")).toBe("180");
});
it("clamps a saved height when the workspace gets smaller and removes its override on unmount", () => {
  const { handle, board, unmount } = setup();
  fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientY: 500 });
  fireEvent.pointerMove(window, { pointerId: 2, clientY: 250 });
  fireEvent.pointerUp(window, { pointerId: 2 });
  expect(board.style.getPropertyValue("--bottom-height")).toBe("550px");
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue({ height: 500 } as DOMRect);
  fireEvent(window, new Event("resize"));
  expect(board.style.getPropertyValue("--bottom-height")).toBe("313px");
  expect(localStorage.getItem("pro4bro:input:timeline-height")).toBe("313");
  unmount();
  expect(board.style.getPropertyValue("--bottom-height")).toBe("");
});
