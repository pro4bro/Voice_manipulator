import type { TrainingParameterValue } from "./types";
export interface LipSyncRange { start: number; end: number }
export interface LipSyncScope { mode: "visible" | "placed" | "source"; allLayers?: boolean | null; layerIds: string[]; range: LipSyncRange | null }
export interface LipSyncLayer { id: string; name: string; enabled: boolean }
export interface LipSyncClip { id: string; assetId: string; layerId: string; start: number; inPoint: number; outPoint: number }
export interface LipSyncAudio { outputId: string; start: number; inPoint: number; outPoint: number }
export interface LipSyncCoveragePart {
  clipId: string; assetId: string; layerId: string; timelineStart: number | null; timelineEnd: number | null;
  sourceStart: number; sourceEnd: number; occurrences?: string[];
}
export interface LipSyncCoverage { detection: LipSyncCoveragePart[]; sync: LipSyncCoveragePart[] }
export interface LipSyncPreflight extends LipSyncCoverage {
  id: string; kind: "lipsync-preflight"; executed: false; readyForRender: false; blockers: string[];
  speechCandidates: Array<LipSyncCoveragePart & { speakerProfileId: string; rowId: string; faceId: null; voiceStart: number; voiceEnd: number }>;
}
export interface LipSyncDocument {
  version: 1; revision: number; layers: LipSyncLayer[]; clips: LipSyncClip[]; audio: LipSyncAudio | null;
  engineId: string | null; engineSettings: Record<string, Record<string, TrainingParameterValue>>;
  detectionScope: LipSyncScope; syncScope: LipSyncScope;
}
export interface LipSyncFaceReview { analysisId: string; revision: number; observations: Array<{ id: string; faceId: string; reviewed: boolean }>; bindings: Array<{ faceId: string; speakerProfileId: string | null }> }
export interface LipSyncHistoryDocument extends LipSyncDocument { faceReviews?: Record<string, LipSyncFaceReview> }
export interface LipSyncVersionState { document: LipSyncDocument; faceReviews?: Record<string, LipSyncFaceReview>; past: LipSyncHistoryDocument[]; future: LipSyncHistoryDocument[] }
export interface LipSyncVersion { id: string; name: string; createdAt: string; parentVersionId: string | null }
export interface LipSyncSession { id: string; name: string; versions: LipSyncVersion[] }
export interface LipSyncSessions { version: 1; revision: number; sessions: LipSyncSession[]; activeSessionId: string | null; activeVersionId: string | null }
export interface LipSyncSendRequest { id: string; projectId: string; kind: "media" | "voice"; ids: string[] }
export function lipSyncUrl(projectId: string, suffix = "", versionId?: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/lipsync${suffix}${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`;
}
export function emptyLipSync(): LipSyncDocument {
  return { version: 1, revision: 0, layers: [], clips: [], audio: null, engineId: null, engineSettings: {},
    detectionScope: { mode: "visible", layerIds: [], range: null }, syncScope: { mode: "visible", layerIds: [], range: null } };
}

export function clipEnd(clip: LipSyncClip): number { return clip.start + clip.outPoint - clip.inPoint; }
export function visibleClipAt(document: LipSyncDocument, time: number): LipSyncClip | null {
  for (const layer of document.layers) {
    if (!layer.enabled) continue;
    const clips = document.clips.filter((clip) => clip.layerId === layer.id && clip.start <= time && clipEnd(clip) > time);
    if (clips.length) return clips[clips.length - 1];
  }
  return null;
}
export function compositionLength(document: LipSyncDocument): number {
  return Math.max(1, ...document.clips.map(clipEnd), document.audio ? document.audio.start + document.audio.outPoint - document.audio.inPoint : 0);
}
export function duplicateClip(document: LipSyncDocument, id: string, newId: string): LipSyncDocument {
  const clip = document.clips.find((item) => item.id === id);
  return clip ? { ...document, clips: [...document.clips, { ...clip, id: newId, start: clipEnd(clip) }] } : document;
}
export function splitClip(document: LipSyncDocument, id: string, time: number, newId: string): LipSyncDocument {
  const clip = document.clips.find((item) => item.id === id);
  if (!clip || time - clip.start < .1 || clipEnd(clip) - time < .1) return document;
  const cut = clip.inPoint + time - clip.start;
  return { ...document, clips: document.clips.flatMap((item) => item.id !== id ? [item] : [
    { ...item, outPoint: cut }, { ...item, id: newId, start: time, inPoint: cut },
  ]) };
}
