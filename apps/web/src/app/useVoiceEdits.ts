import { useEffect, useRef, useState } from "react";
import type { VoiceEditPacket, StretchOperation, VoiceEditController } from "../domain/voice-edits";

async function readPacket(url: string, body?: object): Promise<VoiceEditPacket> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không dựng được preview.");
  return result as VoiceEditPacket;
}

/** Publish audio, words and duration together; a late response cannot revive a cancelled drag. */
export function useVoiceEdits(projectId: string, outputId: string | undefined, scriptRevision: number): VoiceEditController {
  const [packet, setPacket] = useState<VoiceEditPacket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef<VoiceEditPacket | null>(null);
  const serial = useRef(0);
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(outputId ?? "")}/edit`;
  useEffect(() => {
    const version = ++serial.current;
    committed.current = null; setPacket(null); setBusy(false); setError(null);
    if (!outputId) return;
    void readPacket(endpoint).then((result) => {
      if (serial.current === version) { committed.current = result; setPacket(result); }
    }).catch(() => { /* Legacy/unavailable edit endpoint leaves normal playback available. */ });
    return () => { serial.current += 1; };
  }, [endpoint, outputId]);

  async function run(action: "stretch" | "undo" | "redo", operation?: StretchOperation, preview = false) {
    const base = committed.current;
    if (!base || base.document.outputId !== outputId) return false;
    const version = ++serial.current;
    setBusy(true); setError(null);
    try {
      const result = await readPacket(endpoint + (preview ? "/preview" : ""), {
        revision: base.document.revision, scriptRevision, action, operation,
      });
      if (serial.current !== version) return false;
      if (!preview) committed.current = result;
      setPacket(result); return true;
    } catch (reason) {
      if (serial.current === version) { setPacket(committed.current); setError(reason instanceof Error ? reason.message : "Không dựng được preview."); }
      return false;
    } finally { if (serial.current === version) setBusy(false); }
  }
  return { packet, busy, error, preview: (op) => run("stretch", op, true), commit: (op) => run("stretch", op),
    cancel: () => { serial.current += 1; setPacket(committed.current); setBusy(false); setError(null); }, history: (action) => run(action) };
}
