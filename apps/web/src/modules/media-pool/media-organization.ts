export interface MediaPoolFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  order: number;
}

export interface MediaPoolAssetPlacement {
  assetId: string;
  folderId: string | null;
  order: number;
}

export interface MediaPoolOrganization {
  schemaVersion: 1;
  folders: MediaPoolFolder[];
  assets: MediaPoolAssetPlacement[];
}

export const EMPTY_MEDIA_POOL_ORGANIZATION: MediaPoolOrganization = {
  schemaVersion: 1,
  folders: [],
  assets: [],
};

export function createMediaPoolFolder(
  organization: MediaPoolOrganization,
  id: string,
  name: string,
  parentFolderId: string | null,
): MediaPoolOrganization {
  const nextOrder = organization.folders
    .filter((folder) => folder.parentFolderId === parentFolderId)
    .reduce((maximum, folder) => Math.max(maximum, folder.order), -1) + 1;
  return {
    ...organization,
    folders: [...organization.folders, { id, name: name.trim(), parentFolderId, order: nextOrder }],
  };
}

export function moveMediaPoolAsset(
  organization: MediaPoolOrganization,
  assetId: string,
  folderId: string | null,
  beforeAssetId: string | null = null,
): MediaPoolOrganization {
  if (assetId === beforeAssetId) return organization;
  const current = organization.assets.find((placement) => placement.assetId === assetId);
  if (!current) return organization;
  const remaining = organization.assets.filter((placement) => placement.assetId !== assetId);
  const siblings = remaining
    .filter((placement) => placement.folderId === folderId)
    .sort((left, right) => left.order - right.order || left.assetId.localeCompare(right.assetId));
  const targetIndex = beforeAssetId ? siblings.findIndex((placement) => placement.assetId === beforeAssetId) : -1;
  const insertAt = targetIndex < 0 ? siblings.length : targetIndex;
  siblings.splice(insertAt, 0, { ...current, folderId, order: 0 });
  const reordered = siblings.map((placement, order) => ({ ...placement, order }));
  const orderById = new Map(reordered.map((placement) => [placement.assetId, placement]));
  return {
    ...organization,
    assets: [
      ...remaining.filter((placement) => placement.folderId !== folderId),
      ...remaining.filter((placement) => placement.folderId === folderId).map((placement) => orderById.get(placement.assetId) ?? placement),
      orderById.get(assetId)!,
    ],
  };
}

export function orderedMediaPoolPlacements(
  organization: MediaPoolOrganization,
  folderId: string | null,
): MediaPoolAssetPlacement[] {
  return organization.assets
    .filter((placement) => placement.folderId === folderId)
    .slice()
    .sort((left, right) => left.order - right.order || left.assetId.localeCompare(right.assetId));
}
