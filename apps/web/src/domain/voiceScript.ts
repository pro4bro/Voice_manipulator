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

/** How a line break inside one row is written in Text Edit, where a new line is a new row. */
export const ROW_LINE_BREAK = " ↵ ";

/** The Script as plain text: one row per line, `Speaker: lời thoại`. */
export function rowsToText(rows: VoiceScriptRow[], speakers: SpeakerProfile[]): string {
  return rows.map((row) => {
    const speaker = speakers.find((item) => item.id === row.speakerProfileId);
    const text = row.text.split(/\r?\n/u).map((line) => line.trim()).join(ROW_LINE_BREAK);
    return speaker ? `${speaker.name}: ${text}` : text;
  }).join("\n");
}

function speakerRow(speaker: SpeakerProfile | undefined, before: VoiceScriptRow | null, offered: ProjectVoice[], previous: VoiceScriptRow[]) {
  if (!speaker) return { speakerProfileId: before?.speakerProfileId ?? null, voiceId: before?.voiceId ?? null };
  const kept = previous.find((row) => row.speakerProfileId === speaker.id && row.voiceId && offered.some((voice) => voice.id === row.voiceId));
  return { speakerProfileId: speaker.id, voiceId: kept?.voiceId ?? newestVoiceOf(speaker.id, offered)?.id ?? null };
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
    const body = speaker && match ? match[2] : line;
    rows.push({ id: old?.id ?? newRowId(), speakerProfileId, voiceId, text: body.split(ROW_LINE_BREAK.trim()).map((part) => part.trim()).join("\n") });
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

const SPEAKER_HEADERS = ["speaker", "nguoi noi", "nhan vat", "voice", "giong", "ten"];
const CONTENT_HEADERS = ["noi dung", "loi thoai", "content", "text", "script", "thoai"];

/**
 * What was copied from a spreadsheet, a table or a document, as Script rows.
 *
 * A table's rows are turns; the column holding a Speaker Profile's name says
 * who reads it, and the longest remaining text is what they say. A document's
 * paragraphs are turns, with `Tên: lời thoại` naming the speaker. A turn
 * without a known name is read by whoever read the turn before it. Returns null
 * for a plain single line, which pastes into the row as ordinary text.
 */
export function clipboardToRows(plain: string, html: string, speakers: SpeakerProfile[], offered: ProjectVoice[], context: VoiceScriptRow | null, previous: VoiceScriptRow[] = []): VoiceScriptRow[] | null {
  const byName = new Map(speakers.map((speaker) => [comparableName(speaker.name), speaker]));
  const table = plain.includes("\t") ? parseDelimited(plain) : parseHtmlTable(html);
  const rows: VoiceScriptRow[] = [];

  if (table && table.some((cells) => cells.length > 1)) {
    let records = table.map((cells) => cells.map((cell) => cell.trim())).filter((cells) => cells.some(Boolean));
    let speakerColumn = -1;
    let contentColumn = -1;
    const header = records[0]?.map(comparableName) ?? [];
    const headerSpeaker = header.findIndex((cell) => SPEAKER_HEADERS.some((name) => cell.startsWith(name)));
    const headerContent = header.findIndex((cell) => CONTENT_HEADERS.some((name) => cell.startsWith(name)));
    if (headerContent >= 0) {
      speakerColumn = headerSpeaker;
      contentColumn = headerContent;
      records = records.slice(1);
    } else {
      const width = Math.max(...records.map((cells) => cells.length));
      const hits = Array.from({ length: width }, (_, column) => records.filter((cells) => byName.has(comparableName(cells[column] ?? ""))).length);
      const best = hits.indexOf(Math.max(...hits));
      speakerColumn = hits[best] > 0 ? best : -1;
      const lengths = Array.from({ length: width }, (_, column) => column === speakerColumn ? -1 : records.reduce((total, cells) => total + (cells[column]?.length ?? 0), 0));
      contentColumn = lengths.indexOf(Math.max(...lengths));
    }
    for (const cells of records) {
      const text = (cells[contentColumn] ?? "").trim();
      if (!text) continue;
      const speaker = speakerColumn >= 0 ? byName.get(comparableName(cells[speakerColumn] ?? "")) : undefined;
      const before = rows[rows.length - 1] ?? context;
      rows.push({ id: newRowId(), ...speakerRow(speaker, before, offered, previous), text });
    }
    return rows.length ? rows : null;
  }

  const lines = plain.replace(/\r\n?/gu, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  for (const line of lines) {
    const match = /^([^:：]{1,60})[:：]\s*(.*)$/u.exec(line);
    const speaker = match ? byName.get(comparableName(match[1])) : undefined;
    const before = rows[rows.length - 1] ?? context;
    rows.push({ id: newRowId(), ...speakerRow(speaker, before, offered, previous), text: speaker && match ? match[2] : line });
  }
  return rows;
}

/**
 * Word positions after which a row's text breaks onto a new line, counted the
 * way the generated words are: whitespace-separated, a bare punctuation mark
 * belonging to the word before it.
 */
export function lineBreakWords(text: string): Set<number> {
  const breaks = new Set<number>();
  let count = 0;
  text.split("\n").forEach((line, lineIndex, lines) => {
    for (const piece of line.split(/\s+/u).filter(Boolean)) {
      if (count === 0 || /[\p{L}\p{N}]/u.test(piece)) count += 1;
    }
    if (lineIndex < lines.length - 1 && count > 0) breaks.add(count - 1);
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
