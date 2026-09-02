/**
 * One selection model, shared by the Script table and the Timeline.
 *
 * Both modules used to keep their own selected set with their own rules, which
 * is why Ctrl and Shift disagreed between them and why a selection made in one
 * was invisible in the other. The rules live here, as pure functions, so there
 * is one answer to "what is selected" and it can be tested without a browser.
 */

export interface WordSelection {
  /** Sorted and unique, so callers can compare and slice without defending. */
  indexes: number[];
  /**
   * The word most recently touched: where a Shift run starts from, and the one
   * the other module scrolls to when the selection is mirrored across.
   */
  anchor: number | null;
}

export interface SelectionModifiers {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export const EMPTY_SELECTION: WordSelection = { indexes: [], anchor: null };

function run(from: number, to: number): number[] {
  const first = Math.min(from, to);
  const last = Math.max(from, to);
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

function union(base: readonly number[], add: readonly number[]): number[] {
  return [...new Set([...base, ...add])].sort((left, right) => left - right);
}

function without(base: readonly number[], remove: readonly number[]): number[] {
  const drop = new Set(remove);
  return base.filter((index) => !drop.has(index));
}

/** True when a gesture should keep building on the current selection. */
export function isAdditive(modifiers: SelectionModifiers): boolean {
  return Boolean(modifiers.ctrl || modifiers.shift || modifiers.alt);
}

/**
 * A click on a word.
 *
 * Every modifier adds to a list rather than starting a new one: Shift adds the
 * run between the last word touched and this one, Ctrl adds or removes this one
 * alone, and Alt turns either into a removal. Only an unmodified click on a word
 * outside the selection starts over - clicking one that is already selected
 * leaves the list alone so it can be dragged.
 */
export function selectWord(
  selection: WordSelection,
  index: number,
  modifiers: SelectionModifiers = {},
): WordSelection {
  if (modifiers.shift && selection.anchor !== null) {
    const span = run(selection.anchor, index);
    return {
      indexes: modifiers.alt ? without(selection.indexes, span) : union(selection.indexes, span),
      anchor: index,
    };
  }
  if (modifiers.alt) {
    return { indexes: without(selection.indexes, [index]), anchor: index };
  }
  if (modifiers.ctrl) {
    const held = selection.indexes.includes(index);
    return {
      indexes: held ? without(selection.indexes, [index]) : union(selection.indexes, [index]),
      anchor: index,
    };
  }
  if (selection.indexes.includes(index)) return { ...selection, anchor: index };
  return { indexes: [index], anchor: index };
}

/**
 * A sweep in progress.
 *
 * `base` is the selection as it stood when the sweep began - held so that a
 * modified sweep adds to or removes from it rather than replacing it, and so
 * that reversing direction mid-sweep recomputes instead of accumulating.
 */
export function sweepTo(
  base: WordSelection,
  origin: number,
  index: number,
  modifiers: SelectionModifiers = {},
): WordSelection {
  const span = run(origin, index);
  if (modifiers.alt) return { indexes: without(base.indexes, span), anchor: index };
  if (modifiers.ctrl || modifiers.shift) return { indexes: union(base.indexes, span), anchor: index };
  return { indexes: span, anchor: index };
}

export function isSelected(selection: WordSelection, index: number): boolean {
  return selection.indexes.includes(index);
}

export function sameSelection(left: WordSelection, right: WordSelection): boolean {
  return (
    left.anchor === right.anchor &&
    left.indexes.length === right.indexes.length &&
    left.indexes.every((index, at) => index === right.indexes[at])
  );
}
