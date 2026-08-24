import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("previews source gain while dragging and commits it only when released", () => {
    const onGainChange = vi.fn();
    render(<Timeline gain={0} onGainChange={onGainChange} take={null} />);
    const slider = screen.getByRole("slider", { name: "Source gain" });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "6" } });
    expect(onGainChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider, { target: { value: "6" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Tốc độ phát" }), { target: { value: "8" } });
    expect(onGainChange).toHaveBeenCalledWith(6);
    expect(screen.getByRole("combobox", { name: "Tốc độ phát" })).toHaveValue("8");
  });

  it("moves the playhead from the audio clock", () => {
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "test.wav", url: "/audio.wav", duration: 10 }} />);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 2.5 });
    fireEvent.timeUpdate(audio);
    expect(screen.getByLabelText("Playhead indicator")).toHaveStyle({ left: "25%" });
  });

  it("renders a detailed live waveform and visible playhead while recording", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} recordingPreview={{ active: true, duration: 1.2, samples: [{ min: -0.1, max: 0.2 }, { min: -0.4, max: 0.4 }, { min: -0.2, max: 0.7 }] }} take={null} />);
    expect(screen.getByLabelText("Natural audio waveform").querySelector("path")).toBeInTheDocument();
    expect(screen.getByLabelText("Playhead indicator")).toHaveClass("is-recording");
    expect(screen.getByText(/REC LIVE · waveform đang cập nhật/)).toBeInTheDocument();
  });
});
