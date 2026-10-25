import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useScriptFollowLayout } from "./script-playback-follow";

function Probe({ reconcile }: { reconcile: () => void }) {
  const view = useRef<HTMLDivElement>(null);
  useScriptFollowLayout(view, reconcile, "source");
  return <div ref={view}><div /></div>;
}

it("coalesces geometry notifications, uses the latest target, and cancels queued work on unmount", () => {
  let notify = () => {};
  const disconnected = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { notify = () => callback([], {} as ResizeObserver); }
    observe() {} disconnect = disconnected;
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++serial, callback); return serial; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  try {
    const oldTarget = vi.fn(), latestTarget = vi.fn();
    const view = render(<Probe reconcile={oldTarget} />);
    act(() => { notify(); notify(); notify(); });
    expect(frames.size).toBe(1);
    view.rerender(<Probe reconcile={latestTarget} />);
    act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(16)); });
    expect(oldTarget).not.toHaveBeenCalled();
    expect(latestTarget).toHaveBeenCalledOnce();
    act(notify);
    expect(frames.size).toBe(1);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(disconnected).toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
