import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { Timeline } from "./Timeline";
import { EMPTY_SELECTION } from "../../domain/word-selection";

function SelectableTimeline(props) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  return <Timeline {...props} onWordSelectionChange={setSelection} wordSelection={selection} />;
}

describe("subtitle trim styling", () => {
  it("mounts grips only on selected words, never on a hovered neighbour, and removes them on deselect", () => {
    const { container } = render(<SelectableTimeline gain={0} onGainChange={() => undefined}
      take={{ id: "selected-grips", name: "grips.wav", duration: 10,
        words: [{ text: "one", start: 1, end: 2 }, { text: "two", start: 3, end: 4 }] }} />);
    const one = screen.getByRole("button", { name: "Subtitle word one" });
    const two = screen.getByRole("button", { name: "Subtitle word two" });
    expect(container.querySelectorAll(".timeline-word__grip")).toHaveLength(0);
    fireEvent.pointerDown(one, { button: 0 }); fireEvent.pointerUp(one, { button: 0 });
    expect(one.querySelectorAll(".timeline-word__grip")).toHaveLength(2);
    fireEvent.pointerEnter(two); fireEvent.mouseOver(two);
    expect(two.querySelectorAll(".timeline-word__grip")).toHaveLength(0);
    expect(one.querySelectorAll(".timeline-word__grip")).toHaveLength(2);
    fireEvent.pointerDown(two, { button: 0 }); fireEvent.pointerUp(two, { button: 0 });
    expect(one.querySelectorAll(".timeline-word__grip")).toHaveLength(0);
    expect(two.querySelectorAll(".timeline-word__grip")).toHaveLength(2);
    fireEvent.pointerDown(container.querySelector(".word-track"), { button: 0, clientX: 900 });
    expect(container.querySelectorAll(".timeline-word__grip")).toHaveLength(0);
  });

  it("places trim grips outside the word label without changing source or neighbouring boxes", () => {
    const styles = document.createElement("style");
    styles.textContent = ["../../styles/modules.css", "./subtitle-density.css"]
      .map((path) => readFileSync(new URL(path, import.meta.url), "utf-8")).join("\n");
    document.head.append(styles);
    try {
      const onWordsChange = vi.fn();
      const words = [{ text: "trong", start: .3, end: .4 }, { text: "lúc", start: .4, end: .6 }];
      render(<SelectableTimeline gain={0} onGainChange={() => undefined} onWordsChange={onWordsChange}
        take={{ id: "grips", name: "grips.wav", duration: 1, words }} />);
      const word = screen.getByRole("button", { name: "Subtitle word trong" });
      const neighbour = screen.getByRole("button", { name: "Subtitle word lúc" });
      const original = [word.style.left, word.style.width, neighbour.style.left, neighbour.style.width];
      fireEvent.pointerDown(word, { button: 0, pointerId: 1 });
      fireEvent.pointerUp(word, { button: 0, pointerId: 1 });
      expect(word).toHaveClass("is-selected");
      const inGrip = getComputedStyle(word.querySelector(".timeline-word__grip--in"));
      const outGrip = getComputedStyle(word.querySelector(".timeline-word__grip--out"));
      expect(Number.parseFloat(inGrip.left) + Number.parseFloat(inGrip.width)).toBeLessThanOrEqual(0);
      expect(Number.parseFloat(outGrip.right) + Number.parseFloat(outGrip.width)).toBeLessThanOrEqual(0);
      // Touching neighbours occupy the same text row. External grips must also
      // sit above it, otherwise the OUT grip covers the next word's first glyph.
      expect(Number.parseFloat(inGrip.top)).toBeLessThan(0);
      expect(Number.parseFloat(inGrip.top) + Number.parseFloat(inGrip.height)).toBeLessThanOrEqual(0);
      expect(Number.parseFloat(outGrip.top) + Number.parseFloat(outGrip.height)).toBeLessThanOrEqual(0);
      expect(getComputedStyle(word).overflow).toBe("visible");
      expect(word.querySelector(".timeline-word__label")).toHaveTextContent("trong");
      expect([word.style.left, word.style.width, neighbour.style.left, neighbour.style.width]).toEqual(original);
      expect(onWordsChange).not.toHaveBeenCalled();
      expect(words).toEqual([{ text: "trong", start: .3, end: .4 }, { text: "lúc", start: .4, end: .6 }]);
    } finally { styles.remove(); }
  });

});
