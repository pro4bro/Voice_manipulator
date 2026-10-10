import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ObsLiveLinkTranscriptRow, ProjectMediaAsset, SpeakerProfile } from "../../domain/types";
import { ScriptEditor } from "./ScriptEditor";
import { ChannelScript } from "./ChannelScript";
import { ObsLiveLinkScript } from "./ObsLiveLinkScript";
import { VoiceScript } from "./VoiceScript";
import { SCRIPT_TABLE_LAYOUT_KEY } from "./script-transcript-layout";
beforeEach(() => window.localStorage.clear());

const profile: SpeakerProfile = { id: "an", name: "Anh Vũ", color: "#f00", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, createdAt: "" };
const tracks = ["a", "b"].map((id, index) => ({ id, name: `Track ${index + 1}`, sourceArchiveAssetId: "parent",
  text: "Xin chào", words: [{ text: "Xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }] })) as ProjectMediaAsset[];
const live = { recordingId: "recording", channelId: "a", sourceUuid: "source-a", alias: "Track 1", utteranceId: "utterance",
  startSeconds: 1, endSeconds: 4, status: "final", text: "Xin chào", pending: "", firstEventRevision: 1 } as ObsLiveLinkTranscriptRow;

it.each(["footage", "channels", "live", "voice"])("uses the same transcript table and inline speaker controls for %s", (source) => {
  const view = source === "footage"
    ? render(<ScriptEditor value="Xin chào" words={tracks[0].words} speakers={[profile]} workflow="speech-to-text" onChange={vi.fn()} onWordsChange={vi.fn()} />)
    : source === "channels" ? render(<ChannelScript tracks={tracks} speakers={[profile]} onSelectTrack={vi.fn()} onAssignWords={vi.fn()} />)
    : source === "voice" ? render(<VoiceScript rows={[{ id: "row", text: "Xin chào", speakerProfileId: null, voiceId: null }]} speakers={[profile]} voices={[]} category="clone" output={null} playbackId={null} onRowsChange={vi.fn()} onRead={vi.fn()} />)
    : render(<ObsLiveLinkScript embedded rows={[live]} speakers={[profile]} recordingId="recording" playheadSeconds={0} error={null} onSeek={vi.fn()} />);
  const grid = screen.getByRole("grid");
  expect(within(grid).getAllByRole("columnheader").map((cell) => cell.textContent?.replace("×", "").trim())).toEqual(["SPEAKER", "NỘI DUNG", "TIMESTAMP"]);
  const speakerCell = view.container.querySelector(".script-table__speaker")!;
  const selection = speakerCell.querySelector(".script-row-selection")!;
  const details = speakerCell.querySelector(".script-row-speaker__details")!;
  expect(selection.nextElementSibling).toBe(details);
  expect(details.firstElementChild?.tagName).toBe("SELECT");
  expect(selection.querySelector("small")).toHaveTextContent("1");
  if (source === "channels" || source === "live") {
    expect(details.querySelector(".script-row-speaker__track")).toHaveTextContent("Track 1");
    expect(speakerCell.textContent).not.toMatch(/00:01/);
  }
  expect(view.container.querySelector(".script-table__timestamp code")).toHaveTextContent("IN");
  if (source !== "voice") expect(view.container.querySelector(".script-table__timestamp")).toHaveTextContent("OUT");
});

it("assigns a profile only to checked channel rows and can untick them again", () => {
  const assign = vi.fn();
  render(<ChannelScript tracks={tracks} speakers={[profile]} onSelectTrack={vi.fn()} onAssignWords={assign} />);
  const row = screen.getByRole("button", { name: "Chọn row 1 của Track 1" });
  const select = screen.getByLabelText("Speaker Profile của Track 1 row 1");
  expect(select).toBeEnabled();
  fireEvent.click(row);
  fireEvent.change(select, { target: { value: "an" } });
  expect(assign).toHaveBeenLastCalledWith("a", [0, 1], "an");
  fireEvent.change(select, { target: { value: "" } });
  expect(assign).toHaveBeenLastCalledWith("a", [0, 1], null);
  fireEvent.click(row);
  expect(row).toHaveAttribute("aria-pressed", "false");
  expect(select).toBeEnabled();
  assign.mockClear();
  fireEvent.change(select, { target: { value: "an" } });
  expect(assign).not.toHaveBeenCalled();
});

it("keeps a shared column layout when moving from footage to channels and live OBS", () => {
  window.localStorage.setItem("pro4bro:script-table:old-footage", JSON.stringify([{ id: "old", label: "OLD", width: 999 }]));
  const view = render(<ScriptEditor playbackAssetId="old-footage" value="Xin chào" words={tracks[0].words} speakers={[profile]} workflow="speech-to-text" onChange={vi.fn()} onWordsChange={vi.fn()} />);
  const header = () => view.container.querySelector<HTMLElement>(".script-table__header")!;
  expect(header().style.gridTemplateColumns).toBe("220px 620px 164px 30px 30px");
  const resize = screen.getByRole("button", { name: "Kéo rộng cột NỘI DUNG" });
  fireEvent.pointerDown(resize, { clientX: 100, pointerId: 1 });
  fireEvent.pointerMove(resize, { clientX: 220, pointerId: 1 });
  fireEvent.pointerUp(resize, { clientX: 220, pointerId: 1 });
  expect(header().style.gridTemplateColumns).toBe("220px 740px 164px 30px 30px");
  expect(JSON.parse(window.localStorage.getItem(SCRIPT_TABLE_LAYOUT_KEY)!)[1].width).toBe(740);
  view.rerender(<ChannelScript tracks={tracks} speakers={[profile]} onSelectTrack={vi.fn()} />);
  expect(header().style.gridTemplateColumns).toBe("220px 740px 164px 30px 30px");
  view.rerender(<ObsLiveLinkScript embedded rows={[live]} recordingId="recording" playheadSeconds={0} error={null} onSeek={vi.fn()} />);
  expect(header().style.gridTemplateColumns).toBe("220px 740px 164px 30px 30px");
  expect(window.localStorage.getItem("pro4bro:script-table:old-footage")).toContain("OLD");
});

it("applies shared column changes to another already mounted Script", () => {
  const view = render(<><ChannelScript tracks={tracks} speakers={[profile]} onSelectTrack={vi.fn()} /><ObsLiveLinkScript embedded rows={[live]} recordingId="recording" playheadSeconds={0} error={null} onSeek={vi.fn()} /></>);
  fireEvent.click(screen.getAllByRole("button", { name: "Xóa cột TIMESTAMP" })[0]);
  expect(screen.queryByRole("columnheader", { name: /TIMESTAMP/ })).not.toBeInTheDocument();
  expect([...view.container.querySelectorAll<HTMLElement>(".script-table__header")].map((node) => node.style.gridTemplateColumns)).toEqual(["220px 620px 30px 30px", "220px 620px 30px 30px"]);
});

it("keeps the track label below the inline profile when an individual imported track opens", () => {
  render(<ScriptEditor trackName="Track 4" value="Xin chào" words={tracks[0].words} speakers={[profile]} workflow="speech-to-text" onChange={vi.fn()} onWordsChange={vi.fn()} />);
  const select = screen.getByLabelText("Speaker Profile của row 1");
  expect(select.nextElementSibling).toHaveTextContent("Track 4");
});

it("applies the same text formatting to archived channel rows as ordinary footage", () => {
  const view = render(<ScriptEditor value="Xin chào" speakers={[profile]} workflow="speech-to-text" onChange={vi.fn()} obsFeed={<ChannelScript tracks={tracks} speakers={[profile]} onSelectTrack={vi.fn()} />} feedMode="channels" />);
  fireEvent.click(screen.getByRole("button", { name: "B" }));
  fireEvent.change(screen.getByLabelText("Cỡ chữ Script"), { target: { value: "130" } });
  const document = view.container.querySelector<HTMLElement>(".script-document")!;
  expect(document.style.fontWeight).toBe("700");
  expect(document.style.getPropertyValue("--script-font-adjust")).toBe("1.3");
  expect(screen.getByRole("button", { name: "DẠNG BẢNG" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "EXPORT ▾" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Clear Text" })).toBeDisabled();
});
