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
  const turnGroupingVersion = previous ? previous.turnGroupingVersion : 1;
  return { version: 1, ...(turnGroupingVersion === undefined ? {} : { turnGroupingVersion }), revision: previous?.revision ?? 0, settings: previous?.settings ?? {},
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

const MAX_GROUPED_ROW_LENGTH = 5000;

function textLength(text: string) {
  return Array.from(text).length;
}

function comparableSettings(settings: ScriptSettings) {
  return JSON.stringify(Object.fromEntries(Object.entries(settings)
    .map(([key, value]) => [key, key === "locked" && Array.isArray(value) ? [...value].sort() : value])
    .sort(([left], [right]) => String(left).localeCompare(String(right)))));
}

function legacyRowsCanGroup(document: VoiceScriptDocument, head: VoiceScriptRow, candidate: VoiceScriptRow) {
  const sameIdentity = candidate.voiceId === head.voiceId && (
    head.speakerProfileId !== null
      ? candidate.speakerProfileId === head.speakerProfileId
      : candidate.speakerProfileId === null && head.voiceId !== null
  );
  if (!sameIdentity) return false;
  const headSettings = effectiveScriptSettings(document, head);
  const candidateSettings = effectiveScriptSettings(document, candidate);
  if (headSettings.duration != null || candidateSettings.duration != null) return false;
  return comparableSettings(headSettings) === comparableSettings(candidateSettings);
}

/**
 * One-time compatibility migration for pre-grouping Script caches. It only
 * joins adjacent rows with explicit matching speaker/voice identity and equal
 * effective settings, retaining the original row IDs as aliases for audio.
 */
export function groupLegacyScript(document: VoiceScriptDocument): VoiceScriptDocument {
  if (document.turnGroupingVersion === 1) return document;

  const rows: VoiceScriptRow[] = [];
  for (let index = 0; index < document.rows.length;) {
    const head = document.rows[index];
    const members = [head];
    let joinedLength = textLength(head.text);
    const canGroup = Boolean(head.speakerProfileId || head.voiceId) && effectiveScriptSettings(document, head).duration == null;
    let nextIndex = index + 1;
    while (canGroup && nextIndex < document.rows.length) {
      const candidate = document.rows[nextIndex];
      const candidateLength = joinedLength + 1 + textLength(candidate.text);
      if (candidateLength > MAX_GROUPED_ROW_LENGTH || !legacyRowsCanGroup(document, head, candidate)) break;
      members.push(candidate);
      joinedLength = candidateLength;
      nextIndex += 1;
    }

    if (members.length === 1) rows.push(head);
    else rows.push({
      ...head,
      text: members.map((row) => row.text).join("\n"),
      originIds: [...new Set(members.flatMap((row) => row.originIds ?? [row.id]))],
      tags: [...new Set(members.flatMap((row) => row.tags ?? []))],
      legacyRowIds: [...new Set(members.flatMap((row) => [row.id, ...(row.legacyRowIds ?? [])]))],
    });
    index = nextIndex;
  }

  const usedSegments = new Set(rows.map((row) => row.segmentId));
  return {
    ...document,
    turnGroupingVersion: 1,
    segments: document.segments.filter((segment) => usedSegments.has(segment.id)),
    rows,
  };
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
