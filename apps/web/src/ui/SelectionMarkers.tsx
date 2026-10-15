import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./selection-markers.css";

export interface SelectionMarker { id: string; position: number; label: string }

/** Positions describe content, never the current viewport or playhead. */
export function SelectionMarkers({ markers, orientation, onReveal, className = "" }: {
  markers: SelectionMarker[]; orientation: "horizontal" | "vertical"; onReveal: (id: string) => void; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [length, setLength] = useState(1000);
  const [menu, setMenu] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const update = () => { const rect = node.getBoundingClientRect(); setLength(Math.max(1, orientation === "horizontal" ? rect.width : rect.height)); };
    update(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node); return () => observer?.disconnect();
  }, [orientation]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node) && !root.current?.contains(event.target as Node)) setMenu(null); };
    window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close);
  }, [menu]);
  const ordered = markers.filter((marker) => Number.isFinite(marker.position)).map((marker) => ({ ...marker, position: Math.max(0, Math.min(1, marker.position)) })).sort((a, b) => a.position - b.position);
  const groups: SelectionMarker[][] = [];
  for (const marker of ordered) {
    const last = groups.at(-1);
    if (last && (marker.position - last[0].position) * length < 10) last.push(marker);
    else groups.push([marker]);
  }
  const reveal = (id: string) => { onReveal(id); setMenu(null); origin.current?.focus(); };
  return <><div aria-label="Điểm sáng vùng chọn" ref={root} className={`selection-markers selection-markers--${orientation} ${className}`}>
    {groups.map((group) => <button key={group[0].id} type="button" className="selection-marker" aria-label={group.length === 1 ? `Đến ${group[0].label}` : `${group.length} vùng chọn gần nhau`} title={group.map((item) => item.label).join("\n")} style={orientation === "horizontal" ? { left: `${group[0].position * 100}%` } : { top: `${group[0].position * 100}%` }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => {
      origin.current = event.currentTarget;
      if (group.length === 1) { reveal(group[0].id); return; }
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ ids: group.map((item) => item.id), x: Math.max(4, Math.min(window.innerWidth - 280, rect.left)), y: Math.max(4, Math.min(window.innerHeight - Math.min(300, group.length * 34), rect.bottom)) });
    }} />)}
  </div>{menu ? createPortal(<div ref={menuRef} className="selection-marker-menu" role="menu" aria-label="Chọn vùng để di chuyển" style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); setMenu(null); origin.current?.focus(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button")); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
  }}>{menu.ids.map((id) => markers.find((marker) => marker.id === id)).filter((marker): marker is SelectionMarker => Boolean(marker)).map((marker) => <button key={marker.id} type="button" role="menuitem" onClick={() => reveal(marker.id)}>{marker.label}</button>)}</div>, document.body) : null}</>;
}
