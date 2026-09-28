import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VoiceOutputPanel } from "./VoiceOutputPanel";
import type { VoiceOutput } from "../../domain/types";

function output(overrides: Partial<VoiceOutput> = {}): VoiceOutput {
  return {
    id: "output-1", name: "An · Xin chào", text: "Xin chào mọi người", voiceId: "voice-1", voiceName: "An · nhái giọng",
    speakerProfileId: "speaker-an", engine: "omnivoice", generatorId: "omnivoice-generate", parameters: {}, duration: 4.2,
    sampleRate: 24000, audioPath: "assets/voice-output/output-1/audio.wav", createdAt: "2026-09-14T08:00:00Z",
    ...overrides,
  };
}

describe("VoiceOutputPanel", () => {
  it("lists generated speech with its voice and length, and opens it on the Timeline", () => {
    const onOpen = vi.fn();
    render(<VoiceOutputPanel activeOutputId="output-1" onDelete={vi.fn()} onOpen={onOpen} outputs={[output(), output({ id: "output-2", text: "Câu thứ hai" })]} speakers={[]} />);

    expect(screen.getByText("Xin chào mọi người")).toBeInTheDocument();
    expect(screen.getAllByText(/An · nhái giọng · 00:04.2/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Xin chào mọi người/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Câu thứ hai/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "output-2" }));
  });

  it("asks once more before deleting a file for good", () => {
    const onDelete = vi.fn();
    render(<VoiceOutputPanel activeOutputId={null} onDelete={onDelete} onOpen={vi.fn()} outputs={[output()]} speakers={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá An · Xin chào" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xoá hẳn?" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "output-1" }));
  });

  it("selects a range and confirms one bulk deletion", () => {
    const onDeleteMany = vi.fn();
    const outputs = [output(), output({ id: "output-2", name: "B · hai", text: "Câu hai" }), output({ id: "output-3", name: "C · ba", text: "Câu ba" })];
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onDeleteMany={onDeleteMany} onOpen={vi.fn()} outputs={outputs} speakers={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Chọn An · Xin chào" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn C · ba" }), { shiftKey: true });
    expect(screen.getByText("3 đã chọn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xoá đã chọn" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá 3" }));

    expect(onDeleteMany).toHaveBeenCalledWith(outputs);
  });

  it("selects all Voice Output rows with Ctrl+A while the list has focus", () => {
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[output(), output({ id: "output-2", name: "B · hai" })]} speakers={[]} />);
    fireEvent.keyDown(screen.getByRole("region", { name: "Danh sách Voice Output" }), { key: "a", ctrlKey: true });
    expect(screen.getByText("2 đã chọn")).toBeInTheDocument();
  });

  it("says where results will appear before there are any", () => {
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[]} speakers={[]} />);

    expect(screen.getByText(/không lẫn vào Media Pool/)).toBeInTheDocument();
  });
});
