import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { ReadingSession, ProjectMediaAsset } from "../domain/types";
import type { CapturedAudio } from "../modules/recorder/Recorder";
import { useReadingSession } from "./useReadingSession";

vi.mock("../api/client", () => ({ api: {
  listReadingSessions: vi.fn(), createReadingSession: vi.fn(), appendReadingTake: vi.fn(),
  skipReadingCard: vi.fn(), endReadingSession: vi.fn(),
} }));

const saved: ReadingSession = {
  id: "session-1", schemaVersion: 1, revision: 2, status: "in_progress", speakerProfileId: "speaker-1",
  speakerName: "Người đọc", packTitle: "Bài đọc", packVersion: 1,
  plan: { packId: "pack-1", language: "vi", mode: "take", emotions: ["normal"], cards: [
    { cardId: "card-1", passageId: "passage-1", passageTitle: "Mở đầu", direction: "Tự nhiên", emotion: "normal", text: "Xin chào.", estimatedSeconds: 2 },
    { cardId: "card-2", passageId: "passage-1", passageTitle: "Mở đầu", direction: "Tự nhiên", emotion: "normal", text: "Cảm ơn.", estimatedSeconds: 2 },
  ] },
  cardIndex: 0, recordedSecondsByCard: {}, secondsSinceBreak: 0, skippedCardIds: [], takes: [],
  createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const capture: CapturedAudio = {
  name: "take.wav", file: new File(["wav"], "take.wav"), url: "blob:take", duration: 999,
  origin: "record", realtimeText: "ASR said something else", words: [],
  captureId: "capture-1", readingSessionId: saved.id, readingSessionRevision: saved.revision,
  readingCardId: "card-1", knownText: "Xin chào.",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listReadingSessions).mockResolvedValue({ items: [saved], total: 1 });
});

it("restores persisted progress when opening a project", async () => {
  const { result } = renderHook(() => useReadingSession("project-1", vi.fn()));
  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(result.current.session).toEqual(saved);
});

it("keeps an uncertain take on the same card and retries exactly the same intent", async () => {
  const { result } = renderHook(() => useReadingSession("project-1", vi.fn()));
  await waitFor(() => expect(result.current.busy).toBe(false));
  vi.mocked(api.appendReadingTake).mockRejectedValueOnce(new Error("Response lost"));
  await act(async () => { await expect(result.current.saveTake(capture)).rejects.toThrow("Response lost"); });
  expect(result.current.session?.cardIndex).toBe(0);
  expect(result.current.pendingTake).toBe(capture);
  await act(async () => { await result.current.skip(); await result.current.end(); });
  expect(api.skipReadingCard).not.toHaveBeenCalled();
  expect(api.endReadingSession).not.toHaveBeenCalled();
  const receipt = { ...saved, revision: 3, cardIndex: 1, recordedSecondsByCard: { "card-1": 2.25 } };
  vi.mocked(api.appendReadingTake).mockResolvedValueOnce({ session: receipt, asset: { id: "asset-1" } as ProjectMediaAsset });
  await act(async () => { await result.current.saveTake(result.current.pendingTake!); });
  expect(vi.mocked(api.appendReadingTake).mock.calls[0]).toEqual(vi.mocked(api.appendReadingTake).mock.calls[1]);
  expect(result.current.session?.recordedSecondsByCard["card-1"]).toBe(2.25);
  expect(result.current.pendingTake).toBeNull();
});

it("does not advance or clear the session when skip or end fails", async () => {
  const notice = vi.fn();
  const { result } = renderHook(() => useReadingSession("project-1", notice));
  await waitFor(() => expect(result.current.busy).toBe(false));
  vi.mocked(api.skipReadingCard).mockRejectedValueOnce(new Error("Revision conflict"));
  vi.mocked(api.endReadingSession).mockRejectedValueOnce(new Error("Offline"));
  await act(async () => { await result.current.skip(); });
  expect(result.current.session).toEqual(saved);
  await act(async () => { await result.current.end(); });
  expect(result.current.session).toEqual(saved);
  expect(notice).toHaveBeenCalledWith("Offline");
});

it("reuses the session creation ID after an unknown response", async () => {
  const { result } = renderHook(() => useReadingSession("project-1", vi.fn()));
  await waitFor(() => expect(result.current.busy).toBe(false));
  vi.mocked(api.createReadingSession).mockRejectedValueOnce(new Error("Timeout")).mockResolvedValueOnce(saved);
  await act(async () => { await result.current.start("pack-1", ["normal"], "take", "speaker-1"); });
  await act(async () => { await result.current.start("pack-1", ["normal"], "take", "speaker-1"); });
  expect(vi.mocked(api.createReadingSession).mock.calls[0]).toEqual(vi.mocked(api.createReadingSession).mock.calls[1]);
});

it("ignores an old project's response after switching projects", async () => {
  let release!: (value: { items: ReadingSession[]; total: number }) => void;
  vi.mocked(api.listReadingSessions).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }))
    .mockResolvedValueOnce({ items: [], total: 0 });
  const { result, rerender } = renderHook(({ id }) => useReadingSession(id, vi.fn()), { initialProps: { id: "old" } });
  rerender({ id: "new" });
  await waitFor(() => expect(result.current.busy).toBe(false));
  await act(async () => { release({ items: [saved], total: 1 }); });
  expect(result.current.session).toBeNull();
});
