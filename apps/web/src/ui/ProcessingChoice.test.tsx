import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProcessingChoice, type ProcessingSelection } from "./ProcessingChoice";

function Fixture({ completed, onChosen }: { completed: Set<string>; onChosen: (selection: ProcessingSelection | null) => void }) {
  const choice = useProcessingChoice();
  return <><button onClick={() => void choice.choose("STT", ["done", "new"], completed).then(onChosen)}>Start</button>{choice.dialog}</>;
}

describe("processing scope before dispatch", () => {
  it("runs immediately when nothing has completed", async () => {
    const onChosen = vi.fn(); render(<Fixture completed={new Set()} onChosen={onChosen} />);
    await act(async () => fireEvent.click(screen.getByText("Start")));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChosen).toHaveBeenCalledWith({ ids: ["done", "new"], rerunAll: false });
  });
  it.each([true, false])("dispatches only the explicit choice: rerunAll=%s", async (all) => {
    const onChosen = vi.fn(); render(<Fixture completed={new Set(["done"])} onChosen={onChosen} />);
    fireEvent.click(screen.getByText("Start"));
    expect(onChosen).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Chỉ phần chưa có kết quả (1)" })).toHaveFocus();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: all ? "Chạy toàn bộ (2)" : "Chỉ phần chưa có kết quả (1)" })));
    expect(onChosen).toHaveBeenCalledWith({ ids: all ? ["done", "new"] : ["new"], rerunAll: all });
  });
  it("cancel and unmount settle pending work without dispatch", async () => {
    const onChosen = vi.fn(); const view = render(<Fixture completed={new Set(["done"])} onChosen={onChosen} />);
    fireEvent.click(screen.getByText("Start"));
    await act(async () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }));
    expect(onChosen).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByText("Start"));
    await act(async () => view.unmount());
    expect(onChosen).toHaveBeenCalledTimes(2);
    expect(onChosen).toHaveBeenLastCalledWith(null);
  });
});
