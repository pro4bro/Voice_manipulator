import { describe, expect, it } from "vitest";

import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "./listSelection";

const ORDER = ["a", "b", "c", "d"];
const EMPTY: ListSelection = { ids: [], anchorId: null };

describe("list selection", () => {
  it("selects one item, toggles with Ctrl, and selects a range from the last anchor", () => {
    const one = selectListItem(EMPTY, ORDER, "b", {});
    expect(one).toEqual({ ids: ["b"], anchorId: "b" });
    const two = selectListItem(one, ORDER, "d", { toggle: true });
    expect(two.ids).toEqual(["b", "d"]);
    const range = selectListItem(two, ORDER, "a", { shift: true });
    expect(range).toEqual({ ids: ["a", "b", "c", "d"], anchorId: "d" });
    expect(selectListItem(range, ORDER, "d", { toggle: true }).ids).toEqual(["a", "b", "c"]);
  });

  it("adds a Ctrl+Shift range, selects all visible items, and prunes removed IDs", () => {
    const one = selectListItem(EMPTY, ORDER, "b", {});
    expect(selectListItem(one, ORDER, "d", { shift: true, toggle: true }).ids).toEqual(["b", "c", "d"]);
    expect(selectAllListItems(one, ORDER).ids).toEqual(ORDER);
    expect(reconcileListSelection({ ids: ["a", "c"], anchorId: "c" }, ["b", "c"])).toEqual({ ids: ["c"], anchorId: "c" });
  });
});
