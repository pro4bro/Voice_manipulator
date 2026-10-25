import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { publishPlaybackWords } from "../../domain/playback-sync";
import type { ProjectVoice, SpeakerProfile, VoiceOutput } from "../../domain/types";
import { Timeline } from "../timeline/Timeline";
import { VoiceScript } from "./VoiceScript";
import { ScriptEditor } from "./ScriptEditor";
import { mapScriptWordsToText } from "./script-text-reconciliation";

afterEach(() => { publishPlaybackWords({}); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps Input highlight when an older Timeline is removed after another Timeline takes over", () => {
  const words = ["one", "two", "three"].map((text, index) => ({ text, start: index, end: index + .9 }));
  const take = { id: "input", name: "input.wav", url: "/input.wav", duration: 3, words };
  const pair = (old: boolean) => <><ScriptEditor value="one two three" words={words} playbackAssetId="input" workflow="speech-to-text" onChange={vi.fn()} />
    {old && <Timeline key="old" take={take} gain={0} onGainChange={vi.fn()} />}
    <Timeline key="current" take={take} gain={0} onGainChange={vi.fn()} /></>;
  const view = render(pair(true));
  const media = [...view.container.querySelectorAll("audio")].at(-1)!;
  media.currentTime = 2.2; fireEvent.timeUpdate(media);
  expect(view.container.querySelector('[data-script-word-index="2"].is-active')).toBeInTheDocument();
  view.rerender(pair(false));
  expect(view.container.querySelector('[data-script-word-index="2"].is-active')).toBeInTheDocument();
  expect(view.container.querySelector('.timeline-word.is-active[data-timeline-word-index="2"]')).toBeInTheDocument();
});

it("does not move a deleted word's clock to its later repeated occurrence", () => {
  const words = ["xin", "bạn", "đi", "xin", "về"].map((text, index) => ({ text, start: index, end: index + 1 }));
  const text = "chào bạn đi xin về";
  const ranges = mapScriptWordsToText(text, words);
  expect(ranges.map((range) => [range.index, text.slice(range.start, range.end)])).toEqual([[1, "bạn"], [2, "đi"], [3, "xin"], [4, "về"]]);
});

it("retains the middle of a long merged turn with distant edits at both ends", () => {
  const words = Array.from({ length: 1200 }, (_, index) => ({ text: `word${index}`, start: index, end: index + .9 }));
  const text = words.map((word, index) => index === 0 || index === 1199 ? "changed" : word.text).join(" ");
  expect(mapScriptWordsToText(text, words).map((range) => range.index)).toEqual(Array.from({ length: 1198 }, (_, index) => index + 1));
});

it.each(["table", "text"])("keeps unchanged words in an edited merged turn synced to Timeline in %s view", (mode) => {
  const highlights = new Map<string, Set<Range>>();
  vi.stubGlobal("CSS", { escape: CSS.escape.bind(CSS), highlights });
  vi.stubGlobal("Highlight", class extends Set<Range> { constructor(...ranges: Range[]) { super(ranges); } });
  const words = ["xin", "bạn", "đi", "xin", "về"].map((text, index) => ({ text, start: index, end: index + .9, segmentIndex: 0 }));
  const output = { id: "edited", duration: 5, words, segments: [{ rowId: "legacy", voiceId: "v", text: "xin bạn đi xin về", start: 0, end: 5 }] } as VoiceOutput;
  const view = render(<><VoiceScript category="clone" rows={[{ id: "r", legacyRowIds: ["legacy"], text: "chào bạn đi xin về", speakerProfileId: "s", voiceId: "v" }]}
    onRowsChange={vi.fn()} onRead={vi.fn()} speakers={[{ id: "s", name: "Speaker" } as SpeakerProfile]} voices={[{ id: "v", speakerProfileId: "s", kind: "clone", engine: "omnivoice" } as ProjectVoice]}
    output={output} playbackId="edited" />
    <Timeline take={{ id: "edited", duration: 5, words, name: "edit.wav", url: "/edit.wav" }} gain={0} onGainChange={vi.fn()} /></>);
  if (mode === "text") fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
  const canvas = view.container.querySelector(".timeline-canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  const head = screen.getByLabelText("Playhead indicator");
  fireEvent.pointerDown(head, { button: 0, pointerId: 4, clientX: 240 });
  for (const index of [1, 4, 2, 3, 1]) {
    fireEvent.pointerMove(head, { pointerId: 4, clientX: (index + .2) * 200 });
    expect(view.container.querySelector(`.timeline-word.is-active[data-timeline-word-index="${index}"]`)).toBeInTheDocument();
    if (mode === "table") expect(view.container.querySelector(`[data-script-word-index="${index}"].is-active`)).toHaveTextContent(words[index].text);
    else {
      expect(view.container.querySelector('[data-script-text-dialogue][data-playback-active="true"]')).toBeInTheDocument();
      expect([...highlights.values()].flatMap((ranges) => [...ranges]).map((range) => range.toString())).toEqual([words[index].text]);
    }
  }
  fireEvent.pointerUp(head, { pointerId: 4, clientX: 240 });
});
