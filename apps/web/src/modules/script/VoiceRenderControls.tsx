import type { VoiceRenderController } from "../../app/useVoiceRender";
import { queuedDownloadUrl } from "../../api/client";

export function VoiceRenderControls({ controller, saved }: { controller: VoiceRenderController; saved: boolean }) {
  const report = controller.packet?.report;
  const level = (n: number | null | undefined) => n == null ? "im lặng" : `${n.toFixed(1)} dBFS`;
  return <details className="voice-script-settings"><summary>Âm lượng file đầu ra</summary>
    <p>Áp dụng gain của clip và từng câu vào WAV đang mở. Preview và WAV tải về dùng cùng artifact; nút này không tạo lại giọng.</p>
    <p>Gain câu kế thừa từ đoạn; gain toàn clip được cộng sau cùng. Các cấu hình khóa vẫn được giữ.</p>
    <button type="button" disabled={!saved || controller.busy} onClick={() => void controller.render()}>{controller.busy ? "Đang render…" : "Áp dụng âm lượng"}</button>
    {!saved ? <p>Chờ Script lưu xong trước khi render.</p> : null}
    {controller.error ? <p role="alert">{controller.error}</p> : null}
    {report ? <div role="status"><p>Peak: {level(report.source?.peakDbfs)} → {level(report.output?.peakDbfs)} · RMS: {level(report.source?.rmsDbfs)} → {level(report.output?.rmsDbfs)}</p>
      {report.global ? <p>Gain clip: yêu cầu {report.global.requestedGainDb.toFixed(1)} dB · thực tế {report.global.appliedGainDb.toFixed(1)} dB {report.global.headroomLimited ? "· đã giới hạn headroom" : ""}</p> : null}
      <a href={queuedDownloadUrl(controller.packet!.audioUrl)} download="voice-render.wav">Tải WAV đã render</a></div> : null}
  </details>;
}
