import { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useScriptTextareaSize } from "./use-script-textarea-size";

function Probe({ text, weight = 400 }: { text: string; weight?: number }) {
  const view = useRef<HTMLDivElement>(null);
  useScriptTextareaSize(view, "table");
  return <div data-testid="size-viewport" ref={view}><textarea aria-label="Sized row" className="voice-script__input" readOnly value={text}
    style={{ boxSizing: "border-box", border: "2px solid", padding: "8px", fontWeight: weight }} /></div>;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("still grows/shrinks on text, width and font changes and restores the enclosing viewport", () => {
  let measured = 1000, resized = () => {};
  vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => measured);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resized = () => callback([], {} as ResizeObserver); }
    observe() {} disconnect() {}
  });
  const rendered = render(<Probe text="long row" />);
  const view = screen.getByTestId("size-viewport");
  const field = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(field.style.height).toBe("1004px");
  let prototype = Object.getPrototypeOf(field.style);
  while (!Object.getOwnPropertyDescriptor(prototype, "height")) prototype = Object.getPrototypeOf(prototype);
  const setter = Object.getOwnPropertyDescriptor(prototype, "height")!.set!;
  const writes = vi.spyOn(field.style, "height", "set").mockImplementation((value) => { setter.call(field.style, value); if (value === "auto") view.scrollTop = 0; });
  view.scrollTop = 300;
  measured = 2000;
  rendered.rerender(<Probe text="longer row" />);
  expect(field.style.height).toBe("2004px");
  expect(view.scrollTop).toBe(300);
  let width = 200;
  Object.defineProperty(field, "clientWidth", { configurable: true, get: () => width });
  act(resized);
  writes.mockClear(); act(resized);
  expect(writes).not.toHaveBeenCalled();
  width = 120; measured = 2400;
  act(resized);
  expect(field.style.height).toBe("2404px");
  measured = 2600;
  rendered.rerender(<Probe text="longer row" weight={700} />);
  expect(field.style.height).toBe("2604px");
  measured = 600;
  rendered.rerender(<Probe text="short" weight={700} />);
  expect(field.style.height).toBe("604px");
  expect(view.scrollTop).toBe(300);
});
