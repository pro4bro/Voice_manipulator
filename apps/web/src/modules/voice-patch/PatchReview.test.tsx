import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PatchReview } from "./PatchReview";

afterEach(() => vi.unstubAllGlobals());
const packet = { revision: 0, expectedKey: "a".repeat(64), status: "unreviewed", ratings: { clarity: "unassessed", identity: "unassessed", delivery: "unassessed", transitions: "unassessed" }, notes: "" };
it("requires explicit listening and saves unassessed ratings without claiming quality accepted", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => packet }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...packet, revision: 1, status: "current", notes: "Hơi gắt" }) });
  vi.stubGlobal("fetch", fetcher); render(<PatchReview projectId="p" outputId="o" />);
  const save = await screen.findByText("Lưu đánh giá"); expect(save).toBeDisabled();
  expect(screen.getByLabelText("Giống giọng")).toHaveValue("unassessed");
  fireEvent.click(screen.getByLabelText("Đã nghe bản này"));
  fireEvent.change(screen.getByLabelText("Ghi chú khi nghe"), { target: { value: "Hơi gắt" } });
  fireEvent.click(save); await screen.findByText("Đánh giá khớp bản âm thanh hiện tại.");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ expectedRevision: 0, expectedKey: packet.expectedKey, listened: true, ratings: packet.ratings, notes: "Hơi gắt" });
});
it("preserves stale notes but requires listening again", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...packet, status: "stale", notes: "Đầu nối cũ", review: { listened: true } }) }));
  render(<PatchReview projectId="p" outputId="o" />);
  expect(await screen.findByLabelText("Ghi chú khi nghe")).toHaveValue("Đầu nối cũ");
  expect(screen.getByLabelText("Đã nghe bản này")).not.toBeChecked();
  expect(screen.getByText("Lưu đánh giá")).toBeDisabled();
});
it("discards late save responses after the output changes", async () => {
  let resolve!: (value: unknown) => void;
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => packet }).mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ ok: true, json: async () => packet });
  vi.stubGlobal("fetch", fetcher); const view = render(<PatchReview projectId="p" outputId="old" />);
  fireEvent.click(await screen.findByLabelText("Đã nghe bản này")); fireEvent.click(screen.getByText("Lưu đánh giá"));
  await waitFor(() => expect(resolve).toBeDefined()); view.rerender(<PatchReview projectId="p" outputId="new" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await act(async () => resolve({ ok: true, json: async () => ({ ...packet, status: "current", notes: "OLD" }) }));
  expect(screen.getByLabelText("Ghi chú khi nghe")).toHaveValue("");
  expect(screen.queryByText("Đánh giá khớp bản âm thanh hiện tại.")).not.toBeInTheDocument();
});
