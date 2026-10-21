import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyLipSync, type LipSyncPreflight } from "../../domain/lipsync";
import { LipSyncCoverageReview } from "./LipSyncCoverageReview";

afterEach(() => vi.restoreAllMocks());

it("discards a stale preflight reply after an edit and requires saving before the next request", async () => {
  const document = { ...emptyLipSync(), clips: [{ id: "c", layerId: "l", assetId: "a", start: 0, inPoint: 0, outPoint: 5 }] };
  let finish!: (value: LipSyncPreflight) => void;
  const prepare = vi.spyOn(api, "prepareLipSync").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(<LipSyncCoverageReview projectId="p" document={document} dirty={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra kế hoạch LipSync" }));
  view.rerender(<LipSyncCoverageReview projectId="p" document={{ ...document, revision: 1 }} dirty />);
  await act(async () => finish({ id: "old-plan", kind: "lipsync-preflight", executed: false, readyForRender: false,
    blockers: ["stale blocker"], detection: [], sync: [], speechCandidates: [] }));
  expect(screen.queryByText(/old-plan/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Kiểm tra kế hoạch LipSync" })).toBeDisabled();
  expect(prepare).toHaveBeenCalledTimes(1);
});
