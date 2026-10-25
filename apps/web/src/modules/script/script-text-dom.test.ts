import { expect, it } from "vitest";
import { editableText, scriptTextOffset, scriptTextPosition } from "./script-text-dom";

it("uses one coordinate system for literal, block, break and blank lines", () => {
  const cell = document.createElement("div");
  cell.innerHTML = "Xin<div>chào</div><div><br></div><div>nhé</div>cuối\n";
  expect(editableText(cell)).toBe("Xin\nchào\n\nnhé\ncuối\n");
  for (let offset = 0; offset <= editableText(cell).length; offset += 1) {
    const [node, local] = scriptTextPosition(cell, offset);
    expect(scriptTextOffset(cell, node, local)).toBe(offset);
  }
});
