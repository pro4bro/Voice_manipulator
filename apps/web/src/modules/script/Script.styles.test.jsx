import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ScriptEditor } from "./ScriptEditor";
import { ChannelScript } from "./ChannelScript";
import { ObsLiveLinkScript } from "./ObsLiveLinkScript";
import { VoiceScript } from "./VoiceScript";
import { ScriptSourceText } from "./ScriptSourceText";
import { act } from "@testing-library/react";
import { publishPlaybackWords } from "../../domain/playback-sync";

it("shares the two-column text viewport and keeps playback paint separate from editable selection", () => {
  const sheet = document.createElement("style");
  sheet.textContent = ["../../styles/modules.css", "./script-transcript-layout.css", "./script-text-view.css"]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf-8")).join("\n");
  document.head.append(sheet);
  try {
    const view = render(<ScriptSourceText source={{ id: "source", name: "Track", text: "Xin chào", words: [{ text: "Xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }] }} />);
    act(() => publishPlaybackWords({ source: 1 }));
    const field = screen.getByRole("textbox");
    const row = field.querySelector("[data-script-text-row]");
    const cell = row.querySelector("[data-script-text-dialogue]");
    expect(getComputedStyle(row).display).toBe("grid");
    expect(getComputedStyle(cell).whiteSpace).toBe("pre-wrap");
    expect(cell).toHaveAttribute("data-playback-active", "true");
    expect(view.container.querySelector(".script-source-playback-layer")).toBeNull();
    expect(getComputedStyle(view.container.querySelector(".transcript-text-editor")).flexGrow).toBe("1");
    expect(getComputedStyle(view.container.querySelector(".script-text-scroll")).overflow).toBe("auto");
    expect(field).toHaveTextContent("Xin chào");
  } finally { act(() => publishPlaybackWords({})); sheet.remove(); }
});

it.each(["import", "obs"])("uses the footage word spacing for %s channel transcripts", (origin) => {
  const sheet = document.createElement("style");
  sheet.textContent = ["../../styles/modules.css", "./script-transcript-layout.css"]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf-8")).join("\n");
  document.head.append(sheet);
  const words = [{ text: "Xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }];
  try {
    const view = render(<><ScriptEditor value="Xin chào" words={words} workflow="speech-to-text" onChange={vi.fn()} />
      <ChannelScript tracks={[{ id: "a", name: "Track 1", text: "Xin chào", words,
        ...(origin === "obs" ? { obsRecordingId: "recording" } : { sourceArchiveAssetId: "parent" }) }]} onSelectTrack={vi.fn()} /></>);
    const buttons = [...view.container.querySelectorAll(".script-table__word")];
    const ordinary = buttons.slice(0, 2), channels = buttons.slice(2);
    channels.forEach((button, index) => {
      expect(button.parentElement).toHaveClass("script-table__word-wrap");
      expect(getComputedStyle(button.parentElement).display).toBe("inline-block");
      expect(button.parentElement.textContent).toBe(ordinary[index].parentElement.textContent);
      for (const property of ["padding", "margin", "lineHeight", "font", "letterSpacing", "wordSpacing"]) {
        expect(getComputedStyle(button)[property]).toBe(getComputedStyle(ordinary[index])[property]);
      }
    });
    const contents = view.container.querySelectorAll(".script-table__content");
    expect(getComputedStyle(contents[1]).lineHeight).toBe(getComputedStyle(contents[0]).lineHeight);
    expect(getComputedStyle(contents[1]).fontFamily).toBe(getComputedStyle(contents[0]).fontFamily);
  } finally { sheet.remove(); }
});

it.each(["footage", "channels", "live", "voice"])("keeps the checkbox 30 percent smaller, beside the speaker, in %s", (source) => {
  const sheet = document.createElement("style");
  sheet.textContent = ["../../styles/modules.css", "./script-transcript-layout.css", "./script-selection.css"]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf-8")).join("\n");
  document.head.append(sheet);
  const words = [{ text: "Xin", start: 1, end: 2 }];
  try {
    const view = source === "footage" ? render(<ScriptEditor value="Xin" words={words} workflow="speech-to-text" onChange={vi.fn()} onWordsChange={vi.fn()} />)
      : source === "channels" ? render(<ChannelScript tracks={[{ id: "a", name: "Track 1", text: "Xin", words }]} onSelectTrack={vi.fn()} />)
      : source === "voice" ? render(<VoiceScript rows={[{ id: "row", text: "Xin", voiceId: null, speakerProfileId: null }]} speakers={[]} voices={[]} category="clone" output={null} playbackId={null} onRowsChange={vi.fn()} onRead={vi.fn()} />)
      : render(<ObsLiveLinkScript embedded rows={[{ recordingId: "r", channelId: "a", alias: "Track 1", utteranceId: "u", startSeconds: 1, endSeconds: 2, firstEventRevision: 1, text: "Xin", pending: "", status: "final" }]} recordingId="r" playheadSeconds={0} error={null} onSeek={vi.fn()} />);
    const cell = view.container.querySelector(".script-table__speaker");
    expect(getComputedStyle(cell).gridTemplateColumns).toBe("16.8px minmax(0, 1fr)");
    const tick = view.container.querySelector(".script-table__row-select");
    const before = [getComputedStyle(tick).width, getComputedStyle(tick).height];
    expect(before).toEqual(["16.8px", "16.8px"]);
    fireEvent.click(tick);
    expect(tick).toHaveAttribute("aria-pressed", "true");
    expect([getComputedStyle(tick).width, getComputedStyle(tick).height]).toEqual(before);
    fireEvent.click(tick);
    expect(tick).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Row 1")).toBeInTheDocument();
  } finally { sheet.remove(); }
});
