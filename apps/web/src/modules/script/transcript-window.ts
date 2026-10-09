import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { StudioWord } from "../../domain/types";

type IndexedWord = { index: number; word: StudioWord };
const CHUNK_WORDS = 64;
const MAX_FRAGMENTS = 12;

/** Window visual fragments; all actions retain the original logical speaker row. */
export function useTranscriptWindow<T extends { words: IndexedWord[] }>(
  rows: T[], view: RefObject<HTMLElement | null>, contentWidth = 620, topInset = 0,
) {
  const [viewport, setViewport] = useState({ top: 0, height: 400 });
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  const fragments = useMemo(() => {
    const enabled = rows.reduce((total, row) => total + row.words.length, 0) > 600;
    return rows.flatMap((row, rowIndex) => {
      const size = enabled ? CHUNK_WORDS : Math.max(1, row.words.length);
      const result = [];
      for (let start = 0; start < Math.max(1, row.words.length); start += size) {
        result.push({ row, rowIndex, words: row.words.slice(start, start + size),
          key: `${rowIndex}:${start}`, continuation: start > 0, enabled });
      }
      return result;
    });
  }, [rows]);
  useLayoutEffect(() => { setHeights(new Map()); }, [rows, contentWidth]);
  const offsets = useMemo(() => {
    const result = [0];
    for (const fragment of fragments) {
      const characters = fragment.words.reduce((total, item) => total + item.word.text.length + 1, 0);
      const estimate = Math.max(54, Math.ceil(characters * 8 / Math.max(120, contentWidth - 24)) * 32 + 24);
      result.push(result[result.length - 1] + (heights.get(fragment.key) ?? estimate));
    }
    return result;
  }, [fragments, heights, contentWidth]);
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
    const update = () => setViewport((current) => {
      const height = element.clientHeight || 400;
      const top = Math.max(0, element.scrollTop - topInset);
      return current.top === top && current.height === height ? current : { top, height };
    });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => { element.removeEventListener("scroll", update); observer?.disconnect(); };
  }, [enabled, topInset, view]);
  useLayoutEffect(() => {
    const element = view.current;
    if (!element || !enabled) return;
    const measure = () => {
      const changes: Array<[string, number]> = [];
      element.querySelectorAll<HTMLElement>("[data-transcript-fragment]").forEach((node) => {
        const height = node.getBoundingClientRect().height;
        const key = node.dataset.transcriptFragment!;
        if (height > 0 && Math.abs(height - (heights.get(key) ?? 0)) > 1) changes.push([key, height]);
      });
      if (changes.length) setHeights((current) => new Map([...current, ...changes]));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    element.querySelectorAll<HTMLElement>("[data-transcript-fragment]").forEach((node) => observer?.observe(node));
    return () => observer?.disconnect();
  }, [enabled, first, last, fragments, heights, view]);
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
  return { enabled, visible, visibleRows, top: enabled ? offsets[first] : 0,
    bottom: enabled ? offsets[fragments.length] - offsets[last] : 0, reveal };
}
