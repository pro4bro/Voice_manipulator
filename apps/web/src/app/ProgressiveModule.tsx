import { useDeferredValue } from "react";
import type { ModuleId } from "../domain/types";
import { ModuleRegistry, type StudioContext } from "../modules/registry/ModuleRegistry";
import { ModuleFrame } from "../ui/ModuleFrame";

/** Commit the new selection before constructing the transcript and waveform DOM. */
export function ProgressiveModule({ id, context }: { id: ModuleId; context: StudioContext }) {
  const selection = `${context.workflow}:${context.selectedAssetId}:${context.selectedImportedTrackId}:${context.selectedScriptAssetIds?.join(",") ?? "auto"}:${context.obsTimelineRecordingId}:${context.take?.id}`;
  const readySelection = useDeferredValue(selection);
  if ((id === "script" || id === "timeline") && readySelection !== selection) {
    return <ModuleFrame title={id === "script" ? "Script" : "Timeline"}>
      <p aria-busy="true" role="status">Đang mở footage…</p>
    </ModuleFrame>;
  }
  return <ModuleRegistry context={context} id={id} />;
}
