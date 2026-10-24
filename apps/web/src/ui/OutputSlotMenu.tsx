import type { ReactNode } from "react";
import { WordContextMenu } from "./WordContextMenu";
import "./output-slot-menu.css";

export interface OutputSlotMenuAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
}

export interface OutputSlotMenuProps {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  actions: OutputSlotMenuAction[];
}

/** Right-click actions for finished-product slots. Only supplied, supported actions are shown. */
export function OutputSlotMenu({ x, y, label, onClose, actions }: OutputSlotMenuProps) {
  return <WordContextMenu x={x} y={y} onClose={onClose} aria-label={`Actions for ${label}`} className="output-slot-menu">
    <header><span>OUTPUT SLOT</span><b title={label}>{label}</b></header>
    <footer>{actions.map((action) => <button
      key={action.id}
      type="button"
      role="menuitem"
      disabled={action.disabled}
      className={action.destructive ? "output-slot-menu__destructive" : undefined}
      onClick={() => { onClose(); action.onSelect(); }}
    >{action.icon}<span>{action.label}</span></button>)}</footer>
  </WordContextMenu>;
}
