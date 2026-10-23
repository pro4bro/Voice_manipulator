import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VoiceOutputPanel } from "./VoiceOutputPanel";
import type { VoiceOutput } from "../../domain/types";
import { api } from "../../api/client";

function output(overrides: Partial<VoiceOutput> = {}): VoiceOutput {
  return {
    id: "output-1", name: "An · Xin chào", text: "Xin chào mọi người", voiceId: "voice-1", voiceName: "An · nhái giọng",
    speakerProfileId: "speaker-an", engine: "omnivoice", generatorId: "omnivoice-generate", parameters: {}, duration: 4.2,
    sampleRate: 24000, audioPath: "assets/voice-output/output-1/audio.wav", createdAt: "2026-09-14T08:00:00Z",
    ...overrides,
  };
}

describe("VoiceOutputPanel", () => {
  it("creates an empty session and duplicates the selected output as an independent version", async () => {
    const source = output();
    const copy = output({ id: "output-copy", name: "An · Xin chào · bản sao", audioPath: "assets/voice-output/output-copy/audio.wav" });
    const initial = { revision: 1, activeSessionId: "session-1", activeVersionId: "version-1", sessions: [{ id: "session-1", name: "Session 1", versions: [{ id: "version-1", name: "Version 1", outputId: source.id, parentVersionId: null, createdAt: source.createdAt }] }] };
    const afterCopy = { revision: 2, activeSessionId: "session-1", activeVersionId: "version-2", sessions: [{ ...initial.sessions[0], versions: [...initial.sessions[0].versions, { id: "version-2", name: "Version 2", outputId: copy.id, parentVersionId: "version-1", createdAt: copy.createdAt }] }] };
    const afterSession = { revision: 3, activeSessionId: "session-2", activeVersionId: "version-3", sessions: [...afterCopy.sessions, { id: "session-2", name: "Session 2", versions: [{ id: "version-3", name: "Version 1", outputId: null, parentVersionId: null, createdAt: copy.createdAt }] }] };
    const get = vi.spyOn(api, "getVoiceOutputSessions").mockResolvedValue(initial);
    const createVersion = vi.spyOn(api, "createVoiceOutputVersion").mockResolvedValue({ sessions: afterCopy, output: copy });
    const createSession = vi.spyOn(api, "createVoiceOutputSession").mockResolvedValue(afterSession);
    const onOpen = vi.fn(), onVersionCreated = vi.fn(), onSessionCreated = vi.fn();
    try {
      render(<VoiceOutputPanel projectId="project" activeOutputId={source.id} onDelete={vi.fn()} onOpen={onOpen} onVersionCreated={onVersionCreated} onSessionCreated={onSessionCreated} outputs={[source]} speakers={[]} />);
      fireEvent.click(await screen.findByRole("button", { name: "New Version" }));
      expect(await screen.findByText("Version 2")).toBeInTheDocument();
      expect(createVersion).toHaveBeenCalledWith("project", 1, source.id);
      expect(onVersionCreated).toHaveBeenCalledWith(copy);
      expect(onOpen).toHaveBeenCalledWith(copy);
      fireEvent.click(screen.getByRole("button", { name: "New Session" }));
      expect(await screen.findByText("Session 2")).toBeInTheDocument();
      expect(createSession).toHaveBeenCalledWith("project", 2);
      expect(onSessionCreated).toHaveBeenCalledOnce();
      expect(source.audioPath).toBe("assets/voice-output/output-1/audio.wav");
    } finally { get.mockRestore(); createVersion.mockRestore(); createSession.mockRestore(); }
  });
  it("labels results by the producing function while preserving their saved data", () => {
    const source = output();
    const patch = output({ id: "patched", text: "Lời đã sửa", parameters: { voicePatch: { jobId: "job", sourceOutputId: source.id } } });
    const onOpen = vi.fn();
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={onOpen} outputs={[source, patch]} speakers={[]} />);
    expect(screen.getByRole("button", { name: /VO.*Xin chào mọi người/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /VP.*Lời đã sửa/ }));
    expect(onOpen).toHaveBeenCalledWith(patch);
    expect(source.name).toBe("An · Xin chào");
  });
  it("lists generated speech with its voice and length, and opens it on the Timeline", () => {
    const onOpen = vi.fn();
    render(<VoiceOutputPanel activeOutputId="output-1" onDelete={vi.fn()} onOpen={onOpen} outputs={[output(), output({ id: "output-2", text: "Câu thứ hai" })]} speakers={[]} />);

    expect(screen.getByText("Xin chào mọi người")).toBeInTheDocument();
    expect(screen.getAllByText(/An · nhái giọng · 00:04.2/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Xin chào mọi người/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Câu thứ hai/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "output-2" }));
  });

  it("asks once more before deleting a file for good", () => {
    const onDelete = vi.fn();
    render(<VoiceOutputPanel activeOutputId={null} onDelete={onDelete} onOpen={vi.fn()} outputs={[output()]} speakers={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá An · Xin chào" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xoá hẳn?" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "output-1" }));
  });

  it("exports the chosen Voice Output as WAV, Script-line SRT or trusted-word SRT", () => {
    const onExport = vi.fn();
    const timed = output({
      id: "output-2", name: "Khoa · lời chào",
      segments: [{ rowId: "r1", voiceId: "voice-1", voiceName: "Khoa", speakerProfileId: "speaker-an",
        engine: "omnivoice", generatorId: "omnivoice-generate", text: "Xin chào", start: 0, end: 1 }],
      words: [{ text: "Xin", start: 0, end: 0.4, timingTrusted: true }],
    });
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onExport={onExport} onOpen={vi.fn()} outputs={[output(), timed]} speakers={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Xuất Khoa · lời chào" }));
    const choices = screen.getByRole("group", { name: "Định dạng xuất Khoa · lời chào" });
    fireEvent.click(within(choices).getByRole("button", { name: "SRT dòng" }));
    expect(onExport).toHaveBeenCalledWith(timed, "line");
    fireEvent.click(screen.getByRole("button", { name: "Xuất Khoa · lời chào" }));
    fireEvent.click(screen.getByRole("button", { name: "SRT từ" }));
    expect(onExport).toHaveBeenCalledWith(timed, "word");
    fireEvent.click(screen.getByRole("button", { name: "Xuất Khoa · lời chào" }));
    fireEvent.click(screen.getByRole("button", { name: "WAV" }));
    expect(onExport).toHaveBeenCalledWith(timed, "audio");
  });

  it("keeps WAV and line SRT available when word timings are untrusted", () => {
    const onExport = vi.fn();
    const estimated = output({
      words: [{ text: "Xin", start: 0, end: 0.4, timingTrusted: false }],
      segments: [{ rowId: "r1", voiceId: "voice-1", voiceName: "An", speakerProfileId: "speaker-an",
        engine: "omnivoice", generatorId: "omnivoice-generate", text: "Xin chào", start: 0, end: 1 }],
    });
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onExport={onExport} onOpen={vi.fn()} outputs={[estimated]} speakers={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Xuất An · Xin chào" }));

    expect(screen.getByRole("button", { name: "WAV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "SRT dòng" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "SRT từ" })).toBeDisabled();
  });

  it("selects a range and confirms one bulk deletion", () => {
    const onDeleteMany = vi.fn();
    const outputs = [output(), output({ id: "output-2", name: "B · hai", text: "Câu hai" }), output({ id: "output-3", name: "C · ba", text: "Câu ba" })];
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onDeleteMany={onDeleteMany} onOpen={vi.fn()} outputs={outputs} speakers={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Chọn An · Xin chào" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn C · ba" }), { shiftKey: true });
    expect(screen.getByText("3 đã chọn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xoá đã chọn" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá 3" }));

    expect(onDeleteMany).toHaveBeenCalledWith(outputs);
  });

  it("selects all Voice Output rows with Ctrl+A while the list has focus", () => {
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[output(), output({ id: "output-2", name: "B · hai" })]} speakers={[]} />);
    fireEvent.keyDown(screen.getByRole("region", { name: "Danh sách Voice Output" }), { key: "a", ctrlKey: true });
    expect(screen.getByText("2 đã chọn")).toBeInTheDocument();
  });

  it("says where results will appear before there are any", () => {
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[]} speakers={[]} />);

    expect(screen.getByText(/không lẫn vào Media Pool/)).toBeInTheDocument();
  });

  it("shows and counts a working generated slot before any output is ready", () => {
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[]} pendingOutput={{
      id: "pending-1", name: "An · câu mới", text: "Đang chào mọi người", status: "running", completedRows: 1, totalRows: 3,
    }} speakers={[]} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("An · câu mới")).toBeInTheDocument();
    expect(screen.getByText("Đang chào mọi người")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đang tạo voice · 1/3 dòng");
    expect(screen.getByRole("listitem", { name: /An · câu mới/ })).toHaveAttribute("aria-busy", "true");
  });

  it.each([
    ["error", "Không thể tạo voice"],
    ["cancelled", "Đã huỷ"],
  ] as const)("keeps a %s slot visible without a working animation", (status, label) => {
    const onDismissPendingOutput = vi.fn();
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onDismissPendingOutput={onDismissPendingOutput} onOpen={vi.fn()} outputs={[]} pendingOutput={{
      id: "pending-1", name: "An · câu mới", text: "Đang chào mọi người", status, detail: "Worker đã dừng",
    }} speakers={[]} />);

    const pending = screen.getByRole("listitem", { name: /An · câu mới/ });
    expect(pending).toHaveAttribute("aria-busy", "false");
    expect(pending).not.toHaveClass("is-working");
    expect(within(pending).getByText(label)).toBeInTheDocument();
    expect(within(pending).getByText("Worker đã dừng")).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole("button", { name: "Ẩn trạng thái" }));
    expect(onDismissPendingOutput).toHaveBeenCalledWith("pending-1");
  });

  it("does not count or render a pending slot twice when its ready output is present", () => {
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[output()]} pendingOutput={{
      id: "output-1", name: "An · Xin chào", text: "Xin chào mọi người", status: "running",
    }} speakers={[]} />);

    expect(screen.getByText("1", { selector: ".voice-output-count" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears selection and pending bulk deletion from the blank list canvas", () => {
    render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[output()]} speakers={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn An · Xin chào" }));
    fireEvent.click(screen.getByRole("button", { name: "Xoá đã chọn" }));
    fireEvent.pointerDown(screen.getByRole("region", { name: "Danh sách Voice Output" }));
    expect(screen.queryByText("1 đã chọn")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xác nhận xoá 1" })).not.toBeInTheDocument();
  });
});

it("sends selected generated versions through the context submenu and dismisses on Escape", () => {
  const onSendTo = vi.fn();
  const first = output(), second = output({ id: "output-2", name: "Second", text: "Câu thứ hai" });
  render(<VoiceOutputPanel activeOutputId={null} onDelete={vi.fn()} onOpen={vi.fn()} outputs={[first, second]} speakers={[]} onSendTo={onSendTo} />);
  fireEvent.click(screen.getByRole("button", { name: `Chọn ${first.name}` }));
  fireEvent.click(screen.getByRole("button", { name: "Chọn Second" }), { ctrlKey: true });
  fireEvent.contextMenu(screen.getByText("Câu thứ hai"));
  fireEvent.click(screen.getByRole("menuitem", { name: /Send to/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "LipSync" }));
  expect(onSendTo).toHaveBeenCalledWith("lip-sync", [first, second]);
  expect(screen.queryByRole("menu", { name: "Voice Output actions" })).not.toBeInTheDocument();
  fireEvent.contextMenu(screen.getByText("Câu thứ hai"));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu", { name: "Voice Output actions" })).not.toBeInTheDocument();
});
