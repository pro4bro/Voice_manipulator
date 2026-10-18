import { expect, it } from "vitest";
import { placePopup } from "./popup-placement";

it("keeps popup and oversize panels inside all viewport edges including visual viewport offsets", () => {
  for (const viewport of [{ left: 0, top: 0, width: 320, height: 240 }, { left: 100, top: 50, width: 500, height: 300 }]) {
    for (const width of [100, 214, 900]) for (const height of [80, 204, 800]) {
      for (const x of [viewport.left, viewport.left + viewport.width / 2, viewport.left + viewport.width]) {
        for (const y of [viewport.top, viewport.top + viewport.height / 2, viewport.top + viewport.height]) {
          const panel = placePopup({ x, y }, { width, height }, viewport);
          expect(panel.left).toBeGreaterThanOrEqual(viewport.left + 8);
          expect(panel.top).toBeGreaterThanOrEqual(viewport.top + 8);
          expect(panel.left + Math.min(width, viewport.width - 16)).toBeLessThanOrEqual(viewport.left + viewport.width - 8);
          expect(panel.top + Math.min(height, viewport.height - 16)).toBeLessThanOrEqual(viewport.top + viewport.height - 8);
        }
      }
    }
  }
});
it("opens a horizontal submenu on the available side and clamps its vertical position", () => {
  const viewport = { left: 0, top: 0, width: 800, height: 500 }, size = { width: 300, height: 260 };
  expect(placePopup({ x: 0, y: 0 }, size, viewport, { left: 20, right: 234, top: 300 })).toEqual({ left: 238, top: 232, side: "right" });
  expect(placePopup({ x: 0, y: 0 }, size, viewport, { left: 560, right: 774, top: 300 })).toEqual({ left: 256, top: 232, side: "left" });
});
