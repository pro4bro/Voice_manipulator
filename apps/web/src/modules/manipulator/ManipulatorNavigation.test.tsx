import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { ManipulatorMode, TrainingModelOption } from "../../domain/types";
import { ManipulatorNavigation, ManipulatorService } from "./ManipulatorNavigation";

describe("Manipulator function navigation", () => {
  it("does not show the previous function's providers while the next catalog loads", async () => {
    const catalog = vi.spyOn(api, "getEngineCatalog").mockImplementation((task) => task === "voice-dub"
      ? new Promise<TrainingModelOption[]>(() => undefined)
      : Promise.resolve([{ id: "omni", label: "OmniVoice VO", available: true } as TrainingModelOption]));
    try {
      const view = render(<ManipulatorService mode="voice-over" />);
      expect(await screen.findByText("OmniVoice VO")).toBeInTheDocument();
      view.rerender(<ManipulatorService mode="voice-dubber" />);
      expect(screen.queryByText("OmniVoice VO")).not.toBeInTheDocument();
    } finally { catalog.mockRestore(); }
  });
  it("shows the selected task's machine availability without enabling a planned processor", async () => {
    const catalog = vi.spyOn(api, "getEngineCatalog").mockResolvedValue([{
      id: "cosyvoice3-generate", label: "CosyVoice3 · tạo giọng", available: false,
      status: "Chưa có adapter CosyVoice3.", capabilities: {
        languages: ["en", "ja"], customVoiceFormat: "reference WAV", streamingInput: false,
        streamingOutput: false, nativeDuration: false, wordTiming: "none",
      },
    } as TrainingModelOption]);
    try {
      render(<ManipulatorService mode="voice-dubber" />);
      expect(await screen.findByText("Chưa có adapter CosyVoice3.")).toBeInTheDocument();
      expect(catalog).toHaveBeenCalledWith("voice-dub");
      expect(screen.getByText(/duration không/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Bắt đầu/ })).not.toBeInTheDocument();
    } finally { catalog.mockRestore(); }
  });
  it("selects a function with mouse and vertical keyboard navigation without running a processor", () => {
    function Harness() {
      const [mode, setMode] = useState<ManipulatorMode>("voice-over");
      return <><ManipulatorNavigation mode={mode} onChange={setMode} /><ManipulatorService mode={mode} /></>;
    }
    render(<Harness />);
    const tabs = screen.getByRole("tablist", { name: "Chức năng Voice Manipulator" });
    expect(tabs).toHaveAttribute("aria-orientation", "vertical");
    expect(within(tabs).getAllByRole("tab")).toHaveLength(5);
    const dub = screen.getByRole("tab", { name: "VD · Voice Dub" });
    fireEvent.click(dub);
    expect(dub).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Voice Dub chưa có bộ xử lý hoàn chỉnh/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bắt đầu/ })).not.toBeInTheDocument();
    fireEvent.keyDown(dub, { key: "End" });
    const live = screen.getByRole("tab", { name: "LT · Live Translate" });
    expect(live).toHaveFocus();
    expect(live).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(live, { key: "Home" });
    expect(screen.getByRole("tab", { name: "VO · Voice Over" })).toHaveFocus();
  });
});
