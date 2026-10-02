import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { ObsLiveLinkTranscriptRow } from "../../domain/types";
import { groupObsSpeechTurns, ObsLiveLinkScript } from "./ObsLiveLinkScript";

it("coalesces one channel across long pauses but splits at another channel's speech", () => {
  const turns = groupObsSpeechTurns([row("a1", "A", 1, "final", "Xin"), row("a2", "A", 2, "final", "chào"),
    row("b1", "B", 3, "final", "Vâng"), row("a3", "A", 4, "final", "Tôi"),
    row("a-listening", "A", 5, "listening", ""), row("a4", "A", 6, "final", "đây"),
    row("a5", "A", 10, "final", "lại")]);
  expect(turns.map((turn) => [turn.first.channelId, turn.text])).toEqual([
    ["A", "Xin chào"], ["B", "Vâng"], ["A", "Tôi đây lại"],
  ]);
});

it("keeps a live track row open while another track interjects during its speech", () => {
  const a1 = { ...row("a1", "A", 1, "final", "Tôi đang"), endSeconds: 3,
    lastSampleIndexExclusive: 3 * 48000 };
  const a2 = { ...row("a2", "A", 3.2, "final", "nói tiếp"), endSeconds: 5,
    lastSampleIndexExclusive: 5 * 48000 };
  const b = { ...row("b", "B", 2, "final", "Vâng"), endSeconds: 4,
    lastSampleIndexExclusive: 4 * 48000 };
  expect(groupObsSpeechTurns([a1, b, a2]).map((turn) => [turn.first.channelId, turn.text, turn.endSeconds]))
    .toEqual([["A", "Tôi đang nói tiếp", 5], ["B", "Vâng", 4]]);
});

it("shows one row through long silence and empty listening events until another channel speaks", () => {
  const onSeek = vi.fn();
  const rows = [row("a1", "A", 1, "final", "Xin"), row("idle-b", "B", 10, "listening", ""),
    row("a2", "A", 60, "final", "chào"), row("b1", "B", 80, "final", "Vâng"),
    row("a3", "A", 100, "final", "tiếp")];
  render(<ObsLiveLinkScript error={null} onSeek={onSeek} playheadSeconds={0} recordingId="recording" rows={rows} />);
  const list = screen.getByRole("list", { name: "Lượt nói theo track OBS" });
  expect([...list.querySelectorAll("li")].map((item) => [item.dataset.channelId, item.textContent?.includes("Xin chào")])).toEqual([
    ["A", true], ["B", false], ["A", false],
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Chọn Channel A tại 00:01" }));
  expect(onSeek).toHaveBeenCalledWith(rows[0]);
});

const row = (id: string, channelId: string, startSeconds: number,
             status: ObsLiveLinkTranscriptRow["status"], text: string): ObsLiveLinkTranscriptRow => ({
  schemaVersion: 1, eventRevision: startSeconds + 1, firstEventRevision: startSeconds + 1,
  recordingId: "recording", channelId, sourceUuid: `source-${channelId}`,
  alias: `Channel ${channelId}`, utteranceId: id, revision: 1,
  firstSampleIndex: startSeconds * 48000, lastSampleIndexExclusive: (startSeconds + 1) * 48000,
  sampleRate: 48000, startSeconds, endSeconds: startSeconds + 1,
  status, text, pending: "", timingTrust: "segment", lagSeconds: 0,
  error: null,
});

it("shows concurrent source rows and seeks the clicked channel sample span", () => {
  const onSeek = vi.fn();
  const rows = [row("a-1", "A", 1, "partial", "A đang nói"),
    row("b-1", "B", 2, "final", "B chen vào"), row("a-2", "A", 4, "final", "A nói tiếp")];
  render(<ObsLiveLinkScript error={null} onSeek={onSeek} playheadSeconds={0} recordingId="recording" rows={rows} />);
  const list = screen.getByRole("list", { name: "Lượt nói theo track OBS" });
  expect(list.querySelectorAll("li")).toHaveLength(3);
  expect([...list.querySelectorAll("li")].map((item) => item.dataset.channelId)).toEqual(["A", "B", "A"]);
  expect(screen.getByText("A đang nói")).toBeInTheDocument();
  expect(screen.getByText("B chen vào")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chọn Channel B tại 00:02" }));
  expect(onSeek).toHaveBeenCalledWith(rows[1]);
  expect(screen.getByText(/Không dùng làm SRT cuối/)).toBeInTheDocument();
});

it("keeps one listening placeholder before any recognized speech", () => {
  render(<ObsLiveLinkScript error={null} onSeek={vi.fn()} playheadSeconds={0} recordingId="recording"
    rows={[row("idle", "A", 1, "listening", "")]} />);
  expect(screen.getByRole("listitem")).toHaveTextContent("Đang nghe…");
});

it("colors both rows only while reviewing their shared segment and seeks each source marker", () => {
  const onSeek = vi.fn();
  const a = { ...row("a", "A", 1, "final", "A nói liên tục"), endSeconds: 5,
    lastSampleIndexExclusive: 5 * 48000 };
  const b = { ...row("b", "B", 2, "partial", "B chen vào rồi nói tiếp"), endSeconds: 7,
    lastSampleIndexExclusive: 7 * 48000 };
  const view = render(<ObsLiveLinkScript error={null} onSeek={onSeek} playheadSeconds={3}
    recordingId="recording" rows={[a, b]} />);
  expect(screen.getByText("A nói liên tục")).toHaveClass("is-overlap");
  expect(screen.getByText("B chen vào rồi nói tiếp")).toHaveClass("is-overlap");
  fireEvent.click(screen.getByRole("button", { name: "Đến đoạn chồng tiếng Channel B từ 00:02.00 đến 00:05.00" }));
  expect(onSeek).toHaveBeenCalledWith(b, 2);
  view.rerender(<ObsLiveLinkScript error={null} onSeek={onSeek} playheadSeconds={5}
    recordingId="recording" rows={[a, b]} />);
  expect(screen.getByText("B chen vào rồi nói tiếp")).not.toHaveClass("is-overlap");
  expect(screen.getByText("A nói liên tục")).not.toHaveClass("is-overlap");
});
