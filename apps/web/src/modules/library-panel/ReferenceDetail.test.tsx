import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReferenceDetail } from "./ReferenceDetail";
import type { ReferenceBindingDocument } from "../../domain/reference-bindings";

const document: ReferenceBindingDocument = { version: 1, revision: 4, bindings: [{
  id: "binding-a", scope: { kind: "script", id: "p", revision: "3" }, target: { id: "t", text: "Câu được gán", start: null, end: null, rowIds: ["r"], wordIndexes: [], textRanges: [] },
  sources: [{ assetId: "a", name: "Thì thầm.wav", start: 1, end: 4, properties: ["timing", "whisper"], strength: .5, priority: 2 }, { assetId: "b", name: "Giận.wav", start: 0, end: 2, properties: ["emotion"], strength: 1, priority: 0 }],
  status: "requested", warnings: [], createdAt: "now", updatedAt: "now",
}] };

it("shows one two-line slot for a multi-source target and separates expansion/deletion from navigation", async () => {
  const navigate = vi.fn(), remove = vi.fn().mockRejectedValue(new Error("revision conflict"));
  const view = render(<ReferenceDetail document={document} onNavigate={navigate} onDelete={remove} />);
  expect(view.container.querySelectorAll(".reference-detail__target > span")).toHaveLength(2);
  expect(screen.getByText("Thì thầm.wav · Giận.wav")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chi tiết Câu được gán" }));
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByText("Timing · Thì thầm")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Bỏ gán reference" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("revision conflict"));
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Câu được gán Thì thầm.wav · Giận.wav" }));
  expect(navigate).toHaveBeenCalledWith(document.bindings[0]);
  view.rerender(<ReferenceDetail document={{ ...document, revision: 5, bindings: [] }} />);
  expect(view.container.querySelectorAll(".reference-detail__slot")).toHaveLength(0);
});
