import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Teleprompter } from "./Teleprompter";

const CARD = {
  cardId: "vi-angry-01-c01",
  passageId: "vi-angry-01",
  passageTitle: "Lần thứ ba",
  direction: "Bắt đầu kìm nén, siết chặt từng chữ.",
  emotion: "angry" as const,
  text: "Tôi đã nhắc chuyện đó ba lần rồi.",
  estimatedSeconds: 3.4,
};

function renderCard(props: Partial<Parameters<typeof Teleprompter>[0]> = {}) {
  return render(<Teleprompter card={CARD} cardNumber={4} cardTotal={20} {...props} />);
}

describe("Teleprompter", () => {
  it("shows the card, its delivery note, and where it sits in the plan", () => {
    renderCard();

    expect(screen.getByText("Lần thứ ba")).toBeInTheDocument();
    expect(screen.getByText("Angry")).toBeInTheDocument();
    expect(screen.getByText(CARD.direction)).toBeInTheDocument();
    expect(screen.getByLabelText("Tiến độ thẻ")).toHaveTextContent("4 / 20");
  });

  it("marks the first word as current before anything is read", () => {
    renderCard();

    expect(screen.getByText("Tôi")).toHaveClass("is-current");
    expect(screen.getByText("đã")).not.toHaveClass("is-current");
  });

  it("advances on the space bar so a session works before the recognizer does", () => {
    renderCard();
    fireEvent.keyDown(screen.getByRole("group", { name: "Bài đọc" }), { key: " " });

    expect(screen.getByText("Tôi")).toHaveClass("is-read");
    expect(screen.getByText("đã")).toHaveClass("is-current");
  });

  it("jumps to a word the reader clicks, for when the follower drifts", () => {
    renderCard();
    fireEvent.click(screen.getByText("chuyện"));

    expect(screen.getByText("chuyện")).toHaveClass("is-current");
    expect(screen.getByText("nhắc")).toHaveClass("is-read");
  });

  it("never walks backwards past the start of the card", () => {
    renderCard();
    fireEvent.keyDown(screen.getByRole("group", { name: "Bài đọc" }), { key: "ArrowLeft" });

    expect(screen.getByText("Tôi")).toHaveClass("is-current");
  });

  it("says plainly that following is manual while no recognizer is attached", () => {
    renderCard();

    expect(screen.getByText(/Bám chữ tự động cần STT chạy trên máy/)).toBeInTheDocument();
  });

  it("tells the reader to read past mistakes once the follower is live", () => {
    renderCard({ followerReady: true });

    expect(screen.getByText(/cứ bỏ qua, đọc tiếp từ đang sáng/)).toBeInTheDocument();
  });

  it("follows the recognizer when one is attached", () => {
    renderCard({ followerReady: true, heard: ["Tôi", "đã", "nhắc"] });

    expect(screen.getByText("chuyện")).toHaveClass("is-current");
  });
});
