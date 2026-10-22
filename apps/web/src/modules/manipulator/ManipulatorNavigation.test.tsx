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
  it("lets users inspect unavailable generation engines and keeps their reason visible", () => {
    const generators = [
      { id: "omni-generate", engine: "omnivoice", family: "OmniVoice", label: "OmniVoice generate", available: true, status: "Sẵn sàng." },
      { id: "cosy-generate", engine: "cosyvoice3", family: "CosyVoice3", label: "CosyVoice3 generate", available: false, status: "Chưa tải engine." },
      { id: "f5-generate", engine: "f5-tts", family: "EasyVoice · F5/ViVoice", label: "F5 generate", available: false, status: "Thiếu weights F5." },
      { id: "vi-generate", engine: "vivoice", family: "EasyVoice · F5/ViVoice", label: "ViVoice generate", available: false, status: "Thiếu weights VI." },
    ] as TrainingModelOption[];
    const onGenerationEngineChange = vi.fn();
    render(<ManipulatorService mode="voice-over" voiceGenerators={generators} generationEngine={null} onGenerationEngineChange={onGenerationEngineChange} />);
    const selector = screen.getByRole("combobox", { name: "Engine tạo giọng" });
    expect(within(selector).getByRole("option", { name: /CosyVoice3.*Chưa tải engine/ })).toBeEnabled();
    expect(screen.getByText("Chưa tải engine.")).toBeInTheDocument();
    expect(within(selector).getByRole("option", { name: "F5-TTS · Thiếu weights F5." })).toHaveValue("f5-tts");
    expect(within(selector).getByRole("option", { name: "ViVoice · Thiếu weights VI." })).toHaveValue("vivoice");
    fireEvent.change(selector, { target: { value: "cosyvoice3" } });
    expect(onGenerationEngineChange).toHaveBeenLastCalledWith("cosyvoice3");
    fireEvent.change(selector, { target: { value: "omnivoice" } });
    expect(onGenerationEngineChange).toHaveBeenLastCalledWith("omnivoice");
  });
  it("retains a separate provider choice for each planned function without running it", async () => {
    const catalog = vi.spyOn(api, "getEngineCatalog").mockImplementation((task) => Promise.resolve(task === "voice-dub"
      ? [{ id: "omni-dub", label: "OmniVoice Dub", available: false }, { id: "cosy-dub", label: "CosyVoice Dub", available: false }]
      : [{ id: "demucs", label: "Demucs", available: false }]) as Promise<TrainingModelOption[]>);
    try {
      const view = render(<ManipulatorService mode="voice-dubber" />);
      const dub = await screen.findByRole("combobox", { name: "Bộ xử lý Voice Dub" });
      fireEvent.change(dub, { target: { value: "cosy-dub" } });
      expect(dub).toHaveValue("cosy-dub");
      view.rerender(<ManipulatorService mode="voice-isolator" />);
      expect(await screen.findByRole("combobox", { name: "Bộ xử lý Voice Isolator" })).toHaveValue("demucs");
      view.rerender(<ManipulatorService mode="voice-dubber" />);
      expect(await screen.findByRole("combobox", { name: "Bộ xử lý Voice Dub" })).toHaveValue("cosy-dub");
      expect(screen.queryByRole("button", { name: /Bắt đầu/ })).not.toBeInTheDocument();
    } finally { catalog.mockRestore(); }
  });
  it("connects the real Sokuji runtime and lists the returned translation models without starting translation", async () => {
    const catalog = vi.spyOn(api, "getEngineCatalog").mockResolvedValue([{ id: "sokuji-live-translate", label: "Sokuji Live Translate", available: false, status: "Runtime cần kết nối." } as TrainingModelOption]);
    const health = vi.spyOn(api, "getSokujiHealth").mockResolvedValue({ installed: true, running: false, reason: "Runtime đang dừng." });
    const start = vi.spyOn(api, "startSokuji").mockResolvedValue({ installed: true, running: true, port: 4312, health: { ok: true, type: "pong", running: true } });
    const getModels = vi.spyOn(api, "getSokujiTranslateCatalog").mockResolvedValue({ installed: true, running: true, port: 4312, kind: "translate", models: [
      { id: "hy-mt2-1.8b", name: "HY-MT2 1.8B", kind: "translate" },
      { id: "nllb-200-distilled-600m", name: "NLLB 200", kind: "translate" },
    ] });
    try {
      render(<ManipulatorService mode="live-translate" />);
      fireEvent.click(await screen.findByRole("button", { name: "Kết nối Sokuji" }));
      expect(await screen.findByText("Đang chạy · cổng 4312")).toBeInTheDocument();
      expect(await screen.findByRole("option", { name: "HY-MT2 1.8B · hy-mt2-1.8b" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "NLLB 200 · nllb-200-distilled-600m" })).toBeInTheDocument();
      expect(start).toHaveBeenCalledOnce();
      expect(getModels).toHaveBeenCalledOnce();
      expect(start.mock.invocationCallOrder[0]).toBeLessThan(getModels.mock.invocationCallOrder[0]);
      expect(catalog).toHaveBeenCalledWith("live-translate");
      expect(health).toHaveBeenCalledOnce();
      expect(screen.queryByRole("button", { name: /Bắt đầu dịch|Bắt đầu thu/ })).not.toBeInTheDocument();
      expect(screen.getByText("Chỉ đọc model catalog; luồng dịch chưa được nối.")).toBeInTheDocument();
    } finally {
      catalog.mockRestore(); health.mockRestore(); start.mockRestore(); getModels.mockRestore();
    }
  });
  it("shows a connection error without displaying a false running status", async () => {
    const catalog = vi.spyOn(api, "getEngineCatalog").mockResolvedValue([{ id: "sokuji-live-translate", label: "Sokuji Live Translate", available: false, status: "Runtime cần kết nối." } as TrainingModelOption]);
    const health = vi.spyOn(api, "getSokujiHealth").mockResolvedValue({ installed: true, running: false });
    const start = vi.spyOn(api, "startSokuji").mockRejectedValue(new Error("Sidecar chưa sẵn sàng."));
    try {
      render(<ManipulatorService mode="live-translate" />);
      fireEvent.click(await screen.findByRole("button", { name: "Kết nối Sokuji" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Sidecar chưa sẵn sàng.");
      expect(screen.getByText("Đã cài · đang dừng")).toBeInTheDocument();
      expect(start).toHaveBeenCalledOnce();
    } finally { catalog.mockRestore(); health.mockRestore(); start.mockRestore(); }
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
