import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("held waveform audition", () => {
  it.each([["start", 5], ["center", 4.94], ["end", 4.88]] as const)("shares %s audio bounds with the highlight and stops only on release", async (position, start) => {
    vi.useFakeTimers();
    const { container } = render(<Timeline gain={0} onGainChange={vi.fn()} scrubPreviewPosition={position}
      take={{ id: "held", name: "held.wav", url: "/held.wav", duration: 10 }} />);
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { configurable: true, value: 10 });
    const starts: number[] = [];
    vi.spyOn(audio, "play").mockImplementation(async () => { starts.push(audio.currentTime); });
    vi.spyOn(container.querySelector(".timeline-canvas")!, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
    const wave = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(wave, { button: 0, pointerId: 1, clientX: 500 });
    const overlay = screen.getByRole("img", { name: /Đoạn nghe thử/ });
    expect(Number(overlay.dataset.start)).toBeCloseTo(start);
    expect(Number(overlay.dataset.end)).toBeCloseTo(start + .12);
    expect(audio.currentTime).toBeCloseTo(start);
    await act(async () => { await vi.advanceTimersByTimeAsync(370); });
    expect(starts.length).toBeGreaterThanOrEqual(3);
    starts.forEach((time) => expect(time).toBeCloseTo(start));
    fireEvent.pointerUp(wave, { button: 0, pointerId: 1, clientX: 500 });
    expect(screen.queryByRole("img", { name: /Đoạn nghe thử/ })).not.toBeInTheDocument();
    expect(audio.currentTime).toBe(5);
    const count = starts.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(starts).toHaveLength(count);
  });

  it.each(["blur", "pointerCancel", "escape"])("clears a held highlight and audio on %s", async (cancel) => {
    vi.useFakeTimers();
    const { container } = render(<Timeline gain={0} onGainChange={vi.fn()}
      take={{ id: "cancel", name: "cancel.wav", url: "/cancel.wav", duration: 10 }} />);
    const audio = container.querySelector("audio")!;
    const play = vi.spyOn(audio, "play").mockResolvedValue();
    vi.spyOn(container.querySelector(".timeline-canvas")!, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
    fireEvent.pointerDown(screen.getByLabelText("Waveform timeline"), { button: 0, pointerId: 2, clientX: 500 });
    expect(screen.getByRole("img", { name: /Đoạn nghe thử/ })).toBeInTheDocument();
    if (cancel === "blur") fireEvent.blur(window);
    else if (cancel === "escape") fireEvent.keyDown(window, { key: "Escape" });
    else fireEvent.pointerCancel(screen.getByLabelText("Waveform timeline"), { pointerId: 2, clientX: 500 });
    expect(screen.queryByRole("img", { name: /Đoạn nghe thử/ })).not.toBeInTheDocument();
    const count = play.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(play).toHaveBeenCalledTimes(count);
  });
});
