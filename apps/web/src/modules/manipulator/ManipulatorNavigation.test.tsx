import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ManipulatorMode } from "../../domain/types";
import { ManipulatorNavigation, ManipulatorService } from "./ManipulatorNavigation";

describe("Manipulator function navigation", () => {
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
