import type { RuntimeAction, RuntimeWorkloadState } from "../domain/types";
import { Icon } from "../ui/Icon";

interface RuntimeMenuItemsProps {
  runtime: RuntimeWorkloadState | null;
  onAction: (action: RuntimeAction) => Promise<void> | void;
}

function runtimeLabel(runtime: RuntimeWorkloadState | null) {
  if (!runtime) return "CHECKING RUNTIME";
  if (runtime.busy) return `${runtime.activeAction?.toUpperCase() ?? "WORKING"}…`;
  if (runtime.overall === "blocked") return "PORT BỊ CHIẾM";
  if (runtime.overall === "running") return "ALL SYSTEMS ON";
  if (runtime.overall === "stopped") return "ALL WORKLOADS OFF";
  return "PARTIAL / NEEDS RESTART";
}

export function RuntimeMenuItems({ runtime, onAction }: RuntimeMenuItemsProps) {
  const busy = !runtime || runtime.busy;
  const allRunning = runtime?.overall === "running";
  const allStopped = runtime?.overall === "stopped";
  const processes = runtime?.processes ?? [];
  const foreign = processes.filter((process) => process.state === "foreign");

  return (
    <>
      <div className={`runtime-menu-state runtime-menu-state--${runtime?.overall ?? "busy"}`} role="status">
        <i />
        <span>{runtimeLabel(runtime)}</span>
        {runtime?.lastError ? <small title={runtime.lastError}>ACTION FAILED</small> : null}
      </div>
      {/* Naming the pid and port turns "something is wrong" into something the
          operator can act on, and matches what the launcher window prints. */}
      {processes.length ? (
        <ul aria-label="Tiến trình đang chạy" className="runtime-menu-processes">
          {processes.map((process) => (
            <li data-state={process.state} key={process.role}>
              <i />
              <b>{process.label}</b>
              <span>{process.state === "foreign" ? "NGOÀI" : process.state === "running" ? "ON" : "OFF"}</span>
              <em>:{process.port}{process.pid ? ` · ${process.pid}` : ""}</em>
            </li>
          ))}
        </ul>
      ) : null}
      {foreign.length ? (
        <p className="runtime-menu-blocked" role="alert">
          {foreign.map((process) => `${process.label} (${process.port})`).join(", ")} đang bị
          process khác giữ. Chạy <b>start-pro4bro.bat stop</b> rồi mở lại.
        </p>
      ) : null}
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
