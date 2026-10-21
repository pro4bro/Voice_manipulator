import type { ProjectMediaAsset } from "./types";

export interface AlignmentBounds { start: number | null; end: number | null; }
export interface SubtitleAlignmentRow {
  index: number;
  text: string;
  before: AlignmentBounds;
  after: AlignmentBounds;
  status: "ready" | "review" | "locked" | "unchanged";
  method: string;
  reasons: string[];
  score: number | null;
}
export interface SubtitleAlignmentProposal {
  id: string;
  assetId: string;
  state: "proposed" | "applying" | "applied" | "restoring" | "restored";
  stale: boolean;
  inputSignature: string;
  mode: "auto" | "offset";
  startOffsetMs: number;
  endOffsetMs: number;
  rows: SubtitleAlignmentRow[];
  summary: Record<SubtitleAlignmentRow["status"], number>;
  diagnostics: Record<string, unknown>;
  aligner: { status: string; model?: string; license?: string; reason?: string };
}
export interface SubtitleAlignmentRequest {
  mode: "auto" | "offset";
  startOffsetMs: number;
  endOffsetMs: number;
  indexes?: number[];
}
export interface SubtitleAlignmentEdit { index: number; start: number; end: number; reviewed: true; }
export interface SubtitleAlignmentResult { asset: ProjectMediaAsset; proposal: SubtitleAlignmentProposal; }

export function subtitleAudioUrl(projectId: string, assetId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(assetId)}/audio`;
}
