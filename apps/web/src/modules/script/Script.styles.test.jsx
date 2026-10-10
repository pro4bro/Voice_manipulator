import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ScriptEditor } from "./ScriptEditor";
import { ChannelScript } from "./ChannelScript";
import { ObsLiveLinkScript } from "./ObsLiveLinkScript";
import { VoiceScript } from "./VoiceScript";

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
