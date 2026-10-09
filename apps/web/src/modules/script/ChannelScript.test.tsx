import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

it("toggles channel row checkboxes on plain clicks while preserving ranges and Ctrl+A", () => {
  const tracks = ["a", "b", "c"].map((id) => ({ id, name: id, text: id,
    words: [{ text: id, start: 0, end: 1, speakerId: "s1" }] })) as ProjectMediaAsset[];
  render(<ChannelScript tracks={tracks} speakers={[{ id: "s1", name: "An" }] as SpeakerProfile[]}
    onAssignWords={vi.fn()} onSelectTrack={vi.fn()} />);
  const rowA = screen.getByRole("button", { name: "Chọn row 1 của a" });
  const rowB = screen.getByRole("button", { name: "Chọn row 2 của b" });
  const rowC = screen.getByRole("button", { name: "Chọn row 3 của c" });
  fireEvent.click(rowA);
  fireEvent.click(rowC, { shiftKey: true });
  expect(rowA).toHaveAttribute("aria-pressed", "true");
  expect(rowB).toHaveAttribute("aria-pressed", "true");
  expect(rowC).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(rowB);
  expect(rowA).toHaveAttribute("aria-pressed", "true");
  expect(rowB).toHaveAttribute("aria-pressed", "false");
  expect(rowC).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(rowB);
  expect(rowB).toHaveAttribute("aria-pressed", "true");
  fireEvent.keyDown(screen.getByRole("list", { name: "Lượt nói theo thời gian" }), { key: "a", ctrlKey: true });
  expect([rowA, rowB, rowC].every((row) => row.getAttribute("aria-pressed") === "true")).toBe(true);
});

it("places the per-row profile selector beside the channel row controls", () => {
  render(<ChannelScript tracks={[{ id: "a", name: "Mic", text: "Xin", words: [
    { text: "Xin", start: 0, end: 1, speakerId: "s1" },
  ] } as ProjectMediaAsset]} speakers={[{ id: "s1", name: "An" }] as SpeakerProfile[]}
  onAssignWords={vi.fn()} onSelectTrack={vi.fn()} />);
  const row = screen.getByRole("listitem");
  const controls = row.querySelector(".channel-script__row-controls");
  expect(controls).toContainElement(screen.getByRole("button", { name: "Chọn row 1 của Mic" }));
  expect(controls).toContainElement(screen.getByRole("combobox", { name: "Speaker Profile của Mic row 1" }));
});

it("clears a channel row instead of reapplying the track's fallback profile", () => {
  const original = { id: "a", name: "Mic", text: "Xin", speakerProfileIds: ["s1"], words: [
    { text: "Xin", start: 0, end: 1, speakerId: "s1", diarizationSpeakerId: "s1" },
  ] } as ProjectMediaAsset;
  function ActualChannelCaller() {
    const [track, setTrack] = useState(original);
    return <ChannelScript tracks={[track]} speakers={[{ id: "s1", name: "An" }] as SpeakerProfile[]}
      onAssignWords={(_trackId, indexes, profileId) => setTrack((current) => ({ ...current, words: current.words.map((word, index) => indexes.includes(index)
        ? { ...word, speakerId: profileId } : word) }))} onSelectTrack={vi.fn()} />;
  }
  render(<ActualChannelCaller />);
  fireEvent.click(screen.getByRole("button", { name: "Chọn row 1 của Mic" }));
  const profile = screen.getByRole("combobox", { name: "Speaker Profile của Mic row 1" });
  fireEvent.change(profile, { target: { value: "" } });
  expect(profile).toHaveValue("");
});

it("keeps explicitly cleared words separate from words inheriting a track profile", () => {
  const track = { id: "a", name: "Mic", text: "Xin chào", speakerProfileIds: ["s1"], words: [
    { text: "Xin", start: 0, end: 0.4, speakerId: null },
    { text: "chào", start: 0.5, end: 0.9 },
  ] } as ProjectMediaAsset;
  render(<ChannelScript tracks={[track]} speakers={[{ id: "s1", name: "An" }] as SpeakerProfile[]}
    onAssignWords={vi.fn()} onSelectTrack={vi.fn()} />);
  const selectors = screen.getAllByRole("combobox", { name: /Speaker Profile của Mic row/ });
  expect(selectors).toHaveLength(2);
  expect(selectors[0]).toHaveValue("");
  expect(selectors[1]).toHaveValue("s1");
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

it("wheels through the OBS 9 turn shape to the final word with measured sidebar controls", () => {
  const tracks = [1, 4].map((channel) => ({ id: `channel-${channel}`, name: `OBS LiveLink · Channel ${channel}`,
    sourceArchiveAssetId: "archive", text: "words", words: [] as { text: string; start: number; end: number; speakerId: string }[] }));
  let clock = 0;
  [31, 3, 3, 833, 12, 49, 17, 40, 7, 141].forEach((count, rowIndex) => {
    const track = tracks[[0, 3, 5, 7, 9].includes(rowIndex) ? 0 : 1];
    for (let index = 0; index < count; index++) track.words.push({ text: `row${rowIndex}-word${index}`,
      start: clock + index * .3, end: clock + index * .3 + .28, speakerId: `speaker-${rowIndex}` });
    clock += count * .3 + 1;
  });
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    let height = 100;
    if (this.hasAttribute("data-transcript-fragment")) height = Math.ceil(this.querySelectorAll(".channel-script-word").length / 16) * 28;
    if (this.hasAttribute("data-transcript-row")) height = Math.max(100,
      [...this.querySelectorAll<HTMLElement>("[data-transcript-fragment]")].reduce((sum, node) => sum + node.getBoundingClientRect().height, 0)) + 20;
    return { top: 0, left: 0, right: 500, bottom: height, width: 500, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  try {
    render(<ChannelScript tracks={tracks as ProjectMediaAsset[]} onAssignWords={vi.fn()} onSelectTrack={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Lượt nói theo thời gian" });
    let position = 0;
    const total = () => [...list.children].reduce((sum, node) => sum + ((node as HTMLElement).hasAttribute("data-transcript-row")
      ? node.getBoundingClientRect().height : Number.parseFloat((node as HTMLElement).style.height) || 0), 0);
    Object.defineProperties(list, {
      scrollTop: { configurable: true, get: () => Math.min(position, Math.max(0, total() - 200)),
        set: (value: number) => { position = Math.max(0, Math.min(total() - 200, value)); } },
      scrollHeight: { configurable: true, get: total }, clientHeight: { configurable: true, get: () => 200 },
    });
    // Warm the preceding measurements, then land in the one-word tail's
    // overscan boundary instead of skipping it with a direct End jump.
    for (let pass = 0; pass < 30 && list.scrollTop < 2020; pass++) {
      list.scrollTop = Math.min(2020, list.scrollTop + 200);
      fireEvent.scroll(list);
    }
    list.scrollTop = 2057;
    fireEvent.scroll(list);
    for (let pass = 0; pass < 30 && list.scrollTop < list.scrollHeight - 200; pass++) {
      list.scrollTop += 200;
      fireEvent.scroll(list);
    }
    fireEvent.keyDown(screen.getByRole("scrollbar"), { key: "End" });
    expect(screen.getByRole("button", { name: /row9-word140 ·/ })).toBeInTheDocument();
    expect(list.scrollTop).toBe(list.scrollHeight - 200);
  } finally { rect.mockRestore(); }
});
