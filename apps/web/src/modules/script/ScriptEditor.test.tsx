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
});

