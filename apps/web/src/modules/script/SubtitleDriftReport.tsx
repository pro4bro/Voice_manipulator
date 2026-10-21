import type { SubtitleDriftReport as Report } from "../../domain/subtitle-alignment";

export function SubtitleDriftReport({ report, onInspect }: { report: Report; onInspect: (index: number) => void }) {
  const title = ({ "large-drift": "Có dấu hiệu chữ lệch xa voice", "possible-drift": "Có vùng timing cần kiểm tra",
    "no-large-drift-found": "Chưa thấy lệch lớn trong các mốc đã đối chiếu", "insufficient-evidence": "Chưa đủ bằng chứng để kết luận độ lệch" })[report.status];
  return <section className="subtitle-drift-report" aria-label="Kết quả kiểm tra độ lệch">
    <strong>{title}</strong>
    <small>Đối chiếu trên timing đầu vào, chưa tính thay đổi của đề xuất.</small>
    <p>Đối chiếu được {report.comparedWords}/{report.scopeWords} từ · {report.unassessedCount} từ chưa đủ mốc.</p>
    <p>{report.largeCount} từ lệch từ {report.largeThresholdMs} ms · {report.severeCount} từ lệch từ {report.severeThresholdMs} ms · {report.quietCount} từ ở vùng âm rất nhỏ.</p>
    <small>Đây là dấu hiệu để nghe kiểm tra. CTC có thể căn sai khi nhận diện nhầm hoặc có chồng tiếng.</small>
    {report.suspects.length ? <details><summary>Xem {report.suspects.length} từ cần kiểm tra</summary><div className="subtitle-drift-suspects">
      {report.suspects.map((row) => <button type="button" key={row.index} onClick={() => onInspect(row.index)}>
        #{row.index + 1} {row.text} · {row.flags.includes("severe-displacement") ? "Lệch lớn" : row.flags.includes("large-displacement") ? "Nghi lệch" : row.flags.includes("invalid-source") ? "Mốc không hợp lệ" : "Âm rất nhỏ"}
        {row.startOffsetMs !== null ? ` · IN ${Math.round(row.startOffsetMs)} / OUT ${Math.round(row.endOffsetMs!)} ms` : ""}
        {row.waveformSupport ? " · có mốc sóng hỗ trợ" : ""}
      </button>)}
    </div></details> : null}
  </section>;
}
