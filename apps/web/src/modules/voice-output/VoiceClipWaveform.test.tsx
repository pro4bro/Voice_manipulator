import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VoiceClipWaveform } from "./VoiceClipWaveform";

afterEach(() => vi.unstubAllGlobals());
const clip = { id: "c", outputId: "own-fix", startFrame: 24000, sourceStartFrame: 48000, frameCount: 96000, enabled: true };
it("requests the visible source range, and cuts off the lower half rather than folding it up", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ start: 3, end: 4, points: [{ min: -1, max: -.5 }, { min: -.2, max: .75 }] }) });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<VoiceClipWaveform projectId="p" clip={clip} visibleStart={2} visibleEnd={3} pixelsPerSecond={100} />);
  await screen.findByRole("img", { name: "Upper half source PCM waveform" });
  const url = new URL(fetcher.mock.calls[0][0], "http://local");
  expect(url.pathname).toBe("/api/projects/p/voice-outputs/own-fix/waveform");
  expect(url.searchParams.get("start")).toBe("3.000000");
  expect(url.searchParams.get("end")).toBe("4.000000");
  expect(view.container.querySelector("svg")).toHaveStyle({ left: "25%", width: "25%" });
  expect(view.container.querySelector("path")?.getAttribute("d")).toBe("M0,24 L250.00,24.00 L750.00,6.00 L1000,24 Z");
});

it("does not request offscreen clips and never substitutes a made-up waveform on error", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<VoiceClipWaveform projectId="p" clip={clip} visibleStart={7} visibleEnd={8} pixelsPerSecond={100} />);
  expect(fetcher).not.toHaveBeenCalled();
  view.rerender(<VoiceClipWaveform projectId="p" clip={clip} visibleStart={2} visibleEnd={3} pixelsPerSecond={100} />);
  await waitFor(() => expect(screen.getByText("Waveform chưa tải được")).toBeInTheDocument());
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
