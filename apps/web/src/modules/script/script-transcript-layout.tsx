import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from "react";
import type { SpeakerProfile } from "../../domain/types";
import "./script-transcript-layout.css";
import "./script-selection.css";

export interface ScriptTableColumn { id: string; label: string; width: number; builtin?: "speaker" | "content" | "timestamp"; }
export const SCRIPT_TABLE_LAYOUT_KEY = "pro4bro:script-table:shared-v1";
const DEFAULT_COLUMNS: ScriptTableColumn[] = [
  { id: "speaker", label: "SPEAKER", width: 220, builtin: "speaker" },
  { id: "content", label: "NỘI DUNG", width: 620, builtin: "content" },
  { id: "timestamp", label: "TIMESTAMP", width: 164, builtin: "timestamp" },
];
function loadColumns(): ScriptTableColumn[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SCRIPT_TABLE_LAYOUT_KEY) ?? "null");
    if (Array.isArray(saved)) {
      const columns = saved.filter((value) => value && typeof value === "object").map((value) => ({
        id: String(value.id ?? ""), label: String(value.label ?? "").trim(), width: Math.max(24, Number(value.width) || 160),
        builtin: ["speaker", "content", "timestamp"].includes(value.builtin) ? value.builtin : undefined,
      })).filter((column) => column.id && column.label) as ScriptTableColumn[];
      if (columns.length) return columns;
    }
  } catch { /* A missing/corrupt local preference uses the common defaults. */ }
  return DEFAULT_COLUMNS.map((column) => ({ ...column }));
}

/** One browser preference for every Project and every transcript source. */
export function useScriptTableLayout() {
  const [columns, setColumns] = useState(loadColumns);
  const resize = useRef<{ id: string; x: number; width: number } | null>(null);
  useEffect(() => {
    const sync = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== SCRIPT_TABLE_LAYOUT_KEY) return;
      setColumns(loadColumns());
    };
    window.addEventListener("storage", sync);
    window.addEventListener(SCRIPT_TABLE_LAYOUT_KEY, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(SCRIPT_TABLE_LAYOUT_KEY, sync); };
  }, []);
  function updateColumns(next: ScriptTableColumn[]) {
    setColumns(next);
    try {
      window.localStorage.setItem(SCRIPT_TABLE_LAYOUT_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SCRIPT_TABLE_LAYOUT_KEY));
    } catch { /* Session layout remains usable if storage is unavailable. */ }
  }
  function resizeColumn(event: PointerEvent<HTMLButtonElement>) {
    const held = resize.current;
    if (!held) return;
    event.preventDefault();
    updateColumns(columns.map((column) => column.id === held.id ? { ...column, width: Math.max(24, held.width + event.clientX - held.x) } : column));
  }
  return {
    columns, gridTemplateColumns: [...columns.map((column) => `${column.width}px`), "30px", "30px"].join(" "),
    beginResize(event: PointerEvent<HTMLButtonElement>, column: ScriptTableColumn) {
      event.preventDefault(); event.stopPropagation();
      resize.current = { id: column.id, x: event.clientX, width: column.width };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }, resizeColumn,
    endResize(event: PointerEvent<HTMLButtonElement>) {
      if (!resize.current) return;
      resizeColumn(event); resize.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    removeColumn(id: string) { if (columns.length > 1) updateColumns(columns.filter((column) => column.id !== id)); },
    addColumn() {
      const label = window.prompt("Tên cột mới", "Thuộc tính")?.trim();
      if (label) updateColumns([...columns, { id: `custom-${Date.now()}-${columns.length}`, label: label.toUpperCase(), width: 180 }]);
    },
  };
}
export type ScriptTableLayout = ReturnType<typeof useScriptTableLayout>;

export function ScriptTranscriptHeader({ layout, headerRef }: { layout: ScriptTableLayout; headerRef?: Ref<HTMLDivElement> }) {
  return <div className="script-table__header" role="row" ref={headerRef} style={{ gridTemplateColumns: layout.gridTemplateColumns }}>
    {layout.columns.map((column) => <div className="script-table__header-cell" role="columnheader" key={column.id}>
      <b>{column.label}</b>
      <button aria-label={`Kéo rộng cột ${column.label}`} className="script-table__resize" onPointerDown={(event) => layout.beginResize(event, column)} onPointerMove={layout.resizeColumn} onPointerUp={layout.endResize} onPointerCancel={layout.endResize} type="button" />
      {layout.columns.length > 1 ? <button aria-label={`Xóa cột ${column.label}`} className="script-table__remove" onClick={() => layout.removeColumn(column.id)} type="button">×</button> : null}
    </div>)}
    <button aria-label="Thêm cột Script" className="script-table__add" onClick={layout.addColumn} type="button" title="Thêm cột">+</button>
  </div>;
}

export function ScriptRowSelection({ number, label, selected, onSelect }: { number: number; label: string; selected: boolean; onSelect: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return <div className="script-row-selection"><button aria-label={label} aria-pressed={selected} className="script-table__row-select" onClick={onSelect} type="button"><span aria-hidden="true">{selected ? "✓" : ""}</span></button><small aria-label={`Row ${number}`}>{number}</small></div>;
}

export function ScriptRowSpeaker({ selection, label, speakerLabel, profileId, profiles, onActivate, onProfileChange, track, extra }: {
  selection: ReactNode; label: string; speakerLabel?: string; profileId: string | null; profiles: SpeakerProfile[];
  onActivate?: () => void; onProfileChange?: (id: string | null) => void; track?: ReactNode; extra?: ReactNode;
}) {
  const profile = profiles.find((item) => item.id === profileId);
  return <div className="script-table__speaker script-row-speaker" role="gridcell">
    {selection}<div className="script-row-speaker__details">
      <select aria-label={label} onFocus={onActivate} onPointerDown={onActivate} value={profile?.id ?? ""} style={{ borderLeftColor: profile?.color }} onChange={(event) => onProfileChange?.(event.target.value || null)}>
        <option value="">Chưa gán Profile</option>{profiles.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
      {extra}
      {track ? <div className="script-row-speaker__track">{track}</div> : null}
      {speakerLabel ? <strong className="script-row-speaker__label">{speakerLabel}</strong> : null}
    </div>
  </div>;
}

export function ScriptTranscriptRow({ columns, gridTemplateColumns, cells, renderCell, selectionFallback, children, ...props }: {
  columns: ScriptTableColumn[]; gridTemplateColumns: string; cells?: Partial<Record<"speaker" | "content" | "timestamp", ReactNode>>;
  renderCell?: (column: ScriptTableColumn) => ReactNode;
  selectionFallback?: ReactNode; children?: ReactNode; className?: string; id?: string; style?: CSSProperties;
  "data-script-row-id"?: string; "data-transcript-row"?: number; "data-channel-id"?: string; "data-utterance-id"?: string;
  "aria-rowindex"?: number;
}) {
  return <div {...props} className={`script-table__row ${props.className ?? ""}`} role="row" style={{ ...props.style, gridTemplateColumns }}>
    {columns.map((column) => <div className="script-table__cell" key={column.id}>{renderCell ? renderCell(column) : column.builtin ? cells?.[column.builtin] : <div className="script-table__custom" role="gridcell">Chưa gán</div>}</div>)}
    <i aria-hidden="true" className="script-table__add-space" />
    <div className="script-table__row-tools">{!columns.some((column) => column.builtin === "speaker") ? selectionFallback : null}{children}</div>
  </div>;
}
