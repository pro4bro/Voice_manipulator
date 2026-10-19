import { renderHook, act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { dragSeekTime, edgeScrollStart, useDragAutoScroll, zoomWindowStart } from "./drag-autoscroll";

it("steps edge speed symmetrically at 90/95/100 percent and outside, independent of zoom", () => {
  const cases = [[-.01, -.4], [0, -.3], [.001, -.2], [.05, -.2], [.051, -.1], [.1, -.1], [.101, 0],
    [.5, 0], [.899, 0], [.9, .1], [.949, .1], [.95, .2], [.999, .2], [1, .3], [1.01, .4]];
  for (const width of [200, 800, 1600]) for (const span of [1, 10, 200]) {
    const view = { left: 100, width, start: 300, span, duration: 1000 };
    for (const [ratio, rate] of cases) {
      expect((edgeScrollStart(view, view.left + width * ratio, 1000) - view.start) / span * width).toBeCloseTo(rate * width);
    }
  }
});

it("changes speed during the same held drag and stops when the pointer returns to the interior", () => {
  let callback: FrameRequestCallback = () => undefined;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { callback = cb; return 1; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  let start = 20;
  const hook = renderHook(() => useDragAutoScroll({ viewport: () => ({ left: 0, width: 1000, start, span: 10, duration: 100 }),
    pan: next => { start = next; }, seek: vi.fn() }));
  try {
    act(() => { hook.result.current.begin(925); callback(0); callback(1000); });
    expect(start).toBe(21);
    for (const [x, time, expected] of [[950, 2000, 23], [1000, 3000, 26], [1001, 4000, 30], [500, 5000, 30], [50, 6000, 28], [0, 7000, 25], [-1, 8000, 21]]) {
      act(() => { hook.result.current.move(x); callback(time); });
      expect(start).toBe(expected);
    }
    act(() => hook.result.current.stop()); act(() => callback(9000));
    expect(start).toBe(21);
  } finally { hook.unmount(); raf.mockRestore(); cancel.mockRestore(); }
});

it("moves exactly one tenth of the screen per second regardless of source duration or zoom", () => {
  for (const span of [1, 10, 200]) {
    const view = { left: 100, width: 800, start: 300, span, duration: 1000 };
    expect((edgeScrollStart(view, 840, 1000) - view.start) / span * view.width).toBeCloseTo(80);
    expect((edgeScrollStart(view, 160, 500) - view.start) / span * view.width).toBeCloseTo(-40);
    expect(edgeScrollStart(view, 500, 1000)).toBe(300);
  }
  expect(edgeScrollStart({ left: 0, width: 100, start: 0, span: 1000, duration: 1000 }, 99, 1000)).toBe(0);
});

it("centres zoom on the playhead and clamps at either source edge", () => {
  expect(zoomWindowStart(75, 20, 100)).toBe(65);
  expect(zoomWindowStart(2, 20, 100)).toBe(0);
  expect(zoomWindowStart(98, 20, 100)).toBe(80);
  expect(zoomWindowStart(75, 100, 100)).toBe(0);
});

it("keeps scrolling with a stationary drag pointer and stops on release/unmount", () => {
  let callback: FrameRequestCallback = () => undefined;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { callback = cb; return 1; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  let start = 20;
  const pan = vi.fn((next: number) => { start = next; });
  const seek = vi.fn();
  const hook = renderHook(() => useDragAutoScroll({ sourceKey: "a", viewport: () => ({ left: 0, width: 1000, start, span: 10, duration: 100 }), pan, seek }));
  act(() => { hook.result.current.begin(925); callback(0); callback(1000); });
  expect(pan).toHaveBeenLastCalledWith(21);
  expect(seek).toHaveBeenLastCalledWith(30);
  act(() => window.dispatchEvent(new Event("pointerup")));
  pan.mockClear(); act(() => callback(2000)); expect(pan).not.toHaveBeenCalled();
  hook.unmount(); expect(cancel).toHaveBeenCalled(); raf.mockRestore(); cancel.mockRestore();
});

it("preserves fractional movement across frames when the browser rounds scrollLeft to pixels", () => {
  let callback: FrameRequestCallback = () => undefined;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { callback = cb; return 1; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  let start = 20;
  const hook = renderHook(() => useDragAutoScroll({ sourceKey: "a",
    viewport: () => ({ left: 0, width: 800, start, span: 10, duration: 100 }),
    pan: (next) => { start = Math.round(next / 10 * 800) / 800 * 10; }, seek: vi.fn() }));
  try {
    act(() => { hook.result.current.begin(740); callback(0); });
    for (let frame = 1; frame <= 60; frame += 1) act(() => callback(frame * 1000 / 60));
    expect((start - 20) / 10 * 800).toBeCloseTo(80);
  } finally { hook.unmount(); raf.mockRestore(); cancel.mockRestore(); }
});


it("uses the same safe seek position before pan, on pan frames and on release", () => {
  const view = { left: 100, width: 1000, start: 20, span: 10, duration: 100 };
  expect(dragSeekTime(view, 50)).toBe(21);
  expect(dragSeekTime(view, 1200)).toBe(29);
  expect(dragSeekTime(view, 600)).toBe(25);
  expect(dragSeekTime({ ...view, start: 21 }, 1200)).toBe(30);
  expect(dragSeekTime({ ...view, start: 0 }, 50)).toBe(0);
  expect(dragSeekTime({ ...view, start: 90 }, 1200)).toBe(100);
  expect(dragSeekTime({ ...view, start: 0, span: 100 }, 1200)).toBe(100);
});

it("reaches mathematical source ends despite floating point roundoff", () => {
  const duration = 100.123;
  const span = 33.37433333333333;
  const start = duration - span - Number.EPSILON * duration;
  expect(dragSeekTime({ left: 0, width: 1000, start, span, duration }, 1000)).toBe(duration);
  expect(dragSeekTime({ left: 0, width: 1000, start: Number.EPSILON, span, duration }, 0)).toBe(0);
});

it.each([false, true])("unlocks the physical edge during a held pan and keeps it on release (end=%s)", (end) => {
  let callback: FrameRequestCallback = () => undefined;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { callback = cb; return 1; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const duration = 100.123, span = duration / 3;
  let start = end ? duration - span - .01 : .01;
  const seek = vi.fn();
  const viewport = () => ({ left: 0, width: 1000, start, span, duration });
  const hook = renderHook(() => useDragAutoScroll({ viewport, pan: (next) => { start = next; }, seek }));
  try {
    const pointer = end ? 1000 : 0, expected = end ? duration : 0;
    act(() => { hook.result.current.begin(pointer); hook.result.current.seek(pointer); callback(0); callback(1000); });
    expect(seek).toHaveBeenLastCalledWith(expected);
    act(() => callback(2000));
    expect(seek).toHaveBeenLastCalledWith(expected);
    act(() => { hook.result.current.seek(pointer); hook.result.current.stop(); });
    expect(seek).toHaveBeenLastCalledWith(expected);
    const releasedStart = start;
    act(() => callback(3000));
    expect(start).toBe(releasedStart);
    // Returning to the interior still uses the pointer's actual position.
    expect(dragSeekTime(viewport(), 500)).toBeCloseTo(start + span / 2);
  } finally { hook.unmount(); raf.mockRestore(); cancel.mockRestore(); }
});
