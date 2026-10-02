import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ModuleErrorBoundary } from "./ModuleErrorBoundary";

function Broken({ fail }: { fail: boolean }) {
  if (fail) throw new Error("Invalid recording data");
  return <span>Waveform ready</span>;
}

it("keeps the workspace usable after one module fails and recovers on selection change", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const clear = vi.fn();
  try {
    const view = render(<><span>Media Pool vẫn có</span><ModuleErrorBoundary name="timeline" resetKey="one"
      onClearSelection={clear}><Broken fail /></ModuleErrorBoundary></>);
    expect(screen.getByText("Media Pool vẫn có")).toBeInTheDocument();
    expect(screen.getByRole("alert", { name: "Lỗi hiển thị timeline" })).toHaveTextContent("Invalid recording data");
    fireEvent.click(screen.getByRole("button", { name: "Đóng footage" }));
    expect(clear).toHaveBeenCalledOnce();
    view.rerender(<><span>Media Pool vẫn có</span><ModuleErrorBoundary name="timeline" resetKey="two"
      onClearSelection={clear}><Broken fail={false} /></ModuleErrorBoundary></>);
    expect(screen.getByText("Waveform ready")).toBeInTheDocument();
  } finally { error.mockRestore(); }
});
