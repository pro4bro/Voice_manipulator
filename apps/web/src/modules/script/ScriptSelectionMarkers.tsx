import { useLayoutEffect, useState, type RefObject } from "react";
import { SelectionMarkers, type SelectionMarker } from "../../ui/SelectionMarkers";

export interface ScriptSelectionMarker { id: string; rowId?: string; wordIndex?: number; label: string }

export function ScriptSelectionMarkers({ viewport, markers }: { viewport: RefObject<HTMLElement | null>; markers: ScriptSelectionMarker[] }) {
  const [positions, setPositions] = useState<SelectionMarker[]>([]);
  function target(marker: ScriptSelectionMarker) {
    if (marker.wordIndex !== undefined) {
      const word = viewport.current?.querySelector<HTMLElement>(`[data-script-word-index="${marker.wordIndex}"]`);
      if (word) return word;
    }
    return Array.from(viewport.current?.querySelectorAll<HTMLElement>("[data-script-row-id]") ?? []).find((node) => node.dataset.scriptRowId === marker.rowId);
  }
  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view) return;
    const measure = () => {
      const rect = view.getBoundingClientRect();
      const next = markers.flatMap((marker) => { const node = target(marker); if (!node) return []; const bounds = node.getBoundingClientRect(); return [{ id: marker.id, label: marker.label, position: (bounds.top - rect.top + view.scrollTop + bounds.height / 2) / Math.max(1, view.scrollHeight) }]; });
      setPositions((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(view); for (const node of view.children) resize?.observe(node);
    const changes = typeof MutationObserver === "undefined" ? null : new MutationObserver(measure);
    changes?.observe(view, { childList: true, subtree: true, characterData: true, attributes: true });
    view.addEventListener("scroll", measure, { passive: true });
    return () => { resize?.disconnect(); changes?.disconnect(); view.removeEventListener("scroll", measure); };
  }, [viewport, markers]);
  return <SelectionMarkers className="script-selection-markers" orientation="vertical" markers={positions} onReveal={(id) => {
    const marker = markers.find((item) => item.id === id), view = viewport.current;
    const node = marker ? target(marker) : null;
    if (!node || !view) return;
    view.scrollTop = Math.max(0, Math.min(view.scrollHeight - view.clientHeight, node.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop - view.clientHeight * .25));
    view.dispatchEvent(new Event("scroll"));
  }} />;
}
