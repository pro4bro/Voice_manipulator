import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScriptEditor } from "./ScriptEditor";

describe("ScriptEditor", () => {
  it("lets the user edit transcript text after recognition", () => {
    const onChange = vi.fn();
    render(
      <ScriptEditor
        value="Bản nhận diện ban đầu"
        onChange={onChange}
        workflow="speech-to-text"
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Script transcript" }), {
      target: { value: "Bản đã được người dùng sửa" },
    });

    expect(onChange).toHaveBeenCalledWith("Bản đã được người dùng sửa");
  });

  it("does not expose voice generation in Speech to Text", () => {
    render(
      <ScriptEditor
        value="Nội dung"
        onChange={() => undefined}
        workflow="speech-to-text"
      />,
    );

    expect(screen.queryByRole("button", { name: "Tạo voice" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI fix" })).toBeInTheDocument();
  });

  it("highlights the word currently playing on the timeline", () => {
    render(
      <ScriptEditor
        activeWordIndex={1}
        onChange={() => undefined}
        value="Giọng đang phát"
        words={[
          { text: "Giọng", start: 0, end: 0.4 },
          { text: "đang", start: 0.4, end: 0.8 },
          { text: "phát", start: 0.8, end: 1.2 },
        ]}
        workflow="speech-to-text"
      />,
    );

    expect(screen.getByText("đang")).toHaveClass("is-active");
  });

  it("tags an exact timed word with speaker and emotion", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3 }, { text: "chào", start: 0.3, end: 0.7 }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={[{ id: "speaker-1", name: "Anh Vũ", language: "Tiếng Việt", region: "Miền Nam", age: null, gender: "male", color: "#ff6745", createdAt: "2026-08-23T00:00:00Z" }]} value="Xin chào" words={words} workflow="speech-to-text" />);

    fireEvent.click(screen.getByRole("button", { name: "TAG WORDS" }));
    fireEvent.change(screen.getByLabelText("Người nói để gán cho từ"), { target: { value: "speaker-1" } });
    fireEvent.change(screen.getByLabelText("Cảm xúc để gán cho từ"), { target: { value: "funny" } });
    fireEvent.click(screen.getByRole("button", { name: "Gán nhãn cho từ chào" }));

    expect(onWordsChange).toHaveBeenCalledWith([words[0], { ...words[1], speakerId: "speaker-1", emotion: "funny" }]);
  });
});
