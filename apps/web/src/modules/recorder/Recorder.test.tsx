import { fireEvent, render, screen } from "@testing-library/react";
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

  const PACK = {
    packId: "vi-core-v1",
    language: "vi",
    languageName: "Tiếng Việt",
    title: "Bộ đọc chuẩn",
    version: 1,
    license: "pro4bro-original",
    passageCount: 2,
    cardCount: 20,
    wordCount: 400,
    estimatedSeconds: 160,
    emotions: ["normal", "angry"] as const,
  };

  const CARD = {
    cardId: "vi-angry-01-c01",
    passageId: "vi-angry-01",
    passageTitle: "Lần thứ ba",
    direction: "Bắt đầu kìm nén, siết chặt từng chữ.",
    emotion: "angry" as const,
    text: "Tôi đã nhắc chuyện đó ba lần rồi.",
    estimatedSeconds: 3.4,
  };

  function session(overrides = {}) {
    return {
      packTitle: PACK.title,
      mode: "flow" as const,
      card: CARD,
      cardNumber: 4,
      cardTotal: 20,
      coverage: [
        { emotion: "angry" as const, targetSeconds: 270, recordedSeconds: 30, remainingSeconds: 240, cardsRecorded: 3, cardsTotal: 10, progress: 0.11 },
      ],
      secondsSinceBreak: 30,
      ...overrides,
    };
  }

  it("stays in ordinary recording until HQ is chosen", () => {
    render(<Recorder onRecordingReady={() => undefined} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} />);

    expect(screen.queryByRole("combobox", { name: "Bộ bài đọc" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu thu" })).toBeEnabled();
  });

  it("offers the pack, the reading style, and only the emotions that pack carries", () => {
    render(<Recorder onRecordingReady={() => undefined} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Bộ bài đọc" }), { target: { value: "vi-core-v1" } });

    expect(screen.getByRole("combobox", { name: "Cách đọc" })).toHaveValue("flow");
    expect(screen.getByRole("checkbox", { name: "Angry" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Sad" })).toBeDisabled();
  });

  it("will not open a session before a pack and an emotion are chosen", () => {
    const onStart = vi.fn();
    render(<Recorder onRecordingReady={() => undefined} onStartReadingSession={onStart} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByRole("button", { name: "Bắt đầu phiên đọc" })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Bộ bài đọc" }), { target: { value: "vi-core-v1" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu phiên đọc" }));

    expect(onStart).toHaveBeenCalledWith("vi-core-v1", ["normal"], "flow");
  });

  it("shows the card, its direction, and what each emotion still owes", () => {
    render(<Recorder onRecordingReady={() => undefined} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} readingSession={session()} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByText(/THẺ 4\/20/)).toBeInTheDocument();
    expect(screen.getByText(CARD.direction)).toBeInTheDocument();
    expect(screen.getByText("còn 4m 00s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu thẻ 4" })).toBeEnabled();
  });

  it("warns once enough has been recorded that the voice starts drifting", () => {
    render(<Recorder onRecordingReady={() => undefined} readingSession={session({ secondsSinceBreak: 900 })} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByText(/Nghỉ một lát/)).toBeInTheDocument();
  });

  it("has nothing to record once the plan runs out of cards", () => {
    render(<Recorder onRecordingReady={() => undefined} readingSession={session({ card: null })} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByText(/Đã thu hết thẻ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu thu" })).toBeDisabled();
  });
});
