import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskStop } from "./TaskStop";

afterEach(() => vi.useRealTimers());

it("stops only the queue first and cancels active work only after a fast repeat and Yes", async () => {
  const stop = vi.fn(); render(<TaskStop onStop={stop} scope="STT" />);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(stop).toHaveBeenCalledWith("queue"));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(screen.getByRole("alertdialog", { name: "Dừng hoàn toàn STT?" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "No" })).toHaveFocus();
  expect(stop).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  await waitFor(() => expect(stop).toHaveBeenCalledWith("all"));
});

it("No and Escape keep queue stop and never cancel active work", async () => {
  const stop = vi.fn(); render(<TaskStop onStop={stop} scope="Training" />);
  for (const dismiss of ["No", "Escape"]) {
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    if (dismiss === "No") fireEvent.click(screen.getByRole("button", { name: "No" }));
    else fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
  }
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(2));
  expect(stop.mock.calls.every(([mode]) => mode === "queue")).toBe(true);
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("does not treat a later independent click as a double stop", async () => {
  vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(1500);
  const stop = vi.fn(); render(<TaskStop onStop={stop} scope="Generate Voice" />);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  vi.restoreAllMocks();
});

it("keeps the repeat available and serializes Yes behind a delayed queue stop", async () => {
  let release!: () => void;
  const stop = vi.fn((mode) => mode === "queue" ? new Promise<void>((resolve) => { release = resolve; }) : undefined);
  render(<TaskStop onStop={stop} scope="STT" />);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  expect(stop).toHaveBeenCalledTimes(1);
  release();
  await waitFor(() => expect(stop).toHaveBeenLastCalledWith("all"));
});
