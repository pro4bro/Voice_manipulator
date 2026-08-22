import type { ModuleId, WorkspacePage } from "../../domain/types";
import type { ProjectMediaAsset } from "../../domain/types";
import { ControlRack } from "../control-rack/ControlRack";
import { RecentTakes } from "../recent-takes/RecentTakes";
import { Recorder } from "../recorder/Recorder";
import type { CapturedAudio } from "../recorder/Recorder";
import { ScriptEditor } from "../script/ScriptEditor";
import { Timeline, type ActiveTake } from "../timeline/Timeline";
import { TrainingJob } from "../training-job/TrainingJob";
import { VoicePatch } from "../voice-patch/VoicePatch";
import { VoiceVault } from "../voice-vault/VoiceVault";
import { MediaPool } from "../media-pool/MediaPool";

export interface StudioContext {
  workflow: WorkspacePage;
  script: string;
  selectedVoice: string;
  speed: number;
  gain: number;
  take: ActiveTake | null;
  mediaAssets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  mediaBusy: boolean;
  onScriptChange: (value: string) => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (value: number) => void;
  onGainChange: (value: number) => void;
  onTakeChange: (take: CapturedAudio) => void;
  onImportMedia: (files: File[]) => void;
  onSelectAsset: (assetId: string) => void;
  onGenerate: () => void;
  onDeferredAction: (action: string) => void;
}

interface ModuleRegistryProps {
  id: ModuleId;
  context: StudioContext;
}

export function ModuleRegistry({ id, context }: ModuleRegistryProps) {
  switch (id) {
    case "media-pool":
      return (
        <MediaPool
          assets={context.mediaAssets}
          busy={context.mediaBusy}
          onImport={context.onImportMedia}
          onSelect={context.onSelectAsset}
          selectedAssetId={context.selectedAssetId}
        />
      );
    case "voice-vault":
      return <VoiceVault selectedVoice={context.selectedVoice} onSelectVoice={context.onVoiceChange} />;
    case "script":
      return (
        <ScriptEditor
          onChange={context.onScriptChange}
          onDeferredAction={context.onDeferredAction}
          onGenerate={context.onGenerate}
          value={context.script}
          workflow={context.workflow}
        />
      );
    case "control-rack":
      return (
        <ControlRack
          gain={context.gain}
          onGainChange={context.onGainChange}
          onSpeedChange={context.onSpeedChange}
          speed={context.speed}
        />
      );
    case "recorder":
      return <Recorder onRecordingReady={context.onTakeChange} />;
    case "timeline":
      return <Timeline gain={context.gain} onGainChange={context.onGainChange} take={context.take} />;
    case "voice-patch":
      return <VoicePatch hasTake={Boolean(context.take)} />;
    case "training-job":
      return <TrainingJob />;
    case "recent-takes":
      return <RecentTakes />;
    case "voice-generator":
      return null;
  }
}
