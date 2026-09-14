import type { ProjectVoice, SpeakerProfile, VoiceOutput, VoiceScriptRow } from "./types";

/** Which voices Voice Manipulator offers, following the kind chosen in Voice Training. */
export type VoiceCategory = "clone" | "train";

export const VOICE_KIND_LABELS: Record<ProjectVoice["kind"], string> = {
  clone: "Nhái giọng",
  lora: "LoRA đã train",
  full: "Full fine-tune",
};

export function voiceCategory(voice: Pick<ProjectVoice, "kind">): VoiceCategory {
  return voice.kind === "clone" ? "clone" : "train";
}

export function voicesInCategory(voices: ProjectVoice[], category: VoiceCategory): ProjectVoice[] {
  return voices.filter((voice) => voiceCategory(voice) === category);
}

export function newRowId(): string {
  return `row-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function emptyRow(after?: VoiceScriptRow | null, text = ""): VoiceScriptRow {
  return { id: newRowId(), speakerProfileId: after?.speakerProfileId ?? null, voiceId: after?.voiceId ?? null, text };
}

/**
 * The voice that reads a row. The one picked, while it is still offered; else
 * the newest voice of the same person in the current kind, so switching
 * between "nhái giọng" and "train giọng" keeps who reads each row.
 */
export function resolveRowVoice(row: VoiceScriptRow, offered: ProjectVoice[]): ProjectVoice | null {
  const picked = row.voiceId ? offered.find((voice) => voice.id === row.voiceId) : undefined;
  if (picked) return picked;
  if (!row.speakerProfileId) return null;
  return newestVoiceOf(row.speakerProfileId, offered);
}

export function newestVoiceOf(speakerProfileId: string, offered: ProjectVoice[]): ProjectVoice | null {
  return offered
    .filter((voice) => voice.speakerProfileId === speakerProfileId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function comparableName(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/giu, "d").trim().toLocaleLowerCase("vi");
}

/** The Script as plain text: one row per line, `Speaker: lời thoại`. */
export function rowsToText(rows: VoiceScriptRow[], speakers: SpeakerProfile[]): string {
  return rows.map((row) => {
    const speaker = speakers.find((item) => item.id === row.speakerProfileId);
    const text = row.text.replace(/\s*\n\s*/gu, " ");
    return speaker ? `${speaker.name}: ${text}` : text;
  }).join("\n");
}

/**
 * Plain text back into rows. A line starting with a Speaker Profile's name and a
 * colon is read by that person; a line without one continues with whoever read
 * the line before. Rows keep their ids by position, so a row whose text did not
 * change still lines up with the audio already made for it.
 */
export function textToRows(text: string, speakers: SpeakerProfile[], offered: ProjectVoice[], previous: VoiceScriptRow[]): VoiceScriptRow[] {
  const byName = new Map(speakers.map((speaker) => [comparableName(speaker.name), speaker]));
  const rows: VoiceScriptRow[] = [];
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  lines.forEach((line, index) => {
    const match = /^([^:：]{1,60})[:：]\s*(.*)$/u.exec(line);
    const speaker = match ? byName.get(comparableName(match[1])) : undefined;
    const before = rows[rows.length - 1] ?? null;
    const old = previous[index];
    let speakerProfileId = before?.speakerProfileId ?? old?.speakerProfileId ?? null;
    let voiceId = before?.voiceId ?? old?.voiceId ?? null;
    if (speaker) {
      speakerProfileId = speaker.id;
      const kept = [old, ...previous].find((row) => row?.speakerProfileId === speaker.id && row.voiceId && offered.some((voice) => voice.id === row.voiceId));
      voiceId = kept?.voiceId ?? newestVoiceOf(speaker.id, offered)?.id ?? null;
    }
    rows.push({ id: old?.id ?? newRowId(), speakerProfileId, voiceId, text: speaker && match ? match[2] : line });
  });
  return rows;
}

export function normalizedRowText(value: string): string {
  return value.split(/\s+/u).filter(Boolean).join(" ");
}

export interface RowTiming {
  start: number;
  end: number;
  /** Word indexes into the output's words, end exclusive. */
  firstWord: number;
  lastWord: number;
  /** The row still reads exactly what was spoken, by the same voice. */
  fresh: boolean;
}

/** Where each row sits in a Voice Output, and whether the audio still matches it. */
export function rowTimings(rows: VoiceScriptRow[], output: VoiceOutput | null, offered: ProjectVoice[]): Map<string, RowTiming> {
  const timings = new Map<string, RowTiming>();
  if (!output?.segments?.length) return timings;
  const words = output.words ?? [];
  output.segments.forEach((segment, index) => {
    const row = rows.find((item) => item.id === segment.rowId);
    if (!row) return;
    let firstWord = -1;
    let lastWord = -1;
    words.forEach((word, wordIndex) => {
      if (word.segmentIndex !== index) return;
      if (firstWord < 0) firstWord = wordIndex;
      lastWord = wordIndex + 1;
    });
    const voice = resolveRowVoice(row, offered);
    timings.set(row.id, {
      start: segment.start,
      end: segment.end,
      firstWord: Math.max(0, firstWord),
      lastWord: Math.max(0, lastWord),
      fresh: normalizedRowText(row.text) === normalizedRowText(segment.text) && voice?.id === segment.voiceId,
    });
  });
  return timings;
}

export function rowsFromOutput(output: VoiceOutput): VoiceScriptRow[] {
  return (output.segments ?? []).map((segment) => ({
    id: segment.rowId,
    speakerProfileId: segment.speakerProfileId,
    voiceId: segment.voiceId,
    text: segment.text,
  }));
}

export interface ScriptReadiness {
  rows: Array<{ id: string; voiceId: string; text: string }>;
  problem: string | null;
}

/** The rows as the API reads them, or the first reason they cannot be read yet. */
export function scriptReadiness(rows: VoiceScriptRow[], offered: ProjectVoice[]): ScriptReadiness {
  const filled = rows.filter((row) => normalizedRowText(row.text));
  if (!filled.length) return { rows: [], problem: "Nhập lời thoại vào Script trước" };
  const ready: ScriptReadiness["rows"] = [];
  for (const row of filled) {
    const voice = resolveRowVoice(row, offered);
    if (!voice) {
      const number = rows.indexOf(row) + 1;
      return { rows: [], problem: `Đoạn ${number} chưa chọn voice` };
    }
    ready.push({ id: row.id, voiceId: voice.id, text: normalizedRowText(row.text) });
  }
  return { rows: ready, problem: null };
}

/** About how long the Script takes to say, before it has been read. */
export function estimatedSeconds(rows: VoiceScriptRow[]): number {
  const words = rows.reduce((total, row) => total + normalizedRowText(row.text).split(" ").filter(Boolean).length, 0);
  return Math.round(words / 2.65);
}
