import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SpeakerIsolation } from "./SpeakerIsolation";

describe("SpeakerIsolation", () => {
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
});
