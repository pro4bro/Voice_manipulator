import type { ProjectVoice, SpeakerProfile, VoiceOutput, VoiceScriptRow } from "./types";

/** Which voices Voice Manipulator offers for the selected generation category. */
export type VoiceCategory = "clone" | "train";

export const VOICE_KIND_LABELS: Record<ProjectVoice["kind"], string> = {
  clone: "Nhái giọng",
  lora: "LoRA đã train",
  full: "Full fine-tune",
  vc: "RVC đổi giọng",
};

export function voiceCategory(voice: Pick<ProjectVoice, "kind">): VoiceCategory {
  return voice.kind === "clone" ? "clone" : "train";
}

export function voicesInCategory(voices: ProjectVoice[], category: VoiceCategory): ProjectVoice[] {
  // An RVC model changes a performer's voice; it cannot read text, so the Script never offers it.
  return voices.filter((voice) => voice.kind !== "vc" && voiceCategory(voice) === category);
}

export function newRowId(): string {
  return `row-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function emptyRow(after?: VoiceScriptRow | null, text = ""): VoiceScriptRow {
  return { id: newRowId(), speakerProfileId: after?.speakerProfileId ?? null, voiceId: after?.voiceId ?? null, text,
    ...(after?.segmentId ? { segmentId: after.segmentId, settings: after.settings, tags: after.tags, originIds: after.originIds ?? [after.id] } : {}) };
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

/** The Script as plain text: each existing row starts with an explicit speaker label. */
export function rowsToText(rows: VoiceScriptRow[], speakers: SpeakerProfile[]): string {
  return rows.map((row) => {
    const speaker = speakers.find((item) => item.id === row.speakerProfileId);
    return `${speaker?.name ?? "Chưa gán"}: ${row.text}`;
  }).join("\n");
}

/**
 * Applies an edit to the text projection of existing rows. Only old boundaries
 * that remain outside the edited span survive; typed speaker-like labels never
 * create turns. New turns come from explicit Add Row or diarization.
 */
export function textToRows(text: string, speakers: SpeakerProfile[], _offered: ProjectVoice[], previous: VoiceScriptRow[], previousText = rowsToText(previous, speakers)): VoiceScriptRow[] {
  if (!text && !previous.length) return [];
  if (!previous.length || !previousText) {
    const content = text.replace(/\r\n?/gu, "\n");
    return content ? [{ ...emptyRow(), text: content }] : [];
  }

  // Text mode is an editable projection of the current rows. Only row headers
  // that survive unchanged outside the user's contiguous edit can remain
  // boundaries. Speaker-like lines inserted in the edit are literal dialogue.
  const oldText = previousText.replace(/\r\n?/gu, "\n");
  const nextText = text.replace(/\r\n?/gu, "\n");
  let prefix = 0;
  while (prefix < oldText.length && prefix < nextText.length && oldText[prefix] === nextText[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldText.length - prefix && suffix < nextText.length - prefix && oldText[oldText.length - suffix - 1] === nextText[nextText.length - suffix - 1]) suffix += 1;

  const positions: Array<{ row: VoiceScriptRow; oldStart: number; header: string }> = [];
  let cursor = 0;
  previous.forEach((row, index) => {
    const speaker = speakers.find((item) => item.id === row.speakerProfileId);
    const projectedHeader = `${speaker?.name ?? "Chưa gán"}: `;
    const normalizedBody = row.text.replace(/\r\n?/gu, "\n");
    const header = oldText.startsWith(`${projectedHeader}${normalizedBody}`, cursor) ? projectedHeader : "";
    positions.push({ row, oldStart: cursor, header });
    cursor += header.length + normalizedBody.length + (index < previous.length - 1 ? 1 : 0);
  });

  const retained = positions.flatMap(({ row, oldStart, header }, index) => {
    const untouchedPrefix = oldStart < prefix;
    const untouchedSuffix = oldStart >= oldText.length - suffix;
    if (index > 0 && !untouchedPrefix && !untouchedSuffix) return [];
    const newStart = index === 0 ? 0 : untouchedPrefix ? oldStart : nextText.length - (oldText.length - oldStart);
    if (newStart < 0 || newStart > nextText.length) return [];
    const headerIsIntact = Boolean(header) && nextText.startsWith(header, newStart);
    return [{ row, start: newStart, header: headerIsIntact ? header : "" }];
  });

  if (!retained.length) {
    const content = nextText;
    return content ? [{ ...emptyRow(previous[0]), text: content }] : [];
  }
  const rows = retained.map(({ row, start, header }, index) => {
    const hasFollowingRow = index < retained.length - 1;
    const end = retained[index + 1]?.start ?? nextText.length;
    const segment = nextText.slice(start, end);
    const content = hasFollowingRow ? segment.replace(/\n$/u, "") : segment;
    return { ...row, text: header && content.startsWith(header) ? content.slice(header.length) : content };
  });
  return rows;
}

/**
 * Cells of tab-separated text as Excel and Google Sheets put it on the
 * clipboard: a cell holding a tab, a quote or a line break (Alt+Enter) is
 * quoted, with quotes doubled inside.
 */
export function parseDelimited(text: string, delimiter = "\t"): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;
  const source = text.replace(/\r\n?/gu, "\n");
  while (index < source.length) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 2; continue; }
      if (char === '"') { quoted = false; index += 1; continue; }
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"' && cell === "") { quoted = true; index += 1; continue; }
    if (char === delimiter) { record.push(cell); cell = ""; index += 1; continue; }
    if (char === "\n") { record.push(cell); records.push(record); record = []; cell = ""; index += 1; continue; }
    cell += char;
    index += 1;
  }
  if (cell !== "" || record.length) { record.push(cell); records.push(record); }
  return records;
}

/** Rows of an HTML table, as Word and the sheets also offer on the clipboard. */
export function parseHtmlTable(html: string): string[][] | null {
  if (!/<table[\s>]/iu.test(html) || typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table");
  if (!table) return null;
  return [...table.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("td,th")].map((cell) => {
    // Line breaks inside a cell stay line breaks inside the row.
    cell.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const paragraphs = [...cell.querySelectorAll("p")];
    const text = paragraphs.length > 1 ? paragraphs.map((p) => p.textContent ?? "").join("\n") : cell.textContent ?? "";
    return text.replace(/\u00a0/gu, " ").split("\n").map((line) => line.replace(/\s+/gu, " ").trim()).join("\n").trim();
  }));
}

/**
 * Word positions after which a row's text breaks onto a new line, counted the
 * way the generated words are: whitespace-separated, a bare punctuation mark
 * belonging to the word before it.
 */
export function lineBreakWords(text: string): Map<number, number> {
  const breaks = new Map<number, number>();
  let count = 0;
  text.split("\n").forEach((line, lineIndex, lines) => {
    for (const piece of line.split(/\s+/u).filter(Boolean)) {
      if (count === 0 || /[\p{L}\p{N}]/u.test(piece)) count += 1;
    }
    if (lineIndex < lines.length - 1) breaks.set(count - 1, (breaks.get(count - 1) ?? 0) + 1);
  });
  return breaks;
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
  rows.forEach((row) => {
    const ids = new Set([row.id, ...(row.legacyRowIds ?? [])]);
    const segments = output.segments!.flatMap((segment, index) => ids.has(segment.rowId) ? [{ segment, index }] : []);
    if (!segments.length || segments.some((entry, index) => index > 0 && entry.index !== segments[index - 1].index + 1)) return;
    const indices = new Set(segments.map((entry) => entry.index));
    let firstWord = -1;
    let lastWord = -1;
    words.forEach((word, wordIndex) => {
      if (word.segmentIndex == null || !indices.has(word.segmentIndex)) return;
      if (firstWord < 0) firstWord = wordIndex;
      lastWord = wordIndex + 1;
    });
    const voice = resolveRowVoice(row, offered);
    timings.set(row.id, {
      start: Math.min(...segments.map(({ segment }) => segment.start)),
      end: Math.max(...segments.map(({ segment }) => segment.end)),
      firstWord: Math.max(0, firstWord),
      lastWord: Math.max(0, lastWord),
      fresh: normalizedRowText(row.text) === normalizedRowText(segments.map(({ segment }) => segment.text).join("\n")) &&
        segments.every(({ segment }) => voice?.id === segment.voiceId) &&
        words.slice(Math.max(0, firstWord), Math.max(0, lastWord)).every((word) => word.segmentIndex != null && indices.has(word.segmentIndex)),
    });
  });
  return timings;
}

export function rowsFromOutput(output: VoiceOutput): VoiceScriptRow[] {
  return (output.segments ?? []).map((segment) => ({
    ...segment.scriptRow,
    id: segment.rowId,
    speakerProfileId: segment.speakerProfileId,
    voiceId: segment.voiceId,
    text: segment.scriptRow?.text ?? segment.text,
  }));
}

export interface ScriptReadiness {
  rows: Array<{ id: string; voiceId: string; text: string; segmentId?: string; originIds?: string[]; tags?: string[]; sourceText?: string }>;
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
    ready.push({ id: row.id, voiceId: voice.id, text: normalizedRowText(row.text),
      ...(row.segmentId ? { segmentId: row.segmentId, originIds: row.originIds, tags: row.tags, sourceText: row.text } : {}) });
  }
  return { rows: ready, problem: null };
}

/** About how long the Script takes to say, before it has been read. */
export function estimatedSeconds(rows: VoiceScriptRow[]): number {
  const words = rows.reduce((total, row) => total + normalizedRowText(row.text).split(" ").filter(Boolean).length, 0);
  return Math.round(words / 2.65);
}
