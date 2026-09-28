import { useEffect, useState } from "react";

import { api } from "../../api/client";
import type { ObsLiveLinkTranscriptEvent, ObsLiveLinkTranscriptRow } from "../../domain/types";

export function mergeObsTranscriptRows(current: ObsLiveLinkTranscriptRow[], events: ObsLiveLinkTranscriptEvent[]): ObsLiveLinkTranscriptRow[] {
  if (!events.length) return current;
  const byId = new Map(current.map((row) => [row.utteranceId, row]));
  for (const event of [...events].sort((a, b) => a.eventRevision - b.eventRevision)) {
    if (!event.utteranceId) continue;
    const previous = byId.get(event.utteranceId);
    if (previous && event.revision <= previous.revision) continue;
    byId.set(event.utteranceId, {
      ...event,
      utteranceId: event.utteranceId,
      firstEventRevision: previous?.firstEventRevision ?? event.eventRevision,
      text: event.status === "error" ? previous?.text ?? "" : event.text || (event.status === "final" ? previous?.text ?? "" : ""),
      pending: event.status === "error" ? previous?.pending ?? "" : event.pending,
    });
  }
  return [...byId.values()].sort((a, b) => a.startSeconds - b.startSeconds ||
    a.firstEventRevision - b.firstEventRevision || a.utteranceId.localeCompare(b.utteranceId));
}

export function obsTranscriptText(row: ObsLiveLinkTranscriptRow): string {
  return [row.text, row.pending].filter(Boolean).join(" ").trim();
}

export function useObsLiveLinkTranscript(projectId: string, recordingId: string | null, enabled: boolean) {
  const [rows, setRows] = useState<ObsLiveLinkTranscriptRow[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);

  useEffect(() => {
    setRows([]);
    setPollError(null);
    setSttError(null);
    if (!enabled || !recordingId) return;
    let cancelled = false;
    let inFlight = false;
    let revision = 0;
    const read = () => {
      if (inFlight) return;
      inFlight = true;
      void api.getObsLiveLinkTranscriptEvents(projectId, recordingId, revision)
        .then((snapshot) => {
          if (cancelled || snapshot.recordingId !== recordingId) return;
          revision = Math.max(revision, snapshot.revision);
          setRows((current) => mergeObsTranscriptRows(current, snapshot.events));
          setPollError(null);
          const latest = snapshot.events.at(-1);
          if (latest) setSttError(latest.status === "error" ? latest.error : null);
        })
        .catch((cause) => {
          if (!cancelled) setPollError(cause instanceof Error ? cause.message : "Không đọc được live transcript OBS.");
        })
        .finally(() => { inFlight = false; });
    };
    read();
    const timer = window.setInterval(read, 700);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [projectId, recordingId, enabled]);

  return { rows, error: pollError ?? sttError };
}
