import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { VoiceOutput } from "../../domain/types";
import { VoiceLayerTimeline, type VoiceComposition } from "./VoiceLayerTimeline";

const outputs = [{ id: "voice-a", name: "Line A", duration: 10 }, { id: "voice-b", name: "Line B", duration: 10 }] as VoiceOutput[];
function composition(): VoiceComposition {
  return { revision: 4, durationFrames: 240_000, layers: [
    { id: "base", name: "Base", enabled: true, clips: [
      { id: "a", outputId: "voice-a", startFrame: 24_000, sourceStartFrame: 0, frameCount: 48_000, enabled: true },
    ] },
    { id: "fix", name: "Fix", enabled: true, clips: [
      { id: "b", outputId: "voice-b", startFrame: 24_000, sourceStartFrame: 24_000, frameCount: 24_000, enabled: false },
    ] },
  ] };
}

it("aligns repeated layer clips to the same global frame scale and shows the playhead", () => {
  render(<VoiceLayerTimeline composition={composition()} outputs={outputs} playheadSeconds={2.5} busy={false} onCommand={vi.fn()} />);
  const base = screen.getByRole("button", { name: /Line A · Base/ });
  const fix = screen.getByRole("button", { name: /Line B · Fix/ });
  expect(base).toHaveStyle({ left: "10%", width: "20%" });
  expect(fix).toHaveStyle({ left: "10%", width: "10%" });
  const tracks = screen.getAllByRole("group", { name: /clips/ });
  expect(tracks).toHaveLength(2);
  expect(within(tracks[0]).getByRole("button", { name: /Line A/ })).toBe(base);
  const playheads = document.querySelectorAll(".voice-layer-timeline__playhead");
  expect(playheads).toHaveLength(2);
  expect(playheads[0]).toHaveStyle({ left: "25%" });
  expect(playheads[1]).toHaveStyle({ left: "25%" });
});

it("transfers layers with locked timecode and retains trim, split, mute, solo and delete", () => {
  const onCommand = vi.fn();
  render(<VoiceLayerTimeline composition={composition()} outputs={outputs} playheadSeconds={1.5} busy={false} onCommand={onCommand} />);
  fireEvent.click(screen.getByRole("button", { name: /Line A · Base/ }));
  expect(screen.getByRole("textbox", { name: "Start seconds" })).toHaveAttribute("readonly");
  fireEvent.change(screen.getByRole("combobox", { name: "Move clip to layer" }), { target: { value: "fix" } });
  fireEvent.click(screen.getByRole("button", { name: "Move clip" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "move-clip", clipId: "a", targetLayerId: "fix", startFrame: 24_000 });
  fireEvent.click(screen.getByRole("button", { name: "Solo Fix" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "solo-layer", layerId: "fix", solo: true });

  fireEvent.change(screen.getByRole("spinbutton", { name: "Source IN seconds" }), { target: { value: "0.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply Source IN" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "trim-left", clipId: "a", atFrame: 36_000 });

  fireEvent.click(screen.getByRole("button", { name: "Split at playhead" }));
  expect(onCommand).toHaveBeenLastCalledWith(expect.objectContaining({ action: "split-clip", clipId: "a", atFrame: 36_000, newClipId: expect.any(String) }));
  fireEvent.click(screen.getByRole("button", { name: "Mute clip" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "toggle-clip", clipId: "a", enabled: false });
  fireEvent.click(screen.getByRole("button", { name: "Mute Fix" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "toggle-layer", layerId: "fix", enabled: false });
  fireEvent.click(screen.getByRole("button", { name: "Delete clip" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "delete-clip", clipId: "a" });
});

it("mirrors the Master viewport without a second ruler or horizontal drag", () => {
  const onCommand = vi.fn();
  const view = render(<VoiceLayerTimeline composition={composition()} outputs={outputs} playheadSeconds={2.5} busy={false} onCommand={onCommand}
    viewport={{ canvasWidth: 2000, viewportWidth: 1000, scrollLeft: 400, duration: 10 }} />);
  expect(view.container.querySelector(".voice-layer-timeline__canvas")).toHaveStyle({ width: "2000px", transform: "translateX(-400px)" });
  expect(view.container.querySelector(".voice-layer-timeline__ruler")).toBeNull();
  const clip = screen.getByRole("button", { name: /Line A · Base/ });
  fireEvent.pointerDown(clip, { button: 0, pointerId: 1, clientX: 10 });
  fireEvent.pointerUp(clip, { pointerId: 1, clientX: 500 });
  expect(onCommand).not.toHaveBeenCalled();
});

it("exposes split, mute, and delete from the clip right-click menu", () => {
  const onCommand = vi.fn();
  render(<VoiceLayerTimeline composition={composition()} outputs={outputs} playheadSeconds={1.5} busy={false} onCommand={onCommand} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: /Line A · Base/ }), { clientX: 80, clientY: 60 });
  fireEvent.click(screen.getByRole("menuitem", { name: "Split at playhead" }));
  expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ action: "split-clip", clipId: "a", atFrame: 36_000 }));
  fireEvent.contextMenu(screen.getByRole("button", { name: /Line A · Base/ }), { clientX: 80, clientY: 60 });
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete clip" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "delete-clip", clipId: "a" });
});
