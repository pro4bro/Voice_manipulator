import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ArchivedObsWaveform } from "./ArchivedObsWaveform";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("shows clipping from the fetched PCM envelope in local window coordinates", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ start: 2, end: 4, points: [
    { min: -1.2, max: 0.2 }, { min: -0.4, max: 0.4 },
  ] }), { status: 200, headers: { "Content-Type": "application/json" } })));
  const view = render(<ArchivedObsWaveform url="/wave" windowStart={2} windowSpan={2} duration={10}
    width={240} gain={1} fallbackPath="" />);
  expect(await screen.findByLabelText("Vùng gain bị clipping")).toBeInTheDocument();
  expect(view.container.querySelector(".clipping-overlay path")).toHaveAttribute("d", "M 0 0 H 500 V 100 H 0 Z");
  expect(view.container.querySelector(".timeline-waveform__svg path")).toHaveAttribute("d",
    "M0.00 24.48L500.00 18.96L500.00 41.04L0.00 57.60Z");
});

it("forwards auto-hide to the archived envelope overlay", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ start: 2, end: 4, points: [
    { min: -1.2, max: 0.2 }, { min: -0.4, max: 0.4 },
  ] }), { status: 200, headers: { "Content-Type": "application/json" } })));
  render(<ArchivedObsWaveform url="/wave" windowStart={2} windowSpan={2} duration={10}
    width={240} gain={1} fallbackPath="" clippingHighlightAutoHide />);
  await act(async () => { vi.advanceTimersByTime(120); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByLabelText("Vùng gain bị clipping")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(5000); });
  expect(screen.queryByLabelText("Vùng gain bị clipping")).not.toBeInTheDocument();
});

it("does not restart the clipping auto-hide timer while an archived PCM window pans", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const request = new URL(input, "http://localhost");
    const start = Number(request.searchParams.get("start"));
    return new Response(JSON.stringify({ start, end: start + 2, points: [
      { min: -1.2, max: 0.2 }, { min: -0.4, max: 0.4 },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const view = render(<ArchivedObsWaveform url="/wave" windowStart={2} windowSpan={2} duration={10}
    width={240} gain={1} fallbackPath="" clippingHighlightAutoHide />);
  await act(async () => { vi.advanceTimersByTime(120); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByLabelText("Vùng gain bị clipping")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(4000); });

  view.rerender(<ArchivedObsWaveform url="/wave" windowStart={4} windowSpan={2} duration={10}
    width={240} gain={1} fallbackPath="" clippingHighlightAutoHide />);
  await act(async () => { vi.advanceTimersByTime(120); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByLabelText("Vùng gain bị clipping")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(900); });
  expect(screen.queryByLabelText("Vùng gain bị clipping")).not.toBeInTheDocument();
});
