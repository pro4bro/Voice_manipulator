import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectMediaAsset } from "../../domain/types";
import type { ReferenceSession } from "../../domain/reference-bindings";
import { ReferenceAssignmentEditor } from "./ReferenceAssignmentEditor";

const session: ReferenceSession = { id: "session", scope: { kind: "voice-output", id: "out", revision: "revision" }, targets: [
  { id: "a", start: 1, end: 2, rowIds: [], wordIndexes: [0], textRanges: [], text: "One" },
  { id: "b", start: 7, end: 8, rowIds: [], wordIndexes: [2], textRanges: [], text: "Two" },
], request: { selection: { indexes: [0, 2], anchor: 2 }, origin: "waveform", x: 10, y: 20 }, expectedRevision: 3, existing: [], inherited: {} };
const assets = ["A", "B"].map((name) => ({ id: name, name, duration: 5, referenceSelected: true }) as ProjectMediaAsset);

function open(apply = vi.fn().mockResolvedValue(undefined), close = vi.fn()) {
  render(<ReferenceAssignmentEditor session={session} assets={assets} projectId="p" onApply={apply} onClose={close} />);
  fireEvent.click(screen.getByRole("menuitem"));
  return { apply, close };
}

it("freezes separated targets and saves independent properties, strengths and spans per source", async () => {
  const { apply, close } = open();
  fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Timing · A" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Âm lượng · A" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Bắt đầu · A" }), { target: { value: ".5" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Mức áp dụng · A" }), { target: { value: ".7" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "B" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Thì thầm · B" }));
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng cho 2 vùng" }));
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  expect(apply.mock.calls[0][0]).toMatchObject({ scope: session.scope, targets: session.targets, expectedRevision: 3, sources: [
    { assetId: "A", start: .5, end: 5, properties: ["timing", "volume"], strength: .7 }, { assetId: "B", properties: ["whisper"] },
  ] });
  expect(close).toHaveBeenCalledTimes(1);
});

it("cancel creates no binding and invalid source spans cannot be applied", () => {
  const { apply, close } = open();
  fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Timing · A" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Bắt đầu · A" }), { target: { value: "6" } });
  expect(screen.getByRole("button", { name: "Áp dụng cho 2 vùng" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Hủy$/u }));
  expect(apply).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});

it("keeps the same frozen target on a stale-revision error", async () => {
  const { apply, close } = open(vi.fn().mockRejectedValueOnce(new Error("Vùng đích đã đổi")));
  fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Cảm xúc · A" }));
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng cho 2 vùng" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Vùng đích đã đổi"));
  expect(close).not.toHaveBeenCalled(); expect(apply.mock.calls[0][0].targets).toEqual(session.targets);
});
