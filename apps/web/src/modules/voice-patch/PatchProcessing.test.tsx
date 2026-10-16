import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectVoice } from "../../domain/types";
import type { VoicePatchDocument } from "../../domain/voice-patch";
import { PatchProcessing } from "./PatchProcessing";
afterEach(() => vi.unstubAllGlobals());
const document = { revision: 3, draft: { outputId: "o", rowId: "r", scriptRevision: 2, editRevision: 1, text: "Cũ", replacementText: "Mới", voiceId: "v", speakerProfileId: "s", status: "ready" } } as VoicePatchDocument;
const voices = [{ id: "v", name: "Giọng", kind: "full", speakerProfileId: "s", engine: "omnivoice" }, { id: "wrong", name: "Người khác", kind: "full", speakerProfileId: "other", engine: "omnivoice" }, { id: "clone", name: "Clone", kind: "clone", speakerProfileId: "s", engine: "omnivoice" }] as ProjectVoice[];
const job = { id: "j", key: "key", status: "complete", draftRevision: 3, outputId: "o", scriptRevision: 2, editRevision: 1, replacementText: "Mới", voiceId: "v", done: 1, total: 1, audioUrl: "/preview", replacementAudioUrl: "/replacement" };
const reply = (body: object) => ({ ok: true, json: async () => body });
it("keeps preview separate from Apply, guards changed text and only lists trained same-speaker models", async () => {
  const onOutputReady = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ processingAvailable: true, draftRevision: 3, blockers: [] }))
    .mockResolvedValueOnce(reply(job)).mockResolvedValueOnce(reply({ output: { id: "new", duration: 2 }, audioUrl: "/new", sourceOutputId: "o", key: "key", report: {} }));
  vi.stubGlobal("fetch", fetcher);
  render(<PatchProcessing projectId="p" document={document} currentSource saved voices={voices} onOutputReady={onOutputReady} />);
  expect(screen.queryByText("Người khác · full")).not.toBeInTheDocument();
  expect(screen.queryByText("Clone · clone")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Kiểm tra khả năng Patch"));
  await waitFor(() => expect(screen.getByText("Tạo bản vá nghe thử")).toBeEnabled());
  fireEvent.click(screen.getByText("Tạo bản vá nghe thử"));
  await screen.findByLabelText("Nghe bản ghép Patch");
  expect(onOutputReady).not.toHaveBeenCalled();
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ expectedDraftRevision: 3, expectedScriptRevision: 2, expectedEditRevision: 1, replacementText: "Mới", voiceId: "v", durationPolicy: "ripple" });
  fireEvent.change(screen.getByLabelText("Nội dung Patch"), { target: { value: "Khác" } });
  expect(screen.getByText("Áp dụng bản vá")).toBeDisabled();
  fireEvent.click(screen.getByText("Dùng thông số bản nghe thử đã lưu"));
  fireEvent.click(screen.getByText("Áp dụng bản vá"));
  await waitFor(() => expect(onOutputReady).toHaveBeenCalledWith(expect.objectContaining({ id: "new" })));
});

it("sends native source-duration policy and prevents applying a preview for another policy", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ processingAvailable: true, draftRevision: 3, blockers: [] }))
    .mockResolvedValueOnce(reply({ ...job, durationPolicy: "source", targetFrames: 24000 }));
  vi.stubGlobal("fetch", fetcher);
  render(<PatchProcessing projectId="p" document={document} currentSource saved voices={voices} />);
  fireEvent.change(screen.getByLabelText("Thời lượng bản vá"), { target: { value: "source" } });
  fireEvent.click(screen.getByText("Kiểm tra khả năng Patch"));
  await waitFor(() => expect(screen.getByText("Tạo bản vá nghe thử")).toBeEnabled());
  fireEvent.click(screen.getByText("Tạo bản vá nghe thử"));
  await screen.findByLabelText("Nghe bản ghép Patch");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).durationPolicy).toBe("source");
  expect(screen.getByText("Áp dụng bản vá")).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Thời lượng bản vá"), { target: { value: "ripple" } });
  expect(screen.getByText("Áp dụng bản vá")).toBeDisabled();
  fireEvent.click(screen.getByText("Dùng thông số bản nghe thử đã lưu"));
  expect(screen.getByLabelText("Thời lượng bản vá")).toHaveValue("source");
});
it("restores a running job for Stop and never revives it from an older poll", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ processingAvailable: true, draftRevision: 3, blockers: [], latestJob: { ...job, status: "running" } }))
    .mockResolvedValueOnce(reply({ ...job, status: "cancelled" }));
  vi.stubGlobal("fetch", fetcher);
  render(<PatchProcessing projectId="p" document={document} currentSource saved voices={voices} />);
  fireEvent.click(screen.getByText("Kiểm tra khả năng Patch"));
  fireEvent.click(await screen.findByText("Dừng tạo bản vá"));
  await screen.findByText("1/1 · cancelled");
  expect(fetcher.mock.calls[1][0]).toBe("/api/projects/p/voice-patch/jobs/j/stop");
  expect(screen.getByText("Áp dụng bản vá")).toBeDisabled();
});
it("does not open a late Apply response after source UI unmounts", async () => {
  let finish!: (value: ReturnType<typeof reply>) => void;
  const callback = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ processingAvailable: true, draftRevision: 3, blockers: [], latestJob: job }))
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })));
  const view = render(<PatchProcessing projectId="p" document={document} currentSource saved voices={voices} onOutputReady={callback} />);
  fireEvent.click(screen.getByText("Kiểm tra khả năng Patch"));
  await waitFor(() => expect(screen.getByText("Áp dụng bản vá")).toBeEnabled());
  fireEvent.click(screen.getByText("Áp dụng bản vá")); view.unmount();
  finish(reply({ output: { id: "late", duration: 1 }, audioUrl: "/late" }));
  await Promise.resolve(); await Promise.resolve();
  expect(callback).not.toHaveBeenCalled();
});

it("pins the trained model to a separate hybrid endpoint without clone fallback", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ processingAvailable: true, draftRevision: 3, blockers: [] }))
    .mockResolvedValueOnce(reply({ ...job, voiceId: "v" }));
  vi.stubGlobal("fetch", fetcher);
  render(<PatchProcessing projectId="p" document={document} currentSource saved voices={voices} mode="hybrid" />);
  expect(screen.queryByText("Giọng từ vùng tham chiếu · clone")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Kiểm tra khả năng Patch"));
  await waitFor(() => expect(screen.getByText("Tạo bản vá nghe thử")).toBeEnabled());
  fireEvent.click(screen.getByText("Tạo bản vá nghe thử"));
  await screen.findByLabelText("Nghe bản ghép Patch");
  expect(fetcher.mock.calls[1][0]).toBe("/api/projects/p/voice-patch/hybrid/jobs");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).voiceId).toBe("v");
});
