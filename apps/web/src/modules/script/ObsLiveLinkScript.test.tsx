import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { ObsLiveLinkTranscriptRow } from "../../domain/types";
import { ObsLiveLinkScript } from "./ObsLiveLinkScript";

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
    row("b-1", "B", 2, "listening", ""), row("a-2", "A", 4, "final", "A nói tiếp")];
  render(<ObsLiveLinkScript error={null} onSeek={onSeek} playheadSeconds={0} recordingId="recording" rows={rows} />);
  const list = screen.getByRole("list", { name: "Lượt nói theo channel OBS" });
  expect(list.querySelectorAll("li")).toHaveLength(3);
  expect([...list.querySelectorAll("li")].map((item) => item.dataset.channelId)).toEqual(["A", "B", "A"]);
  expect(screen.getByText("A đang nói")).toBeInTheDocument();
  expect(screen.getByText("Đang nghe…")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chọn Channel B tại 00:02" }));
  expect(onSeek).toHaveBeenCalledWith(rows[1]);
  expect(screen.getByText(/Không dùng làm SRT cuối/)).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole("button", { name: "Nghe lại chồng tiếng Channel B từ 00:02.00 đến 00:05.00" }));
  expect(onSeek).toHaveBeenCalledWith(b, 2, 5);
  view.rerender(<ObsLiveLinkScript error={null} onSeek={onSeek} playheadSeconds={5}
    recordingId="recording" rows={[a, b]} />);
  expect(screen.getByText("B chen vào rồi nói tiếp")).not.toHaveClass("is-overlap");
  expect(screen.getByText("A nói liên tục")).not.toHaveClass("is-overlap");
});
