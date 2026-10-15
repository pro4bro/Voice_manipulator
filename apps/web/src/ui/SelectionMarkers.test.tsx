import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SelectionMarkers } from "./SelectionMarkers";

it("keeps colliding marks individually reachable by click and keyboard using stable IDs", () => {
  const reveal = vi.fn();
  const markers = [{ id: "a", position: .5, label: "Vùng A" }, { id: "b", position: .501, label: "Vùng B" }];
  const view = render(<SelectionMarkers markers={markers} orientation="horizontal" onReveal={reveal} />);
  fireEvent.click(screen.getByRole("button", { name: "2 vùng chọn gần nhau" }));
  expect(screen.getByRole("menuitem", { name: "Vùng A" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "Vùng B" })).toHaveFocus();
  fireEvent.click(screen.getByRole("menuitem", { name: "Vùng B" }));
  expect(reveal).toHaveBeenCalledExactlyOnceWith("b");
  view.rerender(<SelectionMarkers markers={[markers[1]]} orientation="horizontal" onReveal={reveal} />);
  fireEvent.click(screen.getByRole("button", { name: "Đến Vùng B" }));
  expect(reveal).toHaveBeenLastCalledWith("b");
});
