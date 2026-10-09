import { useLayoutEffect, useRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { StudioWord } from "../../domain/types";
import { useTranscriptWindow } from "./transcript-window";

const words: StudioWord[] = Array.from({ length: 1_280 }, (_, index) => ({
  text: `word${index}`, start: index, end: index + 0.5,
}));
const rows = [{ id: "speaker-1", words: words.map((word, index) => ({ index, word })) }];

function WindowProbe({ topInset }: { topInset: number }) {
  const view = useRef<HTMLDivElement>(null);
  const transcript = useTranscriptWindow(rows, view, 620, topInset);
  useLayoutEffect(() => {
    if (!view.current) return;
    view.current.scrollTop = 850;
    view.current.dispatchEvent(new Event("scroll"));
  }, []);
  return <div aria-label="Script scroll viewport" ref={view}>
    <output data-testid="window-top">{transcript.top}</output>
    <output data-testid="window-first">{transcript.visible[0]?.key}</output>
    {transcript.visible.map((fragment) => <div data-transcript-fragment={fragment.key} key={fragment.key} />)}
  </div>;
}

afterEach(cleanup);

it("subtracts the measured leading notice from virtual row coordinates", () => {
  const withoutInset = render(<WindowProbe topInset={0} />);
  const firstWithoutInset = screen.getByTestId("window-first").textContent;
  const topWithoutInset = screen.getByTestId("window-top").textContent;
  withoutInset.unmount();

  render(<WindowProbe topInset={200} />);
  const firstWithInset = screen.getByTestId("window-first").textContent;
  const topWithInset = screen.getByTestId("window-top").textContent;
  expect(firstWithoutInset).not.toBe(firstWithInset);
  expect(Number(topWithInset)).toBeLessThan(Number(topWithoutInset));
});
