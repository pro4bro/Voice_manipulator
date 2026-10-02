import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { ProjectMediaAsset } from "../../domain/types";
import { ChannelScript } from "./ChannelScript";

it("shows compact OBS labels, timed rows and word-level overlap after detailed STT", () => {
  const tracks = [
    { id: "a", name: "OBS LiveLink · Channel 1", sourceArchiveStreamIndex: 0,
      importSelected: true, text: "Một", words: [{ text: "Một", start: 1, end: 2, timingTrusted: true }] },
    { id: "b", name: "OBS LiveLink · Desktop Audio", sourceArchiveStreamIndex: 1,
      importSelected: true, text: "Hai", words: [{ text: "Hai", start: 1.3, end: 2.2, timingTrusted: true }] },
  ] as ProjectMediaAsset[];
  const onSelectTrack = vi.fn();
  render(<ChannelScript onSelectTrack={onSelectTrack} tracks={tracks} />);

  const rows = screen.getByRole("list", { name: "Lượt nói theo thời gian" });
  expect(rows.querySelectorAll("li")).toHaveLength(2);
  expect(screen.getByText("00:01.00–00:02.00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Một · 00:01.000–00:02.000" })).toHaveAttribute("data-time", "00:01.000–00:02.000");
  expect(screen.getByRole("button", { name: "Đến đoạn chồng tiếng Track 1 từ 00:01.30 đến 00:02.00" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mở Track 2 · Desktop Audio tại 00:01.30" }));
  expect(onSelectTrack).toHaveBeenCalledWith("b");
});

it("selects the same trusted overlap on both archived tracks", () => {
  const tracks = [
    { id: "a", name: "OBS LiveLink · Channel 1", sourceArchiveStreamIndex: 0,
      importSelected: true, text: "Một", words: [{ text: "Một", start: 1, end: 2, timingTrusted: true }] },
    { id: "b", name: "OBS LiveLink · Channel 2", sourceArchiveStreamIndex: 1,
      importSelected: true, text: "Hai", words: [{ text: "Hai", start: 1.3, end: 2.2, timingTrusted: true }] },
  ] as ProjectMediaAsset[];
  const onSelectOverlap = vi.fn();
  const view = render(<ChannelScript onSelectOverlap={onSelectOverlap} onSelectTrack={vi.fn()}
    recordingId="recording" tracks={tracks} />);
  fireEvent.click(screen.getByRole("button", { name: "Đến đoạn chồng tiếng Track 2 từ 00:01.30 đến 00:02.00" }));
  const selection = { recordingId: "recording", startSeconds: 1.3, endSeconds: 2, sourceIds: ["a", "b"] };
  expect(onSelectOverlap).toHaveBeenCalledWith("b", selection);
  view.rerender(<ChannelScript onSelectOverlap={onSelectOverlap} onSelectTrack={vi.fn()}
    recordingId="recording" selectedOverlap={selection} tracks={tracks} />);
  expect(screen.getByRole("button", { name: "Đến đoạn chồng tiếng Track 1 từ 00:01.30 đến 00:02.00" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Đến đoạn chồng tiếng Track 2 từ 00:01.30 đến 00:02.00" })).toHaveAttribute("aria-pressed", "true");
});
