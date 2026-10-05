import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { EmotionLabel, ReadingSession } from "../domain/types";
import type { ReadingMode } from "../domain/reading-plan";
import type { CapturedAudio } from "../modules/recorder/Recorder";

/** Progress changes only when the server confirms a durable session receipt. */
export function useReadingSession(projectId: string, notice: (message: string) => void) {
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [busy, setBusy] = useState(true);
  const [pendingTake, setPendingTake] = useState<CapturedAudio | null>(null);
  const generation = useRef(0);
  const operation = useRef(false);
  const createIntent = useRef<{ key: string; sessionId: string } | null>(null);
  const noticeRef = useRef(notice);
  noticeRef.current = notice;

  useEffect(() => {
    const current = ++generation.current;
    operation.current = true;
    createIntent.current = null;
    setSession(null);
    setPendingTake(null);
    setBusy(true);
    void (async () => {
      try {
        const result = await api.listReadingSessions(projectId);
        if (generation.current === current) setSession(result.items[0] ?? null);
      } catch (error) {
        if (generation.current === current) noticeRef.current(error instanceof Error ? error.message : "Không đọc được phiên đọc đã lưu");
      } finally {
        if (generation.current === current) { operation.current = false; setBusy(false); }
      }
    })();
    return () => { generation.current += 1; };
  }, [projectId]);

  async function change(action: () => Promise<ReadingSession | null>) {
    if (operation.current || pendingTake) return;
    const current = generation.current;
    operation.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (generation.current === current) setSession(result);
    } catch (error) {
      if (generation.current === current) noticeRef.current(error instanceof Error ? error.message : "Không lưu được phiên đọc");
    } finally {
      if (generation.current === current) { operation.current = false; setBusy(false); }
    }
  }

  function start(packId: string, emotions: EmotionLabel[], mode: ReadingMode, speakerProfileId: string) {
    const key = JSON.stringify({ packId, emotions, mode, speakerProfileId });
    if (createIntent.current?.key !== key) createIntent.current = { key, sessionId: crypto.randomUUID() };
    const sessionId = createIntent.current.sessionId;
    return change(() => api.createReadingSession(projectId, { sessionId, packId, emotions, mode, speakerProfileId }));
  }

  function skip() {
    const card = session?.plan.cards[session.cardIndex];
    if (!session || !card) return;
    return change(() => api.skipReadingCard(projectId, session.id, session.revision, card.cardId));
  }

  function end() {
    if (!session) return;
    return change(async () => {
      await api.endReadingSession(projectId, session.id, session.revision);
      return null;
    });
  }

  async function saveTake(captured: CapturedAudio) {
    if (operation.current) throw new Error("Phiên đọc đang lưu. Hãy chờ trước khi lưu bản thu.");
    if (!captured.readingSessionId || !captured.readingCardId || !captured.captureId || captured.readingSessionRevision == null) {
      throw new Error("Bản thu thiếu thông tin phiên đọc.");
    }
    const current = generation.current;
    operation.current = true;
    setBusy(true);
    setPendingTake(captured);
    try {
      const result = await api.appendReadingTake(projectId, captured.readingSessionId, captured.file,
        captured.captureId, captured.readingCardId, captured.readingSessionRevision);
      if (generation.current !== current) return null;
      setSession(result.session);
      setPendingTake(null);
      return result.asset;
    } finally {
      if (generation.current === current) { operation.current = false; setBusy(false); }
    }
  }

  return { session, busy, pendingTake, start, skip, end, saveTake };
}
