import type { RuntimeAction, RuntimeWorkloadState } from "../domain/types";
import { Icon } from "../ui/Icon";

interface RuntimeMenuItemsProps {
  runtime: RuntimeWorkloadState | null;
  onAction: (action: RuntimeAction) => Promise<void> | void;
}

function runtimeLabel(runtime: RuntimeWorkloadState | null) {
  if (!runtime) return "CHECKING RUNTIME";
  if (runtime.busy) return `${runtime.activeAction?.toUpperCase() ?? "WORKING"}…`;
  if (runtime.overall === "running") return "ALL SYSTEMS ON";
  if (runtime.overall === "stopped") return "ALL WORKLOADS OFF";
  return "PARTIAL / NEEDS RESTART";
}

export function RuntimeMenuItems({ runtime, onAction }: RuntimeMenuItemsProps) {
  const busy = !runtime || runtime.busy;
  const allRunning = runtime?.overall === "running";
  const allStopped = runtime?.overall === "stopped";

  return (
    <>
      <div className={`runtime-menu-state runtime-menu-state--${runtime?.overall ?? "busy"}`} role="status">
        <i />
        <span>{runtimeLabel(runtime)}</span>
        {runtime?.lastError ? <small title={runtime.lastError}>ACTION FAILED</small> : null}
      </div>
      <button disabled={busy || allRunning} onClick={() => void onAction("start")} role="menuitem" type="button">
        <Icon name="power" />Turn on all
      </button>
      <button disabled={busy || allStopped} onClick={() => void onAction("restart")} role="menuitem" type="button">
        <Icon name="refresh" />Restart all
      </button>
      <button className="runtime-menu-stop" disabled={busy || allStopped} onClick={() => void onAction("stop")} role="menuitem" type="button">
        <Icon name="power" />Turn off all
      </button>
    </>
  );
}
