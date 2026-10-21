import { describe, expect, it } from "vitest";
import { emptyLipSync, visibleClipAt, duplicateClip, splitClip, compositionLength } from "./lipsync";

describe("LipSync composition", () => {
  it("shows top enabled layer, returns underlying cuts and preserves source mapping on split/duplicate", () => {
    const document = { ...emptyLipSync(), layers: [{ id: "a", name: "A", enabled: true }, { id: "b", name: "B", enabled: true }], clips: [
      { id: "bottom", assetId: "source-b", layerId: "b", start: 0, inPoint: 2, outPoint: 12 },
      { id: "top", assetId: "source-a", layerId: "a", start: 3, inPoint: 4, outPoint: 7 },
    ] };
    expect(visibleClipAt(document, 2)?.id).toBe("bottom");
    expect(visibleClipAt(document, 3)?.id).toBe("top");
    expect(visibleClipAt(document, 6)?.id).toBe("bottom");
    expect(visibleClipAt(document, 10)).toBeNull();
    const split = splitClip(document, "top", 4, "cut");
    expect(split.clips.find((item) => item.id === "cut")).toMatchObject({ start: 4, inPoint: 5, outPoint: 7 });
    expect(splitClip(document, "top", 3, "bad")).toBe(document);
    const doubled = duplicateClip(document, "bottom", "copy");
    expect(doubled.clips.at(-1)).toMatchObject({ start: 10, inPoint: 2, outPoint: 12 });
    expect(compositionLength(doubled)).toBe(20);
    expect(document.clips).toHaveLength(2);
    expect(visibleClipAt({ ...document, layers: [{ ...document.layers[0], enabled: false }, document.layers[1]] }, 4)?.id).toBe("bottom");
  });
});
