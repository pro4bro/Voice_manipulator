import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectMediaAsset } from "../../domain/types";
import { ReferenceLibrary } from "./ReferenceLibrary";

const assets = ["A", "B"].map((name, index) => ({ id: name, name: `${name}.wav`, duration: 3,
  referenceSelected: index === 1, trainingSelected: true, transcriptionSelected: false }) as ProjectMediaAsset);

it("retains a multi-selection for right-click, changes only the reference role and filters badges", async () => {
  const mark = vi.fn().mockResolvedValue(undefined);
  const view = render(<ReferenceLibrary projectId="p" assets={assets} onReferenceChange={mark} />);
  fireEvent.click(screen.getByRole("option", { name: /A.wav/u }));
  fireEvent.click(screen.getByRole("option", { name: /B.wav/u }), { ctrlKey: true });
  fireEvent.contextMenu(screen.getByRole("option", { name: /A.wav/u }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Đánh dấu Reference/u }));
  await waitFor(() => expect(mark).toHaveBeenCalledWith(["A", "B"], true));
  expect(view.container.querySelector("audio")).toBeNull();
  expect(assets.every((asset) => asset.trainingSelected && !asset.transcriptionSelected)).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Chỉ Reference" }));
  expect(screen.queryByRole("option", { name: /A.wav/u })).toBeNull();
  expect(screen.getByRole("option", { name: /B.wav/u })).toHaveTextContent("REFERENCE");
});

it("imports several real File objects without requesting transcription", () => {
  const imported = vi.fn();
  render(<ReferenceLibrary assets={[]} onImport={imported} />);
  const files = [new File(["a"], "a.wav", { type: "audio/wav" }), new File(["b"], "b.wav", { type: "audio/wav" })];
  fireEvent.change(screen.getByLabelText("Import reference footage"), { target: { files } });
  expect(imported).toHaveBeenCalledWith(files.map((file) => ({ file, transcribe: false })));
});

it("supports keyboard context menu and reports backend failure without a phantom role", async () => {
  render(<ReferenceLibrary assets={assets} onReferenceChange={vi.fn().mockRejectedValue(new Error("Chọn audio track"))} />);
  fireEvent.keyDown(screen.getByRole("option", { name: /A.wav/u }), { key: "F10", shiftKey: true });
  fireEvent.click(screen.getByRole("menuitem", { name: /Đánh dấu Reference/u }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Chọn audio track"));
});
