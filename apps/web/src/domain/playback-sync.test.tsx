import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { activePlaybackWordAt, publishPlaybackWords, usePlaybackPublisher, usePlaybackWord } from "./playback-sync";

afterEach(() => publishPlaybackWords({}));

it("uses the latest onset in overlaps, retains source indexes, and leaves silence unhighlighted", () => {
  const words = [{ start: 0, end: 8 }, { start: 2, end: 3 }, { start: 2, end: 4 }, { start: 1, end: 1.5 }];
  expect([-.1, 0, 1.2, 2, 3, 4, 8, NaN].map((time) => activePlaybackWordAt(words, time))).toEqual([-1, 0, 3, 2, 2, 0, -1, -1]);
  expect(activePlaybackWordAt([{ start: NaN, end: 5 }, { start: 2, end: 2 }], 2)).toBe(-1);
});

function Clock({ words }: { words: Record<string, number> | null }) { usePlaybackPublisher(words); return null; }
function Consumer() { const active = usePlaybackWord("a"); return <output>{active}</output>; }

it("does not reset the focused clock when its parent suspends or unmounts", () => {
  const pair = (parent: boolean, suspended: boolean) => <>{parent && <Clock key="parent" words={suspended ? null : { a: 0, b: 2 }} />}
    <Clock key="focused" words={{ a: 8 }} /><Consumer /></>;
  const view = render(pair(true, false));
  expect(screen.getByRole("status")).toHaveTextContent("8");
  view.rerender(pair(true, true));
  expect(screen.getByRole("status")).toHaveTextContent("8");
  view.rerender(pair(false, true));
  expect(screen.getByRole("status")).toHaveTextContent("8");
  act(() => view.rerender(<Consumer />));
  expect(screen.getByRole("status")).toHaveTextContent("-1");
});
