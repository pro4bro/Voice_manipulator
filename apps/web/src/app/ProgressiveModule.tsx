import { useDeferredValue } from "react";
import type { ModuleId } from "../domain/types";
import { ModuleRegistry, type StudioContext } from "../modules/registry/ModuleRegistry";
import { ModuleFrame } from "../ui/ModuleFrame";

/** Commit the new selection before constructing the transcript and waveform DOM. */
export function ProgressiveModule({ id, context }: { id: ModuleId; context: StudioContext }) {
  // A new composition render is still the same open Version. Deferring each
  // rendered output ID briefly unmounted Script/Timeline and lost their state.
  const source = context.workflow === "voice-manipulator" && context.voiceVersions?.activeVersion
    ? `version:${context.voiceVersions.activeVersion.id}` : context.take?.id;
  const selection = `${context.workflow}:${context.selectedAssetId}:${context.selectedImportedTrackId}:${context.selectedScriptAssetIds?.join(",") ?? "auto"}:${context.obsTimelineRecordingId}:${source}`;
  const readySelection = useDeferredValue(selection);
  if ((id === "script" || id === "timeline") && readySelection !== selection) {
    return <ModuleFrame title={id === "script" ? "Script" : "Timeline"}>
      <p aria-busy="true" role="status">Đang mở footage…</p>
    </ModuleFrame>;
  }
  return <ModuleRegistry context={context} id={id} />;
}
