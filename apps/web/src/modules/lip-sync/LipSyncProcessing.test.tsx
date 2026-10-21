import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyLipSync } from "../../domain/lipsync";
import { LipSyncProcessing, type FaceGallery, type LipSyncRenderPlan } from "./LipSyncProcessing";

const gallery: FaceGallery = { analysisId: "analysis", sampledFrames: 1, sampleInterval: .5,
  observations: [{ id: "o", assetId: "a", time: 0, faceId: "face-1", score: .99 }],
  review: { analysisId: "analysis", revision: 0, observations: [{ id: "o", faceId: "face-1", reviewed: false }], bindings: [] } };
beforeEach(() => {
  vi.spyOn(api, "getLipSyncRuntime").mockResolvedValue({ analysis: { ready: true, blockers: [] }, render: { ready: true, blockers: [] } });
  vi.spyOn(api, "listLipSyncJobs").mockResolvedValue([{ id: "analysis", kind: "analysis", status: "completed", revision: 1, error: null }]);
  vi.spyOn(api, "getTrainingCatalog").mockResolvedValue({ speakers: [{ id: "speaker", name: "Mai" }] } as never);
  vi.spyOn(api, "getLipSyncFaces").mockResolvedValue(structuredClone(gallery));
});
afterEach(() => vi.restoreAllMocks());

it("requires a saved face review and discards a plan returned after composition changes", async () => {
  const doc = { ...emptyLipSync(), revision: 1 };
  const saved = vi.spyOn(api, "saveLipSyncFaces").mockImplementation(async (_, review) => ({ ...review, revision: 1 }));
  let resolve!: (value: LipSyncRenderPlan) => void;
  vi.spyOn(api, "getLipSyncRenderPlan").mockImplementation(() => new Promise((accept) => { resolve = accept; }));
  const props = { projectId: "p", document: doc, dirty: false, onAfter: vi.fn() };
  const view = render(<LipSyncProcessing {...props} />);
  await screen.findByLabelText("Đã duyệt mặt này");
  expect(screen.getByRole("button", { name: "Generate LipSync" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Đã duyệt mặt này"));
  fireEvent.change(screen.getByLabelText("Voice Profile cho o"), { target: { value: "speaker" } });
  expect(screen.getByRole("button", { name: "Kiểm tra lịch theo người nói" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Lưu duyệt ID và Speaker" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Kiểm tra lịch theo người nói" })).toBeEnabled());
  expect(saved.mock.calls[0][1].observations[0].reviewed).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra lịch theo người nói" }));
  view.rerender(<LipSyncProcessing {...props} document={{ ...doc, revision: 2 }} />);
  resolve({ ready: true, blockers: [], tasks: [], skippedTurns: 0, revision: 1, analysisRevision: 1 });
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate LipSync" })).toBeDisabled());
});

it("places profile selection under each face and applies one binding to all cards of that ID", async () => {
  const sameActor: FaceGallery = structuredClone(gallery);
  sameActor.observations.push({ ...sameActor.observations[0], id: "o2", time: .5 });
  sameActor.review.observations.push({ ...sameActor.review.observations[0], id: "o2" });
  vi.mocked(api.getLipSyncFaces).mockResolvedValue(sameActor);
  const view = render(<LipSyncProcessing projectId="cards" versionId="v" document={emptyLipSync()} dirty={false} onAfter={vi.fn()} />);
  const profiles = await screen.findAllByLabelText(/Voice Profile cho/);
  expect(profiles).toHaveLength(2);
  const cards = view.container.querySelectorAll('.lipsync-face-gallery article');
  expect([...cards[0].querySelectorAll('input, select')].map((el) => el.tagName)).toEqual(['INPUT', 'SELECT', 'INPUT']);
  fireEvent.change(profiles[0], { target: { value: "speaker" } });
  expect(profiles[1]).toHaveValue("speaker");
  fireEvent.change(screen.getAllByLabelText("Face ID")[0], { target: { value: "" } });
  expect(screen.getByRole("button", { name: "Lưu duyệt ID và Speaker" })).toBeDisabled();
  fireEvent.change(screen.getAllByLabelText("Face ID")[0], { target: { value: "corrected" } });
  expect(screen.queryByText(/Face ID chưa hợp lệ\. Dùng/)).not.toBeInTheDocument();
  expect(profiles[0]).toHaveValue("");
  expect(profiles[1]).toHaveValue("speaker");
  expect(vi.mocked(api.getLipSyncFaces)).toHaveBeenCalledWith("cards", "analysis", "v");
});
