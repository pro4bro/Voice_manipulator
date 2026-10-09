import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { StudioWord } from "../../domain/types";

type IndexedWord = { index: number; word: StudioWord };
const CHUNK_WORDS = 64;
const MAX_FRAGMENTS = 12;

/** Window visual fragments; all actions retain the original logical speaker row. */
export function useTranscriptWindow<T extends { words: IndexedWord[] }>(
  rows: T[], view: RefObject<HTMLElement | null>, contentWidth = 620, topInset = 0,
) {
  const [viewport, setViewport] = useState({ top: 0, height: 400 });
  const [measurements, setMeasurements] = useState(() => ({
    heights: new Map<string, number>(), chrome: new Map<string, number>(),
  }));
  const pendingTop = useRef<number | null>(null);
  const fragments = useMemo(() => {
    const enabled = rows.reduce((total, row) => total + row.words.length, 0) > 600;
    return rows.flatMap((row, rowIndex) => {
      const size = enabled ? CHUNK_WORDS : Math.max(1, row.words.length);
      const result = [];
      for (let start = 0; start < Math.max(1, row.words.length); start += size) {
        result.push({ row, rowIndex, words: row.words.slice(start, start + size),
          key: `${rowIndex}:${start}`, continuation: start > 0, enabled,
          // Object identity changes during background refresh; geometry depends on text/width.
          measurementKey: JSON.stringify([contentWidth, rowIndex, start,
            row.words.slice(start, start + size).map(({ index, word }) => [index, word.text])]),
        });
      }
      return result;
    });
  }, [rows, contentWidth]);
  const rowKeys = useMemo(() => new Map(fragments.filter((fragment) => !fragment.continuation)
    .map((fragment) => [fragment.rowIndex, fragment.measurementKey])), [fragments]);
  const offsets = useMemo(() => {
    const result = [0];
    for (const fragment of fragments) {
      const characters = fragment.words.reduce((total, item) => total + item.word.text.length + 1, 0);
      const estimate = Math.max(54, Math.ceil(characters * 8 / Math.max(120, contentWidth - 24)) * 32 + 24);
      result.push(result[result.length - 1] + (measurements.heights.get(fragment.measurementKey) ?? estimate)
        + (fragment.continuation ? 0 : measurements.chrome.get(rowKeys.get(fragment.rowIndex)!) ?? 0));
    }
    return result;
  }, [fragments, measurements, contentWidth, rowKeys]);
  const enabled = fragments[0]?.enabled ?? false;
  let first = 0, last = fragments.length;
  if (enabled) {
    let low = 0, high = fragments.length;
    const start = Math.max(0, viewport.top - 200);
    while (low < high) { const middle = (low + high) >>> 1; if (offsets[middle + 1] < start) low = middle + 1; else high = middle; }
    first = Math.min(low, Math.max(0, fragments.length - 1));
    last = first;
    while (last < fragments.length && last - first < MAX_FRAGMENTS && offsets[last] < viewport.top + viewport.height + 200) last++;
    last = Math.max(first + 1, last);
  }
  useLayoutEffect(() => {
    const element = view.current;
    if (!element || !enabled) return;
    // Only this virtualizer owns anchoring. Native anchoring of newly mounted rows
    // otherwise feeds changed spacer heights back into scrollTop.
    const previousAnchor = element.style.overflowAnchor;
    element.style.overflowAnchor = "none";
    const update = () => setViewport((current) => {
      const height = element.clientHeight || 400;
      const top = Math.max(0, element.scrollTop - topInset);
      return current.top === top && current.height === height ? current : { top, height };
    });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => { element.style.overflowAnchor = previousAnchor; element.removeEventListener("scroll", update); observer?.disconnect(); };
  }, [enabled, topInset, view]);
  useLayoutEffect(() => {
    const element = view.current;
    if (!element || pendingTop.current === null) return;
    element.scrollTop = pendingTop.current;
    pendingTop.current = null;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
    const top = Math.max(0, element.scrollTop - topInset);
    const height = element.clientHeight || 400;
    setViewport((current) => current.top === top && current.height === height ? current : { top, height });
  }, [measurements, topInset, view]);
  useLayoutEffect(() => {
    const element = view.current;
    if (!element || !enabled) return;
    const measure = () => {
      const heights = new Map(measurements.heights);
      const chrome = new Map(measurements.chrome);
      let changed = false;
      const byKey = new Map(fragments.map((fragment) => [fragment.key, fragment]));
      element.querySelectorAll<HTMLElement>("[data-transcript-fragment]").forEach((node) => {
        const height = node.getBoundingClientRect().height;
        const fragment = byKey.get(node.dataset.transcriptFragment!);
        if (fragment && height > 0 && Math.abs(height - (heights.get(fragment.measurementKey) ?? 0)) > 1) {
          heights.set(fragment.measurementKey, height); changed = true;
        }
      });
      // Row borders/padding, speaker controls, and OBS overlap controls belong to
      // the logical row, once, rather than to every 64-word visual fragment.
      element.querySelectorAll<HTMLElement>("[data-transcript-row]").forEach((node) => {
        const rowIndex = Number(node.dataset.transcriptRow);
        const rowKey = rowKeys.get(rowIndex);
        if (!rowKey) return;
        const contentHeight = [...node.querySelectorAll<HTMLElement>("[data-transcript-fragment]")]
          .reduce((sum, fragment) => sum + fragment.getBoundingClientRect().height, 0);
        const height = node.getBoundingClientRect().height;
        if (height <= 0 || contentHeight <= 0) return;
        const extra = Math.max(0, height - contentHeight);
        if (Math.abs(extra - (chrome.get(rowKey) ?? 0)) > 1) { chrome.set(rowKey, extra); changed = true; }
      });
      if (!changed) return;
      // Preserve the fragment being read, including its intra-fragment offset.
      const top = Math.max(0, element.scrollTop - topInset);
      let correction = 0;
      for (let index = 0; index < fragments.length && offsets[index + 1] <= top; index++) {
        const fragment = fragments[index];
        const characters = fragment.words.reduce((sum, item) => sum + item.word.text.length + 1, 0);
        const estimate = Math.max(54, Math.ceil(characters * 8 / Math.max(120, contentWidth - 24)) * 32 + 24);
        correction += (heights.get(fragment.measurementKey) ?? estimate)
          - (measurements.heights.get(fragment.measurementKey) ?? estimate);
        if (!fragment.continuation) correction += (chrome.get(rowKeys.get(fragment.rowIndex)!) ?? 0) - (measurements.chrome.get(rowKeys.get(fragment.rowIndex)!) ?? 0);
      }
      if (correction) pendingTop.current = element.scrollTop + correction;
      // Discard old edited/layout versions without clearing unchanged offscreen measurements.
      const keys = new Set(fragments.map((fragment) => fragment.measurementKey));
      for (const key of heights.keys()) if (!keys.has(key)) heights.delete(key);
      for (const key of chrome.keys()) if (!keys.has(key)) chrome.delete(key);
      setMeasurements({ heights, chrome });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    element.querySelectorAll<HTMLElement>("[data-transcript-fragment], [data-transcript-row]").forEach((node) => observer?.observe(node));
    return () => observer?.disconnect();
  }, [enabled, first, last, fragments, measurements, offsets, contentWidth, topInset, rowKeys, view]);
  function reveal(index: number) {
    if (!enabled || !view.current || index < 0) return false;
    const target = fragments.findIndex((fragment) => fragment.words[0]?.index <= index && fragment.words.at(-1)!.index >= index);
    if (target < 0 || target >= first && target < last) return false;
    const top = Math.max(0, offsets[target] - 60);
    view.current.scrollTop = topInset + top;
    setViewport({ top, height: view.current.clientHeight || 400 });
    return true;
  }
  const visible = fragments.slice(first, last);
  const visibleRows: Array<{ row: T; rowIndex: number; fragments: typeof visible }> = [];
  for (const fragment of visible) {
    const previous = visibleRows.at(-1);
    if (previous?.rowIndex === fragment.rowIndex) previous.fragments.push(fragment);
    else visibleRows.push({ row: fragment.row, rowIndex: fragment.rowIndex, fragments: [fragment] });
  }
  // A partial logical row still renders its own chrome; remove that duplicate
  // from the preceding spacer so total scroll height does not grow while browsing.
  return { enabled, visible, visibleRows, top: enabled ? Math.max(0, offsets[first]
      - (fragments[first]?.continuation ? measurements.chrome.get(rowKeys.get(fragments[first].rowIndex)!) ?? 0 : 0)) : 0,
    bottom: enabled ? offsets[fragments.length] - offsets[last] : 0, reveal };
}
