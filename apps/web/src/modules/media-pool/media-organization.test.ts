import { describe, expect, it } from "vitest";

import {
  createMediaPoolFolder,
  moveMediaPoolAsset,
  orderedMediaPoolPlacements,
  type MediaPoolOrganization,
} from "./media-organization";

describe("Media Pool organization", () => {
  const initial: MediaPoolOrganization = {
    schemaVersion: 1,
    folders: [{ id: "folder-a", name: "Audio", parentFolderId: null, order: 0 }],
    assets: [
      { assetId: "one", folderId: null, order: 0 },
      { assetId: "two", folderId: null, order: 1 },
      { assetId: "three", folderId: "folder-a", order: 0 },
    ],
  };

  it("creates nested folders beneath the folder currently being organized", () => {
    const next = createMediaPoolFolder(initial, "folder-b", "Interview", "folder-a");
    expect(next.folders[1]).toEqual({ id: "folder-b", name: "Interview", parentFolderId: "folder-a", order: 0 });
  });

  it("moves a footage into a folder, reorders siblings, and moves it back to root", () => {
    const intoFolder = moveMediaPoolAsset(initial, "two", "folder-a");
    expect(orderedMediaPoolPlacements(intoFolder, "folder-a").map((item) => item.assetId)).toEqual(["three", "two"]);
    const reordered = moveMediaPoolAsset(intoFolder, "two", "folder-a", "three");
    expect(orderedMediaPoolPlacements(reordered, "folder-a").map((item) => item.assetId)).toEqual(["two", "three"]);
    const backAtRoot = moveMediaPoolAsset(reordered, "two", null);
    expect(orderedMediaPoolPlacements(backAtRoot, null).map((item) => item.assetId)).toEqual(["one", "two"]);
  });

  it("ignores a drop onto the same footage row", () => {
    expect(moveMediaPoolAsset(initial, "two", null, "two")).toBe(initial);
  });
});
