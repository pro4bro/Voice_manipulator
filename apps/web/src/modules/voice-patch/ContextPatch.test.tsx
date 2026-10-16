import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectMediaAsset } from "../../domain/types";
import { ContextPatch } from "./ContextPatch";
afterEach(() => vi.unstubAllGlobals());
const assets = [{ id: "a", name: "Nguồn", words: [{ text: "Một", start: 0, end: 1 }, { text: "Hai", start: 2, end: 3 }] }, { id: "b", name: "Khác", words: [{ text: "Ba", start: 0, end: 1 }] }] as ProjectMediaAsset[];
const candidate = { id: "c", side: "after", startWord: 1, endWord: 1, startFrame: 48000, endFrame: 72000, text: "Hai" };
const draft = { assetId: "a", outputId: "a", rowId: "target", scriptRevision: 2, editRevision: 0, startFrame: 0, endFrame: 24000, sampleRate: 24000, text: "Một", replacementText: "Một", voiceId: "context-clone", speakerProfileId: "s", status: "ready", audioUrl: "/media/a/audio", report: { targetWordIndices: [0] }, contextCandidates: [candidate], selectedContext: null };
const reply = (body: object) => ({ ok: true, json: async () => body });
it("shows context span/transcript and extracts only the explicitly selected reference", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ revision: 0, draft: null }))
    .mockResolvedValueOnce(reply({ revision: 1, draft }))
    .mockResolvedValueOnce(reply({ revision: 2, draft: { ...draft, selectedContext: { ...candidate, artifactSha256: "hash" } } }));
  vi.stubGlobal("fetch", fetcher);
  render(<ContextPatch projectId="p" assets={assets} selectedAssetId="a" scriptRevision={2} saved />);
  await waitFor(() => expect(screen.getByText("Tìm giọng quanh vùng cần vá")).toBeEnabled());
  fireEvent.click(screen.getByText("Tìm giọng quanh vùng cần vá"));
  fireEvent.click(await screen.findByText("Dùng đoạn này làm giọng tham chiếu"));
  await screen.findByText("Đã chọn tham chiếu");
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual(["/api/projects/p/voice-patch/context/source", "/api/projects/p/voice-patch/context/source", "/api/projects/p/voice-patch/context/select"]);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ expectedRevision: 1, candidateId: "c" });
  expect(screen.getByText("Tạo bản vá nghe thử")).toBeDisabled();
  expect(screen.getByText(/không dùng checkpoint đã train/)).toBeInTheDocument();
});
it("ignores context replies after source selection changes", async () => {
  let finish!: (value: ReturnType<typeof reply>) => void;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ revision: 0, draft: null }))
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })));
  render(<ContextPatch projectId="p" assets={assets} selectedAssetId="a" scriptRevision={2} saved />);
  await waitFor(() => expect(screen.getByText("Tìm giọng quanh vùng cần vá")).toBeEnabled());
  fireEvent.click(screen.getByText("Tìm giọng quanh vùng cần vá"));
  fireEvent.change(screen.getByLabelText("Footage để vá theo context"), { target: { value: "b" } });
  finish(reply({ revision: 1, draft }));
  await waitFor(() => expect(screen.queryByText("Dùng đoạn này làm giọng tham chiếu")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Footage để vá theo context")).toHaveValue("b");
});
