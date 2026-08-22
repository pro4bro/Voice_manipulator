import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Recorder } from "./Recorder";

describe("Recorder", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "mic-1", groupId: "a", kind: "audioinput", label: "Rode NT1" },
          { deviceId: "out-1", groupId: "b", kind: "audiooutput", label: "Studio Monitor" },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  it("exposes microphone, output, and live monitoring controls", async () => {
    render(<Recorder onRecordingReady={() => undefined} />);

    expect(screen.getByRole("combobox", { name: "Nguồn thu âm" })).toHaveValue("microphone");
    expect(screen.getByRole("option", { name: /Tab trình duyệt/ })).toHaveValue("display");
    expect(await screen.findByRole("combobox", { name: "Micro thu âm" })).toHaveValue("mic-1");
    expect(screen.getByRole("combobox", { name: "Thiết bị phát monitor" })).toHaveValue("out-1");
    expect(screen.getByRole("checkbox", { name: "Nghe tiếng đang thu" })).not.toBeChecked();
  });
});
