import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("keeps source gain and playback rate inside the reusable timeline module", () => {
    const onGainChange = vi.fn();
    render(<Timeline gain={0} onGainChange={onGainChange} take={null} />);

    fireEvent.input(screen.getByRole("slider", { name: "Source gain" }), { target: { value: "6" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Tốc độ phát" }), { target: { value: "8" } });

    expect(onGainChange).toHaveBeenCalledWith(6);
    expect(screen.getByRole("combobox", { name: "Tốc độ phát" })).toHaveValue("8");
  });

  it("renders a continuous live waveform and visible playhead while recording", () => {
    render(
      <Timeline
        gain={0}
        onGainChange={() => undefined}
        recordingPreview={{ active: true, duration: 1.2, samples: [0.1, 0.4, 0.2, 0.7] }}
        take={null}
      />,
    );

    expect(screen.getByLabelText("Natural audio waveform").querySelector("path")).toBeInTheDocument();
    expect(screen.getByLabelText("Playhead indicator")).toHaveClass("is-recording");
    expect(screen.getByText(/REC LIVE · waveform đang cập nhật/)).toBeInTheDocument();
  });
});
