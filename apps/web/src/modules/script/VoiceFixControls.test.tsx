import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VoiceFixControls } from "./VoiceFixControls";

afterEach(() => vi.unstubAllGlobals());
const plan = { key: "snapshot", scriptRevision: 3, editRevision: 1, dirtyCount: 1, blockers: [], units: [{ rowId: "r", text: "Xin chào", desiredKey: "clip", status: "dirty" }] };
const props = { projectId: "p", outputId: "o", scriptRevision: 3, editRevision: 1, saved: true };
const response = (body: object) => ({ ok: true, json: async () => body });

it("starts Fix with the inspected revisions and never presents generated units as applied audio", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(plan)).mockResolvedValueOnce(response({ id: "j", status: "complete", done: 1, total: 1, units: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<VoiceFixControls {...props} />);
  fireEvent.click(screen.getByText("Kiểm tra phần cần sửa"));
  fireEvent.click(await screen.findByRole("button", { name: "Fix Voice Generated" }));
  await screen.findByText(/Đã tạo các clip sửa/);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ expectedKey: "snapshot", expectedScriptRevision: 3, expectedEditRevision: 1 });
});

it("reports no-op and blocks unsupported units before inference", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ ...plan, dirtyCount: 0, units: [] })).mockResolvedValueOnce(response({ ...plan, blockers: ["Whisper chưa hỗ trợ"] }));
  vi.stubGlobal("fetch", fetcher);
  render(<VoiceFixControls {...props} />);
  fireEvent.click(screen.getByText("Kiểm tra phần cần sửa"));
  expect(await screen.findByText(/Không có câu nào cần tạo lại/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Fix Voice Generated" })).toBeDisabled();
  fireEvent.click(screen.getByText("Kiểm tra phần cần sửa"));
  await screen.findByText("Whisper chưa hỗ trợ");
  expect(screen.getByRole("button", { name: "Fix Voice Generated" })).toBeDisabled();
});

it("discards inspection arriving after output changes", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
  const view = render(<VoiceFixControls {...props} />);
  fireEvent.click(screen.getByText("Kiểm tra phần cần sửa"));
  view.rerender(<VoiceFixControls {...props} outputId="other" />);
  finish(response(plan));
  await waitFor(() => expect(screen.queryByText("Xin chào")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Fix Voice Generated" })).toBeDisabled();
});

it("restores a queued job from inspection and polls it to completion", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ ...plan, latestJob: { id: "j", status: "queued", done: 0, total: 1, units: [] } }))
    .mockResolvedValueOnce(response({ id: "j", status: "complete", done: 1, total: 1, units: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<VoiceFixControls {...props} />);
  fireEvent.click(screen.getByText("Kiểm tra phần cần sửa"));
  await screen.findByText("Dừng ngay");
  expect(screen.getByRole("button", { name: "Fix Voice Generated" })).toBeDisabled();
  await screen.findByText(/Đã tạo các clip sửa/);
  expect(fetcher.mock.calls[1][0]).toContain("/jobs/j");
});

it("keeps the accepted job controllable when Script changes during Start", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(response(plan)).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<VoiceFixControls {...props} />);
  fireEvent.click(screen.getByText("Kiểm tra phần cần sửa"));
  fireEvent.click(await screen.findByRole("button", { name: "Fix Voice Generated" }));
  view.rerender(<VoiceFixControls {...props} scriptRevision={4} />);
  finish(response({ id: "j", status: "queued", done: 0, total: 1, units: [] }));
  await screen.findByText("Dừng ngay");
  expect(screen.getByRole("button", { name: "Fix Voice Generated" })).toBeDisabled();
});

it("does not let an older Stop acknowledgement revive a cancelled job", async () => {
  let finishOldStop!: (value: ReturnType<typeof response>) => void;
  const job = { id: "j", status: "running", done: 0, total: 1, units: [], updatedAt: "2026-10-16T01:00:00Z" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ...plan, latestJob: job }))
    .mockImplementationOnce(() => new Promise((resolve) => { finishOldStop = resolve; }))
    .mockResolvedValueOnce(response({ ...job, status: "cancelled", updatedAt: "2026-10-16T01:00:02Z" })));
  render(<VoiceFixControls {...props} />);
  fireEvent.click(screen.getByText("Kiểm tra phần cần sửa"));
  fireEvent.click(await screen.findByText("Dừng sau câu này"));
  fireEvent.click(screen.getByText("Dừng ngay"));
  await screen.findByText(/0\/1 câu · cancelled/);
  finishOldStop(response({ ...job, updatedAt: "2026-10-16T01:00:01Z" }));
  await waitFor(() => expect(screen.queryByText("Dừng ngay")).not.toBeInTheDocument());
});
