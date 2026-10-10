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
      expect(getComputedStyle(word).overflow).toBe("visible");
      expect(word.querySelector(".timeline-word__label")).toHaveTextContent("trong");
      expect([word.style.left, word.style.width, neighbour.style.left, neighbour.style.width]).toEqual(original);
      expect(onWordsChange).not.toHaveBeenCalled();
      expect(words).toEqual([{ text: "trong", start: .3, end: .4 }, { text: "lúc", start: .4, end: .6 }]);
    } finally { styles.remove(); }
  });

});
