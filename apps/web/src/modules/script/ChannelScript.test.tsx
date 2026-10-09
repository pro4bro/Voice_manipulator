import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { ProjectMediaAsset, SpeakerProfile } from "../../domain/types";
import { ChannelScript } from "./ChannelScript";

it("shows word timing outside the transcript flow and dismisses it on scroll", () => {
  const tracks = [{ id: "a", name: "Mic", text: "Một", words: [{ text: "Một", start: 1, end: 2 }] }] as ProjectMediaAsset[];
  render(<ChannelScript tracks={tracks} onSelectTrack={vi.fn()} />);
  const word = screen.getByRole("button", { name: "Một · 00:01.000–00:02.000" });
  fireEvent.mouseEnter(word);
  const popup = screen.getByRole("tooltip");
  expect(popup).toHaveTextContent("00:01.000–00:02.000");
  expect(popup.parentElement).toBe(document.body);
  expect(word).toHaveTextContent(/^Một$/);
  fireEvent.scroll(screen.getByRole("list", { name: "Lượt nói theo thời gian" }));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("does not invent speech overlaps between independently selected footage", () => {
  const tracks = ["a", "b"].map((id) => ({ id, name: `Footage ${id}`, text: id,
    words: [{ text: id, start: 1, end: 2, timingTrusted: true }] })) as ProjectMediaAsset[];
  render(<ChannelScript tracks={tracks} onSelectTrack={vi.fn()} recordingId="unrelated-obs-recording" />);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /Đến đoạn chồng tiếng/ })).not.toBeInTheDocument();
});

it("assigns individual and selected rows to profiles across selected tracks", () => {
  const tracks = ["a", "b"].map((id) => ({ id, name: id, importSelected: true, text: id,
    words: [{ text: id, start: 0, end: 1, speakerId: "s1" }] })) as ProjectMediaAsset[];
  const speakers = [{ id: "s1", name: "An" }, { id: "s2", name: "Bình" }] as SpeakerProfile[];
  const onAssignWords = vi.fn();
  render(<ChannelScript tracks={tracks} speakers={speakers} onAssignWords={onAssignWords} onSelectTrack={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Speaker Profile của a row 1" }), { target: { value: "s2" } });
  expect(onAssignWords).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Chọn row 1 của a" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Speaker Profile của a row 1" }), { target: { value: "s2" } });
  expect(onAssignWords).toHaveBeenLastCalledWith("a", [0], "s2");
  onAssignWords.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Chọn row 1 của a" }));
  fireEvent.click(screen.getByRole("button", { name: "Chọn row 2 của b" }), { shiftKey: true });
  fireEvent.change(screen.getByRole("combobox", { name: "Gán speaker cho channel rows" }), { target: { value: "s2" } });
  expect(onAssignWords.mock.calls).toEqual([["a", [0], "s2"], ["b", [0], "s2"]]);
});

it("edits an archived channel word on double-click and retains the track's timed-word identity", () => {
  const track = { id: "a", name: "Mic", text: "Xin chào", words: [
    { text: "Xin", start: 0.1, end: 0.4, speakerId: "s1" },
    { text: "chào", start: 0.6, end: 0.9, speakerId: "s1" },
  ] } as ProjectMediaAsset;
  const onWordsChange = vi.fn();
  render(<ChannelScript tracks={[track]} onWordsChange={onWordsChange} onSelectTrack={vi.fn()} />);
  fireEvent.doubleClick(screen.getByRole("button", { name: "Xin · 00:00.100–00:00.400" }));
  const editor = screen.getByRole("textbox", { name: "Sửa text Xin" });
  fireEvent.change(editor, { target: { value: "Thưa" } });
  fireEvent.submit(screen.getByRole("form", { name: "Sửa text Xin" }));
  expect(onWordsChange).toHaveBeenCalledWith("a", [
    expect.objectContaining({ text: "Thưa", timingSource: "user-interpolated", timingTrusted: false, speakerId: "s1" }),
    track.words[1],
  ], "Thưa chào");
  const edited = onWordsChange.mock.calls[0][1][0];
  expect(edited.start).toBeGreaterThanOrEqual(track.words[0].start);
  expect(edited.end).toBeGreaterThan(edited.start);
  expect(edited.end).toBeLessThan(track.words[1].start);
});

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

it("provides a keyboard scrollbar that reaches the end of archived channel rows", () => {
  const words = Array.from({ length: 650 }, (_, index) => ({ text: `word-${String(index).padStart(3, "0")}`, start: index, end: index + 0.4 }));
  render(<ChannelScript tracks={[{ id: "channel", name: "OBS LiveLink · Channel 1", text: "words", words } as ProjectMediaAsset]}
    onSelectTrack={vi.fn()} />);
  const list = screen.getByRole("list", { name: "Lượt nói theo thời gian" });
  const scrollbar = screen.getByRole("scrollbar", { name: "Thanh cuộn Script theo channel" });
  let scrollTop = 0;
  Object.defineProperties(list, {
    scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = Math.max(0, Math.min(3296, value)); } },
    scrollHeight: { configurable: true, get: () => 3496 },
    clientHeight: { configurable: true, get: () => 200 },
  });
  Object.defineProperty(scrollbar, "getBoundingClientRect", { configurable: true,
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: 13, bottom: 100, width: 13, height: 100, toJSON: () => ({}) }) });
  fireEvent.scroll(list);
  fireEvent.keyDown(scrollbar, { key: "End" });
  expect(scrollbar).toHaveAttribute("aria-controls", list.id);
  expect(scrollTop).toBe(3296);
  expect(screen.getByRole("button", { name: /word-649 ·/ })).toBeInTheDocument();
});
