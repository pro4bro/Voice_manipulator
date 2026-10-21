import type { WorkspacePage } from "../domain/types";
import "./send-to.css";

export type SendTarget = Extract<WorkspacePage, "voice-training" | "voice-manipulator" | "lip-sync">;
const destinations: Array<[SendTarget, string]> = [["voice-training", "Training"], ["voice-manipulator", "Voice Manipulation"], ["lip-sync", "LipSync"]];
export function SendToMenu({ onSend, disabled = {} }: { onSend: (target: SendTarget) => void; disabled?: Partial<Record<SendTarget, string>> }) {
  return <details className="send-to-menu"><summary role="menuitem" aria-haspopup="menu">Send to <span aria-hidden="true">▸</span></summary><div role="menu" aria-label="Send to">{destinations.map(([target, label]) => <button key={target} role="menuitem" type="button" disabled={!!disabled[target]} title={disabled[target]} onClick={() => onSend(target)}>{label}{disabled[target] ? <small>{disabled[target]}</small> : null}</button>)}</div></details>;
}
