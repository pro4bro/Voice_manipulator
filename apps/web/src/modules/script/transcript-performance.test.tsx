import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ScriptEditor } from "./ScriptEditor";
import type { StudioWord } from "../../domain/types";
import { Timeline } from "../timeline/Timeline";

const words: StudioWord[] = Array.from({ length: 6000 }, (_, index) => ({
  text: `word${index}`, start: index * .3, end: index * .3 + .28, timingTrusted: true,
}));

it("bounds a long single speaker turn and reaches a far selected word without mounting the whole transcript", async () => {
  const props = { value: words.map((word) => word.text).join(" "), words, workflow: "speech-to-text" as const,
    playbackAssetId: "large", onChange: vi.fn() };
  const view = render(<ScriptEditor {...props} />);
  expect(view.container.querySelectorAll("[data-script-word-index]").length).toBeLessThanOrEqual(768);
  view.rerender(<ScriptEditor {...props} wordSelection={{ indexes: [5500], anchor: 5500 }} />);
  await waitFor(() => expect(view.container.querySelector('[data-script-word-index="5500"]')).toBeInTheDocument());
  fireEvent.doubleClick(screen.getByRole("button", { name: /word5500/ }));
  expect(screen.getByRole("textbox", { name: /Sửa từ word5500/ })).toBeInTheDocument();
});

it("bounds zoomed-out Timeline subtitle DOM while retaining source words", () => {
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 400, right: 1000, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  try {
  const onWordsChange = vi.fn();
  const view = render(<Timeline gain={0} onGainChange={vi.fn()} onWordsChange={onWordsChange} take={{ id: "large", name: "large.wav", url: "/large.wav", duration: 1800, words }} />);
  expect(view.container.querySelectorAll("[data-timeline-word-index]").length).toBeLessThanOrEqual(512);
  expect(view.container.querySelector('[data-timeline-word-index="5500"]')).not.toBeInTheDocument();
  fireEvent.doubleClick(view.container.querySelector(".word-track")!, { clientX: (words[5500].start + .14) / 1800 * 1000, clientY: 20 });
  const editor = screen.getByRole("textbox", { name: "Sửa subtitle" });
  expect(editor).toHaveValue("word5500");
  fireEvent.change(editor, { target: { value: "corrected" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  expect(onWordsChange).toHaveBeenCalled();
  expect(onWordsChange.mock.calls[0][0][5500].text).toBe("corrected");
  expect(onWordsChange.mock.calls[0][0][5499]).toEqual(words[5499]);
  view.rerender(<Timeline gain={0} onGainChange={vi.fn()} wordSelection={{ indexes: [5500], anchor: 5500 }} take={{ id: "short", name: "short.wav", url: "/short.wav", duration: 6, words: words.slice(0, 20) }} />);
  expect(view.container.querySelectorAll("[data-timeline-word-index]")).toHaveLength(20);
  } finally { bounds.mockRestore(); }
});
