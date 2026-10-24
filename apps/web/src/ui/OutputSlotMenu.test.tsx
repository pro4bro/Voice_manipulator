import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OutputSlotMenu } from "./OutputSlotMenu";

it("renders only supplied actions, closes after selection, and honors disabled actions", () => {
  const onClose = vi.fn(), onSelect = vi.fn(), onDisabled = vi.fn();
  render(<OutputSlotMenu x={120} y={90} label="Session 1 / Version 2" onClose={onClose} actions={[
    { id: "new-version", label: "New version", onSelect },
    { id: "remove", label: "Remove", onSelect: onDisabled, disabled: true, destructive: true },
  ]} />);

  expect(screen.getByRole("menu", { name: "Actions for Session 1 / Version 2" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "New version" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Reveal in Explorer" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
  expect(onDisabled).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "New version" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it("dismisses on Escape and outside pointer input", () => {
  const onClose = vi.fn();
  render(<><button type="button">Outside</button><OutputSlotMenu x={10} y={20} label="Session 1" onClose={onClose} actions={[]} /></>);
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
