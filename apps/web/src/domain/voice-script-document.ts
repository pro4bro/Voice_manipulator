import type { ScriptSettings, VoiceScriptDocument, VoiceScriptRow } from "./types";
import { newRowId } from "./voiceScript";

export function migrateScript(rows: VoiceScriptRow[], previous?: VoiceScriptDocument): VoiceScriptDocument {
  const segments = new Map(previous?.segments.map((segment) => [segment.id, segment]) ?? []);
  const migrated = rows.map((row) => {
    const segmentId = row.segmentId ?? `segment-${row.id}`;
    if (!segments.has(segmentId)) segments.set(segmentId, { id: segmentId, name: `Đoạn ${segments.size + 1}`, settings: {} });
    return { ...row, segmentId, settings: row.settings ?? {}, originIds: row.originIds ?? [row.id], tags: row.tags ?? [] };
  });
  const used = new Set(migrated.map((row) => row.segmentId));
  return { version: 1, revision: previous?.revision ?? 0, settings: previous?.settings ?? {},
    segments: [...segments.values()].filter((segment) => used.has(segment.id)), rows: migrated };
}

export function effectiveScriptSettings(document: VoiceScriptDocument, row: VoiceScriptRow): ScriptSettings {
  const result: ScriptSettings = {};
  const locked = new Set<keyof ScriptSettings>();
  for (const settings of [document.settings, document.segments.find((segment) => segment.id === row.segmentId)?.settings, row.settings]) {
    if (!settings) continue;
    for (const key of Object.keys(settings) as Array<keyof ScriptSettings>) {
      if (key !== "locked" && settings[key] != null && !locked.has(key)) Object.assign(result, { [key]: settings[key] });
    }
    for (const key of settings.locked ?? []) locked.add(key);
  }
  result.locked = [...locked].filter((key): key is Exclude<keyof ScriptSettings, "locked"> => key !== "locked");
  return result;
}

export function splitScriptSentence(row: VoiceScriptRow, locale = "vi"): VoiceScriptRow[] {
  const sentences = [...new Intl.Segmenter(locale, { granularity: "sentence" }).segment(row.text)].map((part) => part.segment);
  if (sentences.length < 2) return [row];
  return sentences.map((text, index) => ({ ...row, id: index === 0 ? row.id : newRowId(), text,
    originIds: [...new Set([...(row.originIds ?? []), row.id])] }));
}

export function joinScriptSentences(left: VoiceScriptRow, right: VoiceScriptRow): VoiceScriptRow {
  if (left.segmentId !== right.segmentId || left.voiceId !== right.voiceId || left.speakerProfileId !== right.speakerProfileId ||
      JSON.stringify(left.settings ?? {}) !== JSON.stringify(right.settings ?? {})) {
    throw new Error("Hai câu cần cùng đoạn, voice và cấu hình trước khi ghép.");
  }
  return { ...left, text: `${left.text}${/\s$|[。！？]$/u.test(left.text) || /^\s/u.test(right.text) ? "" : " "}${right.text}`,
    originIds: [...new Set([...(left.originIds ?? [left.id]), ...(right.originIds ?? [right.id])])],
    tags: [...new Set([...(left.tags ?? []), ...(right.tags ?? [])])] };
}
