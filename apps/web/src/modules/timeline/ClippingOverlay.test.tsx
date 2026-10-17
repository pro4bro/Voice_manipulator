import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClippingOverlay } from "./ClippingOverlay";

const points = [{ min: -1.2, max: 0.1 }, { min: 0, max: 0.2 }];

describe("ClippingOverlay", () => {
  afterEach(() => vi.useRealTimers());

  it("paints all clipping ranges in one SVG path so opacity cannot stack", () => {
    const { container } = render(<ClippingOverlay
      autoCalibrate={false} autoHide={false} duration={10} gain={1}
      points={[...points, { min: 0, max: 0.2 }, { min: 0, max: 1.1 }]}
      sourceKey="asset-a" windowDuration={10} windowStart={0}
    />);

    expect(screen.getByLabelText("Vùng gain bị clipping")).toBeTruthy();
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("svg")?.getAttribute("fill-rule")).toBe("nonzero");
  });

  it("hides after five seconds when enabled and stays visible when disabled", () => {
    vi.useFakeTimers();
    const props = {
      autoCalibrate: false, duration: 10, gain: 1, points,
      sourceKey: "asset-a", windowDuration: 10, windowStart: 0,
    };
    const { rerender } = render(<ClippingOverlay {...props} autoHide />);
    expect(screen.getByLabelText("Vùng gain bị clipping")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByLabelText("Vùng gain bị clipping")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByLabelText("Vùng gain bị clipping")).toBeNull();

    rerender(<ClippingOverlay {...props} autoHide={false} />);
    expect(screen.getByLabelText("Vùng gain bị clipping")).toBeTruthy();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByLabelText("Vùng gain bị clipping")).toBeTruthy();
  });

  it("restarts auto-hide when source or gain changes, not when viewport moves", () => {
    vi.useFakeTimers();
    const props = {
      autoCalibrate: false, autoHide: true, duration: 10, gain: 1,
      points, sourceKey: "asset-a", windowDuration: 10, windowStart: 0,
    };
    const { rerender } = render(<ClippingOverlay {...props} />);
    act(() => vi.advanceTimersByTime(3000));
    rerender(<ClippingOverlay {...props} windowStart={2} windowDuration={4} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByLabelText("Vùng gain bị clipping")).toBeNull();

    rerender(<ClippingOverlay {...props} sourceKey="asset-b" />);
    expect(screen.getByLabelText("Vùng gain bị clipping")).toBeTruthy();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByLabelText("Vùng gain bị clipping")).toBeNull();

    rerender(<ClippingOverlay {...props} gain={1.2} />);
    expect(screen.getByLabelText("Vùng gain bị clipping")).toBeTruthy();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByLabelText("Vùng gain bị clipping")).toBeNull();
  });
});
