import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VoiceCompositionTimeline } from "./VoiceCompositionTimeline";
import type { VoiceComposition } from "./VoiceLayerTimeline";
const composition: VoiceComposition = { revision: 2, durationFrames: 240000, layers: [
  { id: "base", name: "Full", clips: [{ id: "a", outputId: "out", startFrame: 24000, sourceStartFrame: 0, frameCount: 48000, enabled: true }] },
  { id: "fix", name: "Fix", clips: [] },
] };
it("edits the selected layer clip from the Timeline toolbar without a bottom form", () => {
  const onCommand = vi.fn();
  const view = render(<VoiceCompositionTimeline composition={composition} outputs={[]} busy={false} onCommand={onCommand}
    take={{ id: "out", name: "Master", duration: 10, url: "/audio" }} gain={0} onGainChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "DELETE" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /out · Full/ }));
  expect(screen.queryByRole("textbox", { name: "Start seconds" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Selected clip/)).not.toBeInTheDocument();
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 1.5; fireEvent.timeUpdate(audio);
  fireEvent.click(screen.getByRole("button", { name: "CUT" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "cut-clip", clipId: "a", atFrames: [36000] });
  fireEvent.click(screen.getByRole("button", { name: "Chuyển clip xuống layer" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "move-clip", clipId: "a", targetLayerId: "fix", startFrame: 24000 });
  fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "delete-clip", clipId: "a" });
  fireEvent.click(screen.getByRole("button", { name: "RESET" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "reset-composition" });
});

it("uses marked IN/OUT within the selected clip and rejoins compatible cuts", () => {
  const onCommand = vi.fn();
  const split: VoiceComposition = { ...composition, layers: [{ ...composition.layers[0], clips: [
    { ...composition.layers[0].clips[0], frameCount: 24000 },
    { ...composition.layers[0].clips[0], id: "b", startFrame: 48000, sourceStartFrame: 24000, frameCount: 24000 },
  ] }, composition.layers[1]] };
  const view = render(<VoiceCompositionTimeline composition={split} outputs={[]} busy={false} onCommand={onCommand}
    take={{ id: "out", name: "Master", duration: 10, url: "/audio" }} gain={0} onGainChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /out · Full · 1.000–2.000/ }));
  fireEvent.click(screen.getByRole("button", { name: "UNCUT" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "uncut-clip", clipId: "a" });
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 1.2; fireEvent.timeUpdate(audio);
  fireEvent.click(screen.getByRole("button", { name: "MARK IN" }));
  audio.currentTime = 1.7; fireEvent.timeUpdate(audio);
  fireEvent.click(screen.getByRole("button", { name: "MARK OUT" }));
  fireEvent.click(screen.getByRole("button", { name: "CUT" }));
  expect(onCommand).toHaveBeenLastCalledWith({ action: "cut-clip", clipId: "a", atFrames: [28800,40800] });
});
