import type { ProjectMediaAsset } from "./types";

export type SubtitleAlignmentMode = "auto" | "offset" | "common-offset" | "edge-offset" | "group-offset" | "ctc" | "waveform" | "diagnose" | "pipeline";
export interface SubtitleRefinementMethod {
  mode: Exclude<SubtitleAlignmentMode, "pipeline">;
  startOffsetMs: number; endOffsetMs: number; strength: number; maxMoveMs: number;
}
export const SUBTITLE_ALIGNMENT_METHODS: { id: SubtitleAlignmentMode; label: string; description: string }[] = [
  { id: "diagnose", label: "Kiểm tra độ lệch chữ / voice", description: "Chỉ đối chiếu: đánh dấu mốc lệch từ 250 ms, lệch lớn từ 500 ms và từ nằm trong vùng âm rất nhỏ. Thiếu mốc âm học sẽ được báo chưa đủ bằng chứng." },
  { id: "common-offset", label: "Bù offset chung từ mốc âm học", description: "Ước lượng một mức dịch chung từ ít nhất ba mốc CTC, giữ nguyên độ dài từ. Cần nghe kiểm tra vì từng đoạn có thể lệch khác nhau." },
  { id: "edge-offset", label: "Bù IN / OUT riêng từ mốc âm học", description: "Ước lượng offset đầu và cuối riêng biệt; có thể thay đổi độ dài từ. Mốc không hợp lệ hoặc chồng lấn sẽ cần review." },
  { id: "group-offset", label: "Bù offset theo từng cụm", description: "Chỉ dịch các cụm có nhiều mốc đồng thuận và phủ đủ thời gian; giữ nguyên độ dài từ. Cụm chưa chắc được giữ để nghe lại." },
  { id: "ctc", label: "Căn từng từ bằng CTC", description: "Đề xuất biên từ từ mô hình căn âm học. Điểm CTC không phải bảo đảm timing đúng; cần kiểm tra các từ lệch xa, nối âm và chồng tiếng." },
  { id: "waveform", label: "Căn theo waveform vector · thử nghiệm", description: "Tìm điểm âm tăng / giảm rõ trên peak PCM khoảng 1 ms, gần mốc CTC hoặc mốc nguồn. Mọi đề xuất vector cần nghe và xác nhận; điểm gãy chưa chứng minh đó là biên từ." },
  { id: "offset", label: "Nhập offset thủ công", description: "Nhập độ dịch IN và OUT theo ms. Số dương dịch muộn hơn; số âm dịch sớm hơn. Tạo đề xuất để xem và nghe trước khi áp dụng." },
  { id: "auto", label: "Tổng hợp thận trọng", description: "Ưu tiên cụm offset ổn định, sau đó mốc CTC được đối chiếu waveform. Đây là các quy tắc ước lượng, chưa phải quy luật đã được học và kiểm chứng cho mọi bản ghi." },
];

export interface SubtitleDriftSuspect {
  index: number; text: string; start: number | null; end: number | null;
  ctcStart: number | null; ctcEnd: number | null;
  startOffsetMs: number | null; endOffsetMs: number | null;
  flags: string[]; waveformSupport: boolean;
}
export interface SubtitleDriftReport {
  status: "large-drift" | "possible-drift" | "no-large-drift-found" | "insufficient-evidence";
  scopeWords: number; comparedWords: number; unassessedCount: number; evidenceCoverage: number;
  largeCount: number; severeCount: number; quietCount: number; invalidCount: number;
  largeThresholdMs: number; severeThresholdMs: number; suspects: SubtitleDriftSuspect[];
}

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
  mode: SubtitleAlignmentMode;
  startOffsetMs: number;
  endOffsetMs: number;
  rows: SubtitleAlignmentRow[];
  summary: Record<SubtitleAlignmentRow["status"], number>;
  diagnostics: Record<string, unknown> & { drift?: SubtitleDriftReport; conflictIndexes?: number[]; changedWords?: number };
  aligner: { status: string; model?: string; license?: string; reason?: string };
}
export interface SubtitleAlignmentRequest {
  mode: SubtitleAlignmentMode;
  startOffsetMs: number;
  endOffsetMs: number;
  indexes?: number[];
}
export interface SubtitleAlignmentEdit { index: number; start: number; end: number; reviewed: true; }
export interface SubtitleAlignmentResult { asset: ProjectMediaAsset; proposal: SubtitleAlignmentProposal; }

export function subtitleAudioUrl(projectId: string, assetId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(assetId)}/audio`;
}
