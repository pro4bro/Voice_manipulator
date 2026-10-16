import { useEffect, useRef, useState } from "react";
import type { VoiceEditPacket, StretchOperation, VoiceEditController } from "../domain/voice-edits";

async function readPacket(url: string, body?: object): Promise<VoiceEditPacket> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không dựng được preview.");
  return result as VoiceEditPacket;
}

interface RequestTask {
  version: number;
  url: string;
  body?: object;
  publish: (packet: VoiceEditPacket) => void;
  resolve: (accepted: boolean) => void;
}

/** Publish audio, words and duration together; one request lane prevents stale renders from racing commits. */
export function useVoiceEdits(projectId: string, outputId: string | undefined, scriptRevision: number): VoiceEditController {
  const [packet, setPacket] = useState<VoiceEditPacket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef<VoiceEditPacket | null>(null);
  const serial = useRef(0);
  const active = useRef(false);
  const pending = useRef<RequestTask | null>(null);
  const pump = useRef<() => void>(() => undefined);
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(outputId ?? "")}/edit`;

  pump.current = () => {
    if (active.current || !pending.current) return;
    const task = pending.current;
    pending.current = null;
    if (task.version !== serial.current) { task.resolve(false); pump.current(); return; }
    active.current = true;
    void readPacket(task.url, task.body).then((result) => {
      if (serial.current !== task.version) return false;
      task.publish(result);
      return true;
    }).catch((reason: unknown) => {
      if (serial.current === task.version) {
        setPacket(committed.current);
        setError(reason instanceof Error ? reason.message : "Không dựng được preview.");
      }
      return false;
    }).then((accepted) => {
      task.resolve(accepted);
      active.current = false;
      if (task.version === serial.current && !pending.current) setBusy(false);
      pump.current();
    });
  };

  function enqueue(task: RequestTask) {
    if (pending.current) pending.current.resolve(false);
    pending.current = task;
    setBusy(true);
    pump.current();
  }

  function dropPending() {
    pending.current?.resolve(false);
    pending.current = null;
  }

  useEffect(() => {
    const version = ++serial.current;
    dropPending();
    committed.current = null; setPacket(null); setBusy(false); setError(null);
    if (outputId) enqueue({ version, url: endpoint, publish: (result) => { committed.current = result; setPacket(result); }, resolve: () => undefined });
    return () => { serial.current += 1; dropPending(); };
  }, [endpoint, outputId]);

  function run(action: "stretch" | "undo" | "redo", operation?: StretchOperation, preview = false): Promise<boolean> {
    const base = committed.current;
    if (!base || base.document.outputId !== outputId) return Promise.resolve(false);
    const version = ++serial.current;
    setError(null);
    return new Promise((resolve) => enqueue({
      version,
      url: endpoint + (preview ? "/preview" : ""),
      body: { revision: base.document.revision, scriptRevision, action, operation },
      publish: (result) => {
        if (!preview) committed.current = result;
        setPacket(result);
      },
      resolve,
    }));
  }

  return { packet, busy, error, preview: (op) => run("stretch", op, true), commit: (op) => run("stretch", op),
    cancel: () => { serial.current += 1; dropPending(); setPacket(committed.current); setBusy(false); setError(null); },
    history: (action) => run(action) };
}
