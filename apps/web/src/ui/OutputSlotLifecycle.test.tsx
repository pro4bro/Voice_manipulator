import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OutputRecycleBin, OutputSlotActions } from "./OutputSlotLifecycle";

it("offers export and soft delete actions with accessible labels", () => {
  const onExport = vi.fn(); const onDelete = vi.fn();
  render(<OutputSlotActions label="Version One" onExport={onExport} onDelete={onDelete} />);
  fireEvent.click(screen.getByRole("button", { name: "Export Version One" }));
  expect(onExport).toHaveBeenCalledOnce();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Move Version One to Recycle Bin" }));
  expect(onDelete).toHaveBeenCalledOnce();
});

it("keeps recycle entries available for restore and confirmed permanent deletion", () => {
  const onRestore = vi.fn(); const onPurge = vi.fn(); const onEmpty = vi.fn();
  render(<OutputRecycleBin entries={[{ id: "v1", kind: "version", name: "Version One", deletedAt: "2026-10-24T00:00:00Z", parentSessionName: "Session One" }]} onRestore={onRestore} onPurge={onPurge} onEmpty={onEmpty} />);
  fireEvent.click(screen.getByRole("button", { name: /RECYCLE BIN/ }));
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  expect(onRestore).toHaveBeenCalledOnce();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  expect(onPurge).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Empty Recycle Bin" }));
  expect(onEmpty).toHaveBeenCalledOnce();
});
