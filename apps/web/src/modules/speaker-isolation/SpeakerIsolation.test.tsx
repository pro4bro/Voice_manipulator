import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectMediaAsset } from "../../domain/types";
import { SpeakerIsolation } from "./SpeakerIsolation";

describe("SpeakerIsolation", () => {
  it("explains the multi-speaker cost before running the selected diarization batch", () => {
    const onRun = vi.fn();
    render(<SpeakerIsolation asset={{ id: "footage" } as ProjectMediaAsset} onAssign={vi.fn()} onRun={onRun} speakers={[]} words={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện Speaker" }));
    expect(screen.getByRole("alertdialog", { name: "Lưu ý Speaker Diarization" })).toHaveTextContent("nhiều người cùng nói");
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chạy Speaker Diarization" }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("maps each detected Speaker N label in the diarization module", () => {
    const onAssign = vi.fn();
    render(<SpeakerIsolation
      asset={null}
      onAssign={onAssign}
      onRun={vi.fn()}
      speakers={[{ id: "profile-lan", name: "Chị Lan", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "female", attributes: {}, color: "#86b5d8", createdAt: "2026-08-23T00:00:00Z" }]}
      words={[{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-2" }]}
    />);

    fireEvent.change(screen.getByLabelText("Gán Speaker 1 vào Speaker Profile"), { target: { value: "profile-lan" } });

    expect(onAssign).toHaveBeenCalledWith({ "speaker-1": "profile-lan" });
    expect(screen.getByText("Speaker 2")).toBeInTheDocument();
  });

  it("selects a range of diarization labels and assigns them together", () => {
    const onAssign = vi.fn();
    render(<SpeakerIsolation asset={null} onAssign={onAssign} onRun={vi.fn()} speakers={[{ id: "lan", name: "Chị Lan", language: "vi", languageId: "vi", region: null, age: null, gender: "female", attributes: {}, color: "#86b5d8", createdAt: "" }]} words={[
      { text: "Một", start: 0, end: 0.2, diarizationSpeakerId: "speaker-1" },
      { text: "Hai", start: 0.2, end: 0.4, diarizationSpeakerId: "speaker-2" },
      { text: "Ba", start: 0.4, end: 0.6, diarizationSpeakerId: "speaker-3" },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn Speaker 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn Speaker 3" }), { shiftKey: true });
    expect(screen.getByText("3 nhãn đã chọn")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Gán profile cho nhãn đã chọn" }), { target: { value: "lan" } });
    expect(onAssign).toHaveBeenCalledWith({ "speaker-1": "lan", "speaker-2": "lan", "speaker-3": "lan" });
  });
});
