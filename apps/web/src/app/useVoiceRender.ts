import { useEffect, useRef, useState } from "react";
import type { VoiceOutput } from "../domain/types";

export interface VoiceRenderPacket { output: VoiceOutput; audioUrl: string; scriptRevision: number; editRevision: number;
  report: { source?: { rmsDbfs?: number | null; peakDbfs?: number | null }; output?: { rmsDbfs?: number | null; peakDbfs?: number | null }; global?: { requestedGainDb: number; appliedGainDb: number; headroomLimited: boolean } } }
export interface VoiceRenderController { packet: VoiceRenderPacket | null; busy: boolean; error: string | null; render: () => Promise<void> }

export function useVoiceRender(projectId: string, outputId: string | undefined, scriptRevision: number, editRevision: number): VoiceRenderController {
  const [packet, setPacket] = useState<VoiceRenderPacket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serial = useRef(0);
  const url = `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(outputId ?? "")}/render`;
  const identity = `${url}:${scriptRevision}:${editRevision}`;
  const latest = useRef(identity); latest.current = identity;
  useEffect(() => {
    const token = ++serial.current; setPacket(null); setError(null); setBusy(false);
    if (!outputId) return;
    void fetch(url).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as VoiceRenderPacket;
      if (serial.current === token && body.scriptRevision === scriptRevision && body.editRevision === editRevision) setPacket(body);
    }).catch(() => undefined);
    return () => { serial.current += 1; };
  }, [identity]);
  async function render() {
    if (!outputId || busy) return;
    const token = ++serial.current, snapshot = identity; setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedScriptRevision: scriptRevision, expectedEditRevision: editRevision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Không render được âm lượng.");
      if (serial.current === token && latest.current === snapshot) setPacket(body as VoiceRenderPacket);
    } catch (reason) { if (serial.current === token && latest.current === snapshot) setError(reason instanceof Error ? reason.message : "Không render được âm lượng."); }
    finally { if (serial.current === token && latest.current === snapshot) setBusy(false); }
  }
  const currentPacket = packet && packet.scriptRevision === scriptRevision && packet.editRevision === editRevision && packet.output.id === outputId ? packet : null;
  return { packet: currentPacket, busy, error, render };
}
