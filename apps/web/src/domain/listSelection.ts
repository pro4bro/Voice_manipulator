/** Selection is separate from the item opened for preview or editing. */
export interface ListSelection {
  ids: string[];
  anchorId: string | null;
}

export function reconcileListSelection(selection: ListSelection, orderedIds: string[]): ListSelection {
  const available = new Set(orderedIds);
  return {
    ids: orderedIds.filter((id) => selection.ids.includes(id)),
    anchorId: selection.anchorId && available.has(selection.anchorId) ? selection.anchorId : null,
  };
}

export function selectListItem(
  selection: ListSelection,
  orderedIds: string[],
  id: string,
  modifiers: { shift?: boolean; toggle?: boolean },
): ListSelection {
  const current = reconcileListSelection(selection, orderedIds);
  const index = orderedIds.indexOf(id);
  if (index < 0) return current;
  if (modifiers.shift) {
    const anchorId = current.anchorId ?? id;
    const anchorIndex = orderedIds.indexOf(anchorId);
    const range = orderedIds.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1);
    const selected = modifiers.toggle ? new Set([...current.ids, ...range]) : new Set(range);
    return { ids: orderedIds.filter((candidate) => selected.has(candidate)), anchorId };
  }
  if (modifiers.toggle) {
    const selected = new Set(current.ids);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    return { ids: orderedIds.filter((candidate) => selected.has(candidate)), anchorId: id };
  }
  return { ids: [id], anchorId: id };
}

export function selectAllListItems(selection: ListSelection, orderedIds: string[]): ListSelection {
  const current = reconcileListSelection(selection, orderedIds);
  return { ids: [...orderedIds], anchorId: current.anchorId ?? orderedIds[0] ?? null };
}
